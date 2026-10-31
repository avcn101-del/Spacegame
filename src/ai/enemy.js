// The enemy: same orders as the player, from a small rule table shaped by a preset.
// Thinks once per AI_TICK seconds. Uses the battle's seeded rng.
import { N } from '../numbers.js';
import { alivePieces, alive, pdcCount } from '../sim/ship.js';
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
      think(b, P, me, b.enemyOf(me), (o) => orders.push(o), rng);
      return orders;
    },
    apply(b, orders) { if (orders) for (const o of orders) b.order(shipId, o); },
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

  // PDC mode.
  if (P.pdc === 'auto') {
    const incoming = b.projectiles.some((p) => p.kind === 'torp' && p.target === me.id);
    give(incoming ? 'guard' : 'rake');
  } else give(P.pdc);

  // Torpedoes.
  if (P.torps === 'always' || (P.torps === 'guardDown' && pdcCount(you) === 0)) give('torps');

  // Railgun: sure shot when they cannot dodge (no burns, or aiming themselves); otherwise a gamble.
  if (you.burns === 0 || you.railAim >= 0 || rng.chance(P.railGamble)) give('rail');

  // Range.
  if (P.openWhenNoPdc && pdcCount(me) === 0 && (alive(me, 'rail') || me.torps > 0)) give('open');
  else if (mine < yours - 2 && P.openWhenNoPdc) give('open');
  else give(P.range);
}
