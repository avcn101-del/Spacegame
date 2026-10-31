// HUD: four numbers, phase, current order line, nine buttons with hints,
// pause menu with legend, result. Reads battle state; sends orders through callbacks.
import { N } from '../numbers.js';
import { T, roomKey } from '../text.js';
import { alive, exposure, canFireTubes, canAimRail, pdcAlive } from '../sim/ship.js';
import { CATALOG } from '../ships/catalog.js';
import { ROOM_COLORS } from './form.js';
import { railKm } from './arcs.js';
import { drawHangar, hitAt, roomAtCell } from './hangar.js';

const $ = (sel) => document.querySelector(sel);
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const SLOTS_OF = { rail: 1, tubes: 1, drive: 1 }; // rooms that have a pick
const ROOM_OF = { gun: 'rail', launcher: 'tubes', drive: 'drive' };
const tap = (sel, fn) => $(sel).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });

export function makeHud({ onOrder, onPause, onResume, onRestart, onNew, onExport, onImport, onAuto, onDownload, onFit, preview, presets }) {
  const el = {
    clock: $('#n-clock'), range: $('#n-range'), rate: $('#n-rate'), torps: $('#n-torps'), burns: $('#n-burns'),
    phase: $('#phase'), order: $('#order'), pause: $('#pause'),
    pausemenu: $('#pausemenu'), result: $('#result'), resultText: $('#result-text'), resultSeed: $('#result-seed'),
    panels: { me: $('#panel-me'), them: $('#panel-them') },
    buttons: {},
  };
  for (const o of Object.keys(T.buttons)) {
    const b = $(`#btn-${o}`);
    el.buttons[o] = b;
    b.querySelector('.label').textContent = T.buttons[o];
    b.querySelector('.hint').textContent = T.hints[o];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onOrder(o); });
  }
  tap('#pause', onPause);
  tap('#pm-resume', onResume); tap('#pm-restart', onRestart); tap('#pm-new', onNew);
  tap('#again', onNew); tap('#same', onRestart);
  for (const id of ['#pm-export', '#rs-export']) { tap(id, onExport); $(id).textContent = T.export; }
  for (const id of ['#pm-import', '#rs-import']) { tap(id, onImport); $(id).textContent = T.import; }
  tap('#pm-auto', onAuto);
  // The hangar: the ship's form (preview(fit) builds it), a tap on a marked part toggles that slot's
  // variant; LAUNCH hands the fit back and starts a new battle. No pick rows: every slot is on the drawing.
  let fit = {}, sel = null, hits = [], foe = null, note = null, shown = null; // note: the room last tapped; shown: {ship, W, H} last drawn // foe: the enemy preset picked here
  for (const id of ['#pm-hangar', '#rs-hangar']) { tap(id, () => api.showHangar(fit)); $(id).textContent = T.hangar.button; }
  $('#hg-title').textContent = T.hangar.title; $('#hg-launch').textContent = T.hangar.launch; $('#hg-close').textContent = T.hangar.close;
  const cv = $('#hg-canvas');
  // A tap on a hardpoint opens a list of that slot's variants (an HTML element over the canvas, rows
  // 40 px tall); a row picks, redraws and closes; a tap anywhere else closes it.
  const list = $('#hg-list');
  const closeList = () => { list.classList.remove('show'); list.textContent = ''; };
  // The enemy pick: the same list, its rows the AI presets, above the button row.
  const markFoe = () => { $('#hg-enemy').textContent = `${T.hangar.enemy}: ${(T.enemies[foe] || { name: foe }).name.toUpperCase()}`; };
  const openFoes = () => {
    list.textContent = '';
    for (const key of Object.keys(presets)) {
      const c = T.enemies[key] || { name: key, line: '' }, row = document.createElement('div');
      row.className = 'opt' + (foe === key ? ' cur' : '');
      row.innerHTML = `<b>${c.name}</b> <i>${T.enemyStats(presets[key])}</i><span>${c.line}</span>`;
      row.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); foe = key; closeList(); markFoe(); });
      list.appendChild(row);
    }
    list.classList.add('show');
    const box = list.offsetParent.getBoundingClientRect(), b = $('#hg-enemy').getBoundingClientRect();
    const x = Math.max(0, Math.min(box.width - list.offsetWidth, b.left - box.left));
    list.style.left = `${Math.round(x)}px`; list.style.top = `${Math.round(Math.max(0, b.top - box.top - list.offsetHeight - 4))}px`;
  };
  $('#hg-enemy').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (list.classList.contains('show')) closeList(); else openFoes();
  });
  const openList = (hit) => {
    const slot = hit.slot;
    list.textContent = '';
    for (const key of Object.keys(CATALOG[slot])) {
      const c = T.catalog[key], row = document.createElement('div');
      row.className = 'opt' + (fit[slot] === key ? ' cur' : '');
      row.innerHTML = `<b>${c.name}</b> <i>${T.variantStats[slot](CATALOG[slot][key])}</i><span>${c.line}</span>`;
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        fit = { ...fit, [slot]: key }; sel = slot; note = ROOM_OF[slot]; closeList(); markFit(fit);
      });
      list.appendChild(row);
    }
    list.classList.add('show');
    // beside the hardpoint, kept inside the canvas so LAUNCH and CLOSE stay clear
    const box = list.offsetParent.getBoundingClientRect(), r = cv.getBoundingClientRect();
    const lw = list.offsetWidth, lh = list.offsetHeight;
    let x = r.left - box.left + hit.cx - lw / 2, y = r.top - box.top + hit.y + hit.h + 2;
    if (hit.y + hit.h + 2 + lh > r.height) y = r.top - box.top + hit.y - lh - 2;
    x = Math.max(r.left - box.left, Math.min(r.left - box.left + r.width - lw, x));
    y = Math.max(r.top - box.top, Math.min(r.top - box.top + r.height - lh, y));
    list.style.left = `${Math.round(x)}px`; list.style.top = `${Math.round(y)}px`;
  };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const room = shown ? roomAtCell(shown.ship, px, py, shown.W, shown.H) : null;
    // a cell of a picked room, or void just beside a hardpoint, is the hardpoint; any other cell just says what it does
    const hit = !room || SLOTS_OF[room] ? hitAt(hits, px, py) : null;
    if (!hit && !room) { closeList(); return; }
    sel = hit ? hit.slot : null; note = room || (hit && ROOM_OF[hit.slot]);
    markFit(fit);
    if (hit) openList(hit); else closeList();
  });
  $('#hangar').addEventListener('pointerdown', closeList); // anywhere else (the buttons still act)
  let hangarOpen = false;
  const closeHangar = () => { hangarOpen = false; closeList(); $('#hangar').classList.remove('show'); };
  tap('#hg-close', closeHangar);
  tap('#hg-launch', () => { closeHangar(); onFit(fit, foe); });
  // Redraw the previewed ship for this fit and say what the last tapped slot now holds.
  const markFit = (f) => {
    const ship = preview(f);
    const W = Math.min(660, window.innerWidth - 16), H = Math.max(120, Math.min(260, window.innerHeight - 166));
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hits = drawHangar(ctx, ship, f, sel, W, H); shown = { ship, W, H };
    const lg = T.hangar.arcs(railKm(ship), N.TORP_RANGE, N.PDC_RANGE), col = { rail: 'rail', tubes: 'tubes', pdc: 'pdc' };
    $('#hg-arcs').innerHTML = Object.keys(lg).map((k) => `<span style="color:rgb(${ROOM_COLORS[col[k]]})">${lg[k]}</span>`).join('');
    const c = sel && T.catalog[f[sel]], k = note && roomKey(note);
    const what = k ? `<b>${T.pieces[k].toUpperCase()}</b> ${T.roomInfo[k]}` : '';
    $('#hg-line').innerHTML = c ? `${what} <span>${c.name}. ${c.line}</span>` : k ? what : `<span>${T.hangar.hint}</span>`;
  };
  $('#export-title').textContent = T.exportTitle;
  $('#export-copy').textContent = T.copy; $('#export-download').textContent = T.download; $('#export-close').textContent = T.close;
  tap('#export-close', () => $('#exportbox').classList.remove('show'));
  tap('#export-download', onDownload);
  tap('#export-copy', () => {
    const ta = $('#export-text');
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    const done = () => api.toast(T.copied);
    const fail = () => { try { document.execCommand('copy'); done(); } catch (e) { api.toast(T.copyFailed); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fail); else fail();
  });
  $('#pm-resume').textContent = T.resume; $('#pm-restart').textContent = T.restart; $('#pm-new').textContent = T.newBattle;
  $('#again').textContent = T.again; $('#same').textContent = T.same;
  $('#pm-title').textContent = T.pausedTitle;
  $('#title').textContent = T.title;
  $('#rotate-text').textContent = T.rotate;
  $('#name-me').textContent = T.ships.me; $('#name-them').textContent = T.ships.them;
  for (const k of ['range', 'torps', 'burns', 'clock']) $(`#l-${k}`).textContent = T.numbers[k];
  $('#legend').innerHTML = Object.keys(T.legend)
    .map((o) => `<li><b>${T.buttons[o] || o.toUpperCase()}</b> <span>${T.legend[o]}</span></li>`).join('');

  let toast = null; // {text, ttl}
  const hitTimers = { me: 0, them: 0 };
  let replay = false, auto = false;

  const api = {
    showExport(text) { $('#export-text').value = text; $('#exportbox').classList.add('show'); },
    showHangar(f) { closeList(); fit = { ...f }; sel = null; note = null; hangarOpen = true; $('#hangar').classList.add('show'); markFit(fit); markFoe(); },
    setEnemy(key) { foe = key; },
    setFit(f) { fit = { ...f }; },
    setAuto(on) { auto = on; $('#pm-auto').textContent = on ? T.autoOff : T.auto; document.getElementById('orders').classList.toggle('replay', on || replay); },
    toast(text, ttl = 2.0) { toast = { text, ttl }; },
    // Pop the silhouette panel of a ship that just took a big hit.
    hit(shipId) { hitTimers[shipId] = 0.8; },
    setReplay(on) { replay = on; document.getElementById('orders').classList.toggle('replay', on || auto); },
    draw(battle, paused, dtReal) {
      const me = battle.ships[0], them = battle.ships[1];
      el.clock.textContent = fmtClock(battle.t);
      el.range.textContent = battle.range().toFixed(1);
      const rate = battle.rangeRate();
      if (rate < -0.02) { el.rate.textContent = `▼ ${(-rate).toFixed(2)}`; el.rate.className = 'closing'; }
      else if (rate > 0.02) { el.rate.textContent = `▲ ${rate.toFixed(2)}`; el.rate.className = 'opening'; }
      else { el.rate.textContent = '= steady'; el.rate.className = ''; }
      el.torps.textContent = String(me.torps);
      el.burns.textContent = String(me.burns);
      el.phase.textContent = T.phase[battle.phase];
      el.pause.textContent = paused ? T.resume : T.pause;
      el.pause.classList.toggle('on', paused);
      el.pausemenu.classList.toggle('show', paused && !battle.result && !hangarOpen);

      for (const id of ['me', 'them']) {
        if (hitTimers[id] > 0) hitTimers[id] -= dtReal;
        el.panels[id].classList.toggle('hit', hitTimers[id] > 0);
      }

      // Order line: toast > warning > paused > current orders
      if (toast) { toast.ttl -= dtReal; if (toast.ttl <= 0) toast = null; }
      let line, cls = '';
      if (toast) { line = toast.text; cls = 'toast'; }
      else if (them.railAim >= 0 && alive(them, 'rail')) { line = T.warn.railAimingAtUs; cls = 'warn'; }
      else if (battle.projectiles.some((p) => p.kind === 'torp' && p.target === 'me')) { line = T.warn.torpsIncoming; cls = 'warn'; }
      else if (replay) { line = T.replayLine; cls = 'paused'; }
      else if (paused) { line = T.paused; cls = 'paused'; }
      else {
        const parts = [];
        parts.push(me.turnLeft > 0 ? T.order.turning : T.order[me.face]);
        if (me.orders.run) parts.push(T.order.run);
        else if (me.move.coast) parts.push(`${T.order.hold} ${Math.hypot(me.vx, me.vy).toFixed(2)}`);
        else parts.push(`${T.order[me.move.speed > 0 ? 'flying' : 'stopping']} ${me.move.speed.toFixed(2)}`);
        if (auto) parts.unshift(T.auto);
        parts.push(T.order[me.orders.pdc]);
        if (me.target && alive(them, me.target)) parts.push(`${T.order.target} ${T.pieces[roomKey(me.target)].toLowerCase()}`);
        if (me.railAim >= 0) parts.push(T.order.aiming);
        line = parts.join(' · ');
      }
      el.order.textContent = line; el.order.className = cls;

      // Buttons: state, availability, progress
      const B = el.buttons;
      const range = battle.range();
      for (const o of Object.keys(B)) {
        const active = (o === 'hold' && me.move.coast && !me.orders.run) || o === me.orders.pdc || (o === 'run' && me.orders.run);
        B[o].classList.toggle('active', active);
      }
      setProgress(B.torps, me.torpReload > 0 ? 1 - me.torpReload / me.reloadTime : 1, `${me.torps}`);
      setProgress(B.rail, me.railAim >= 0 ? me.railAim / N.RAIL_AIM_TIME : 1 - me.railCharge / me.railRecharge, me.railAim >= 0 ? 'AIM' : '');
      setProgress(B.burn, 1, `${me.burns}`);
      B.torps.classList.toggle('dead', !alive(me, 'tubes') || me.torps === 0 || exposure(me) === 'tail');
      B.rail.classList.toggle('dead', !canAimRail(me));
      B.rail.classList.toggle('aiming', me.railAim >= 0);
      B.burn.classList.toggle('dead', !alive(me, 'drive') || me.burns === 0);
      for (const o of ['hold', 'run']) B[o].classList.toggle('dead', !alive(me, 'drive'));
      for (const o of ['guard', 'rake']) B[o].classList.toggle('dead', !pdcAlive(me));
      B.torps.classList.toggle('ready', me.torpReload === 0 && range <= N.TORP_RANGE && canFireTubes(me));
      B.rail.classList.toggle('ready', me.railCharge === 0 && me.railAim < 0 && range <= me.railRange && canAimRail(me));

      // Result overlay
      if (battle.result) {
        const r = battle.result;
        el.resultText.textContent = T.result[r.kind][r.reason];
        el.resultSeed.textContent = `${T.seed} ${battle.seed} · ${fmtClock(battle.t)}${battle.enemyPreset ? ` · ${T.enemyLabel} ${battle.enemyPreset}` : ''}`;
        if (!el.result.classList.contains('show')) renderStats(battle.stats);
        el.result.className = hangarOpen ? 'overlay' : 'overlay show ' + r.kind;
      } else {
        el.result.className = 'overlay';
      }
    },
  };
  return api;
}

function setProgress(btn, frac, sub) {
  btn.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`);
  btn.querySelector('.sub').textContent = sub;
}

function renderStats(st) {
  const row = (label, f) => `<tr><th>${label}</th><td class="me">${f(st.me)}</td><td class="them">${f(st.them)}</td></tr>`;
  document.getElementById('stats').innerHTML =
    `<tr><th></th><td class="me">${T.ships.me}</td><td class="them">${T.ships.them}</td></tr>` +
    row(T.stats.torps, (s) => `${s.torpsFired} / ${s.torpsShotDown} / ${s.torpsMissed} / ${s.torpsLanded}`) +
    row(T.stats.rail, (s) => `${s.railFired} / ${s.railLanded} / ${s.railDodged}`) +
    row(T.stats.burns, (s) => s.burns) +
    row(T.stats.pieces, (s) => s.piecesLost);
}
