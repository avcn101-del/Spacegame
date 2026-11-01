// Tactical strip and silhouette panels: cameras, particles, shake and the
// impact spectacle. Reads battle state and events, never writes battle.
// Everything here advances on dtReal (real seconds): pause passes 0 and
// freezes every effect, slow-mo stretches the sim while effects keep pace.
// No Math.random: a counter fed through a small hash gives "random" numbers
// that are the same sequence every run.

import { N } from '../numbers.js';
import { exposure, alive, pdcRooms, mountSide, shotFrom } from '../sim/ship.js';
import { drawArcs, drawPdcCounts, railKm } from './arcs.js';
import { drawShipMark, COLORS } from './silhouette.js';
import { drawForm, roomPoint, roomBounds, roomAtPoint, roomBracket, roomColor } from './form.js';
import { BLOOM, bloom, drawPlume, makeLitSprites, makeVignette, makeStarfield } from './look.js';

// Visual-only knobs. Not game numbers, so they live here, not in numbers.js.
const V = {
  PARTICLE_CAP: 400,   // per panel; keeps draw cost modest on a phone
  MAX_DT: 0.1,         // clamp a long frame (tab switch) so effects do not jump
  TRACER_TTL: 0.12,    // matches the ttl weapons.js gives tracers; places the streak along the line
  MIN_SCALE: 9,        // px per km; ships never shrink to nothing
  MAX_SCALE: 55,       // px per km; at knife range the strip still shows both rings
  MARK_LEN: 14,        // px, the top-down mark length
  STAR_PX_PER_KM: 30,  // parallax base: how far the far layer slides per km of camera travel
  GHOST_RAY_PX: 170,   // px, the faint guide rays while dragging a move order
  EVENT_PT_TTL: 0.8,   // s of dt an impact / miss point keeps the engage camera wide enough to show it
  EVENT_PT_MAX: 24,    // cap on remembered event points
  PAD_FRAC: 0.15, PAD_MIN: 24, PAD_MAX: 48, // engage camera: margin around the required points, px
  MODE_LINGER: 1.0,    // s of dt the engage camera keeps a mode after its trigger ends (so a hit is seen before the cut)
  MODE_TRANS: 0.35,    // s of dt the points a new mode adds ease in (the points both modes share stay hard)
  TRANS_TAU: 0.12,     // s, the ease time constant of that transition
  MARK_LEN_FRAC: 0.25, // big marks: length as a share of the view height (clamped by opts.markPx)
  MARK_DIM: 0.58,      // big marks: how much of a job room's colour shows (the rest is the dark background)
  MARK_FRAME: 0.4,     // big marks: how much of the ship tint the frame cells show
  SPARK_LIFE: 0.15,    // s, the longest life of a contact spark
};
const MODE_ORDER = ['inbound', 'outbound', 'rail', 'idle'];
const BG_RGB = [6, 8, 15], DEAD_CSS = 'rgb(18,21,26)';
const mixRgb = (a, b, k) => `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;
const ENGAGE_EVENTS = new Set(['railMiss', 'torpMiss', 'torpKilled', 'railHit', 'torpHit']);

// --- deterministic numbers ----------------------------------------------------

function hash01(n) {
  let x = (Math.imul(n | 0, 0x9E3779B1) + 0x7F4A7C15) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85EBCA77);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE3D);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lerp = (a, b, k) => a + (b - a) * k;
const lerpCol = (a, b, k) => [Math.round(lerp(a[0], b[0], k)), Math.round(lerp(a[1], b[1], k)), Math.round(lerp(a[2], b[2], k))];

const C = {
  white: [255, 255, 255], hot: [255, 230, 200], fire: [255, 154, 60], ember: [255, 110, 30],
  spark: [255, 200, 130], steel: [90, 100, 112], drive: [190, 225, 255],
  me: [191, 227, 255], them: [255, 160, 80], warn: [255, 60, 60],
  amber: [255, 176, 96], tailRed: [255, 96, 80],
};
// The drag ghost's color per face: bow is the 'me' blue-white, side amber, tail red-ish.
const GHOST_COL = { bow: C.me, side: C.amber, tail: C.tailRed };

// Where the ship's nose points on the map, in radians: the sim's heading (the
// camera does not rotate, so map and screen angles agree). Falls back to the
// bearing to the enemy for a ship without one.
function noseAngle(ship, bearing) {
  return Number.isFinite(ship.heading) ? ship.heading : bearing;
}

// --- canvas sizing -----------------------------------------------------------

// Size the backing store to clientWidth/Height * dpr. Called every frame:
// it re-reads the element size and devicePixelRatio each time, so a phone
// rotation or a late layout is picked up on the next draw. Returns the CSS
// px size, or null when the canvas has no size yet (callers skip the frame).
export function fit(canvas, ctx) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const cw = canvas.clientWidth || 0, ch = canvas.clientHeight || 0;
  if (cw === 0 || ch === 0) return null;
  const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: cw, h: ch };
}

// --- the effects store: particles, rings, flashes, streaks, shake ------------
//
// Every effect has an anchor (ax, ay) in "anchor space" plus a pixel offset.
// toScreen(ax, ay) maps the anchor to canvas px. The tactical view anchors in
// world km so effects ride along with ships and camera; the silhouette panel
// anchors in panel px (identity).

export function makeFx(toScreen) {
  const parts = [], rings = [], flashes = [], streaks = [];
  let seq = 1;
  const rnd = () => hash01(seq++);
  const range = (a, b) => a + (b - a) * rnd();
  const shake = { amp: 0, ttl: 0, life: 1 };
  let white = 0;

  function push(list, item, cap) {
    if (list.length >= cap) list.splice(0, list.length - cap + 1);
    list.push(item);
  }

  // kind: 'spark' (short bright line), 'debris' (rotating hot polygon),
  // 'ember' (glowing dot), 'smoke' (soft dark puff)
  function particle(a, kind, o) {
    push(parts, {
      kind, ax: a.ax, ay: a.ay, x: o.x || 0, y: o.y || 0,
      vx: o.vx || 0, vy: o.vy || 0, drag: o.drag || 0,
      ttl: o.life, life: o.life, size: o.size || 2,
      rot: rnd() * 6.28, vr: o.vr || 0, sides: o.sides || 3,
      col: o.col || C.spark,
    }, V.PARTICLE_CAP);
  }

  // n sparks from anchor: dir (radians) and spread, or all around
  function sparks(a, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const ang = o.dir === undefined ? rnd() * 6.28 : o.dir + (rnd() - 0.5) * (o.spread === undefined ? 0.6 : o.spread);
      const sp = range(o.speedMin === undefined ? 60 : o.speedMin, o.speedMax === undefined ? 160 : o.speedMax);
      particle(a, 'spark', {
        x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: o.drag === undefined ? 1.5 : o.drag,
        life: range(o.lifeMin === undefined ? 0.2 : o.lifeMin, o.lifeMax === undefined ? 0.45 : o.lifeMax),
        size: o.size || 1.5, col: o.col || C.spark,
      });
    }
  }

  // n debris chunks: small rotating polygons, hot at first, cooling to steel
  function debris(a, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const ang = o.dir === undefined ? rnd() * 6.28 : o.dir + (rnd() - 0.5) * (o.spread === undefined ? 2.0 : o.spread);
      const sp = range(o.speedMin === undefined ? 40 : o.speedMin, o.speedMax === undefined ? 180 : o.speedMax);
      particle(a, 'debris', {
        x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 0.6,
        life: range(o.lifeMin === undefined ? 0.7 : o.lifeMin, o.lifeMax === undefined ? 1.6 : o.lifeMax),
        size: range(o.sizeMin === undefined ? 1.5 : o.sizeMin, o.sizeMax === undefined ? 4 : o.sizeMax),
        vr: (rnd() - 0.5) * 16, sides: 3 + Math.floor(rnd() * 3),
      });
    }
  }

  function embers(a, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const ang = rnd() * 6.28, sp = range(10, 50);
      particle(a, 'ember', {
        x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.0,
        life: range(0.8, 2.0), size: range(1, 2.5), col: C.ember,
      });
    }
  }

  function smoke(a, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const ang = rnd() * 6.28, sp = range(8, 30);
      particle(a, 'smoke', {
        x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.2,
        life: range(0.8, 1.6), size: range(3, 7), vr: 0,
      });
    }
  }

  // expanding ring: r0 start radius, vr px/s growth
  function ring(a, o) {
    push(rings, { ax: a.ax, ay: a.ay, x: o.x || 0, y: o.y || 0, r: o.r0 || 2, vr: o.vr || 150, ttl: o.life || 0.5, life: o.life || 0.5, width: o.width || 3, col: o.col || C.hot }, 40);
  }

  // point flash: a radial glow; fades from `col` toward `col2` as it dies
  function flash(a, o) {
    push(flashes, { ax: a.ax, ay: a.ay, x: o.x || 0, y: o.y || 0, r: o.r || 20, grow: o.grow || 0, ttl: o.life || 0.3, life: o.life || 0.3, col: o.col || C.white, col2: o.col2 || C.fire, core: o.core === undefined ? 1 : o.core }, 40);
  }

  // streak: a bright line of length len through the anchor along (dx,dy),
  // optionally sliding along itself at speed px/s
  function streak(a, o) {
    const l = Math.hypot(o.dx, o.dy) || 1;
    push(streaks, { ax: a.ax, ay: a.ay, x: o.x || 0, y: o.y || 0, dx: o.dx / l, dy: o.dy / l, len: o.len || 80, speed: o.speed || 0, ttl: o.life || 0.3, life: o.life || 0.3, width: o.width || 2, col: o.col || C.white }, 20);
  }

  function shakeIt(amp, dur) {
    if (amp >= shake.amp * (shake.ttl / shake.life)) { shake.amp = amp; shake.ttl = dur; shake.life = dur; }
  }
  function whiteFlash(a) { white = Math.max(white, a); }

  function step(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.ttl -= dt;
      if (p.ttl <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.rot += p.vr * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.ttl -= dt; r.r += r.vr * dt;
      if (r.ttl <= 0) rings.splice(i, 1);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.ttl -= dt; f.r += f.grow * dt;
      if (f.ttl <= 0) flashes.splice(i, 1);
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.ttl -= dt; s.x += s.dx * s.speed * dt; s.y += s.dy * s.speed * dt;
      if (s.ttl <= 0) streaks.splice(i, 1);
    }
    if (shake.ttl > 0) shake.ttl = Math.max(0, shake.ttl - dt);
    if (white > 0) white = Math.max(0, white - dt * 2.5);
  }

  // Shake offset: decaying, from a few incommensurate sines on real time.
  function shakeOffset(time) {
    if (shake.ttl <= 0 || shake.amp <= 0) return { x: 0, y: 0 };
    const k = shake.ttl / shake.life;
    const a = shake.amp * k * k;
    return {
      x: a * (Math.sin(time * 61) + 0.5 * Math.sin(time * 37 + 1.3)),
      y: a * (Math.cos(time * 53 + 0.7) + 0.5 * Math.sin(time * 29 + 2.1)),
    };
  }

  function draw(ctx) {
    // flashes first (under everything else), additive
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of flashes) {
      const s = toScreen(f.ax, f.ay);
      const x = s.x + f.x, y = s.y + f.y;
      const k = f.ttl / f.life;
      const a = k * k;
      const col = lerpCol(f.col2, f.col, k);
      const g = ctx.createRadialGradient(x, y, 0, x, y, f.r);
      g.addColorStop(0, rgba(f.core ? C.white : col, a));
      g.addColorStop(0.35, rgba(col, a * 0.6));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, f.r, 0, 6.2832); ctx.fill();
    }
    // streaks
    ctx.lineCap = 'round';
    for (const st of streaks) {
      const s = toScreen(st.ax, st.ay);
      const x = s.x + st.x, y = s.y + st.y;
      const k = st.ttl / st.life;
      const hx = st.dx * st.len * 0.5, hy = st.dy * st.len * 0.5;
      ctx.strokeStyle = rgba(st.col, k * 0.35);
      ctx.lineWidth = st.width * 3;
      ctx.beginPath(); ctx.moveTo(x - hx, y - hy); ctx.lineTo(x + hx, y + hy); ctx.stroke();
      ctx.strokeStyle = rgba(C.white, k);
      ctx.lineWidth = st.width * k;
      ctx.beginPath(); ctx.moveTo(x - hx, y - hy); ctx.lineTo(x + hx, y + hy); ctx.stroke();
    }
    // rings
    for (const r of rings) {
      const s = toScreen(r.ax, r.ay);
      const k = r.ttl / r.life;
      ctx.strokeStyle = rgba(r.col, k * 0.9);
      ctx.lineWidth = Math.max(0.5, r.width * k);
      ctx.beginPath(); ctx.arc(s.x + r.x, s.y + r.y, r.r, 0, 6.2832); ctx.stroke();
    }
    // sparks and embers (additive)
    for (const p of parts) {
      if (p.kind !== 'spark' && p.kind !== 'ember') continue;
      const s = toScreen(p.ax, p.ay);
      const x = s.x + p.x, y = s.y + p.y;
      const k = p.ttl / p.life;
      if (p.kind === 'spark') {
        ctx.strokeStyle = rgba(p.col, k);
        ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * 0.035, y - p.vy * 0.035); ctx.stroke();
      } else {
        const tw = 0.6 + 0.4 * Math.sin(p.rot * 3 + p.ttl * 20);
        ctx.fillStyle = rgba(p.col, k * tw);
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
    // debris and smoke (normal blending)
    ctx.save();
    for (const p of parts) {
      if (p.kind === 'spark' || p.kind === 'ember') continue;
      const s = toScreen(p.ax, p.ay);
      const x = s.x + p.x, y = s.y + p.y;
      const k = p.ttl / p.life;
      if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(40,44,52,${k * 0.35})`;
        ctx.beginPath(); ctx.arc(x, y, p.size * (1.6 - k * 0.6), 0, 6.2832); ctx.fill();
        continue;
      }
      // debris: hot for the first quarter of life, then steel grey, fading out at the end
      const heat = clamp01((k - 0.5) * 2);
      const col = lerpCol(C.steel, C.fire, heat * heat);
      ctx.fillStyle = rgba(col, Math.min(1, k * 3));
      ctx.beginPath();
      for (let i = 0; i < p.sides; i++) {
        const a = p.rot + (i / p.sides) * 6.2832;
        const rr = p.size * (i % 2 ? 0.7 : 1);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      if (heat > 0.2) {
        ctx.strokeStyle = rgba(C.hot, heat * 0.6);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  return {
    rnd, range, sparks, debris, embers, smoke, ring, flash, streak, shakeIt, whiteFlash,
    step, draw, shakeOffset, white: () => white,
  };
}

// The big-hit recipe shared by both panels. k scales size; 1 = torpedo.
// a = anchor, dir = direction (radians) the hit came from, for the debris cone.
function bigImpact(fx, a, k, o = {}) {
  fx.flash(a, { x: o.x, y: o.y, r: 22 * k, grow: 30 * k, life: 0.45, col: C.white, col2: C.fire });
  fx.ring(a, { x: o.x, y: o.y, r0: 3, vr: 170 * k, life: 0.55, width: 3 * k, col: C.hot });
  fx.ring(a, { x: o.x, y: o.y, r0: 2, vr: 90 * k, life: 0.8, width: 1.5, col: C.fire });
  fx.debris(a, Math.round(fx.range(20, 40) * k), { x: o.x, y: o.y, speedMin: 50 * k, speedMax: 220 * k, dir: o.away, spread: o.away === undefined ? undefined : 2.4 });
  fx.sparks(a, Math.round(24 * k), { x: o.x, y: o.y, speedMin: 120, speedMax: 320 * k, lifeMin: 0.25, lifeMax: 0.6, size: 1.5, col: C.hot });
  fx.embers(a, 10, { x: o.x, y: o.y });
  fx.smoke(a, 6, { x: o.x, y: o.y });
  // the scar: a small orange glow that lingers after the flash
  fx.flash(a, { x: o.x, y: o.y, r: 9 * k, life: 2.2, col: C.ember, col2: [120, 40, 10], core: 0 });
  fx.shakeIt(6 * k, 0.4);
  fx.whiteFlash(0.3 * k);
}

// --- tactical view ---------------------------------------------------------------

// Top-down view: camera between the ships, marks, rings, tracers,
// torpedoes, slugs, aim lines and the impact effects anchored in world km.
// opts.inset: () => ({top, right, bottom, left}) in CSS px, the HUD-covered
// margins; the ships are centered and fitted inside the remaining rect,
// the starfield still covers the whole canvas. Default: no inset.
//
// opts.camera === 'engage': frame both ships, live projectiles (a slug's end point too) and recent
// impact points instead of the default camera. opts.quiet: this view's fx never shake or white-flash.
//
// opts.maxScale: px per km cap of the engage camera (default V.MAX_SCALE).
// opts.markPx: [min, max] px. Set: big top-down hull marks drawn from the form (length
// clamp(0.25 * view height, min, max)), tracers end where they enter the mark box, rake tracers
// spark there, and pdc/torp/rail hit fx sit on the mark edge facing the shooter. Unset: today's mark.
//
// Returns {draw, onEvent, reset, toScreen, toWorld, shipScreen, setGhost, requiredPoints, safeRect, cameraState}:
// - cameraState() -> {x, y, scale, mode} of the camera (mode: inbound | outbound | rail | idle; null when not engage).
// - requiredPoints() -> [{x, y}] km the engage camera had to show (the hard points) on the last frame ([] otherwise).
// - safeRect() -> {x, y, w, h} CSS px: the view rect less the engage margin.
// - toScreen(wx, wy) -> {x, y}: world km to CSS px of the canvas, current camera.
// - toWorld(sx, sy) -> {x, y}: the inverse.
// - shipScreen(shipId) -> {x, y} of that ship's mark from the last drawn
//   battle, or null before the first draw.
// - setGhost(ghost): null, or {sx, sy, ex, ey, heading, face, speed}, the move
//   order being dragged (CSS px start and finger, heading in screen radians,
//   face 'bow'|'side'|'tail' as a color hint, speed 0..1 of MAX_SPEED). Drawn over the map each frame until
//   cleared; it rides with the camera and draws while paused (dtReal 0).
export function makeTactical(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const inset = typeof opts.inset === 'function' ? opts.inset : () => null;
  const cam = { x: 0, y: 0, scale: 20, init: false };
  let w = 0, h = 0, time = 0;
  const rect = { x: 0, y: 0, w: 1, h: 1 }; // the area not covered by HUD
  let last = null; // the battle from the last draw, read-only, to resolve ship ids in events
  const starfield = makeStarfield(0), litMark = makeLitSprites(), vignette = makeVignette();
  let tints = [];   // impact light on a hull mark: {id, u, v (mark frame px), r, a, ttl, life}
  let blooms = [];  // {ax, ay, x, y, kind, col, ttl, life}
  const toScreen = (ax, ay) => ({ x: rect.x + rect.w / 2 + (ax - cam.x) * cam.scale, y: rect.y + rect.h / 2 + (ay - cam.y) * cam.scale });
  const toWorld = (sx, sy) => ({ x: cam.x + (sx - rect.x - rect.w / 2) / cam.scale, y: cam.y + (sy - rect.y - rect.h / 2) / cam.scale });
  const fx = makeFx(toScreen);
  // quiet: this view never shakes the screen or flashes it white (another view owns those beats)
  if (opts.quiet === true) { fx.shakeIt = () => {}; fx.whiteFlash = () => {}; }
  const engage = opts.camera === 'engage';
  const maxScale = Number.isFinite(opts.maxScale) ? opts.maxScale : V.MAX_SCALE;
  const bigMarks = Array.isArray(opts.markPx) && opts.markPx.length >= 2;
  let markL = V.MARK_LEN; // px, the mark length of the last drawn frame (the small mark unless markPx is set)
  let seenTracers = new WeakSet(); // tracers whose contact spark was already made
  let torpNear = {};   // big marks: per targeted ship id, the torpedo nearest to it at the last draw {x, y}
  let evPts = [];      // engage camera: {x, y, ttl, mode, key} km points of recent impacts and misses, per camera mode
  let evSeq = 0;
  let reqPts = [];     // the required (hard) points of the last drawn frame, km
  let camMode = 'idle', modeInit = false, linger = 0; // engage camera mode, and how long its trigger has been over
  let holdIn = false, liveN = 0; // engage: zoom-in held after a projectile of the mode died (see engageCamera)
  let trans = false, transT = 0, prevKeys = null, curKeys = new Set(); // mode change: the points the new mode adds ease in
  let snap = [];       // the projectile points of the current mode while its trigger was last on
  const objIds = new WeakMap(); let objSeq = 0;
  const oid = (o) => { let i = objIds.get(o); if (i === undefined) { i = ++objSeq; objIds.set(o, i); } return i; };
  let pad = V.PAD_MIN; // px, the engage camera margin of the last drawn frame
  const pending = []; // delayed secondary explosions: {ax, ay, delay}
  const tint = (id) => (id === 'me' ? C.me : C.them);
  const shipOf = (id) => (last ? (last.shipById ? last.shipById(id) : last.ships.find((s) => s.id === id)) : null);
  const shipScreen = (id) => { const s = shipOf(id); return s ? toScreen(s.x, s.y) : null; };
  let ghost = null; // the move order being dragged, see setGhost
  const setGhost = (g) => { ghost = g || null; };

  function draw(battle, dtReal) {
    const dt = clamp(dtReal || 0, 0, V.MAX_DT);
    time += dt;
    last = battle;
    const size = fit(canvas, ctx);
    // No size (hidden, mid-rotation): skip the frame and forget the camera,
    // so it snaps to a fresh fit instead of easing from a stale one.
    if (!size) { cam.init = false; return; }
    if (size.w !== w || size.h !== h) { w = size.w; h = size.h; cam.init = false; }
    const ins = inset() || {};
    rect.x = ins.left || 0; rect.y = ins.top || 0;
    rect.w = Math.max(1, w - rect.x - (ins.right || 0));
    rect.h = Math.max(1, h - rect.y - (ins.bottom || 0));
    const [me, them] = battle.ships;

    pad = clamp(V.PAD_FRAC * Math.min(rect.w, rect.h), V.PAD_MIN, V.PAD_MAX);
    if (bigMarks) markL = clamp(V.MARK_LEN_FRAC * rect.h, opts.markPx[0], opts.markPx[1]);
    if (engage) engageCamera(battle, me, them, dt);
    else {
      // camera: center between the ships, scale so both fit in the inset rect with margin
      const tx = (me.x + them.x) / 2, ty = (me.y + them.y) / 2;
      const spanX = Math.abs(me.x - them.x) + 2.0, spanY = Math.abs(me.y - them.y) + 1.6;
      const ts = clamp(Math.min(rect.w * 0.78 / spanX, rect.h * 0.72 / spanY), V.MIN_SCALE, V.MAX_SCALE);
      if (!cam.init || !Number.isFinite(cam.scale)) { cam.x = tx; cam.y = ty; cam.scale = ts; cam.init = true; } else {
        const k = 1 - Math.exp(-dt * 4), ks = 1 - Math.exp(-dt * 2.5);
        cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.scale += (ts - cam.scale) * ks;
      }
    }

    // delayed effects and particle motion
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      p.delay -= dt;
      if (p.delay <= 0) { pending.splice(i, 1); secondary(p); }
    }
    fx.step(dt);
    for (let i = tints.length - 1; i >= 0; i--) { tints[i].ttl -= dt; if (tints[i].ttl <= 0) tints.splice(i, 1); }
    for (let i = blooms.length - 1; i >= 0; i--) { blooms[i].ttl -= dt; if (blooms[i].ttl <= 0) blooms.splice(i, 1); }

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    const so = fx.shakeOffset(time);
    ctx.save();
    ctx.translate(so.x, so.y);
    starfield(ctx, cam.x * V.STAR_PX_PER_KM, cam.y * V.STAR_PX_PER_KM, w, h, time);
    drawRangeRings(battle);
    drawScaleBar();
    drawAimLines(battle);
    drawTracers(battle);
    drawProjectiles(battle);
    drawMarks(battle);
    fx.draw(ctx);
    drawBlooms();
    ctx.restore();
    vignette(ctx, w, h, rect); // decoration over the scene; no text on this canvas, the HUD is DOM above it
    if (ghost) drawGhost(battle); // input overlay: outside the shake, so the finger point stays put
    const wa = fx.white();
    if (wa > 0) { ctx.fillStyle = `rgba(255,240,225,${wa})`; ctx.fillRect(0, 0, w, h); }
  }

  // The engage camera. Four modes, the first whose trigger holds (MODE_ORDER):
  //   inbound   live torpedoes aimed at me          -> my ship + those torpedoes
  //   outbound  live torpedoes aimed at them        -> their ship + those torpedoes + my ship (the ghost starts there)
  //   rail      a railgun aiming, or a live slug    -> both ships + every slug (position and end point)
  //   idle      -> both ships
  // Recent event points (EVENT_PT_TTL) join only the mode they belong to. When the current mode's
  // trigger ends the camera keeps that mode (its last projectile points) for MODE_LINGER of dt, then
  // takes the new one. On a change the points the new mode adds ease in over MODE_TRANS (soft); the
  // points both modes had stay hard. Zoom out at once, zoom in eased within a mode; if after easing a
  // hard point is outside the pad margin the camera snaps to the target. dt 0 (paused): nothing moves.
  function engageCamera(battle, me, them, dt) {
    for (let i = evPts.length - 1; i >= 0; i--) { evPts[i].ttl -= dt; if (evPts[i].ttl <= 0) evPts.splice(i, 1); }
    const live = { inbound: [], outbound: [], rail: [], idle: [] };
    for (const p of battle.projectiles) {
      if (p.dead) continue;
      const id = oid(p);
      if (p.kind === 'torp') (p.target === 'me' ? live.inbound : live.outbound).push({ key: 'p' + id, x: p.x, y: p.y });
      else if (p.kind === 'slug') live.rail.push({ key: 'p' + id, x: p.x, y: p.y }, { key: 't' + id, x: p.tx, y: p.ty });
    }
    const aiming = (s) => s.railAim >= 0 && s.pieces.rail.alive;
    const trig = { inbound: live.inbound.length > 0, outbound: live.outbound.length > 0, rail: aiming(me) || aiming(them) || live.rail.length > 0, idle: true };
    const want = MODE_ORDER.find((m) => trig[m]);
    const fresh = !modeInit;
    if (fresh) { camMode = want; modeInit = true; linger = 0; trans = false; snap = []; holdIn = false; liveN = 0; }
    else if (dt > 0) {
      if (want === camMode) linger = 0;
      else {
        if (!trig[camMode]) linger += dt;
        if (trig[camMode] || linger >= V.MODE_LINGER) { prevKeys = curKeys; camMode = want; linger = 0; trans = true; transT = 0; holdIn = false; liveN = 0; }
      }
    }
    // No pumping when torpedoes die: once one of this mode's projectiles is gone (or the mode lingers),
    // the camera stops zooming in; it holds on the intercept and pulls back once, at the mode change.
    if (dt > 0) { const n = live[camMode].length; if (n < liveN || linger > 0) holdIn = true; liveN = n; }
    if (trig[camMode]) snap = live[camMode];

    const sp = (s) => ({ key: 'ship:' + s.id, x: s.x, y: s.y });
    const full = camMode === 'inbound' ? [sp(me)] : camMode === 'outbound' ? [sp(them), sp(me)] : [sp(me), sp(them)];
    for (const p of snap) full.push(p);
    for (const e of evPts) if (e.mode === camMode) full.push(e);
    curKeys = new Set(full.map((p) => p.key));
    let hard = full;
    if (trans && prevKeys) { hard = full.filter((p) => prevKeys.has(p.key)); if (hard.length === 0) hard = full; }
    reqPts = hard;

    const target = (list) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of list) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.min(Math.max(1, rect.w - 2 * pad) / Math.max(x1 - x0, 1), Math.max(1, rect.h - 2 * pad) / Math.max(y1 - y0, 1), maxScale) };
    };
    const outside = (list) => list.some((p) => {
      const s = toScreen(p.x, p.y);
      return s.x < rect.x + pad - 0.5 || s.x > rect.x + rect.w - pad + 0.5 || s.y < rect.y + pad - 0.5 || s.y > rect.y + rect.h - pad + 0.5;
    });
    const tf = target(full), th = hard === full ? tf : target(hard);
    if (!cam.init || !Number.isFinite(cam.scale)) { cam.x = tf.x; cam.y = tf.y; cam.scale = tf.s; cam.init = true; trans = false; return; }
    if (dt <= 0) return; // paused: nothing moves, the mode cannot change
    if (trans) {
      const k = 1 - Math.exp(-dt / V.TRANS_TAU);
      cam.x += (tf.x - cam.x) * k; cam.y += (tf.y - cam.y) * k; cam.scale += (tf.s - cam.scale) * k;
    } else {
      cam.x += (tf.x - cam.x) * (1 - Math.exp(-dt * 6));
      cam.y += (tf.y - cam.y) * (1 - Math.exp(-dt * 6));
      if (tf.s < cam.scale) cam.scale = tf.s; else if (!holdIn) cam.scale += (tf.s - cam.scale) * (1 - Math.exp(-dt * 2.5));
    }
    // snap to keep every hard point in frame; while holding, never as a zoom-in (a smaller scale at the
    // target centre still fits every point)
    if (outside(hard)) { cam.x = th.x; cam.y = th.y; cam.scale = holdIn ? Math.min(cam.scale, th.s) : th.s; }
    if (trans) {
      transT += dt;
      // done after MODE_TRANS once the soft points are inside too (so the hard set growing never snaps the camera)
      if (transT >= V.MODE_TRANS && (!outside(full) || transT >= 2.5 * V.MODE_TRANS)) trans = false;
    }
  }
  const requiredPoints = () => (engage ? reqPts.map((p) => ({ x: p.x, y: p.y })) : []);
  const cameraState = () => ({ x: cam.x, y: cam.y, scale: cam.scale, mode: engage ? camMode : null });
  const safeRect = () => ({ x: rect.x + pad, y: rect.y + pad, w: Math.max(1, rect.w - 2 * pad), h: Math.max(1, rect.h - 2 * pad) });

  // --- big marks: the form seen from above ---------------------------------------------------

  // The mark box of a ship: L along the nose, W across, centred on the ship.
  function markGeom(s) {
    const L = markL, W = L * s.form.h / s.form.w;
    return { L, W, hl: L / 2, hw: W / 2 };
  }
  const markAngle = (s, e) => noseAngle(s, Math.atan2(e.y - s.y, e.x - s.x));

  // Where a ray from the ship's centre along screen angle dir leaves its mark box, px from the centre.
  function boxEdge(s, a, dir) {
    const g = markGeom(s);
    const ux = Math.abs(Math.cos(dir - a)), uy = Math.abs(Math.sin(dir - a));
    const t = Math.min(ux > 1e-6 ? g.hl / ux : Infinity, uy > 1e-6 ? g.hw / uy : Infinity);
    return { x: Math.cos(dir) * t, y: Math.sin(dir) * t };
  }

  // Where the segment A -> B enters the box (centre c, nose a, half sizes hl hw), or null when B is not inside it.
  function boxEntry(A, B, c, a, hl, hw) {
    const co = Math.cos(a), si = Math.sin(a);
    const u0 = (A.x - c.x) * co + (A.y - c.y) * si, v0 = -(A.x - c.x) * si + (A.y - c.y) * co;
    const u1 = (B.x - c.x) * co + (B.y - c.y) * si, v1 = -(B.x - c.x) * si + (B.y - c.y) * co;
    if (Math.abs(u1) > hl || Math.abs(v1) > hw) return null;
    let t0 = 0;
    for (const [p0, p1, h] of [[u0, u1, hl], [v0, v1, hw]]) {
      const d = p1 - p0;
      if (Math.abs(d) < 1e-9) continue;
      const ta = (-h - p0) / d, tb = (h - p0) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
    }
    t0 = clamp01(t0);
    return { x: A.x + (B.x - A.x) * t0, y: A.y + (B.y - A.y) * t0 };
  }

  // The hull from its cells: bow along +x of the form, cut and torn cells gone, dead rooms dark,
  // job rooms in their room colour (dimmed), frame in the ship tint, a 1 px outline round the bounds.
  function drawBigMark(ctx, s, ang) {
    const { L, W, hl, hw } = markGeom(s);
    const fw = s.form.w, fh = s.form.h, cell = L / fw, flip = s.facing === -1 ? -1 : 1;
    const tc = tint(s.id);
    ctx.save();
    ctx.rotate(ang);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const c = s.cells[y][x];
        const pc = c && s.pieces[c.room];
        if (!c || c.cut || (pc && pc.torn)) continue;
        const rc = roomColor(c.room);
        let fill;
        if (!pc || !pc.alive) fill = DEAD_CSS;
        else if (rc) fill = mixRgb(rc, BG_RGB, 1 - V.MARK_DIM);
        else fill = mixRgb(tc, BG_RGB, 1 - V.MARK_FRAME);
        ctx.fillStyle = fill;
        const u = (x + 0.5 - fw / 2) * cell, v = flip * (y + 0.5 - fh / 2) * cell;
        ctx.fillRect(u - cell / 2 - 0.2, v - cell / 2 - 0.2, cell + 0.4, cell + 0.4);
      }
    }
    ctx.strokeStyle = rgba(tc, 0.85);
    ctx.lineWidth = 1;
    ctx.strokeRect(-hl, -hw, L, W);
    ctx.restore();
  }

  // The move order under the finger: guide rays for the bow, broadside and
  // stern zones, an arrow from the 'me' mark along the drag as long as the
  // asked speed, and a faint ghost of the mark turned to that heading at its end.
  function drawGhost(battle) {
    const me = battle.shipById ? battle.shipById('me') : battle.ships[0];
    const them = battle.enemyOf ? battle.enemyOf(me) : battle.ships[1];
    if (!me || !them) return;
    const p = toScreen(me.x, me.y), q = toScreen(them.x, them.y);
    const bearing = Math.atan2(q.y - p.y, q.x - p.x);
    const face = GHOST_COL[ghost.face] ? ghost.face : 'bow';
    const col = GHOST_COL[face];
    const speed = clamp01(ghost.speed || 0);
    const pulse = 0.75 + 0.25 * Math.sin(time * 6);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // guide rays: toward the enemy, away, and the two across. Very faint.
    ctx.strokeStyle = 'rgba(190,210,235,0.11)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    for (const o of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const a = bearing + o;
      ctx.moveTo(p.x + Math.cos(a) * markL, p.y + Math.sin(a) * markL);
      ctx.lineTo(p.x + Math.cos(a) * V.GHOST_RAY_PX, p.y + Math.sin(a) * V.GHOST_RAY_PX);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // the arrow: along the finger's drag, length = asked speed. No drag yet: along the current nose.
    const ddx = (ghost.ex || 0) - (ghost.sx || 0), ddy = (ghost.ey || 0) - (ghost.sy || 0);
    const ang = Math.hypot(ddx, ddy) > 0.5 ? Math.atan2(ddy, ddx) : Number.isFinite(ghost.heading) ? ghost.heading : noseAngle(me, bearing);
    const nose = ang;
    const len = speed * N.DRAG_FULL_PX;
    const ex = p.x + Math.cos(ang) * len, ey = p.y + Math.sin(ang) * len;
    if (len > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(col, 0.22 * pulse);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = 1.5;
      const ah = Math.min(9, 3 + len * 0.1);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey);
      ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang - 0.45) * ah, ey - Math.sin(ang - 0.45) * ah);
      ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang + 0.45) * ah, ey - Math.sin(ang + 0.45) * ah);
      ctx.stroke();
      ctx.restore();
    }

    // ghost mark just past the arrow tip (or over the ship when holding), turned to the asked facing
    const off = len > 2 ? markL * 0.8 : 0;
    const gx = ex + Math.cos(ang) * off, gy = ey + Math.sin(ang) * off;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.3 * pulse;
    ctx.fillStyle = rgba(col, 1);
    drawShipMark(ctx, me, gx, gy, markL, nose);
    ctx.restore();

    // my firing arcs at the asked heading, to scale, and what bears on them at this range
    drawArcs(ctx, me, p.x, p.y, ang, (a) => a.km * cam.scale, 0.07, 0.35);
    drawPdcCounts(ctx, me, p.x, p.y, ang, (a) => a.km * cam.scale);
    const dx = them.x - me.x, dy = them.y - me.y, range = battle.range();
    const ly = -dx * Math.sin(ang) + dy * Math.cos(ang), ends = face !== 'side'; // ly < 0: the enemy is on my top side
    const mounts = pdcRooms(me).filter((r) => alive(me, r) && (ends || mountSide(me, r) === (ly < 0 ? 'top' : 'bottom'))).length;
    const bears = [];
    if (face === 'bow' && range <= railKm(me) && alive(me, 'rail') && alive(me, 'sensors')) bears.push('RAIL');
    if (face !== 'tail' && range <= N.TORP_RANGE && alive(me, 'tubes') && me.torps > 0) bears.push('TUBES');
    if (mounts > 0) bears.push(range <= N.PDC_RANGE ? `PDC ${mounts}` : `PDC ${mounts} (far)`);
    const word = [face.toUpperCase(), ...bears].join(' \u00b7 ');
    ctx.font = '11px "SF Mono", Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(word).width + 10, ty = clamp(gy - 22, 10, h - 10), tx = clamp(gx, tw / 2 + 2, w - tw / 2 - 2);
    ctx.fillStyle = 'rgba(6,8,15,0.8)'; ctx.fillRect(tx - tw / 2, ty - 8, tw, 16);
    ctx.fillStyle = rgba(col, 1); ctx.fillText(word, tx, ty + 0.5);

    // the finger: a faint ring where it is now
    if (Number.isFinite(ghost.ex) && Number.isFinite(ghost.ey)) {
      ctx.strokeStyle = rgba(col, 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ghost.ex, ghost.ey, 13, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRangeRings(battle) {
    for (const s of battle.ships) {
      const p = toScreen(s.x, s.y);
      const col = s.id === 'me' ? '140,180,220' : '220,170,130';
      ctx.strokeStyle = `rgba(${col},0.08)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, N.PDC_RANGE * cam.scale, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},0.045)`;
      ctx.setLineDash([2, 9]);
      ctx.beginPath(); ctx.arc(p.x, p.y, N.TORP_RANGE * cam.scale, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // bottom-left of the inset rect: ticks one km apart, out to PDC range. No text (HUD owns text).
  function drawScaleBar() {
    const x0 = rect.x + 10, y0 = rect.y + rect.h - 8, km = N.PDC_RANGE;
    ctx.strokeStyle = 'rgba(160,185,210,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + km * cam.scale, y0);
    for (let i = 0; i <= km; i++) { ctx.moveTo(x0 + i * cam.scale, y0); ctx.lineTo(x0 + i * cam.scale, y0 - (i === 0 || i === km ? 5 : 3)); }
    ctx.stroke();
  }

  // Red aim line from a shooter whose railgun is aiming, brighter as the
  // three seconds run out, with a tightening reticle on the target.
  function drawAimLines(battle) {
    for (const s of battle.ships) {
      if (!(s.railAim >= 0) || !s.pieces.rail.alive) continue;
      const e = battle.enemyOf ? battle.enemyOf(s) : battle.ships.find((o) => o !== s);
      const p = clamp01(s.railAim / N.RAIL_AIM_TIME);
      const pulse = 0.65 + 0.35 * Math.sin(time * (8 + 12 * p));
      let a = toScreen(s.x, s.y), b = toScreen(e.x, e.y);
      // big marks: the reticle rings the bigger hull, and the line runs from the shooter's mark edge to the ring
      const r = 9 + 10 * (1 - p) + (bigMarks ? markL * 0.5 : 0);
      const c0 = b;
      if (bigMarks) {
        const dd = Math.hypot(b.x - a.x, b.y - a.y);
        if (dd > markL * 0.5 + r) {
          const ux = (b.x - a.x) / dd, uy = (b.y - a.y) / dd;
          a = { x: a.x + ux * markL * 0.5, y: a.y + uy * markL * 0.5 };
          b = { x: b.x - ux * r, y: b.y - uy * r };
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.warn, (0.18 + 0.7 * p) * pulse);
      ctx.lineWidth = 1 + 1.5 * p;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -time * 80;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      b = c0;
      ctx.lineWidth = 1 + p;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x - r - 4, b.y); ctx.lineTo(b.x - r + 3, b.y);
      ctx.moveTo(b.x + r + 4, b.y); ctx.lineTo(b.x + r - 3, b.y);
      ctx.moveTo(b.x, b.y - r - 4); ctx.lineTo(b.x, b.y - r + 3);
      ctx.moveTo(b.x, b.y + r + 4); ctx.lineTo(b.x, b.y + r - 3);
      ctx.stroke();
      ctx.restore();
    }
  }

  // PDC tracers: each tracer line is a shot in flight. A short bright streak
  // runs from the muzzle to the target over its ttl, with a faint full-length trace.
  function drawTracers(battle) {
    if (!battle.tracers || battle.tracers.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const tr of battle.tracers) {
      const a = toScreen(tr.x1, tr.y1);
      let b = toScreen(tr.x2, tr.y2);
      if (bigMarks) b = contactPoint(battle, tr, a, b);
      const col = tint(tr.owner);
      const p = clamp01(1 - tr.ttl / V.TRACER_TTL);
      const p0 = Math.max(0, p - 0.3);
      ctx.strokeStyle = rgba(col, 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const hx = lerp(a.x, b.x, p), hy = lerp(a.y, b.y, p), tx = lerp(a.x, b.x, p0), ty = lerp(a.y, b.y, p0);
      ctx.strokeStyle = rgba(col, 0.3);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = rgba(C.white, 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      bloom(ctx, hx, hy, 'tracer', col, 1, bloomScale());
    }
    ctx.restore();
  }

  // Big marks: a tracer ending inside its target's mark box is drawn only to where its line enters the
  // box. The first frame such a (rake) tracer is seen it throws a few short sparks from that point.
  function contactPoint(battle, tr, a, b) {
    const t = battle.ships.find((o) => o.id !== tr.owner), o = battle.ships.find((q) => q.id === tr.owner);
    if (!t || !o) return b;
    const c = toScreen(t.x, t.y), g = markGeom(t), ang = markAngle(t, o);
    const E = boxEntry(a, b, c, ang, g.hl, g.hw);
    if (!E) return b;
    if (!seenTracers.has(tr)) {
      seenTracers.add(tr);
      const an = { ax: t.x, ay: t.y }, ox = E.x - c.x, oy = E.y - c.y;
      const back = Math.atan2(a.y - b.y, a.x - b.x); // back toward the muzzle
      fx.sparks(an, 2 + Math.floor(fx.rnd() * 2), { x: ox, y: oy, dir: back, spread: 1.6, speedMin: 40, speedMax: 110, lifeMin: 0.06, lifeMax: V.SPARK_LIFE, size: 1.2, col: C.hot });
      fx.flash(an, { x: ox, y: oy, r: 4, life: 0.1, col: C.hot, col2: C.spark });
    }
    return E;
  }

  function drawProjectiles(battle) {
    if (bigMarks) torpNear = {};
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of battle.projectiles) {
      if (p.dead) continue;
      const s = toScreen(p.x, p.y);
      if (p.kind === 'torp') {
        if (bigMarks) {
          const tg = battle.ships.find((o) => o.id === p.target);
          const cur = torpNear[p.target];
          if (tg && (!cur || Math.hypot(p.x - tg.x, p.y - tg.y) < Math.hypot(cur.x - tg.x, cur.y - tg.y))) torpNear[p.target] = { x: p.x, y: p.y };
        }
        const sp = Math.hypot(p.vx, p.vy) || 1e-6;
        const dx = p.vx / sp, dy = p.vy / sp;
        const len = 7 + 12 * Math.min(1, sp / N.TORP_SPEED);
        const col = tint(p.owner);
        const flick = 0.8 + 0.2 * Math.sin(time * 40 + p.x * 7);
        ctx.strokeStyle = rgba(col, 0.35 * flick);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * len, s.y - dy * len); ctx.stroke();
        ctx.strokeStyle = rgba(C.white, 0.8 * flick);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * len * 0.6, s.y - dy * len * 0.6); ctx.stroke();
        ctx.fillStyle = rgba(C.white, 1);
        ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, 6.2832); ctx.fill();
        bloom(ctx, s.x, s.y, 'torp', col, flick, bloomScale());
      } else {
        // slug: a long white streak trailing behind the slug
        const ddx = p.tx - p.x, ddy = p.ty - p.y;
        const d = Math.hypot(ddx, ddy) || 1e-6;
        const dx = ddx / d, dy = ddy / d;
        const len = 44;
        ctx.strokeStyle = 'rgba(200,220,255,0.35)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * len, s.y - dy * len); ctx.stroke();
        ctx.strokeStyle = rgba(C.white, 1);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * len, s.y - dy * len); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // What the drawn mark depends on: its angle, which rooms stand and which cells are gone (the sprite cache key).
  function markVer(s, ang) {
    let v = ang.toFixed(3) + '|';
    for (const k in s.pieces) { const q = s.pieces[k]; v += q.alive ? (q.torn ? 't' : '1') : '0'; }
    let cut = 0;
    for (const row of s.cells) for (const c of row) if (c && c.cut) cut++;
    return v + '|' + cut;
  }
  function drawMarks(battle) {
    for (const s of battle.ships) {
      const e = battle.enemyOf ? battle.enemyOf(s) : battle.ships.find((o) => o !== s);
      const p = toScreen(s.x, s.y);
      const ang = markAngle(s, e);
      const col = tint(s.id);

      // velocity vector: where the ship will be in 2.5 s. Nothing when still.
      const sp = Math.hypot(s.vx, s.vy);
      const len = sp * 2.5 * cam.scale;
      if (len > 2) {
        const dx = s.vx / sp, dy = s.vy / sp;
        const ex = p.x + dx * len, ey = p.y + dy * len;
        ctx.save();
        ctx.strokeStyle = rgba(col, 0.45);
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey);
        // tiny arrowhead
        const ah = Math.min(4, len * 0.5), ba = Math.atan2(dy, dx);
        ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ba - 0.5) * ah, ey - Math.sin(ba - 0.5) * ah);
        ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ba + 0.5) * ah, ey - Math.sin(ba + 0.5) * ah);
        ctx.stroke();
        ctx.restore();
      }

      // thrust plume: thrust > 0 pushes nose-ward, so the exhaust leaves the
      // stern, as long as the thrust. Thrust < 0 is braking: a shorter retro
      // plume out of the bow. A ship facing tail-on and burning away points
      // its plume at the enemy, which is what it would look like. None when coasting.
      const th = s.pieces.drive.alive ? (s.thrust || 0) : 0;
      if (Math.abs(th) > 0.05) {
        const back = th > 0;
        const pa = ang + (back ? Math.PI : 0);
        const sx = Math.cos(pa), sy = Math.sin(pa);
        const pk = markL / V.MARK_LEN; // the plume grows with the mark (1 for the small mark)
        const pl = (back ? 5 + 14 * th : 3 + 7 * -th) * pk;
        const pw = 3 * pk;
        drawPlume(ctx, p.x + sx * markL * 0.5, p.y + sy * markL * 0.5, sx, sy, pl, pw, time, s.id === 'me' ? 0 : 7);
      }

      // the hull, lit by the key light in screen space, with the impact tints of the last moments
      const mt = [];
      for (const t of tints) if (t.id === s.id) {
        const k = t.ttl / t.life, c = Math.cos(ang), si = Math.sin(ang);
        mt.push({ x: t.u * c - t.v * si, y: t.u * si + t.v * c, r: t.r, a: t.a * k * k, col: C.fire });
      }
      // the angle snapped to 0.004 rad (under a quarter degree: invisible) so a steady turn reuses the sprite more
      const angQ = Math.round(ang / 0.004) * 0.004, ver = markVer(s, angQ);
      if (bigMarks) {
        const g = markGeom(s);
        litMark(ctx, s.id, p.x, p.y, Math.hypot(g.L, g.W) + 2, (c2) => drawBigMark(c2, s, angQ), mt, ver + '|' + markL);
        continue;
      }
      litMark(ctx, s.id, p.x, p.y, V.MARK_LEN + 2, (c2) => { c2.fillStyle = s.id === 'me' ? COLORS.me : COLORS.them; drawShipMark(c2, s, 0, 0, V.MARK_LEN, angQ); }, mt, ver);
    }
  }
  // the second, smaller blast after a piece dies
  function secondary(p) {
    const a = { ax: p.ax, ay: p.ay };
    fx.flash(a, { r: 14, grow: 20, life: 0.35, col: C.hot, col2: C.fire });
    fx.ring(a, { r0: 2, vr: 110, life: 0.45, width: 2, col: C.fire });
    fx.debris(a, 12, { speedMin: 40, speedMax: 150 });
    fx.sparks(a, 12, { speedMin: 80, speedMax: 200, col: C.fire });
    fx.embers(a, 8, {});
    fx.shakeIt(3, 0.3);
  }

  // direction (radians, screen) from the shooter to a point; defaults to +x
  function fromShooter(shooterId, x, y) {
    const s = shipOf(shooterId);
    if (!s) return 0;
    return Math.atan2(y - s.y, x - s.x);
  }
  const otherId = (id) => (id === 'me' ? 'them' : 'me');
  // Big marks: the px offset (from the victim's centre) of the point on its mark edge facing `from`
  // ({x, y} km, default the other ship), and `out`, the screen angle from the victim to it.
  function hitAt(victimId, from) {
    const v = shipOf(victimId), o = shipOf(otherId(victimId));
    if (!v || !o) return { x: 0, y: 0, out: 0 };
    const src = from || o;
    const out = Math.atan2(src.y - v.y, src.x - v.x);
    const e = boxEdge(v, markAngle(v, o), out);
    return { x: e.x, y: e.y, out };
  }
  // where a ship's stern points on the map right now (radians); +x when unknown
  function sternDir(id) {
    const s = shipOf(id), e = shipOf(otherId(id));
    if (!s || !e) return Math.PI;
    return noseAngle(s, Math.atan2(e.y - s.y, e.x - s.x)) + Math.PI;
  }
  // A Burn kicks the ship along its hull, the way the nose points: the exhaust leaves the
  // stern. With the ship unknown, fall back to the fight line being the x axis.
  function burnExhaustDir(id) {
    const s = shipOf(id);
    return s ? s.heading + Math.PI : Math.PI;
  }

  // G1: the bloom and the impact light of a beat, sized by the amplitude hierarchy (look.js BLOOM)
  const bloomScale = () => clamp(markL / 40, 0.5, 1.2);
  function lookEvent(ev) {
    if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y)) return;
    const add = (kind, col, o) => { const b = BLOOM[kind]; blooms.push({ ax: ev.x, ay: ev.y, x: o ? o.x : 0, y: o ? o.y : 0, kind, col, ttl: b.life, life: b.life }); };
    // a warm light on the hull edge facing the other ship, in the mark's own frame so it turns with it
    const tintHull = (id, r, a, life) => {
      const v = shipOf(id), o = shipOf(otherId(id));
      if (!v || !o) return;
      const ang = markAngle(v, o), e = boxEdge(v, ang, Math.atan2(o.y - v.y, o.x - v.x)), c = Math.cos(-ang), si = Math.sin(-ang);
      tints.push({ id, u: (e.x * c - e.y * si) * 0.8, v: (e.x * si + e.y * c) * 0.8, r: r * markL, a, ttl: life, life });
    };
    switch (ev.type) {
      case 'pdcHit': tintHull(ev.ship, 0.3, 0.3, 0.15); break;
      case 'torpHit': add('torpHit', C.fire, bigMarks ? hitAt(ev.ship, torpNear[ev.ship]) : null); tintHull(ev.ship, 0.6, 0.75, 0.4); break;
      case 'railHit': add('rail', [200, 225, 255], bigMarks ? hitAt(ev.ship, null) : null); tintHull(ev.ship, 0.75, 0.95, 0.5); break;
      case 'tear': add('tear', C.fire); break;
      case 'torpKilled': add('kill', C.hot); break;
      case 'burn': { const d = burnExhaustDir(ev.by); add('burn', C.drive, { x: Math.cos(d) * markL * 0.55, y: Math.sin(d) * markL * 0.55 }); break; }
      case 'railFire': add('burn', C.drive); break;
      default: break;
    }
  }
  function drawBlooms() {
    const sc = bloomScale();
    for (const b of blooms) { const p = toScreen(b.ax, b.ay); bloom(ctx, p.x + b.x, p.y + b.y, b.kind, b.col, b.ttl / b.life, sc); }
  }

  function onEvent(ev) {
    const a = { ax: ev.x, ay: ev.y };
    lookEvent(ev);
    if (engage && ENGAGE_EVENTS.has(ev.type) && Number.isFinite(ev.x) && Number.isFinite(ev.y)) {
      if (evPts.length >= V.EVENT_PT_MAX) evPts.shift();
      // the camera mode the point belongs to: a torpedo event goes with the ship it concerned, a rail event with rail
      const who = ev.type === 'torpKilled' ? ev.by : ev.ship;
      const mode = ev.type === 'railMiss' || ev.type === 'railHit' ? 'rail' : who === 'me' ? 'inbound' : 'outbound';
      evPts.push({ key: 'e' + (++evSeq), x: ev.x, y: ev.y, ttl: V.EVENT_PT_TTL, mode });
    }
    switch (ev.type) {
      case 'pdcHit': {
        // big marks: the hit sits on the edge of the victim's mark facing the shooter
        const o = bigMarks ? hitAt(ev.ship, null) : null;
        const ox = o ? o.x : undefined, oy = o ? o.y : undefined;
        fx.sparks(a, 3, { x: ox, y: oy, speedMin: 40, speedMax: 110, lifeMin: 0.15, lifeMax: 0.3, size: 1.2 });
        fx.flash(a, { x: ox, y: oy, r: 6, life: 0.08, col: C.hot, col2: C.spark });
        break;
      }
      case 'torpHit': {
        const dir = fromShooter(otherId(ev.ship), ev.x, ev.y);
        if (bigMarks) {
          const o = hitAt(ev.ship, torpNear[ev.ship]);
          bigImpact(fx, a, 1.0, { away: o.out, x: o.x, y: o.y });
        } else bigImpact(fx, a, 1.0, { away: dir });
        break;
      }
      case 'railHit': {
        const dir = fromShooter(otherId(ev.ship), ev.x, ev.y);
        const o = bigMarks ? hitAt(ev.ship, null) : null;
        bigImpact(fx, a, 1.3, { away: o ? o.out : dir, x: o ? o.x : undefined, y: o ? o.y : undefined });
        fx.streak(a, { x: o ? o.x : undefined, y: o ? o.y : undefined, dx: Math.cos(dir), dy: Math.sin(dir), len: 160, life: 0.35, width: 3 });
        fx.ring(a, { x: o ? o.x : undefined, y: o ? o.y : undefined, r0: 2, vr: 320, life: 0.3, width: 1.5, col: C.white });
        break;
      }
      case 'pieceDead':
        fx.flash(a, { r: 12, life: 0.3, col: C.white, col2: C.fire });
        fx.debris(a, 10, { speedMin: 30, speedMax: 120 });
        pending.push({ ax: ev.x, ay: ev.y, delay: 0.15 });
        break;
      case 'tear':
        // a section breaks away: big slow chunks that linger, drifting off the mark
        fx.flash(a, { r: 18, grow: 24, life: 0.4, col: C.white, col2: C.fire });
        fx.debris(a, 6 * ev.pieces.length, { speedMin: 8, speedMax: 40, lifeMin: 3, lifeMax: 6, sizeMin: 3, sizeMax: 7 });
        fx.shakeIt(4, 0.4);
        break;
      case 'torpKilled':
        fx.flash(a, { r: 11, grow: 25, life: 0.3, col: C.white, col2: C.fire });
        fx.sparks(a, 10, { speedMin: 60, speedMax: 180, lifeMin: 0.15, lifeMax: 0.35, col: C.hot });
        fx.ring(a, { r0: 1, vr: 90, life: 0.3, width: 1.5, col: C.fire });
        break;
      case 'railFire': {
        const dir = fromShooter(ev.by, (shipOf(otherId(ev.by)) || { x: ev.x + 1 }).x, (shipOf(otherId(ev.by)) || { y: ev.y }).y);
        fx.flash(a, { r: 14, grow: 20, life: 0.25, col: C.white, col2: C.drive });
        fx.sparks(a, 8, { dir, spread: 0.5, speedMin: 150, speedMax: 320, lifeMin: 0.1, lifeMax: 0.25, col: C.drive });
        fx.shakeIt(2, 0.15);
        break;
      }
      case 'railMiss': {
        const dir = fromShooter(otherId(ev.ship), ev.x, ev.y);
        fx.streak(a, { dx: Math.cos(dir), dy: Math.sin(dir), len: 140, speed: 400, life: 0.3, width: 2 });
        break;
      }
      case 'torpMiss': {
        // the torpedo overshoots: a warm streak sliding past just off the hull, fading, no flash
        const dir = fromShooter(otherId(ev.ship), ev.x, ev.y);
        const side = fx.rnd() < 0.5 ? -1 : 1;
        const off = 7 * side;
        fx.streak(a, {
          x: -Math.sin(dir) * off, y: Math.cos(dir) * off,
          dx: Math.cos(dir), dy: Math.sin(dir), len: 26, speed: 220, life: 0.55, width: 2.5, col: tint(otherId(ev.ship)),
        });
        fx.sparks(a, 3, { x: -Math.sin(dir) * off, y: Math.cos(dir) * off, dir: dir + Math.PI, spread: 0.4, speedMin: 20, speedMax: 60, lifeMin: 0.2, lifeMax: 0.4, size: 1, col: C.fire });
        break;
      }
      case 'turn': {
        // thruster puffs around the mark: four short pale-blue jets off the hull corners
        const ang = sternDir(ev.by) + Math.PI; // nose
        const cx = Math.cos(ang), cy = Math.sin(ang);
        const msc = markL / V.MARK_LEN;
        for (const [along, side] of [[0.35, -1], [0.35, 1], [-0.3, -1], [-0.3, 1]]) {
          const ox = cx * along * markL - cy * side * 3 * msc, oy = cy * along * markL + cx * side * 3 * msc;
          const out = Math.atan2(cx * side, -cy * side); // perpendicular, away from the hull
          fx.sparks(a, 3, { x: ox, y: oy, dir: out, spread: 0.5, speedMin: 25, speedMax: 70, lifeMin: 0.12, lifeMax: 0.3, size: 1.2, col: C.drive });
        }
        fx.flash(a, { r: 10, life: 0.2, col: C.drive, col2: C.drive, core: 0 });
        break;
      }
      case 'burn': {
        // the drive at full for an instant: exhaust out of the stern
        const col = tint(ev.by);
        const out = burnExhaustDir(ev.by);
        fx.flash(a, { r: 10, grow: 10, life: 0.4, col: C.white, col2: C.drive });
        fx.sparks(a, 16, { dir: out, spread: 0.7, speedMin: 120, speedMax: 260, lifeMin: 0.25, lifeMax: 0.5, size: 1.5, col: C.drive });
        fx.sparks(a, 6, { dir: out, spread: 0.3, speedMin: 60, speedMax: 120, lifeMin: 0.2, lifeMax: 0.4, col });
        break;
      }
      case 'torpLaunch': {
        // two small flashes at the tube deck, one each side of the hull
        const st = sternDir(ev.by);
        const sx = Math.cos(st), sy = Math.sin(st);
        const lsc = markL / V.MARK_LEN;
        for (const side of [-1, 1]) {
          const ox = (sx * 4 - sy * side * 4) * lsc, oy = (sy * 4 + sx * side * 4) * lsc;
          fx.flash(a, { x: ox, y: oy, r: 7, life: 0.25, col: C.white, col2: C.fire });
          fx.sparks(a, 4, { x: ox, y: oy, dir: st + Math.PI, spread: 0.6, speedMin: 40, speedMax: 100, lifeMin: 0.15, lifeMax: 0.3 });
        }
        break;
      }
      case 'end':
      default:
        break;
    }
  }

  // Switching this view in: drop effects frozen while it was hidden (so nothing old replays) and refit.
  function reset() {
    fx.step(10); pending.length = 0; evPts = []; cam.init = false; tints = []; blooms = [];
    modeInit = false; linger = 0; trans = false; holdIn = false; liveN = 0; prevKeys = null; curKeys = new Set(); snap = []; torpNear = {};
    // a WeakSet cannot be cleared: the tracers seen so far are dropped by making a fresh one
    seenTracers = new WeakSet();
  }

  return { draw, onEvent, reset, toScreen, toWorld, shipScreen, setGhost, requiredPoints, safeRect, cameraState };
}

// --- silhouette panel --------------------------------------------------------------

// One ship's form (its cell grid, form.js) filling the canvas, bow up, rooms lit or dark,
// with the impact spectacle anchored in panel px. shipId is 'me' or 'them'. The panel is
// always the tall thin one on the phone's short edge (opts.orientation is kept, ignored).
const PANEL = {
  PAD: 4,          // px around the grid, sides
  SIDE_PAD: 9,     // px each side kept free for the side chevrons
  FORE: 12,        // px above the bow for the bow chevron and the muzzle
  AFT: 22,         // px below the stern for the tail chevron and the plume
  CELL_ASPECT: 1.8, // widest a cell may be against its height: 1 is square cells; 130 px panels let it be about 10 x 5.4 px
};
export function makeSilhouettePanel(canvas, shipId, opts = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, time = 0;
  let box = null, facing = shipId === 'them' ? -1 : 1, layoutFacing = 0, layoutDesign = null;
  const toScreen = (ax, ay) => ({ x: ax, y: ay });
  const fx = makeFx(toScreen);
  const flash = {};      // room -> 0..1, decays each frame; keys appear as rooms are hit
  const embers = [];     // lingering glow on dead rooms: {piece, ttl, life}
  const pending = [];    // delayed effects: {kind: 'death' | 'spill', piece, delay}
  let ship = null;       // the ship from the last draw, read-only (exposure for effect directions)
  const bump = (piece, v) => { flash[piece] = Math.max(flash[piece] || 0, v); };
  const shortSide = () => Math.min(box.w, box.h); // the hull thickness in px, the effects' scale unit

  // The grid box: cells fill the panel, rows bow to stern top to bottom, with room above for
  // the bow chevron and below for the plume. Cell height is what the height allows; the width
  // is what the panel allows, at most CELL_ASPECT times the height.
  function layout() {
    const form = ship ? ship.form : { w: 28, h: 9 };
    const cols = form.h, rows = form.w;
    const ch = Math.max(1, (h - 2 * PANEL.PAD - PANEL.FORE - PANEL.AFT) / rows);
    const cw = Math.max(1, Math.min((w - 2 * PANEL.SIDE_PAD) / cols, ch * PANEL.CELL_ASPECT));
    const bh = ch * rows, slack = (h - 2 * PANEL.PAD - PANEL.FORE - PANEL.AFT - bh) / 2;
    box = { x: (w - cw * cols) / 2, y: PANEL.PAD + PANEL.FORE + Math.max(0, slack), w: cw * cols, h: bh };
    layoutFacing = facing;
    layoutDesign = ship ? ship.design : null;
  }
  // Events can arrive before the first draw: lay out from the element size.
  function ensureBox() {
    if (box) return;
    w = canvas.clientWidth || canvas.width || 100;
    h = canvas.clientHeight || canvas.height || 240;
    layout();
  }
  // Effects anchor at the room's cells; before the first draw there is no ship, so the middle.
  const at = (room) => {
    ensureBox();
    const p = ship ? roomPoint(ship, room, box) : { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    return { ax: p.x, ay: p.y };
  };
  // Named points around the grid for the effects that are not on a room: the bow, the nozzle,
  // the attitude ports at the corners, the tube bays at the edges of the tube room.
  const mark = (name) => {
    ensureBox();
    const L = box.x, R = box.x + box.w, T = box.y, B = box.y + box.h, cx = (L + R) / 2;
    const underR = facing === 1; // the burn kick leans to the underside: the right edge for 'me', the left for 'them'
    let x = cx, y = (T + B) / 2;
    switch (name) {
      case 'bow': case 'muzzle': y = T; break;
      case 'nozzle': y = B; break;
      case 'thrusterBowTop': x = L; y = T + box.h * 0.2; break;
      case 'thrusterBowBottom': x = R; y = T + box.h * 0.2; break;
      case 'thrusterSternTop': x = L; y = T + box.h * 0.8; break;
      case 'thrusterSternBottom': x = R; y = T + box.h * 0.8; break;
      case 'underside': x = underR ? R : L; break;
      case 'topside': x = underR ? L : R; break;
      case 'tubeTop': case 'tubeBottom': {
        const tb = ship && roomBounds(ship, 'tubes', box);
        if (tb) { x = name === 'tubeTop' ? tb.x : tb.x + tb.w; y = tb.y + tb.h / 2; }
        break;
      }
      default: break;
    }
    return { ax: x, ay: y };
  };
  const fwd = () => -Math.PI / 2;     // bow direction on the canvas: up
  const aft = () => fwd() + Math.PI;  // stern direction
  // direction pointing out of the hull at a named point (thruster puffs)
  const outward = (name) => {
    const m = mark(name);
    return Math.atan2(m.ay - (box.y + box.h / 2), m.ax - (box.x + box.w / 2));
  };
  // the side the broadside chevrons sit on, as a canvas direction: right for 'me', left for 'them'
  let foe = null; // the other ship from the last draw: which broadside faces it
  const sideDir = () => {
    const f = ship && foe ? shotFrom(ship, foe.x, foe.y) : null, topLeft = facing === 1; // row 0 ('top') is the left column for facing +1
    const left = f === 'top' ? topLeft : f === 'bottom' ? !topLeft : facing !== 1;
    return left ? Math.PI : 0;
  };
  // Travel direction of enemy fire across this panel: down the hull from the
  // bow when bow-on, up from the stern when tail-on, across it when broadside.
  const incomingDir = () => {
    const e = ship && ship.face ? exposure(ship) : 'bow';
    return e === 'tail' ? fwd() : e === 'side' ? sideDir() + Math.PI : aft();
  };

  function draw(battle, dtReal) {
    const dt = clamp(dtReal || 0, 0, V.MAX_DT);
    time += dt;
    const size = fit(canvas, ctx);
    if (!size) return; // hidden or mid-rotation: skip; layout is redone when a size comes back
    ship = battle.shipById ? battle.shipById(shipId) : battle.ships.find((s) => s.id === shipId);
    const enemy = battle.enemyOf ? battle.enemyOf(ship) : battle.ships.find((s) => s !== ship);
    foe = enemy;
    facing = ship.facing === -1 ? -1 : 1;
    if (size.w !== w || size.h !== h || !box || layoutFacing !== facing || layoutDesign !== ship.design) { w = size.w; h = size.h; layout(); }

    // timers
    for (const p in flash) if (flash[p] > 0) flash[p] = Math.max(0, flash[p] - dt * 3.5);
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].delay -= dt;
      if (pending[i].delay <= 0) {
        const p = pending.splice(i, 1)[0];
        if (p.kind === 'spill') spill(p.piece); else secondary(p.piece);
      }
    }
    for (let i = embers.length - 1; i >= 0; i--) { embers[i].ttl -= dt; if (embers[i].ttl <= 0) embers.splice(i, 1); }
    fx.step(dt);

    // the one cue that matters: their railgun is aiming at this ship
    const warnP = enemy && enemy.railAim >= 0 && enemy.pieces.rail.alive ? clamp01(enemy.railAim / N.RAIL_AIM_TIME) : 0;
    const warn = warnP > 0 ? (0.35 + 0.65 * warnP) * (0.6 + 0.4 * Math.sin(time * (6 + 14 * warnP))) : 0;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    // a faint cool haze behind the ship so the steel separates from the black
    const hz = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.55);
    hz.addColorStop(0, 'rgba(60,90,130,0.10)');
    hz.addColorStop(1, 'rgba(60,90,130,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, w, h);

    const so = fx.shakeOffset(time);
    ctx.save();
    ctx.translate(so.x, so.y);
    // which side faces them: the broadside chevrons go on that side (top or bottom of the form)
    const from = enemy ? shotFrom(ship, enemy.x, enemy.y) : null;
    drawForm(ctx, ship, box, { flash, t: time, warn, from });
    // the room the other side's weapons are going for, in that side's color
    const aimed = enemy && enemy.target && ship.pieces[enemy.target] && ship.pieces[enemy.target].alive ? enemy.target : null;
    if (aimed) roomBracket(ctx, ship, aimed, box, shipId === 'them' ? COLORS.me : COLORS.them, time);
    // lingering embers on freshly dead pieces
    if (embers.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const p = roomPoint(ship, e.piece, box);
        const k = e.ttl / e.life;
        const r = shortSide() * 0.16;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        const pulse = 0.7 + 0.3 * Math.sin(time * 5 + e.ph);
        g.addColorStop(0, `rgba(255,150,60,${0.55 * k * pulse})`);
        g.addColorStop(0.5, `rgba(255,90,20,${0.2 * k * pulse})`);
        g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }
    fx.draw(ctx);
    ctx.restore();

    // red warning vignette around the panel edge
    if (warn > 0.01) {
      ctx.save();
      ctx.strokeStyle = rgba(C.warn, warn * 0.8);
      ctx.lineWidth = 3;
      ctx.shadowBlur = 14;
      ctx.shadowColor = COLORS.warn;
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      ctx.restore();
    }
    const wa = fx.white();
    if (wa > 0) { ctx.fillStyle = `rgba(255,240,225,${wa})`; ctx.fillRect(0, 0, w, h); }
  }

  // the room behind the one hit took half the blow: a smaller flash a beat later
  function spill(piece) {
    const a = at(piece);
    const k = shortSide() / 90;
    bump(piece, 0.5);
    fx.flash(a, { r: 11 * k, grow: 14 * k, life: 0.3, col: C.hot, col2: C.fire });
    fx.sparks(a, 6, { speedMin: 50 * k, speedMax: 140 * k, lifeMin: 0.15, lifeMax: 0.35, size: 1.2, col: C.fire });
    fx.smoke(a, 2, {});
  }

  // second blast 0.15 s after a piece dies, then the ember lingers
  function secondary(piece) {
    const a = at(piece);
    const k = shortSide() / 90; // scale effects with panel size
    bump(piece, 0.7);
    fx.flash(a, { r: 18 * k, grow: 30 * k, life: 0.4, col: C.hot, col2: C.fire });
    fx.ring(a, { r0: 2, vr: 140 * k, life: 0.5, width: 2, col: C.fire });
    fx.debris(a, 14, { speedMin: 40 * k, speedMax: 170 * k });
    fx.sparks(a, 14, { speedMin: 80 * k, speedMax: 220 * k, col: C.fire });
    fx.embers(a, 10, {});
    fx.smoke(a, 5, {});
    fx.shakeIt(4 * k, 0.3);
    fx.whiteFlash(0.18);
    embers.push({ piece, ttl: 4, life: 4, ph: fx.rnd() * 6.28 });
  }

  function onEvent(ev) {
    const mine = ev.ship === shipId;   // this ship took the hit
    const byMe = ev.by === shipId;     // this ship fired
    if (!mine && !byMe) return;
    ensureBox();
    const k = shortSide() / 90;
    switch (ev.type) {
      case 'pdcHit': {
        if (!mine) break;
        const a = at(ev.piece);
        bump(ev.piece, 0.35);
        fx.sparks(a, 4, { speedMin: 60 * k, speedMax: 150 * k, lifeMin: 0.15, lifeMax: 0.35, size: 1.2 });
        fx.flash(a, { r: 5 * k, life: 0.08, col: C.hot, col2: C.spark });
        break;
      }
      case 'torpHit': {
        if (!mine) break;
        const a = at(ev.piece);
        bump(ev.piece, 1);
        bigImpact(fx, a, 1.0 * k, { away: incomingDir() });
        if (ev.spill) pending.push({ kind: 'spill', piece: ev.spill, delay: 0.1 });
        break;
      }
      case 'railHit': {
        if (!mine) break;
        const a = at(ev.piece);
        bump(ev.piece, 1);
        const ang = incomingDir();
        bigImpact(fx, a, 1.3 * k, { away: ang });
        // the slug's path straight through the ship, from the exposed end
        const tilt = (fx.rnd() - 0.5) * 0.3;
        fx.streak(a, { dx: Math.cos(ang + tilt), dy: Math.sin(ang + tilt), len: Math.max(box.w, box.h) * 1.8, life: 0.35, width: 3 * k });
        fx.ring(a, { r0: 2, vr: 360 * k, life: 0.3, width: 1.5, col: C.white });
        fx.shakeIt(9 * k, 0.45);
        if (ev.spill) pending.push({ kind: 'spill', piece: ev.spill, delay: 0.1 });
        break;
      }
      case 'pieceDead': {
        if (!mine) break;
        bump(ev.piece, 0.8);
        const a = at(ev.piece);
        // a frame room dies often and quietly: its cells flash and a few chips fly, no blast, no ember
        if (ev.piece.startsWith('frame:')) {
          fx.debris(a, 4, { speedMin: 30 * k, speedMax: 90 * k });
          fx.smoke(a, 2, {});
          break;
        }
        fx.debris(a, 8, { speedMin: 30 * k, speedMax: 110 * k });
        fx.smoke(a, 4, {});
        pending.push({ kind: 'death', piece: ev.piece, delay: 0.15 });
        break;
      }
      case 'tear': {
        if (!mine) break;
        // the section parts from the hull: a flash along the tear and heavy debris flying out the end
        const endName = ev.end === 'bow' ? 'bow' : 'nozzle';
        const a = mark(endName);
        const dir = ev.end === 'bow' ? fwd() : aft();
        fx.flash(a, { r: 24 * k, grow: 30 * k, life: 0.5, col: C.white, col2: C.fire });
        fx.debris(a, 18, { dir, spread: 1.2, speedMin: 40 * k, speedMax: 160 * k, lifeMin: 1.5, lifeMax: 3, sizeMin: 2.5 * k, sizeMax: 6 * k });
        fx.smoke(a, 10, {});
        fx.shakeIt(12 * k, 0.6);
        break;
      }
      case 'railMiss':
      case 'torpMiss': {
        if (!mine) break;
        // the shot streaks past, just off the hull, no flash: alongside when
        // end-on, past the bow or the stern when broadside
        const torp = ev.type === 'torpMiss';
        const side = fx.rnd() < 0.5 ? -1 : 1;
        const ang = incomingDir() + side * 0.05;
        const across = ship && ship.face && exposure(ship) === 'side';
        const p = across
          ? { x: box.x + box.w / 2, y: side > 0 ? box.y - 6 : box.y + box.h + 6 }
          : { x: box.x + box.w * (0.5 + side * 0.525), y: box.y + box.h / 2 };
        const a = { ax: clamp(p.x, 4, w - 4), ay: clamp(p.y, 4, h - 4) };
        if (torp) {
          const col = shipId === 'me' ? C.them : C.me;
          fx.streak(a, { dx: Math.cos(ang), dy: Math.sin(ang), len: 30 * k, speed: 260 * k, life: 0.6, width: 2.5 * k, col });
          fx.sparks(a, 4, { dir: ang + Math.PI, spread: 0.4, speedMin: 20 * k, speedMax: 60 * k, lifeMin: 0.2, lifeMax: 0.4, size: 1, col: C.fire });
        } else {
          fx.streak(a, { dx: Math.cos(ang), dy: Math.sin(ang), len: Math.max(w, h) * 1.4, speed: 900, life: 0.3, width: 2 });
        }
        break;
      }
      case 'turn': {
        if (!byMe) break;
        // thruster puffs at the four attitude ports: short, pale blue
        for (const name of ['thrusterBowTop', 'thrusterBowBottom', 'thrusterSternTop', 'thrusterSternBottom']) {
          const a = mark(name);
          fx.flash(a, { r: 6 * k, life: 0.18, col: C.drive, col2: C.drive, core: 0 });
          fx.sparks(a, 5, { dir: outward(name), spread: 0.5, speedMin: 50 * k, speedMax: 130 * k, lifeMin: 0.12, lifeMax: 0.3, size: 1.2, col: C.drive });
        }
        fx.shakeIt(1 * k, 0.2);
        break;
      }
      case 'railFire': {
        if (!byMe) break;
        const a = mark('muzzle');
        bump('rail', 0.6);
        fx.flash(a, { r: 20 * k, grow: 30 * k, life: 0.25, col: C.white, col2: C.drive });
        fx.sparks(a, 12, { dir: fwd(), spread: 0.5, speedMin: 200 * k, speedMax: 450 * k, lifeMin: 0.1, lifeMax: 0.25, col: C.drive });
        fx.streak(a, { x: Math.cos(fwd()) * 30 * k, dx: Math.cos(fwd()), dy: Math.sin(fwd()), len: 60 * k, life: 0.2, width: 2 });
        fx.shakeIt(2.5 * k, 0.15);
        break;
      }
      case 'burn': {
        if (!byMe) break;
        // main drive flare out the back, plus a thruster puff on the side the kick leans to
        const n = mark('nozzle');
        bump('drive', 0.6);
        fx.flash(n, { r: 26 * k, grow: 20 * k, life: 0.5, col: C.white, col2: C.drive, core: 1 });
        fx.sparks(n, 26, { dir: aft(), spread: 0.6, speedMin: 150 * k, speedMax: 420 * k, lifeMin: 0.3, lifeMax: 0.7, size: 2, col: C.drive });
        fx.sparks(n, 10, { dir: aft(), spread: 0.3, speedMin: 80 * k, speedMax: 200 * k, lifeMin: 0.2, lifeMax: 0.5, size: 1.2, col: C.white });
        const sideName = ev.dir > 0 ? 'underside' : 'topside';
        const side = mark(sideName);
        fx.flash(side, { r: 10 * k, life: 0.3, col: C.white, col2: C.drive });
        fx.sparks(side, 8, { dir: outward(sideName), spread: 0.6, speedMin: 80 * k, speedMax: 180 * k, lifeMin: 0.15, lifeMax: 0.35, col: C.white });
        fx.shakeIt(1.5 * k, 0.3);
        break;
      }
      case 'torpLaunch': {
        if (!byMe) break;
        bump('tubes', 0.5);
        for (const name of ['tubeTop', 'tubeBottom']) {
          const a = mark(name);
          fx.flash(a, { r: 10 * k, grow: 14 * k, life: 0.28, col: C.white, col2: C.fire });
          fx.sparks(a, 6, { dir: fwd(), spread: 0.7, speedMin: 60 * k, speedMax: 160 * k, lifeMin: 0.15, lifeMax: 0.35 });
          fx.smoke(a, 3, {});
        }
        break;
      }
      case 'end':
      default:
        break;
    }
  }

  // The room under a canvas point (CSS px, relative to the canvas), or null. For tap-a-room.
  const roomAt = (x, y) => { ensureBox(); return ship ? roomAtPoint(ship, x, y, box) : null; };

  return { draw, onEvent, roomAt };
}
