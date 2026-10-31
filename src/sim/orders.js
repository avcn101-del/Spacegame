// The six orders. validate() says whether a ship may take an order now.
// Both the player and the enemy go through here: symmetric rules.
import { N } from '../numbers.js';
import { alive } from './ship.js';

export const ORDERS = ['close', 'hold', 'open', 'guard', 'rake', 'torps', 'rail', 'burn', 'run'];

// Returns null if allowed, else a short reason key (see text.js).
export function refusal(ship, order, ctx) {
  const drive = alive(ship, 'drive');
  switch (order) {
    case 'close': case 'hold': case 'open':
      if (!drive) return 'noDrive';
      if (ship.orders.run) return 'running';
      return null;
    case 'guard': case 'rake':
      if (ship.pieces.pdcL.alive || ship.pieces.pdcR.alive) return null;
      return 'noPdc';
    case 'torps':
      if (!alive(ship, 'tubes')) return 'noTubes';
      if (ship.torps <= 0) return 'noTorps';
      if (ship.torpReload > 0) return 'reloading';
      if (ctx.range > N.TORP_RANGE) return 'tooFar';
      return null;
    case 'rail':
      if (!alive(ship, 'rail')) return 'noRail';
      if (ship.railCharge > 0) return 'charging';
      if (ship.railAim >= 0) return 'aiming';
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
    case 'guard': case 'rake':
      ship.orders.pdc = order; break;
    case 'torps':
      battle.launchTorps(ship); break;
    case 'rail':
      ship.railAim = 0; ship.railAimStart = battle.t; break;
    case 'burn':
      battle.burn(ship); break;
    case 'run':
      ship.orders.run = true; break;
  }
}
