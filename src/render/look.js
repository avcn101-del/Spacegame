// The look (PR G1): one key light, glow sprites (fake bloom), the drive plume, the vignette and grade.
// Shared by the world renderer (canvas.js: TAC and the close-up world stage) and the cutaway dock
// (closeup.js). Decoration only: reads what it is given, never battle state, never input. Generated
// from data (form cells, mark shapes), nothing hand-made per hull. No Math.random: flicker hashes time.

// Visual-only knobs. Not game numbers.
export const LOOK = {
  KEY: norm(-0.55, -0.835),  // where the one key light comes from, screen space (upper left), every view
  SHADE_LIT: 0.16,            // white over the lit side of a hull (alpha)
  SHADE_DARK: 0.42,           // black over the shadow side of a hull (alpha)
  RIM: 0.85,                  // alpha of the rim line on the edges facing the light
  RIM_PX: 1.2,                // css px, rim line width
  GLOW_RES: 128,              // px of a cached glow sprite (scaled when drawn)
  VIGNETTE: 0.42,             // alpha of the vignette in the corners
  VIGNETTE_IN: 0.55,          // share of the half diagonal that stays clear
};

// Fake bloom: additive core + halo per kind of beat. The amplitude hierarchy is a rule, not taste:
// rail and tear > torpedo hit > Burn > tracers (if everything glows, nothing is epic). Energy is r * r * a;
// `bloomOrder()` lists the kinds by it and the Playwright check asserts the order.
export const BLOOM = {
  tracer:  { r: 5,  a: 0.22, life: 0 },     // per tracer head, every frame it lives
  torp:    { r: 7,  a: 0.30, life: 0 },     // a torpedo in flight (a drive, but a small one)
  plume:   { r: 10, a: 0.30, life: 0 },     // the drive pushing (times thrust)
  kill:    { r: 16, a: 0.40, life: 0.30 },  // a torpedo killed by a PDC
  burn:    { r: 24, a: 0.50, life: 0.45 },  // Burn: the drive at full for an instant
  torpHit: { r: 46, a: 0.70, life: 0.55 },  // a torpedo on the hull
  rail:    { r: 80, a: 0.95, life: 0.75 },  // a slug through the hull (railHit)
  tear:    { r: 96, a: 1.00, life: 0.90 },  // a section breaks off
};
export const bloomOrder = () => Object.keys(BLOOM).sort((p, q) => BLOOM[p].r ** 2 * BLOOM[p].a - BLOOM[q].r ** 2 * BLOOM[q].a);

function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
export function hash01(n) {
  let x = (Math.imul(n | 0, 0x9E3779B1) + 0x7F4A7C15) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85EBCA77);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE3D);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const dprOf = () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

// --- glow sprites --------------------------------------------------------------------------
const glowCache = new Map();
function glowSprite(col) {
  const key = col.join(',');
  let s = glowCache.get(key);
  if (s) return s;
  const R = LOOK.GLOW_RES;
  s = newCanvas(R, R);
  const g = s.getContext('2d'), gr = g.createRadialGradient(R / 2, R / 2, 0, R / 2, R / 2, R / 2);
  gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},1)`);
  gr.addColorStop(0.18, `rgba(${col[0]},${col[1]},${col[2]},0.55)`);
  gr.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},0.14)`);
  gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, R, R);
  glowCache.set(key, s);
  return s;
}
const WHITE = [255, 255, 255];
// One additive glow: a halo of col, radius r css px, alpha a, plus a small white core. Call with any
// composite; it draws 'lighter' and restores.
export function glow(ctx, x, y, r, col, a, core = true) {
  if (!(a > 0.004) || !(r > 0.5)) return;
  const prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glowSprite(col), x - r, y - r, 2 * r, 2 * r);
  const rc = r * 0.22;
  // small glows (tracers, torpedoes) are halo only: half the blits
  if (core && r > 10) { ctx.globalAlpha = Math.min(1, a * 0.9); ctx.drawImage(glowSprite(WHITE), x - rc, y - rc, 2 * rc, 2 * rc); }
  ctx.globalCompositeOperation = prevOp; ctx.globalAlpha = prevA;
}
// A bloom of one kind at k (0..1 of its life, 1 = new): the halo fades as k * k, the radius grows a little.
export function bloom(ctx, x, y, kind, col, k = 1, scale = 1) {
  const b = BLOOM[kind];
  if (!b) return;
  glow(ctx, x, y, b.r * scale * (1.25 - 0.25 * k), col, b.a * k * k);
}

// --- the drive plume ------------------------------------------------------------------------
// Expanse-style: a long thin white-hot core, a blue sheath, shock diamonds, a hot spot at the nozzle.
// (x0, y0) the nozzle, (ux, uy) unit vector the exhaust goes, len px, hw half width px at the nozzle,
// t seconds, seed per ship. Flicker hashes the 30 Hz frame of t. Additive.
export function drawPlume(ctx, x0, y0, ux, uy, len, hw, t, seed = 0) {
  if (!(len > 1)) return;
  const fr = Math.floor(t * 30), f = 0.82 + 0.18 * hash01(fr * 7 + seed), nx = -uy, ny = ux;
  const L = len * f, x1 = x0 + ux * L, y1 = y0 + uy * L;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cone = (w, l, c0, c1) => {
    const g = ctx.createLinearGradient(x0, y0, x0 + ux * l, y0 + uy * l);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w, y0 + ny * w);
    ctx.lineTo(x0 + ux * l + nx * w * 0.25, y0 + uy * l + ny * w * 0.25);
    ctx.lineTo(x0 + ux * l - nx * w * 0.25, y0 + uy * l - ny * w * 0.25);
    ctx.lineTo(x0 - nx * w, y0 - ny * w);
    ctx.closePath(); ctx.fill();
  };
  cone(hw * 0.85, L, `rgba(90,140,255,${0.32 * f})`, 'rgba(60,100,255,0)');       // the sheath
  cone(hw * 0.45, L * 0.9, `rgba(170,210,255,${0.7 * f})`, 'rgba(120,170,255,0)'); // the plume
  cone(hw * 0.18, L * 0.75, `rgba(255,255,255,${0.95 * f})`, 'rgba(220,235,255,0)'); // the white-hot core
  // shock diamonds: bright knots along the core, each its own flicker, smaller further out
  for (let i = 0; i < 4; i++) {
    const s = 0.14 + i * 0.15, d = L * s, k = (1 - i * 0.2) * (0.6 + 0.4 * hash01(fr * 13 + i * 5 + seed));
    const cx = x0 + ux * d, cy = y0 + uy * d, w = hw * 0.32 * (1 - i * 0.15), l = Math.max(1.5, hw * 0.9);
    ctx.fillStyle = `rgba(235,245,255,${0.55 * k})`;
    ctx.beginPath();
    ctx.moveTo(cx - ux * l, cy - uy * l); ctx.lineTo(cx + nx * w, cy + ny * w);
    ctx.lineTo(cx + ux * l, cy + uy * l); ctx.lineTo(cx - nx * w, cy - ny * w);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  glow(ctx, x0 + ux * hw * 0.4, y0 + uy * hw * 0.4, Math.max(BLOOM.plume.r * 0.6, hw * 2.4), [150, 200, 255], BLOOM.plume.a * f);
  return { x1, y1 };
}

// --- lit marks (world view) -------------------------------------------------------------------
// Draw a mark into an offscreen sprite, then light it in screen space: a gradient along the key light
// (source-atop, so only the hull), the impact tints, and a rim on the edges facing the light (the
// silhouette less itself shifted away from the light). Works for any shape: generated, not per hull.
// draw(c) draws the mark centred at (0, 0) of c, in css px. size: css px the mark fits in.
// tints: [{x, y, r, a, col}] px offsets from the centre. Returns nothing; blits at (cx, cy).
export function makeLitSprites() {
  const pool = new Map();
  function get(key, px) {
    let e = pool.get(key);
    if (!e) { e = { a: newCanvas(px, px), b: newCanvas(px, px) }; pool.set(key, e); }
    if (e.a.width !== px) { e.a.width = e.a.height = px; e.b.width = e.b.height = px; }
    return e;
  }
  // ver: a string that changes whenever the drawn mark would (angle, dead rooms, cut cells); with the
  // same ver, the same size and no tints the last sprite is blitted again (a ship on a steady heading).
  return function litMark(ctx, key, cx, cy, size, draw, tints = [], ver) {
    const dpr = dprOf(), S = Math.ceil(size * 1.25 + 8), px = Math.ceil(S * dpr), h = S / 2;
    const e = get(key, px), { a, b } = e;
    const live = tints.some((t) => t.a > 0.01), stamp = ver === undefined || live ? null : ver + '|' + px;
    if (stamp !== null && e.stamp === stamp) { ctx.drawImage(a, cx - h, cy - h, S, S); return; }
    e.stamp = stamp;
    const ga = a.getContext('2d'), gb = b.getContext('2d');
    ga.setTransform(1, 0, 0, 1, 0, 0); ga.globalCompositeOperation = 'source-over'; ga.globalAlpha = 1; ga.clearRect(0, 0, px, px);
    ga.setTransform(dpr, 0, 0, dpr, h * dpr, h * dpr);
    draw(ga);
    ga.setTransform(dpr, 0, 0, dpr, h * dpr, h * dpr);
    ga.globalAlpha = 1;
    // rim first, from the clean silhouette
    gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'source-over'; gb.clearRect(0, 0, px, px);
    gb.drawImage(a, 0, 0);
    gb.globalCompositeOperation = 'source-in';
    gb.fillStyle = `rgba(255,236,205,${LOOK.RIM})`; gb.fillRect(0, 0, px, px);
    gb.globalCompositeOperation = 'destination-out';
    const d = LOOK.RIM_PX * dpr;
    gb.drawImage(a, -LOOK.KEY.x * d, -LOOK.KEY.y * d);
    // shading along the key light, then the impact tints, only where the hull is
    ga.globalCompositeOperation = 'source-atop';
    const R = size * 0.5, K = LOOK.KEY;
    const g = ga.createLinearGradient(K.x * R, K.y * R, -K.x * R, -K.y * R);
    g.addColorStop(0, `rgba(255,240,220,${LOOK.SHADE_LIT})`);
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,2,10,${LOOK.SHADE_DARK})`);
    ga.fillStyle = g; ga.fillRect(-h, -h, S, S);
    for (const t of tints) {
      if (!(t.a > 0.01)) continue;
      const tg = ga.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
      tg.addColorStop(0, `rgba(${t.col[0]},${t.col[1]},${t.col[2]},${t.a})`);
      tg.addColorStop(1, `rgba(${t.col[0]},${t.col[1]},${t.col[2]},0)`);
      ga.fillStyle = tg; ga.fillRect(-h, -h, S, S);
    }
    ga.globalCompositeOperation = 'source-over';
    ga.setTransform(1, 0, 0, 1, 0, 0);
    ga.drawImage(b, 0, 0);
    ctx.drawImage(a, cx - h, cy - h, S, S);
  };
}

// --- vignette and grade -----------------------------------------------------------------------
// Darker corners and a cool cast away from the key light, cached per size. Drawn over the scene and
// before any canvas text (HUD text is DOM above the canvases, or drawn after this in the dock).
export function makeVignette() {
  let cache = null, kw = 0, kh = 0, kd = 0, kr = '';
  return function vignette(ctx, w, h, rect) {
    const r = rect || { x: 0, y: 0, w, h }, dpr = dprOf(), rk = [r.x, r.y, r.w, r.h].map(Math.round).join(',');
    if (!cache || kw !== w || kh !== h || kd !== dpr || kr !== rk) {
      kw = w; kh = h; kd = dpr; kr = rk;
      cache = newCanvas(Math.round(w * dpr), Math.round(h * dpr));
      const g = cache.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const v = g.createRadialGradient(cx, cy, R * LOOK.VIGNETTE_IN, cx, cy, R);
      v.addColorStop(0, 'rgba(0,0,4,0)'); v.addColorStop(1, `rgba(0,0,4,${LOOK.VIGNETTE})`);
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      // the grade: a cool cast toward the shadow corner (away from the key light)
      const K = LOOK.KEY, s = Math.hypot(w, h) / 2;
      const c = g.createLinearGradient(w / 2 + K.x * s, h / 2 + K.y * s, w / 2 - K.x * s, h / 2 - K.y * s);
      c.addColorStop(0, 'rgba(20,40,80,0)'); c.addColorStop(1, 'rgba(10,25,60,0.12)');
      g.fillStyle = c; g.fillRect(0, 0, w, h);
    }
    // only the bands where it is dark: the clear middle is not blitted (fill rate on a phone)
    const bx = Math.round(w * 0.2), by = Math.round(h * 0.22), d = dpr;
    ctx.drawImage(cache, 0, 0, w * d, by * d, 0, 0, w, by);
    ctx.drawImage(cache, 0, (h - by) * d, w * d, by * d, 0, h - by, w, by);
    ctx.drawImage(cache, 0, by * d, bx * d, (h - 2 * by) * d, 0, by, bx, h - 2 * by);
    ctx.drawImage(cache, (w - bx) * d, by * d, bx * d, (h - 2 * by) * d, w - bx, by, bx, h - 2 * by);
  };
}

// --- parallax starfield -----------------------------------------------------------------------
// Layers far to near: more stars and slower far away, fewer, bigger and faster near.
// Positions are hashes; the camera offset slides each layer by its
// parallax. Colours tilt warm or cool by hash.
export const STAR_LAYERS = [
  { par: 0.04, n: 70, bright: 0.3, size: 0.8 },
  { par: 0.10, n: 45, bright: 0.48, size: 1.0 },
  { par: 0.22, n: 22, bright: 0.72, size: 1.3 },
  { par: 0.45, n: 8, bright: 0.95, size: 1.8 },
];
const STAR_COLS = ['rgb(255,214,180)', 'rgb(180,205,255)', 'rgb(210,222,245)'];
export function makeStarfield(seed = 0) {
  // grouped by colour: one fillStyle per group, the twinkle is globalAlpha (no colour string per star)
  const groups = STAR_COLS.map((col) => ({ col, stars: [] }));
  let i = seed * 1000;
  for (const L of STAR_LAYERS) {
    for (let k = 0; k < L.n; k++, i += 5) {
      const hue = hash01(i + 4), gi = hue < 0.2 ? 0 : hue < 0.45 ? 1 : 2;
      groups[gi].stars.push({ u: hash01(i) * 4096, v: hash01(i + 1) * 4096, tw: 1 + hash01(i + 2) * 3, ph: hash01(i + 3) * 6.28, par: L.par, bright: L.bright, size: L.size });
    }
  }
  const mod = (a, m) => ((a % m) + m) % m;
  // ox, oy: the camera in px of travel (km times a px-per-km); each layer slides ox * par
  return function drawStarfield(ctx, ox, oy, w, h, time) {
    const a0 = ctx.globalAlpha;
    for (const g of groups) {
      ctx.fillStyle = g.col;
      for (const s of g.stars) {
        ctx.globalAlpha = a0 * s.bright * (0.75 + 0.25 * Math.sin(time * s.tw + s.ph));
        ctx.fillRect(mod(s.u - ox * s.par, w), mod(s.v - oy * s.par, h), s.size, s.size);
      }
    }
    ctx.globalAlpha = a0;
  };
}
