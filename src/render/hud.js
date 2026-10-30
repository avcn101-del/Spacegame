// HUD: four numbers, phase, current order line, nine buttons, pause, result.
// Reads battle state; sends orders through callbacks. No sim logic here.
import { N } from '../numbers.js';
import { T } from '../text.js';
import { alive } from '../sim/ship.js';

const $ = (sel) => document.querySelector(sel);
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function makeHud({ onOrder, onPause, onAgain, onSame }) {
  const el = {
    clock: $('#n-clock'), range: $('#n-range'), torps: $('#n-torps'), burns: $('#n-burns'),
    phase: $('#phase'), order: $('#order'), pause: $('#pause'),
    result: $('#result'), resultText: $('#result-text'), resultSeed: $('#result-seed'),
    buttons: {},
  };
  for (const o of Object.keys(T.buttons)) {
    const b = $(`#btn-${o}`);
    el.buttons[o] = b;
    b.querySelector('.label').textContent = T.buttons[o];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onOrder(o); });
  }
  el.pause.addEventListener('pointerdown', (e) => { e.preventDefault(); onPause(); });
  $('#again').addEventListener('pointerdown', (e) => { e.preventDefault(); onAgain(); });
  $('#same').addEventListener('pointerdown', (e) => { e.preventDefault(); onSame(); });
  $('#again').textContent = T.again; $('#same').textContent = T.same;
  $('#pause').textContent = T.pause;
  $('#title').textContent = T.title;
  $('#name-me').textContent = T.ships.me; $('#name-them').textContent = T.ships.them;
  for (const k of ['range', 'torps', 'burns', 'clock']) $(`#l-${k}`).textContent = T.numbers[k];

  let toast = null; // {text, ttl}

  return {
    toast(text) { toast = { text, ttl: 2.0 }; },
    draw(battle, paused, dtReal) {
      const me = battle.ships[0], them = battle.ships[1];
      el.clock.textContent = fmtClock(battle.t);
      el.range.textContent = battle.range().toFixed(1);
      el.torps.textContent = String(me.torps);
      el.burns.textContent = String(me.burns);
      el.phase.textContent = T.phase[battle.phase];
      el.pause.textContent = paused ? T.resume : T.pause;
      el.pause.classList.toggle('on', paused);

      // Order line: toast > warning > paused > current orders
      if (toast) { toast.ttl -= dtReal; if (toast.ttl <= 0) toast = null; }
      let line, cls = '';
      if (toast) { line = toast.text; cls = 'toast'; }
      else if (them.railAim >= 0 && alive(them, 'rail')) { line = T.warn.railAimingAtUs; cls = 'warn'; }
      else if (battle.projectiles.some((p) => p.kind === 'torp' && p.target === 'me')) { line = T.warn.torpsIncoming; cls = 'warn'; }
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
      const ctx = { range: battle.range() };
      for (const o of Object.keys(B)) {
        const b = B[o];
        const active = (o === me.orders.range && !me.orders.run) || o === me.orders.pdc || (o === 'run' && me.orders.run);
        b.classList.toggle('active', active);
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
      B.torps.classList.toggle('ready', me.torpReload === 0 && me.torps > 0 && ctx.range <= N.TORP_RANGE && alive(me, 'tubes'));
      B.rail.classList.toggle('ready', me.railCharge === 0 && me.railAim < 0 && ctx.range <= N.RAIL_RANGE && alive(me, 'rail'));

      // Result overlay
      if (battle.result) {
        const r = battle.result;
        el.resultText.textContent = T.result[r.kind][r.reason];
        el.resultSeed.textContent = `${T.seed} ${battle.seed} · ${fmtClock(battle.t)}`;
        el.result.classList.add('show');
        el.result.className = 'show ' + r.kind;
      } else {
        el.result.className = '';
      }
    },
  };
}

function setProgress(btn, frac, sub) {
  btn.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`);
  btn.querySelector('.sub').textContent = sub;
}
