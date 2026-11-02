// Room interiors by kind (the keys of hero.js BLAST), for the CINE cut (render/hero.js draws them through the hole a
// hit tears in a room, for a moment). Each draws a room from its own cells only, in a flat frame where the form's x runs
// right (bow) and y down (row 0 at the top): X(gx), Y(gy) css px, s px per cell; the caller sets the canvas transform
// that lays this frame onto the hull. Each also plays its death over `a` (s since the hit). One set serves every class.
// No Math.random: h() and hf() hash the shot's seed.
import { glow, hash01 } from './look.js';

const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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

export const INTERIOR = {
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
