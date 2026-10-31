// HUD: four numbers, phase, current order line, nine buttons with hints,
// pause menu with legend, result. Reads battle state; sends orders through callbacks.
import { N } from '../numbers.js';
import { T } from '../text.js';
import { alive, exposure, canFireTubes, canAimRail } from '../sim/ship.js';
import { CATALOG, SLOTS } from '../ships/catalog.js';

const $ = (sel) => document.querySelector(sel);
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const tap = (sel, fn) => $(sel).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });

export function makeHud({ onOrder, onPause, onResume, onRestart, onNew, onExport, onImport, onAuto, onDownload, onFit }) {
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
  // The hangar: rows of two picks; LAUNCH hands the fit back and starts a new battle.
  let fit = {};
  for (const id of ['#pm-hangar', '#rs-hangar']) { tap(id, () => api.showHangar(fit)); $(id).textContent = T.hangar.button; }
  $('#hg-title').textContent = T.hangar.title; $('#hg-launch').textContent = T.hangar.launch; $('#hg-close').textContent = T.hangar.close;
  $('#hg-slots').innerHTML = SLOTS.map((slot) => `<div class="slot"><div class="k">${T.slots[slot].toUpperCase()}</div>` +
    Object.keys(CATALOG[slot]).map((key) => `<button class="pick" data-slot="${slot}" data-key="${key}"><span class="n">${T.catalog[key].name.toUpperCase()}</span><span class="d">${T.catalog[key].line}</span></button>`).join('') + '</div>').join('');
  for (const b of document.querySelectorAll('#hg-slots .pick')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); fit = { ...fit, [b.dataset.slot]: b.dataset.key }; markFit(fit); });
  let hangarOpen = false;
  const closeHangar = () => { hangarOpen = false; $('#hangar').classList.remove('show'); };
  tap('#hg-close', closeHangar);
  tap('#hg-launch', () => { closeHangar(); onFit(fit); });
  const markFit = (f) => { for (const b of document.querySelectorAll('#hg-slots .pick')) b.classList.toggle('on', f[b.dataset.slot] === b.dataset.key); };
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
    showHangar(f) { fit = { ...f }; markFit(fit); hangarOpen = true; $('#hangar').classList.add('show'); },
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
        if (me.target && alive(them, me.target)) parts.push(`${T.order.target} ${T.pieces[me.target].toLowerCase()}`);
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
      for (const o of ['guard', 'rake']) B[o].classList.toggle('dead', !alive(me, 'pdc'));
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
