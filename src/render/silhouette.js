// Side-profile silhouette of a Tachi-class corvette (Rocinante-inspired),
// six pieces lit or dark, plus the small top-down mark for the tactical map.
// Pure canvas drawing. No DOM, no state kept here: everything comes from
// (ship, box, fx). No Math.random: every "random" crack or chunk is hashed
// from the piece name so it is the same every frame.
//
// Ship-local coordinates: u runs 0 (stern) -> 1 (bow) along the hull,
// v runs -1 (top edge of box) -> +1 (bottom edge of box). The hull body
// sits inside |v| <= 0.36; turret bumps, the keel rail and the drive cone
// poke out of it. facing === 1 puts the bow on the right, -1 mirrors u.

import { N } from '../numbers.js';

export const SHIP_ASPECT = 220 / 90; // box width / height the ship was drawn for

export const COLORS = {
  bg: '#06080f',
  steel: '#46505c', steelLight: '#5e6a78', steelDark: '#2d353f',
  edge: '#a8bccd', edgeBright: '#dbeafe',
  dead: '#12151a', deadEdge: '#2a3038', crack: '#05060a',
  ember: '#ff7a1f', fire: '#ff9a3c', flashWhite: '#ffffff',
  warn: '#ff3b3b', glowCool: '#8fd0ff', glowAmber: '#ffb060',
  me: '#bfe3ff', them: '#ffa050',
};

// Hull body outline (u, v), bow on the right.
const HULL = [
  [0.04, -0.30], [0.20, -0.36], [0.68, -0.36], [0.86, -0.22], [1.00, -0.06],
  [1.00, 0.06], [0.86, 0.22], [0.68, 0.36], [0.20, 0.36], [0.04, 0.30],
];

// Six pieces. shapes[0] is the main body (used for chunks and cracks),
// center is the hit point in ship-local coordinates.
const PIECE_DEFS = {
  // Railgun: a long bar under the keel, forward of the turrets, with a
  // pylon under the bow taper and a muzzle sticking past the bow.
  rail: {
    center: [0.78, 0.42],
    shapes: [
      [[0.56, 0.37], [0.94, 0.37], [0.94, 0.47], [0.56, 0.47]],       // bar
      [[0.76, 0.30], [0.90, 0.19], [0.90, 0.38], [0.76, 0.38]],       // pylon
      [[0.94, 0.39], [1.04, 0.39], [1.04, 0.45], [0.94, 0.45]],       // muzzle
    ],
  },
  // Port PDC turret: dome on top of the hull, barrel pointing forward.
  pdcL: {
    center: [0.44, -0.50],
    shapes: [
      [[0.36, -0.36], [0.52, -0.36], [0.50, -0.56], [0.47, -0.64], [0.41, -0.64], [0.38, -0.56]], // dome
      [[0.45, -0.62], [0.62, -0.62], [0.62, -0.57], [0.45, -0.57]],                              // barrel
    ],
  },
  // Starboard PDC turret: same, under the hull.
  pdcR: {
    center: [0.44, 0.50],
    shapes: [
      [[0.36, 0.36], [0.52, 0.36], [0.50, 0.56], [0.47, 0.64], [0.41, 0.64], [0.38, 0.56]],
      [[0.45, 0.62], [0.62, 0.62], [0.62, 0.57], [0.45, 0.57]],
    ],
  },
  // Bridge: forward block of the mid hull, windows facing the bow.
  bridge: {
    center: [0.64, 0.0],
    shapes: [
      [[0.54, -0.26], [0.70, -0.26], [0.75, -0.08], [0.75, 0.08], [0.70, 0.26], [0.54, 0.26]],
    ],
  },
  // Torpedo tubes: stern block with two ports.
  tubes: {
    center: [0.22, 0.0],
    shapes: [
      [[0.12, -0.30], [0.32, -0.30], [0.32, 0.30], [0.12, 0.30]],
    ],
  },
  // Epstein drive: cone flaring out behind the stern.
  drive: {
    center: [0.04, 0.0],
    shapes: [
      [[0.10, -0.26], [0.10, 0.26], [-0.02, 0.42], [-0.03, 0.0], [-0.02, -0.42]],
    ],
  },
};

// Points the panels need for effects that are not piece centers.
export const LANDMARKS = {
  bow: [1.0, 0.0],
  muzzle: [1.05, 0.42],
  nozzle: [-0.04, 0.0],
  tubeTop: [0.13, -0.16],
  tubeBottom: [0.13, 0.16],
  topside: [0.30, -0.36],
  underside: [0.30, 0.36],
};

const DRAW_ORDER = ['drive', 'tubes', 'rail', 'pdcR', 'pdcL', 'bridge'];

// --- tiny deterministic hash (the only "random" here) -----------------------

function hash01(n) {
  let x = (Math.imul(n | 0, 0x9E3779B1) + 0x7F4A7C15) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85EBCA77);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE3D);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// --- coordinate mapping -----------------------------------------------------

// Ship-local (u, v) -> canvas point inside box, honoring facing.
export function shipPoint(u, v, box, facing) {
  const uu = facing === -1 ? 1 - u : u;
  return { x: box.x + uu * box.w, y: box.y + box.h * (0.5 + v * 0.5) };
}

function tracePoly(ctx, poly, box, facing) {
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const p = shipPoint(poly[i][0], poly[i][1], box, facing);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

// Canvas point at the center of a piece. Used to spawn debris.
export function piecePoint(piece, box, facing) {
  const def = PIECE_DEFS[piece];
  const c = def ? def.center : [0.5, 0];
  return shipPoint(c[0], c[1], box, facing);
}

// --- damage decoration, cached per piece in ship-local space -----------------

const decoCache = new Map();

// Cracks: jagged polylines from near the center outward. Chunks: triangular
// bites out of the main shape's corners. Ember: a point inside the piece.
function decoration(name) {
  let d = decoCache.get(name);
  if (d) return d;
  const def = PIECE_DEFS[name];
  const seed = strSeed(name);
  const main = def.shapes[0];
  // bounding radius of the main shape around the center
  let rad = 0;
  for (const [u, v] of main) rad = Math.max(rad, Math.hypot((u - def.center[0]) * SHIP_ASPECT, v - def.center[1]));
  const cracks = [];
  for (let i = 0; i < 4; i++) {
    const a = hash01(seed + i * 7) * Math.PI * 2;
    const pts = [];
    let u = def.center[0] + (hash01(seed + i * 7 + 1) - 0.5) * 0.04;
    let v = def.center[1] + (hash01(seed + i * 7 + 2) - 0.5) * 0.08;
    pts.push([u, v]);
    const segs = 3;
    for (let s = 1; s <= segs; s++) {
      const jitter = (hash01(seed + i * 7 + 3 + s) - 0.5) * 1.2;
      const ang = a + jitter;
      const step = (rad * 1.1) / segs;
      u += Math.cos(ang) * step / SHIP_ASPECT; // u is stretched by the aspect
      v += Math.sin(ang) * step;
      pts.push([u, v]);
    }
    cracks.push(pts);
  }
  const chunks = [];
  for (let i = 0; i < 2; i++) {
    const k = Math.floor(hash01(seed + 100 + i * 3) * main.length);
    const a = main[k], prev = main[(k + main.length - 1) % main.length], next = main[(k + 1) % main.length];
    const f = 0.35 + hash01(seed + 101 + i * 3) * 0.25;
    chunks.push([a, [a[0] + (prev[0] - a[0]) * f, a[1] + (prev[1] - a[1]) * f], [a[0] + (next[0] - a[0]) * f, a[1] + (next[1] - a[1]) * f]]);
  }
  const ember = [def.center[0] + (hash01(seed + 200) - 0.5) * 0.06, def.center[1] + (hash01(seed + 201) - 0.5) * 0.12];
  d = { cracks, chunks, ember, rad, phase: hash01(seed + 300) * 6.28 };
  decoCache.set(name, d);
  return d;
}

function strokePolyline(ctx, pts, box, facing) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = shipPoint(pts[i][0], pts[i][1], box, facing);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

// --- piece details (windows, ports, nozzle...) ------------------------------

function drawDetails(ctx, name, ship, box, facing, lit, t) {
  const P = (u, v) => shipPoint(u, v, box, facing);
  const s = box.h; // scale unit
  ctx.lineWidth = 1;
  if (name === 'bridge') {
    // three window slits near the forward face
    for (let i = -1; i <= 1; i++) {
      const a = P(0.70, i * 0.09), b = P(0.66, i * 0.09);
      ctx.strokeStyle = lit ? 'rgba(220,240,255,0.9)' : 'rgba(60,70,80,0.6)';
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  } else if (name === 'tubes') {
    // two round ports
    for (const vv of [-0.16, 0.16]) {
      const c = P(0.14, vv);
      ctx.beginPath(); ctx.arc(c.x, c.y, s * 0.045, 0, Math.PI * 2);
      ctx.fillStyle = lit ? '#0b0e14' : '#07080b'; ctx.fill();
      ctx.strokeStyle = lit ? 'rgba(200,220,240,0.7)' : 'rgba(50,58,68,0.6)'; ctx.stroke();
      if (lit && ship.torps > 0 && ship.torpReload === 0) {
        // loaded: a faint warm dot in the port
        ctx.fillStyle = 'rgba(255,180,100,0.5)';
        ctx.beginPath(); ctx.arc(c.x, c.y, s * 0.015, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (name === 'drive') {
    // nozzle throat and, when alive, the idle drive glow
    const n = P(-0.02, 0);
    ctx.beginPath(); ctx.ellipse(n.x, n.y, s * 0.02, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#0d1119' : '#07080b'; ctx.fill();
    if (lit) {
      const pulse = 0.55 + 0.15 * Math.sin(t * 9 + 1);
      const g = P(-0.06, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, s * 0.22);
      grad.addColorStop(0, `rgba(190,225,255,${0.55 * pulse})`);
      grad.addColorStop(0.4, `rgba(120,180,255,${0.25 * pulse})`);
      grad.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, s * 0.22, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  } else if (name === 'pdcL' || name === 'pdcR') {
    // barrel muzzle tick and a hinge line on the dome
    const vv = name === 'pdcL' ? -1 : 1;
    const a = P(0.38, vv * 0.46), b = P(0.50, vv * 0.46);
    ctx.strokeStyle = lit ? 'rgba(170,190,210,0.5)' : 'rgba(45,52,60,0.6)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else if (name === 'rail') {
    // rail grooves along the bar
    const a = P(0.58, 0.42), b = P(0.92, 0.42);
    ctx.strokeStyle = lit ? 'rgba(20,24,30,0.9)' : 'rgba(10,12,16,0.9)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

// Which pieces glow as "active" from ship state alone. fx.active can add.
function isActive(name, ship, fxActive) {
  if (fxActive && fxActive[name]) return true;
  if (name === 'rail') return ship.railAim >= 0 || ship.railCharge <= 0;
  if (name === 'tubes') return ship.torps > 0 && ship.torpReload === 0;
  if (name === 'drive') return true;
  return false;
}

// --- the piece ----------------------------------------------------------------

function drawPiece(ctx, name, ship, box, facing, fx, t) {
  const def = PIECE_DEFS[name];
  const pc = ship.pieces && ship.pieces[name];
  const alive = pc ? !!pc.alive : true;
  const maxHp = N.PIECE_HP * (name === 'bridge' ? N.BRIDGE_HP_MULT : 1);
  const hpFrac = pc ? clamp01(pc.hp / maxHp) : 1;
  const s = box.h;
  const deco = decoration(name);

  if (alive) {
    // body
    for (const shape of def.shapes) {
      tracePoly(ctx, shape, box, facing);
      ctx.fillStyle = COLORS.steelLight;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.edge;
      ctx.stroke();
    }
    // bright top edge highlight on the main body
    const main = def.shapes[0];
    const a = shipPoint(main[0][0], main[0][1], box, facing), b = shipPoint(main[1][0], main[1][1], box, facing);
    ctx.strokeStyle = 'rgba(219,234,254,0.35)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    drawDetails(ctx, name, ship, box, facing, true, t);

    // damage: darken with lost hp, cracks once below half
    if (hpFrac < 1) {
      ctx.save();
      for (const shape of def.shapes) {
        tracePoly(ctx, shape, box, facing);
        ctx.fillStyle = `rgba(8,10,14,${(1 - hpFrac) * 0.5})`;
        ctx.fill();
      }
      if (hpFrac < 0.5) {
        ctx.strokeStyle = COLORS.crack;
        ctx.lineWidth = Math.max(1, s * 0.012);
        const n = hpFrac < 0.25 ? 2 : 1;
        for (let i = 0; i < n; i++) strokePolyline(ctx, deco.cracks[i], box, facing);
      }
      ctx.restore();
    }

    // active glow: a soft outline in the piece's working color
    if (isActive(name, ship, fx.active)) {
      const aiming = name === 'rail' && ship.railAim >= 0;
      const pulse = aiming ? 0.6 + 0.4 * Math.sin(t * 14) : 0.7 + 0.3 * Math.sin(t * 3 + deco.phase);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = s * 0.08;
      ctx.shadowColor = aiming ? COLORS.warn : COLORS.glowCool;
      ctx.strokeStyle = aiming ? `rgba(255,80,80,${0.5 * pulse})` : `rgba(143,208,255,${0.28 * pulse})`;
      ctx.lineWidth = 1.2;
      tracePoly(ctx, def.shapes[0], box, facing);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // dead: dark body, dim edge, bitten chunks, cracks, ember
    for (const shape of def.shapes) {
      tracePoly(ctx, shape, box, facing);
      ctx.fillStyle = COLORS.dead;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.deadEdge;
      ctx.stroke();
    }
    drawDetails(ctx, name, ship, box, facing, false, t);
    ctx.fillStyle = fx.bg || COLORS.bg;
    for (const ch of deco.chunks) { tracePoly(ctx, ch, box, facing); ctx.fill(); }
    ctx.strokeStyle = COLORS.crack;
    ctx.lineWidth = Math.max(1, s * 0.014);
    for (const c of deco.cracks) strokePolyline(ctx, c, box, facing);
    // dim ember, slowly breathing
    const e = shipPoint(deco.ember[0], deco.ember[1], box, facing);
    const breathe = 0.35 + 0.2 * Math.sin(t * 2.2 + deco.phase);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, s * 0.09);
    grad.addColorStop(0, `rgba(255,140,50,${breathe})`);
    grad.addColorStop(0.5, `rgba(255,90,20,${breathe * 0.35})`);
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(e.x, e.y, s * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // impact flash: white that reads orange as it fades
  const f = fx.flash && fx.flash[name] ? clamp01(fx.flash[name]) : 0;
  if (f > 0.01) {
    const g = Math.round(255 * f + 150 * (1 - f));
    const bl = Math.round(255 * f + 50 * (1 - f));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = s * 0.2 * f;
    ctx.shadowColor = COLORS.fire;
    ctx.fillStyle = `rgba(255,${g},${bl},${0.9 * f})`;
    for (const shape of def.shapes) { tracePoly(ctx, shape, box, facing); ctx.fill(); }
    ctx.restore();
  }
}

// --- public: the silhouette ---------------------------------------------------

// fx = { flash: {piece: 0..1}, t: seconds for pulsing (optional),
//        warn: 0..1 red outline (optional), active: {piece: bool} (optional),
//        bg: background color for bitten chunks (optional) }
export function drawSilhouette(ctx, ship, box, fx = {}) {
  const facing = ship.facing === -1 ? -1 : 1;
  const t = fx.t || 0;
  const bridgeAlive = !ship.pieces || ship.pieces.bridge.alive;
  ctx.save();
  ctx.lineJoin = 'round';

  // hull base: a vertical steel gradient, darker when the ship is beaten
  tracePoly(ctx, HULL, box, facing);
  const grad = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  grad.addColorStop(0, bridgeAlive ? COLORS.steelDark : '#1a1f26');
  grad.addColorStop(0.45, bridgeAlive ? COLORS.steel : '#242b33');
  grad.addColorStop(1, bridgeAlive ? COLORS.steelDark : '#1a1f26');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = bridgeAlive ? 'rgba(168,188,205,0.7)' : 'rgba(80,90,100,0.6)';
  ctx.stroke();

  // hull seams: a few faint plate lines so the hull reads as built, not drawn
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (const u of [0.34, 0.52, 0.78]) {
    const a = shipPoint(u, -0.34, box, facing), b = shipPoint(u, 0.34, box, facing);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  const k1 = shipPoint(0.08, 0.0, box, facing), k2 = shipPoint(0.9, 0.0, box, facing);
  ctx.beginPath(); ctx.moveTo(k1.x, k1.y); ctx.lineTo(k2.x, k2.y); ctx.stroke();

  for (const name of DRAW_ORDER) drawPiece(ctx, name, ship, box, facing, fx, t);

  // red warning outline: a railgun is aiming at this ship
  if (fx.warn > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = box.h * 0.12;
    ctx.shadowColor = COLORS.warn;
    ctx.strokeStyle = `rgba(255,60,60,${clamp01(fx.warn)})`;
    ctx.lineWidth = 1.5 + fx.warn;
    tracePoly(ctx, HULL, box, facing);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// --- public: the top-down mark for the tactical map ---------------------------

// Draws a small top-down ship, length `scale` px, pointing along `angle`
// (radians, canvas convention: 0 = +x, PI/2 = down). Uses ctx.fillStyle as
// the ship color (caller sets it). Dim when more than half the pieces are dead.
export function drawShipMark(ctx, ship, x, y, scale, angle) {
  const s = scale;
  const pieces = ship.pieces || {};
  let dead = 0;
  for (const k in pieces) if (!pieces[k].alive) dead++;
  const total = Object.keys(pieces).length || 6;
  const dim = dead > total / 2;
  const color = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : COLORS.edge;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha *= dim ? 0.45 : 1;
  ctx.lineJoin = 'round';
  // hull
  ctx.beginPath();
  ctx.moveTo(0.5 * s, 0);
  ctx.lineTo(0.22 * s, -0.16 * s);
  ctx.lineTo(-0.34 * s, -0.16 * s);
  ctx.lineTo(-0.5 * s, -0.09 * s);
  ctx.lineTo(-0.5 * s, 0.09 * s);
  ctx.lineTo(-0.34 * s, 0.16 * s);
  ctx.lineTo(0.22 * s, 0.16 * s);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // turrets: lit dots, dark when dead
  for (const [name, vy] of [['pdcL', -0.24], ['pdcR', 0.24]]) {
    const a = pieces[name] ? pieces[name].alive : true;
    ctx.beginPath(); ctx.arc(-0.04 * s, vy * s, 0.08 * s, 0, Math.PI * 2);
    ctx.fillStyle = a ? color : COLORS.dead; ctx.fill();
  }
  // rail: a thin line out past the bow
  if (!pieces.rail || pieces.rail.alive) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 0.06 * s);
    ctx.beginPath(); ctx.moveTo(0.1 * s, 0); ctx.lineTo(0.6 * s, 0); ctx.stroke();
  }
  // drive glow
  if (!pieces.drive || pieces.drive.alive) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(160,210,255,0.7)';
    ctx.beginPath(); ctx.arc(-0.56 * s, 0, 0.1 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
