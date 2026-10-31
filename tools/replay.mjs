// Replay a battle JSON headless and print its stats and timeline.
// Run: node tools/replay.mjs battle-12345.json
import { readFileSync } from 'node:fs';
import { makeBattle } from '../src/sim/battle.js';
import { makeReplayer, parseReplay, exportReplay } from '../src/sim/replay.js';
import { N } from '../src/numbers.js';

const r = parseReplay(readFileSync(process.argv[2], 'utf8'));
const b = makeBattle(r.seed);
const rp = makeReplayer(r);
while (!b.result && b.t < N.BATTLE_MAX + 1) { rp.step(b); b.step(N.DT); b.events.length = 0; }
const again = exportReplay(b);
console.log('seed', r.seed, 'recorded', r.result, 'at', r.t, 's');
console.log('replayed', again.result, 'at', again.t, 's', again.result && r.result && again.result.kind === r.result.kind && Math.abs(again.t - r.t) < 0.05 ? '(matches)' : '(DIFFERS)');
console.log('stats', JSON.stringify(again.stats.me), '\n     ', JSON.stringify(again.stats.them));
console.log('phases', JSON.stringify(again.stats.phaseAt));
for (const e of again.stats.timeline) console.log(`  ${String(e.t).padStart(6)}s  ${e.ship.padEnd(4)} lost ${e.piece.padEnd(6)} to ${e.cause}`);
console.log('orders:');
for (const o of r.log) console.log(`  ${o.t.toFixed(1).padStart(6)}s  ${o.ship.padEnd(4)} ${o.order}`);
