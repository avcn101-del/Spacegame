// The battle: two ships, projectiles, tracers, a clock, phases, the result.
// step(dt) is deterministic given the seed and the order log.
import { N } from '../numbers.js';
import { makeRng } from '../rng.js';
import { makeShip, alive, isBeaten, alivePieces, accelFactor } from './ship.js';
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
  b.burn = (ship) => {
    ship.burns -= 1;
    const dir = ship.vy >= 0 ? 1 : -1; // keep burning the same way to build speed
    ship.vy += dir * N.BURN_SPEED;
    ship.lastBurnT = b.t;
    b.emit({ type: 'burn', x: ship.x, y: ship.y, by: ship.id, dir });
  };
  b.pieceDied = (ship, piece, cause) => {
    b.emit({ type: 'pieceDead', x: ship.x, y: ship.y, ship: ship.id, piece, cause });
  };
  // Give an order. Returns null if accepted, else a refusal reason key.
  b.order = (shipId, order) => {
    if (b.result) return 'over';
    const ship = b.shipById(shipId);
    const why = refusal(ship, order, { range: b.range() });
    if (why) return why;
    apply(ship, order, b);
    b.log.push({ t: b.t, ship: shipId, order });
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
    if (s.turnLeft > 0) { s.turnLeft -= dt; if (s.turnLeft <= 0) { s.turnLeft = 0; s.face = s.faceTarget; } }
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
  const drive = alive(ship, 'drive');
  ship.thrust = 0;
  if (drive) {
    const toEnemy = Math.sign(enemy.x - ship.x) || ship.facing;
    const range = b.range();
    let ax = 0;
    const base = N.ACCEL * (ship.orders.run ? N.RUN_ACCEL_MULT : 1);
    // main drive pushes along the hull; the wrong way round, thrusters push at half
    const accel = (toward) => base * accelFactor(ship, toward);
    if (ship.orders.run) {
      ax = -toEnemy * accel(-1);
    } else {
      const want = ship.orders.range === 'close' ? N.RANGE_CLOSE
        : ship.orders.range === 'open' ? N.RANGE_OPEN : null;
      if (want !== null) {
        const err = range - want; // positive: too far
        const toward = Math.sign(err); // +1 need to close, -1 need to open
        if (Math.abs(err) > N.RANGE_TOLERANCE) ax = toEnemy * toward * accel(toward);
        else ax = -ship.vx * 2; // settle: kill relative drift
      } else {
        ax = -ship.vx * 2; // hold: stop
      }
    }
    ship.vx += ax * dt;
    ship.thrust = Math.max(-1, Math.min(1, ax / N.ACCEL));
    // lateral damping: autopilot bleeds off burn drift
    ship.vy -= ship.vy * N.LATERAL_DAMP * dt;
  }
  const sp = Math.abs(ship.vx);
  if (sp > N.MAX_SPEED) ship.vx *= N.MAX_SPEED / sp;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
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
