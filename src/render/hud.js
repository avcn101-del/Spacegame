// HUD: four numbers, phase, current order line, nine buttons with hints,
// pause menu with legend, result. Reads battle state; sends orders through callbacks.
import { N } from '../numbers.js';
import { T, roomKey } from '../text.js';
import { alive, pdcAlive, faceFor, angleDiff, isPdc } from '../sim/ship.js';
import { refusal } from '../sim/orders.js';
import { CATALOG } from '../ships/catalog.js';
import { ROOM_COLORS } from './form.js';
import { railKm } from './arcs.js';
import { drawHangar, hitAt, roomAtCell } from './hangar.js';

const $ = (sel) => document.querySelector(sel);
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const SLOTS_OF = { rail: 1, tubes: 1, drive: 1 }; // rooms that have a pick
const ROOM_OF = { gun: 'rail', launcher: 'tubes', drive: 'drive', rounds: 'pdc1' }; // rounds: any mount reads as 'pdc'
const hasPick = (room) => !!SLOTS_OF[room] || /^pdc\d+$/.test(room); // the PDC mounts pick the rounds
const tap = (sel, fn) => $(sel).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });

export function makeHud({ onOrder, onView, onPause, onHelp, onResume, onRestart, onNew, onExport, onImport, onAuto, onDownload, onFit, preview, presets }) {
  const el = {
    clock: $('#n-clock'), range: $('#n-range'), rate: $('#n-rate'), torps: $('#n-torps'), burns: $('#n-burns'),
    phase: $('#phase'), order: $('#order'), pause: $('#pause'), title: $('#title'),
    toasts: $('#toasts'), alerts: $('#alerts'), alertMain: $('#alert-main'), alertSub: $('#alert-sub'), inspector: $('#inspector'),
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
  // Pause only stops the clock; HELP opens the menu (and pauses). The menu closes on RESUME or CLOSE.
  let helpOpen = false;
  tap('#pause', onPause);
  tap('#help', () => { helpOpen = true; onHelp(); });
  $('#help').textContent = T.help;
  tap('#pm-close', () => { helpOpen = false; });
  $('#pm-close').textContent = T.close;
  tap('#view', onView);
  tap('#pm-resume', () => { helpOpen = false; onResume(); }); tap('#pm-restart', () => { helpOpen = false; onRestart(); }); tap('#pm-new', () => { helpOpen = false; onNew(); });
  tap('#again', onNew); tap('#same', onRestart);
  for (const id of ['#pm-export', '#rs-export']) { tap(id, onExport); $(id).textContent = T.export; }
  for (const id of ['#pm-import', '#rs-import']) { tap(id, onImport); $(id).textContent = T.import; }
  tap('#pm-auto', () => { helpOpen = false; onAuto(); });
  tap('#pm-import', () => { helpOpen = false; });
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
    const hit = !room || hasPick(room) ? hitAt(hits, px, py) : null;
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

  // Toasts: a queue of two at most, under the header; the same text again only refreshes its time.
  // kind: 'ok' (accepted), 'no' (refused), 'event' (what just happened). Alerts never go here.
  const toasts = [];
  let toastKey = '', alertKey = '';
  let inspect = null; // {room, ttl}: my own room, tapped to see it; the enemy target lives on the battle
  let lost = null, lastTarget = null; // {room, ttl}: the target room that just died
  const setText = (e, t) => { if (e.textContent !== t) e.textContent = t; };
  const setClass = (e, c) => { if (e.className !== c) e.className = c; };
  const roomName = (room) => (isPdc(room) ? T.inspect.pdc(room.slice(3)) : T.pieces[roomKey(room)].toUpperCase());
  const hitTimers = { me: 0, them: 0 };
  let replay = false, auto = false;

  const api = {
    showExport(text) { $('#export-text').value = text; $('#exportbox').classList.add('show'); },
    showHangar(f) { closeList(); fit = { ...f }; sel = null; note = null; hangarOpen = true; $('#hangar').classList.add('show'); markFit(fit); markFoe(); },
    setEnemy(key) { foe = key; },
    setFit(f) { fit = { ...f }; },
    setAuto(on) { auto = on; $('#pm-auto').textContent = on ? T.autoOff : T.auto; document.getElementById('orders').classList.toggle('replay', on || replay); },
    toast(text, ttl = 2.0, kind = 'ok') {
      const same = toasts.find((t) => t.text === text);
      if (same) { same.ttl = Math.max(same.ttl, ttl); return; }
      toasts.push({ text, ttl, kind });
      while (toasts.length > 2) toasts.shift();
    },
    // Tap on one of my rooms: the inspector shows it for a while; the enemy target stays underneath.
    inspect(room) { inspect = room ? { room, ttl: 5.5 } : null; },
    // Pop the silhouette panel of a ship that just took a big hit.
    hit(shipId) { hitTimers[shipId] = 0.8; },
    setView(v) { $('#view').textContent = v === 'closeup' ? T.view.tac : T.view.closeup; },
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
      if (battle.result || hangarOpen) helpOpen = false;
      el.pausemenu.classList.toggle('show', helpOpen);
      // Mode badge in the title slot: replay, auto, paused. Never in the order line or a toast.
      const locked = replay || auto;
      const modes = [replay && T.replaying, auto && T.auto, paused && !battle.result && (locked ? T.pausedShort : T.pausedBadge)].filter(Boolean);
      setText(el.title, modes.length ? modes.join(' · ') : T.title);
      el.title.classList.toggle('paused', modes.length > 0);

      for (const id of ['me', 'them']) {
        if (hitTimers[id] > 0) hitTimers[id] -= dtReal;
        el.panels[id].classList.toggle('hit', hitTimers[id] > 0);
      }

      // Toasts
      for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].ttl -= dtReal; if (toasts[i].ttl <= 0) toasts.splice(i, 1); }
      const tk = toasts.map((t) => t.kind + t.text).join('|');
      if (tk !== toastKey) {
        toastKey = tk;
        el.toasts.replaceChildren(...toasts.map((t) => { const d = document.createElement('div'); d.className = t.kind; d.textContent = t.text; return d; }));
      }

      // Alert lane: their rail on us first (3 s to answer), torpedoes inbound second (a chip if both).
      const range = battle.range();
      const railLock = them.railAim >= 0 && alive(them, 'rail');
      const inbound = battle.projectiles.filter((p) => p.kind === 'torp' && p.target === 'me' && !p.dead);
      let main = '', sub = '';
      if (railLock) {
        const why = refusal(me, 'burn', { range, enemy: them });
        main = T.alert.rail(Math.max(0, N.RAIL_AIM_TIME - them.railAim).toFixed(1), why ? (T.alert.burnNo[why] || T.refusal[why]) : T.alert.burnOk(me.burns));
      }
      if (inbound.length) {
        const km = Math.min(...inbound.map((p) => Math.hypot(p.x - me.x, p.y - me.y))).toFixed(1);
        if (railLock) sub = T.alert.torpsChip(inbound.length, km); else main = T.alert.torps(inbound.length, km);
      }
      setText(el.alertMain, main); setText(el.alertSub, sub);
      const ak = (railLock ? 'r' : '') + (inbound.length ? 't' : '');
      if (ak !== alertKey) { // a new threat pulses twice, then stays solid
        if (ak) { el.alerts.classList.remove('intro'); void el.alerts.offsetWidth; el.alerts.classList.add('intro'); }
        alertKey = ak;
      }

      // Order summary: what my ship is doing and was told to do. Nothing else writes here.
      const S = T.summary, parts = [];
      if (me.turnLeft > 0) {
        const bearing = Math.atan2(them.y - me.y, them.x - me.x);
        parts.push(S.turning(S.face[faceFor(angleDiff(me.headingTarget, bearing))]));
      } else parts.push(S.face[me.face]);
      if (me.orders.run) parts.push(S.run);
      else if (me.move.coast) parts.push(`${S.coast} ${Math.hypot(me.vx, me.vy).toFixed(2)}`);
      else parts.push(`${S.cmd} ${me.move.speed.toFixed(2)}`);
      if (pdcAlive(me)) parts.push(S[me.orders.pdc]);
      if (me.railAim >= 0) parts.push(S.aim(Math.max(0, N.RAIL_AIM_TIME - me.railAim).toFixed(1)));
      setText(el.order, parts.join(' · '));

      // Room inspector: my tapped room for a few seconds, else the enemy target, else the exposed end.
      if (inspect) { inspect.ttl -= dtReal; if (inspect.ttl <= 0) inspect = null; }
      if (lost) { lost.ttl -= dtReal; if (lost.ttl <= 0) lost = null; }
      if (lastTarget && !me.target && !alive(them, lastTarget)) lost = { room: lastTarget, ttl: 4 };
      if (me.target) lost = null;
      lastTarget = me.target;
      const I = T.inspect, hp = (ship, room) => { const pc = ship.pieces[room]; return pc.hp > 0 ? `${Math.ceil(pc.hp)}/${pc.maxHp}` : I.destroyed; };
      let ins, ic;
      if (inspect) { ins = `${I.our} ${roomName(inspect.room)} ${hp(me, inspect.room)}`; ic = 'me'; }
      else if (me.target) { ins = `${I.target} · ${I.their} ${roomName(me.target)} ${hp(them, me.target)}`; ic = 'them'; }
      else if (lost) { ins = `${I.their} ${roomName(lost.room)} · ${I.destroyed}`; ic = 'lost'; }
      else { ins = I.none; ic = ''; }
      setText(el.inspector, ins); setClass(el.inspector, ic);

      // Buttons: state, availability, progress, and a reason line that says why one cannot act now.
      // The reasons come from the sim's refusal(), so the button and the order never disagree.
      const B = el.buttons, Y = T.why, ctxO = { range, enemy: them };
      const lockWhy = replay ? Y.replay : auto ? Y.auto : null;
      const km = range.toFixed(1);
      const reasonOf = (o) => {
        if (lockWhy) return [lockWhy, 'off'];
        const why = refusal(me, o, ctxO);
        switch (why) {
          case null: return o === 'torps' || o === 'rail' ? [Y.ready, 'ready'] : [null, ''];
          case 'noTubes': case 'noRail': return [Y.destroyed, 'off'];
          case 'noTorps': return [Y.noAmmo, 'off'];
          case 'reloading': return [Y.secs(Math.ceil(me.torpReload)), 'wait'];
          case 'tailNoTubes': return [Y.tail, 'off'];
          case 'tooFar': return [Y.out(km, o === 'rail' ? me.railRange : N.TORP_RANGE), 'off'];
          case 'noSensors': return [Y.noSensors, 'off'];
          case 'charging': return [Y.secs(Math.ceil(me.railCharge)), 'wait'];
          case 'aiming': return [Y.aim(Math.max(0, N.RAIL_AIM_TIME - me.railAim).toFixed(1)), 'aiming'];
          case 'railNeedsBow': return [me.turnLeft > 0 ? Y.turning : Y.needBow, 'off'];
          case 'noDrive': return [Y.driveGone, 'off'];
          case 'noBurns': return [Y.noBurns, 'off'];
          case 'aimingNoBurn': return [Y.lockedAim, 'off'];
          case 'noPdc': return [Y.pdcGone, 'off'];
          case 'alreadyPdc': case 'alreadyHolding': return [Y.on, 'active'];
          case 'running': return o === 'run' ? [Y.running, 'active'] : [Y.running, 'off'];
          default: return [null, ''];
        }
      };
      for (const o of Object.keys(B)) {
        const [why, state] = reasonOf(o), btn = B[o], hint = btn.querySelector('.hint');
        setText(hint, why || T.hints[o]);
        hint.classList.toggle('reason', !!why);
        for (const c of ['off', 'wait', 'ready', 'aiming', 'active']) btn.classList.toggle(c, c === state);
        btn.setAttribute('aria-disabled', state === 'off' ? 'true' : 'false');
      }
      setProgress(B.torps, me.torpReload > 0 ? 1 - me.torpReload / me.reloadTime : 1, `${me.torps}`);
      setProgress(B.rail, me.railAim >= 0 ? me.railAim / N.RAIL_AIM_TIME : 1 - me.railCharge / me.railRecharge, '');
      setProgress(B.burn, 1, `${me.burns}`);

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
