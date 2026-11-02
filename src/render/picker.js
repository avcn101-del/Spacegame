// The target picker: on TAC a tap on their mark opens "their layout", their cutaway grid drawn by the dock's own
// renderer (form.js: same colours, dead rooms dark, their bow left as in the dock), the current target bracketed.
// A tap on a standing room picks it (main.js sends it down the dock's order path), then the panel closes.
// Under ?hero=1 the close-up opens it from a tap on a hero window: their window as above, mine as "my layout"
// (bow right, as the dock drew mine; a tap on any job room says what it does, the dock's tapMine).
// A tap outside it, a view switch, a new battle or V.TTL seconds of real time close it with no change.
// Reads battle state, never writes it. Its own small canvas over the map, shown only while open.
import { drawForm, roomAtPoint, roomBracket } from './form.js';
import { fit } from './canvas.js';
import { T } from '../text.js';

const V = {
  CELL: 17,          // px per form cell: the dock's are about 13 px on the phone, these are easier to hit
  CELL_MIN: 9,       // px: a short screen shrinks the panel down to this, then lets it be cut
  PAD: 8,            // px round the grid
  TITLE_H: 16,       // px for the title line above the grid
  TTL: 6,            // s of real time an untouched panel stays open
  BG: 'rgba(8,12,19,0.88)', EDGE: 'rgba(255,154,74,0.45)', TITLE: 'rgba(255,170,110,0.95)', TARGET: '#ffb070',
  EDGE_ME: 'rgba(143,208,255,0.45)', TITLE_ME: 'rgba(191,227,255,0.95)', // my layout in my colour
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makePicker(canvas) {
  const ctx = canvas.getContext('2d');
  let open = false, ttl = 0, box = null, time = 0, side = 'them';

  // stage: {x, y, w, h} CSS px of the map not under the HUD; the panel is centred in it. who: 'them' or 'me'.
  function show(stage, ship, who = 'them') {
    side = who;
    const cell = clamp(Math.min((stage.w - 2 * V.PAD - 16) / ship.form.w, (stage.h - V.TITLE_H - 2 * V.PAD - 8) / ship.form.h), V.CELL_MIN, V.CELL);
    const gw = cell * ship.form.w, gh = cell * ship.form.h, w = Math.round(gw + 2 * V.PAD), h = Math.round(gh + V.TITLE_H + 2 * V.PAD);
    const s = canvas.style;
    s.left = Math.round(stage.x + (stage.w - w) / 2) + 'px'; s.top = Math.round(stage.y + (stage.h - h) / 2) + 'px';
    s.width = w + 'px'; s.height = h + 'px'; s.display = 'block';
    box = { x: V.PAD, y: V.TITLE_H + V.PAD, w: gw, h: gh, cell, horizontal: true };
    open = true; ttl = V.TTL;
  }
  function hide() { open = false; box = null; canvas.style.display = 'none'; }

  // Their ship is drawn mirrored (bow left), as in the dock: the same flip about the grid's centre.
  const mirror = () => { ctx.translate(box.x + box.w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(box.x + box.w / 2), 0); };

  function draw(battle, dtReal) {
    if (!open) return;
    ttl -= dtReal || 0; time += dtReal || 0;
    if (ttl <= 0) { hide(); return; }
    const size = fit(canvas, ctx);
    if (!size) return;
    const mine = side === 'me', ship = battle.ships[mine ? 0 : 1], me = battle.ships[0];
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = V.BG; ctx.fillRect(0, 0, size.w, size.h);
    ctx.strokeStyle = mine ? V.EDGE_ME : V.EDGE; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, size.w - 1, size.h - 1);
    ctx.font = '11px "SF Mono", Menlo, Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = mine ? V.TITLE_ME : V.TITLE; ctx.fillText(mine ? T.picker.mine : T.picker.title, V.PAD, V.PAD / 2 + V.TITLE_H / 2);
    ctx.save();
    if (!mine) mirror();
    drawForm(ctx, ship, box, { t: time, exposure: false });
    if (!mine && me.target && ship.pieces[me.target]) roomBracket(ctx, ship, me.target, box, V.TARGET, time);
    ctx.restore();
  }

  // Their standing job room under a point (CSS px of the panel), or null. Mine: any job room (what it does, its hp).
  function roomAt(battle, x, y) {
    if (!open || !box) return null;
    if (side === 'me') return roomAtPoint(battle.ships[0], x, y, box);
    const ship = battle.ships[1];
    const room = roomAtPoint(ship, 2 * (box.x + box.w / 2) - x, y, box);
    return room && ship.pieces[room] && ship.pieces[room].alive ? room : null;
  }

  return { show, hide, draw, roomAt, isOpen: () => open, side: () => side };
}
