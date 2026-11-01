// The cutaway dock: both hulls side by side under the world stage (ARCHITECTURE.md "Close-up: world
// stage + cutaway dock"). Mine on the left, bow right; theirs on the right, bow left (the form
// mirrored). NOT to scale, no distances: only the local consequence of a hit (the cell, the penetration,
// the spill, sparks, scars, room death, tear), the muzzle flashes on the shooter's own hull, the plume,
// side chevrons for where fire comes from, and the brackets: the room I am targeting on their hull and the
// room I am inspecting on mine. Reads battle and events, never writes. Own particles (makeFx), bolts,
// scars and smoulder. No Math.random: the fx hash a counter, so a replay looks the same.
import { shotFrom, alive } from '../sim/ship.js';
import { T, roomKey } from '../text.js';
import { drawForm, roomAtPoint, roomBounds } from './form.js';
import { makeFx, fit } from './canvas.js';

// Visual-only knobs. Not game numbers.
const V = {
  MARGIN: 12,        // px from the canvas edge to the outer end of a hull
  GAP: 40,           // px between the two bows (the dock is short and wide: spend the height on cells)
  CELL_MAX: 16,      // px: a small form (Belter) does not blow up past this
  LABEL_H: 16,       // px kept free along the top for the ship names and the CUTAWAY label
  VPAD: 7,           // px above and below a hull: chevrons and plume need a little air
  PAD: 10,           // px outside the hull where a shot enters
  LABEL_FONT: '11px "SF Mono", Menlo, Consolas, monospace',
  INSPECT_TTL: 5.5,  // s my inspect bracket stays
  PULSE: 0.15,       // s the target bracket flares when the target changes
  SLACK: 6,          // px around a hull box that still counts for roomAt
  PUNCH: 6,          // cells a slug keeps going after the first hit
  MAX_DT: 0.1,       // clamp a long frame
  DRIFT: 3,          // cut cells drift this many times further than on the panels, to read at this size
  BOLTS: 90,         // cap on streaks alive: keeps a phone smooth
  SCARS: 40, SMOULDER: 14, CHAR_MAX: 0.75,
};
const C = {
  white: [255, 255, 255], hot: [255, 230, 200], fire: [255, 154, 60], ember: [255, 110, 30], pdc: [255, 220, 130],
  me: [191, 227, 255], them: [255, 160, 80], rail: [170, 215, 255], steel: [90, 100, 112],
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash01(n) {
  let x = (Math.imul(n | 0, 0x9E3779B1) + 0x7F4A7C15) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85EBCA77);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE3D);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const other = (id) => (id === 'me' ? 'them' : 'me');
const BRACKET = { dark: 'rgba(5,7,12,0.9)', inspect: 'rgb(235,248,255)', plate: 'rgba(5,7,12,0.85)', dim: 'rgba(142,161,181,0.9)' };
const isFrame = (room) => room.startsWith('frame:');
const tint = (id) => (id === 'me' ? C.me : C.them);

// The living (else all) cells of a room: [{x, y, live}].
function roomCells(ship, room) {
  const out = [];
  for (let y = 0; y < ship.form.h; y++) for (let x = 0; x < ship.form.w; x++) {
    const c = ship.cells[y][x];
    if (c && c.room === room) out.push({ x, y, live: !c.cut && ship.pieces[room].alive });
  }
  const live = out.filter((c) => c.live);
  return live.length ? live : out;
}
// The cell of a room a shot from `from` meets first: the most exposed one, nearest the keel / middle.
function pickCell(ship, room, from) {
  const cs = roomCells(ship, room), my = (ship.form.h - 1) / 2, mx = (ship.form.w - 1) / 2;
  if (!cs.length) return [Math.floor(mx), Math.floor(my)];
  const score = (c) => (from === 'bow' ? c.x * 10 - Math.abs(c.y - my) : from === 'stern' ? -c.x * 10 - Math.abs(c.y - my)
    : from === 'top' ? -c.y * 10 - Math.abs(c.x - mx) : c.y * 10 - Math.abs(c.x - mx));
  let best = cs[0];
  for (const c of cs) if (score(c) > score(best)) best = c;
  return [best.x, best.y];
}

export function makeCloseup(canvas) {
  const ctx = canvas.getContext('2d');
  const fx = makeFx((ax, ay) => ({ x: ax, y: ay }));
  let W = 0, H = 0, time = 0, cur = null;
  let bolts = [], scars = [], smoulder = [], breaks = [], later = [], charMap = new Map();
  let inspect = null, inspectTtl = 0, lastTarget = null, pulse = 0;
  const flash = { me: {}, them: {} };       // room -> 0..1, like the panels
  const bump = (sid, room, v) => { flash[sid][room] = Math.max(flash[sid][room] || 0, v); };

  // --- the stage ---------------------------------------------------------------------
  // Boxes are horizontal, bow right, in unmirrored form space; 'them' is mirrored when drawn.
  function boxes(battle) {
    const a = battle.shipById('me'), b = battle.shipById('them');
    const slot = (W - 2 * V.MARGIN - V.GAP) / 2;
    const availH = Math.max(10, H - V.LABEL_H - 2 * V.VPAD);
    const cell = Math.max(2, Math.min(V.CELL_MAX, slot / a.form.w, slot / b.form.w, availH / Math.max(a.form.h, b.form.h)));
    const mk = (ship, left) => {
      const w = cell * ship.form.w, h = cell * ship.form.h;
      return { x: left ? W / 2 - V.GAP / 2 - w : W / 2 + V.GAP / 2, y: Math.round(V.LABEL_H + V.VPAD + (availH - h) / 2), w, h, cell, horizontal: true, bow: left ? 1 : -1, mirror: !left };
    };
    return { me: mk(a, true), them: mk(b, false) };
  }
  let B = null;
  // Canvas px of a point in form space (x along the hull, y across it, in cells; cell (i, j) centre is i + .5, j + .5).
  const toPx = (sid, fx_, fy_) => { const b = B[sid]; return { x: b.mirror ? b.x + b.w - fx_ * b.cell : b.x + fx_ * b.cell, y: b.y + fy_ * b.cell }; };
  const cellCenter = (sid, x, y) => toPx(sid, x + 0.5, y + 0.5);
  const bowEdge = (sid) => (B[sid].bow > 0 ? B[sid].x + B[sid].w : B[sid].x);
  const sternEdge = (sid) => (B[sid].bow > 0 ? B[sid].x : B[sid].x + B[sid].w);

  // The path of a shot from `from` into a cell: entry point outside the hull, the cell, the exit a few cells on.
  function ray(sid, from, cell) {
    const b = B[sid], c = cellCenter(sid, cell[0], cell[1]);
    let d, entry, run;
    if (from === 'top') { d = { x: 0, y: 1 }; entry = { x: c.x, y: b.y - V.PAD }; run = b.y + b.h - c.y; }
    else if (from === 'bottom') { d = { x: 0, y: -1 }; entry = { x: c.x, y: b.y + b.h + V.PAD }; run = c.y - b.y; }
    else if (from === 'bow') { d = { x: -b.bow, y: 0 }; entry = { x: bowEdge(sid) + b.bow * V.PAD, y: c.y }; run = Math.abs(sternEdge(sid) - c.x); }
    else { d = { x: b.bow, y: 0 }; entry = { x: sternEdge(sid) - b.bow * V.PAD, y: c.y }; run = Math.abs(bowEdge(sid) - c.x); }
    const len = Math.min(V.PUNCH * b.cell, run + b.cell * 0.5);
    return { c, d, entry, exit: { x: c.x + d.x * len, y: c.y + d.y * len }, ang: Math.atan2(d.y, d.x) };
  }
  // Where a shooter's weapon sits: its rail muzzle (bow-most rail cell), a PDC mount, the tube bays.
  function muzzle(battle, sid) {
    const ship = battle.shipById(sid), cs = roomCells(ship, 'rail');
    if (!cs.length) return { x: bowEdge(sid), y: B[sid].y + B[sid].h / 2 };
    const c = cs.reduce((a, q) => (q.x > a.x ? q : a), cs[0]);
    return cellCenter(sid, c.x, c.y);
  }
  const tubePoint = (battle, sid) => {
    const cs = roomCells(battle.shipById(sid), 'tubes');
    if (!cs.length) return { x: bowEdge(sid), y: B[sid].y + B[sid].h / 2 };
    const c = cs.reduce((a, q) => (q.x > a.x ? q : a), cs[0]);
    return cellCenter(sid, c.x, c.y);
  };

  // --- bolts: a bright head running along a path, trail behind, callbacks on the way ----
  function bolt(pts, o) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    if (bolts.length >= V.BOLTS) bolts.shift();
    bolts.push({ pts, cum, total: cum[cum.length - 1], pos: 0, speed: o.speed || 1500, trail: o.trail || 60, width: o.width || 2, col: o.col || C.white, hits: o.hits || [], dot: o.dot });
  }
  function pointAt(b, s) {
    s = clamp(s, 0, b.total);
    let i = 1;
    while (i < b.cum.length - 1 && b.cum[i] < s) i++;
    const seg = b.cum[i] - b.cum[i - 1] || 1, k = (s - b.cum[i - 1]) / seg;
    return { x: b.pts[i - 1].x + (b.pts[i].x - b.pts[i - 1].x) * k, y: b.pts[i - 1].y + (b.pts[i].y - b.pts[i - 1].y) * k };
  }
  function stepBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.pos += b.speed * dt;
      for (const h of b.hits) if (!h.done && b.pos >= h.s) { h.done = true; h.fn(); }
      if (b.pos >= b.total + b.trail) bolts.splice(i, 1);
    }
  }
  function drawBolts() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of bolts) {
      const head = Math.min(b.pos, b.total), tail = Math.max(0, b.pos - b.trail);
      if (tail >= head) continue;
      const path = [pointAt(b, tail)];
      for (let i = 1; i < b.cum.length - 1; i++) if (b.cum[i] > tail && b.cum[i] < head) path.push(b.pts[i]);
      path.push(pointAt(b, head));
      const fade = b.pos > b.total ? 1 - (b.pos - b.total) / b.trail : 1;
      const stroke = (w, col, a) => {
        ctx.strokeStyle = rgba(col, a); ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      };
      stroke(b.width * 3.2, b.col, 0.28 * fade);
      stroke(b.width, C.white, 0.95 * fade);
      if (b.pos <= b.total) {
        const h = path[path.length - 1], r = b.width * (b.dot || 2.4);
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, rgba(b.col, 0.5)); g.addColorStop(1, rgba(b.col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- scars, soot, smoulder ---------------------------------------------------------
  const scar = (p, r, life, col) => { if (scars.length >= V.SCARS) scars.shift(); scars.push({ x: p.x, y: p.y, r, ttl: life, life, col }); };
  const soot = (sid, cell, v) => { const k = sid + ':' + cell[0] + ',' + cell[1]; charMap.set(k, Math.min(V.CHAR_MAX, (charMap.get(k) || 0) + v)); };
  const sootCenter = (k) => { const [sid, xy] = k.split(':'), [x, y] = xy.split(',').map(Number); return { sid, p: cellCenter(sid, x, y) }; };
  const A = (p) => ({ ax: p.x, ay: p.y });
  const scale = () => B.me.cell / 13; // effect sizes are tuned at 13 px cells
  const after = (delay, fn) => later.push({ t: delay, fn });

  // --- the impacts -------------------------------------------------------------------
  function torpBlast(sid, p, ang, k) {
    const a = A(p);
    fx.flash(a, { r: 26 * k, grow: 46 * k, life: 0.5, col: C.white, col2: C.fire });
    fx.flash(a, { r: 50 * k, life: 0.4, col: C.fire, col2: [120, 40, 10], core: 0 });
    fx.ring(a, { r0: 3, vr: 200 * k, life: 0.5, width: 3.5 * k, col: C.hot });
    fx.ring(a, { r0: 2, vr: 100 * k, life: 0.85, width: 1.6, col: C.fire });
    fx.debris(a, 16, { dir: ang, spread: 3.2, speedMin: 40 * k, speedMax: 200 * k, sizeMin: 1.5 * k, sizeMax: 4 * k });
    fx.sparks(a, 20, { dir: ang + Math.PI, spread: 2.2, speedMin: 90 * k, speedMax: 300 * k, lifeMin: 0.2, lifeMax: 0.55, size: 1.5, col: C.hot });
    fx.embers(a, 10, {}); fx.smoke(a, 5, {});
    scar(p, 17 * k, 3.5, C.ember);
    fx.shakeIt(5 * k, 0.35); fx.whiteFlash(0.12);
  }
  function railBlast(sid, p, ang, k) {
    const a = A(p);
    fx.flash(a, { r: 30 * k, grow: 36 * k, life: 0.4, col: C.white, col2: C.rail });
    fx.ring(a, { r0: 2, vr: 380 * k, life: 0.3, width: 2.5, col: C.white });
    fx.sparks(a, 24, { dir: ang, spread: 0.7, speedMin: 200 * k, speedMax: 520 * k, lifeMin: 0.15, lifeMax: 0.45, size: 1.6, col: C.hot });
    fx.sparks(a, 10, { dir: ang + Math.PI, spread: 1.2, speedMin: 80 * k, speedMax: 220 * k, col: C.rail });
    fx.debris(a, 12, { dir: ang, spread: 1.4, speedMin: 60 * k, speedMax: 260 * k, sizeMin: 1.5 * k, sizeMax: 3.5 * k });
    fx.smoke(a, 3, {});
    scar(p, 13 * k, 2.5, C.fire);
    fx.shakeIt(9 * k, 0.45); fx.whiteFlash(0.2);
  }
  function spillBlast(sid, cell, k) {
    const p = cellCenter(sid, cell[0], cell[1]), a = A(p);
    fx.flash(a, { r: 14 * k, grow: 18 * k, life: 0.3, col: C.hot, col2: C.fire });
    fx.sparks(a, 8, { speedMin: 50 * k, speedMax: 150 * k, lifeMin: 0.15, lifeMax: 0.35, size: 1.2, col: C.fire });
    fx.smoke(a, 2, {});
    scar(p, 9 * k, 1.6, C.ember); soot(sid, cell, 0.3);
  }

  // The cell a hit lands on: the sim's `at`, else the exposed cell of the room.
  const hitCell = (ev, victim, from) => (ev.at && ev.at.length === 2 ? ev.at : pickCell(victim, ev.piece, from));
  const spillCell = (ev, victim, cell) => {
    const cs = roomCells(victim, ev.spill);
    if (!cs.length) return null;
    const c = cs.reduce((a, q) => (Math.hypot(q.x - cell[0], q.y - cell[1]) < Math.hypot(a.x - cell[0], a.y - cell[1]) ? q : a), cs[0]);
    return [c.x, c.y];
  };

  function onTorpHit(ev) {
    const v = battle_().shipById(ev.ship), sid = ev.ship, by = other(sid), s = battle_().shipById(by), k = scale();
    const from = shotFrom(v, s.x, s.y), cell = hitCell(ev, v, from), r = ray(sid, from, cell);
    bolt([r.entry, r.c], { speed: 450, trail: 22, width: 2.4, col: tint(by), dot: 3.2, hits: [{ s: Math.hypot(r.c.x - r.entry.x, r.c.y - r.entry.y), fn: () => {
      torpBlast(sid, r.c, r.ang, k); bump(sid, ev.piece, 1); soot(sid, cell, 0.5);
      if (ev.spill) { const sc = spillCell(ev, v, cell); if (sc) after(0.1, () => { spillBlast(sid, sc, k); bump(sid, ev.spill, 0.6); }); }
    } }] });
  }
  function onRailHit(ev) {
    const bt = battle_(), v = bt.shipById(ev.ship), sid = ev.ship, by = other(sid), s = bt.shipById(by), k = scale();
    const from = shotFrom(v, s.x, s.y), cell = hitCell(ev, v, from), r = ray(sid, from, cell);
    const l2 = Math.hypot(r.c.x - r.entry.x, r.c.y - r.entry.y), l3 = l2 + Math.hypot(r.exit.x - r.c.x, r.exit.y - r.c.y);
    bolt([r.entry, r.c, r.exit], { speed: 1100, trail: 70, width: 3, col: C.rail, dot: 3, hits: [
      { s: l2, fn: () => {
        railBlast(sid, r.c, r.ang, k); bump(sid, ev.piece, 1); soot(sid, cell, 0.4);
        // the hot line the slug cut through the hull
        fx.streak(A({ x: (r.c.x + r.exit.x) / 2, y: (r.c.y + r.exit.y) / 2 }), { dx: r.d.x, dy: r.d.y, len: Math.hypot(r.exit.x - r.c.x, r.exit.y - r.c.y), life: 0.5, width: 2.5, col: C.hot });
        if (ev.spill) { const sc = spillCell(ev, v, cell); if (sc) after(0.1, () => { spillBlast(sid, sc, k); bump(sid, ev.spill, 0.6); }); }
      } },
      { s: l3, fn: () => { // out the far side
        fx.flash(A(r.exit), { r: 14 * k, life: 0.25, col: C.white, col2: C.rail });
        fx.sparks(A(r.exit), 10, { dir: r.ang, spread: 0.6, speedMin: 150 * k, speedMax: 380 * k, lifeMin: 0.12, lifeMax: 0.3, col: C.hot });
      } },
    ] });
  }
  function onRailFire(ev) {
    const bt = battle_(), k = scale(), m = muzzle(bt, ev.by), bow = B[ev.by].bow;
    fx.flash(A(m), { r: 24 * k, grow: 30 * k, life: 0.25, col: C.white, col2: C.rail });
    fx.sparks(A(m), 12, { dir: bow > 0 ? 0 : Math.PI, spread: 0.5, speedMin: 200 * k, speedMax: 450 * k, lifeMin: 0.1, lifeMax: 0.25, col: C.rail });
    bump(ev.by, 'rail', 0.6); fx.shakeIt(1.5 * k, 0.15);
  }
  function onTorpLaunch(ev) {
    const bt = battle_(), k = scale(), m = tubePoint(bt, ev.by), bow = B[ev.by].bow;
    fx.flash(A(m), { r: 12 * k, grow: 14 * k, life: 0.28, col: C.white, col2: C.fire });
    fx.sparks(A(m), 7, { dir: bow > 0 ? 0 : Math.PI, spread: 0.8, speedMin: 60 * k, speedMax: 160 * k, lifeMin: 0.15, lifeMax: 0.35 });
    fx.smoke(A(m), 3, {});
    bump(ev.by, 'tubes', 0.5);
  }
  function onPdcHit(ev) {
    const bt = battle_(), v = bt.shipById(ev.ship), sid = ev.ship, s = bt.shipById(other(sid)), k = scale();
    const from = shotFrom(v, s.x, s.y), cell = hitCell(ev, v, from), r = ray(sid, from, cell);
    bump(sid, ev.piece, 0.35); soot(sid, cell, 0.07);
    fx.sparks(A(r.c), 3, { dir: r.ang + Math.PI, spread: 1.6, speedMin: 50 * k, speedMax: 150 * k, lifeMin: 0.12, lifeMax: 0.3, size: 1.2, col: C.pdc });
    scar(r.c, 5 * k, 0.5, C.fire);
  }
  function onPieceDead(ev) {
    const bt = battle_(), v = bt.shipById(ev.ship), sid = ev.ship, k = scale();
    const cs = roomCells(v, ev.piece);
    if (!cs.length) return;
    bump(sid, ev.piece, 0.8);
    if (isFrame(ev.piece)) { // frame dies often and quietly: a few cells flash, chips fly
      for (const c of cs.slice(0, 3)) {
        const p = cellCenter(sid, c.x, c.y);
        fx.flash(A(p), { r: 9 * k, life: 0.25, col: C.hot, col2: C.fire });
        fx.debris(A(p), 2, { speedMin: 30 * k, speedMax: 90 * k });
      }
      return;
    }
    let cx = 0, cy = 0;
    cs.forEach((c, i) => {
      const p = cellCenter(sid, c.x, c.y); cx += p.x; cy += p.y;
      if (i >= 14) return;
      after(0.04 * (i % 5), () => {
        fx.flash(A(p), { r: 13 * k, grow: 14 * k, life: 0.35, col: C.white, col2: C.fire });
        fx.debris(A(p), 3, { speedMin: 40 * k, speedMax: 160 * k, sizeMin: 1.5 * k, sizeMax: 3.5 * k });
        fx.sparks(A(p), 3, { speedMin: 60 * k, speedMax: 200 * k });
      });
    });
    const mid = { x: cx / cs.length, y: cy / cs.length }, a = A(mid);
    fx.flash(a, { r: 30 * k, grow: 40 * k, life: 0.5, col: C.white, col2: C.fire });
    fx.ring(a, { r0: 2, vr: 160 * k, life: 0.55, width: 2.5, col: C.fire });
    fx.embers(a, 10, {}); fx.smoke(a, 5, {});
    fx.shakeIt(4 * k, 0.3); fx.whiteFlash(0.1);
    if (smoulder.length >= V.SMOULDER) smoulder.shift();
    smoulder.push({ sid, room: ev.piece, ttl: 4, life: 4, ph: hash01(smoulder.length + cs.length) * 6 });
  }
  function onTear(ev) {
    const bt = battle_(), v = bt.shipById(ev.ship), sid = ev.ship, k = scale(), b = B[sid];
    let edge = null;
    for (let y = 0; y < v.form.h; y++) for (let x = 0; x < v.form.w; x++) {
      const c = v.cells[y][x];
      if (!c || !ev.pieces.includes(c.room)) continue;
      edge = edge === null ? (ev.end === 'bow' ? x : x + 1) : (ev.end === 'bow' ? Math.min(edge, x) : Math.max(edge, x + 1));
    }
    if (edge === null) return;
    const p0 = toPx(sid, edge, 0), p1 = toPx(sid, edge, v.form.h);
    breaks.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, ttl: 0.6, life: 0.6 });
    // the section goes: which canvas way is toward its end
    const towardBow = b.bow, away = ev.end === 'bow' ? towardBow : -towardBow;
    const ang = away > 0 ? 0 : Math.PI;
    for (let i = 0; i <= 6; i++) {
      const p = { x: p0.x + (p1.x - p0.x) * (i / 6), y: p0.y + (p1.y - p0.y) * (i / 6) };
      fx.sparks(A(p), 3, { dir: ang, spread: 1.4, speedMin: 60 * k, speedMax: 200 * k, lifeMin: 0.2, lifeMax: 0.5, col: C.white });
    }
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    fx.flash(A(mid), { r: 36 * k, grow: 40 * k, life: 0.5, col: C.white, col2: C.fire });
    fx.debris(A(mid), 18, { dir: ang, spread: 1.6, speedMin: 30 * k, speedMax: 140 * k, lifeMin: 1.2, lifeMax: 2.6, sizeMin: 2 * k, sizeMax: 5 * k });
    fx.smoke(A(mid), 8, {});
    fx.shakeIt(10 * k, 0.55); fx.whiteFlash(0.15);
  }

  // --- drawing -----------------------------------------------------------------------
  const stars = [];
  for (let i = 0; i < 70; i++) stars.push({ x: hash01(i * 3 + 1), y: hash01(i * 3 + 2), b: 0.25 + 0.6 * hash01(i * 3 + 3), ph: hash01(i + 99) * 6.28 });

  function chevron(ax, ay, dx, dy, size) {
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ax - Math.cos(ang - 0.75) * size, ay - Math.sin(ang - 0.75) * size);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax - Math.cos(ang + 0.75) * size, ay - Math.sin(ang + 0.75) * size);
  }
  // Where the fire on this ship comes from: chevrons pointing into the hull on that side, kept inside the canvas.
  function drawChevrons(sid, from) {
    const b = B[sid], size = clamp(b.cell * 0.55, 4, 8), marks = [];
    const midY = b.y + b.h / 2, ex = size + 1, ey = size * 0.75 + 1;
    if (from === 'bow') marks.push([bowEdge(sid) + b.bow * 5, midY, -b.bow, 0]);
    else if (from === 'stern') marks.push([sternEdge(sid) - b.bow * 5, midY, b.bow, 0]);
    else for (const f of [0.3, 0.7]) marks.push([b.x + b.w * f, from === 'top' ? b.y - 5 : b.y + b.h + 5, 0, from === 'top' ? 1 : -1]);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [ax, ay, dx, dy] of marks) {
      chevron(clamp(ax, ex, W - ex), clamp(ay, ey, H - ey), dx, dy, size);
      ctx.strokeStyle = 'rgba(6,8,15,0.8)'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(219,234,254,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.restore();
  }
  // The drive's plume out of the stern while it pushes.
  function drawPlume(ship, sid) {
    const drive = ship.pieces.drive, thrust = Math.abs(ship.thrust || 0);
    if (!drive || !drive.alive || thrust < 0.05) return;
    const cs = roomCells(ship, 'drive').filter((c) => c.live);
    if (!cs.length) return;
    const b = B[sid], minX = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y)), y1 = Math.max(...cs.map((c) => c.y)) + 1;
    const o = toPx(sid, minX, (y0 + y1) / 2), hw = Math.max(2, (y1 - y0) * b.cell * 0.4), away = -b.bow;
    const flick = 0.78 + 0.22 * hash01(Math.floor(time * 30)), len = (b.cell * 1.2 + b.cell * 4 * thrust) * flick;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(o.x, 0, o.x + away * len, 0);
    g.addColorStop(0, `rgba(170,210,255,${0.7 * flick})`); g.addColorStop(0.5, `rgba(110,160,255,${0.35 * flick})`); g.addColorStop(1, 'rgba(80,130,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(o.x, o.y - hw); ctx.lineTo(o.x + away * len, o.y); ctx.lineTo(o.x, o.y + hw); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(235,245,255,${0.75 * flick})`;
    ctx.beginPath(); ctx.moveTo(o.x, o.y - hw * 0.4); ctx.lineTo(o.x + away * len * 0.6, o.y); ctx.lineTo(o.x, o.y + hw * 0.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // --- brackets ------------------------------------------------------------------------
  // The room name as a label: PDC mounts read "PDC 3", everything else its T.pieces name.
  const roomName = (room) => (/^pdc\d+$/.test(room) ? 'PDC ' + room.slice(3) : (T.pieces[roomKey(room)] || room).toUpperCase());
  const hullPoint = (sid, x) => (B[sid].mirror ? 2 * (B[sid].x + B[sid].w / 2) - x : x);

  // The bracket shape (four corner ticks, as form.js roomBracket) with a dark under-stroke, in hull space:
  // call inside the hull's mirror transform. `flare` 0..1 widens and brightens it.
  function bracketShape(bb, col, flare) {
    const g = 2.5 + 1.5 * flare, x0 = bb.x - g, y0 = bb.y - g, x1 = bb.x + bb.w + g, y1 = bb.y + bb.h + g;
    const tick = Math.max(4, Math.min(bb.w, bb.h) * 0.4);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      for (const [x, sx] of [[x0, 1], [x1, -1]]) for (const [y, sy] of [[y0, 1], [y1, -1]]) {
        ctx.moveTo(x + sx * tick, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * tick);
      }
    };
    path(); ctx.strokeStyle = BRACKET.dark; ctx.lineWidth = 3.5 + 1.5 * flare; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 1.8 + 1.2 * flare; ctx.shadowColor = col; ctx.shadowBlur = 4 + 6 * flare; ctx.stroke();
    ctx.restore();
  }
  // The label on a dark backplate, centred on a screen x, above the bracket if it fits, else below, else clamped in.
  function bracketLabel(text, col, cx, top, bottom) {
    ctx.save();
    ctx.font = V.LABEL_FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const tw = ctx.measureText(text).width, bw = tw + 10, bh = 15;
    const x = clamp(cx - bw / 2, 1, Math.max(1, W - bw - 1));
    let y = top - 2 - bh;
    if (y < 1) y = bottom + 2;
    y = clamp(y, 1, Math.max(1, H - bh - 1));
    ctx.fillStyle = BRACKET.plate; ctx.fillRect(x, y, bw, bh);
    ctx.globalAlpha = 0.5; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.fillText(text, x + 5, y + bh / 2 + 0.5);
    ctx.restore();
  }
  function drawBracket(battle, sid, room, col, label, flare) {
    const ship = battle.shipById(sid), b = B[sid], bb = roomBounds(ship, room, b);
    if (!bb) return;
    ctx.save();
    if (b.mirror) { ctx.translate(b.x + b.w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(b.x + b.w / 2), 0); }
    bracketShape(bb, col, flare);
    ctx.restore();
    const x0 = hullPoint(sid, bb.x), x1 = hullPoint(sid, bb.x + bb.w);
    bracketLabel(label, col, (x0 + x1) / 2, bb.y - 4, bb.y + bb.h + 4);
  }
  function drawBrackets(battle) {
    const me = battle.shipById('me'), them = battle.shipById('them');
    const tgt = me.target && alive(them, me.target) ? me.target : null;
    if (tgt !== lastTarget) { if (tgt) pulse = V.PULSE; lastTarget = tgt; }
    if (tgt) drawBracket(battle, 'them', tgt, rgba(C.them, 1), 'TARGET · ' + roomName(tgt), clamp(pulse / V.PULSE, 0, 1));
    if (inspect && inspectTtl > 0 && me.pieces[inspect]) drawBracket(battle, 'me', inspect, BRACKET.inspect, 'INSPECT · ' + roomName(inspect), 0);
  }

  let battleRef = null;
  const battle_ = () => battleRef;
  function layout() { W = canvas.clientWidth || W; H = canvas.clientHeight || H; if (battleRef && W && H) B = boxes(battleRef); }

  function draw(battle, dtReal) {
    const size = fit(canvas, ctx);
    if (!size) return; // hidden: skipped
    if (battle !== battleRef) reset(battle);
    W = size.w; H = size.h;
    B = boxes(battle);
    const dt = clamp(dtReal || 0, 0, V.MAX_DT);
    time += dt;

    // timers
    for (const id of ['me', 'them']) for (const r in flash[id]) if (flash[id][r] > 0) flash[id][r] = Math.max(0, flash[id][r] - dt * 3.5);
    for (let i = later.length - 1; i >= 0; i--) { later[i].t -= dt; if (later[i].t <= 0) later.splice(i, 1)[0].fn(); }
    for (let i = scars.length - 1; i >= 0; i--) { scars[i].ttl -= dt; if (scars[i].ttl <= 0) scars.splice(i, 1); }
    for (let i = smoulder.length - 1; i >= 0; i--) { smoulder[i].ttl -= dt; if (smoulder[i].ttl <= 0) smoulder.splice(i, 1); }
    for (let i = breaks.length - 1; i >= 0; i--) { breaks[i].ttl -= dt; if (breaks[i].ttl <= 0) breaks.splice(i, 1); }
    if (pulse > 0) pulse = Math.max(0, pulse - dt);
    if (inspectTtl > 0) { inspectTtl -= dt; if (inspectTtl <= 0) inspect = null; }
    stepBolts(dt);
    fx.step(dt);

    // background: black, a cool haze, a few stars
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);
    const hz = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    hz.addColorStop(0, 'rgba(60,90,130,0.13)'); hz.addColorStop(1, 'rgba(60,90,130,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.fillStyle = `rgba(200,215,240,${s.b * (0.7 + 0.3 * Math.sin(time * 1.5 + s.ph))})`;
      ctx.fillRect(Math.round(s.x * W), Math.round(s.y * H), 1, 1);
    }

    const so = fx.shakeOffset(time);
    ctx.save();
    ctx.translate(so.x, so.y);
    for (const sid of ['me', 'them']) {
      const ship = battle.shipById(sid), foe = battle.shipById(other(sid)), b = B[sid];
      const warnP = foe.railAim >= 0 && foe.pieces.rail.alive ? clamp(foe.railAim / 3, 0, 1) : 0;
      const warn = warnP > 0 ? (0.35 + 0.65 * warnP) * (0.6 + 0.4 * Math.sin(time * (6 + 14 * warnP))) : 0;
      drawPlume(ship, sid);
      ctx.save();
      if (b.mirror) { ctx.translate(b.x + b.w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(b.x + b.w / 2), 0); }
      drawForm(ctx, ship, b, { flash: flash[sid], t: time, warn, exposure: false, driftScale: V.DRIFT });
      ctx.restore();
      drawChevrons(sid, shotFrom(ship, foe.x, foe.y));
    }
    // soot on the hit cells
    for (const [k, v] of charMap) {
      const { p } = sootCenter(k), r = B.me.cell * 0.4;
      ctx.fillStyle = `rgba(14,8,5,${v})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // smoulder on dead rooms
    for (const e of smoulder) {
      const ship = battle.shipById(e.sid), kk = e.ttl / e.life, pulseK = 0.7 + 0.3 * Math.sin(time * 5 + e.ph);
      for (const c of roomCells(ship, e.room).slice(0, 12)) {
        const p = cellCenter(e.sid, c.x, c.y), r = B.me.cell * 0.9;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,140,50,${0.4 * kk * pulseK})`); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
      }
    }
    // scars: glow that lingers where a blast landed
    for (const s of scars) {
      const kk = s.ttl / s.life, g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, rgba(s.col, 0.55 * kk)); g.addColorStop(1, rgba(s.col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    // the tear line
    ctx.lineCap = 'round';
    for (const e of breaks) {
      const kk = e.ttl / e.life;
      ctx.strokeStyle = rgba(C.fire, 0.4 * kk); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
      ctx.strokeStyle = rgba(C.white, kk); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
    }
    ctx.restore();
    fx.draw(ctx);
    drawBolts();
    ctx.restore();
    const wa = fx.white();
    if (wa > 0) { ctx.fillStyle = `rgba(255,240,225,${wa})`; ctx.fillRect(0, 0, W, H); }

    // labels along the top, then the brackets last so they read over flashes (they shake with the hulls)
    ctx.save();
    ctx.font = V.LABEL_FONT; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillStyle = rgba(C.me, 0.95);
    ctx.fillText((T.ships.me || 'me').toUpperCase(), V.MARGIN, 12);
    ctx.textAlign = 'right'; ctx.fillStyle = rgba(C.them, 0.95);
    ctx.fillText((T.ships.them || 'them').toUpperCase(), W - V.MARGIN, 12);
    ctx.textAlign = 'center'; ctx.fillStyle = BRACKET.dim;
    ctx.fillText('CUTAWAY · NOT TO SCALE', W / 2, 12);
    ctx.restore();
    ctx.save();
    ctx.translate(so.x, so.y);
    drawBrackets(battle);
    ctx.restore();
  }

  function onEvent(ev) {
    if (!battleRef) return;
    layout();
    if (!B) return;
    switch (ev.type) {
      case 'torpHit': onTorpHit(ev); break;
      case 'railHit': onRailHit(ev); break;
      case 'railFire': onRailFire(ev); break;
      case 'torpLaunch': onTorpLaunch(ev); break;
      case 'pdcHit': onPdcHit(ev); break;
      case 'pieceDead': onPieceDead(ev); break;
      case 'tear': onTear(ev); break;
      default: break; // railMiss, torpMiss, torpKilled: the world stage shows them
    }
  }

  // Start fresh on a battle (a new battle, or switching to this view): drop every effect.
  function reset(battle) {
    battleRef = battle;
    bolts = []; scars = []; smoulder = []; breaks = []; later = []; charMap = new Map();
    flash.me = {}; flash.them = {};
    inspect = null; inspectTtl = 0; pulse = 0;
    lastTarget = battle && battle.shipById('me').target && alive(battle.shipById('them'), battle.shipById('me').target) ? battle.shipById('me').target : null;
    fx.step(10); // lets every live particle of the old fx run out
    layout();
  }

  // The hull under a point (CSS px of this canvas, a few px of slack) and its job room: {side, room} or null.
  function roomAt(x, y) {
    if (!battleRef) return null;
    layout();
    if (!B) return null;
    let best = null, bd = Infinity;
    for (const side of ['me', 'them']) {
      const b = B[side];
      const d = Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
      if (d <= V.SLACK && d < bd) { bd = d; best = side; }
    }
    if (!best) return null;
    const b = B[best], ux = b.mirror ? 2 * (b.x + b.w / 2) - x : x;
    const room = roomAtPoint(battleRef.shipById(best), ux, y, b);
    return room ? { side: best, room } : null;
  }

  // Show (or with null clear) the inspect bracket on one of my rooms for a while.
  function setInspect(room) {
    inspect = room || null;
    inspectTtl = room ? V.INSPECT_TTL : 0;
  }

  return { draw, onEvent, reset, roomAt, setInspect };
}
