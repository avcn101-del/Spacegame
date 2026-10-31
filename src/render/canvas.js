// Tactical strip and silhouette panels: cameras, particles, shake and the
// impact spectacle. Reads battle state and events, never writes battle.
// Everything here advances on dtReal (real seconds): pause passes 0 and
// freezes every effect, slow-mo stretches the sim while effects keep pace.
// No Math.random: a counter fed through a small hash gives "random" numbers
// that are the same sequence every run.

import { N } from '../numbers.js';
import { PIECES } from '../sim/ship.js';
import {
  drawSilhouette, piecePoint, drawShipMark, shipPoint, LANDMARKS, SHIP_ASPECT, COLORS,
} from './silhouette.js';

// Visual-only knobs. Not game numbers, so they live here, not in numbers.js.
const V = {
  PARTICLE_CAP: 400,   // per panel; keeps draw cost modest on a phone
  MAX_DT: 0.1,         // clamp a long frame (tab switch) so effects do not jump
  TRACER_TTL: 0.12,    // matches the ttl weapons.js gives tracers; places the streak along the line
  MIN_SCALE: 9,        // px per km; ships never shrink to nothing
  MAX_SCALE: 55,       // px per km; at knife range the strip still shows both rings
  MARK_LEN: 14,        // px, the top-down mark length
  STAR_PX_PER_KM: 30,  // parallax base: how far the far layer slides per km of camera travel
};

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
};

// --- canvas sizing -----------------------------------------------------------

// Size the backing store to clientWidth/Height * dpr. Called every frame:
// it re-reads the element size and devicePixelRatio each time, so a phone
// rotation or a late layout is picked up on the next draw. Returns the CSS
// px size, or null when the canvas has no size yet (callers skip the frame).
function fit(canvas, ctx) {
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

function makeFx(toScreen) {
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

// --- starfield ------------------------------------------------------------------

const STAR_LAYERS = [
  { par: 0.08, n: 70, bright: 0.35, size: 1 },
  { par: 0.18, n: 40, bright: 0.6, size: 1.2 },
  { par: 0.35, n: 16, bright: 0.9, size: 1.6 },
];

function makeStars() {
  const stars = [];
  let i = 0;
  for (const L of STAR_LAYERS) {
    for (let k = 0; k < L.n; k++, i += 4) {
      stars.push({
        u: hash01(i), v: hash01(i + 1), tw: 1 + hash01(i + 2) * 3, ph: hash01(i + 3) * 6.28,
        par: L.par, bright: L.bright, size: L.size,
      });
    }
  }
  return stars;
}

function drawStars(ctx, stars, cam, w, h, time) {
  const mod = (a, m) => ((a % m) + m) % m;
  for (const s of stars) {
    const x = mod(s.u * 4096 - cam.x * V.STAR_PX_PER_KM * s.par, w);
    const y = mod(s.v * 4096 - cam.y * V.STAR_PX_PER_KM * s.par, h);
    const a = s.bright * (0.75 + 0.25 * Math.sin(time * s.tw + s.ph));
    ctx.fillStyle = `rgba(200,215,240,${a})`;
    ctx.fillRect(x, y, s.size, s.size);
  }
}

// --- tactical view ---------------------------------------------------------------

// Top-down view: camera between the ships, marks, rings, tracers,
// torpedoes, slugs, aim lines and the impact effects anchored in world km.
// opts.inset: () => ({top, right, bottom, left}) in CSS px, the HUD-covered
// margins; the ships are centered and fitted inside the remaining rect,
// the starfield still covers the whole canvas. Default: no inset.
export function makeTactical(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const inset = typeof opts.inset === 'function' ? opts.inset : () => null;
  const cam = { x: 0, y: 0, scale: 20, init: false };
  let w = 0, h = 0, time = 0;
  const rect = { x: 0, y: 0, w: 1, h: 1 }; // the area not covered by HUD
  let last = null; // the battle from the last draw, read-only, to resolve ship ids in events
  const stars = makeStars();
  const toScreen = (ax, ay) => ({ x: rect.x + rect.w / 2 + (ax - cam.x) * cam.scale, y: rect.y + rect.h / 2 + (ay - cam.y) * cam.scale });
  const fx = makeFx(toScreen);
  const pending = []; // delayed secondary explosions: {ax, ay, delay}
  const tint = (id) => (id === 'me' ? C.me : C.them);
  const shipOf = (id) => (last ? (last.shipById ? last.shipById(id) : last.ships.find((s) => s.id === id)) : null);

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

    // camera: center between the ships, scale so both fit in the inset rect with margin
    const tx = (me.x + them.x) / 2, ty = (me.y + them.y) / 2;
    const spanX = Math.abs(me.x - them.x) + 2.0, spanY = Math.abs(me.y - them.y) + 1.6;
    const ts = clamp(Math.min(rect.w * 0.78 / spanX, rect.h * 0.72 / spanY), V.MIN_SCALE, V.MAX_SCALE);
    if (!cam.init || !Number.isFinite(cam.scale)) { cam.x = tx; cam.y = ty; cam.scale = ts; cam.init = true; } else {
      const k = 1 - Math.exp(-dt * 4), ks = 1 - Math.exp(-dt * 2.5);
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.scale += (ts - cam.scale) * ks;
    }

    // delayed effects and particle motion
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      p.delay -= dt;
      if (p.delay <= 0) { pending.splice(i, 1); secondary(p); }
    }
    fx.step(dt);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    const so = fx.shakeOffset(time);
    ctx.save();
    ctx.translate(so.x, so.y);
    drawStars(ctx, stars, cam, w, h, time);
    drawRangeRings(battle);
    drawScaleBar();
    drawAimLines(battle);
    drawTracers(battle);
    drawProjectiles(battle);
    drawMarks(battle);
    fx.draw(ctx);
    ctx.restore();
    const wa = fx.white();
    if (wa > 0) { ctx.fillStyle = `rgba(255,240,225,${wa})`; ctx.fillRect(0, 0, w, h); }
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
      const a = toScreen(s.x, s.y), b = toScreen(e.x, e.y);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.warn, (0.18 + 0.7 * p) * pulse);
      ctx.lineWidth = 1 + 1.5 * p;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -time * 80;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      const r = 9 + 10 * (1 - p);
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
      const a = toScreen(tr.x1, tr.y1), b = toScreen(tr.x2, tr.y2);
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
    }
    ctx.restore();
  }

  function drawProjectiles(battle) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of battle.projectiles) {
      if (p.dead) continue;
      const s = toScreen(p.x, p.y);
      if (p.kind === 'torp') {
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

  function drawMarks(battle) {
    for (const s of battle.ships) {
      const e = battle.enemyOf ? battle.enemyOf(s) : battle.ships.find((o) => o !== s);
      const p = toScreen(s.x, s.y);
      const ang = Math.atan2(e.y - s.y, e.x - s.x);
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

      // thrust plume: points opposite to the acceleration in world space (x only,
      // the drive pushes along the fight line). None when coasting or stationary.
      const th = s.pieces.drive.alive ? (s.thrust || 0) : 0;
      if (Math.abs(th) > 0.05) {
        const dir = th > 0 ? -1 : 1;
        const flick = 0.78 + 0.22 * hash01(Math.floor(time * 30) + (s.id === 'me' ? 0 : 7));
        const pl = (5 + 14 * Math.abs(th)) * flick;
        const x0 = p.x + dir * V.MARK_LEN * 0.3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x0, p.y, x0 + dir * pl, p.y);
        g.addColorStop(0, `rgba(190,225,255,${0.85 * flick})`);
        g.addColorStop(1, 'rgba(90,140,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0, p.y - 3); ctx.lineTo(x0 + dir * pl, p.y); ctx.lineTo(x0, p.y + 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = s.id === 'me' ? COLORS.me : COLORS.them;
      drawShipMark(ctx, s, p.x, p.y, V.MARK_LEN, ang);
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

  function onEvent(ev) {
    const a = { ax: ev.x, ay: ev.y };
    switch (ev.type) {
      case 'pdcHit':
        fx.sparks(a, 3, { speedMin: 40, speedMax: 110, lifeMin: 0.15, lifeMax: 0.3, size: 1.2 });
        fx.flash(a, { r: 6, life: 0.08, col: C.hot, col2: C.spark });
        break;
      case 'torpHit': {
        const dir = fromShooter(otherId(ev.ship), ev.x, ev.y);
        bigImpact(fx, a, 1.0, { away: dir });
        break;
      }
      case 'railHit': {
        const dir = fromShooter(otherId(ev.ship), ev.x, ev.y);
        bigImpact(fx, a, 1.3, { away: dir });
        fx.streak(a, { dx: Math.cos(dir), dy: Math.sin(dir), len: 160, life: 0.35, width: 3 });
        fx.ring(a, { r0: 2, vr: 320, life: 0.3, width: 1.5, col: C.white });
        break;
      }
      case 'pieceDead':
        fx.flash(a, { r: 12, life: 0.3, col: C.white, col2: C.fire });
        fx.debris(a, 10, { speedMin: 30, speedMax: 120 });
        pending.push({ ax: ev.x, ay: ev.y, delay: 0.15 });
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
      case 'burn': {
        // lateral kick: exhaust goes opposite to the burn direction (world y)
        const col = tint(ev.by);
        fx.flash(a, { r: 10, grow: 10, life: 0.4, col: C.white, col2: C.drive });
        fx.sparks(a, 16, { dir: ev.dir > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 0.7, speedMin: 120, speedMax: 260, lifeMin: 0.25, lifeMax: 0.5, size: 1.5, col: C.drive });
        fx.sparks(a, 6, { dir: ev.dir > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 0.3, speedMin: 60, speedMax: 120, lifeMin: 0.2, lifeMax: 0.4, col });
        break;
      }
      case 'torpLaunch': {
        // two small flashes at the stern, one each side
        const s = shipOf(ev.by);
        const f = s ? s.facing : 1;
        for (const side of [-1, 1]) {
          fx.flash(a, { x: -f * 6, y: side * 4, r: 7, life: 0.25, col: C.white, col2: C.fire });
          fx.sparks(a, 4, { x: -f * 6, y: side * 4, dir: f > 0 ? 0 : Math.PI, spread: 0.6, speedMin: 40, speedMax: 100, lifeMin: 0.15, lifeMax: 0.3 });
        }
        break;
      }
      case 'end':
      default:
        break;
    }
  }

  return { draw, onEvent };
}

// --- silhouette panel --------------------------------------------------------------

// One ship's profile filling the canvas, pieces lit or dark, with the
// impact spectacle anchored in panel px. shipId is 'me' or 'them'.
// opts.orientation: 'horizontal' (default, wide canvas, bow toward the enemy)
// or 'vertical' (tall thin canvas on the phone's short edge, bow up).
export function makeSilhouettePanel(canvas, shipId, opts = {}) {
  const ctx = canvas.getContext('2d');
  const orientation = opts.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const vertical = orientation === 'vertical';
  let w = 0, h = 0, time = 0;
  let box = null, facing = shipId === 'them' ? -1 : 1, layoutFacing = 0;
  const toScreen = (ax, ay) => ({ x: ax, y: ay });
  const fx = makeFx(toScreen);
  const flash = {};      // piece -> 0..1, decays each frame
  const embers = [];     // lingering glow on dead pieces: {piece, ttl, life}
  const pending = [];    // secondary explosions: {piece, delay}
  for (const p of PIECES) flash[p] = 0;
  const shortSide = () => Math.min(box.w, box.h); // the hull thickness in px, the effects' scale unit

  // The ship box, leaving room past the stern for the thrust plume
  // (`room` as a fraction of ship length) so the plume is not clipped.
  function layout() {
    const pad = 6, room = 0.22;
    if (vertical) {
      const avail = h - 2 * pad;
      const len = Math.max(1, Math.min(avail / (1 + room), (w - 2 * pad) * SHIP_ASPECT));
      const thick = len / SHIP_ASPECT;
      const slack = (avail - len * (1 + room)) / 2;
      box = { x: (w - thick) / 2, y: pad + slack, w: thick, h: len }; // bow up, plume room below
    } else {
      const avail = w - 2 * pad;
      const len = Math.max(1, Math.min(avail / (1 + room), (h - 2 * pad) * SHIP_ASPECT));
      const thick = len / SHIP_ASPECT;
      const slack = (avail - len * (1 + room)) / 2;
      box = { x: pad + slack + (facing === 1 ? len * room : 0), y: (h - thick) / 2, w: len, h: thick };
    }
    layoutFacing = facing;
  }
  // Events can arrive before the first draw: lay out from the element size.
  function ensureBox() {
    if (box) return;
    w = canvas.clientWidth || canvas.width || (vertical ? 64 : 220);
    h = canvas.clientHeight || canvas.height || (vertical ? 240 : 90);
    layout();
  }
  const at = (piece) => { ensureBox(); const p = piecePoint(piece, box, facing, orientation); return { ax: p.x, ay: p.y }; };
  const mark = (name) => { ensureBox(); const p = shipPoint(LANDMARKS[name][0], LANDMARKS[name][1], box, facing, orientation); return { ax: p.x, ay: p.y }; };
  const fwd = () => (vertical ? -Math.PI / 2 : facing === 1 ? 0 : Math.PI); // bow direction on the canvas, radians
  const aft = () => fwd() + Math.PI;                                          // stern direction
  // direction pointing out of the hull at a landmark (thruster puffs)
  const outward = (name) => {
    const c = shipPoint(0.5, 0, box, facing, orientation), m = mark(name);
    return Math.atan2(m.ay - c.y, m.ax - c.x);
  };

  function draw(battle, dtReal) {
    const dt = clamp(dtReal || 0, 0, V.MAX_DT);
    time += dt;
    const size = fit(canvas, ctx);
    if (!size) return; // hidden or mid-rotation: skip; layout is redone when a size comes back
    const ship = battle.shipById ? battle.shipById(shipId) : battle.ships.find((s) => s.id === shipId);
    const enemy = battle.enemyOf ? battle.enemyOf(ship) : battle.ships.find((s) => s !== ship);
    facing = ship.facing === -1 ? -1 : 1;
    if (size.w !== w || size.h !== h || !box || layoutFacing !== facing) { w = size.w; h = size.h; layout(); }

    // timers
    for (const p of PIECES) if (flash[p] > 0) flash[p] = Math.max(0, flash[p] - dt * 3.5);
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].delay -= dt;
      if (pending[i].delay <= 0) { const p = pending.splice(i, 1)[0]; secondary(p.piece); }
    }
    for (let i = embers.length - 1; i >= 0; i--) { embers[i].ttl -= dt; if (embers[i].ttl <= 0) embers.splice(i, 1); }
    fx.step(dt);

    // the one cue that matters: their railgun is aiming at this ship
    const warnP = enemy && enemy.railAim >= 0 && enemy.pieces.rail.alive ? clamp01(enemy.railAim / N.RAIL_AIM_TIME) : 0;
    const warn = warnP > 0 ? (0.35 + 0.65 * warnP) * (0.6 + 0.4 * Math.sin(time * (6 + 14 * warnP))) : 0;
    const pdcActive = !!(battle.tracers && battle.tracers.some((t) => t.owner === shipId));

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
    drawSilhouette(ctx, ship, box, {
      flash, t: time, warn, bg: COLORS.bg, orientation,
      active: { pdcL: pdcActive, pdcR: pdcActive },
    });
    // lingering embers on freshly dead pieces, on top of the silhouette's own dim ember
    if (embers.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const p = piecePoint(e.piece, box, facing, orientation);
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

  // second blast 0.15 s after a piece dies, then the ember lingers
  function secondary(piece) {
    const a = at(piece);
    const k = shortSide() / 90; // scale effects with panel size
    flash[piece] = Math.max(flash[piece], 0.7);
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
        flash[ev.piece] = Math.max(flash[ev.piece], 0.35);
        fx.sparks(a, 4, { speedMin: 60 * k, speedMax: 150 * k, lifeMin: 0.15, lifeMax: 0.35, size: 1.2 });
        fx.flash(a, { r: 5 * k, life: 0.08, col: C.hot, col2: C.spark });
        break;
      }
      case 'torpHit': {
        if (!mine) break;
        const a = at(ev.piece);
        flash[ev.piece] = 1;
        bigImpact(fx, a, 1.0 * k, { away: fwd() });
        break;
      }
      case 'railHit': {
        if (!mine) break;
        const a = at(ev.piece);
        flash[ev.piece] = 1;
        bigImpact(fx, a, 1.3 * k, { away: fwd() });
        // the slug's path straight through the ship, coming from the bow side
        const tilt = (fx.rnd() - 0.5) * 0.3;
        const ang = aft() + tilt;
        fx.streak(a, { dx: Math.cos(ang), dy: Math.sin(ang), len: Math.max(box.w, box.h) * 1.8, life: 0.35, width: 3 * k });
        fx.ring(a, { r0: 2, vr: 360 * k, life: 0.3, width: 1.5, col: C.white });
        fx.shakeIt(9 * k, 0.45);
        break;
      }
      case 'pieceDead': {
        if (!mine) break;
        flash[ev.piece] = Math.max(flash[ev.piece], 0.8);
        const a = at(ev.piece);
        fx.debris(a, 8, { speedMin: 30 * k, speedMax: 110 * k });
        fx.smoke(a, 4, {});
        pending.push({ piece: ev.piece, delay: 0.15 });
        break;
      }
      case 'railMiss': {
        if (!mine) break;
        // the slug streaks past, just off one side of the hull, no flash
        const side = fx.rnd() < 0.5 ? -1 : 1;
        const p = shipPoint(0.5, side * 1.05, box, facing, orientation);
        const a = { ax: clamp(p.x, 4, w - 4), ay: clamp(p.y, 4, h - 4) };
        const ang = aft() + side * 0.05;
        fx.streak(a, { dx: Math.cos(ang), dy: Math.sin(ang), len: Math.max(w, h) * 1.4, speed: 900, life: 0.3, width: 2 });
        break;
      }
      case 'railFire': {
        if (!byMe) break;
        const a = mark('muzzle');
        flash.rail = Math.max(flash.rail, 0.6);
        fx.flash(a, { r: 20 * k, grow: 30 * k, life: 0.25, col: C.white, col2: C.drive });
        fx.sparks(a, 12, { dir: fwd(), spread: 0.5, speedMin: 200 * k, speedMax: 450 * k, lifeMin: 0.1, lifeMax: 0.25, col: C.drive });
        fx.streak(a, { x: Math.cos(fwd()) * 30 * k, dx: Math.cos(fwd()), dy: Math.sin(fwd()), len: 60 * k, life: 0.2, width: 2 });
        fx.shakeIt(2.5 * k, 0.15);
        break;
      }
      case 'burn': {
        if (!byMe) break;
        // main drive flare out the back, plus a thruster puff on the hull side
        const n = mark('nozzle');
        flash.drive = Math.max(flash.drive, 0.6);
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
        flash.tubes = Math.max(flash.tubes, 0.5);
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

  return { draw, onEvent };
}
