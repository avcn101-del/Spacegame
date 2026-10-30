// Game loop. Owns time: real dt, active pause, slow-mo beats, fixed sim steps.
// Wires sim, enemy, renderers and HUD. No game rules live here.
import { N } from './numbers.js';
import { T } from './text.js';
import { makeBattle } from './sim/battle.js';
import { makeEnemy } from './ai/enemy.js';
import { makeTactical, makeSilhouettePanel } from './render/canvas.js';
import { makeHud } from './render/hud.js';

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || (Date.now() % 100000); // seed choice is outside the sim

let battle, enemy, paused = false, slowmo = 0, acc = 0;
const tactical = makeTactical(document.getElementById('tactical'));
const panelMe = makeSilhouettePanel(document.getElementById('sil-me'), 'me');
const panelThem = makeSilhouettePanel(document.getElementById('sil-them'), 'them');
const renderers = [tactical, panelMe, panelThem];

const hud = makeHud({
  onOrder(o) {
    const why = battle.order('me', o);
    if (why) hud.toast(T.refusal[why]);
    else if (o === 'torps') hud.toast(T.order.torpsAway);
    else if (o === 'burn') hud.toast(T.order.burn);
  },
  onPause() { paused = !paused; },
  onAgain() { seed = (seed * 7919 + 13) % 100000; start(); },
  onSame() { start(); },
});

function start() {
  battle = makeBattle(seed);
  enemy = makeEnemy('them');
  paused = false; slowmo = 0; acc = 0;
  history.replaceState(null, '', `?seed=${seed}`);
}

let last = performance.now();
function frame(now) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  const scale = slowmo > 0 ? N.SLOWMO_SCALE : 1;
  if (slowmo > 0) slowmo -= dtReal;
  const dtGame = paused || battle.result ? 0 : dtReal * scale;
  acc += dtGame;
  let steps = 0;
  while (acc >= N.DT && steps < 8) {
    enemy.step(battle, N.DT);
    battle.step(N.DT);
    acc -= N.DT; steps++;
  }
  // Drain events to renderers; slow-mo on the big beats.
  for (const ev of battle.events) {
    if (ev.type === 'railHit' || ev.type === 'pieceDead') slowmo = N.SLOWMO_TIME;
    for (const r of renderers) r.onEvent(ev);
  }
  battle.events.length = 0;
  for (const r of renderers) r.draw(battle, dtGame);
  hud.draw(battle, paused, dtReal);
  requestAnimationFrame(frame);
}

start();
requestAnimationFrame(frame);
