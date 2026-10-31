// A ship: rooms (job rooms bow to stern, and frame), the form as a grid of cells, a position, a
// velocity, a facing, the current orders. Pure data and functions. No DOM.
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
// `pieces`. Row-major, so the numbering is deterministic. Mounts (ARCHITECTURE.md "PDC mounts"): the
// first `fitted` of design.form.mounts are pdc cells; every other P cell is its own frame room
// `frame:P<n>`, one cell each. Returns {form, cells, frames}.
export function buildForm(design, pieces, fitted = 0) {
  const rows = design.form.rows, h = rows.length, w = rows[0].length;
  const cells = rows.map((r) => [...r].map(() => null));
  const frames = [], count = {}, mounts = design.form.mounts || [];
  mounts.slice(0, fitted).forEach(([x, y]) => { cells[y][x] = { room: 'pdc', cut: false }; });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.' || cells[y][x]) continue;
    const job = design.form.rooms[ch];
    if (job && !(ch === 'P' && mounts.length)) { cells[y][x] = { room: job, cut: false }; continue; }
    count[ch] = (count[ch] || 0) + 1;
    const id = `frame:${ch}${count[ch]}`;
    frames.push(id);
    pieces[id] = { hp: N.FRAME_HP, maxHp: N.FRAME_HP, alive: true };
    if (ch === 'P') { cells[y][x] = { room: id, cut: false }; continue; } // an empty mount: one cell
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
  const pieces = {}, armor = {}, turrets = {};
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
    const t = x && x.turrets !== undefined ? x.turrets : r.turrets;
    if (t) turrets[r.id] = t;
    if (x && r.kind === 'launcher') { salvo = x.salvo; reloadTime = x.reload; torps = x.torps; }
    if (x && r.kind === 'gun') { railRange = x.range; railRecharge = x.recharge; }
    if (x && r.kind === 'drive') { accel = x.accel; burns = x.burns; }
  }
  const mounts = design.form.mounts;
  const fitted = mounts ? Math.min(turrets.pdc || 2, mounts.length) : 0; // as turretCount: no number is two
  const { form, cells, frames } = buildForm(design, pieces, fitted);
  if (mounts) { form.mounts = mounts.map(([a, b]) => [a, b]); form.fitted = fitted; }
  return {
    id, name, design: design.id, fit: { ...fit },
    form, cells, frames,  // the grid: {w, h, mounts?, fitted?}; cells[y][x] null or {room, cut}; the frame room ids
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
// Where a shot comes from, in the ship's own frame: 'bow' | 'stern' | 'top' | 'bottom'. Local +x is
// the bow (heading); local +y is the map's +y turned with the hull, and it maps to the grid's higher
// rows: from local -y a shot enters at row 0 ('top'), from local +y at the last row ('bottom'). With
// the canvas y down and the hull drawn rotated by heading, row 0 is the side drawn on the left of
// the bow. Within BOW_CONE of the bow or stern axis it is that end, as with ship.face.
export function shotFrom(ship, fromX, fromY) {
  const dx = fromX - ship.x, dy = fromY - ship.y, c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const a = Math.abs(Math.atan2(ly, lx)), cone = (N.BOW_CONE * Math.PI) / 180;
  if (a <= cone) return 'bow';
  if (a >= Math.PI - cone) return 'stern';
  return ly < 0 ? 'top' : 'bottom';
}
// A cell is part of the ship while its room lives and it has not been cut away.
const cellAlive = (ship, c) => !!c && !c.cut && ship.pieces[c.room].alive;
// Every ray from one direction: a row walked from the bow end or the stern end, or a column
// walked from the top or the bottom edge. Each ray is its cells in the order a shot meets them.
// The cells never move (cut is set in place), so the rays are built once per ship and direction.
const RAYS = new WeakMap();
function rays(ship, dir) {
  let byDir = RAYS.get(ship.cells);
  if (!byDir) RAYS.set(ship.cells, (byDir = {}));
  if (byDir[dir]) return byDir[dir];
  const { w, h } = ship.form, out = [];
  if (dir === 'bow' || dir === 'stern') {
    for (let y = 0; y < h; y++) {
      const r = [];
      for (let i = 0; i < w; i++) r.push(ship.cells[y][dir === 'bow' ? w - 1 - i : i]);
      out.push(r);
    }
  } else {
    for (let x = 0; x < w; x++) {
      const r = [];
      for (let i = 0; i < h; i++) r.push(ship.cells[dir === 'top' ? i : h - 1 - i][x]);
      out.push(r);
    }
  }
  return (byDir[dir] = out);
}
// The distinct rooms of the living cells along a ray, in the order the shot meets them.
function roomsAlong(ship, ray) {
  const rooms = [];
  for (const c of ray) if (cellAlive(ship, c) && !rooms.includes(c.room)) rooms.push(c.room);
  return rooms;
}
// The rooms an unaimed shot meets: a ray drawn uniformly from those that show a living cell.
export function lineOfFire(ship, rng, dir) {
  const live = rays(ship, dir).filter((r) => r.some((c) => cellAlive(ship, c)));
  if (live.length === 0) return [];
  return roomsAlong(ship, rng.pick(live));
}
// The rooms a shot aimed at `room` meets: of the rays through a living cell of it, the one with the
// fewest living cells of other rooms in front (ties by the rng). The cover comes first, then the
// room, then what is behind. Empty when no ray reaches it.
export function lineOfFireAt(ship, room, dir, rng) {
  let best = [], min = Infinity;
  for (const r of rays(ship, dir)) {
    let cover = 0, hit = false;
    for (const c of r) {
      if (!cellAlive(ship, c)) continue;
      if (c.room === room) { hit = true; break; }
      cover += 1;
    }
    if (!hit || cover > min) continue;
    if (cover < min) { min = cover; best = []; }
    best.push(r);
  }
  return best.length ? roomsAlong(ship, rng.pick(best)) : [];
}
// True when some ray from `dir` meets `room` before any other living cell.
export function exposed(ship, room, dir) {
  return rays(ship, dir).some((r) => { const c = r.find((k) => cellAlive(ship, k)); return !!c && c.room === room; });
}

// The tear rule: flood from the bridge's living cells over living cells, 4-neighbours. Living cells
// not reached are cut (they broke away; a dead room's cells stay where they are, as holes). Returns
// the rooms still alive that have no living cell left: they tear off (the caller calls tearOff).
// Nothing tears once the bridge is dead: the ship is beaten anyway.
export function cutOff(ship) {
  if (!alive(ship, 'bridge')) return [];
  const { w, h } = ship.form, cells = ship.cells, seen = new Set(), stack = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y][x] && cells[y][x].room === 'bridge' && cellAlive(ship, cells[y][x])) stack.push([x, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen.has(y * w + x) || !cellAlive(ship, cells[y][x])) continue;
    seen.add(y * w + x);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const left = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y][x];
    if (!cellAlive(ship, c)) continue;
    if (seen.has(y * w + x)) left.add(c.room); else c.cut = true;
  }
  return Object.keys(ship.pieces).filter((r) => ship.pieces[r].alive && !left.has(r));
}
// Mean grid x of a room's cells: which end a torn room was on, against the bridge's.
export function meanX(ship, room) {
  let sum = 0, n = 0;
  ship.cells.forEach((row) => row.forEach((c, x) => { if (c && c.room === room) { sum += x; n += 1; } }));
  return n ? sum / n : 0;
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
