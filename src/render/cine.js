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
    // the breach: the outermost room cell toward where the shot came from, its outer wall blown out
    const pick = { bow: (c) => c[0], stern: (c) => -c[0], top: (c) => -c[1], bottom: (c) => c[1] }[sh.from] || ((c) => c[0]);
    const best = Math.max(...cells.map(pick)), edge = cells.filter((c) => pick(c) === best);
    const bc = edge[Math.floor(edge.length / 2)];
    const nx = { bow: 1, stern: -1 }[sh.from] || 0, ny = { top: -1, bottom: 1 }[sh.from] || 0;
    const bx = X(bc[0] + 0.5 + nx * 0.5), by = Y(bc[1] + 0.5 + ny * 0.5);
    sh.breach = { x: bx, y: by }; // the interiors pull loose things toward it
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
    const u = Math.min(s, 40); // the blast's size unit: a one-cell room is drawn big, its hole should not be
    const hr = u * 0.55 * clamp(a / 0.1, 0, 1);
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
      const out = u * (0.6 + 2.2 * h2) * clamp(a / 0.25, 0, 1);
      const suck = clamp((a - 0.3 - h1 * 0.3) / 0.6, 0, 1);
      const px = bx + Math.cos(ang) * out * (1 - suck) + nx * suck * u * 1.5, py = by + Math.sin(ang) * out * (1 - suck) + ny * suck * u * 1.5;
      g.fillStyle = i % 3 ? `rgba(255,${150 + 80 * h2},80,${1 - k})` : `rgba(160,170,185,${1 - k * 0.6})`;
      const z = i % 3 ? 1.6 : Math.max(2, u * 0.12);
      g.fillRect(px - z / 2, py - z / 2, z, z);
    }
    // smoke drifting to the hole
    for (let i = 0; i < 6; i++) {
      const ph = (a * 0.9 + i / 6) % 1, c = cells[Math.floor(hash01(sh.s * 13 + i) * cells.length)];
      const sx = X(c[0] + 0.5), sy = Y(c[1] + 0.5), px = sx + (bx - sx) * ph, py = sy + (by - sy) * ph;
      g.fillStyle = `rgba(80,82,90,${0.35 * (1 - ph) * clamp(a / 0.3, 0, 1)})`;
      g.beginPath(); g.arc(px, py, u * (0.3 + 0.4 * ph), 0, Math.PI * 2); g.fill();
    }
    glow(g, bx, by, u * 2.4 * (1 - k * 0.6), (BLAST[sh.rk] || {}).col || [255, 150, 60], 0.9 * (1 - k), false);
    // the flash
    if (a < 0.1) { g.fillStyle = `rgba(255,255,255,${0.8 * (1 - a / 0.1)})`; g.fillRect(0, 0, r.w, r.h); }
  }

  // Machinery per room kind (the keys of hero.js BLAST), inside the room's clip, drawn from the room's own cells and
  // box so one set serves every class. Each kind also plays its death: `live` falls from 1 to 0 as the room goes.
  function machinery(g, sh, X, Y, s, a) {
    const { cells } = sh, xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 };
    const h = (i) => hash01(sh.s * 97 + i); // fixed per shot
    const hf = (i) => hash01(sh.s * 89 + i + Math.floor(a * 25) * 131); // re-rolled 25 times a second (flicker)
    const draw = INTERIOR[sh.rk] || INTERIOR.generic;
    draw(g, { sh, cells, box, X, Y, s, a, h, hf });
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

// --- interiors by room kind ------------------------------------------------------------------------------
const fall = (a, t0, len) => clamp(1 - (a - t0) / len, 0, 1); // 1 until t0, then down to 0 over len s
const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); };
// A cell of the room touches a wall on the side (dx, dy) when the cell beyond is not the room's.
const wallSide = (cells, x, y, dx, dy) => !cells.some((c) => c[0] === x + dx && c[1] === y + dy);
function jag(g, x0, y0, x1, y1, n, amp, rnd) {
  g.beginPath(); g.moveTo(x0, y0);
  for (let i = 1; i < n; i++) g.lineTo(x0 + (x1 - x0) * i / n + (rnd(i) - 0.5) * amp, y0 + (y1 - y0) * i / n + (rnd(i + 50) - 0.5) * amp);
  g.lineTo(x1, y1); g.stroke();
}

const INTERIOR = {
  // drive: plasma conduits along the hull, the reactor at the stern end; they rupture and vent, the core dies
  drive(g, { box, X, Y, s, a, sh }) {
    const { x0, x1, y0, y1 } = box, rows = Math.max(1, Math.min(3, y1 - y0)), live = fall(a, 0.5, 0.4);
    for (let i = 0; i < rows; i++) {
      const py = Y(y0 + (i + 0.5) * (y1 - y0) / rows);
      g.strokeStyle = '#3b4756'; g.lineWidth = s * 0.34; line(g, X(x0), py, X(x1), py);
      g.strokeStyle = css([120, 190, 255], 0.35 + 0.5 * live); g.lineWidth = s * 0.12; line(g, X(x0), py, X(x1), py);
      for (let j = 0; j < 2; j++) { // ruptures: two per conduit, venting across the room, flickering
        const hh = hash01(sh.s * 17 + i * 5 + j), px = X(x0 + (0.25 + 0.5 * hh) * (x1 - x0));
        if (!(a > 0.08 + 0.1 * j && live > 0)) continue;
        const len = s * (0.8 + 0.8 * hash01(sh.s * 3 + i + j + Math.floor(a * 25))), dir = j ? 1 : -1;
        g.strokeStyle = css([200, 235, 255], 0.9 * live); g.lineWidth = s * 0.1; line(g, px, py, px + len * 0.3, py + dir * len);
        glow(g, px, py + dir * len * 0.5, s * 1.1, [150, 210, 255], 0.7 * live, false);
      }
    }
    const cx = X(x0 + 0.9), cy = Y((y0 + y1) / 2), cr = Math.min(s * 0.9, (Y(y1) - Y(y0)) * 0.4);
    g.fillStyle = '#1a2230'; disc(g, cx, cy, cr);
    g.strokeStyle = css([140, 200, 255], 0.3 + 0.6 * live); g.lineWidth = 2;
    for (let i = 1; i <= 2; i++) { g.beginPath(); g.arc(cx, cy, cr * i / 2.4, 0, Math.PI * 2); g.stroke(); }
    glow(g, cx, cy, cr * 2.2, [140, 200, 255], live * (0.6 + 0.3 * Math.sin(a * 40)), false);
  },
  // tubes: the magazine, torpedoes racked along the hull on every other cell; they cook off one after another
  launcher(g, { cells, X, Y, s, a, h }) {
    cells.forEach(([x, y], i) => {
      if ((x + y) % 2) { g.fillStyle = '#323c49'; g.fillRect(X(x + 0.1), Y(y + 0.42), s * 0.8, s * 0.16); return; } // rack rail
      const pop = 0.15 + h(i) * 0.75; // when this one goes
      if (a > pop + 0.15) { g.fillStyle = 'rgba(10,8,8,0.8)'; disc(g, X(x + 0.5), Y(y + 0.5), s * 0.32); return; } // a scorched empty rack
      if (a > pop) {
        const k = (a - pop) / 0.15;
        glow(g, X(x + 0.5), Y(y + 0.5), s * (0.8 + 1.6 * k), [255, 150, 60], 1 - k, true);
        g.strokeStyle = `rgba(255,220,160,${1 - k})`; g.lineWidth = 1.5;
        g.beginPath(); g.arc(X(x + 0.5), Y(y + 0.5), s * (0.3 + 1.2 * k), 0, Math.PI * 2); g.stroke();
        return;
      }
      const tx = X(x + 0.08), ty = Y(y + 0.36), tw = s * 0.84, th = s * 0.28;
      g.fillStyle = '#9aa6b4'; g.beginPath(); if (g.roundRect) g.roundRect(tx, ty, tw, th, th / 2); else g.rect(tx, ty, tw, th); g.fill();
      g.fillStyle = '#ff546e'; g.fillRect(tx + tw * 0.78, ty, tw * 0.12, th); // warhead band
      g.fillStyle = '#4a5462'; g.fillRect(tx, ty + th * 0.2, tw * 0.1, th * 0.6); // motor
    });
  },
  // bridge: a chair in the middle, consoles along the walls facing in, the main display on the bow wall;
  // screens go red, then out; consoles spark
  core(g, { cells, box, X, Y, s, a, hf }) {
    const live = fall(a, 0.55, 0.35), red = a > 0.2;
    cells.forEach(([x, y], i) => {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0]]) {
        if (!wallSide(cells, x, y, dx, dy)) continue;
        const cx = X(x + 0.5 + dx * 0.32), cy = Y(y + 0.5 + dy * 0.32), w = dy ? s * 0.6 : s * 0.22, hh = dy ? s * 0.22 : s * 0.6;
        g.fillStyle = '#3a4554'; g.fillRect(cx - w / 2, cy - hh / 2, w, hh);
        const on = live * (hf(i * 3 + dx + 2 * dy) > 0.2 ? 1 : 0.2);
        g.fillStyle = css(red ? [255, 70, 60] : [110, 220, 200], 0.85 * on); g.fillRect(cx - w * 0.35, cy - hh * 0.35, w * 0.7, hh * 0.7);
        if (a > 0.15 && a < 0.7 && hf(i * 7 + dx) > 0.75) glow(g, cx, cy, s * 0.6, [255, 220, 150], 0.9, false); // a console sparks
      }
    });
    // main display: the bow wall
    const bx = box.x1 - 0.12;
    g.fillStyle = '#202a36'; g.fillRect(X(bx - 0.12), Y(box.y0 + 0.2), s * 0.2, (box.y1 - box.y0 - 0.4) * s);
    g.fillStyle = css(red ? [255, 60, 50] : [120, 200, 255], 0.6 * live); g.fillRect(X(bx - 0.08), Y(box.y0 + 0.3), s * 0.12, (box.y1 - box.y0 - 0.6) * s);
    // the chair
    const mx = cells.reduce((q, c) => q + c[0] + 0.5, 0) / cells.length, my = cells.reduce((q, c) => q + c[1] + 0.5, 0) / cells.length;
    g.fillStyle = '#56606e'; disc(g, X(mx), Y(my), s * 0.3);
    g.fillStyle = '#2a323d'; g.fillRect(X(mx - 0.38), Y(my - 0.12), s * 0.12, s * 0.24);
  },
  // rail: twin rails down the middle row, capacitor banks on the cells off it; arcs jump between them, they burst
  gun(g, { cells, box, X, Y, s, a, h, hf }) {
    const my = (box.y0 + box.y1) / 2, live = fall(a, 0.6, 0.3);
    const caps = [];
    cells.forEach(([x, y], i) => {
      if (Math.abs(y + 0.5 - my) < 0.6 && box.y1 - box.y0 > 1) return;
      for (const ox of [0.3, 0.7]) caps.push({ x: X(x + ox), y: Y(y + 0.5), pop: 0.2 + h(i * 2 + ox * 10) * 0.6 });
    });
    for (const c of caps) {
      const gone = a > c.pop;
      g.fillStyle = gone ? '#1a1d22' : '#4a5a6c'; disc(g, c.x, c.y, s * 0.17);
      if (!gone) { g.fillStyle = css([170, 220, 255], 0.5 + 0.4 * live); disc(g, c.x - s * 0.04, c.y - s * 0.05, s * 0.06); }
      else if (a < c.pop + 0.12) glow(g, c.x, c.y, s * 1.2, [200, 235, 255], 1 - (a - c.pop) / 0.12, true);
    }
    g.strokeStyle = '#7d8fa3'; g.lineWidth = s * 0.08;
    for (const dy of [-0.14, 0.14]) line(g, X(box.x0), Y(my + dy), X(box.x1), Y(my + dy));
    // arcs: between two capacitors, re-struck every frame tick
    if (caps.length > 1 && a > 0.08) {
      g.strokeStyle = css([190, 230, 255], 0.9 * fall(a, 0.8, 0.3)); g.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) {
        const A = caps[Math.floor(hf(j) * caps.length)], B = caps[Math.floor(hf(j + 9) * caps.length)];
        if (A !== B) jag(g, A.x, A.y, B.x, B.y, 6, s * 0.5, (i) => hf(j * 20 + i));
      }
    }
  },
  // crew: bunks along the walls, a mess table with cups in the middle; everything loose goes for the breach
  crew(g, { sh, cells, X, Y, s, a, h }) {
    cells.forEach(([x, y], i) => {
      const top = wallSide(cells, x, y, 0, -1), bot = wallSide(cells, x, y, 0, 1);
      if (top || bot) { // a bunk against the wall, a pillow at its stern end, a blanket
        const by = top ? Y(y + 0.08) : Y(y + 0.52);
        g.fillStyle = '#4a5260'; g.fillRect(X(x + 0.06), by, s * 0.88, s * 0.4);
        g.fillStyle = '#7d6a5a'; g.fillRect(X(x + 0.3), by + s * 0.04, s * 0.6, s * 0.32);
        g.fillStyle = '#d6dbe2'; g.fillRect(X(x + 0.1), by + s * 0.08, s * 0.16, s * 0.24);
      } else if (h(i) < 0.6) { // a table
        g.fillStyle = '#5b6573'; g.fillRect(X(x + 0.2), Y(y + 0.25), s * 0.6, s * 0.5);
      }
    });
    // loose things (cups, a book, a boot): at rest, then pulled out of the hole from 0.25 s
    const bx = sh.breach ? sh.breach.x : X(cells[0][0]), by = sh.breach ? sh.breach.y : Y(cells[0][1]);
    for (let i = 0; i < 10; i++) {
      const c = cells[Math.floor(h(i + 40) * cells.length)];
      const px0 = X(c[0] + 0.2 + 0.6 * h(i + 60)), py0 = Y(c[1] + 0.2 + 0.6 * h(i + 70));
      const t = clamp((a - 0.25 - h(i + 80) * 0.25) / 0.45, 0, 1), e = t * t;
      const px = px0 + (bx - px0) * e, py = py0 + (by - py0) * e;
      if (t >= 1) continue;
      g.fillStyle = ['#e8e2d6', '#c9a46a', '#8fa0b4'][i % 3];
      g.save(); g.translate(px, py); g.rotate(e * 6 * (h(i) - 0.5)); g.fillRect(-s * 0.08, -s * 0.06, s * 0.16, s * 0.12); g.restore();
    }
  },
  // sensors: radar screens with a sweep, a mast; the sweep stops, the screens go to static, blue crackle
  sensors(g, { cells, X, Y, s, a, hf }) {
    const live = fall(a, 0.35, 0.25);
    cells.forEach(([x, y], i) => {
      const cx = X(x + 0.5), cy = Y(y + 0.5), r = s * 0.34;
      g.fillStyle = '#10261e'; disc(g, cx, cy, r);
      if (live > 0) {
        g.strokeStyle = css([90, 255, 160], 0.8 * live); g.lineWidth = 1.2;
        const ang = a * 7 + i;
        line(g, cx, cy, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        g.fillStyle = css([90, 255, 160], 0.7 * live); disc(g, cx + r * 0.4 * Math.cos(i * 2.3), cy + r * 0.4 * Math.sin(i * 2.3), 1.2);
      } else { // static
        for (let k = 0; k < 8; k++) { g.fillStyle = `rgba(200,220,210,${0.5 * hf(i * 10 + k)})`; g.fillRect(cx + (hf(i * 10 + k + 3) - 0.5) * r * 1.4, cy + (hf(i * 10 + k + 6) - 0.5) * r * 1.4, 1.5, 1.5); }
      }
      g.strokeStyle = '#4a5a6c'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      if (a > 0.1 && a < 0.9 && hf(i + 30) > 0.6) { // crackle
        g.strokeStyle = 'rgba(160,215,255,0.95)'; g.lineWidth = 1;
        jag(g, cx, cy, cx + (hf(i + 31) - 0.5) * s, cy + (hf(i + 32) - 0.5) * s, 4, s * 0.3, (k) => hf(i * 5 + k));
      }
    });
  },
  // pdc: the turret ring and barrel, the ammo belt feeding it; the rounds cook off along the belt
  pdc(g, { cells, X, Y, s, a, h }) {
    const [x, y] = cells[0], cx = X(x + 0.5), cy = Y(y + 0.5);
    g.fillStyle = '#3a4554'; disc(g, cx, cy, s * 0.36);
    g.fillStyle = '#6b7889'; disc(g, cx, cy, s * 0.2);
    g.strokeStyle = '#8b98a8'; g.lineWidth = s * 0.08; line(g, cx, cy, cx + s * 0.45, cy - s * 0.1);
    for (let i = 0; i < 12; i++) { // the belt: an arc of rounds round the ring
      const t = Math.PI * (0.6 + i * 0.09), px = cx + Math.cos(t) * s * 0.42, py = cy + Math.sin(t) * s * 0.42;
      const pop = 0.12 + h(i) * 0.8;
      if (a < pop) { g.fillStyle = '#d9b45a'; g.fillRect(px - 1.5, py - 1.5, 3, 3); }
      else if (a < pop + 0.08) glow(g, px, py, s * 0.35, [255, 225, 130], 1, false);
    }
  },
  // anything else (a kind added later): a console on a few cells, screens lit until the power goes
  generic(g, { cells, X, Y, s, a, h, hf }) {
    const lit = fall(a, 0.2, 0.5);
    cells.forEach(([x, y], i) => {
      if (h(i) > 0.45) return;
      g.fillStyle = '#3a4554'; g.fillRect(X(x + 0.2), Y(y + 0.25), s * 0.6, s * 0.4);
      g.fillStyle = css([110, 220, 180], 0.8 * lit * (hf(i) > 0.3 ? 1 : 0.3)); g.fillRect(X(x + 0.28), Y(y + 0.32), s * 0.44, s * 0.18);
    });
  },
};
