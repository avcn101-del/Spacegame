// Game loop. Owns time: real dt, active pause, slow-mo beats, fixed sim steps.
// Wires sim, enemy, renderers and HUD. No game rules live here.
import { N } from './numbers.js';
import { T } from './text.js';
import { makeBattle } from './sim/battle.js';
import { makeEnemy } from './ai/enemy.js';
import { makeTactical, makeSilhouettePanel } from './render/canvas.js';
import { makeHud } from './render/hud.js';
import { exportReplay, makeReplayer, parseReplay } from './sim/replay.js';
import { PRESETS, DEFAULT_PRESET } from './ai/presets.js';
import { attachDrag } from './input/drag.js';
import { attachTap } from './input/tap.js';

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || (Date.now() % 100000); // seed choice is outside the sim
const enemyPreset = PRESETS[params.get('enemy')] ? params.get('enemy') : DEFAULT_PRESET; // ?enemy=sniper
let replayer = null; // set while watching a recorded battle
let autoPreset = PRESETS[params.get('auto')] ? params.get('auto') : null; // ?auto=brawler: the AI flies my ship
let autoPilot = null;

let battle, enemy, paused = false, slowmo = 0, acc = 0;
const cssPx = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const tactical = makeTactical(document.getElementById('tactical'), {
  // the part of the screen not covered by HUD; the camera fits the ships in here
  inset: () => ({ top: cssPx('--top'), bottom: cssPx('--bottom') + 26, left: cssPx('--side') + 8, right: cssPx('--side') + 8 }),
});
const panelMe = makeSilhouettePanel(document.getElementById('sil-me'), 'me', { orientation: 'vertical' });
const panelThem = makeSilhouettePanel(document.getElementById('sil-them'), 'them', { orientation: 'vertical' });
const renderers = [tactical, panelMe, panelThem];

const hud = makeHud({
  onOrder(o, arg) {
    if (replayer || autoPilot) return;
    const why = battle.order('me', o, arg);
    if (why) hud.toast(T.refusal[why]);
    else if (o === 'torps') hud.toast(T.order.torpsAway);
    else if (o === 'burn') hud.toast(T.order.burn);
  },
  onPause() { paused = !paused; },
  onResume() { paused = false; },
  onRestart() { start(); },
  onNew() { seed = (seed * 7919 + 13) % 100000; start(); },
  onExport() {
    const data = exportReplay(battle, { enemy: enemyPreset, auto: autoPreset, exportedAt: new Date().toISOString() });
    hud.showExport(JSON.stringify(data));
  },
  onDownload() {
    const text = document.getElementById('export-text').value;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `battle-${battle.seed}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  onAuto() {
    autoPreset = autoPreset ? null : DEFAULT_PRESET;
    autoPilot = autoPreset ? makeEnemy('me', autoPreset) : null;
    hud.setAuto(!!autoPilot);
    paused = false;
  },
  onImport() {
    const text = prompt(T.importPrompt);
    if (!text) return;
    try { start(parseReplay(text)); } catch (e) { hud.toast(T.importBad); }
  },
});

// start() begins a fresh battle; start(replay) watches a recorded one.
function start(replay = null) {
  if (replay) seed = replay.seed;
  battle = makeBattle(seed);
  battle.enemyPreset = enemyPreset;
  enemy = makeEnemy('them', enemyPreset);
  replayer = replay ? makeReplayer(replay) : null;
  autoPilot = autoPreset && !replayer ? makeEnemy('me', autoPreset) : null;
  hud.setReplay(!!replayer);
  hud.setAuto(!!autoPilot);
  paused = false; slowmo = 0; acc = 0;
  history.replaceState(null, '', `?seed=${seed}${enemyPreset !== DEFAULT_PRESET ? `&enemy=${enemyPreset}` : ''}`);
  window.game = { battle, tactical, panels: { me: panelMe, them: panelThem }, exportReplay: () => exportReplay(battle) }; // for debugging and tests
}

// Phones: on the first touch, go fullscreen and ask for landscape. Best effort only.
document.addEventListener('pointerdown', function once() {
  document.removeEventListener('pointerdown', once);
  const el = document.documentElement;
  const fs = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : Promise.reject();
  Promise.resolve(fs).catch(() => {}).then(() => {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  });
}, { once: false });

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
    if (replayer) replayer.step(battle);
    else {
      // both AIs decide on the same state, then both act: fair
      const o1 = autoPilot ? autoPilot.decide(battle, N.DT) : null;
      const o2 = enemy.decide(battle, N.DT);
      if (autoPilot) autoPilot.apply(battle, o1);
      enemy.apply(battle, o2);
    }
    battle.step(N.DT);
    acc -= N.DT; steps++;
  }
  // Drain events to renderers; slow-mo and panel pop on the big beats.
  for (const ev of battle.events) {
    if (ev.type === 'railHit' || ev.type === 'pieceDead') slowmo = N.SLOWMO_TIME;
    if (ev.type === 'railHit' || ev.type === 'torpHit' || ev.type === 'pieceDead') hud.hit(ev.ship);
    for (const r of renderers) r.onEvent(ev);
  }
  battle.events.length = 0;
  for (const r of renderers) r.draw(battle, dtGame);
  hud.draw(battle, paused, dtReal);
  requestAnimationFrame(frame);
}

attachDrag(document.getElementById('tactical'), tactical, () => battle, (arg) => {
  if (replayer || autoPilot) return;
  const why = battle.order('me', 'move', arg);
  if (why) hud.toast(T.refusal[why]);
});

// Tap a room on their ship: go for it (tap again to clear). Tap a room on ours: what it does.
attachTap(document.getElementById('sil-them'), (x, y) => {
  if (replayer || autoPilot) return;
  const room = panelThem.roomAt(x, y);
  if (!room) return;
  const me = battle.ships[0];
  const arg = { room: me.target === room ? null : room };
  const why = battle.order('me', 'target', arg);
  if (why) hud.toast(T.refusal[why]);
  else hud.toast(arg.room ? `${T.order.target} ${T.pieces[room].toLowerCase()}.` : T.order.targetCleared);
});
attachTap(document.getElementById('sil-me'), (x, y) => {
  const room = panelMe.roomAt(x, y);
  if (!room) return;
  const pc = battle.ships[0].pieces[room];
  hud.toast(`${T.pieces[room]} ${Math.ceil(pc.hp)}/${pc.maxHp}. ${T.roomInfo[room]}`);
});

start();
requestAnimationFrame(frame);
