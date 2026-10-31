// The enemy: same six orders as the player, from a small rule table.
// Thinks once per AI_TICK seconds. Uses the battle's seeded rng.
import { N } from '../numbers.js';
import { alivePieces, alive } from '../sim/ship.js';

export function makeEnemy(shipId) {
  let acc = 0;
  return {
    step(b, dt) {
      acc += dt;
      if (acc < N.AI_TICK) return;
      acc -= N.AI_TICK;
      think(b, b.shipById(shipId), b.enemyOf(b.shipById(shipId)));
    },
  };
}

function think(b, me, you) {
  const range = b.range();
  const mine = alivePieces(me).length, yours = alivePieces(you).length;
  const give = (o) => b.order(me.id, o);

  // Run: losing badly and few pieces left.
  if (!me.orders.run && mine <= N.AI_RUN_PIECES && mine < yours) { give('run'); return; }

  // Burn: their railgun is aiming at us.
  if (you.railAim >= 0 && me.burns > 0 && b.rng.chance(N.AI_BURN_CHANCE)) give('burn');

  // PDC: guard when torpedoes are coming, rake otherwise.
  const incoming = b.projectiles.some((p) => p.kind === 'torp' && p.target === me.id);
  give(incoming ? 'guard' : 'rake');

  // Torpedoes: fire when loaded and in range.
  give('torps');

  // Railgun: sure shot when they cannot dodge (no burns, or aiming themselves); otherwise a gamble.
  if (you.burns === 0 || you.railAim >= 0 || b.rng.chance(N.AI_RAIL_GAMBLE)) give('rail');

  // Range: close when healthy or winning, open when behind and PDCs are gone.
  const pdcs = (alive(me, 'pdcL') ? 1 : 0) + (alive(me, 'pdcR') ? 1 : 0);
  if (pdcs === 0 && (alive(me, 'rail') || me.torps > 0)) give('open');
  else if (mine < yours - 2) give('open');
  else give('close');
}
