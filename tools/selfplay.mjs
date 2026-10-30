// Headless check: enemy AI plays both sides over 20 seeds.
// Prints length and result per battle and verifies determinism.
// Run: node tools/selfplay.mjs
import { makeBattle } from '../src/sim/battle.js';
import { makeEnemy } from '../src/ai/enemy.js';
import { N } from '../src/numbers.js';
import { alivePieces } from '../src/sim/ship.js';

function run(seed) {
  const b = makeBattle(seed);
  const a1 = makeEnemy('me'), a2 = makeEnemy('them');
  while (!b.result) { a1.step(b, N.DT); a2.step(b, N.DT); b.step(N.DT); b.events.length = 0; }
  return b;
}
const tally = {}; let total = 0;
for (let seed = 1; seed <= 20; seed++) {
  const b = run(seed);
  const k = `${b.result.kind}:${b.result.reason}`;
  tally[k] = (tally[k] || 0) + 1; total += b.t;
  console.log(String(seed).padStart(2), `${b.t.toFixed(0)}s`.padStart(5), k.padEnd(16),
    'pieces', alivePieces(b.ships[0]).length, alivePieces(b.ships[1]).length);
}
console.log(tally, 'avg', (total / 20).toFixed(0) + 's');
const a = run(7), c = run(7);
console.log('deterministic:', JSON.stringify([a.t, a.result, a.log]) === JSON.stringify([c.t, c.result, c.log]));
