// PDC, torpedo, railgun. Each function advances one ship's weapon by dt.
// They push events onto battle.events for the renderer and mutate state.
import { N } from '../numbers.js';
import { alive, pdcCount, damage, pickPiece } from './ship.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 1 at point blank, 0 at PDC_RANGE and beyond.
const pdcFactor = (dist) => clamp01(1 - dist / N.PDC_RANGE);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function stepPdc(battle, ship, enemy, dt) {
  const turrets = pdcCount(ship);
  if (turrets === 0) return;
  const incoming = battle.projectiles.filter((p) => p.kind === 'torp' && p.target === ship.id && !p.dead);
  // Guard mode with torpedoes inside PDC range: shoot them.
  if (ship.orders.pdc === 'guard' && incoming.length > 0) {
    // each turret takes one torpedo, nearest first
    incoming.sort((a, b) => dist(a, ship) - dist(b, ship));
    for (let i = 0; i < turrets; i++) {
      const t = incoming[i % incoming.length];
      const d = dist(t, ship);
      if (d > N.PDC_RANGE) continue;
      spawnTracers(battle, ship, t, dt);
      if (battle.rng.chance(N.PDC_GUARD_KILL_RATE * pdcFactor(d) * dt)) {
        t.dead = true;
        battle.events.push({ type: 'torpKilled', x: t.x, y: t.y, by: ship.id });
      }
    }
    return;
  }
  // Otherwise rake the enemy hull if inside range (Guard with no torpedoes also rakes:
  // the turrets have nothing else to shoot. Guard just means "torpedoes first").
  const d = dist(ship, enemy);
  if (d > N.PDC_RANGE) return;
  spawnTracers(battle, ship, enemy, dt, turrets);
  if (!ship.rakeTarget || !alive(enemy, ship.rakeTarget)) ship.rakeTarget = pickPiece(enemy, battle.rng);
  if (!ship.rakeTarget) return;
  const r = damage(enemy, ship.rakeTarget, N.PDC_RAKE_DPS * pdcFactor(d) * turrets * dt);
  // steady stream of small hits for the renderer
  ship.hitAcc = (ship.hitAcc || 0) + dt * 6 * pdcFactor(d);
  while (ship.hitAcc >= 1) {
    ship.hitAcc -= 1;
    battle.events.push({ type: 'pdcHit', x: enemy.x, y: enemy.y, ship: enemy.id, piece: ship.rakeTarget });
  }
  if (r.died) battle.pieceDied(enemy, r.piece, 'pdc');
}

function spawnTracers(battle, ship, target, dt, turrets = 1) {
  ship.tracerAcc += N.PDC_TRACER_RATE * turrets * dt;
  while (ship.tracerAcc >= 1) {
    ship.tracerAcc -= 1;
    const spread = 0.08;
    battle.tracers.push({
      x1: ship.x, y1: ship.y,
      x2: target.x + (battle.rng.next() - 0.5) * spread,
      y2: target.y + (battle.rng.next() - 0.5) * spread,
      ttl: 0.12, owner: ship.id,
    });
  }
}

export function launchTorps(battle, ship, enemy) {
  const n = Math.min(N.TORP_SALVO, ship.torps);
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    battle.projectiles.push({
      kind: 'torp', owner: ship.id, target: enemy.id,
      x: ship.x, y: ship.y + side * 0.15,
      vx: ship.vx + ship.facing * 0.3, vy: ship.vy + side * 0.4,
      dead: false, age: 0,
    });
  }
  ship.torps -= n;
  ship.torpReload = N.TORP_RELOAD;
  battle.events.push({ type: 'torpLaunch', x: ship.x, y: ship.y, by: ship.id, count: n });
}

export function stepTorp(battle, t, dt) {
  const target = battle.shipById(t.target);
  t.age += dt;
  // homing: accelerate toward target, cap speed
  const dx = target.x - t.x, dy = target.y - t.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  t.vx += (dx / d) * N.TORP_HOMING * dt;
  t.vy += (dy / d) * N.TORP_HOMING * dt;
  const sp = Math.hypot(t.vx, t.vy);
  if (sp > N.TORP_SPEED) { t.vx *= N.TORP_SPEED / sp; t.vy *= N.TORP_SPEED / sp; }
  t.x += t.vx * dt; t.y += t.vy * dt;
  if (d < 0.08) {
    t.dead = true;
    const piece = pickPiece(target, battle.rng);
    if (piece) {
      const r = damage(target, piece, N.PIECE_HP);
      battle.events.push({ type: 'torpHit', x: target.x, y: target.y, ship: target.id, piece });
      if (r.died) battle.pieceDied(target, piece, 'torp');
    }
  }
}

export function stepRail(battle, ship, enemy, dt) {
  if (!alive(ship, 'rail')) return;
  if (ship.railCharge > 0) ship.railCharge = Math.max(0, ship.railCharge - dt);
  if (ship.railAim < 0) return;
  ship.railAim += dt;
  if (ship.railAim < N.RAIL_AIM_TIME) return;
  // fire
  ship.railAim = -1;
  ship.railCharge = N.RAIL_RECHARGE;
  // A Burn at any moment during the aim throws the shot off.
  const hit = enemy.lastBurnT < ship.railAimStart;
  battle.projectiles.push({
    kind: 'slug', owner: ship.id, target: enemy.id, hit,
    x: ship.x, y: ship.y,
    // aimed at where the enemy is; on a miss, aim at where it was before the burn
    tx: enemy.x, ty: hit ? enemy.y : enemy.y - Math.sign(enemy.vy || 1) * 0.6, aimStart: ship.railAimStart,
    dead: false, age: 0,
  });
  battle.events.push({ type: 'railFire', x: ship.x, y: ship.y, by: ship.id });
}

export function stepSlug(battle, s, dt) {
  const dx = s.tx - s.x, dy = s.ty - s.y;
  const d = Math.hypot(dx, dy);
  const stepLen = N.RAIL_SLUG_SPEED * dt;
  if (d <= stepLen) {
    s.x = s.tx; s.y = s.ty; s.dead = true;
    const target = battle.shipById(s.target);
    if (s.hit) {
      const piece = pickPiece(target, battle.rng);
      if (piece) {
        const r = damage(target, piece, N.PIECE_HP);
        battle.events.push({ type: 'railHit', x: target.x, y: target.y, ship: target.id, piece });
        if (r.died) battle.pieceDied(target, piece, 'rail');
      }
    } else {
      battle.events.push({ type: 'railMiss', x: s.x, y: s.y, ship: target.id });
    }
    return;
  }
  s.x += (dx / d) * stepLen; s.y += (dy / d) * stepLen;
}
