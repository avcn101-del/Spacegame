// A ship: an ordered chain of rooms from bow to stern, a position, a velocity,
// a facing, the current orders. Pure data and functions. No DOM.
import { N } from '../numbers.js';

export const FACES = ['bow', 'side', 'tail'];

export function makeShip(id, name, x, facing, design) {
  const pieces = {};
  for (const r of design.rooms) pieces[r.id] = { hp: r.hp, maxHp: r.hp, alive: true };
  return {
    id, name, design: design.id,
    roomOrder: design.rooms.map((r) => r.id), // bow first
    x, y: 0,            // km; the fight line is the x axis
    vx: 0, vy: 0,       // km/s
    facing,             // +1 the enemy starts to the right, -1 to the left
    pieces,             // room id -> {hp, maxHp, alive}
    face: 'bow',        // which end points at the enemy: 'bow' | 'side' | 'tail'
    faceTarget: 'bow',
    turnLeft: 0,        // seconds of swing left; while > 0 the ship is exposed like broadside
    // The move order: asked relative speed along the hull axis, km/s. Bow: closing; tail: opening;
    // side: circling, dir +1 or -1. speed 0 is Hold.
    move: { speed: 0, dir: 1, holdRange: null }, // holdRange: km to keep while circling or holding
    orders: { pdc: 'guard', run: false },
    torps: N.TORP_COUNT,
    torpReload: 0,      // seconds until tubes are loaded
    railCharge: N.RAIL_START_CHARGE, // seconds until the railgun is ready
    railAim: -1,        // -1 idle, else seconds spent aiming
    burns: N.BURNS,
    lastBurnT: -1,      // game time of the last Burn; a Burn during the enemy's aim means a miss
    railAimStart: -1,   // game time the current aim began
    thrust: 0,          // -1..1 along x, what the drive is doing right now (for the renderer)
    rakeTarget: null,   // room the PDCs are chewing on
    tracerAcc: 0,       // accumulates tracer spawns
  };
}

export const alive = (ship, room) => !!ship.pieces[room] && ship.pieces[room].alive;
export const alivePieces = (ship) => ship.roomOrder.filter((r) => ship.pieces[r].alive);
// Which end the enemy sees right now. Turning counts as broadside.
export const exposure = (ship) => (ship.turnLeft > 0 ? 'side' : ship.face);
// PDC deck: two turrets broadside, one turret end-on.
export const pdcCount = (ship) => (alive(ship, 'pdc') ? (exposure(ship) === 'side' ? 2 : 1) : 0);
export const canFireTubes = (ship) => alive(ship, 'tubes') && ship.torps > 0 && exposure(ship) !== 'tail';
export const canAimRail = (ship) => alive(ship, 'rail') && alive(ship, 'sensors') && ship.face === 'bow' && ship.turnLeft <= 0;
export const hasWeapons = (ship) => alive(ship, 'rail') || alive(ship, 'pdc') || (alive(ship, 'tubes') && ship.torps > 0);
export const isBeaten = (ship) => !alive(ship, 'bridge') || !hasWeapons(ship);
// Hit chance multiplier from sensors; reload and recharge speed from crew.
export const aimFactor = (ship) => (alive(ship, 'sensors') ? 1 : N.SENSORS_DEAD_HIT);
export const crewSpeed = (ship) => (alive(ship, 'crew') ? 1 : N.CREW_DEAD_SPEED);
// The rooms a shot meets, in order, given where the enemy is.
// Bow-on: from the bow. Tail-on: from the stern. Broadside: a random alive room, then another.
export function lineOfFire(ship, rng) {
  const living = alivePieces(ship);
  if (living.length === 0) return [];
  const e = exposure(ship);
  if (e === 'bow') return living;
  if (e === 'tail') return living.slice().reverse();
  const items = living.map((r) => ({ name: r, weight: r === 'bridge' ? N.BRIDGE_WEIGHT : 1 }));
  const first = rng.weighted(items).name;
  // spill goes into the nearest living neighbour along the hull, sternward first
  const order = ship.roomOrder, i = order.indexOf(first);
  let next = null;
  for (let k = 1; k < order.length && !next; k++) {
    if (order[i + k] && ship.pieces[order[i + k]].alive) next = order[i + k];
    else if (order[i - k] && ship.pieces[order[i - k]].alive) next = order[i - k];
  }
  return next ? [first, next] : [first];
}

// Apply damage to a room. Returns {room, died}.
export function damage(ship, room, amount) {
  const pc = ship.pieces[room];
  if (!pc || !pc.alive) return { room, died: false };
  pc.hp -= amount;
  if (pc.hp <= 0) {
    pc.hp = 0;
    pc.alive = false;
    if (room === 'rail' || room === 'sensors') ship.railAim = -1;
    return { room, died: true };
  }
  return { room, died: false };
}
