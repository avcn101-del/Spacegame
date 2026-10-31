// The hangar's drawing: the previewed ship's form, bow right, with every hardpoint that has a pick
// marked and labelled (ARCHITECTURE.md "The hangar draws the form"). Pure canvas, no state:
// hud.js keeps the fit and the selection and calls drawHangar again on every change.
import { drawForm, cellRect, ROOM_COLORS } from './form.js';
import { T, roomKey } from '../text.js';

const SLOT_OF = { rail: 'gun', tubes: 'launcher', drive: 'drive' }; // room -> the slot that picks it
const CELL_MAX = 20;     // px: about 600 px for the Tachi's 28 columns
const MARGIN = 26;       // px above and below the hull, for the labels
const GROW = 4;          // px a hit box grows past its cells, so a finger finds a small part
const LABEL_FONT = '9px "SF Mono", Menlo, Consolas, monospace';
const LABEL_H = 13, LABEL_PAD = 4, LABEL_GAP = 4;

// Hardpoints of a ship: {slot, cells: [[x, y], ...]}, one per 4-connected group of a picked room's
// cells (the two tube bays are two). The PDC mounts have no pick, so they are not hardpoints.
export function hardpoints(ship) {
  const { w, h } = ship.form, out = [], seen = new Set();
  const room = (x, y) => (ship.cells[y] && ship.cells[y][x] ? ship.cells[y][x].room : null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = room(x, y), slot = SLOT_OF[r];
    if (!slot || seen.has(x + ',' + y)) continue;
    const cells = [], stack = [[x, y]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (a < 0 || b < 0 || a >= w || b >= h || seen.has(a + ',' + b) || room(a, b) !== r) continue;
      seen.add(a + ',' + b); cells.push([a, b]);
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    out.push({ slot, cells });
  }
  return out;
}

// Every job room's 4-connected cell groups (frame has no label): {room, cells}, biggest group of a room first.
export function roomGroups(ship) {
  const { w, h } = ship.form, out = [], seen = new Set();
  const room = (x, y) => (ship.cells[y] && ship.cells[y][x] ? ship.cells[y][x].room : null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = room(x, y);
    if (!r || r.startsWith('frame:') || seen.has(x + ',' + y)) continue;
    const cells = [], stack = [[x, y]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (a < 0 || b < 0 || a >= w || b >= h || seen.has(a + ',' + b) || room(a, b) !== r) continue;
      seen.add(a + ',' + b); cells.push([a, b]);
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    out.push({ room: r, cells });
  }
  return out.sort((a, b) => b.cells.length - a.cells.length);
}

// The room under a canvas point (any cell, frame included), or null on void / off the form.
export function roomAtCell(ship, px, py, W, H) {
  const box = hangarBox(ship, W, H), cw = box.w / ship.form.w, ch = box.h / ship.form.h;
  const x = Math.floor((px - box.x) / cw), y = Math.floor((py - box.y) / ch);
  if (x < 0 || y < 0 || x >= ship.form.w || y >= ship.form.h) return null;
  return ship.cells[y][x] ? ship.cells[y][x].room : null;
}

// The box the form is drawn in, centred in a W x H canvas: cells as big as fit, at most CELL_MAX.
export function hangarBox(ship, W, H) {
  const cell = Math.max(4, Math.min(CELL_MAX, (W - 16) / ship.form.w, (H - 2 * MARGIN) / ship.form.h));
  const w = cell * ship.form.w, h = cell * ship.form.h;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, horizontal: true };
}

const boundsOf = (ship, cells, box) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of cells) {
    const r = cellRect(ship, x, y, box);
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ROOM_OF_SLOT = { gun: 'rail', launcher: 'tubes', drive: 'drive' };

// Draws the ship and its marks. Returns the hit list [{slot, x, y, w, h}] in canvas CSS px.
// `sel` is the slot last tapped (lit brighter).
export function drawHangar(ctx, ship, fit, sel, W, H) {
  const box = hangarBox(ship, W, H);
  ctx.clearRect(0, 0, W, H);
  drawForm(ctx, ship, box, { exposure: false });

  // room names: inside the room when the text fits, else (below) beside it on a leader line
  ctx.save();
  ctx.font = LABEL_FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const groups = roomGroups(ship), named = new Set(), outside = [];
  for (const g of groups) {
    const key = roomKey(g.room), text = key === 'pdc' ? T.hangar.pdc : T.pieces[key], b = boundsOf(ship, g.cells, box);
    if (ctx.measureText(text).width + 2 <= b.w && 9 <= b.h) {
      ctx.fillStyle = 'rgba(6,8,15,0.88)';
      ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    } else if (key !== 'pdc' && !named.has(g.room)) outside.push({ g, key, text, b });
    named.add(g.room);
  }
  ctx.restore();

  const hp = hardpoints(ship).map((p) => ({ ...p, b: boundsOf(ship, p.cells, box) }));
  const mid = box.y + box.h / 2;

  // outlines: a solid box round each hardpoint
  ctx.save();
  for (const p of hp) {
    const col = ROOM_COLORS[ROOM_OF_SLOT[p.slot]] || [255, 255, 255];
    const on = p.slot === sel;
    ctx.strokeStyle = rgb(col, on ? 1 : 0.85);
    ctx.lineWidth = on ? 2.4 : 1.4;
    ctx.strokeRect(p.b.x - 1.5, p.b.y - 1.5, p.b.w + 3, p.b.h + 3);
  }
  ctx.restore();

  // one label per slot, in the margin above or below the hull, on a leader line from its first group
  ctx.save();
  ctx.font = LABEL_FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const labels = [];
  const seen = new Set();
  const used = { top: [], bottom: [] }; // x spans the variant labels take, for the room names beside
  for (const p of hp) {
    if (seen.has(p.slot)) continue;
    seen.add(p.slot);
    const text = T.catalog[fit[p.slot]] ? T.catalog[fit[p.slot]].name : fit[p.slot];
    labels.push({ p, text, tw: ctx.measureText(text).width + 2 * LABEL_PAD, cx: p.b.x + p.b.w / 2, top: p.b.y + p.b.h / 2 < mid });
  }
  // a keel-row group (dead centre) goes to the emptier side
  for (const l of labels) if (Math.abs(l.p.b.y + l.p.b.h / 2 - mid) < 1) l.top = labels.filter((o) => o.top).length <= labels.length / 2;
  for (const top of [true, false]) {
    const row = labels.filter((l) => l.top === top).sort((a, b) => a.cx - b.cx);
    let edge = 2;
    for (const l of row) { l.x = Math.max(edge, Math.min(W - 2 - l.tw, l.cx - l.tw / 2)); edge = l.x + l.tw + LABEL_GAP; }
    for (let i = row.length - 1, lim = W - 2; i >= 0; i--) { row[i].x = Math.min(row[i].x, lim - row[i].tw); lim = row[i].x - LABEL_GAP; }
    for (const l of row) {
      l.y = top ? 3 : H - 3 - LABEL_H;
      used[top ? 'top' : 'bottom'].push([l.x, l.x + l.tw]);
      const col = ROOM_COLORS[ROOM_OF_SLOT[l.p.slot]] || [255, 255, 255];
      const on = l.p.slot === sel;
      const fromY = top ? l.p.b.y - 1.5 : l.p.b.y + l.p.b.h + 1.5, toY = top ? l.y + LABEL_H : l.y;
      ctx.strokeStyle = rgb(col, 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(l.cx, fromY); ctx.lineTo(Math.max(l.x + 3, Math.min(l.x + l.tw - 3, l.cx)), toY); ctx.stroke();
      ctx.fillStyle = on ? 'rgba(16,36,58,0.95)' : 'rgba(6,8,15,0.9)';
      ctx.fillRect(l.x, l.y, l.tw, LABEL_H);
      ctx.strokeStyle = rgb(col, on ? 1 : 0.6); ctx.lineWidth = on ? 1.4 : 1;
      ctx.strokeRect(l.x + 0.5, l.y + 0.5, l.tw - 1, LABEL_H - 1);
      ctx.fillStyle = on ? '#ffffff' : rgb(col, 1);
      ctx.fillText(l.text, l.x + LABEL_PAD, l.y + LABEL_H / 2 + 0.5);
    }
  }
  // a room name that does not fit inside: a small label in the margin, clear of the variant labels
  for (const o of outside) {
    const top = o.b.y + o.b.h / 2 < mid, cx = o.b.x + o.b.w / 2, tw = ctx.measureText(o.text).width + 2 * LABEL_PAD;
    let x = Math.max(2, Math.min(W - 2 - tw, cx - tw / 2));
    const row = used[top ? 'top' : 'bottom'];
    for (let i = 0; i < 8 && row.some(([a, c]) => x < c + LABEL_GAP && x + tw > a - LABEL_GAP); i++) {
      const hit = row.find(([a, c]) => x < c + LABEL_GAP && x + tw > a - LABEL_GAP);
      x = hit[1] + LABEL_GAP; // slide right past it
    }
    x = Math.min(x, W - 2 - tw); row.push([x, x + tw]);
    const y = top ? 3 : H - 3 - LABEL_H, col = ROOM_COLORS[roomKey(o.g.room)] || [255, 255, 255];
    ctx.strokeStyle = rgb(col, 0.5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, top ? o.b.y : o.b.y + o.b.h); ctx.lineTo(Math.max(x + 3, Math.min(x + tw - 3, cx)), top ? y + LABEL_H : y); ctx.stroke();
    ctx.fillStyle = 'rgba(6,8,15,0.9)'; ctx.fillRect(x, y, tw, LABEL_H);
    ctx.strokeStyle = rgb(col, 0.6); ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, LABEL_H - 1);
    ctx.fillStyle = rgb(col, 1); ctx.fillText(o.text, x + LABEL_PAD, y + LABEL_H / 2 + 0.5);
  }
  ctx.restore();

  return hp.map((p) => ({ slot: p.slot, x: p.b.x - GROW, y: p.b.y - GROW, w: p.b.w + 2 * GROW, h: p.b.h + 2 * GROW, cx: p.b.x + p.b.w / 2, cy: p.b.y + p.b.h / 2 }));
}

// The hit box under a canvas point (the nearest hardpoint centre among the boxes that hold it), or null.
export function hitAt(hits, px, py) {
  let best = null, bd = Infinity;
  for (const h of hits) {
    if (px < h.x || px > h.x + h.w || py < h.y || py > h.y + h.h) continue;
    const d = Math.hypot(px - h.cx, py - h.cy);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
// The slot under a canvas point (the nearest hardpoint centre among the boxes that hold it), or null.
export function slotAt(hits, px, py) {
  let best = null, bd = Infinity;
  for (const h of hits) {
    if (px < h.x || px > h.x + h.w || py < h.y || py > h.y + h.h) continue;
    const d = Math.hypot(px - h.cx, py - h.cy);
    if (d < bd) { bd = d; best = h.slot; }
  }
  return best;
}
