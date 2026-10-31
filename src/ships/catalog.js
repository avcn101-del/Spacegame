// The hangar's catalog: for each slot kind that has variants, exactly two, pick one. A variant
// is data the ship carries (ship.js applies it); the sim reads it from the ship, never from here.
// Every variant number is the stock one from numbers.js doubled or halved, with one reason.
import { N } from '../numbers.js';

export const CATALOG = {
  launcher: {
    quad: { salvo: N.TORP_SALVO, reload: N.TORP_RELOAD, torps: N.TORP_COUNT },               // the stock tubes: four at once swamp a Guard
    twin: { salvo: N.TORP_SALVO / 2, reload: N.TORP_RELOAD / 2, torps: N.TORP_COUNT },       // two every ten seconds: a Guard kills a bigger share, but a wasted salvo costs two, not four
  },
  gun: {
    longRail: { range: N.RAIL_RANGE, recharge: N.RAIL_RECHARGE },           // the stock rail: shoots from outside torpedo range
    quickRail: { range: N.TORP_RANGE, recharge: N.RAIL_RECHARGE / 2 },      // two shots in the time of one, but only inside their torpedo range
  },
  drive: {
    corvette: { accel: 1, burns: N.BURNS },    // the stock drive
    hot: { accel: 2, burns: 2 },               // twice the push, so the range is yours; one Burn fewer to dodge with
  },
  rounds: { // the PDC rounds (no room of their own: makeShip reads fit.rounds directly)
    he: { rakeDps: N.PDC_RAKE_DPS, pierce: false },     // the stock rounds: chew whatever the stream meets first, frame included
    ap: { rakeDps: N.PDC_RAKE_DPS / 2, pierce: true },  // punch through frame to the job room behind it, but a thin hole does half the harm
  },
};
export const SLOTS = Object.keys(CATALOG);
export const DEFAULT_FIT = { launcher: 'quad', gun: 'longRail', drive: 'corvette', rounds: 'he' }; // no pdc slot: every mount is a PDC, always

// A fit from a string like "gun:quickRail,drive:hot" (unknown or missing slots stay stock, so an old
// "pdc:tripleDeck" is dropped) and back.
export function parseFit(text) {
  const fit = { ...DEFAULT_FIT };
  for (const part of String(text || '').split(',')) {
    const [slot, key] = part.split(':');
    if (CATALOG[slot] && CATALOG[slot][key]) fit[slot] = key;
  }
  return fit;
}
export const fitString = (fit) => SLOTS.filter((s) => fit[s] !== DEFAULT_FIT[s]).map((s) => `${s}:${fit[s]}`).join(',');
