// HUD: four numbers, phase, current order line, nine buttons with hints,
// pause menu with legend, result. Reads battle state; sends orders through callbacks.
import { N } from '../numbers.js';
import { T } from '../text.js';
import { alive } from '../sim/ship.js';

const $ = (sel) => document.querySelector(sel);
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const tap = (sel, fn) => $(sel).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });

export function makeHud({ onOrder, onPause, onResume, onRestart, onNew, onExport, onImport }) {
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
  $('#pm-resume').textContent = T.resume; $('#pm-restart').textContent = T.restart; $('#pm-new').textContent = T.newBattle;
  $('#again').textContent = T.again; $('#same').textContent = T.same;
  $('#pm-title').textContent = T.pausedTitle;
  $('#title').textContent = T.title;
  $('#rotate-text').textContent = T.rotate;
  $('#name-me').textContent = T.ships.me; $('#name-them').textContent = T.ships.them;
  for (const k of ['range', 'torps', 'burns', 'clock']) $(`#l-${k}`).textContent = T.numbers[k];
  $('#legend').innerHTML = Object.keys(T.legend)
    .map((o) => `<li><b>${T.buttons[o]}</b> <span>${T.legend[o]}</span></li>`).join('');

  let toast = null; // {text, ttl}
  const hitTimers = { me: 0, them: 0 };
  let replay = false;

  return {
    toast(text) { toast = { text, ttl: 2.0 }; },
    // Pop the silhouette panel of a ship that just took a big hit.
    hit(shipId) { hitTimers[shipId] = 0.8; },
    setReplay(on) { replay = on; document.getElementById('orders').classList.toggle('replay', on); },
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
      el.pausemenu.classList.toggle('show', paused && !battle.result);

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
        if (me.orders.run) parts.push(T.order.run); else parts.push(T.order[me.orders.range]);
        parts.push(T.order[me.orders.pdc]);
        if (me.railAim >= 0) parts.push(T.order.aiming);
        line = parts.join(' · ');
      }
      el.order.textContent = line; el.order.className = cls;

      // Buttons: state, availability, progress
      const B = el.buttons;
      const range = battle.range();
      for (const o of Object.keys(B)) {
        const active = (o === me.orders.range && !me.orders.run) || o === me.orders.pdc || (o === 'run' && me.orders.run);
        B[o].classList.toggle('active', active);
      }
      setProgress(B.torps, me.torpReload > 0 ? 1 - me.torpReload / N.TORP_RELOAD : 1, `${me.torps}`);
      setProgress(B.rail, me.railAim >= 0 ? me.railAim / N.RAIL_AIM_TIME : 1 - me.railCharge / N.RAIL_RECHARGE, me.railAim >= 0 ? 'AIM' : '');
      setProgress(B.burn, 1, `${me.burns}`);
      B.torps.classList.toggle('dead', !alive(me, 'tubes') || me.torps === 0);
      B.rail.classList.toggle('dead', !alive(me, 'rail'));
      B.rail.classList.toggle('aiming', me.railAim >= 0);
      B.burn.classList.toggle('dead', !alive(me, 'drive') || me.burns === 0);
      for (const o of ['close', 'hold', 'open', 'run']) B[o].classList.toggle('dead', !alive(me, 'drive'));
      for (const o of ['guard', 'rake']) B[o].classList.toggle('dead', !alive(me, 'pdcL') && !alive(me, 'pdcR'));
      B.torps.classList.toggle('ready', me.torpReload === 0 && me.torps > 0 && range <= N.TORP_RANGE && alive(me, 'tubes'));
      B.rail.classList.toggle('ready', me.railCharge === 0 && me.railAim < 0 && range <= N.RAIL_RANGE && alive(me, 'rail'));

      // Result overlay
      if (battle.result) {
        const r = battle.result;
        el.resultText.textContent = T.result[r.kind][r.reason];
        el.resultSeed.textContent = `${T.seed} ${battle.seed} · ${fmtClock(battle.t)}${battle.enemyPreset ? ` · ${T.enemyLabel} ${battle.enemyPreset}` : ''}`;
        if (!el.result.classList.contains('show')) renderStats(battle.stats);
        el.result.className = 'overlay show ' + r.kind;
      } else {
        el.result.className = 'overlay';
      }
    },
  };
}

function setProgress(btn, frac, sub) {
  btn.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`);
  btn.querySelector('.sub').textContent = sub;
}

function renderStats(st) {
  const row = (label, f) => `<tr><th>${label}</th><td class="me">${f(st.me)}</td><td class="them">${f(st.them)}</td></tr>`;
  document.getElementById('stats').innerHTML =
    `<tr><th></th><td class="me">${T.ships.me}</td><td class="them">${T.ships.them}</td></tr>` +
    row(T.stats.torps, (s) => `${s.torpsFired} / ${s.torpsShotDown} / ${s.torpsLanded}`) +
    row(T.stats.rail, (s) => `${s.railFired} / ${s.railLanded} / ${s.railDodged}`) +
    row(T.stats.burns, (s) => s.burns) +
    row(T.stats.pieces, (s) => s.piecesLost);
}
