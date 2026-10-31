// A ship: six pieces, a position, a velocity, the current orders.
// Pure data and functions. No DOM.
import { N } from '../numbers.js';

export const PIECES = ['rail', 'pdcL', 'pdcR', 'bridge', 'tubes', 'drive'];

export function makeShip(id, name, x, facing) {
  const pieces = {};
  for (const p of PIECES) pieces[p] = { hp: N.PIECE_HP * (p === 'bridge' ? N.BRIDGE_HP_MULT : 1), alive: true };
  return {
    id, name,
    x, y: 0,            // km; the fight line is the x axis
    vx: 0, vy: 0,       // km/s
    facing,             // +1 faces right, -1 faces left (toward the enemy at start)
    pieces,
    orders: { range: 'close', pdc: 'guard', run: false },
    torps: N.TORP_COUNT,
    torpReload: 0,      // seconds until tubes are loaded
    railCharge: N.RAIL_START_CHARGE, // seconds until the railgun is ready
    railAim: -1,        // -1 idle, else seconds spent aiming
    burns: N.BURNS,
    lastBurnT: -1,      // game time of the last Burn; a Burn during the enemy's aim means a miss
    railAimStart: -1,   // game time the current aim began
    thrust: 0,          // -1..1 along x, what the drive is doing right now (for the renderer)
    rakeTarget: null,   // piece name the PDCs are chewing on
    tracerAcc: 0,       // accumulates tracer spawns
  };
}

export const alive = (ship, piece) => ship.pieces[piece].alive;
export const alivePieces = (ship) => PIECES.filter((p) => ship.pieces[p].alive);
export const pdcCount = (ship) => (alive(ship, 'pdcL') ? 1 : 0) + (alive(ship, 'pdcR') ? 1 : 0);
export const hasWeapons = (ship) => alive(ship, 'rail') || pdcCount(ship) > 0 || (alive(ship, 'tubes') && ship.torps > 0);
export const isBeaten = (ship) => !alive(ship, 'bridge') || !hasWeapons(ship);

// Pick which piece a hit lands on. Bridge is armored (lower weight).
export function pickPiece(ship, rng) {
  const items = alivePieces(ship).map((p) => ({ name: p, weight: p === 'bridge' ? N.BRIDGE_WEIGHT : 1 }));
  if (items.length === 0) return null;
  return rng.weighted(items).name;
}

// Apply damage to a piece. Returns {piece, died}.
export function damage(ship, piece, amount) {
  const pc = ship.pieces[piece];
  if (!pc.alive) return { piece, died: false };
  pc.hp -= amount;
  if (pc.hp <= 0) {
    pc.hp = 0;
    pc.alive = false;
    if (piece === 'rail') ship.railAim = -1;
    return { piece, died: true };
  }
  return { piece, died: false };
}
