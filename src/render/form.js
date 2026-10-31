// The form: a ship's cell grid drawn bow up (ARCHITECTURE.md "The form").
// ship.cells[y][x] is null (void) or {room, cut}; the form's bow is the high-x end of the rows,
// so canvas row 0 is x = form.w - 1. A living job-room cell is lit in its room's colour,
// brighter with hp; frame is dim steel; a dead room is dark; a cut or torn cell drifts off
// the bridge side, dimmer. No text in cells. Pure canvas. No Math.random: drift is hashed
// from the cell's x and y, so it is the same every frame.
import { exposure, isPdc } from '../sim/ship.js';

const BG = [6, 8, 15];
const UNLIT = [22, 28, 36];      // a job room with no hp left to show would be this dark
const FRAME = [74, 83, 94];      // frame steel
const DEAD = [18, 21, 26];       // matches COLORS.dead in silhouette.js
const DEAD_EDGE = 'rgba(70,80,92,0.7)';
const WARN = '#ff3b3b';
// One colour per job room. Visual only.
export const ROOM_COLORS = {
  rail: [143, 208, 255], sensors: [110, 225, 190], pdc: [255, 208, 112], bridge: [235, 242, 255],
  crew: [140, 225, 130], tubes: [255, 84, 110], drive: [170, 150, 255],
};
// A room's colour: every PDC mount (pdc1 .. pdc6) is pdc yellow; frame has none (steel).
export const roomColor = (room) => ROOM_COLORS[isPdc(room) ? 'pdc' : room];
const NEAR_TAP = 8;              // px: a tap this close to a job-room cell still picks it
const DRIFT_GAP = 2.5;           // px a cut cell moves away from the bridge, plus up to DRIFT_JIT more
const DRIFT_JIT = 2.5;
const DRIFT_SIDE = 1.2;          // px of hashed sideways wobble

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
function hash01(n) {
  let x = (Math.imul(n | 0, 0x9E3779B1) + 0x7F4A7C15) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85EBCA77);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE3D);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const cellHash = (x, y, salt) => hash01(x * 73856093 + y * 19349663 + salt * 83492791);

// --- the grid on the canvas ---------------------------------------------------------

// Canvas columns run across the hull (form rows), canvas rows run bow to stern (form x, high first).
// facing -1 mirrors the columns, as the old silhouette did: 'me' keeps its spine on the left.
// box.horizontal (the hangar): bow right, form row 0 on top, columns are form x; facing is ignored.
const dims = (ship, box) => (box.horizontal
  ? { cols: ship.form.w, rows: ship.form.h, cw: box.w / ship.form.w, ch: box.h / ship.form.h }
  : { cols: ship.form.h, rows: ship.form.w, cw: box.w / ship.form.h, ch: box.h / ship.form.w });

// The canvas rect of form cell (x, y), in place (no drift).
export function cellRect(ship, x, y, box) {
  const { cols, rows, cw, ch } = dims(ship, box);
  if (box.horizontal) return { x: box.x + x * cw, y: box.y + y * ch, w: cw, h: ch };
  const col = ship.facing === -1 ? cols - 1 - y : y;
  const row = rows - 1 - x;
  return { x: box.x + col * cw, y: box.y + row * ch, w: cw, h: ch };
}

const isAdrift = (ship, c) => c.cut || !!(ship.pieces[c.room] && ship.pieces[c.room].torn);
const isLive = (ship, c) => !!ship.pieces[c.room] && ship.pieces[c.room].alive && !c.cut;

function eachCell(ship, fn) {
  for (let y = 0; y < ship.form.h; y++) for (let x = 0; x < ship.form.w; x++) {
    const c = ship.cells[y][x];
    if (c) fn(c, x, y);
  }
}

// Bounding box (canvas px) of a room's living cells, else of all its cells. Null if it has none.
export function roomBounds(ship, room, box) {
  let live = null, all = null;
  const add = (b, r) => (b ? { x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h) }
    : { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
  eachCell(ship, (c, x, y) => {
    if (c.room !== room) return;
    const r = cellRect(ship, x, y, box);
    all = add(all, r);
    if (isLive(ship, c)) live = add(live, r);
  });
  const b = live || all;
  return b ? { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 } : null;
}

// The canvas point of a room: the centroid of its living cells, else of all its cells.
// Where impact effects go. Falls back to the middle of the box for an unknown room.
export function roomPoint(ship, room, box) {
  let sx = 0, sy = 0, n = 0, ax = 0, ay = 0, an = 0;
  eachCell(ship, (c, x, y) => {
    if (c.room !== room) return;
    const r = cellRect(ship, x, y, box);
    ax += r.x + r.w / 2; ay += r.y + r.h / 2; an++;
    if (isLive(ship, c)) { sx += r.x + r.w / 2; sy += r.y + r.h / 2; n++; }
  });
  if (n) return { x: sx / n, y: sy / n };
  if (an) return { x: ax / an, y: ay / an };
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

// The job room under a canvas point, or null: void and frame are not targetable. A PDC mount is one
// cell (about 9 x 7 px), too small for a finger, so a point on void, frame or a seam picks the nearest
// job-room cell within NEAR_TAP px of its edge; with nothing in reach it is null.
export function roomAtPoint(ship, px, py, box) {
  const { cols, rows, cw, ch } = dims(ship, box);
  const col = Math.floor((px - box.x) / cw), row = Math.floor((py - box.y) / ch);
  if (col >= 0 && col < cols && row >= 0 && row < rows) {
    const y = box.horizontal ? row : ship.facing === -1 ? cols - 1 - col : col, x = box.horizontal ? col : rows - 1 - row;
    const c = ship.cells[y][x];
    if (c && !c.room.startsWith('frame:')) return c.room;
  }
  let best = null, bd = NEAR_TAP;
  eachCell(ship, (c, x, y) => {
    if (c.room.startsWith('frame:')) return;
    const r = cellRect(ship, x, y, box);
    const d = Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));
    if (d < bd) { bd = d; best = c.room; }
  });
  return best;
}

// --- drawing ------------------------------------------------------------------------

// Where a cell is drawn: in place, or adrift away from the bridge side (up past the bow
// end, down past the stern end) with a hashed wobble.
function drawnRect(ship, c, x, y, box, bridgeX) {
  const r = cellRect(ship, x, y, box);
  if (!isAdrift(ship, c)) return r;
  const dir = x < bridgeX ? 1 : -1; // canvas down (horizontal: left) toward the stern
  const along = dir * (DRIFT_GAP + DRIFT_JIT * cellHash(x, y, 1)), wob = (cellHash(x, y, 2) - 0.5) * 2 * DRIFT_SIDE;
  if (box.horizontal) { r.x -= along; r.y += wob; } else { r.y += along; r.x += wob; }
  return r;
}

function cellColor(ship, c) {
  const pc = ship.pieces[c.room];
  const adrift = isAdrift(ship, c);
  let col;
  if (!pc || !pc.alive) col = DEAD;
  else {
    const hp = clamp01(pc.hp / (pc.maxHp || 1));
    const base = roomColor(c.room);
    col = base ? mix(UNLIT, base, 0.4 + 0.6 * hp) : mix(UNLIT, FRAME, 0.65 + 0.35 * hp);
  }
  return adrift ? mix(col, BG, pc && pc.alive ? 0.45 : 0.2) : col;
}

function edgeStyle(ship, c) {
  const pc = ship.pieces[c.room];
  const adrift = isAdrift(ship, c);
  if (!pc || !pc.alive) return { s: DEAD_EDGE, w: 1 };
  const base = roomColor(c.room);
  if (!base) return { s: adrift ? 'rgba(120,132,146,0.35)' : 'rgba(140,155,170,0.6)', w: 1 };
  const plated = !!(ship.armor && ship.armor[c.room]);
  return { s: css(mix(base, [255, 255, 255], plated ? 0.7 : 0.4), adrift ? 0.5 : 0.95), w: plated ? 1.7 : 1.1 };
}

function chevron(ctx, ax, ay, dx, dy, size) {
  // apex (ax, ay), pointing along (dx, dy); arms trail back
  const ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(ax - Math.cos(ang - 0.75) * size, ay - Math.sin(ang - 0.75) * size);
  ctx.lineTo(ax, ay);
  ctx.lineTo(ax - Math.cos(ang + 0.75) * size, ay - Math.sin(ang + 0.75) * size);
}

// fx = { flash: {room: 0..1}, t: seconds (optional), warn: 0..1 red outline (optional),
//        exposure: false to hide the chevrons (default shown) }
export function drawForm(ctx, ship, box, fx = {}) {
  const t = fx.t || 0;
  const { cols, rows, cw, ch } = dims(ship, box);
  let bx = 0, bn = 0;
  eachCell(ship, (c, x) => { if (c.room === 'bridge') { bx += x; bn++; } });
  const bridgeX = bn ? bx / bn : ship.form.w / 2;
  const rects = [];                       // {c, x, y, r} per cell, as drawn
  eachCell(ship, (c, x, y) => rects.push({ c, x, y, r: drawnRect(ship, c, x, y, box, bridgeX) }));
  const at = new Map();                   // "x,y" -> entry, for the room outlines
  for (const e of rects) at.set(e.x + ',' + e.y, e);

  ctx.save();
  // plume out of the stern while the drive pushes
  const drive = ship.pieces.drive;
  const thrust = Math.abs(ship.thrust || 0);
  if (drive && drive.alive && thrust > 0.05 && !box.horizontal) { // the plume is drawn bow up only
    const db = roomBounds(ship, 'drive', box);
    if (db) {
      const flick = 0.78 + 0.22 * hash01(Math.floor(t * 30));
      const len = (ch * 1.2 + ch * 3.5 * thrust) * flick;
      const cx = db.x + db.w / 2, y0 = box.y + box.h, hw = Math.max(2, db.w * 0.4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, `rgba(170,210,255,${0.7 * flick})`);
      g.addColorStop(0.5, `rgba(110,160,255,${0.35 * flick})`);
      g.addColorStop(1, 'rgba(80,130,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - hw, y0); ctx.lineTo(cx, y0 + len); ctx.lineTo(cx + hw, y0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(235,245,255,${0.75 * flick})`;
      ctx.beginPath(); ctx.moveTo(cx - hw * 0.4, y0); ctx.lineTo(cx, y0 + len * 0.65); ctx.lineTo(cx + hw * 0.4, y0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // fills, with a thin seam of background between cells
  for (const { c, r } of rects) {
    ctx.fillStyle = css(cellColor(ship, c));
    ctx.fillRect(r.x + 0.4, r.y + 0.4, r.w - 0.8, r.h - 0.8);
  }

  // a stronger line around each room: an edge wherever the neighbour is another room, void or drifting apart
  const groups = new Map();               // style -> segments
  const edge = (e, nx, ny, x0, y0, x1, y1) => {
    const n = at.get(nx + ',' + ny);
    if (n && n.c.room === e.c.room && isAdrift(ship, n.c) === isAdrift(ship, e.c)) return;
    const st = edgeStyle(ship, e.c), key = st.s + '|' + st.w;
    if (!groups.has(key)) groups.set(key, { st, seg: [] });
    groups.get(key).seg.push(x0, y0, x1, y1);
  };
  for (const e of rects) {
    const { r, x, y } = e;
    // canvas up is form x + 1; canvas left/right is form y -/+ 1 (mirrored for facing -1)
    const left = ship.facing === -1 ? y + 1 : y - 1, right = ship.facing === -1 ? y - 1 : y + 1;
    if (box.horizontal) { // canvas left/right is form x -/+ 1, up/down is form y -/+ 1
      edge(e, x, y - 1, r.x, r.y, r.x + r.w, r.y);
      edge(e, x, y + 1, r.x, r.y + r.h, r.x + r.w, r.y + r.h);
      edge(e, x - 1, y, r.x, r.y, r.x, r.y + r.h);
      edge(e, x + 1, y, r.x + r.w, r.y, r.x + r.w, r.y + r.h);
      continue;
    }
    edge(e, x + 1, y, r.x, r.y, r.x + r.w, r.y);
    edge(e, x - 1, y, r.x, r.y + r.h, r.x + r.w, r.y + r.h);
    edge(e, x, left, r.x, r.y, r.x, r.y + r.h);
    edge(e, x, right, r.x + r.w, r.y, r.x + r.w, r.y + r.h);
  }
  ctx.lineCap = 'butt';
  for (const { st, seg } of groups.values()) {
    ctx.strokeStyle = st.s; ctx.lineWidth = st.w;
    ctx.beginPath();
    for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i], seg[i + 1]); ctx.lineTo(seg[i + 2], seg[i + 3]); }
    ctx.stroke();
  }

  // our own railgun aiming: the gun and the sensors pulse red
  if (ship.railAim >= 0) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 14);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,70,70,${0.18 + 0.2 * pulse})`;
    for (const { c, r } of rects) if ((c.room === 'rail' || c.room === 'sensors') && isLive(ship, c)) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  // impact flash: white that reads orange as it fades, over the room's cells
  if (fx.flash) {
    for (const room in fx.flash) {
      const f = clamp01(fx.flash[room]);
      if (f <= 0.01) continue;
      const g = Math.round(255 * f + 150 * (1 - f)), b = Math.round(255 * f + 50 * (1 - f));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = Math.min(cw, 14) * f;
      ctx.shadowColor = '#ff9a3c';
      ctx.fillStyle = `rgba(255,${g},${b},${0.9 * f})`;
      ctx.beginPath();
      for (const e of rects) if (e.c.room === room) ctx.rect(e.r.x, e.r.y, e.r.w, e.r.h);
      ctx.fill();
      ctx.restore();
    }
  }

  // exposure: chevrons pointing into the hull from where the fire comes
  if (fx.exposure !== false && ship.face && !box.horizontal) {
    const e = exposure(ship);
    const pulse = ship.turnLeft > 0 ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 9)) : 1;
    const size = Math.max(4, Math.min(7, cw * 0.6));
    const cx = box.x + box.w / 2, sideX = ship.facing === -1 ? box.x : box.x + box.w, sd = ship.facing === -1 ? 1 : -1;
    const marks = [];
    if (e === 'bow') marks.push([cx, box.y - 2, 0, 1]);
    else if (e === 'tail') marks.push([cx, box.y + box.h + 2, 0, -1]);
    else { marks.push([sideX - sd * 1, box.y + box.h * 0.33, -sd, 0]); marks.push([sideX - sd * 1, box.y + box.h * 0.67, -sd, 0]); }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [ax, ay, dx, dy] of marks) {
      chevron(ctx, ax, ay, dx, dy, size);
      ctx.strokeStyle = `rgba(6,8,15,${0.8 * pulse})`; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = ship.turnLeft > 0 ? `rgba(255,200,120,${0.95 * pulse})` : `rgba(219,234,254,${0.9 * pulse})`;
      ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.restore();
  }

  // red warning outline: a railgun is aiming at this ship
  if (fx.warn > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 8;
    ctx.shadowColor = WARN;
    ctx.strokeStyle = `rgba(255,60,60,${clamp01(fx.warn)})`;
    ctx.lineWidth = 1.5 + fx.warn;
    ctx.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    ctx.restore();
  }
  ctx.restore();
}

// A bracket around a room: four corner ticks just outside the bounding box of its cells,
// in `color`. The room one side's weapons are going for.
export function roomBracket(ctx, ship, room, box, color = '#ffffff', t = 0) {
  const b = roomBounds(ship, room, box);
  if (!b) return;
  const g = 2.5, x0 = b.x - g, y0 = b.y - g, x1 = b.x + b.w + g, y1 = b.y + b.h + g;
  const tick = Math.max(4, Math.min(b.w, b.h) * 0.4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 5);
  ctx.lineWidth = 2;
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [x, sx] of [[x0, 1], [x1, -1]]) {
    for (const [y, sy] of [[y0, 1], [y1, -1]]) {
      ctx.moveTo(x + sx * tick, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * tick);
    }
  }
  ctx.stroke();
  ctx.restore();
}
