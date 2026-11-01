// Game loop. Owns time: real dt, active pause, slow-mo beats, fixed sim steps.
// Wires sim, enemy, renderers and HUD. No game rules live here.
import { N } from './numbers.js';
import { T, roomKey } from './text.js';
import { makeBattle } from './sim/battle.js';
import { makeEnemy } from './ai/enemy.js';
import { makeTactical } from './render/canvas.js';
import { makeCloseup } from './render/closeup.js';
import { makeHud } from './render/hud.js';
import { renderDpr } from './render/look.js';
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
// Two views, one at a time (the VIEW button). TAC: the map over the whole screen, a camera that fits both ships
// (drag to steer, tap their mark to pick a target). CLOSE-UP: the world stage on top (the anchored camera that keeps
// every projectile in frame) and the cutaway dock below (both hulls, tap a room). PR 55 brought TAC back: a strip
// a hundred-odd px tall cannot show 12 km of vertical separation at a readable scale.
const cssPx = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const tactical = makeTactical(document.getElementById('tactical'), {
  // the part of the screen not covered by HUD; the camera fits the ships in here
  inset: () => ({ top: cssPx('--top'), bottom: cssPx('--bottom') + cssPx('--status'), left: 8, right: 8 }),
});
const closeup = makeCloseup(document.getElementById('closeup'));
const cuWorld = makeTactical(document.getElementById('cu-world'), {
  inset: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), camera: 'engage', quiet: true,
  maxScale: 90, markPx: [36, 48], // knife range reads closer; big top-down hull marks
});
// Events and draws go only to the view on show, so a hidden view never replays old effects.
const VIEWS = { tac: [tactical], closeup: [cuWorld, closeup] };
let view = 'tac'; // the opening view: battles start at long range

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
  document.body.classList.toggle('tac', v === 'tac');
  hud.setView(v);
  if (battle) for (const r of VIEWS[v]) r.reset(battle); // nothing frozen while hidden replays
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
  for (const r of [tactical, cuWorld, closeup]) r.reset(battle); // nothing from the last battle carries over (camera, fx)
  window.game = { battle, tactical, closeup, cuWorld, setView, view: () => view, exportReplay: () => exportReplay(battle), perf }; // for debugging and tests
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
  return { frames: perfGap.length, view, dpr: window.devicePixelRatio || 1, renderDpr: renderDpr(), frameAvg: r1(avg(perfGap)), frameP95: r1(pct(perfGap, 0.95)), fps: r1(1000 / (avg(perfGap) || 1)), workAvg: r1(avg(perfWork)), workP95: r1(pct(perfWork, 0.95)) };
}
perf.reset = () => { perfGap.length = 0; perfWork.length = 0; };
const perfPush = (a, v) => { a.push(v); if (a.length > PERF_N) a.shift(); };
// ?perf=1: perf() as one line over the CLOCK / RANGE corner of the header, once a second, so a phone
// run gives the number. Tap it to reset the window. Debug only: no element, timer or style without the flag.
// It sits inside the header band (display-only numbers), so it covers no button and no part of the stage.
if (params.get('perf') === '1') {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;z-index:20;max-width:380px;height:14px;padding:0 6px;'
    + 'font:10px/14px "SF Mono",Menlo,Consolas,monospace;color:#9fe0b0;background:rgba(5,7,12,0.7);'
    + 'white-space:nowrap;overflow:hidden;cursor:pointer;';
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); perf.reset(); el.textContent = 'perf reset'; });
  document.body.appendChild(el);
  setInterval(() => {
    const p = perf();
    el.textContent = `dpr ${r1(p.dpr)}→${r1(p.renderDpr)} · work95 ${p.workP95} · frame95 ${p.frameP95} ms · ${p.fps} fps · ${p.frames} f`;
  }, 1000);
}

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
  // Drain events to renderers; slow-mo on the big beats.
  for (const ev of battle.events) {
    const frameDead = ev.type === 'pieceDead' && isFrame(ev.piece); // a frame room dying is a flash, not a beat or a line
    if (ev.type === 'railHit' || (ev.type === 'pieceDead' && !frameDead)) slowmo = N.SLOWMO_TIME;
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

// Drag on the world stage: a move order.
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
// TAC has no dock: a tap on their mark picks the next standing room of theirs as the target, in their room order
// (rail, sensors, the PDC mounts, bridge, crew, tubes, drive), round again after the last. Same order and toasts as
// a dock tap. A tap anywhere else on the map does nothing; a drag still steers.
const TAP_MARK_PX = 24; // px round their mark that counts as a tap on it: a fingertip on a 14 px mark
attachTap(document.getElementById('tactical'), (x, y) => {
  if (view !== 'tac') return;
  const q = tactical.shipScreen('them');
  if (!q || Math.hypot(x - q.x, y - q.y) > TAP_MARK_PX) return;
  const me = battle.ships[0], them = battle.ships[1];
  const rooms = them.roomOrder.filter((r) => them.pieces[r].alive);
  if (rooms.length) tapThem(rooms[(rooms.indexOf(me.target) + 1) % rooms.length]);
});
// The dock: taps only (a drag that starts here never steers).
attachTap(document.getElementById('closeup'), (x, y) => {
  const hit = closeup.roomAt(x, y);
  if (!hit) return;
  if (hit.side === 'them') tapThem(hit.room); else tapMine(hit.room);
});

setView(view);
start();
requestAnimationFrame(frame);
