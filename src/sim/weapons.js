// PDC, torpedo, railgun. Each function advances one ship's weapon by dt.
// Hits land on the rooms a ray meets from where the shot comes from (ship.shotFrom, lineOfFire).
import { N } from '../numbers.js';
import { alive, pdcCount, damage, lineOfFire, lineOfFireAt, exposed, shotFrom, aimFactor, crewSpeed, canAimRail } from './ship.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 1 at point blank, 0 at PDC_RANGE and beyond.
const pdcFactor = (dist) => clamp01(1 - dist / N.PDC_RANGE);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const isFrame = (room) => room.startsWith('frame:');
// Full damage to the first room on the ray from (fromX, fromY), SPILL of it to the next. When the
// first is frame it is cover, not a wall: it takes what it can and the rest of the blow carries into
// the room behind (a slug does not stop at a girder). A chosen room (alive) picks the ray with the
// least cover in front of it; the cover still takes the hit first. Emits hit and death events.
function strike(battle, target, kind, amount, fromX, fromY, room = null) {
  const dir = shotFrom(target, fromX, fromY);
  let rooms = room && alive(target, room) ? lineOfFireAt(target, room, dir, battle.rng) : [];
  if (rooms.length === 0) rooms = lineOfFire(target, battle.rng, dir);
  if (rooms.length === 0) return;
  const carry = isFrame(rooms[0]) ? Math.max(0, amount - target.pieces[rooms[0]].hp) : amount * N.SPILL;
  const spill = rooms[1] && carry > 0 ? rooms[1] : null;
  const hits = [[rooms[0], amount], [spill, carry]].filter(([r]) => r);
  battle.emit({ type: kind, x: target.x, y: target.y, ship: target.id, piece: rooms[0], spill });
  for (const [room, dmg] of hits) {
    const r = damage(target, room, dmg);
    if (r.died) battle.pieceDied(target, room, kind === 'torpHit' ? 'torp' : 'rail');
  }
}

export function stepPdc(battle, ship, enemy, dt) {
  const turrets = pdcCount(ship, enemy); // the mounts on the side that sees them
  if (turrets === 0) return;
  const aim = aimFactor(ship);
  const incoming = battle.projectiles.filter((p) => p.kind === 'torp' && p.target === ship.id && !p.dead);
  // Guard mode with torpedoes inside PDC range: shoot them.
  if (ship.orders.pdc === 'guard' && incoming.length > 0) {
    incoming.sort((a, b) => dist(a, ship) - dist(b, ship));
    for (let i = 0; i < turrets; i++) {
      const t = incoming[i % incoming.length];
      const d = dist(t, ship);
      if (d > N.PDC_RANGE || t.dead) continue;
      spawnTracers(battle, ship, t, dt);
      if (battle.rng.chance(N.PDC_GUARD_KILL_RATE * pdcFactor(d) * aim * dt)) {
        t.dead = true;
        battle.emit({ type: 'torpKilled', x: t.x, y: t.y, by: ship.id });
      }
    }
    return;
  }
  // Otherwise rake the enemy hull if inside range. Guard with no torpedoes also rakes:
  // the turrets have nothing else to shoot. Guard just means "torpedoes first".
  const d = dist(ship, enemy);
  if (d > N.PDC_RANGE) return;
  spawnTracers(battle, ship, enemy, dt, turrets);
  // The chosen room when the turrets can see it (a ray from here meets it first); else the first
  // room of a random ray from here, chewed until it dies or the hull turns it out of sight.
  const dir = shotFrom(enemy, ship.x, ship.y);
  if (ship.target && alive(enemy, ship.target) && exposed(enemy, ship.target, dir)) ship.rakeTarget = ship.target;
  else if (!ship.rakeTarget || !alive(enemy, ship.rakeTarget) || !exposed(enemy, ship.rakeTarget, dir)) {
    ship.rakeTarget = lineOfFire(enemy, battle.rng, dir)[0] || null;
  }
  if (!ship.rakeTarget) return;
  const r = damage(enemy, ship.rakeTarget, N.PDC_RAKE_DPS * pdcFactor(d) * aim * turrets * dt);
  // steady stream of small hits for the renderer
  ship.hitAcc = (ship.hitAcc || 0) + dt * 6 * pdcFactor(d);
  while (ship.hitAcc >= 1) {
    ship.hitAcc -= 1;
    battle.emit({ type: 'pdcHit', x: enemy.x, y: enemy.y, ship: enemy.id, piece: ship.rakeTarget });
  }
  if (r.died) battle.pieceDied(enemy, r.room, 'pdc');
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
  const n = Math.min(ship.salvo, ship.torps);
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    battle.projectiles.push({
      kind: 'torp', owner: ship.id, target: enemy.id,
      x: ship.x, y: ship.y + side * 0.15,
      vx: ship.vx + ship.facing * 0.3, vy: ship.vy + side * 0.4,
      aim: aimFactor(ship), // the shooter's sensors at launch decide whether it finds its mark
      room: ship.target && alive(enemy, ship.target) ? ship.target : null, // the room it goes for, else whatever its ray meets
      side, dove: false,    // a buried room: swing wide on this side, then dive in; dove once past the shoulder
      dead: false, age: 0,
    });
  }
  ship.torps -= n;
  ship.torpReload = ship.reloadTime;
  battle.emit({ type: 'torpLaunch', x: ship.x, y: ship.y, by: ship.id, count: n });
}

// A torpedo sent at a room that is buried from where it is (no ray from there meets it first) slows
// to TORP_FLANK_SPEED, swings wide to a point TORP_FLANK beside the target (across the line from the
// shooter), then turns in: slow enough to make the turn, a longer and slower flight inside PDC
// range, so more of them die. It strikes from wherever it is when it goes off.
// Returns {x, y, speed}: the point it homes on right now and its speed cap.
function torpAim(battle, t, target) {
  const buried = t.room && alive(target, t.room) && !exposed(target, t.room, shotFrom(target, t.x, t.y));
  if (!buried) return { x: target.x, y: target.y, speed: N.TORP_SPEED };
  const slow = N.TORP_SPEED * N.TORP_FLANK_SPEED;
  if (t.dove) return { x: target.x, y: target.y, speed: slow };
  const shooter = battle.shipById(t.owner);
  const dx = target.x - shooter.x, dy = target.y - shooter.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const wx = target.x - (dy / d) * t.side * N.TORP_FLANK, wy = target.y + (dx / d) * t.side * N.TORP_FLANK;
  if (Math.hypot(wx - t.x, wy - t.y) < N.TORP_FLANK * 0.5) { t.dove = true; return { x: target.x, y: target.y, speed: slow }; }
  return { x: wx, y: wy, speed: slow };
}

export function stepTorp(battle, t, dt) {
  const target = battle.shipById(t.target);
  t.age += dt;
  // homing: accelerate toward the aim point, cap speed
  const aim = torpAim(battle, t, target);
  const ax = aim.x - t.x, ay = aim.y - t.y;
  const da = Math.hypot(ax, ay) || 1e-6;
  t.vx += (ax / da) * N.TORP_HOMING * dt;
  t.vy += (ay / da) * N.TORP_HOMING * dt;
  const dBefore = Math.hypot(target.x - t.x, target.y - t.y);
  // The speed cap is relative to the target, like the ships' own autopilot: a ship that has
  // Burned itself up to 2 km/s is still caught. Before this, torpedoes chased such a ship forever.
  const rvx = t.vx - target.vx, rvy = t.vy - target.vy;
  const sp = Math.hypot(rvx, rvy);
  if (sp > aim.speed) { t.vx = target.vx + rvx * (aim.speed / sp); t.vy = target.vy + rvy * (aim.speed / sp); }
  t.x += t.vx * dt; t.y += t.vy * dt;
  const d = Math.hypot(target.x - t.x, target.y - t.y);
  // Proximity fuse: go off at closest approach when that is inside TORP_FUSE, or on a direct hit.
  const closest = d > dBefore && dBefore < N.TORP_FUSE;
  if (d < 0.08 || closest) {
    t.dead = true;
    if (!battle.rng.chance(t.aim)) {
      battle.emit({ type: 'torpMiss', x: t.x, y: t.y, ship: target.id });
      return;
    }
    strike(battle, target, 'torpHit', N.ROOM_HP, t.x, t.y, t.room); // from where it actually is
  }
}

export function stepRail(battle, ship, enemy, dt) {
  if (!alive(ship, 'rail')) return;
  if (ship.railCharge > 0) ship.railCharge = Math.max(0, ship.railCharge - dt * crewSpeed(ship));
  if (ship.railAim < 0) return;
  if (!canAimRail(ship)) { ship.railAim = -1; return; } // hull swung or sensors died: aim lost
  ship.railAim += dt;
  if (ship.railAim < N.RAIL_AIM_TIME) return;
  // fire
  ship.railAim = -1;
  ship.railCharge = ship.railRecharge;
  // A Burn at any moment during the aim throws the shot off.
  const hit = enemy.lastBurnT < ship.railAimStart;
  battle.projectiles.push({
    kind: 'slug', owner: ship.id, target: enemy.id, hit,
    room: ship.target && alive(enemy, ship.target) ? ship.target : null, // the room it was aimed at, like a torpedo
    x: ship.x, y: ship.y,
    tx: enemy.x, ty: hit ? enemy.y : enemy.y - Math.sign(enemy.vy || 1) * 0.6, aimStart: ship.railAimStart,
    dead: false, age: 0,
  });
  battle.emit({ type: 'railFire', x: ship.x, y: ship.y, by: ship.id });
}

export function stepSlug(battle, s, dt) {
  const dx = s.tx - s.x, dy = s.ty - s.y;
  const d = Math.hypot(dx, dy);
  const stepLen = N.RAIL_SLUG_SPEED * dt;
  if (d <= stepLen) {
    s.x = s.tx; s.y = s.ty; s.dead = true;
    const target = battle.shipById(s.target);
    const shooter = battle.shipById(s.owner);
    if (s.hit) strike(battle, target, 'railHit', N.ROOM_HP, shooter.x, shooter.y, s.room); // the least-covered ray to the aimed room
    else battle.emit({ type: 'railMiss', x: s.x, y: s.y, ship: target.id });
    return;
  }
  s.x += (dx / d) * stepLen; s.y += (dy / d) * stepLen;
}
