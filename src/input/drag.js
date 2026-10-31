// Drag on the tactical map to give a move order: the drag direction is the heading the ship
// turns to, the length is the speed it flies at. Input only, no rules.
import { N } from '../numbers.js';

// Returns {heading (screen radians), speed (0..1 of MAX_SPEED), face} for a drag vector
// (dx, dy) in CSS px, given the screen direction from my ship to the enemy (ex, ey).
// face is only a hint for the ghost's color: what the enemy would see on that heading.
export function readDrag(dx, dy, ex, ey) {
  const len = Math.hypot(dx, dy);
  const speed = Math.max(0, Math.min(1, (len - N.DRAG_DEAD_PX) / (N.DRAG_FULL_PX - N.DRAG_DEAD_PX)));
  const heading = Math.atan2(dy, dx);
  const bearing = Math.atan2(ey, ex);
  const off = Math.abs(Math.atan2(Math.sin(heading - bearing), Math.cos(heading - bearing)));
  const cone = (N.BOW_CONE * Math.PI) / 180;
  const face = off <= cone ? 'bow' : off >= Math.PI - cone ? 'tail' : 'side';
  return { heading, speed, face };
}

// Attach pointer handling to the tactical canvas.
// tactical: {shipScreen, toWorld, setGhost}; getBattle(): current battle; onMove(arg): issue the order.
export function attachDrag(canvas, tactical, getBattle, onMove) {
  let start = null;
  const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const enemyDir = () => {
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
    tactical.setGhost({ sx: start.x, sy: start.y, ex: c.p.x, ey: c.p.y, heading: c.heading, face: c.face, speed: c.speed });
  });
  const finish = (e) => {
    if (!start) return;
    const c = current(e);
    start = null;
    tactical.setGhost(null);
    const len = c ? Math.hypot(c.dx, c.dy) : 0;
    if (!c || len < N.DRAG_DEAD_PX) return; // a tap, not a drag
    // A drag barely past the dead zone means stop: speed 0, nose where it is, no pointless swing.
    // Screen direction -> map direction: the camera does not rotate, so the angle carries over.
    if (len < N.DRAG_DEAD_PX * 2) { const b = getBattle(); onMove({ heading: b.ships[0].heading, speed: 0 }); return; }
    onMove({ heading: c.heading, speed: c.speed * N.MAX_SPEED });
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { start = null; tactical.setGhost(null); });
}
