// The battle: two ships, projectiles, tracers, a clock, phases, the result.
// step(dt) is deterministic given the seed and the order log.
import { N } from '../numbers.js';
import { makeRng } from '../rng.js';
import { makeShip, alive, isBeaten, alivePieces, turnShip, faceFor, angleDiff, tornRooms, tearOff } from './ship.js';
import { TACHI } from '../ships/tachi.js';
import { refusal, apply } from './orders.js';
import * as W from './weapons.js';
import { makeStats } from './stats.js';

export function makeBattle(seed) {
  const b = {
    seed, rng: makeRng(seed),
    t: 0,
    ships: [
      makeShip('me', 'Rocinante', -N.START_RANGE / 2, +1, TACHI),
      makeShip('them', 'Pella', +N.START_RANGE / 2, -1, TACHI),
    ],
    projectiles: [], tracers: [],
    events: [],      // drained by the renderer every frame
    log: [],         // every accepted order: {t, ship, order}
    result: null,    // {kind:'win'|'lose'|'escaped'|'draw', reason}
    phase: 'approach',
    stats: makeStats(),
    stepNo: 0,
  };
  // Every sim event goes through here: renderer queue plus statistics.
  b.emit = (ev) => { b.events.push(ev); b.stats.onEvent(ev, b.t); };
  b.shipById = (id) => (id === 'me' ? b.ships[0] : b.ships[1]);
  b.enemyOf = (ship) => (ship.id === 'me' ? b.ships[1] : b.ships[0]);
  b.range = () => Math.hypot(b.ships[0].x - b.ships[1].x, b.ships[0].y - b.ships[1].y);
  // km/s; negative means closing
  b.rangeRate = () => {
    const [m, t] = b.ships;
    const dx = t.x - m.x, dy = t.y - m.y, r = Math.hypot(dx, dy) || 1e-6;
    return (dx * (t.vx - m.vx) + dy * (t.vy - m.vy)) / r;
  };
  b.launchTorps = (ship) => W.launchTorps(b, ship, b.enemyOf(ship));
  // A Burn kicks the ship across the line of fire (perpendicular to the bearing to the enemy),
  // the same way as its current drift, to build speed rather than cancel it.
  b.burn = (ship) => {
    ship.burns -= 1;
    const e = b.enemyOf(ship);
    const dx = e.x - ship.x, dy = e.y - ship.y, r = Math.hypot(dx, dy) || 1e-6;
    const px = -dy / r, py = dx / r; // across the line, dir +1 is the bearing turned +90 degrees
    const dir = (ship.vx - e.vx) * px + (ship.vy - e.vy) * py >= 0 ? 1 : -1;
    ship.vx += dir * px * N.BURN_SPEED;
    ship.vy += dir * py * N.BURN_SPEED;
    ship.lastBurnT = b.t;
    b.emit({ type: 'burn', x: ship.x, y: ship.y, by: ship.id, dir });
  };
  b.pieceDied = (ship, piece, cause) => {
    const foe = b.enemyOf(ship);
    if (foe.target === piece) foe.target = null; // the room they were going for is gone: back to the exposed end
    b.emit({ type: 'pieceDead', x: ship.x, y: ship.y, ship: ship.id, piece, cause });
    // The tear rule: rooms cut off from the bridge by this hole break away with it. One event
    // per end so the renderer and the toast see a section go, not three rooms.
    const torn = tornRooms(ship);
    if (torn.length === 0) return;
    const i = ship.roomOrder.indexOf('bridge');
    for (const end of ['bow', 'stern']) {
      const pieces = torn.filter((r) => (ship.roomOrder.indexOf(r) < i) === (end === 'bow'));
      if (pieces.length === 0) continue;
      for (const r of pieces) tearOff(ship, r); // all first: a torn room is dead, so the nested check finds nothing more
      for (const r of pieces) b.pieceDied(ship, r, 'tear');
      b.emit({ type: 'tear', x: ship.x, y: ship.y, ship: ship.id, end, pieces });
    }
  };
  // Give an order. Returns null if accepted, else a refusal reason key.
  // 'move' takes arg {face, speed, dir}; the log keeps it so replays can repeat it.
  b.order = (shipId, order, arg) => {
    if (b.result) return 'over';
    const ship = b.shipById(shipId);
    const why = refusal(ship, order, { range: b.range(), enemy: b.enemyOf(ship) }, arg);
    if (why) return why;
    apply(ship, order, b, arg);
    b.log.push(arg === undefined ? { t: b.t, ship: shipId, order } : { t: b.t, ship: shipId, order, arg });
    return null;
  };
  b.step = (dt) => step(b, dt);
  return b;
}

function step(b, dt) {
  if (b.result) return;
  b.t += dt;
  const [me, them] = b.ships;
  moveShip(b, me, them, dt);
  moveShip(b, them, me, dt);
  // Alternate who shoots first each step: a fixed order gave the first ship a 60/40 edge in mirror matches.
  b.stepNo += 1;
  for (const s of (b.stepNo % 2 ? b.ships : [b.ships[1], b.ships[0]])) {
    if (s.torpReload > 0) s.torpReload = Math.max(0, s.torpReload - dt * (alive(s, 'crew') ? 1 : N.CREW_DEAD_SPEED));
    W.stepRail(b, s, b.enemyOf(s), dt);
    W.stepPdc(b, s, b.enemyOf(s), dt);
  }
  for (const p of b.projectiles) {
    if (p.dead) continue;
    if (p.kind === 'torp') W.stepTorp(b, p, dt);
    else W.stepSlug(b, p, dt);
  }
  b.projectiles = b.projectiles.filter((p) => !p.dead);
  for (const tr of b.tracers) tr.ttl -= dt;
  b.tracers = b.tracers.filter((tr) => tr.ttl > 0);
  updatePhase(b);
  endCheck(b);
}

function moveShip(b, ship, enemy, dt) {
  const dx = enemy.x - ship.x, dy = enemy.y - ship.y;
  const r = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / r, uy = dy / r;        // toward the enemy
  ship.thrust = 0;
  if (alive(ship, 'drive')) {
    turnShip(ship, dt); // no drive: the hull stays where it points
    if (!ship.move.coast) {
      // The order asks for a velocity along the heading, relative to the enemy: the autopilot
      // matches their drift, so a Burn or a running ship can still be followed. Never ram: the
      // closing part shrinks to what the thrusters can still kill before RANGE_MIN (v^2 = 2 a d).
      const hx = Math.cos(ship.heading), hy = Math.sin(ship.heading);
      let relX = hx * ship.move.speed, relY = hy * ship.move.speed;
      const closing = relX * ux + relY * uy;
      const closingMax = Math.sqrt(2 * N.ACCEL * N.OFF_AXIS_ACCEL * Math.max(0, r - N.RANGE_MIN));
      if (closing > closingMax) { relX -= (closing - closingMax) * ux; relY -= (closing - closingMax) * uy; }
      const wantX = enemy.vx + relX, wantY = enemy.vy + relY;
      let ax = (wantX - ship.vx) * N.AUTOPILOT_GAIN, ay = (wantY - ship.vy) * N.AUTOPILOT_GAIN;
      // The main drive pushes forward along the hull at full strength; braking and sideways
      // thrusters do the rest at half. While the hull swings the main drive is off axis too.
      const base = N.ACCEL * (ship.orders.run ? N.RUN_ACCEL_MULT : 1);
      const along = ax * hx + ay * hy;
      const acrossX = ax - along * hx, acrossY = ay - along * hy;
      const acrossMag = Math.hypot(acrossX, acrossY);
      const fwdMax = ship.turnLeft > 0 ? base * N.OFF_AXIS_ACCEL : base;
      const alongC = Math.max(-base * N.OFF_AXIS_ACCEL, Math.min(fwdMax, along));
      const acrossMax = base * N.OFF_AXIS_ACCEL;
      const k = acrossMag > acrossMax ? acrossMax / acrossMag : 1;
      ax = alongC * hx + acrossX * k;
      ay = alongC * hy + acrossY * k;
      ship.vx += ax * dt; ship.vy += ay * dt;
      ship.thrust = Math.max(-1, Math.min(1, alongC / base)); // main drive effort along the hull, for the renderer
    }
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  // which end the enemy sees now
  ship.face = faceFor(angleDiff(Math.atan2(enemy.y - ship.y, enemy.x - ship.x), ship.heading));
}

function updatePhase(b) {
  const r = b.range();
  const crippled = b.ships.some((s) => alivePieces(s).length <= 3); // 3 of 7 rooms left
  if (crippled) b.phase = 'break';
  else if (r <= N.PDC_RANGE) b.phase = 'knife';
  else if (b.phase !== 'knife') b.phase = 'approach';
  b.stats.onPhase(b.phase, b.t);
}

function endCheck(b) {
  const [me, them] = b.ships;
  const meOut = isBeaten(me), themOut = isBeaten(them);
  if (meOut && themOut) b.result = { kind: 'draw', reason: 'both' };
  else if (themOut) b.result = { kind: 'win', reason: alive(them, 'bridge') ? 'disarmed' : 'bridge' };
  else if (meOut) b.result = { kind: 'lose', reason: alive(me, 'bridge') ? 'disarmed' : 'bridge' };
  else if (b.range() > N.ESCAPE_RANGE) {
    if (me.orders.run && !them.orders.run) b.result = { kind: 'escaped', reason: 'me' };
    else if (them.orders.run && !me.orders.run) b.result = { kind: 'escaped', reason: 'them' };
    else b.result = { kind: 'draw', reason: 'apart' };
  } else if (b.t >= N.BATTLE_MAX) b.result = { kind: 'draw', reason: 'time' };
  if (b.result) b.emit({ type: 'end', result: b.result });
}
