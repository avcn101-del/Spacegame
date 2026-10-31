// Side-profile silhouettes: the Tachi-class corvette (Rocinante-inspired) and the
// Belter gunship, each its own art table. Rooms laid along the hull from bow to
// stern, each lit or dark (a torn room drawn adrift past the end it broke from), plus
// the small top-down mark for the tactical map and the exposure chevrons.
// Pure canvas drawing. No DOM, no state kept here: everything comes from
// (ship, box, fx). No Math.random: every "random" crack or chunk is hashed
// from the room name so it is the same every frame.
//
// Ship-local coordinates: u runs 0 (stern) -> 1 (bow) along the hull,
// v runs -1 (top edge of box) -> +1 (bottom edge of box). The hull body
// sits inside |v| <= 0.36; turret bumps, the sensor mast, the keel rail and
// the drive cone poke out of it. facing === 1 puts the bow on the right,
// -1 mirrors u. The rooms are hull segments between bulkheads; a shot from
// ahead meets 'rail' first, a shot from behind meets 'drive' first.

import { N } from '../numbers.js';
import { exposure } from '../sim/ship.js';

export const SHIP_ASPECT = 220 / 90; // box width / height the ship was drawn for

export const COLORS = {
  bg: '#06080f',
  steel: '#46505c', steelLight: '#5e6a78', steelDark: '#2d353f', steelLost: '#333b46',
  edge: '#a8bccd', edgeBright: '#dbeafe',
  dead: '#12151a', deadEdge: '#2a3038', crack: '#05060a',
  ember: '#ff7a1f', fire: '#ff9a3c', flashWhite: '#ffffff',
  warn: '#ff3b3b', glowCool: '#8fd0ff', glowAmber: '#ffb060',
  me: '#bfe3ff', them: '#ffa050',
};

// --- hull profile -------------------------------------------------------------

// Each ship design has its own art: a hull profile, its rooms as shapes, a draw order,
// landmarks for effects, and the small detail positions. `A` is the art of the ship being
// drawn; every public function picks it from the ship's design first.
const ART = {};
let A = null;
const useArt = (design) => { A = ART[design] || ART.tachi; };

// (u, half height): the top edge of the hull body, stern to bow. The bottom
// edge mirrors it. Bulkheads cut this profile into the room bodies.
function halfH(u, profile = A.profile) {
  if (u <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    const [u0, h0] = profile[i - 1], [u1, h1] = profile[i];
    if (u <= u1) return h0 + (h1 - h0) * ((u - u0) / (u1 - u0));
  }
  return profile[profile.length - 1][1];
}

// The hull body between u0 and u1 as a closed polygon, shrunk by `inset` at
// each end so the base hull shows through as the bulkhead seam.
function segment(u0, u1, inset = 0, profile = A.profile) {
  const a = u0 + inset, b = u1 - inset;
  const top = [[a, -halfH(a, profile)]];
  for (const [u] of profile) if (u > a && u < b) top.push([u, -halfH(u, profile)]);
  top.push([b, -halfH(b, profile)]);
  const bottom = top.slice().reverse().map(([u, v]) => [u, -v]);
  return [...top, ...bottom];
}

const SEAM = 0.006; // half the bulkhead gap, in u

// Rooms from bow to stern. span: the u range the room occupies (also the hp
// gauge's axis); shapes[0] is the main body (chunks, cracks, the hp fill),
// the rest are fittings; center is the hit point in ship-local coordinates.
function tachiRooms(P) {
  const seg = (u0, u1, inset = 0) => segment(u0, u1, inset, P), hh = (u) => halfH(u, P);
  return {
    // Railgun room: the bow taper, with the keel barrel slung under it and the
    // muzzle sticking out past the bow.
    rail: {
      span: [0.86, 1.00],
      center: [0.92, 0.0],
      shapes: [
        seg(0.86, 1.00, SEAM),
        [[0.78, 0.22], [1.10, 0.22], [1.10, 0.30], [0.78, 0.30]],   // barrel
        [[0.84, 0.14], [0.92, 0.14], [0.92, 0.23], [0.84, 0.23]],   // pylon
      ],
    },
    // Sensors: a mast with a dish on the spine, just behind the bow.
    sensors: {
      span: [0.74, 0.86],
      center: [0.80, 0.0],
      shapes: [
        seg(0.74, 0.86, SEAM),
        [[0.79, -0.24], [0.815, -0.24], [0.815, -0.46], [0.79, -0.46]],   // mast
        [[0.75, -0.46], [0.855, -0.46], [0.84, -0.54], [0.765, -0.54]],   // dish
      ],
    },
    // PDC deck: two turrets, one on the spine, one on the keel, barrels forward.
    pdc: {
      span: [0.60, 0.74],
      center: [0.67, 0.0],
      shapes: [
        seg(0.60, 0.74, SEAM),
        [[0.62, -0.36], [0.74, -0.36], [0.725, -0.52], [0.70, -0.60], [0.64, -0.60], [0.615, -0.52]], // top dome
        [[0.68, -0.585], [0.80, -0.585], [0.80, -0.535], [0.68, -0.535]],                            // top barrel
        [[0.62, 0.36], [0.74, 0.36], [0.725, 0.52], [0.70, 0.60], [0.64, 0.60], [0.615, 0.52]],       // bottom dome
        [[0.68, 0.585], [0.80, 0.585], [0.80, 0.535], [0.68, 0.535]],                                // bottom barrel
      ],
    },
    // Bridge: in the middle of the hull, windows face the bow. The room the others must reach.
    bridge: {
      span: [0.44, 0.60],
      center: [0.52, 0.0],
      shapes: [seg(0.44, 0.60, SEAM)],
    },
    // Crew: quarters and damage control, portholes along the side.
    crew: {
      span: [0.29, 0.44],
      center: [0.365, 0.0],
      shapes: [seg(0.29, 0.44, SEAM)],
    },
    // Torpedo tubes: two ports.
    tubes: {
      span: [0.13, 0.29],
      center: [0.21, 0.0],
      shapes: [seg(0.13, 0.29, SEAM)],
    },
    // Epstein drive: the stern block flaring into the cone.
    drive: {
      span: [-0.03, 0.13],
      center: [0.05, 0.0],
      shapes: [
        [[0.13 - SEAM, -hh(0.13 - SEAM)], [0.13 - SEAM, hh(0.13 - SEAM)], [0.04, 0.30], [-0.02, 0.42], [-0.03, 0.0], [-0.02, -0.42], [0.04, -0.30]],
      ],
    },
  };
}

// A torn room is drawn this far (in u) past the end it broke from, slightly turned: adrift.
const TEAR_GAP = 0.10;
const TEAR_TILT = 0.12;
const bridgeU = () => A.rooms.bridge.center[0];
const isTorn = (ship, name) => !!(ship.pieces && ship.pieces[name] && ship.pieces[name].torn);

// Points the panels need for effects that are not room centers.
const TACHI_LANDMARKS = {
  bow: [1.0, 0.0],
  muzzle: [1.11, 0.26],
  nozzle: [-0.04, 0.0],
  tubeTop: [0.21, -0.38],
  tubeBottom: [0.21, 0.38],
  topside: [0.36, -0.36],
  underside: [0.36, 0.36],
  // thruster ports, for the turn puffs
  thrusterBowTop: [0.80, -0.30], thrusterBowBottom: [0.80, 0.30],
  thrusterSternTop: [0.18, -0.37], thrusterSternBottom: [0.18, 0.37],
  // where the exposure chevrons sit
  chevronBow: [1.16, 0.0], chevronTail: [-0.14, 0.0], chevronSideA: [0.33, 0.70], chevronSideB: [0.67, 0.70],
};
// Small details drawn on the rooms: where the windows, portholes, ports, hinges and the
// antenna sit, in ship-local u, v.
const TACHI_DECO = {
  bridgeWindows: [0.585, 0.545],                 // u of the window slits' ends
  portholes: [0.32, 0.365, 0.41], portholeV: -0.12,
  tubePorts: [[0.21, -0.16], [0.21, 0.16]], portR: 0.045,
  nozzleU: -0.02,
  pdcHinges: [[0.63, 0.73, -0.44], [0.63, 0.73, 0.44]], // u0, u1, v of each dome's hinge line
  railGroove: [0.80, 1.08, 0.26],
  sensorWhisker: [[0.80, -0.50], [0.86, -0.50]], sensorDot: [0.8025, -0.56],
};

// defineArt: profile, rooms (a function of the profile), draw order (stern first, so what
// pokes forward ends up on top), landmarks, details.
function defineArt(id, profile, rooms, drawOrder, landmarks, deco) {
  ART[id] = { id, profile, rooms: rooms(profile), drawOrder, bowToStern: drawOrder.slice().reverse(), landmarks, deco, hull: segment(0.04, 1.0, 0, profile) };
}
defineArt('tachi', [[0.04, 0.30], [0.20, 0.36], [0.68, 0.36], [0.86, 0.22], [1.00, 0.06]], tachiRooms,
  ['drive', 'tubes', 'crew', 'bridge', 'pdc', 'sensors', 'rail'], TACHI_LANDMARKS, TACHI_DECO);

// Belter gunship: a blunt, fat hull, six rooms, no rail. Three PDC domes (two on the spine,
// one on the keel), a sensor mast and a keel antenna at the bow, four torpedo ports, a wide cone.
function belterRooms(P) {
  const seg = (u0, u1, inset = 0) => segment(u0, u1, inset, P), hh = (u) => halfH(u, P);
  const dome = (u0, u1, sv) => [[u0, sv * 0.40], [u1, sv * 0.40], [u1 - 0.01, sv * 0.54], [u1 - 0.03, sv * 0.62], [u0 + 0.03, sv * 0.62], [u0 + 0.01, sv * 0.54]];
  const barrel = (u0, u1, sv) => [[u0, sv * 0.60], [u1, sv * 0.60], [u1, sv * 0.555], [u0, sv * 0.555]];
  return {
    sensors: {
      span: [0.82, 1.00], center: [0.91, 0.0],
      shapes: [
        seg(0.82, 1.00, SEAM),
        [[0.90, -0.26], [0.925, -0.26], [0.925, -0.48], [0.90, -0.48]],  // mast
        [[0.86, -0.48], [0.965, -0.48], [0.95, -0.56], [0.875, -0.56]],   // dish
        [[0.86, 0.22], [0.88, 0.22], [0.88, 0.42], [0.86, 0.42]],         // keel antenna
      ],
    },
    pdc: {
      span: [0.62, 0.82], center: [0.72, 0.0],
      shapes: [
        seg(0.62, 0.82, SEAM),
        dome(0.63, 0.71, -1), barrel(0.68, 0.80, -1),   // spine, aft
        dome(0.73, 0.81, -1), barrel(0.78, 0.90, -1),   // spine, fore
        dome(0.68, 0.76, 1), barrel(0.73, 0.85, 1),     // keel
      ],
    },
    bridge: { span: [0.46, 0.62], center: [0.54, 0.0], shapes: [seg(0.46, 0.62, SEAM)] },
    crew: { span: [0.32, 0.46], center: [0.39, 0.0], shapes: [seg(0.32, 0.46, SEAM)] },
    tubes: { span: [0.14, 0.32], center: [0.23, 0.0], shapes: [seg(0.14, 0.32, SEAM)] },
    drive: {
      span: [-0.03, 0.14], center: [0.05, 0.0],
      shapes: [
        [[0.14 - SEAM, -hh(0.14 - SEAM)], [0.14 - SEAM, hh(0.14 - SEAM)], [0.04, 0.32], [-0.02, 0.46], [-0.03, 0.0], [-0.02, -0.46], [0.04, -0.32]],
      ],
    },
  };
}
const BELTER_LANDMARKS = {
  bow: [1.0, 0.0], muzzle: [1.0, 0.0], nozzle: [-0.04, 0.0],
  tubeTop: [0.23, -0.42], tubeBottom: [0.23, 0.42],
  topside: [0.39, -0.40], underside: [0.39, 0.40],
  thrusterBowTop: [0.86, -0.32], thrusterBowBottom: [0.86, 0.32],
  thrusterSternTop: [0.18, -0.41], thrusterSternBottom: [0.18, 0.41],
  chevronBow: [1.16, 0.0], chevronTail: [-0.14, 0.0], chevronSideA: [0.33, 0.74], chevronSideB: [0.67, 0.74],
};
const BELTER_DECO = {
  bridgeWindows: [0.605, 0.565],
  portholes: [0.35, 0.39, 0.43], portholeV: -0.14,
  tubePorts: [[0.19, -0.20], [0.19, 0.20], [0.27, -0.20], [0.27, 0.20]], portR: 0.045,
  nozzleU: -0.02,
  pdcHinges: [[0.64, 0.70, -0.46], [0.74, 0.80, -0.46], [0.69, 0.75, 0.46]],
  railGroove: null,
  sensorWhisker: [[0.91, -0.52], [0.97, -0.52]], sensorDot: [0.9125, -0.58],
};
defineArt('belter', [[0.04, 0.32], [0.14, 0.40], [0.72, 0.40], [0.88, 0.30], [1.00, 0.14]], belterRooms,
  ['drive', 'tubes', 'crew', 'bridge', 'pdc', 'sensors'], BELTER_LANDMARKS, BELTER_DECO);
useArt('tachi');

// A landmark of a design, for the panels' effects.
export const landmark = (name, design) => (ART[design] || ART.tachi).landmarks[name];

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
const roomAlive = (ship, name) => !ship.pieces || !ship.pieces[name] || !!ship.pieces[name].alive;

// --- coordinate mapping -----------------------------------------------------

// Ship-local (u, v) -> canvas point inside box, honoring facing.
// orientation 'horizontal' (default): box is wide, bow right for facing 1,
// left for -1. 'vertical': box is tall, bow UP for both ships; facing
// mirrors the lateral axis instead, so 'me' (facing 1) has its spine on the
// left and 'them' (facing -1) has its spine on the right. This matches what
// drawSilhouette produces by rotating the horizontal drawing by -facing*90deg.
export function shipPoint(u, v, box, facing, orientation = 'horizontal') {
  if (orientation === 'vertical') {
    const vv = facing === -1 ? -v : v;
    return { x: box.x + box.w * (0.5 + vv * 0.5), y: box.y + box.h * (1 - u) };
  }
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

// Canvas point at the center of a room. Used to spawn debris.
// The trailing orientation argument is optional and defaults to horizontal.
export function piecePoint(piece, box, facing, orientation = 'horizontal', design = 'tachi') {
  useArt(design);
  const def = A.rooms[piece];
  const c = def ? def.center : [0.5, 0];
  return shipPoint(c[0], c[1], box, facing, orientation);
}

// --- damage decoration, cached per room in ship-local space ------------------

const decoCache = new Map();

// Cracks: jagged polylines from near the center outward. Chunks: triangular
// bites out of the main shape's corners. Ember: a point inside the room.
function decoration(name) {
  const key = A.id + ':' + name;
  let d = decoCache.get(key);
  if (d) return d;
  const def = A.rooms[name];
  const seed = strSeed(key);
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
  decoCache.set(key, d);
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

// --- room details (windows, ports, nozzle...) --------------------------------

function drawDetails(ctx, name, ship, box, facing, lit, t) {
  const P = (u, v) => shipPoint(u, v, box, facing);
  const s = box.h; // scale unit
  const D = A.deco;
  ctx.lineWidth = 1;
  if (name === 'bridge') {
    // three window slits near the forward face
    for (let i = -1; i <= 1; i++) {
      const a = P(D.bridgeWindows[0], i * 0.09), b = P(D.bridgeWindows[1], i * 0.09);
      ctx.strokeStyle = lit ? 'rgba(220,240,255,0.9)' : 'rgba(60,70,80,0.6)';
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  } else if (name === 'sensors') {
    // a forward antenna whisker and the dish's feed dot
    const a = P(D.sensorWhisker[0][0], D.sensorWhisker[0][1]), b = P(D.sensorWhisker[1][0], D.sensorWhisker[1][1]);
    ctx.strokeStyle = lit ? 'rgba(200,220,240,0.7)' : 'rgba(50,58,68,0.6)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (lit) {
      const blink = 0.4 + 0.6 * (hash01(Math.floor(t * 2)) > 0.5 ? 1 : 0.3);
      const d = P(D.sensorDot[0], D.sensorDot[1]);
      ctx.fillStyle = `rgba(143,208,255,${blink})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, Math.max(1, s * 0.015), 0, Math.PI * 2); ctx.fill();
    }
  } else if (name === 'crew') {
    // a row of portholes
    for (const u of D.portholes) {
      const c = P(u, D.portholeV);
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(1, s * 0.022), 0, Math.PI * 2);
      ctx.fillStyle = lit ? 'rgba(255,230,190,0.75)' : 'rgba(30,34,40,0.8)'; ctx.fill();
    }
  } else if (name === 'tubes') {
    // round ports
    for (const [u, v] of D.tubePorts) {
      const c = P(u, v);
      ctx.beginPath(); ctx.arc(c.x, c.y, s * D.portR, 0, Math.PI * 2);
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
    const n = P(D.nozzleU, 0);
    ctx.beginPath(); ctx.ellipse(n.x, n.y, s * 0.02, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#0d1119' : '#07080b'; ctx.fill();
    if (lit) {
      const pulse = 0.55 + 0.15 * Math.sin(t * 9 + 1);
      const g = P(D.nozzleU - 0.04, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, s * 0.22);
      grad.addColorStop(0, `rgba(190,225,255,${0.55 * pulse})`);
      grad.addColorStop(0.4, `rgba(120,180,255,${0.25 * pulse})`);
      grad.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, s * 0.22, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // thrust plume: only while the drive is actually accelerating, so a
      // ship with no plume reads as coasting or stationary
      const thrust = Math.abs(ship.thrust || 0);
      if (thrust > 0.05) drawPlume(ctx, P, thrust, t, D.nozzleU);
    }
  } else if (name === 'pdc') {
    // hinge line on each dome
    for (const [u0, u1, v] of D.pdcHinges) {
      const a = P(u0, v), b = P(u1, v);
      ctx.strokeStyle = lit ? 'rgba(170,190,210,0.5)' : 'rgba(45,52,60,0.6)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  } else if (name === 'rail' && D.railGroove) {
    // rail groove along the barrel
    const a = P(D.railGroove[0], D.railGroove[2]), b = P(D.railGroove[1], D.railGroove[2]);
    ctx.strokeStyle = lit ? 'rgba(20,24,30,0.9)' : 'rgba(10,12,16,0.9)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

// Blue-white Epstein plume out of the drive cone, along -u. Length scales
// with |thrust| (up to about a fifth of the ship length) and flickers on a
// hashed 30 Hz clock, so it is deterministic and freezes when time does.
function drawPlume(ctx, P, thrust, t, nu) {
  const flick = 0.78 + 0.22 * hash01(Math.floor(t * 30));
  const len = (0.05 + 0.17 * thrust) * flick;
  const n = P(nu, 0), tip = P(nu - len, 0);
  const a = P(nu, -0.15), b = P(nu, 0.15);
  const a2 = P(nu, -0.06), b2 = P(nu, 0.06), tip2 = P(nu - len * 0.65, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(n.x, n.y, tip.x, tip.y);
  g.addColorStop(0, `rgba(170,210,255,${0.7 * flick})`);
  g.addColorStop(0.5, `rgba(110,160,255,${0.35 * flick})`);
  g.addColorStop(1, 'rgba(80,130,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b.x, b.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(235,245,255,${0.75 * flick})`;
  ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(tip2.x, tip2.y); ctx.lineTo(b2.x, b2.y); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Which rooms glow as "active" from ship state alone. fx.active can add.
function isActive(name, ship, fxActive) {
  if (fxActive && fxActive[name]) return true;
  if (name === 'rail') return ship.railAim >= 0 || ship.railCharge <= 0;
  if (name === 'sensors') return ship.railAim >= 0;
  if (name === 'tubes') return ship.torps > 0 && ship.torpReload === 0;
  if (name === 'drive') return true;
  return false;
}

// --- the room -------------------------------------------------------------------

function drawRoom(ctx, name, ship, box, facing, fx, t) {
  const def = A.rooms[name];
  const pc = ship.pieces && ship.pieces[name];
  const alive = pc ? !!pc.alive : true;
  const maxHp = pc && pc.maxHp > 0 ? pc.maxHp : N.ROOM_HP;
  const hpFrac = pc ? clamp01(pc.hp / maxHp) : 1;
  const s = box.h;
  const deco = decoration(name);
  const body = def.shapes[0];

  if (alive) {
    // body: lost hp is dark steel, the rest lit steel, filled from the stern
    // end of the room toward the bow like a gauge
    tracePoly(ctx, body, box, facing);
    ctx.fillStyle = COLORS.steelLost;
    ctx.fill();
    if (hpFrac > 0) {
      const [u0, u1] = def.span;
      const uf = u0 + (u1 - u0) * hpFrac;
      ctx.save();
      tracePoly(ctx, body, box, facing);
      ctx.clip();
      tracePoly(ctx, [[u0 - 0.01, -1], [uf, -1], [uf, 1], [u0 - 0.01, 1]], box, facing);
      ctx.fillStyle = COLORS.steelLight;
      ctx.fill();
      if (hpFrac < 1) {
        // the gauge edge: a thin bright line where the lit steel stops
        const a = shipPoint(uf, -1, box, facing), b = shipPoint(uf, 1, box, facing);
        ctx.strokeStyle = 'rgba(219,234,254,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }
    // plated rooms wear a thick bright edge
    const plated = !!(ship.armor && ship.armor[name]);
    ctx.lineWidth = plated ? Math.max(2, s * 0.045) : 1;
    ctx.strokeStyle = plated ? COLORS.edgeBright : COLORS.edge;
    tracePoly(ctx, body, box, facing);
    ctx.stroke();
    // fittings: always lit steel
    for (let i = 1; i < def.shapes.length; i++) {
      tracePoly(ctx, def.shapes[i], box, facing);
      ctx.fillStyle = COLORS.steelLight;
      ctx.fill();
      ctx.strokeStyle = COLORS.edge;
      ctx.stroke();
    }
    // bright spine highlight on the body
    const a = shipPoint(body[0][0], body[0][1], box, facing), b = shipPoint(body[1][0], body[1][1], box, facing);
    ctx.strokeStyle = 'rgba(219,234,254,0.35)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    drawDetails(ctx, name, ship, box, facing, true, t);

    // damage: cracks once below half
    if (hpFrac < 0.5) {
      ctx.save();
      ctx.strokeStyle = COLORS.crack;
      ctx.lineWidth = Math.max(1, s * 0.012);
      const n = hpFrac < 0.25 ? 2 : 1;
      for (let i = 0; i < n; i++) strokePolyline(ctx, deco.cracks[i], box, facing);
      ctx.restore();
    }

    // active glow: a soft outline in the room's working color
    if (isActive(name, ship, fx.active)) {
      const aiming = (name === 'rail' || name === 'sensors') && ship.railAim >= 0;
      const pulse = aiming ? 0.6 + 0.4 * Math.sin(t * 14) : 0.7 + 0.3 * Math.sin(t * 3 + deco.phase);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = s * 0.08;
      ctx.shadowColor = aiming ? COLORS.warn : COLORS.glowCool;
      ctx.strokeStyle = aiming ? `rgba(255,80,80,${0.5 * pulse})` : `rgba(143,208,255,${0.28 * pulse})`;
      ctx.lineWidth = 1.2;
      tracePoly(ctx, body, box, facing);
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

// --- exposure: which end the enemy sees -------------------------------------------

// A chevron: apex at ship-local (u, v), pointing along ship-local (du, dv),
// arms `size` px long. Built in canvas space so it is symmetric whatever
// the box aspect and orientation.
function traceChevron(ctx, u, v, du, dv, size, box, facing) {
  const a = shipPoint(u, v, box, facing);
  const b = shipPoint(u + du * 0.01, v + dv * 0.01, box, facing);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const l = { x: a.x - Math.cos(ang - 0.75) * size, y: a.y - Math.sin(ang - 0.75) * size };
  const r = { x: a.x - Math.cos(ang + 0.75) * size, y: a.y - Math.sin(ang + 0.75) * size };
  ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(a.x, a.y); ctx.lineTo(r.x, r.y);
}

function drawExposure(ctx, ship, box, facing, fx, t) {
  if (!ship.face) return;
  const e = exposure(ship);
  const turning = ship.turnLeft > 0;
  const pulse = turning ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 9)) : 1;
  const s = box.h;

  // line of fire: the first alive room from the exposed end gets a red edge
  if (e !== 'side') {
    const order = ship.roomOrder || A.bowToStern;
    const living = order.filter((r) => A.rooms[r] && roomAlive(ship, r));
    const first = e === 'bow' ? living[0] : living[living.length - 1];
    if (first) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = s * 0.06;
      ctx.shadowColor = COLORS.warn;
      ctx.strokeStyle = 'rgba(255,70,70,0.55)';
      ctx.lineWidth = 1.2;
      tracePoly(ctx, A.rooms[first].shapes[0], box, facing);
      ctx.stroke();
      ctx.restore();
    }
  }

  // chevrons, pointing into the hull from where the fire comes
  const chevrons = [];
  const L = A.landmarks;
  if (e === 'bow') chevrons.push([L.chevronBow[0], L.chevronBow[1], -1, 0]);
  else if (e === 'tail') chevrons.push([L.chevronTail[0], L.chevronTail[1], 1, 0]);
  else {
    chevrons.push([L.chevronSideA[0], L.chevronSideA[1], 0, -1]);
    chevrons.push([L.chevronSideB[0], L.chevronSideB[1], 0, -1]);
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [u, v, du, dv] of chevrons) {
    traceChevron(ctx, u, v, du, dv, s * 0.16, box, facing);
    ctx.strokeStyle = `rgba(6,8,15,${0.8 * pulse})`;
    ctx.lineWidth = Math.max(3, s * 0.06);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = s * 0.08;
    ctx.shadowColor = turning ? COLORS.glowAmber : COLORS.glowCool;
    ctx.strokeStyle = turning ? `rgba(255,200,120,${0.95 * pulse})` : `rgba(219,234,254,${0.9 * pulse})`;
    ctx.lineWidth = Math.max(1.5, s * 0.028);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// --- public: the silhouette ---------------------------------------------------

// fx = { flash: {room: 0..1}, t: seconds for pulsing (optional),
//        warn: 0..1 red outline (optional), active: {room: bool} (optional),
//        bg: background color for bitten chunks (optional),
//        orientation: 'horizontal' (default) | 'vertical' (tall box, bow up),
//        exposure: false to hide the chevrons and the line-of-fire edge (default shown) }
export function drawSilhouette(ctx, ship, box, fx = {}) {
  useArt(ship.design);
  const facing = ship.facing === -1 ? -1 : 1;
  if (fx.orientation === 'vertical') {
    // Rotate the horizontal drawing: -90deg for facing 1, +90deg for facing -1.
    // Both put the bow up; the sign keeps each ship's spine on its own side.
    // shipPoint(..., 'vertical') is the closed form of this same transform.
    ctx.save();
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate(-facing * Math.PI / 2);
    drawHorizontal(ctx, ship, { x: -box.h / 2, y: -box.w / 2, w: box.h, h: box.w }, fx, facing);
    ctx.restore();
    return;
  }
  drawHorizontal(ctx, ship, box, fx, facing);
}

function drawHorizontal(ctx, ship, box, fx, facing) {
  const t = fx.t || 0;
  const bridgeAlive = roomAlive(ship, 'bridge');
  ctx.save();
  ctx.lineJoin = 'round';

  // hull base: a vertical steel gradient, darker when the ship is beaten.
  // It shows through the seams between rooms as the bulkheads. Torn rooms are not part of it.
  let hull = A.hull;
  if (A.drawOrder.some((n) => isTorn(ship, n))) {
    let lo = 1, hi = 0;
    for (const n of A.drawOrder) if (!isTorn(ship, n)) { lo = Math.min(lo, A.rooms[n].span[0]); hi = Math.max(hi, A.rooms[n].span[1]); }
    hull = segment(Math.max(0.04, lo), Math.min(1.0, hi));
  }
  tracePoly(ctx, hull, box, facing);
  const grad = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  grad.addColorStop(0, bridgeAlive ? '#1c2129' : '#14181e');
  grad.addColorStop(0.45, bridgeAlive ? COLORS.steelDark : '#1d232b');
  grad.addColorStop(1, bridgeAlive ? '#1c2129' : '#14181e');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = bridgeAlive ? 'rgba(168,188,205,0.7)' : 'rgba(80,90,100,0.6)';
  ctx.stroke();

  for (const name of A.drawOrder) {
    if (!isTorn(ship, name)) { drawRoom(ctx, name, ship, box, facing, fx, t); continue; }
    // torn: drawn past the end it broke from, turned a little, as a piece of wreck
    const def = A.rooms[name];
    const aft = def.center[0] < bridgeU();
    const c = shipPoint(def.center[0], def.center[1], box, facing);
    ctx.save();
    ctx.translate((aft ? -1 : 1) * facing * TEAR_GAP * box.w, 0);
    ctx.translate(c.x, c.y); ctx.rotate((aft ? -1 : 1) * facing * TEAR_TILT); ctx.translate(-c.x, -c.y);
    drawRoom(ctx, name, ship, box, facing, fx, t);
    ctx.restore();
  }

  // seams: a dark line at each room boundary, across the whole hull. A bulkhead (spill does
  // not cross) is a thick seam with a bright core. No seam for a torn room.
  for (const name of A.drawOrder) {
    const u = A.rooms[name].span[0]; // the boundary aft of this room
    if (u <= 0.04 || isTorn(ship, name)) continue;
    const bulk = !!(ship.bulkheadAft && ship.bulkheadAft[name]);
    const a = shipPoint(u, -halfH(u), box, facing), b = shipPoint(u, halfH(u), box, facing);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, box.h * (bulk ? 0.05 : 0.012));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (bulk) {
      ctx.strokeStyle = 'rgba(168,188,205,0.7)';
      ctx.lineWidth = Math.max(1, box.h * 0.014);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  if (fx.exposure !== false) drawExposure(ctx, ship, box, facing, fx, t);

  // red warning outline: a railgun is aiming at this ship
  if (fx.warn > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = box.h * 0.12;
    ctx.shadowColor = COLORS.warn;
    ctx.strokeStyle = `rgba(255,60,60,${clamp01(fx.warn)})`;
    ctx.lineWidth = 1.5 + fx.warn;
    tracePoly(ctx, hull, box, facing);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// --- public: the top-down mark for the tactical map ---------------------------

// Draws a small top-down ship, length `scale` px, nose pointing along
// `angle` (radians, canvas convention: 0 = +x, PI/2 = down). The caller
// turns the mark to show the ship's facing. Uses ctx.fillStyle as the ship
// color (caller sets it). Dead rooms are dark bands along the hull; dim when
// more than half the rooms are dead.
export function drawShipMark(ctx, ship, x, y, scale, angle) {
  useArt(ship.design);
  const s = scale;
  const pieces = ship.pieces || {};
  const order = ship.roomOrder || A.bowToStern;
  let dead = 0;
  for (const k in pieces) if (!pieces[k].alive) dead++;
  const total = Object.keys(pieces).length || order.length;
  const dim = dead > total / 2;
  const color = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : COLORS.edge;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha *= dim ? 0.45 : 1;
  ctx.lineJoin = 'round';
  // hull
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(0.5 * s, 0);
    ctx.lineTo(0.22 * s, -0.16 * s);
    ctx.lineTo(-0.34 * s, -0.16 * s);
    ctx.lineTo(-0.5 * s, -0.09 * s);
    ctx.lineTo(-0.5 * s, 0.09 * s);
    ctx.lineTo(-0.34 * s, 0.16 * s);
    ctx.lineTo(0.22 * s, 0.16 * s);
    ctx.closePath();
  };
  hull();
  ctx.fillStyle = color;
  ctx.fill();
  // dead rooms: dark bands from the bow back, clipped to the hull
  if (dead > 0) {
    ctx.save();
    hull();
    ctx.clip();
    ctx.fillStyle = COLORS.dead;
    const n = order.length || 1;
    for (let i = 0; i < n; i++) {
      const pc = pieces[order[i]];
      if (!pc || pc.alive) continue;
      const x1 = 0.5 * s - (i / n) * s, x0 = 0.5 * s - ((i + 1) / n) * s;
      ctx.fillRect(x0, -0.2 * s, x1 - x0, 0.4 * s);
    }
    ctx.restore();
  }
  hull();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // PDC deck: one dot per turret, alternating sides, dark when the deck is dead
  const pdcAlive = !pieces.pdc || pieces.pdc.alive;
  const turrets = (ship.turrets && ship.turrets.pdc) || 2;
  for (let i = 0; i < turrets; i++) {
    const vy = (i % 2 ? 0.24 : -0.24), vx = -0.04 + Math.floor(i / 2) * 0.2;
    ctx.beginPath(); ctx.arc(vx * s, vy * s, 0.08 * s, 0, Math.PI * 2);
    ctx.fillStyle = pdcAlive ? color : COLORS.dead; ctx.fill();
  }
  // rail: a thin line out past the bow, on ships that carry one
  if (pieces.rail && pieces.rail.alive) {
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

// --- public: tap-a-room ---------------------------------------------------------

// Canvas point -> ship-local (u, v); the inverse of shipPoint.
function localPoint(x, y, box, facing, orientation) {
  if (orientation === 'vertical') {
    const vv = ((x - box.x) / box.w) * 2 - 1;
    return { u: 1 - (y - box.y) / box.h, v: facing === -1 ? -vv : vv };
  }
  const uu = (x - box.x) / box.w;
  return { u: facing === -1 ? 1 - uu : uu, v: ((y - box.y) / box.h) * 2 - 1 };
}

// The room under a canvas point, or null when the point is clearly off the hull.
// Generous across the hull (a thumb is wide); along the hull a little past each end.
export function roomAtPoint(x, y, box, facing, orientation = 'horizontal', design = 'tachi') {
  useArt(design);
  const { u, v } = localPoint(x, y, box, facing, orientation);
  if (u < -0.15 || u > 1.15 || Math.abs(v) > 1.6) return null;
  const uu = Math.max(A.rooms.drive.span[0] + 1e-6, Math.min(1 - 1e-6, u));
  for (const name of A.bowToStern) {
    const [a, b] = A.rooms[name].span;
    if (uu >= a && uu <= b) return name;
  }
  return null;
}

// A bracket around a room: four corner ticks just outside the hull, in `color`.
// The room one side's weapons are going for.
export function drawRoomBracket(ctx, room, box, facing, orientation = 'horizontal', color = '#ffffff', t = 0, design = 'tachi') {
  useArt(design);
  const def = A.rooms[room];
  if (!def) return;
  const [u0, u1] = def.span;
  const uA = u0 - 0.012, uB = u1 + 0.012;
  const vv = Math.max(halfH(u0), halfH(u1)) + 0.34; // outside the turret bumps and the mast
  const du = (uB - uA) * 0.3, dv = 0.2;
  const P = (u, v) => shipPoint(u, v, box, facing, orientation);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 5);
  ctx.lineWidth = 2;
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [u, su] of [[uA, 1], [uB, -1]]) {
    for (const [v, sv] of [[-vv, 1], [vv, -1]]) {
      const c = P(u, v), a = P(u + su * du, v), b = P(u, v + sv * dv);
      ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(b.x, b.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}
