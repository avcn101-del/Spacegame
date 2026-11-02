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

// Visual-only knobs. Not game numbers.
export const HERO = {
  PITCH: 0.95,          // rad the camera looks down from the hull's plane: deck readable, wall still shows
  KEYSTONE: 0.2,        // the bow end is this much narrower than the stern end (the far end is further away)
  SHIP_LEN: 0.62,       // share of the window height the hull may take; the rest is plume below and air above
  PLUME_LEN: 0.2,       // share of the window height the idle plume runs toward the camera
  BEAM_SHARE: 0.62,     // share of the window width the beam takes when the width is fitted to the ship
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
function kindOf(ship, room) {
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
export function heroRect(view, ship, cw, ch, hud, side = 'me') {
  const Hc = ship.form.h;
  if (view === 'tac') {
    const y = hud.top + HERO.PAD, h = Math.max(40, Math.min(HERO.TAC_MAX_H, ch - hud.top - hud.bottom - 2 * HERO.PAD));
    const w = clamp(Math.ceil(cellForHeight(ship, h) * Hc / HERO.BEAM_SHARE), HERO.TAC_MIN_W, Math.round(cw * HERO.TAC_MAX_W));
    return { x: 8, y, w, h };
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
function stack(g, scratch, tex, m, pr, z, px, dpr) {
  const q = scratch.getContext('2d');
  q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, scratch.width, scratch.height);
  q.setTransform(dpr, 0, 0, dpr, 0, 0); warp(q, tex, m, pr, z);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  for (let s = 0; s <= px; s += 0.75) g.drawImage(scratch, 0, -Math.round(s * dpr));
  g.restore();
  return scratch;
}

// Fill a canvas layer with the key-light gradient over what is already there (source-atop).
function keyLight(g, ww, wh, lit, dark) {
  const K = LOOK.KEY, cx = ww / 2, cy = wh / 2, L = Math.hypot(ww, wh) / 2;
  const gr = g.createLinearGradient(cx + K.x * L, cy + K.y * L, cx - K.x * L, cy - K.y * L);
  gr.addColorStop(0, `rgba(255,255,255,${lit})`); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${dark})`);
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, ww, wh); g.restore();
}
// A rim on the edges facing the light: the shape less itself shifted away from the light.
let rimCv = null;
function rim(dst, layer, dpr, col, a, px = LOOK.RIM_PX) {
  if (!rimCv || rimCv.width !== layer.width || rimCv.height !== layer.height) rimCv = newCanvas(layer.width, layer.height);
  const r = rimCv, g = r.getContext('2d');
  g.globalCompositeOperation = 'copy'; g.drawImage(layer, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, r.width, r.height);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(layer, -LOOK.KEY.x * px * dpr, -LOOK.KEY.y * px * dpr);
  dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = a; dst.drawImage(r, 0, 0); dst.restore();
}

// --- the bake: the static hull, one bitmap per battle and hull state --------------------------------

function bake(ship, ww, wh, dpr) {
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
    g.save(); g.translate(-LOOK.KEY.x * hPx * 0.9, -LOOK.KEY.y * hPx * 0.9); warp(g, sh, m, pr, deckZ); g.restore();
    // sides: the footprint stacked, darker toward the deck
    const sideTex = paint(m, () => mul(top, 0.42));
    stack(g, scratch, sideTex, m, pr, deckZ, hPx, dpr);
    // top: the room colour, lit, with a rim
    tq.setTransform(1, 0, 0, 1, 0, 0); tq.clearRect(0, 0, tl.width, tl.height); tq.setTransform(dpr, 0, 0, dpr, 0, 0);
    warp(tq, paint(m, () => top), m, pr, deckZ + h);
    keyLight(tq, ww, wh, LOOK.SHADE_LIT * 1.4, LOOK.SHADE_DARK * 0.8);
    g.drawImage(tl, 0, 0, ww, wh);
    rim(g, tl, dpr, 'rgb(240,248,255)', alive ? LOOK.RIM : 0.25);
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
    g.beginPath(); g.ellipse(p.x - LOOK.KEY.x * r * 0.6, p.y - LOOK.KEY.y * r * 0.4, r * 1.1, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    const base = alive ? roomColor(room) : DEAD, top = { x: p.x, y: p.y - r * 0.45 };
    const dg = g.createRadialGradient(top.x + LOOK.KEY.x * r * 0.45, top.y + LOOK.KEY.y * r * 0.45, r * 0.1, top.x, top.y, r * 1.05);
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
export function makeHero(canvases, hud, { twin = false } = {}) {
  const cache = {}; // side -> {key, canvas, info}
  const sides = (view) => (view === 'closeup' && twin ? ['me', 'them'] : ['me']);
  const rectFor = (view, ship, side) => {
    const cv = canvases[view];
    if (!cv || !cv.clientWidth || !cv.clientHeight) return null;
    return heroRect(view, ship, cv.clientWidth, cv.clientHeight, view === 'tac' ? hud() : { top: 0, bottom: 0 }, side);
  };
  // css px the camera's view rect must leave free at the left (my window) and the right (theirs): 0 with no window
  function left(view, battle) {
    const r = battle && rectFor(view, battle.ships[0], 'me');
    return r ? r.x + r.w + HERO.GAP : 0;
  }
  function right(view, battle) {
    if (!battle || !sides(view).includes('them')) return 0;
    const r = rectFor(view, battle.ships[1], 'them');
    return r ? r.w + HERO.GAP : 0;
  }
  // the window rect of a side in a view (css px), or null: for taps
  const rect = (view, battle, side) => (battle && sides(view).includes(side) ? rectFor(view, battle.ships[side === 'me' ? 0 : 1], side) : null);
  function draw(view, battle) {
    for (const side of sides(view)) drawOne(view, battle, side);
  }
  function drawOne(view, battle, side) {
    const cv = canvases[view], ship = battle.ships[side === 'me' ? 0 : 1], r = rectFor(view, ship, side);
    if (!r) return;
    const dpr = renderDpr(), key = `${battle.seed}|${view}|${r.w}x${r.h}@${dpr}|${hullKey(ship)}`;
    if (!cache[side] || cache[side].key !== key) cache[side] = { key, ...bake(ship, r.w, r.h, dpr) };
    const c = cache[side];
    const g = cv.getContext('2d');
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(r.x, r.y);
    // the window: dark glass, rounded; on the close-up it sits on the stage's edge, square on that side
    const rad = HERO.RADIUS, corners = view !== 'closeup' ? rad : side === 'me' ? [0, rad, rad, 0] : [rad, 0, 0, rad];
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, r.w, r.h, corners); else g.rect(0, 0, r.w, r.h);
    const bg = g.createLinearGradient(0, 0, 0, r.h);
    bg.addColorStop(0, `rgba(10,15,26,${HERO.ALPHA})`); bg.addColorStop(1, `rgba(4,6,11,${HERO.ALPHA})`);
    g.fillStyle = bg; g.fill();
    g.strokeStyle = side === 'me' ? 'rgba(140,165,200,0.28)' : 'rgba(255,160,80,0.32)'; g.lineWidth = 1; g.stroke(); // their window edged in their colour
    g.clip();
    const t = battle.t || 0, info = c.info;
    // the idle plume, behind the bell's mouth toward the camera
    if (info.bell) {
      const b = info.bell;
      drawPlume(g, b.x, b.y, 0, 1, HERO.PLUME_LEN * r.h, b.r * 0.9, t, side === 'me' ? 11 : 23);
    }
    g.drawImage(c.canvas, 0, 0, r.w, r.h);
    drawHits(g, side, info, r, battle.t || 0, ship);
    drawIncoming(g, side, info, r, battle, ship);
    if (info.bell) glow(g, info.bell.x, info.bell.y, info.bell.r * 1.6, [150, 200, 255], 0.35, false);
    // running lights: steady with a slow breath, the bow strobe flashes once every 1.6 s
    for (const L of info.lights) {
      const a = L.kind === 'strobe' ? ((t % 1.6) < 0.08 ? 0.9 : 0) : 0.55 + 0.15 * Math.sin(t * 2.1);
      if (a <= 0) continue;
      g.fillStyle = css(L.col, Math.min(1, a + 0.3)); g.beginPath(); g.arc(L.x, L.y, 1.1, 0, Math.PI * 2); g.fill();
      glow(g, L.x, L.y, 6, L.col, a * 0.6, false);
    }
    g.restore();
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
    if (f.neg > 0 && running) { g.save(); g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(0, 0, r.w, r.h); g.restore(); }
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
    reset() { for (const k in cache) delete cache[k]; seq = 0; tracerSeq = 0; tracerMount = new WeakMap(); fx = { me: newFx(), them: newFx() }; },
  };
}
