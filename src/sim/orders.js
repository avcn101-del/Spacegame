// The orders. refusal() says whether a ship may take an order now; apply() does it.
// Both the player and the enemy go through here: symmetric rules.
import { N } from '../numbers.js';
import { alive, canAimRail, canFireTubes } from './ship.js';

export const ORDERS = ['close', 'hold', 'open', 'bow', 'side', 'tail', 'guard', 'rake', 'torps', 'rail', 'burn', 'run'];

// Returns null if allowed, else a short reason key (see text.js).
export function refusal(ship, order, ctx) {
  const drive = alive(ship, 'drive');
  switch (order) {
    case 'close': case 'hold': case 'open':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      if (ship.orders.range === order) return 'alreadyRange';
      return null;
    case 'bow': case 'side': case 'tail':
      if (!drive) return 'noDrive';
      if (ship.faceTarget === order) return 'alreadyFacing';
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
  }
  return 'unknown';
}

// Apply an order to a ship. Assumes refusal() returned null.
export function apply(ship, order, battle) {
  switch (order) {
    case 'close': case 'hold': case 'open':
      ship.orders.range = order; break;
    case 'bow': case 'side': case 'tail':
      ship.faceTarget = order;
      ship.turnLeft = N.FACE_TURN_TIME;
      ship.railAim = -1; // swinging the hull throws off the aim
      battle.emit({ type: 'turn', x: ship.x, y: ship.y, by: ship.id, to: order });
      break;
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
      if (ship.faceTarget !== 'tail') { ship.faceTarget = 'tail'; ship.turnLeft = N.FACE_TURN_TIME; ship.railAim = -1; }
      break;
  }
}
