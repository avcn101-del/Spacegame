// Firing arcs, in the ship's own frame (ARCHITECTURE.md "Hangar labels, firing arcs"): bow at angle 0,
// local -y (the 'top' side, row 0) at -PI/2, the canvas convention (y down, angles clockwise).
// Rail: the bow cone. Tubes: everywhere but the stern cone. A PDC mount: its own side plus both cones.
// A dead or torn weapon has no arc. Pure canvas; the caller gives the radius of each arc.
import { N } from '../numbers.js';
import { alive, pdcRooms, mountSide } from '../sim/ship.js';
import { ROOM_COLORS } from './form.js';

const CONE = (N.BOW_CONE * Math.PI) / 180;
const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const railKm = (ship) => ship.railRange || N.RAIL_RANGE;

// The live arcs: [{key: 'rail'|'tubes'|'pdc', side, km, a0, a1, color}], a0 < a1 in local radians.
export function arcsOf(ship) {
  const out = [];
  if (alive(ship, 'rail')) out.push({ key: 'rail', km: railKm(ship), a0: -CONE, a1: CONE, color: ROOM_COLORS.rail });
  if (alive(ship, 'tubes')) out.push({ key: 'tubes', km: N.TORP_RANGE, a0: -(Math.PI - CONE), a1: Math.PI - CONE, color: ROOM_COLORS.tubes });
  // PDC by sector, with the count of living mounts that see it (Guard and Rake both count them):
  // bow and stern cones see every mount, a broadside only that side's. More mounts, darker.
  const living = pdcRooms(ship).filter((r) => alive(ship, r));
  const top = living.filter((r) => mountSide(ship, r) === 'top').length, all = living.length;
  const sectors = [[-CONE, CONE, all], [CONE, Math.PI - CONE, all - top], [Math.PI - CONE, Math.PI + CONE, all], [Math.PI + CONE, 2 * Math.PI - CONE, top]];
  for (const [a0, a1, n] of sectors) if (n > 0) out.push({ key: 'pdc', n, max: pdcRooms(ship).length, km: N.PDC_RANGE, a0, a1, color: ROOM_COLORS.pdc });
  return out;
}

// Wedges at (cx, cy), the hull turned by `rot` radians. radius(arc) gives px; fill and line are alphas.
export function drawArcs(ctx, ship, cx, cy, rot, radius, fill, line) {
  ctx.save();
  ctx.lineWidth = 1; ctx.lineJoin = 'round';
  for (const a of arcsOf(ship)) {
    const r = radius(a);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, rot + a.a0, rot + a.a1); ctx.closePath();
    const k = a.n ? 0.35 + 1.3 * (a.n / a.max) : 1; // a PDC sector: darker the more mounts see it (3 of 6 about 1, 6 of 6 about 1.65)
    ctx.fillStyle = rgb(a.color, Math.min(0.6, fill * k)); ctx.fill();
    ctx.strokeStyle = rgb(a.color, line); ctx.stroke();
  }
  ctx.restore();
}

// The mount count of each PDC sector, on a dark chip at `at` of the wedge's radius. Separate from
// drawArcs so the hangar can put it over the form (its wedges sit under the hull).
export function drawPdcCounts(ctx, ship, cx, cy, rot, radius, at = 0.8) {
  ctx.save();
  ctx.font = '11px "SF Mono", Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of arcsOf(ship)) {
    const r = radius(a);
    if (!a.n || r < 26) continue;
    const m = rot + (a.a0 + a.a1) / 2, x = cx + Math.cos(m) * r * at, y = cy + Math.sin(m) * r * at;
    ctx.fillStyle = 'rgba(6,8,15,0.85)'; ctx.fillRect(x - 8, y - 7, 16, 14);
    ctx.strokeStyle = rgb(a.color, 0.7); ctx.lineWidth = 1; ctx.strokeRect(x - 7.5, y - 6.5, 15, 13);
    ctx.fillStyle = rgb(a.color, 1);
    ctx.fillText(String(a.n), x, y + 0.5);
  }
  ctx.restore();
}
