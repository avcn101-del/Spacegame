// Headless arena: preset vs preset over many seeds. The balance tool.
// Run: node tools/arena.mjs [me=brawler] [them=sniper] [seeds=100]
// Or:  node tools/arena.mjs all            (every preset against every preset)
import { makeBattle } from '../src/sim/battle.js';
import { makeEnemy } from '../src/ai/enemy.js';
import { PRESETS } from '../src/ai/presets.js';
import { N } from '../src/numbers.js';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split('=')));
const seeds = Number(args.seeds || 100);

function fight(meP, themP, seed) {
  const b = makeBattle(seed);
  const a1 = makeEnemy('me', meP), a2 = makeEnemy('them', themP);
  while (!b.result) { const o1 = a1.decide(b, N.DT), o2 = a2.decide(b, N.DT); a1.apply(b, o1); a2.apply(b, o2); b.step(N.DT); b.events.length = 0; }
  return b;
}

function series(meP, themP) {
  const r = { win: 0, lose: 0, draw: 0, escaped: 0, time: 0, min: Infinity, max: 0 };
  for (let s = 1; s <= seeds; s++) {
    const b = fight(meP, themP, s);
    r[b.result.kind]++; r.time += b.t; r.min = Math.min(r.min, b.t); r.max = Math.max(r.max, b.t);
  }
  return r;
}

const fmt = (r) => `win ${String(r.win).padStart(3)}  lose ${String(r.lose).padStart(3)}  draw ${String(r.draw).padStart(3)}  esc ${String(r.escaped).padStart(3)}  avg ${(r.time / seeds).toFixed(0).padStart(4)}s  ${r.min.toFixed(0)}..${r.max.toFixed(0)}s`;

if (process.argv.includes('all')) {
  const names = Object.keys(PRESETS);
  for (const a of names) for (const c of names) console.log(`${a.padEnd(10)} vs ${c.padEnd(10)} ${fmt(series(a, c))}`);
} else {
  const me = args.me || 'brawler', them = args.them || 'brawler';
  console.log(`${me} vs ${them}, ${seeds} seeds`);
  console.log(fmt(series(me, them)));
}
