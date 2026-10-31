// The orders. refusal() says whether a ship may take an order now; apply() does it.
// Both the player and the enemy go through here: symmetric rules.
import { N } from '../numbers.js';
import { alive, canAimRail, canFireTubes, angleDiff } from './ship.js';

export const ORDERS = ['move', 'hold', 'guard', 'rake', 'torps', 'rail', 'burn', 'run', 'target'];
// 'move' takes an argument {heading: radians on the map, speed: km/s >= 0}: the hull swings to
// the heading and the ship flies along it at that speed, and keeps it.
// 'target' takes {room: an enemy room id, or null to clear}: torpedoes go for that room, PDCs chew it when broadside.

// Returns null if allowed, else a short reason key (see text.js).
export function refusal(ship, order, ctx, arg) {
  const drive = alive(ship, 'drive');
  switch (order) {
    case 'move':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      if (!arg || !Number.isFinite(arg.heading) || !(arg.speed >= 0)) return 'badMove';
      return null;
    case 'hold':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      if (ship.move.coast) return 'alreadyHolding';
      return null;
    case 'guard': case 'rake':
      if (!alive(ship, 'pdc')) return 'noPdc';
      if (ship.orders.pdc === order) return 'alreadyPdc';
      return null;
    case 'torps':
      if (!alive(ship, 'tubes')) return 'noTubes';
      if (ship.torps <= 0) return 'noTorps';
      if (ship.torpReload > 0) return 'reloading';
      if (!canFireTubes(ship)) return 'tailNoTubes';
      if (ctx.range > N.TORP_RANGE) return 'tooFar';
      return null;
    case 'rail':
      if (!alive(ship, 'rail')) return 'noRail';
      if (!alive(ship, 'sensors')) return 'noSensors';
      if (ship.railCharge > 0) return 'charging';
      if (ship.railAim >= 0) return 'aiming';
      if (!canAimRail(ship)) return 'railNeedsBow';
      if (ctx.range > ship.railRange) return 'tooFar';
      return null;
    case 'burn':
      if (!drive) return 'noDrive';
      if (ship.burns <= 0) return 'noBurns';
      if (ship.railAim >= 0) return 'aimingNoBurn';
      return null;
    case 'run':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      return null;
    case 'target': {
      const room = arg && arg.room;
      if (room === null || room === undefined) return ship.target === null ? 'noTarget' : null;
      if (!ctx.enemy || !ctx.enemy.roomOrder.includes(room)) return 'badTarget'; // job rooms only: frame is not targetable
      if (!alive(ctx.enemy, room)) return 'roomDead';
      if (ship.target === room) return 'sameTarget';
      return null;
    }
  }
  return 'unknown';
}

// Apply an order to a ship. Assumes refusal() returned null.
export function apply(ship, order, battle, arg) {
  switch (order) {
    case 'move':
      ship.move = { speed: Math.min(N.MAX_SPEED, arg.speed), coast: false };
      setHeading(ship, arg.heading, battle);
      break;
    case 'hold':
      ship.move = { speed: ship.move.speed, coast: true }; break; // thrust off, velocity kept
    case 'guard': case 'rake':
      ship.orders.pdc = order; break;
    case 'torps':
      battle.launchTorps(ship); break;
    case 'rail':
      ship.railAim = 0; ship.railAimStart = battle.t; break;
    case 'burn':
      battle.burn(ship); break;
    case 'run':
      ship.orders.run = true;
      ship.move = { speed: N.MAX_SPEED, coast: false };
      { const e = battle.enemyOf(ship); setHeading(ship, Math.atan2(ship.y - e.y, ship.x - e.x), battle); } // straight away from them
      break;
    case 'target':
      ship.target = arg && arg.room ? arg.room : null; break;
  }
}

// Swing the hull to a heading: the time is proportional to the angle (90 degrees = FACE_TURN_TIME).
function setHeading(ship, heading, battle) {
  const d = angleDiff(heading, ship.heading);
  ship.headingTarget = ship.heading + d;
  if (Math.abs(d) < 1e-3) { ship.heading = ship.headingTarget; ship.turnLeft = 0; return; }
  ship.turnLeft = (Math.abs(d) / (Math.PI / 2)) * N.FACE_TURN_TIME;
  ship.railAim = -1; // swinging the hull throws off the aim
  battle.emit({ type: 'turn', x: ship.x, y: ship.y, by: ship.id, to: heading });
}
