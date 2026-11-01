// Game loop. Owns time: real dt, active pause, slow-mo beats, fixed sim steps.
// Wires sim, enemy, renderers and HUD. No game rules live here.
import { N } from './numbers.js';
import { T, roomKey } from './text.js';
import { makeBattle } from './sim/battle.js';
import { makeEnemy } from './ai/enemy.js';
import { makeTactical, makeSilhouettePanel } from './render/canvas.js';
import { makeCloseup } from './render/closeup.js';
import { makeHud } from './render/hud.js';
import { exportReplay, makeReplayer, parseReplay } from './sim/replay.js';
import { PRESETS, DEFAULT_PRESET } from './ai/presets.js';
import { DESIGNS, DEFAULT_DESIGN } from './ships/index.js';
import { parseFit, fitString, DEFAULT_FIT } from './ships/catalog.js';
import { makeShip } from './sim/ship.js';
import { attachDrag } from './input/drag.js';
import { attachTap } from './input/tap.js';

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || (Date.now() % 100000); // seed choice is outside the sim
// The enemy: the URL wins (?enemy=sniper, ?enemy=gunship), else the last one picked in the hangar on this phone.
const storedEnemy = (() => { try { return localStorage.getItem('enemy'); } catch (e) { return null; } })();
let enemyPreset = [params.get('enemy'), storedEnemy].find((k) => PRESETS[k]) || DEFAULT_PRESET;
const myShip = DESIGNS[params.get('ship')] ? params.get('ship') : DEFAULT_DESIGN; // ?ship=belter: fly the gunship yourself
// The fit from the hangar: the URL wins, else the last one chosen on this phone, else stock.
const storedFit = (() => { try { return localStorage.getItem('fit'); } catch (e) { return null; } })();
let myFit = parseFit(params.has('fit') ? params.get('fit') : storedFit);
let replayer = null; // set while watching a recorded battle
let autoPreset = PRESETS[params.get('auto')] ? params.get('auto') : null; // ?auto=brawler: the AI flies my ship
let autoPilot = null;

let battle, enemy, paused = false, slowmo = 0, acc = 0;
const cssPx = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const tactical = makeTactical(document.getElementById('tactical'), {
  // the part of the screen not covered by HUD; the camera fits the ships in here
  inset: () => ({ top: cssPx('--top'), bottom: cssPx('--bottom') + cssPx('--status'), left: cssPx('--side') + 8, right: cssPx('--side') + 8 }),
});
const panelMe = makeSilhouettePanel(document.getElementById('sil-me'), 'me', { orientation: 'vertical' });
const panelThem = makeSilhouettePanel(document.getElementById('sil-them'), 'them', { orientation: 'vertical' });
const closeup = makeCloseup(document.getElementById('closeup'));
// The close-up's world stage: the same map as TAC (same drag), a camera that keeps every projectile in frame.
const cuWorld = makeTactical(document.getElementById('cu-world'), {
  inset: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), camera: 'engage', quiet: true,
  maxScale: 90, markPx: [36, 48], // knife range reads closer; big top-down hull marks (TAC keeps its own)
});
// One view at a time (button only): TAC is the map and both panels, CLOSE-UP the stage that covers them.
// Events and draws go only to the view on show, so a hidden view never replays old effects.
const VIEWS = { tac: [tactical, panelMe, panelThem], closeup: [cuWorld, closeup] };
let view = 'tac';

const hud = makeHud({
  onOrder(o, arg) {
    if (replayer || autoPilot) return;
    const why = battle.order('me', o, arg);
    if (why) hud.toast(T.refusal[why], 2.2, 'no');
    else if (o === 'torps') hud.toast(T.order.torpsAway);
    else if (o === 'burn') hud.toast(T.order.burn);
  },
  onView() { setView(view === 'tac' ? 'closeup' : 'tac'); },
  onPause() { paused = !paused; },
  onHelp() { paused = true; },
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
  onFit(fit, foe) {
    myFit = { ...DEFAULT_FIT, ...fit };
    if (PRESETS[foe]) enemyPreset = foe;
    try { localStorage.setItem('fit', fitString(myFit)); localStorage.setItem('enemy', enemyPreset); } catch (e) { /* no storage: the URL still carries it */ }
    start();
  },
  // The hangar's drawing: the ship I would fly with this fit (a throwaway, not the battle's).
  presets: PRESETS,
  preview(fit) { return makeShip('me', T.ships.me, 0, +1, DESIGNS[myShip], { ...DEFAULT_FIT, ...fit }); },
  onImport() {
    const text = prompt(T.importPrompt);
    if (!text) return;
    try { start(parseReplay(text)); } catch (e) { hud.toast(T.importBad); }
  },
});

function setView(v) {
  view = v;
  document.body.classList.toggle('closeup', v === 'closeup');
  hud.setView(v);
  if (battle) for (const r of VIEWS[v]) if (r.reset) r.reset(battle); // nothing frozen while hidden replays
}

// start() begins a fresh battle; start(replay) watches a recorded one.
function start(replay = null) {
  if (replay) seed = replay.seed;
  battle = makeBattle(seed, replay ? replay.ships : { me: { design: myShip, fit: myFit }, them: { design: PRESETS[enemyPreset].ship } });
  hud.setFit(battle.designs.me.fit);
  hud.setEnemy(enemyPreset);
  battle.enemyPreset = enemyPreset;
  enemy = makeEnemy('them', enemyPreset);
  replayer = replay ? makeReplayer(replay) : null;
  autoPilot = autoPreset && !replayer ? makeEnemy('me', autoPreset) : null;
  hud.setReplay(!!replayer);
  hud.setAuto(!!autoPilot);
  paused = false; slowmo = 0; acc = 0;
  const fitQ = fitString(battle.designs.me.fit);
  history.replaceState(null, '', `?seed=${seed}${enemyPreset !== DEFAULT_PRESET ? `&enemy=${enemyPreset}` : ''}${myShip !== DEFAULT_DESIGN ? `&ship=${myShip}` : ''}${fitQ ? `&fit=${fitQ}` : ''}`);
  closeup.reset(battle);
  window.game = { battle, tactical, closeup, cuWorld, setView, panels: { me: panelMe, them: panelThem }, exportReplay: () => exportReplay(battle), perf }; // for debugging and tests
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

const isFrame = (room) => room.startsWith('frame:');

// game.perf(): frame interval and render work over the last PERF_N frames, ms (avg and p95), so a phone
// check gives a number. game.perf.reset() starts a fresh window. Debug only: reads clocks, never the sim.
const PERF_N = 600, perfGap = [], perfWork = [];
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v) => Math.round(v * 10) / 10;
function perf() {
  return { frames: perfGap.length, view, dpr: window.devicePixelRatio || 1, frameAvg: r1(avg(perfGap)), frameP95: r1(pct(perfGap, 0.95)), fps: r1(1000 / (avg(perfGap) || 1)), workAvg: r1(avg(perfWork)), workP95: r1(pct(perfWork, 0.95)) };
}
perf.reset = () => { perfGap.length = 0; perfWork.length = 0; };
const perfPush = (a, v) => { a.push(v); if (a.length > PERF_N) a.shift(); };

let last = performance.now();
function frame(now) {
  const t0 = performance.now();
  perfPush(perfGap, now - last);
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
    const frameDead = ev.type === 'pieceDead' && isFrame(ev.piece); // a frame room dying is a flash, not a beat or a line
    if (ev.type === 'railHit' || (ev.type === 'pieceDead' && !frameDead)) slowmo = N.SLOWMO_TIME;
    if (ev.type === 'railHit' || ev.type === 'torpHit' || (ev.type === 'pieceDead' && !frameDead)) hud.hit(ev.ship);
    if (ev.type === 'pieceDead' && ev.cause !== 'tear' && !frameDead) hud.toast(`${T.lost[ev.ship]} ${T.pieces[roomKey(ev.piece)].toUpperCase()} ${T.gone}: ${T.roomDead[roomKey(ev.piece)]}.`, 3.2, 'event');
    if (ev.type === 'tear') {
      const names = [...new Set(ev.pieces.map((r) => T.pieces[roomKey(r)].toLowerCase()))]; // frame rooms and PDC mounts fold into one word each
      hud.toast(ev.pieces.every(isFrame)
        ? `${T.lost[ev.ship]} ${T.frameAdrift}.`
        : `${T.lost[ev.ship]} ${T.tear[ev.end]}: ${names.join(', ')} ${T.adrift}.`, 4, 'event');
    }
    for (const r of VIEWS[view]) r.onEvent(ev);
  }
  battle.events.length = 0;
  for (const r of VIEWS[view]) r.draw(battle, dtGame);
  hud.draw(battle, paused, dtReal);
  perfPush(perfWork, performance.now() - t0);
  requestAnimationFrame(frame);
}

// One move dispatch for both maps: TAC and the close-up's world stage (same drag, same rules).
function move(arg) {
  if (replayer || autoPilot) return;
  const why = battle.order('me', 'move', arg);
  if (why) hud.toast(T.refusal[why], 2.2, 'no');
}
attachDrag(document.getElementById('tactical'), tactical, () => battle, (arg) => { if (view === 'tac') move(arg); });
attachDrag(document.getElementById('cu-world'), cuWorld, () => battle, (arg) => { if (view === 'closeup') move(arg); });

// What a room does, in one line; every PDC mount shares the one line.
const roomInfo = (room) => T.roomInfo[roomKey(room)];
// Tap a room on their ship: go for it (tap again to clear). Tap a room on ours: what it does.
function tapThem(room) {
  if (replayer || autoPilot || !room) return;
  const me = battle.ships[0], pc = battle.ships[1].pieces[room];
  const info = `${T.pieces[roomKey(room)]} ${Math.ceil(pc.hp)}/${pc.maxHp}. ${roomInfo(room)}`;
  const arg = { room: me.target === room ? null : room };
  const why = battle.order('me', 'target', arg);
  if (why) hud.toast(`${T.refusal[why]} ${info}`, 2.4, 'no');
  else hud.toast(arg.room ? `${T.order.target} ${T.pieces[roomKey(room)].toLowerCase()}. ${info}` : `${T.order.targetCleared} ${info}`);
}
function tapMine(room) {
  if (!room) return;
  const pc = battle.ships[0].pieces[room];
  hud.inspect(room); closeup.setInspect(room);
  hud.toast(`${T.pieces[roomKey(room)]} ${Math.ceil(pc.hp)}/${pc.maxHp}. ${roomInfo(room)}`, 3, 'event');
}
attachTap(document.getElementById('sil-them'), (x, y) => tapThem(panelThem.roomAt(x, y)));
attachTap(document.getElementById('sil-me'), (x, y) => tapMine(panelMe.roomAt(x, y)));
// The dock: taps only (a drag that starts here never steers).
attachTap(document.getElementById('closeup'), (x, y) => {
  const hit = closeup.roomAt(x, y);
  if (!hit) return;
  if (hit.side === 'them') tapThem(hit.room); else tapMine(hit.room);
});

hud.setView(view);
start();
requestAnimationFrame(frame);
