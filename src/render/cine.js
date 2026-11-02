// CINE-2D cut shots (behind `?hero=1`, PR C1): on a big beat (a job room dies, a section tears off) a panel over
// the middle of the battle stage plays a 1.2 s shot of it, inside the slow-mo main.js already runs on those beats.
// Presentation only: reads events and battle, never writes them, owns no input (a tap anywhere skips it, main.js;
// drags and buttons work underneath). Every shape is generated from the form: the room's cells give its floor and
// walls, the room kind (hero.js kindOf, the same keys as BLAST) its machinery. Nothing is drawn per ship class.
// C1: the panel, the beats, the queue, skip and toggle; the drive's interior in full, the other kinds a generic
// interior (consoles) until C2; no crew until C3. No Math.random: every jitter hashes a per-battle counter.
import { T, roomKey } from '../text.js';
import { shotFrom, meanX } from '../sim/ship.js';
import { kindOf, BLAST } from './hero.js';
import { glow, hash01, renderDpr } from './look.js';

// Visual-only knobs. Not game numbers.
export const CINE = {
  TIME: 1.2,        // s (real time) a shot lasts; the beat's slow-mo is 0.6 s, so the shot outlives it a little
  GAP: 2,           // s after a shot starts in which a new room beat is dropped (a tear still cuts in)
  W: 0.4,           // share of the stage's width the panel takes
  MIN_W: 200,       // css px
  ASPECT: 0.62,     // panel height / width, capped by the stage's height
  MAX_H: 0.8,       // share of the stage's height the panel may take
  FADE: 0.12,       // s fade in and out
  PUSH: 0.08,       // the camera pushes in this much over the shot
  RADIUS: 8,        // css px corner radius
};

const SIDE_EDGE = { me: [140, 165, 200], them: [255, 160, 80] };
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// canvases: {tac, closeup}; stage(view): the css px rect of that view's canvas the cut may cover (between the hero
// windows and clear of the HUD).
export function makeCine(canvases, stage) {
  let on = true, shot = null, lastStart = -1e9, clock = 0, seq = 0;
  try { on = localStorage.getItem('cine') !== '0'; } catch (e) { /* no storage: on */ }
  const gone = { me: new Set(), them: new Set() }; // cells already shown tearing off, per ship

  function begin(s) { shot = { ...s, age: 0, s: ++seq }; lastStart = clock; }
  function onEvent(ev, battle) {
    if (ev.type === 'tear') {
      const ship = battle.shipById(ev.ship), bx = meanX(ship, 'bridge');
      const fresh = [];
      ship.cells.forEach((row, y) => row.forEach((c, x) => {
        if (!c || gone[ev.ship].has(`${x},${y}`)) return;
        if (!(c.cut || ship.pieces[c.room].torn)) return;
        if ((x + 0.5 > bx) !== (ev.end === 'bow')) return;
        fresh.push([x, y]);
      }));
      for (const [x, y] of fresh) gone[ev.ship].add(`${x},${y}`);
      if (!on || !fresh.length) return;
      if (shot && shot.kind === 'tear' && clock - lastStart < CINE.GAP) return; // one tear at a time
      begin({ kind: 'tear', side: ev.ship, end: ev.end, cells: fresh, ship });
      return;
    }
    if (ev.type !== 'pieceDead' || ev.cause === 'tear' || String(ev.piece).startsWith('frame:')) return;
    if (!on || clock - lastStart < CINE.GAP) return;
    const ship = battle.shipById(ev.ship), foe = battle.enemyOf(ship);
    const cells = [];
    ship.cells.forEach((row, y) => row.forEach((c, x) => { if (c && c.room === ev.piece) cells.push([x, y]); }));
    if (!cells.length) return;
    begin({ kind: 'room', side: ev.ship, room: ev.piece, rk: kindOf(ship, ev.piece), cells, ship, from: shotFrom(ship, foe.x, foe.y) });
  }
  function step(dtReal) {
    clock += dtReal;
    if (shot) { shot.age += dtReal; if (shot.age >= CINE.TIME) shot = null; }
  }
  function skip() { shot = null; }
  function setOn(v) { on = v; if (!on) shot = null; try { localStorage.setItem('cine', on ? '1' : '0'); } catch (e) { /* the toggle still works this session */ } }
  function reset() { shot = null; lastStart = -1e9; seq = 0; gone.me.clear(); gone.them.clear(); }

  // The panel's rect (css px, canvas coords) on a stage rect.
  function panelRect(st) {
    const w = Math.max(CINE.MIN_W, Math.round(st.w * CINE.W)), h = Math.round(Math.min(st.h * CINE.MAX_H, w * CINE.ASPECT));
    return { x: Math.round(st.x + (st.w - w) / 2), y: Math.round(st.y + (st.h - h) / 2), w, h };
  }
  function draw(view) {
    if (!shot) return;
    const cv = canvases[view], st = cv && stage(view);
    if (!st || st.w < 120 || st.h < 80) return;
    const r = panelRect(st), g = cv.getContext('2d'), dpr = renderDpr(), a = shot.age;
    const fade = clamp(Math.min(a, CINE.TIME - a) / CINE.FADE, 0, 1);
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = fade;
    g.translate(r.x, r.y);
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, r.w, r.h, CINE.RADIUS); else g.rect(0, 0, r.w, r.h);
    g.fillStyle = 'rgba(4,6,11,0.94)'; g.fill();
    g.save(); g.clip();
    if (shot.kind === 'room') drawRoom(g, r, shot); else drawTear(g, r, shot);
    g.restore();
    g.beginPath(); // the shot drew its own paths: the frame again
    if (g.roundRect) g.roundRect(0, 0, r.w, r.h, CINE.RADIUS); else g.rect(0, 0, r.w, r.h);
    g.strokeStyle = css(SIDE_EDGE[shot.side], 0.7); g.lineWidth = 1.2; g.stroke();
    // the caption: whose, what
    const label = shot.kind === 'room' ? `${T.lost[shot.side]} ${T.pieces[roomKey(shot.room)].toUpperCase()}` : `${T.lost[shot.side]} ${T.tear[shot.end]}`;
    g.font = '600 10px "SF Mono", Menlo, Consolas, monospace';
    g.fillStyle = css(SIDE_EDGE[shot.side], 0.95); g.textBaseline = 'top';
    g.fillText(label, 8, 6);
    g.restore();
  }

  // --- the room shot: a top-down cutaway of the room (bow to the right, row 0 at the top), walls along its cells'
  // outline, the neighbouring cells dim around it, its machinery by kind; then the breach on the side the shot came
  // from, the flash, debris thrown in then sucked out, red emergency light, smoke drifting to the hole.
  function drawRoom(g, r, sh) {
    const { ship, cells } = sh, a = sh.age, k = a / CINE.TIME;
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 1.5, y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 1.5; // half a cell of hull round it
    const push = 1 + CINE.PUSH * k;
    const s = Math.min(r.w / (x1 - x0), (r.h - 14) / (y1 - y0)) * push;
    const ox = r.w / 2 - ((x0 + x1) / 2) * s, oy = 7 + (r.h - 14) / 2 - ((y0 + y1) / 2) * s;
    const X = (gx) => ox + gx * s, Y = (gy) => oy + gy * s;
    const inRoom = new Set(cells.map((c) => `${c[0]},${c[1]}`));
    const has = (x, y) => inRoom.has(`${x},${y}`);
    // the hull around it: other cells, dim
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(ship.form.h, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(ship.form.w, Math.ceil(x1)); x++) {
      const c = ship.cells[y][x];
      if (!c || has(x, y)) continue;
      g.fillStyle = c.cut ? 'rgba(0,0,0,0)' : '#151b23';
      g.fillRect(X(x) + 0.5, Y(y) + 0.5, s - 1, s - 1);
    }
    // the floor: deck plates, seams every cell
    g.save();
    g.beginPath();
    for (const [x, y] of cells) g.rect(X(x), Y(y), s + 0.5, s + 0.5);
    g.clip();
    g.fillStyle = '#26303b'; g.fillRect(0, 0, r.w, r.h);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (const [x, y] of cells) g.strokeRect(X(x) + 0.5, Y(y) + 0.5, s - 1, s - 1);
    machinery(g, sh, X, Y, s, a);
    // red emergency light, pulsing, from a quarter of the shot on
    if (a > 0.25) { g.fillStyle = `rgba(255,30,20,${0.18 + 0.12 * Math.sin(a * 18)})`; g.fillRect(0, 0, r.w, r.h); }
    g.restore();
    // walls: every cell edge with no room cell beyond it
    g.strokeStyle = '#6b7a8c'; g.lineWidth = Math.max(2, s * 0.14); g.lineCap = 'square';
    g.beginPath();
    for (const [x, y] of cells) {
      if (!has(x, y - 1)) { g.moveTo(X(x), Y(y)); g.lineTo(X(x + 1), Y(y)); }
      if (!has(x, y + 1)) { g.moveTo(X(x), Y(y + 1)); g.lineTo(X(x + 1), Y(y + 1)); }
      if (!has(x - 1, y)) { g.moveTo(X(x), Y(y)); g.lineTo(X(x), Y(y + 1)); }
      if (!has(x + 1, y)) { g.moveTo(X(x + 1), Y(y)); g.lineTo(X(x + 1), Y(y + 1)); }
    }
    g.stroke();
    // the breach: the outermost room cell toward where the shot came from, its outer wall blown out
    const pick = { bow: (c) => c[0], stern: (c) => -c[0], top: (c) => -c[1], bottom: (c) => c[1] }[sh.from] || ((c) => c[0]);
    const best = Math.max(...cells.map(pick)), edge = cells.filter((c) => pick(c) === best);
    const bc = edge[Math.floor(edge.length / 2)];
    const nx = { bow: 1, stern: -1 }[sh.from] || 0, ny = { top: -1, bottom: 1 }[sh.from] || 0;
    const bx = X(bc[0] + 0.5 + nx * 0.5), by = Y(bc[1] + 0.5 + ny * 0.5);
    const hr = s * 0.55 * clamp(a / 0.1, 0, 1);
    if (hr > 0) {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const t = (i / 10) * Math.PI * 2, rr = hr * (0.65 + 0.5 * hash01(sh.s * 31 + i));
        g[i ? 'lineTo' : 'moveTo'](bx + Math.cos(t) * rr, by + Math.sin(t) * rr);
      }
      g.closePath();
      g.fillStyle = '#020306'; g.fill();
      g.strokeStyle = `rgba(255,140,50,${0.9 * (1 - k)})`; g.lineWidth = 1.5; g.stroke();
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(bx + (hash01(sh.s * 7 + i) - 0.5) * hr, by + (hash01(sh.s * 11 + i) - 0.5) * hr, 1, 1); } // stars through the hole
    }
    // debris: thrown into the room by the blast, then sucked back out through the hole
    for (let i = 0; i < 26; i++) {
      const h1 = hash01(sh.s * 53 + i), h2 = hash01(sh.s * 71 + i), ang = Math.atan2(-ny, -nx) + (h1 - 0.5) * 2.2;
      const out = s * (0.6 + 2.2 * h2) * clamp(a / 0.25, 0, 1);
      const suck = clamp((a - 0.3 - h1 * 0.3) / 0.6, 0, 1);
      const px = bx + Math.cos(ang) * out * (1 - suck) + nx * suck * s * 1.5, py = by + Math.sin(ang) * out * (1 - suck) + ny * suck * s * 1.5;
      g.fillStyle = i % 3 ? `rgba(255,${150 + 80 * h2},80,${1 - k})` : `rgba(160,170,185,${1 - k * 0.6})`;
      const z = i % 3 ? 1.6 : Math.max(2, s * 0.12);
      g.fillRect(px - z / 2, py - z / 2, z, z);
    }
    // smoke drifting to the hole
    for (let i = 0; i < 6; i++) {
      const ph = (a * 0.9 + i / 6) % 1, c = cells[Math.floor(hash01(sh.s * 13 + i) * cells.length)];
      const sx = X(c[0] + 0.5), sy = Y(c[1] + 0.5), px = sx + (bx - sx) * ph, py = sy + (by - sy) * ph;
      g.fillStyle = `rgba(80,82,90,${0.35 * (1 - ph) * clamp(a / 0.3, 0, 1)})`;
      g.beginPath(); g.arc(px, py, s * (0.3 + 0.4 * ph), 0, Math.PI * 2); g.fill();
    }
    glow(g, bx, by, s * 2.4 * (1 - k * 0.6), (BLAST[sh.rk] || {}).col || [255, 150, 60], 0.9 * (1 - k), false);
    // the flash
    if (a < 0.1) { g.fillStyle = `rgba(255,255,255,${0.8 * (1 - a / 0.1)})`; g.fillRect(0, 0, r.w, r.h); }
  }

  // Machinery per room kind, inside the room's clip. C1: the drive in full; every other kind a generic interior.
  function machinery(g, sh, X, Y, s, a) {
    const { cells } = sh, xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    if (sh.rk === 'drive') {
      // plasma conduits along the hull, the reactor at the stern end; they rupture and vent, the core dies
      const rows = Math.max(1, Math.min(3, y1 - y0));
      const live = clamp(1 - (a - 0.5) / 0.4, 0, 1);
      for (let i = 0; i < rows; i++) {
        const py = Y(y0 + (i + 0.5) * (y1 - y0) / rows);
        g.strokeStyle = '#3b4756'; g.lineWidth = s * 0.34; g.beginPath(); g.moveTo(X(x0), py); g.lineTo(X(x1), py); g.stroke();
        g.strokeStyle = css([120, 190, 255], 0.35 + 0.5 * live); g.lineWidth = s * 0.12; g.beginPath(); g.moveTo(X(x0), py); g.lineTo(X(x1), py); g.stroke();
        // ruptures: two per conduit, venting across the room, flickering
        for (let j = 0; j < 2; j++) {
          const h = hash01(sh.s * 17 + i * 5 + j), px = X(x0 + (0.25 + 0.5 * h) * (x1 - x0)), on = a > 0.08 + 0.1 * j && live > 0;
          if (!on) continue;
          const len = s * (0.8 + 0.8 * hash01(sh.s * 3 + i + j + Math.floor(a * 25))), dir = j ? 1 : -1;
          g.strokeStyle = css([200, 235, 255], 0.9 * live); g.lineWidth = s * 0.1;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + len * 0.3, py + dir * len); g.stroke();
          glow(g, px, py + dir * len * 0.5, s * 1.1, [150, 210, 255], 0.7 * live, false);
        }
      }
      const cx = X(x0 + 0.9), cy = Y((y0 + y1) / 2), cr = Math.min(s * 0.9, (Y(y1) - Y(y0)) * 0.4);
      g.fillStyle = '#1a2230'; g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = css([140, 200, 255], 0.3 + 0.6 * live); g.lineWidth = 2;
      for (let i = 1; i <= 2; i++) { g.beginPath(); g.arc(cx, cy, cr * i / 2.4, 0, Math.PI * 2); g.stroke(); }
      glow(g, cx, cy, cr * 2.2, [140, 200, 255], live * (0.6 + 0.3 * Math.sin(a * 40)), false);
      return;
    }
    // generic (C2 gives every kind its own): a console on a few cells, screens lit until the power goes
    const lit = clamp(1 - (a - 0.2) / 0.5, 0, 1);
    cells.forEach(([x, y], i) => {
      if (hash01(sh.s * 29 + i) > 0.45) return;
      g.fillStyle = '#3a4554'; g.fillRect(X(x + 0.2), Y(y + 0.25), s * 0.6, s * 0.4);
      const flick = hash01(sh.s + i + Math.floor(a * 20)) > 0.3 ? 1 : 0.3;
      g.fillStyle = css([110, 220, 180], 0.8 * lit * flick); g.fillRect(X(x + 0.28), Y(y + 0.32), s * 0.44, s * 0.18);
    });
  }

  // --- the tear shot: the whole hull top-down (bow right), the section that broke away sliding off and turning,
  // sparks along the break.
  function drawTear(g, r, sh) {
    const { ship, cells, end } = sh, a = sh.age, k = a / CINE.TIME;
    const W = ship.form.w, H = ship.form.h, s = Math.min((r.w - 24) / (W + 6), (r.h - 24) / H);
    const ox = (r.w - W * s) / 2, oy = 10 + (r.h - 10 - H * s) / 2;
    const torn = new Set(cells.map((c) => `${c[0]},${c[1]}`));
    const dir = end === 'bow' ? 1 : -1;
    const drift = s * 3 * k * k + s * 0.6 * k, turn = dir * 0.25 * k;
    const tx = cells.reduce((q, c) => q + c[0], 0) / cells.length, ty = cells.reduce((q, c) => q + c[1], 0) / cells.length;
    // frame steel, job rooms lighter, dead rooms dark holes
    const cellCol = (c) => (!ship.pieces[c.room].alive && !ship.pieces[c.room].torn ? '#1d2229' : c.room.startsWith('frame:') ? '#5d6b7b' : '#8494a6');
    // the ship that is left
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = ship.cells[y][x];
      if (!c || torn.has(`${x},${y}`) || c.cut) continue;
      g.fillStyle = cellCol(c);
      g.fillRect(ox + x * s + 0.5, oy + y * s + 0.5, s - 1, s - 1);
    }
    // the section going away
    g.save();
    g.translate(ox + (tx + 0.5) * s + dir * drift, oy + (ty + 0.5) * s);
    g.rotate(turn);
    for (const [x, y] of cells) {
      const c = ship.cells[y][x];
      g.fillStyle = cellCol(c);
      g.fillRect((x - tx - 0.5) * s + 0.5, (y - ty - 0.5) * s + 0.5, s - 1, s - 1);
    }
    g.restore();
    // sparks along the break: the torn cells' edge nearest the ship
    const brk = end === 'bow' ? Math.min(...cells.map((c) => c[0])) : Math.max(...cells.map((c) => c[0])) + 1;
    const bx = ox + brk * s;
    for (let i = 0; i < 24; i++) {
      const h1 = hash01(sh.s * 41 + i), h2 = hash01(sh.s * 43 + i);
      const py = oy + h1 * H * s, d = (0.3 + h2) * s * 2.5 * k;
      g.fillStyle = `rgba(255,${170 + 80 * h2},90,${1 - k})`;
      g.fillRect(bx + dir * d * 0.6 + (h2 - 0.5) * d, py + (h1 - 0.5) * d, 1.6, 1.6);
    }
    glow(g, bx + dir * drift * 0.5, oy + H * s / 2, s * 4 * (1 - k * 0.5), [255, 230, 200], 0.9 * (1 - k), false);
    if (a < 0.12) { g.fillStyle = `rgba(255,255,255,${0.85 * (1 - a / 0.12)})`; g.fillRect(0, 0, r.w, r.h); }
  }

  return { onEvent, step, draw, skip, reset, setOn, isOn: () => on, playing: () => !!shot, panelRect };
}
