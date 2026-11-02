// The hero window (spike, `?hero=1`, default off): my ship as an object, seen from astern and above, in a
// small window at the left of both battle views. Presentation only: reads battle, never writes it, owns no
// input (no hit-testing; drag and tap work underneath) and no screen fx (the close-up keeps shake and flash).
// Every shape is derived from the form (ship.form, ship.cells, the design's room kinds) by generic rules:
// a smooth silhouette from the grid (box blur + threshold), a keystone warp (the bow end narrower), a hull
// wall toward the camera, the deck lit from LOOK.KEY, a rim, raised blocks per room kind with contact
// shadows, PDC domes at form.mounts, a rail spine and barrel when the form has rail cells, an engine bell
// at the drive's stern edge, running lights. Nothing is drawn per class. The static hull is baked into one
// bitmap per battle and rebuilt when a room dies or a cell is cut; each frame draws only the plume and the
// lights. No Math.random: flicker and blink hash battle.t.
import { DESIGNS } from '../ships/index.js';
import { isPdc, mountSees } from '../sim/ship.js';
import { roomColor } from './form.js';
import { LOOK, drawPlume, glow, hash01, renderDpr } from './look.js';
import { INTERIOR } from './interior.js';
import { CINE } from './cine.js';

// Visual-only knobs. Not game numbers.
export const HERO = {
  PITCH: 0.95,          // rad the camera looks down from the hull's plane: deck readable, wall still shows
  KEYSTONE: 0.2,        // the bow end is this much narrower than the stern end (the far end is further away)
  SHIP_LEN: 0.62,       // share of the window height the hull may take; the rest is plume below and air above
  PLUME_LEN: 0.2,       // share of the window height the idle plume runs toward the camera
  BEAM_SHARE: 0.62,
  FLAT_W: 0.36,         // heroflat: the strip's width, share of the screen
  FLAT_H: 0.38,         // heroflat: the strip's height, share of the stage's (two corners leave the middle band free)
  FLAT_ALPHA: 0.55,
  // heropop: no window but during a cut; then a big one, so the ship is big (the owner: windows he hardly looked at)
  POP_W: 0.6,           // the cut window's width, share of the screen
  POP_H: 0.72,          // its height, share of the stage
  POP_DPR: 1.25,        // the big window's bake is made at this pixel ratio at most: its cost stays near the strip's
  POP_SHOW: 0.2,        // s the whole ship is shown before the camera pushes in (where on the ship it is)
  POP_ZOOM: 1.8,        // the push (the ship is already about twice the strip's)
  POP_ZOOM_TEAR: 1.2,
  POP_IN: 0.1,          // s fade in, POP_OUT fade out
  POP_OUT: 0.15,     // heroflat: the strips lie over the stage (the camera does not avoid them yet): see through     // share of the window width the beam takes when the width is fitted to the ship
  TAC_MAX_W: 0.34,      // TAC: the window is at most this share of the screen width
  TAC_MAX_H: 300,       // css px: on a tall screen the window stops growing
  TAC_MIN_W: 96,        // css px
  CU_MIN_W: 72,         // css px: the close-up window, never narrower
  CU_MAX_W: 140,        // css px
  GAP: 6,               // css px between the window and the map the camera fits in
  PAD: 6,               // css px between the TAC window and the HUD above and below
  ALPHA: 0.9,           // window background opacity
  RADIUS: 10,           // css px corner radius
  TEX: 10,              // texture px per cell: the shapes are blurred anyway; 16 doubled the bake for no visible gain
  BLUR: 0.42,           // box-blur radius as a share of a cell: rounds corners, keeps one-cell mounts
  THR_HULL: 0.36,       // threshold of the blurred hull: a little fatter than the cells, one cell survives
  THR_ROOM: 0.6,        // threshold of a room's blurred footprint: the block sits inside the hull
  WALL: 0.75,           // cells: hull wall height
  // Raised block height per room kind (cells above the deck): the drive highest, the bridge a tower,
  // crew and tubes mid, frame flat. A dead room sinks to DEAD_H and goes dark.
  HEIGHT: { drive: 1.5, core: 1.25, crew: 0.6, launcher: 0.6, sensors: 0.5, gun: 0.3, pdc: 0, frame: 0 },
  DEAD_H: 0.12,
  DOME: 0.55,           // cells: PDC dome radius
  BARREL: 2.2,          // cells the rail barrel runs past the bow
  // Hits (local to the window: no screen shake, no flash outside it). Scorch per hit and its cap match the dock's.
  SCORCH: { torpHit: 0.5, railHit: 0.4, pdcHit: 0.07 }, SCORCH_MAX: 0.75,
  NEG: 2,               // drawn frames of the negative impact frame on a rail hit or a tear (frames, not s: slow-mo would stretch it)
  PARTS: 160,           // cap on live sparks per window
  SMOKE_TIME: 5,        // s a dead room smokes after its glow
  // Incoming (and my PDC fire): what is in flight drawn at its real bearing in the window's frame (bow up = the
  // ship's heading). Distance is squeezed: SHOW km away sits just outside the window's edge, 0 km on the hull.
  TORP_SHOW: 6,         // km: a torpedo enters the window here, 4 s before it reaches the hull at full speed
  SLUG_SHOW: 15,        // km: a slug enters at the rail's range, so every shot crosses the window (about 2 s)
  EDGE: 10,             // css px past the window's edge where SHOW km sits (it slides in, not pops in)
  TRACER_SEG: 0.28,     // share of the dome-to-edge path one tracer streak covers
};

// Explosions by room kind (plan step 2): keyed by (event x room kind), never by ship class, so every class shares them.
// hit: the colour of a torpedo or rail hit on that kind; dead: what the room does when it dies (job rooms only).
// vent: a jet out of the hull's side (drive plasma, crew air); cook: delayed bursts over the room (tubes, PDC rounds);
// alarm: red emergency light pulsing (bridge); arcs: capacitors discharging along the room (rail); crackle: small
// electric sparks (sensors).
export const BLAST = {
  drive:    { hit: [150, 200, 255], dead: 'vent', col: [170, 215, 255], time: 1.6 },
  launcher: { hit: [255, 150, 60], dead: 'cook', col: [255, 150, 60], n: 4, gap: 0.3 },
  core:     { hit: [255, 190, 130], dead: 'alarm', col: [255, 50, 40], time: 4 },
  gun:      { hit: [170, 215, 255], dead: 'arcs', col: [170, 220, 255], time: 0.9 },
  crew:     { hit: [255, 170, 110], dead: 'vent', col: [225, 232, 240], time: 2.2 },
  sensors:  { hit: [200, 225, 255], dead: 'crackle', col: [140, 200, 255], n: 5, gap: 0.12 },
  pdc:      { hit: [255, 210, 120], dead: 'cook', col: [255, 225, 130], n: 3, gap: 0.12 },
};
const HIT_DEFAULT = { torpHit: [255, 150, 60], railHit: [170, 215, 255] };

const STEEL = [92, 104, 118], STEEL_DARK = [34, 40, 48], WALL_C = [52, 60, 70], DEAD = [26, 29, 34];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// A room's kind from its design (gun, sensors, core, crew, launcher, drive), pdc for a mount, frame else.
export function kindOf(ship, room) {
  if (isPdc(room)) return 'pdc';
  const r = ((DESIGNS[ship.design] || {}).rooms || []).find((q) => q.id === room);
  return r ? r.kind : 'frame';
}
const standing = (ship, c) => !!c && !c.cut && !!ship.pieces[c.room] && !ship.pieces[c.room].torn;

// --- geometry: the window and the projection -----------------------------------------------------

// Cell size (css px) that fits the hull's length in a window wh tall.
function cellForHeight(ship, wh) {
  const W = ship.form.w, zTop = HERO.WALL + Math.max(...Object.values(HERO.HEIGHT));
  return HERO.SHIP_LEN * wh / (W * Math.sin(HERO.PITCH) * (1 - HERO.KEYSTONE / 2) + zTop * Math.cos(HERO.PITCH));
}
// The window rect (css px, canvas coords) for a view on a canvas cw x ch. hud: {top, bottom} covered (TAC).
// side: 'me' at the left edge, 'them' at the right edge (the close-up only).
export function heroRect(view, ship, cw, ch, hud, side = 'me', flat = false, pop = false) {
  const Hc = ship.form.h;
  if (pop) { // heropop: the cut's window, big, in the same corners as the strips
    const top = view === 'tac' ? hud.top + HERO.PAD : 0, bot = view === 'tac' ? ch - hud.bottom - HERO.PAD : ch;
    const w = Math.round(cw * HERO.POP_W), h = Math.round((bot - top) * HERO.POP_H), x0 = view === 'tac' ? 8 : 0;
    return side === 'them' ? { x: cw - w, y: top, w, h } : { x: x0, y: bot - h, w, h };
  }
  if (flat) { // heroflat: a strip lying down, mine at the bottom left (bow right), theirs at the top right (bow left)
    const top = view === 'tac' ? hud.top + HERO.PAD : 0, bot = view === 'tac' ? ch - hud.bottom - HERO.PAD : ch;
    const w = clamp(Math.round(cw * HERO.FLAT_W), 160, 360), h = clamp(Math.round((bot - top) * HERO.FLAT_H), 56, 140);
    const x0 = view === 'tac' ? 8 : 0;
    return side === 'them' ? { x: cw - w, y: top, w, h } : { x: x0, y: bot - h, w, h };
  }
  if (view === 'tac') {
    const y = hud.top + HERO.PAD, h = Math.max(40, Math.min(HERO.TAC_MAX_H, ch - hud.top - hud.bottom - 2 * HERO.PAD));
    const w = clamp(Math.ceil(cellForHeight(ship, h) * Hc / HERO.BEAM_SHARE), HERO.TAC_MIN_W, Math.round(cw * HERO.TAC_MAX_W));
    return { x: side === 'them' ? cw - w - 8 : 8, y, w, h }; // theirs on TAC: only for a cut, at the right edge
  }
  const h = ch, w = clamp(Math.ceil(cellForHeight(ship, h) * Hc / HERO.BEAM_SHARE), HERO.CU_MIN_W, HERO.CU_MAX_W);
  return { x: side === 'them' ? cw - w : 0, y: 0, w, h };
}
// The projection for a window ww x wh: form x (stern 0, bow W) runs up the window, form y across it (row 0
// on the left: bow up, as the map draws a ship heading up). z: cells above the hull's base.
function projection(ship, ww, wh) {
  const W = ship.form.w, Hc = ship.form.h, sp = Math.sin(HERO.PITCH), cp = Math.cos(HERO.PITCH), K = HERO.KEYSTONE;
  const c = Math.min(cellForHeight(ship, wh), HERO.BEAM_SHARE * ww / Hc);
  const zTop = HERO.WALL + Math.max(...Object.values(HERO.HEIGHT));
  const hull = c * (W * sp * (1 - K / 2) + zTop * cp), plume = HERO.PLUME_LEN * wh;
  const yNear = Math.round((wh - hull - plume) / 2 + hull + HERO.WALL * cp * c * 0.5);
  const k = (u) => 1 - K * u;
  // gx in cells from the stern, gy in cells from row 0's outer edge, z in cells
  const P = (gx, gy, z = 0) => {
    const u = gx / W;
    return { x: ww / 2 + (gy - Hc / 2) * c * k(u), y: yNear - c * W * sp * (u - K * u * u / 2) - z * c * cp * k(u), k: k(u) };
  };
  return { c, P, zPx: c * cp, W, Hc, ww, wh, yNear };
}

// --- masks: blur + threshold of a set of cells, in texture space (TEX px per cell, row 0 = bow) ---------

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + clamp(x, 0, w - 1)] * (x >= 0 && x < w ? 1 : 0);
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      const a = x - r, b = x + r + 1;
      if (a >= 0) s -= src[y * w + a];
      if (b < w) s += src[y * w + b];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y <= r && y < h; y++) s += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      const a = y - r, b = y + r + 1;
      if (a >= 0) s -= tmp[a * w + x];
      if (b < h) s += tmp[b * w + x];
    }
  }
  return out;
}
// A soft mask of the cells that pass `keep`, as alpha 0..1, cropped to their bounding box plus one cell.
// gy0: the form row (cells) at the texture's left edge; gxTop: the form x (cells from the stern) at its top.
function blob(ship, keep, thr) {
  const T = HERO.TEX, W = ship.form.w, Hc = ship.form.h;
  let x0 = W, x1 = -1, y0 = Hc, y1 = -1;
  for (let y = 0; y < Hc; y++) for (let x = 0; x < W; x++) if (keep(ship.cells[y][x], x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const gy0 = y0 - 1, gxTop = x1 + 2, tw = (y1 - y0 + 3) * T, th = (x1 - x0 + 3) * T, a = new Float32Array(tw * th);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!keep(ship.cells[y][x], x, y)) continue;
    const tx0 = (y - gy0) * T, ty0 = (gxTop - 1 - x) * T;
    for (let j = 0; j < T; j++) a.fill(1, (ty0 + j) * tw + tx0, (ty0 + j) * tw + tx0 + T);
  }
  const r = Math.max(1, Math.round(HERO.BLUR * T));
  const b = boxBlur(boxBlur(a, tw, th, r), tw, th, r);
  for (let i = 0; i < b.length; i++) { const v = (b[i] - thr) / 0.12 + 0.5; b[i] = v <= 0 ? 0 : v >= 1 ? 1 : v; }
  return { a: b, tw, th, gy0, gxTop };
}
// Paint a mask into a canvas: colour per texel from fn(tx, ty) -> [r, g, b], alpha from the mask.
function paint(m, fn, alpha = 1) {
  const cv = newCanvas(m.tw, m.th), g = cv.getContext('2d'), img = g.createImageData(m.tw, m.th), d = img.data;
  for (let ty = 0; ty < m.th; ty++) for (let tx = 0; tx < m.tw; tx++) {
    const i = ty * m.tw + tx, v = m.a[i];
    if (v <= 0) continue;
    const col = fn(tx, ty);
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255 * v * alpha;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// Warp a texture onto ctx through the projection at height z (cells): one slice per two texture rows.
function warp(ctx, tex, m, pr, z) {
  const T = HERO.TEX, step = 2;
  for (let ty = 0; ty < m.th; ty += step) {
    const gx0 = m.gxTop - ty / T, gx1 = m.gxTop - (ty + step) / T; // far edge, near edge of the slice
    const a = pr.P(gx0, m.gy0, z), b = pr.P(gx1, m.gy0, z), e = pr.P(gx1, m.gy0 + m.tw / T, z);
    ctx.drawImage(tex, 0, ty, m.tw, step, b.x, a.y, e.x - b.x, b.y - a.y + 0.35);
  }
}
// Warp once into a scratch layer, then stack it from 0 to px css px up (a wall or a block's sides).
// The device-px box a mask covers once warped at height z, padded, clipped to a canvas cv. Every layer op below works
// in such a box, not the whole window: a block is a small part of it (a big heropop window baked 3x faster).
function devBox(m, pr, z, dpr, cv, pad = 4) {
  const T = HERO.TEX, ps = [[m.gxTop, m.gy0], [m.gxTop, m.gy0 + m.tw / T], [m.gxTop - m.th / T, m.gy0], [m.gxTop - m.th / T, m.gy0 + m.tw / T]].map(([x, y]) => pr.P(x, y, z));
  const x0 = Math.max(0, Math.floor((Math.min(...ps.map((p) => p.x)) - pad) * dpr)), y0 = Math.max(0, Math.floor((Math.min(...ps.map((p) => p.y)) - pad) * dpr));
  const x1 = Math.min(cv.width, Math.ceil((Math.max(...ps.map((p) => p.x)) + pad) * dpr)), y1 = Math.min(cv.height, Math.ceil((Math.max(...ps.map((p) => p.y)) + pad) * dpr));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
function stack(g, scratch, tex, m, pr, z, px, dpr) {
  const q = scratch.getContext('2d'), b = devBox(m, pr, z, dpr, scratch), o = scratch.box || b;
  q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(o.x, o.y, o.w, o.h); q.clearRect(b.x, b.y, b.w, b.h); scratch.box = b;
  q.setTransform(dpr, 0, 0, dpr, 0, 0); warp(q, tex, m, pr, z);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  for (let s = 0; s <= px; s += 0.75) g.drawImage(scratch, b.x, b.y, b.w, b.h, b.x, b.y - Math.round(s * dpr), b.w, b.h);
  g.restore();
  return scratch;
}

// Fill a canvas layer with the key-light gradient over what is already there (source-atop).
// box: css px to fill (the gradient still spans the whole window), else all of it.
function keyLight(g, ww, wh, lit, dark, box = null) {
  const K = KEY, cx = ww / 2, cy = wh / 2, L = Math.hypot(ww, wh) / 2;
  const gr = g.createLinearGradient(cx + K.x * L, cy + K.y * L, cx - K.x * L, cy - K.y * L);
  gr.addColorStop(0, `rgba(255,255,255,${lit})`); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${dark})`);
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr;
  if (box) g.fillRect(box.x, box.y, box.w, box.h); else g.fillRect(0, 0, ww, wh);
  g.restore();
}
// A rim on the edges facing the light: the shape less itself shifted away from the light.
let rimCv = null;
// b: the device-px box to work in (devBox), else the whole layer.
function rim(dst, layer, dpr, col, a, px = LOOK.RIM_PX, b = null) {
  if (!rimCv || rimCv.width !== layer.width || rimCv.height !== layer.height) rimCv = newCanvas(layer.width, layer.height);
  const r = rimCv, g = r.getContext('2d'), B = b || { x: 0, y: 0, w: layer.width, h: layer.height };
  const kx = KEY.x * px * dpr, ky = KEY.y * px * dpr;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath(); g.rect(B.x, B.y, B.w, B.h); g.clip(); // source-in clears all it covers: keep it to the box
  g.globalCompositeOperation = 'source-over'; g.clearRect(B.x, B.y, B.w, B.h);
  g.drawImage(layer, B.x, B.y, B.w, B.h, B.x, B.y, B.w, B.h);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(B.x, B.y, B.w, B.h);
  g.globalCompositeOperation = 'destination-out';
  // the shape shifted away from the light: the box's source moved by the key, kept inside the layer
  const sx0 = Math.max(0, B.x + kx), sy0 = Math.max(0, B.y + ky), sx1 = Math.min(layer.width, B.x + B.w + kx), sy1 = Math.min(layer.height, B.y + B.h + ky);
  if (sx1 > sx0 && sy1 > sy0) g.drawImage(layer, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - kx, sy0 - ky, sx1 - sx0, sy1 - sy0);
  g.restore();
  dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = a; dst.drawImage(r, B.x, B.y, B.w, B.h, B.x, B.y, B.w, B.h); dst.restore();
}

// --- the bake: the static hull, one bitmap per battle and hull state --------------------------------

// The key light the bake uses, in the bake's own frame: LOOK.KEY, or turned so that it lands on LOOK.KEY once a flat
// window (heroflat) has turned the bitmap a quarter round.
let KEY = LOOK.KEY;
function bake(ship, ww, wh, dpr, key = LOOK.KEY) {
  const prevKey = KEY; KEY = key;
  try { return bakeLit(ship, ww, wh, dpr); } finally { KEY = prevKey; }
}
function bakeLit(ship, ww, wh, dpr) {
  const pr = projection(ship, ww, wh), { c, P, zPx } = pr;
  const out = newCanvas(ww * dpr, wh * dpr), g = out.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const layer = () => { const l = newCanvas(ww * dpr, wh * dpr), q = l.getContext('2d'); q.setTransform(dpr, 0, 0, dpr, 0, 0); return [l, q]; };
  const hull = blob(ship, (cell) => standing(ship, cell), HERO.THR_HULL);
  const info = { lights: [], bell: null, pr, top: {} }; // top: room -> z (cells) of its block's top, for hit fx
  if (!hull) return { canvas: out, info };
  const T = HERO.TEX;
  // deck colour per cell: steel, a faint tint of a job room (dark when dead)
  const deckCol = ship.cells.map((row) => row.map((cell) => {
    if (!cell || kindOf(ship, cell.room) === 'frame') return STEEL;
    return mix(STEEL, ship.pieces[cell.room].alive ? roomColor(cell.room) || STEEL : DEAD, 0.16);
  }));
  const scratch = newCanvas(ww * dpr, wh * dpr);

  // 1. the hull wall: the silhouette at the base, stacked up to the deck; the side toward the light lighter
  const wallTex = paint(hull, () => WALL_C);
  const [wl, wq] = layer();
  stack(wq, scratch, wallTex, hull, pr, 0, HERO.WALL * zPx, dpr);
  const gr = wq.createLinearGradient(0, 0, ww, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
  wq.save(); wq.globalCompositeOperation = 'source-atop'; wq.fillStyle = gr; wq.fillRect(0, 0, ww, wh); wq.restore();
  g.drawImage(wl, 0, 0, ww, wh);

  // 2. the deck: steel, a faint tint of each job room, plate seams every cell
  const deckTex = paint(hull, (tx, ty) => {
    const y = Math.floor(tx / T) + hull.gy0, x = hull.gxTop - 1 - Math.floor(ty / T);
    let col = y >= 0 && y < ship.form.h && x >= 0 && x < ship.form.w ? deckCol[y][x] : STEEL;
    if (tx % (2 * T) === 0 || ty % (2 * T) === 0) col = mul(col, 0.92); // seams every two cells: plates, not a grid
    return col;
  });
  const [dl, dq] = layer();
  warp(dq, deckTex, hull, pr, HERO.WALL);
  keyLight(dq, ww, wh, LOOK.SHADE_LIT, LOOK.SHADE_DARK);
  g.drawImage(dl, 0, 0, ww, wh);
  rim(g, dl, dpr, 'rgb(220,236,255)', LOOK.RIM);

  // 3. raised blocks per room kind, far (bow) first so the near ones overlap
  const rooms = [];
  for (let y = 0; y < ship.form.h; y++) for (let x = 0; x < ship.form.w; x++) {
    const cell = ship.cells[y][x];
    if (!standing(ship, cell)) continue;
    let r = rooms.find((q) => q.room === cell.room);
    if (!r) rooms.push(r = { room: cell.room, kind: kindOf(ship, cell.room), sx: 0, sy: 0, n: 0, x0: x, x1: x });
    r.sx += x + 0.5; r.sy += y + 0.5; r.n++; r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x);
  }
  rooms.sort((p, q) => q.sx / q.n - p.sx / p.n);
  const deckZ = HERO.WALL, [tl, tq] = layer(); // one layer for every block's top, cleared per block
  for (const r of rooms) {
    const alive = ship.pieces[r.room].alive, h = alive ? HERO.HEIGHT[r.kind] || 0 : (r.kind === 'frame' || r.kind === 'pdc' ? 0 : HERO.DEAD_H);
    if (!(h > 0)) continue;
    const m = blob(ship, (cell) => standing(ship, cell) && cell.room === r.room, HERO.THR_ROOM);
    if (!m) continue;
    const top = alive ? mix(STEEL, roomColor(r.room) || STEEL, 0.55) : DEAD;
    const hPx = h * zPx;
    // contact shadow: the footprint, dark, pushed away from the light by the block's height
    const sh = paint(m, () => [0, 0, 0], 0.5);
    g.save(); g.translate(-KEY.x * hPx * 0.9, -KEY.y * hPx * 0.9); warp(g, sh, m, pr, deckZ); g.restore();
    // sides: the footprint stacked, darker toward the deck
    const sideTex = paint(m, () => mul(top, 0.42));
    stack(g, scratch, sideTex, m, pr, deckZ, hPx, dpr);
    // top: the room colour, lit, with a rim
    const tb = devBox(m, pr, deckZ + h, dpr, tl, 6), ob = tl.box || tb; tl.box = tb;
    tq.setTransform(1, 0, 0, 1, 0, 0); tq.clearRect(ob.x, ob.y, ob.w, ob.h); tq.clearRect(tb.x, tb.y, tb.w, tb.h); tq.setTransform(dpr, 0, 0, dpr, 0, 0);
    warp(tq, paint(m, () => top), m, pr, deckZ + h);
    keyLight(tq, ww, wh, LOOK.SHADE_LIT * 1.4, LOOK.SHADE_DARK * 0.8, { x: tb.x / dpr, y: tb.y / dpr, w: tb.w / dpr, h: tb.h / dpr });
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tl, tb.x, tb.y, tb.w, tb.h, tb.x, tb.y, tb.w, tb.h); g.restore();
    rim(g, tl, dpr, 'rgb(240,248,255)', alive ? LOOK.RIM : 0.25, LOOK.RIM_PX, tb);
    r.top = deckZ + h;
  }
  for (const r of rooms) info.top[r.room] = r.top || deckZ + (r.kind === 'pdc' ? HERO.DOME * 0.8 : 0);
  // incoming fire homes on a room's centre, or on the hull's when it goes for no room
  info.center = rooms.reduce((a, r) => [a[0] + r.sx, a[1] + r.sy, a[2] + r.n], [0, 0, 0]);
  info.center = [info.center[0] / info.center[2], info.center[1] / info.center[2]];
  info.rc = {};
  for (const r of rooms) info.rc[r.room] = [r.sx / r.n, r.sy / r.n];

  // 4. the rail: a spine along its cells and a barrel past the bow (only when the form has rail cells)
  const rail = rooms.find((r) => r.kind === 'gun');
  if (rail) {
    const gy = rail.sy / rail.n, z = (rail.top || deckZ) + 0.05;
    const a = P(rail.x0 + 0.2, gy, z), b = P(rail.x1 + 1, gy, z), e = P(rail.x1 + 1 + HERO.BARREL, gy, z);
    const alive = ship.pieces[rail.room].alive;
    g.lineCap = 'round';
    g.strokeStyle = css(alive ? [70, 84, 100] : DEAD); g.lineWidth = c * 0.62 * a.k; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = css(alive ? [150, 196, 235] : [50, 56, 64]); g.lineWidth = c * 0.22 * a.k; g.beginPath(); g.moveTo(a.x - c * 0.1, a.y); g.lineTo(b.x - c * 0.1, b.y); g.stroke();
    g.strokeStyle = css(alive ? [110, 124, 140] : DEAD); g.lineWidth = c * 0.34 * e.k; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(e.x, e.y); g.stroke();
    g.fillStyle = css(alive ? [180, 220, 255] : [60, 66, 74]); g.beginPath(); g.arc(e.x, e.y, c * 0.22 * e.k, 0, Math.PI * 2); g.fill();
  }

  // 5. PDC domes at the mounts
  (ship.form.mounts || []).forEach(([mx, my], i) => {
    const room = `pdc${i + 1}`, cell = ship.cells[my] && ship.cells[my][mx];
    if (!standing(ship, cell)) return;
    const alive = ship.pieces[room].alive, p = P(mx + 0.5, my + 0.5, deckZ), r = HERO.DOME * c * p.k;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(p.x - KEY.x * r * 0.6, p.y - KEY.y * r * 0.4, r * 1.1, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    const base = alive ? roomColor(room) : DEAD, top = { x: p.x, y: p.y - r * 0.45 };
    const dg = g.createRadialGradient(top.x + KEY.x * r * 0.45, top.y + KEY.y * r * 0.45, r * 0.1, top.x, top.y, r * 1.05);
    dg.addColorStop(0, css(mix(base, [255, 255, 255], alive ? 0.55 : 0.1))); dg.addColorStop(0.55, css(mix(base, STEEL, 0.35))); dg.addColorStop(1, css(mul(base, 0.35)));
    g.fillStyle = dg;
    g.beginPath(); g.ellipse(top.x, top.y, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
  });

  // 6. the engine bell at the drive's stern edge (dynamic glow and plume are drawn per frame)
  const drive = rooms.find((r) => r.kind === 'drive');
  if (drive) {
    let y0 = Infinity, y1 = -Infinity;
    for (let y = 0; y < ship.form.h; y++) for (let x = 0; x <= drive.x0; x++) {
      const cell = ship.cells[y][x];
      if (standing(ship, cell) && cell.room === drive.room && x === drive.x0) { y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
    }
    const gy = (y0 + y1) / 2, mouth = P(drive.x0 - 0.35, gy, HERO.WALL * 0.5), rw = Math.max(1.5, (y1 - y0) * 0.36 * c);
    const alive = ship.pieces[drive.room].alive;
    const bg = g.createLinearGradient(mouth.x - rw, 0, mouth.x + rw, 0);
    bg.addColorStop(0, css([128, 138, 150])); bg.addColorStop(0.45, css([70, 78, 88])); bg.addColorStop(1, css(STEEL_DARK));
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(mouth.x - rw * 0.7, mouth.y - rw * 0.9); g.lineTo(mouth.x + rw * 0.7, mouth.y - rw * 0.9);
    g.lineTo(mouth.x + rw, mouth.y); g.lineTo(mouth.x - rw, mouth.y); g.closePath(); g.fill();
    g.fillStyle = css(alive ? [40, 30, 34] : [16, 18, 22]);
    g.beginPath(); g.ellipse(mouth.x, mouth.y, rw, rw * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(200,214,230,0.6)'; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(mouth.x, mouth.y, rw, rw * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    if (alive) info.bell = { x: mouth.x, y: mouth.y, r: rw };
  }

  // 7. running lights: the outermost standing cells port (row 0 side, red) and starboard (green) nearest a
  // quarter of the way from the stern, and the bow tip (white strobe). Positions only; drawn per frame.
  const side = (pick) => {
    let best = null;
    for (let y = 0; y < ship.form.h; y++) for (let x = 0; x < ship.form.w; x++) {
      if (!standing(ship, ship.cells[y][x])) continue;
      const score = pick(y) * 100 - Math.abs(x - ship.form.w * 0.25);
      if (!best || score > best.score) best = { score, x, y };
    }
    return best;
  };
  const port = side((y) => -y), star = side((y) => y);
  if (port) info.lights.push({ ...P(port.x + 0.5, port.y + 0.15, deckZ), col: [255, 70, 70], kind: 'steady' });
  if (star) info.lights.push({ ...P(star.x + 0.5, star.y + 0.85, deckZ), col: [80, 255, 140], kind: 'steady' });
  let bow = null;
  for (let x = ship.form.w - 1; x >= 0 && !bow; x--) {
    const ys = [];
    for (let y = 0; y < ship.form.h; y++) if (standing(ship, ship.cells[y][x])) ys.push(y);
    if (ys.length) bow = { x, y: (ys[0] + ys[ys.length - 1] + 1) / 2 };
  }
  if (bow) info.lights.push({ ...P(bow.x + 0.9, bow.y, deckZ + 0.1), col: [255, 255, 255], kind: 'strobe' });
  return { canvas: out, info };
}

// The hull state that invalidates the bake: dead and torn rooms, cut cells.
function hullKey(ship) {
  let k = '';
  for (const id in ship.pieces) { const p = ship.pieces[id]; if (!p.alive || p.torn) k += id + (p.torn ? 't' : 'd') + ','; }
  for (let y = 0; y < ship.form.h; y++) for (let x = 0; x < ship.form.w; x++) { const c = ship.cells[y][x]; if (c && c.cut) k += `${x}.${y},`; }
  return k;
}

// --- the window -----------------------------------------------------------------------------

// canvases: {tac, closeup} the canvas each view draws on; hud(): {top, bottom} css px the HUD covers on TAC.
// twin: the close-up shows their ship too, in a window at the right edge (same pose as mine). TAC: mine only.
export function makeHero(canvases, hud, { twin = false, flat: flat0 = false, pop = false } = {}) {
  const flat = flat0 || pop; // heropop: the cut's window lies down too
  const cache = {}; // side -> {key, canvas, info}
  // TAC shows their window too, but only while a cut of theirs plays (the owner: no enemy cam on TAC, but the cut yes)
  const sides = (view) => (twin ? ['me', 'them'] : ['me']);
  const rectFor = (view, ship, side) => {
    const cv = canvases[view];
    if (!cv || !cv.clientWidth || !cv.clientHeight) return null;
    return heroRect(view, ship, cv.clientWidth, cv.clientHeight, view === 'tac' ? hud() : { top: 0, bottom: 0 }, side, flat, pop);
  };
  // css px the camera's view rect must leave free at the left (my window) and the right (theirs): 0 with no window
  function left(view, battle) {
    if (flat) return view === 'tac' ? 8 : 0; // the strips lie in the corners: the camera keeps its own insets
    const r = battle && rectFor(view, battle.ships[0], 'me');
    return r ? r.x + r.w + HERO.GAP : 0;
  }
  function right(view, battle) {
    if (flat || view === 'tac') return 0; // TAC: their window only comes for a cut, over the map; the camera keeps its inset
    if (!battle || !sides(view).includes('them')) return 0;
    const r = rectFor(view, battle.ships[1], 'them');
    return r ? r.w + HERO.GAP : 0;
  }
  // the window rect of a side in a view (css px), or null: for taps
  const rect = (view, battle, side) => (battle && !pop && sides(view).includes(side) ? rectFor(view, battle.ships[side === 'me' ? 0 : 1], side) : null);
  // shot: the CINE cut playing (cine.current()), or null; it is drawn in the window of the ship it is about
  function draw(view, battle, shot = null) {
    for (const side of sides(view)) drawOne(view, battle, side, shot && shot.side === side ? shot : null);
  }
  function drawOne(view, battle, side, shot) {
    const cv = canvases[view], ship = battle.ships[side === 'me' ? 0 : 1], r = rectFor(view, ship, side);
    if (!r || (pop && !shot) || (view === 'tac' && side === 'them' && !shot)) return; // heropop, and theirs on TAC: only while a cut plays
    // vr: the window as the ship is drawn in it, bow up. A flat strip (heroflat) is that picture turned a quarter
    // round (M: bow right for mine, bow left for theirs), the key light turned back so it still comes from LOOK.KEY.
    const vr = flat ? { w: r.h, h: r.w } : { w: r.w, h: r.h };
    const M = !flat ? [1, 0, 0, 1, 0, 0] : side === 'me' ? [0, 1, -1, 0, r.w, 0] : [0, -1, 1, 0, 0, r.h];
    const lk = !flat ? LOOK.KEY : side === 'me' ? { x: LOOK.KEY.y, y: -LOOK.KEY.x } : { x: -LOOK.KEY.y, y: LOOK.KEY.x };
    const dpr = renderDpr(), bdpr = pop ? Math.min(dpr, HERO.POP_DPR) : dpr; // bdpr: the bake's pixel ratio
    const key = `${battle.seed}|${view}|${vr.w}x${vr.h}@${bdpr}|${flat ? side : ''}|${hullKey(ship)}`;
    if (!cache[side] || cache[side].key !== key) cache[side] = { key, ...bake(ship, vr.w, vr.h, bdpr, lk) };
    const c = cache[side];
    const g = cv.getContext('2d');
    // a cut: the window grows over the stage (R) and the camera pushes on the impact; the bake stays at its own size
    const cut = shot ? cutFrame(shot, r, cv, c.info, side, M) : null, R = cut ? cut.R : r;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pop) g.globalAlpha = clamp(Math.min(shot.age / HERO.POP_IN, (shot.T - shot.age) / HERO.POP_OUT), 0, 1);
    g.translate(R.x, R.y);
    // the window: dark glass, rounded; on the close-up it sits on the stage's edge, square on that side
    const rad = HERO.RADIUS, corners = view !== 'closeup' ? rad : side === 'me' ? [0, rad, rad, 0] : [rad, 0, 0, rad];
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, R.w, R.h, flat ? rad : corners); else g.rect(0, 0, R.w, R.h);
    const bg = g.createLinearGradient(0, 0, 0, R.h), al = flat && !cut ? HERO.FLAT_ALPHA : HERO.ALPHA;
    bg.addColorStop(0, `rgba(10,15,26,${al})`); bg.addColorStop(1, `rgba(4,6,11,${al})`);
    g.fillStyle = bg; g.fill();
    g.strokeStyle = side === 'me' ? 'rgba(140,165,200,0.28)' : 'rgba(255,160,80,0.32)'; g.lineWidth = 1; g.stroke(); // their window edged in their colour
    g.clip();
    g.save();
    if (cut) { g.translate(cut.A.x - cut.Z * cut.F0.x, cut.A.y - cut.Z * cut.F0.y); g.scale(cut.Z, cut.Z); }
    g.transform(...M);
    const t = battle.t || 0, info = c.info;
    // the idle plume, behind the bell's mouth toward the camera
    if (info.bell) {
      const b = info.bell;
      drawPlume(g, b.x, b.y, 0, 1, HERO.PLUME_LEN * vr.h, b.r * 0.9, t, side === 'me' ? 11 : 23);
    }
    g.drawImage(c.canvas, 0, 0, vr.w, vr.h);
    drawHits(g, side, info, vr, battle.t || 0, ship);
    drawIncoming(g, side, info, vr, battle, ship);
    if (info.bell) glow(g, info.bell.x, info.bell.y, info.bell.r * 1.6, [150, 200, 255], 0.35, false);
    // running lights: steady with a slow breath, the bow strobe flashes once every 1.6 s
    for (const L of info.lights) {
      const a = L.kind === 'strobe' ? ((t % 1.6) < 0.08 ? 0.9 : 0) : 0.55 + 0.15 * Math.sin(t * 2.1);
      if (a <= 0) continue;
      g.fillStyle = css(L.col, Math.min(1, a + 0.3)); g.beginPath(); g.arc(L.x, L.y, 1.1, 0, Math.PI * 2); g.fill();
      glow(g, L.x, L.y, 6, L.col, a * 0.6, false);
    }
    if (cut) drawCut(g, shot, cut, info, ship, vr, bdpr, lk);
    g.restore();
    if (cut) {
      // the flash of the impact, over the whole window
      if (shot.age < 0.08) { g.fillStyle = `rgba(255,255,255,${0.75 * (1 - shot.age / 0.08)})`; g.fillRect(0, 0, R.w, R.h); }
    }
    g.restore();
  }

  // --- the CINE cut (render/cine.js picks the beat; it is drawn here, on the ship it hit) ----------------------------
  // The window grows from its width to CINE.W of the screen toward the stage, the camera pushes on the room (or the
  // break), the room's hull rips into pieces (one per half cell, flying out from the impact and along the shot), a
  // burning hole is left, the room's interior (render/interior.js) flashes through it; a tear: the section that broke
  // off (baked on its own from the cells that went) drifts away and turns. The live bake under it already shows the
  // room dead (a room's death rebakes the hull): the flash covers the swap. All in the window's own coordinates.
  const ease = (x) => x * x * (3 - 2 * x);
  let cutKey = 0, cutMem = null; // what the cut playing has built once: the chunks, the section's bake
  // r: the window's rect on screen; M: the turn from the bow-up picture to it (heroflat), identity else.
  function cutFrame(shot, r, cv, info, side, M) {
    const a = shot.age, T = shot.T;
    // heropop: the window is already big and does not grow; the whole ship first, then the push
    const grow = pop ? 0 : ease(clamp(Math.min(a / CINE.GROW, (T - a) / CINE.SHRINK), 0, 1));
    const v = ease(clamp(Math.min((a - (pop ? HERO.POP_SHOW : 0)) / CINE.ZOOM_IN, (T - a) / CINE.ZOOM_OUT), 0, 1));
    const zMax = pop ? (shot.kind === 'tear' ? HERO.POP_ZOOM_TEAR : HERO.POP_ZOOM) : shot.kind === 'tear' ? CINE.ZOOM_TEAR : CINE.ZOOM;
    const Z = 1 + (zMax - 1) * v;
    const maxW = pop ? r.w : Math.max(r.w, Math.round(cv.clientWidth * CINE.W)), W = r.w + (maxW - r.w) * grow;
    // heroflat: the strip also grows toward the middle of the stage, to twice its height at most
    const maxH = pop ? r.h : flat ? Math.min(r.h * 2, cv.clientHeight - r.h * 0.2) : r.h, H = r.h + (maxH - r.h) * grow;
    const R = { x: side === 'me' ? r.x : r.x + r.w - W, y: flat && side === 'me' ? r.y + r.h - H : r.y, w: W, h: H };
    const m = centroidOf(shot.cells), z = shot.kind === 'room' ? HERO.WALL + (HERO.HEIGHT[shot.rk] || 0) : HERO.WALL;
    const F = info.pr.P(m[0], m[1], z), F0 = { x: M[0] * F.x + M[2] * F.y + M[4], y: M[1] * F.x + M[3] * F.y + M[5] };
    const sx = F0.x + r.x - R.x, sy = F0.y + r.y - R.y; // where the impact is drawn when the cut starts
    const A = { x: sx + (W / 2 - sx) * v, y: sy + (H / 2 - sy) * v };
    return { R, Z, F, F0, A, z, m };
  }
  const centroidOf = (cs) => [cs.reduce((q, c) => q + c[0] + 0.5, 0) / cs.length, cs.reduce((q, c) => q + c[1] + 0.5, 0) / cs.length];
  const quad = (P, x, y, z) => [P(x, y, z), P(x + 1, y, z), P(x + 1, y + 1, z), P(x, y + 1, z)];
  // Built once per cut: the hull pieces (two triangles per cell of the room, or of the break for a tear) and the
  // section's own bake for a tear.
  function cutBuild(shot, cut, info, ship, r, dpr, lk) {
    const P = info.pr.P, hs = (i) => hash01(shot.s * 7919 + i);
    const [dX, dY] = screenDir(info, cut.m, -shot.bear[0], -shot.bear[1], cut.z); // the way the shot travels
    // hull plate: steel, a touch of the room's colour
    const top = shot.kind === 'room' ? mix(STEEL, roomColor(shot.room) || STEEL, 0.2) : STEEL;
    let src = shot.cells.map((c) => [c[0], c[1], cut.z, 1]);
    if (shot.kind === 'tear') { const ex = shot.end === 'bow' ? Math.min(...src.map((c) => c[0])) : Math.max(...src.map((c) => c[0])); src = src.filter((c) => c[0] === ex); }
    else { // the plating round the room peels off too, slower: the hull rips, not one room
      const inRoom = new Set(shot.cells.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of shot.cells) for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ddx, ny = y + ddy, k = `${nx},${ny}`;
        if (inRoom.has(k) || !standing(ship, ship.cells[ny] && ship.cells[ny][nx])) continue;
        inRoom.add(k); if (hs(nx * 31 + ny) < 0.6) src.push([nx, ny, HERO.WALL, 0.55]);
      }
    }
    const chunks = [];
    src.forEach(([x, y, zz, spd]) => {
      const q = quad(P, x, y, zz);
      for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
        const k = chunks.length, cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
        let rx = cx - cut.F.x, ry = cy - cut.F.y; const rl = Math.hypot(rx, ry);
        if (rl < 0.5) { const t0 = hs(k) * Math.PI * 2; rx = Math.cos(t0); ry = Math.sin(t0); } else { rx /= rl; ry /= rl; }
        let vx = rx + dX * 0.7 + (hs(k + 300) - 0.5) * 0.8, vy = ry + dY * 0.7 - 0.5 + (hs(k + 400) - 0.5) * 0.8;
        const vl = Math.hypot(vx, vy) || 1, sp = (25 + 55 * hs(k + 100)) * spd;
        chunks.push({ cx, cy, pts: tri.map((p) => [p.x - cx, p.y - cy]), vx: vx / vl * sp, vy: vy / vl * sp, spin: (hs(k + 200) - 0.5) * 9, col: mul(top, 0.65 + 0.6 * hs(k + 500)) });
      }
    });
    let section = null;
    if (shot.kind === 'tear') { // the cells that went, standing again, baked alone at the window's size
      const set = new Set(shot.cells.map(([x, y]) => `${x},${y}`));
      const fake = { ...ship, cells: ship.cells.map((row, y) => row.map((c, x) => (c && set.has(`${x},${y}`) ? { ...c, cut: false } : null))),
        pieces: Object.fromEntries(Object.entries(ship.pieces).map(([id, p]) => [id, { ...p, torn: false, alive: p.alive || p.torn }])) };
      section = bake(fake, r.w, r.h, dpr, lk).canvas;
    }
    return { chunks, section, dX, dY };
  }
  function drawCut(g, shot, cut, info, ship, r, dpr, lk) {
    if (cutKey !== shot.s || !cutMem) { cutKey = shot.s; cutMem = cutBuild(shot, cut, info, ship, r, dpr, lk); }
    const M = cutMem, P = info.pr.P, a = shot.age, c = info.pr.c, hs = (i) => hash01(shot.s * 104729 + i);
    const fade = clamp((shot.T - a) / 0.3, 0, 1), col = shot.kind === 'room' ? (BLAST[shot.rk] || {}).col || [255, 150, 60] : [255, 220, 170];
    const hf = (i) => hash01(shot.s * 89 + i + Math.floor(a * 25) * 131);
    // the shot coming in along its real bearing, the first 0.06 s
    if (a < 0.06 && shot.kind === 'room') {
      const k = a / 0.06, L = 140, sx = cut.F.x - M.dX * L, sy = cut.F.y - M.dY * L;
      const hx = sx + (cut.F.x - sx) * k, hy = sy + (cut.F.y - sy) * k;
      const sc = { rail: [220, 240, 255], torp: [255, 160, 80], pdc: [255, 225, 140] }[shot.cause] || [255, 230, 200];
      g.strokeStyle = css(sc, 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx - M.dX * 30, hy - M.dY * 30); g.lineTo(hx, hy); g.stroke();
      glow(g, hx, hy, 8, sc, 0.9, false);
    }
    if (shot.kind === 'tear' && M.section) {
      // the section drifts off along its end and turns; sparks and glow on the break
      const t = Math.max(0, a - 0.04), sgn = shot.end === 'bow' ? 1 : -1;
      const [ux, uy] = screenDir(info, cut.m, sgn, 0, HERO.WALL), d = 18 * t + 30 * t * t;
      g.save(); g.translate(cut.F.x + ux * d, cut.F.y + uy * d); g.rotate(sgn * 0.35 * t); g.translate(-cut.F.x, -cut.F.y);
      g.drawImage(M.section, 0, 0, r.w, r.h); g.restore();
    } else if (shot.kind === 'room') {
      // the hole: the room's cells at deck height, dark, fire inside, a hot rim
      const qs = shot.cells.map(([x, y]) => quad(P, x, y, HERO.WALL));
      const path = () => { g.beginPath(); for (const q of qs) { g.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i++) g.lineTo(q[i].x, q[i].y); g.closePath(); } };
      path(); g.fillStyle = `rgba(3,4,6,${0.92 * clamp(a / 0.05, 0, 1) * (0.4 + 0.6 * fade)})`; g.fill();
      // the interior, for a moment, through the hole
      const w = clamp(Math.min((a - 0.1) / 0.08, (0.6 - a) / 0.15), 0, 1);
      if (w > 0) {
        g.save(); path(); g.clip(); g.globalAlpha = w;
        const xs = shot.cells.map((q) => q[0]), ys = shot.cells.map((q) => q[1]), box = { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 };
        const cp = 20, O = P(box.x0, box.y0, HERO.WALL), ex = P(box.x0 + 1, box.y0, HERO.WALL), ey = P(box.x0, box.y0 + 1, HERO.WALL);
        const ax = (ex.x - O.x) / cp, ay = (ex.y - O.y) / cp, bx = (ey.x - O.x) / cp, by = (ey.y - O.y) / cp;
        g.transform(ax, ay, bx, by, O.x - ax * box.x0 * cp - bx * box.y0 * cp, O.y - ay * box.x0 * cp - by * box.y0 * cp);
        g.fillStyle = '#26303b'; for (const [x, y] of shot.cells) g.fillRect(x * cp, y * cp, cp + 0.5, cp + 0.5);
        const bl = Math.hypot(shot.bear[0], shot.bear[1]) || 1;
        const sh = { s: shot.s, breach: { x: (cut.m[0] + shot.bear[0] / bl) * cp, y: (cut.m[1] + shot.bear[1] / bl) * cp } };
        (INTERIOR[shot.rk] || INTERIOR.generic)(g, { sh, cells: shot.cells, box, X: (gx) => gx * cp, Y: (gy) => gy * cp, s: cp, a, h: (i) => hash01(shot.s * 97 + i), hf });
        g.fillStyle = `rgba(255,30,20,${0.2 + 0.12 * Math.sin(a * 18)})`; g.fillRect(box.x0 * cp, box.y0 * cp, (box.x1 - box.x0) * cp, (box.y1 - box.y0) * cp);
        g.restore();
      }
      qs.forEach((q, i) => { const m = { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 }; glow(g, m.x, m.y, c * 1.2, col, (0.15 + 0.3 * hf(i)) * fade, false); }); // fire inside, flickering
      // a hot, torn rim on the hole's outer edges only (jagged), not a grid
      const inR = new Set(shot.cells.map(([x, y]) => `${x},${y}`));
      g.beginPath();
      shot.cells.forEach(([x, y], i) => {
        const q = qs[i];
        [0, 1, 2, 3].forEach((e) => { // quad edge e runs q[e] to q[e+1]; its neighbour cell: (x, y-1), (x+1, y), (x, y+1), (x-1, y)
          const nb = e === 0 ? [x, y - 1] : e === 1 ? [x + 1, y] : e === 2 ? [x, y + 1] : [x - 1, y];
          if (inR.has(`${nb[0]},${nb[1]}`)) return;
          const A = e === 0 ? q[0] : e === 1 ? q[1] : e === 2 ? q[2] : q[3], B = e === 0 ? q[1] : e === 1 ? q[2] : e === 2 ? q[3] : q[0];
          g.moveTo(A.x, A.y);
          for (let j = 1; j < 4; j++) { const f = j / 4; g.lineTo(A.x + (B.x - A.x) * f + (hs(i * 40 + e * 8 + j) - 0.5) * c * 0.35, A.y + (B.y - A.y) * f + (hs(i * 40 + e * 8 + j + 4) - 0.5) * c * 0.35); }
          g.lineTo(B.x, B.y);
        });
      });
      g.strokeStyle = `rgba(255,${120 + 80 * hf(1)},50,${0.85 * fade})`; g.lineWidth = 0.9; g.stroke();
    }
    // the hull in pieces: out from the impact and along the shot, turning; hot edges cool
    const t = Math.max(0, a - 0.03);
    for (const k of M.chunks) {
      const x = k.cx + k.vx * t * (1 - 0.2 * t), y = k.cy + k.vy * t * (1 - 0.2 * t), rot = k.spin * t, cs = Math.cos(rot), sn = Math.sin(rot);
      g.beginPath();
      k.pts.forEach(([px, py], i) => g[i ? 'lineTo' : 'moveTo'](x + px * cs - py * sn, y + px * sn + py * cs));
      g.closePath();
      g.fillStyle = css(k.col, fade); g.fill();
      g.strokeStyle = `rgba(255,${150 + 80 * clamp(1 - t / 0.5, 0, 1)},80,${clamp(1 - t / 0.6, 0, 1) * fade})`; g.lineWidth = 0.6; g.stroke();
    }
    // sparks and a fireball at the impact
    for (let i = 0; i < 36; i++) {
      const life = 0.3 + 0.4 * hs(i), k = t / life; if (k >= 1) continue;
      const an = hs(i + 50) * Math.PI * 2, sp = 50 + 110 * hs(i + 90);
      const sx = cut.F.x + (Math.cos(an) + M.dX * 0.5) * sp * t, sy = cut.F.y + (Math.sin(an) + M.dY * 0.5) * sp * t;
      g.strokeStyle = `rgba(255,${190 + 60 * hs(i + 7)},120,${1 - k})`; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - Math.cos(an) * 3, sy - Math.sin(an) * 3); g.stroke();
    }
    glow(g, cut.F.x, cut.F.y, c * (4 + 6 * clamp(t / 0.3, 0, 1)), col, 1 - clamp(t / 0.5, 0, 1), true);
    // smoke rising out of it
    for (let i = 0; i < 5; i++) {
      const ph = ((a - 0.25) * 0.8 + i / 5) % 1; if (a < 0.25 || ph < 0) continue;
      g.fillStyle = `rgba(70,72,78,${0.4 * (1 - ph) * fade})`;
      g.beginPath(); g.arc(cut.F.x + (hs(i + 600) - 0.5) * c * 3, cut.F.y - ph * c * 6, c * (0.6 + ph * 1.4), 0, Math.PI * 2); g.fill();
    }
  }

  // --- hits: what the sim's events did to each hull, drawn in that hull's window ----------------------------
  // Every effect sits on a form cell (x, y) and a height z in cells, projected when drawn, so it rides any resize.
  // No ids on events: a counter (reset per battle) and the event's own fields seed the hash, so the same battle
  // looks the same every run.
  let seq = 0, fx = { me: newFx(), them: newFx() }, running = true; // running: the last step moved time (not paused)
  function newFx() { return { parts: [], glows: [], smoke: [], pops: [], jets: [], alarms: [], arcs: [], scorch: new Map(), neg: 0 }; }
  const roomCellsOf = (ship, room) => {
    const out = [];
    for (let y = 0; y < ship.form.h; y++) for (let x = 0; x < ship.form.w; x++) { const c = ship.cells[y][x]; if (c && c.room === room) out.push([x, y]); }
    return out;
  };
  const centroid = (cs) => cs.reduce((a, c) => [a[0] + c[0] / cs.length, a[1] + c[1] / cs.length], [0, 0]);
  function burst(f, cell, room, n, speed, life, col, wait = 0) {
    const s0 = ++seq;
    for (let i = 0; i < n && f.parts.length < HERO.PARTS; i++) {
      const a = hash01(s0 * 31 + i * 7) * Math.PI * 2, v = speed * (0.4 + 0.6 * hash01(s0 * 17 + i * 13));
      f.parts.push({ x: cell[0] + 0.5, y: cell[1] + 0.5, room, dx: Math.cos(a) * v, dy: Math.sin(a) * v - speed * 0.3, ttl: life, life, col, wait });
    }
  }
  const hitCol = (ship, ev) => { const b = BLAST[kindOf(ship, ev.piece)]; return b ? b.hit : HIT_DEFAULT[ev.type]; };
  // A job room's death, by its kind (BLAST). cs: its cells, m: their centroid.
  function blast(f, ship, room, cs, m, battle) {
    const b = BLAST[kindOf(ship, room)];
    if (!b) return;
    const s = ++seq, cx = m[0] + 0.5, cy = m[1] + 0.5;
    if (b.dead === 'vent') {
      // out of the hull's nearest side: from the hull's centre through the room (the drive: astern when it sits on the axis)
      const H = ship.form.h, W = ship.form.w;
      let ux = 0, uy = cy - H / 2;
      if (Math.abs(uy) < H * 0.15) { ux = cx < W / 2 ? -1 : 1; uy = 0; } else uy = Math.sign(uy);
      f.jets.push({ x: cx, y: cy, room, ux, uy, col: b.col, ttl: b.time, life: b.time, s });
    } else if (b.dead === 'cook' || b.dead === 'crackle') {
      const small = b.dead === 'crackle';
      for (let i = 0; i < b.n; i++) {
        const c = cs[Math.floor(hash01(s * 13 + i * 7) * cs.length)], wait = 0.12 + i * b.gap * (0.6 + 0.8 * hash01(s * 5 + i));
        f.glows.push({ x: c[0] + 0.5, y: c[1] + 0.5, room, r: small ? 6 : 14, a: small ? 0.8 : 1, ttl: small ? 0.12 : 0.35, life: small ? 0.12 : 0.35, col: b.col, wait });
        burst(f, c, room, small ? 3 : 7, small ? 18 : 30, small ? 0.2 : 0.45, b.col, wait);
      }
    } else if (b.dead === 'alarm') {
      f.alarms.push({ x: cx, y: cy, room, col: b.col, ttl: b.time, life: b.time });
    } else if (b.dead === 'arcs') {
      f.arcs.push({ cells: cs, room, col: b.col, ttl: b.time, life: b.time, s });
    }
  }
  function onEvent(ev, battle) {
    if (ev.type === 'torpKilled' && fx[ev.by]) { fx[ev.by].pops.push({ x: ev.x, y: ev.y, ttl: 0.3, life: 0.3 }); return; } // a torpedo shot down short of this hull
    const f = fx[ev.ship];
    if (!f || !battle) return;
    const ship = battle.shipById ? battle.shipById(ev.ship) : battle.ships[ev.ship === 'me' ? 0 : 1];
    const hit = (big) => {
      const cs = roomCellsOf(ship, ev.piece), cell = ev.at && ev.at.length === 2 ? ev.at : cs.length ? centroid(cs).map(Math.floor) : null;
      if (!cell) return null;
      const k = `${cell[0]},${cell[1]}`;
      f.scorch.set(k, Math.min(HERO.SCORCH_MAX, (f.scorch.get(k) || 0) + (HERO.SCORCH[ev.type] || 0)));
      return cell;
    };
    if (ev.type === 'pdcHit') {
      const c = hit(); if (!c) return;
      burst(f, c, ev.piece, 3, 14, 0.25, [255, 220, 130]);
      f.glows.push({ x: c[0] + 0.5, y: c[1] + 0.5, room: ev.piece, r: 5, a: 0.5, ttl: 0.12, life: 0.12, col: [255, 200, 120] });
    } else if (ev.type === 'torpHit') {
      const c = hit(); if (!c) return;
      burst(f, c, ev.piece, 12, 30, 0.5, [255, 170, 80]);
      f.glows.push({ x: c[0] + 0.5, y: c[1] + 0.5, room: ev.piece, r: 16, a: 0.9, ttl: 0.45, life: 0.45, col: hitCol(ship, ev) });
    } else if (ev.type === 'railHit') {
      const c = hit(); if (!c) return;
      burst(f, c, ev.piece, 16, 45, 0.45, [200, 230, 255]);
      f.glows.push({ x: c[0] + 0.5, y: c[1] + 0.5, room: ev.piece, r: 20, a: 1, ttl: 0.5, life: 0.5, col: hitCol(ship, ev) });
      f.neg = HERO.NEG;
    } else if (ev.type === 'pieceDead' && !String(ev.piece).startsWith('frame:')) {
      const cs = roomCellsOf(ship, ev.piece); if (!cs.length) return;
      const m = centroid(cs);
      f.glows.push({ x: m[0] + 0.5, y: m[1] + 0.5, room: ev.piece, r: 22, a: 1, ttl: 0.7, life: 0.7, col: [255, 140, 50] });
      burst(f, [Math.floor(m[0]), Math.floor(m[1])], ev.piece, 14, 35, 0.6, [255, 190, 110]);
      if (ev.cause !== 'tear') blast(f, ship, ev.piece, cs, m, battle);
      f.smoke.push({ x: m[0] + 0.5, y: m[1] + 0.5, room: ev.piece, ttl: HERO.SMOKE_TIME, life: HERO.SMOKE_TIME, s: ++seq });
    } else if (ev.type === 'tear') {
      f.neg = HERO.NEG;
      for (const room of ev.pieces || []) { const cs = roomCellsOf(ship, room); if (cs.length) burst(f, centroid(cs).map(Math.floor), room, 4, 30, 0.5, [255, 255, 255]); }
    }
  }
  function step(dt) {
    running = dt > 0;
    for (const side in fx) {
      const f = fx[side];
      if (dt > 0) f.neg = Math.max(0, f.neg - 1); // frames, counted only while the game runs
      for (const L of [f.parts, f.glows, f.smoke, f.pops, f.jets, f.alarms, f.arcs]) for (let i = L.length - 1; i >= 0; i--) {
        const q = L[i];
        if (q.wait > 0) { q.wait -= dt; continue; } // a delayed burst (cook-off) has not gone off yet
        q.ttl -= dt; if (q.ttl <= 0) L.splice(i, 1);
      }
      for (const p of f.parts) { if (p.wait > 0) continue; p.ox = (p.ox || 0) + p.dx * dt; p.oy = (p.oy || 0) + p.dy * dt; p.dy += 40 * dt; }
    }
  }
  // Project a cell point at its room's top (the deck for frame, the hull's base if the room is gone).
  const at = (info, x, y, room) => info.pr.P(x, y, info.top[room] !== undefined ? info.top[room] : HERO.WALL);
  function drawHits(g, side, info, r, t, ship) {
    const f = fx[side], c = info.pr.c;
    // scorch: permanent, dark soft spots on the hit cells
    for (const [k, v] of f.scorch) {
      const [x, y] = k.split(',').map(Number);
      if (!standing(ship, ship.cells[y] && ship.cells[y][x])) continue; // torn off with its section
      const cell = info.pr.P(x + 0.5, y + 0.5, HERO.WALL);
      const gr = g.createRadialGradient(cell.x, cell.y, 0, cell.x, cell.y, c * 0.75 * cell.k);
      gr.addColorStop(0, `rgba(14,8,5,${v})`); gr.addColorStop(1, 'rgba(14,8,5,0)');
      g.fillStyle = gr; g.fillRect(cell.x - c, cell.y - c, 2 * c, 2 * c);
    }
    // smoke from dead rooms: puffs that rise (up the window) and fade
    for (const s of f.smoke) {
      const age = s.life - s.ttl, p = at(info, s.x, s.y, s.room);
      for (let i = 0; i < 4; i++) {
        const ph = ((age * 0.7 + i / 4) % 1), a = 0.35 * (1 - ph) * Math.min(1, s.ttl);
        if (a <= 0.01) continue;
        const dx = (hash01(s.s * 11 + i) - 0.5) * c * 1.5 + Math.sin(t * 1.3 + i) * c * 0.3;
        g.fillStyle = `rgba(70,72,78,${a})`;
        g.beginPath(); g.arc(p.x + dx, p.y - ph * c * 5, c * (0.5 + ph * 1.2), 0, Math.PI * 2); g.fill();
      }
    }
    // glows (room hit, room death) and sparks
    for (const q of f.glows) { if (q.wait > 0) continue; const p = at(info, q.x, q.y, q.room), k = q.ttl / q.life; glow(g, p.x, p.y, q.r * (1.3 - 0.3 * k), q.col, q.a * k * k); }
    // bridge: red emergency light, pulsing, fading over its time
    for (const q of f.alarms) {
      const p = at(info, q.x, q.y, q.room), k = Math.min(1, q.ttl / 1.5), pulse = 0.5 + 0.5 * Math.sin((q.life - q.ttl) * 9);
      glow(g, p.x, p.y, c * 2.4, q.col, 0.55 * pulse * k, false);
    }
    // drive plasma or crew air: a jet out of the hull's side, a stream of puffs that shrinks as the room empties
    for (const q of f.jets) {
      const p = at(info, q.x, q.y, q.room), k = q.ttl / q.life, age = q.life - q.ttl;
      const [dx, dy] = screenDir(info, [q.x, q.y], q.ux, q.uy, HERO.WALL), len = c * 7 * k;
      for (let i = 0; i < 10; i++) {
        const ph = (age * 3 + i / 10) % 1, a = (1 - ph) * k * 0.7, jit = (hash01(q.s * 19 + i + Math.floor(age * 20) * 31) - 0.5) * c * ph * 1.6;
        g.fillStyle = css(q.col, a);
        g.beginPath(); g.arc(p.x + dx * ph * len - dy * jit, p.y + dy * ph * len + dx * jit, c * (0.25 + ph * 0.7), 0, Math.PI * 2); g.fill();
      }
      glow(g, p.x, p.y, c * 2 * k + 3, q.col, 0.6 * k, false);
    }
    // rail capacitors: two jagged arcs between cells of the room, re-struck twenty times a second
    for (const q of f.arcs) {
      const k = q.ttl / q.life, n = Math.floor((q.life - q.ttl) * 20);
      g.strokeStyle = css(q.col, 0.9 * k); g.lineWidth = 1;
      for (let j = 0; j < 2; j++) {
        const h = (i) => hash01(q.s * 97 + n * 13 + j * 7 + i);
        const A = q.cells[Math.floor(h(1) * q.cells.length)], B = q.cells[Math.floor(h(2) * q.cells.length)];
        const pa = at(info, A[0] + 0.5, A[1] + 0.5, q.room), pb = at(info, B[0] + 0.5, B[1] + 0.5, q.room);
        g.beginPath(); g.moveTo(pa.x, pa.y);
        for (let i = 1; i < 5; i++) g.lineTo(pa.x + (pb.x - pa.x) * i / 5 + (h(10 + i) - 0.5) * c * 1.4, pa.y + (pb.y - pa.y) * i / 5 + (h(20 + i) - 0.5) * c * 1.4);
        g.lineTo(pb.x, pb.y); g.stroke();
        glow(g, pb.x, pb.y, 6, q.col, 0.5 * k, false);
      }
    }
    for (const q of f.parts) {
      if (q.wait > 0) continue;
      const p = at(info, q.x, q.y, q.room), k = q.ttl / q.life;
      g.fillStyle = css(q.col, Math.min(1, k * 1.2));
      g.fillRect(p.x + q.ox - 0.8, p.y + q.oy - 0.8, 1.6, 1.6);
    }
    // the negative impact frame: inverts this window only, one or two frames
    if (f.neg > 0 && running) { g.save(); g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(-1e4, -1e4, 2e4, 2e4); g.restore(); } // the window's clip bounds it, zoomed or not
  }

  // --- incoming: torpedoes and slugs in flight toward a hull, and its own PDC tracers out of the domes ---------
  // A world point is turned into the ship's frame (bow = its heading, row 0 = its 'top' side, as shotFrom and
  // mountSees see it) and drawn on the ray from an anchor (the room it goes for, else the hull's centre) at its
  // real bearing; the distance is squeezed: 0 km on the hull's edge, SHOW km just past the window's edge.
  // Nothing here is stored per frame but a tracer's mount (a WeakMap, so a tracer stays on one dome).
  let tracerSeq = 0, tracerMount = new WeakMap();
  function frameOf(ship) {
    const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
    return (dx, dy) => [dx * c + dy * s, -dx * s + dy * c]; // world vector -> (cells toward the bow, toward row h)
  }
  // The window point of a world point (wx, wy) seen from `ship`, on the ray from form point `a` (cells), at height z.
  function place(info, r, ship, toLocal, a, wx, wy, show, z) {
    const [lx, ly] = toLocal(wx - ship.x, wy - ship.y), d = Math.hypot(lx, ly);
    if (d < 1e-6) return null;
    const ux = lx / d, uy = ly / d, P = info.pr.P;
    const A = P(a[0], a[1], z), B = P(a[0] + ux, a[1] + uy, z);
    let sx = B.x - A.x, sy = B.y - A.y;
    const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
    // the hull's edge on this ray: walk out of the form's box in half cells
    let k = 0;
    const W = ship.form.w, H = ship.form.h;
    while (k < W + H) { const gx = a[0] + ux * k, gy = a[1] + uy * k; if (gx < 0 || gx > W || gy < 0 || gy > H) break; k += 0.5; }
    const Ex = P(a[0] + ux * k, a[1] + uy * k, z), hullR = Math.hypot(Ex.x - A.x, Ex.y - A.y);
    // the window's edge on this ray
    const tx = sx > 0 ? (r.w - A.x) / sx : sx < 0 ? -A.x / sx : Infinity;
    const ty = sy > 0 ? (r.h - A.y) / sy : sy < 0 ? -A.y / sy : Infinity;
    const edge = Math.max(hullR, Math.min(tx, ty)) + HERO.EDGE;
    const rad = hullR + (edge - hullR) * clamp(d / show, 0, 1);
    return { x: A.x + sx * rad, y: A.y + sy * rad, sx, sy, A, d };
  }
  // A local direction (cells toward the bow, toward row h) as a unit vector on the window, near form point a.
  function screenDir(info, a, lx, ly, z) {
    const d = Math.hypot(lx, ly) || 1, A = info.pr.P(a[0], a[1], z), B = info.pr.P(a[0] + lx / d, a[1] + ly / d, z);
    const sx = B.x - A.x, sy = B.y - A.y, l = Math.hypot(sx, sy) || 1;
    return [sx / l, sy / l];
  }
  function drawIncoming(g, side, info, r, battle, ship) {
    if (!info.center || !ship.form) return;
    const toLocal = frameOf(ship), zFly = HERO.WALL + 0.6;
    const anchor = (room) => (room && info.rc[room]) || info.center;
    g.save();
    g.lineCap = 'round';
    // torpedoes coming for this hull: a red-hot head, the exhaust trailing against its motion (relative to us)
    for (const p of battle.projectiles) {
      if (p.dead || p.target !== ship.id) continue;
      if (p.kind === 'torp') {
        const q = place(info, r, ship, toLocal, anchor(p.room), p.x, p.y, HERO.TORP_SHOW, zFly);
        if (!q || q.d > HERO.TORP_SHOW * 1.2) continue;
        const [vx, vy] = toLocal(p.vx - ship.vx, p.vy - ship.vy), [dx, dy] = screenDir(info, anchor(p.room), vx, vy, zFly);
        const tail = 9 + 5 * hash01(Math.round(battle.t * 30) + Math.round(p.x * 997));
        const gr = g.createLinearGradient(q.x, q.y, q.x - dx * tail, q.y - dy * tail);
        gr.addColorStop(0, 'rgba(255,200,120,0.9)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
        g.strokeStyle = gr; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - dx * tail, q.y - dy * tail); g.stroke();
        g.fillStyle = 'rgba(255,240,210,1)'; g.fillRect(q.x - 1, q.y - 1, 2, 2);
        glow(g, q.x, q.y, 7, [255, 120, 60], 0.55, false);
      } else if (p.kind === 'slug') {
        const q = place(info, r, ship, toLocal, anchor(p.room), p.x, p.y, HERO.SLUG_SHOW, zFly);
        if (!q) continue;
        // a streak along its flight: from where it is back toward where it came from
        const L = 22;
        const gr = g.createLinearGradient(q.x, q.y, q.x + q.sx * L, q.y + q.sy * L);
        gr.addColorStop(0, 'rgba(235,248,255,1)'); gr.addColorStop(1, 'rgba(140,200,255,0)');
        g.strokeStyle = gr; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x + q.sx * L, q.y + q.sy * L); g.stroke();
        glow(g, q.x, q.y, 10, [170, 215, 255], 0.8, false);
      }
    }
    // this hull's PDC tracers: each comes out of a living dome whose arc holds where it is going (mountSees),
    // and runs to that point: a torpedo it is shooting at (placed as above), or past the edge toward their ship
    const mounts = ship.form.mounts || [], enemy = battle.ships[side === 'me' ? 1 : 0];
    for (const tr of battle.tracers || []) {
      if (tr.owner !== ship.id) continue;
      const domes = [];
      mounts.forEach(([mx, my], i) => { const room = `pdc${i + 1}`; if (ship.pieces[room] && ship.pieces[room].alive && standing(ship, ship.cells[my] && ship.cells[my][mx]) && mountSees(ship, room, tr.x2, tr.y2)) domes.push([mx, my, room]); });
      if (!domes.length) continue;
      let n = tracerMount.get(tr);
      if (n === undefined) tracerMount.set(tr, (n = ++tracerSeq));
      const [mx, my, room] = domes[Math.floor(hash01(n * 7919) * domes.length)];
      const a = [mx + 0.5, my + 0.5], zDome = info.top[room] !== undefined ? info.top[room] : HERO.WALL;
      const atShip = Math.hypot(tr.x2 - enemy.x, tr.y2 - enemy.y) < 0.25; // a Rake: out past the edge
      const q = place(info, r, ship, toLocal, a, tr.x2, tr.y2, atShip ? 1e-6 : HERO.TORP_SHOW, zDome);
      if (!q) continue;
      const D = q.A, len = Math.hypot(q.x - D.x, q.y - D.y), prog = clamp(1 - tr.ttl / 0.12, 0, 1);
      const s0 = prog * (1 - HERO.TRACER_SEG) * len, s1 = s0 + HERO.TRACER_SEG * len;
      const x0 = D.x + q.sx * s0, y0 = D.y + q.sy * s0, x1 = D.x + q.sx * s1, y1 = D.y + q.sy * s1;
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(255,210,120,0)'); gr.addColorStop(1, 'rgba(255,236,170,0.95)');
      g.strokeStyle = gr; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (prog < 0.35) glow(g, D.x, D.y, 5, [255, 210, 130], 0.5 * (1 - prog / 0.35), false); // muzzle flash on the dome
    }
    // torpedoes the PDCs killed: a short pop where the torpedo was
    for (const k of fx[side].pops) {
      const q = place(info, r, ship, toLocal, info.center, k.x, k.y, HERO.TORP_SHOW, zFly);
      if (!q) continue;
      const f = k.ttl / k.life;
      glow(g, q.x, q.y, 12 * (1.4 - 0.4 * f), [255, 200, 120], 0.8 * f, false);
    }
    g.restore();
  }

  return {
    draw, left, right, rect, onEvent, step,
    reset() { for (const k in cache) delete cache[k]; seq = 0; cutKey = 0; cutMem = null; tracerSeq = 0; tracerMount = new WeakMap(); fx = { me: newFx(), them: newFx() }; },
  };
}
