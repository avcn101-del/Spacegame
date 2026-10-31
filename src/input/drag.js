// Drag on the tactical map to give a move order: direction relative to the enemy
// picks the face (bow / side / tail), length picks the speed. Input only, no rules.
import { N } from '../numbers.js';

// Returns {face, speed (0..1 of MAX_SPEED), dir} for a drag vector (dx, dy) in CSS px,
// given the screen direction from my ship to the enemy (ex, ey).
export function readDrag(dx, dy, ex, ey) {
  const len = Math.hypot(dx, dy);
  const speed = Math.max(0, Math.min(1, (len - N.DRAG_DEAD_PX) / (N.DRAG_FULL_PX - N.DRAG_DEAD_PX)));
  const el = Math.hypot(ex, ey) || 1;
  const ux = ex / el, uy = ey / el;
  const along = (dx * ux + dy * uy) / (len || 1);      // cos of the angle to the enemy
  const across = (dx * -uy + dy * ux) / (len || 1);    // positive = clockwise on screen
  let face;
  if (along > Math.SQRT1_2) face = 'bow';
  else if (along < -Math.SQRT1_2) face = 'tail';
  else face = 'side';
  return { face, speed, dir: across >= 0 ? 1 : -1 };
}

// Attach pointer handling to the tactical canvas.
// tactical: {shipScreen, toScreen, setGhost}; getBattle(): current battle; onMove(arg): issue the order.
export function attachDrag(canvas, tactical, getBattle, onMove) {
  let start = null;
  const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const enemyDir = () => {
    const b = getBattle();
    const me = tactical.shipScreen('me'), them = tactical.shipScreen('them');
    if (!me || !them) return null;
    return { me, ex: them.x - me.x, ey: them.y - me.y };
  };
  const current = (e) => {
    const p = point(e);
    const d = enemyDir();
    if (!d) return null;
    const dx = p.x - start.x, dy = p.y - start.y;
    return { p, dx, dy, ...readDrag(dx, dy, d.ex, d.ey) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    start = point(e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!start) return;
    const c = current(e);
    if (!c) return;
    if (Math.hypot(c.dx, c.dy) < N.DRAG_DEAD_PX) { tactical.setGhost(null); return; }
    tactical.setGhost({ sx: start.x, sy: start.y, ex: c.p.x, ey: c.p.y, face: c.face, speed: c.speed, dir: c.dir });
  });
  const finish = (e) => {
    if (!start) return;
    const c = current(e);
    start = null;
    tactical.setGhost(null);
    if (!c || Math.hypot(c.dx, c.dy) < N.DRAG_DEAD_PX) return; // a tap, not a drag
    onMove({ face: c.face, speed: c.speed * N.MAX_SPEED, dir: c.dir });
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { start = null; tactical.setGhost(null); });
}
