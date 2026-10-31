// The enemy: same orders as the player, from a small rule table shaped by a preset.
// Thinks once per AI_TICK seconds. Uses the battle's seeded rng.
import { N } from '../numbers.js';
import { alivePieces, alive, canAimRail, angleDiff } from '../sim/ship.js';
import { PRESETS, DEFAULT_PRESET } from './presets.js';
import { makeRng } from '../rng.js';

// step(b, dt) applies its orders at once. decide(b, dt) only returns them, so two
// AIs can decide on the same state and then both apply: fair in AI vs AI.
export function makeEnemy(shipId, preset = DEFAULT_PRESET) {
  const P = typeof preset === 'string' ? PRESETS[preset] || PRESETS[DEFAULT_PRESET] : preset;
  let acc = 0;
  // The AI rolls its own dice, seeded from the battle, so the sim's random stream is the
  // same whether the AI plays or a replay feeds the orders back in.
  let rng = null;
  const ai = {
    preset: P,
    decide(b, dt) {
      acc += dt;
      if (acc < N.AI_TICK) return null;
      acc -= N.AI_TICK;
      if (!rng) rng = makeRng((b.seed * 31 + (shipId === 'me' ? 1 : 2)) >>> 0);
      const me = b.shipById(shipId);
      const orders = [];
      think(b, P, me, b.enemyOf(me), (o, arg) => orders.push([o, arg]), rng);
      return orders;
    },
    apply(b, orders) { if (orders) for (const [o, arg] of orders) b.order(shipId, o, arg); },
    step(b, dt) { ai.apply(b, ai.decide(b, dt)); },
  };
  return ai;
}

function think(b, P, me, you, give, rng) {
  const mine = alivePieces(me).length, yours = alivePieces(you).length;

  // Run: losing badly and few pieces left.
  if (!me.orders.run && P.runAt > 0 && mine <= P.runAt && mine < yours) { give('run'); return; }

  // Burn: their railgun is aiming at us.
  if (you.railAim >= 0 && me.burns > 0 && rng.chance(P.burnChance)) give('burn');

  // Target room, by preset. Dropped by the sim when that room dies; then the exposed end.
  if (P.target && alive(you, P.target) && me.target !== P.target) give('target', { room: P.target });

  // PDC mode.
  if (P.pdc === 'auto') {
    const incoming = b.projectiles.some((p) => p.kind === 'torp' && p.target === me.id);
    give(incoming ? 'guard' : 'rake');
  } else give(P.pdc);

  // Torpedoes.
  if (P.torps === 'always' || (P.torps === 'guardDown' && !alive(you, 'pdc'))) give('torps');

  // Railgun: sure shot when they cannot dodge (no burns, or aiming themselves); otherwise a gamble.
  if (canAimRail(me) && (you.burns === 0 || you.railAim >= 0 || rng.chance(P.railGamble))) give('rail');

  // Move: get to the wanted range nose-first, turn away to open, then settle into the preferred
  // face: bow-on ships stop, broadside ships cruise across the bearing. Not while the rail aims:
  // a new heading throws the aim away.
  if (!me.orders.run && me.railAim < 0) {
    let wantOpen = P.range === 'open';
    if (P.openWhenNoPdc && !alive(me, 'pdc') && (alive(me, 'rail') || me.torps > 0)) wantOpen = true;
    else if (P.openWhenNoPdc && mine < yours - 2) wantOpen = true;
    if (!alive(you, 'drive')) wantOpen = false; // a drifting cripple gets finished, not avoided
    const err = b.range() - (wantOpen ? N.RANGE_OPEN : N.RANGE_CLOSE);
    const bearing = Math.atan2(you.y - me.y, you.x - me.x);
    let heading, speed;
    const r = b.range();
    // Stern to the answer: after a salvo, or with their torpedoes coming, swing the stern to them
    // and hold the range. The drive and the plated tubes take the hits, not rail and sensors (a
    // bow-on salvo took both at once). Swing back when the tubes are nearly loaded: 180 degrees is
    // two FACE_TURN_TIMEs. Not inside PDC range, where one turret and a bare drive lose the knife
    // fight; not while they go for the drive (the bracket on our silhouette says so): a stern-on
    // ship that loses its drive is a hulk facing the wrong way, and never fires again; not with
    // no salvo left to protect.
    const incomingTorps = b.projectiles.some((p) => p.kind === 'torp' && p.target === me.id && !p.dead);
    const sternTo = P.sternAfterSalvo && alive(me, 'tubes') && me.torps > 0 && r > N.PDC_RANGE
      && you.target !== 'drive' && (incomingTorps || me.torpReload > 2 * N.FACE_TURN_TIME);
    if (sternTo) { heading = bearing + Math.PI; speed = 0; }
    else if (err > N.RANGE_TOLERANCE) { heading = bearing; speed = N.MAX_SPEED; }
    else if (err < -N.RANGE_TOLERANCE && r > N.PDC_RANGE) { heading = bearing + Math.PI; speed = N.MAX_SPEED; } // never show the tail inside PDC range
    else {
      const face = P.face === 'auto' ? 'side' : P.face;
      heading = face === 'side' ? bearing + Math.PI / 2 : bearing;
      speed = face === 'side' ? N.MAX_SPEED * 0.5 : 0; // broadside ships cruise across, end-on ships stop
    }
    const off = Math.abs(angleDiff(heading, me.headingTarget)) * 180 / Math.PI;
    if (me.move.coast || off > N.AI_HEADING_TOL || Math.abs(me.move.speed - speed) > 0.001) give('move', { heading, speed });
  }
}
