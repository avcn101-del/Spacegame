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
  const sides = new Set(pdcRooms(ship).filter((r) => alive(ship, r)).map((r) => mountSide(ship, r)));
  // top: stern cone, the top broadside (-y), bow cone, as one run through PI; bottom the mirror
  if (sides.has('top')) out.push({ key: 'pdc', side: 'top', km: N.PDC_RANGE, a0: Math.PI - CONE, a1: 2 * Math.PI + CONE, color: ROOM_COLORS.pdc });
  if (sides.has('bottom')) out.push({ key: 'pdc', side: 'bottom', km: N.PDC_RANGE, a0: -CONE, a1: Math.PI + CONE, color: ROOM_COLORS.pdc });
  return out;
}

// Wedges at (cx, cy), the hull turned by `rot` radians. radius(arc) gives px; fill and line are alphas.
export function drawArcs(ctx, ship, cx, cy, rot, radius, fill, line) {
  ctx.save();
  ctx.lineWidth = 1; ctx.lineJoin = 'round';
  for (const a of arcsOf(ship)) {
    const r = radius(a);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, rot + a.a0, rot + a.a1); ctx.closePath();
    ctx.fillStyle = rgb(a.color, fill); ctx.fill();
    ctx.strokeStyle = rgb(a.color, line); ctx.stroke();
  }
  ctx.restore();
}
