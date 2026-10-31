// A ship: an ordered chain of rooms from bow to stern, a position, a velocity,
// a facing, the current orders. Pure data and functions. No DOM.
import { N } from '../numbers.js';
import { CATALOG } from '../ships/catalog.js';

export const FACES = ['bow', 'side', 'tail'];

// Smallest signed difference between two angles, radians, in (-PI, PI].
export const angleDiff = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
// Which end the enemy sees for a hull pointed `off` radians away from the bearing to it.
export function faceFor(off) {
  const a = Math.abs(off), cone = (N.BOW_CONE * Math.PI) / 180;
  return a <= cone ? 'bow' : a >= Math.PI - cone ? 'tail' : 'side';
}

// fit: slot kind -> variant key from the catalog, for the slots of this design that have one;
// a variant overrides the room's turrets and armor, or the ship's tubes, rail and drive numbers.
// The form as cells (ARCHITECTURE.md "The form"): design.form.rows, one letter per cell, '.' void.
// A letter in design.form.rooms is that job room's cell. Any other letter is frame: each 4-connected
// group of one letter is its own frame room `frame:<letter><n>` (hp FRAME_HP, no job), added to
// `pieces`. Row-major, so the numbering is deterministic. Returns {form, cells, frames}.
export function buildForm(design, pieces) {
  const rows = design.form.rows, h = rows.length, w = rows[0].length;
  const cells = rows.map((r) => [...r].map(() => null));
  const frames = [], count = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.' || cells[y][x]) continue;
    const job = design.form.rooms[ch];
    if (job) { cells[y][x] = { room: job, cut: false }; continue; }
    count[ch] = (count[ch] || 0) + 1;
    const id = `frame:${ch}${count[ch]}`;
    frames.push(id);
    pieces[id] = { hp: N.FRAME_HP, maxHp: N.FRAME_HP, alive: true };
    const stack = [[x, y]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b < 0 || b >= h || a < 0 || a >= w || rows[b][a] !== ch || cells[b][a]) continue;
      cells[b][a] = { room: id, cut: false };
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
  }
  return { form: { w, h }, cells, frames };
}

export function makeShip(id, name, x, facing, design, fit = {}) {
  const pieces = {}, armor = {}, bulkheadAft = {}, turrets = {};
  const v = (kind) => (CATALOG[kind] && CATALOG[kind][fit[kind]]) || null; // the fitted variant of a kind, if any
  let salvo = N.TORP_SALVO, reloadTime = N.TORP_RELOAD, torps = design.torps === undefined ? N.TORP_COUNT : design.torps;
  let railRange = N.RAIL_RANGE, railRecharge = N.RAIL_RECHARGE;
  let accel = design.accel === undefined ? 1 : design.accel, burns = N.BURNS;
  for (const r of design.rooms) {
    const x = v(r.kind);
    const plated = x && x.armor !== undefined ? x.armor : !!r.armor;
    const hp = N.ROOM_HP * (plated ? N.ARMOR_HP_MULT : 1);
    pieces[r.id] = { hp, maxHp: hp, alive: true };
    if (plated) armor[r.id] = true;
    if (r.bulkhead) bulkheadAft[r.id] = true;
    const t = x && x.turrets !== undefined ? x.turrets : r.turrets;
    if (t) turrets[r.id] = t;
    if (x && r.kind === 'launcher') { salvo = x.salvo; reloadTime = x.reload; torps = x.torps; }
    if (x && r.kind === 'gun') { railRange = x.range; railRecharge = x.recharge; }
    if (x && r.kind === 'drive') { accel = x.accel; burns = x.burns; }
  }
  const { form, cells, frames } = buildForm(design, pieces);
  return {
    id, name, design: design.id, fit: { ...fit },
    form, cells, frames,  // the grid: {w, h}; cells[y][x] null or {room, cut}; the frame room ids
    accel,              // fraction of ACCEL this hull's drive gives
    salvo, reloadTime,  // torpedoes per salvo, seconds between salvos
    railRange, railRecharge, // km, seconds
    turrets,            // room id -> PDC turrets on that deck; all fire broadside, half (rounded up) end-on
    roomOrder: design.rooms.map((r) => r.id), // bow first
    x, y: 0,            // km; the fight line is the x axis
    vx: 0, vy: 0,       // km/s
    facing,             // +1 the enemy starts to the right, -1 to the left
    pieces,             // room id -> {hp, maxHp, alive, torn?}; torn: it broke off and drifts, for the renderer
    armor,              // room id -> true for plated rooms (hp already doubled); for the renderer
    bulkheadAft,        // room id -> true when a bulkhead sits aft of it: spill stops there; the tear lines
    heading: facing === -1 ? Math.PI : 0, // radians, where the bow points on the map (0 = +x)
    headingTarget: facing === -1 ? Math.PI : 0, // the ordered heading; the hull swings toward it
    turnLeft: 0,        // seconds of swing left; the railgun cannot aim while the hull moves
    face: 'bow',        // which end the enemy sees right now, from heading versus bearing: 'bow' | 'side' | 'tail'
    // The move order: the ship flies along its heading at this absolute speed, km/s, and keeps
    // it. coast: thrust off, velocity kept (Hold).
    move: { speed: 0, coast: true },
    orders: { pdc: 'guard', run: false },
    torps,
    torpReload: 0,      // seconds until tubes are loaded
    railCharge: N.RAIL_START_CHARGE, // seconds until the railgun is ready
    railAim: -1,        // -1 idle, else seconds spent aiming
    burns,
    lastBurnT: -1,      // game time of the last Burn; a Burn during the enemy's aim means a miss
    railAimStart: -1,   // game time the current aim began
    thrust: 0,          // -1..1 along x, what the drive is doing right now (for the renderer)
    rakeTarget: null,   // room the PDCs are chewing on
    target: null,       // the enemy room this ship's weapons are told to go for, or null
    tracerAcc: 0,       // accumulates tracer spawns
  };
}

export const alive = (ship, room) => !!ship.pieces[room] && ship.pieces[room].alive;
export const alivePieces = (ship) => ship.roomOrder.filter((r) => ship.pieces[r].alive);
// Which end the enemy sees right now (the sim keeps ship.face current every step).
export const exposure = (ship) => ship.face;
// PDC deck: every turret broadside, half of them (rounded up) end-on.
export const turretCount = (ship) => ship.turrets.pdc || 2;
export const pdcCount = (ship) => (alive(ship, 'pdc') ? (exposure(ship) === 'side' ? turretCount(ship) : Math.ceil(turretCount(ship) / 2)) : 0);
export const canFireTubes = (ship) => alive(ship, 'tubes') && ship.torps > 0 && exposure(ship) !== 'tail';
export const canAimRail = (ship) => alive(ship, 'rail') && alive(ship, 'sensors') && ship.face === 'bow' && ship.turnLeft <= 0;
// Swing the hull toward headingTarget by dt. Returns true when the swing ends this step.
export function turnShip(ship, dt) {
  if (ship.turnLeft <= 0) return false;
  const left = angleDiff(ship.headingTarget, ship.heading);
  const rate = (Math.PI / 2) / N.FACE_TURN_TIME;
  const step = rate * dt;
  ship.turnLeft = Math.max(0, ship.turnLeft - dt);
  if (Math.abs(left) <= step || ship.turnLeft === 0) { ship.heading = ship.headingTarget; ship.turnLeft = 0; return true; }
  ship.heading += Math.sign(left) * step;
  return false;
}
export const hasWeapons = (ship) => alive(ship, 'rail') || alive(ship, 'pdc') || (alive(ship, 'tubes') && ship.torps > 0);
export const isBeaten = (ship) => !alive(ship, 'bridge') || !hasWeapons(ship);
// Hit chance multiplier from sensors; reload and recharge speed from crew.
export const aimFactor = (ship) => (alive(ship, 'sensors') ? 1 : N.SENSORS_DEAD_HIT);
export const crewSpeed = (ship) => (alive(ship, 'crew') ? 1 : N.CREW_DEAD_SPEED);
// The room at the exposed end, or null when broadside (every room is exposed).
export function exposedEnd(ship) {
  const living = alivePieces(ship);
  const e = exposure(ship);
  if (living.length === 0 || e === 'side') return null;
  return e === 'bow' ? living[0] : living[living.length - 1];
}
// Where damage spills from a room: the nearest living neighbour along the hull, sternward first,
// never across a bulkhead (dead rooms in between are holes the blast passes through).
export function spillNeighbour(ship, room) {
  const order = ship.roomOrder, i = order.indexOf(room);
  for (let j = i + 1; j < order.length; j++) {
    if (ship.bulkheadAft[order[j - 1]]) break;
    if (ship.pieces[order[j]].alive) return order[j];
  }
  for (let j = i - 1; j >= 0; j--) {
    if (ship.bulkheadAft[order[j]]) break;
    if (ship.pieces[order[j]].alive) return order[j];
  }
  return null;
}
// The rooms a shot aimed at one room meets: that room, then its neighbour.
export function lineOfFireAt(ship, room) {
  const next = spillNeighbour(ship, room);
  return next ? [room, next] : [room];
}
// The rooms a shot meets, in order, given where the enemy is.
// Bow-on: from the bow. Tail-on: from the stern. Broadside: a random alive room, then another.
export function lineOfFire(ship, rng) {
  const living = alivePieces(ship);
  if (living.length === 0) return [];
  const e = exposure(ship);
  if (e === 'bow') return living;
  if (e === 'tail') return living.slice().reverse();
  const items = living.map((r) => ({ name: r, weight: r === 'bridge' ? N.BRIDGE_WEIGHT : 1 }));
  return lineOfFireAt(ship, rng.weighted(items).name);
}

// The living rooms with no path to the bridge through living rooms: a dead room is a hole, and
// everything beyond it along the hull is no longer part of the ship. Called after a room dies.
export function tornRooms(ship) {
  const order = ship.roomOrder, i = order.indexOf('bridge');
  if (i < 0 || !alive(ship, 'bridge')) return [];
  const torn = [];
  for (const dir of [1, -1]) {
    let cut = false;
    for (let j = i + dir; j >= 0 && j < order.length; j += dir) {
      if (!alive(ship, order[j])) cut = true;
      else if (cut) torn.push(order[j]);
    }
  }
  return torn;
}
// A room tears off: it is gone like a dead one (hp 0, not alive), and marked torn so the
// renderer draws it adrift. The tubes take the torpedo stock with them.
export function tearOff(ship, room) {
  const pc = ship.pieces[room];
  pc.hp = 0; pc.alive = false; pc.torn = true;
  if (room === 'rail' || room === 'sensors') ship.railAim = -1;
  if (room === 'tubes') ship.torps = 0;
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
