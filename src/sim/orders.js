// The orders. refusal() says whether a ship may take an order now; apply() does it.
// Both the player and the enemy go through here: symmetric rules.
import { N } from '../numbers.js';
import { alive, canAimRail, canFireTubes } from './ship.js';

export const ORDERS = ['move', 'hold', 'guard', 'rake', 'torps', 'rail', 'burn', 'run', 'target'];
// 'move' takes an argument {face: 'bow'|'side'|'tail', speed: km/s >= 0, dir: 1|-1}.
// 'target' takes {room: an enemy room id, or null to clear}: torpedoes go for that room, PDCs chew it when broadside.

// Returns null if allowed, else a short reason key (see text.js).
export function refusal(ship, order, ctx, arg) {
  const drive = alive(ship, 'drive');
  switch (order) {
    case 'move':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      if (!arg || !['bow', 'side', 'tail'].includes(arg.face) || !(arg.speed >= 0)) return 'badMove';
      return null;
    case 'hold':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      if (ship.move.speed === 0) return 'alreadyHolding';
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
      if (ctx.range > N.RAIL_RANGE) return 'tooFar';
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
      if (!ctx.enemy || !(room in ctx.enemy.pieces)) return 'badTarget';
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
      // circling and holding lock the current range; bow and tail change it
      ship.move = { speed: Math.min(N.MAX_SPEED, arg.speed), dir: arg.dir < 0 ? -1 : 1, holdRange: arg.face === 'side' ? battle.range() : null };
      setFace(ship, arg.face, battle);
      break;
    case 'hold':
      ship.move = { speed: 0, dir: ship.move.dir, holdRange: battle.range() }; break;
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
      ship.move = { speed: N.MAX_SPEED, dir: ship.move.dir, holdRange: null };
      setFace(ship, 'tail', battle);
      break;
    case 'target':
      ship.target = arg && arg.room ? arg.room : null; break;
  }
}

function setFace(ship, face, battle) {
  if (ship.faceTarget === face) return;
  ship.faceTarget = face;
  ship.turnLeft = N.FACE_TURN_TIME;
  ship.railAim = -1; // swinging the hull throws off the aim
  battle.emit({ type: 'turn', x: ship.x, y: ship.y, by: ship.id, to: face });
}
