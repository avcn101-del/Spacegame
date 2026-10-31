// A tap on a canvas: pointer down and up without moving. Calls onTap(x, y) in CSS px
// relative to the canvas. Input only, no rules.
import { N } from '../numbers.js';

export function attachTap(canvas, onTap) {
  let start = null;
  const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); start = point(e); });
  canvas.addEventListener('pointerup', (e) => {
    if (!start) return;
    const p = point(e);
    const moved = Math.hypot(p.x - start.x, p.y - start.y);
    start = null;
    if (moved < N.DRAG_DEAD_PX) onTap(p.x, p.y);
  });
  canvas.addEventListener('pointercancel', () => { start = null; });
}
