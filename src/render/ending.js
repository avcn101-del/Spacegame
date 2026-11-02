// The end of a battle as a CINE shot (behind `?hero=1`): about 3 s of dark comedy in the hero window(s) before the
// result screen, the scene picked from what happened (render/cine.js `end`: the result, the cause of the last bridge
// hit, the tear, the stats). Drawn by render/hero.js in the window of each ship the scene shows, in the bow-up
// picture's frame, zoomed on the bridge. Gore level (b) as the crew in the cut (render/crew.js). Presentation only.
// No Math.random: h() hashes the shot's seed.
import { glow, hash01 } from './look.js';
import { CREW, figure, screenUp, screenDir } from './crew.js';

// Visual-only knobs. Not game numbers.
export const ENDING = {
  TIME: 3,          // s the scene lasts (the owner: about 3 s, a tap skips)
  ZOOM: 2.8,        // the camera's push on the bridge (the cut's is 1.8 to 2.6): the figures are the scene
  GUNNER: 4,        // torpedoes shot down by the winner's PDCs at least, for the gunner to celebrate in his window
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const BLOOD = [150, 18, 22], BONE = [232, 226, 208];
const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2); g.fill(); };
const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
const STAND = { lL: 0.15, kL: 0, lR: -0.15, kR: 0, aL: -0.35, eL: 0, aR: 0.35, eR: 0 };
const SIT = { lL: 1.5, kL: -1.5, lR: 1.6, kR: -1.6, aL: 0.5, eL: 0.8, aR: 0.6, eR: 0.8 };

// One figure at (x, y) in the picture, turned by rot, the side's colour.
function put(g, x, y, rot, u, col, pose, look = 'suit', ex = {}) {
  g.save(); g.translate(x, y); g.rotate(rot); figure(g, u, col, pose, look, ex); g.restore();
}
// A blast: a fireball, sparks and plates flying out, smoke after. k0: when it goes (s).
function boom(g, x, y, c, a, s, k0 = 0) {
  const t = a - k0; if (t < 0) return;
  glow(g, x, y, c * (3 + 7 * clamp(t / 0.3, 0, 1)), [255, 170, 80], 1 - clamp(t / 0.8, 0, 1), true);
  for (let i = 0; i < 18; i++) {
    const an = hash01(s * 13 + i) * Math.PI * 2, sp = c * (3 + 5 * hash01(s * 17 + i)), d = sp * t * (1 - 0.15 * t), rot = t * (hash01(s + i) - 0.5) * 8;
    const px = x + Math.cos(an) * d, py = y + Math.sin(an) * d, r = c * (0.25 + 0.3 * hash01(s * 19 + i));
    g.fillStyle = css([92 + 40 * hash01(i), 104, 118], clamp(1.6 - t / 1.5, 0, 1));
    g.beginPath(); g.moveTo(px + Math.cos(rot) * r, py + Math.sin(rot) * r); g.lineTo(px + Math.cos(rot + 2.2) * r, py + Math.sin(rot + 2.2) * r); g.lineTo(px + Math.cos(rot + 4.1) * r * 0.6, py + Math.sin(rot + 4.1) * r * 0.6); g.fill();
  }
  for (let i = 0; i < 4; i++) { const ph = clamp((t - 0.3) * 0.5 + i * 0.1, 0, 1); if (t < 0.3) break;
    g.fillStyle = `rgba(70,72,78,${0.35 * (1 - ph)})`; disc(g, x + (hash01(s + 60 + i) - 0.5) * c * 3, y + (hash01(s + 70 + i) - 0.5) * c * 3, c * (1 + 2 * ph)); }
}
function splat(g, x, y, c, k, s) {
  g.fillStyle = css(BLOOD, 0.85); g.beginPath();
  for (let i = 0; i <= 12; i++) { const an = i / 12 * Math.PI * 2, r = c * k * (0.35 + 0.3 * hash01(s * 7 + (i % 12)));
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(an) * r, y + Math.sin(an) * r * 0.8); }
  g.closePath(); g.fill();
}
function bones(g, x, y, c, a, s, n = 3) {
  g.strokeStyle = css(BONE); g.lineWidth = c * 0.12; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const an = hash01(s + 80 + i) * Math.PI * 2, d = c * (1 + 2.2 * a), r = a * (4 + 3 * i);
    const bx = x + Math.cos(an) * d, by = y + Math.sin(an) * d; line(g, bx - Math.cos(r) * c * 0.3, by - Math.sin(r) * c * 0.3, bx + Math.cos(r) * c * 0.3, by + Math.sin(r) * c * 0.3); }
}
function zzz(g, x, y, up, c, a, fade) {
  g.font = `bold ${Math.max(4, c * 0.9)}px sans-serif`; g.textAlign = 'center'; g.fillStyle = css([210, 225, 255]);
  for (let i = 0; i < 3; i++) { const k = (a * 0.6 + i / 3) % 1; g.globalAlpha = fade * (1 - k);
    g.save(); g.translate(x, y); g.rotate(up); g.fillText('z', c * (0.8 + 1.2 * k), -c * (1.6 + 2.2 * k)); g.restore(); }
  g.globalAlpha = fade;
}

// The scenes. ctx: { g, a (s), c (px per cell), u (figure unit), F (the bridge in the picture), up, toward (the other
// window, a unit vector in the picture), col, s, side, P (projection), cells (the bridge's), z, ship, scene (cine's) }
const SCENES = {
  // the slug went through the bridge: the captain leaves in his chair, saluting
  chair(q) {
    const { g, a, c, u, F, up, col, s } = q, [dx, dy] = q.shotDir;
    if (a < 0.12) { const k = a / 0.12; g.strokeStyle = 'rgba(220,240,255,0.95)'; g.lineWidth = c * 0.15; line(g, F.x - dx * c * 12 * (1 - k), F.y - dy * c * 12 * (1 - k), F.x - dx * c * 12 * (1 - k) + dx * c * 4, F.y - dy * c * 12 * (1 - k) + dy * c * 4); }
    boom(g, F.x, F.y, c * 0.7, a, s, 0.1);
    const t = Math.max(0, a - 0.15), x = F.x + dx * c * 1.6 * t, y = F.y + dy * c * 1.6 * t;
    put(g, x, y, up + 0.25 * t, u, col, { ...SIT, aR: 2.0, eR: 1.68 }, 'suit', { chair: true });
  },
  // a torpedo: the bridge goes up; what is left floats out: one coffee cup, still steaming, and bones
  cup(q) {
    const { g, a, c, F, up, s } = q;
    boom(g, F.x, F.y, c, a, s);
    splat(g, F.x + c * 0.6, F.y - c * 0.3, c, clamp(a / 0.2, 0, 1), s);
    bones(g, F.x, F.y, c, a, s, 3);
    if (a > 0.6) {
      const t = a - 0.6, x = F.x + Math.sin(up) * c * 1.2 * t, y = F.y - Math.cos(up) * c * 1.2 * t;
      g.save(); g.translate(x, y); g.rotate(up + 0.15 * Math.sin(t * 2)); const k = c * 0.55;
      g.fillStyle = css([240, 240, 236]); g.fillRect(-k, -1.3 * k, 2 * k, 2.2 * k);
      g.strokeStyle = css([240, 240, 236]); g.lineWidth = k * 0.35; g.beginPath(); g.arc(1.3 * k, -0.2 * k, 0.6 * k, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.fillStyle = css([110, 66, 34]); g.fillRect(-0.8 * k, -1.3 * k, 1.6 * k, 0.4 * k);
      g.strokeStyle = 'rgba(230,230,230,0.6)'; g.lineWidth = k * 0.2;
      for (let i = 0; i < 2; i++) { g.beginPath(); for (let j = 0; j <= 6; j++) { const yy = -1.6 * k - j * 0.35 * k, xx = (i - 0.5) * 0.8 * k + Math.sin(j + a * 6 + i) * 0.3 * k; g[j ? 'lineTo' : 'moveTo'](xx, yy); } g.stroke(); }
      g.restore();
    }
  },
  // PDCs: the bridge is a colander; one of them drifts out through a hole, too tired to wave properly
  cheese(q) {
    const { g, a, c, u, F, up, col, s, P, cells, z } = q;
    cells.forEach(([x0, y0], i) => { for (let j = 0; j < 3; j++) {
      const k = i * 3 + j, at = 0.05 + 0.5 * hash01(s + k); if (a < at) continue;
      const p = P(x0 + 0.2 + 0.6 * hash01(s * 3 + k), y0 + 0.2 + 0.6 * hash01(s * 5 + k), z), r = c * (0.12 + 0.1 * hash01(s * 7 + k));
      g.fillStyle = 'rgba(4,5,8,0.95)'; disc(g, p.x, p.y, r);
      g.strokeStyle = `rgba(255,170,80,${clamp(1 - (a - at) / 1.2, 0.25, 1)})`; g.lineWidth = Math.max(0.4, c * 0.05); g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke();
      if (a - at < 0.08) glow(g, p.x, p.y, c * 0.8, [255, 220, 130], 0.9, false);
    } });
    if (a > 0.9) { const t = a - 0.9;
      put(g, F.x + Math.sin(up) * c * 0.9 * t, F.y - Math.cos(up) * c * 0.9 * t, up + 0.4 + 0.2 * t, u, col, { ...STAND, aR: 2.5 + 0.2 * Math.sin(t * 4), eR: 0.4 }); }
  },
  // disarmed, bridge alive: out on the hull, waving a white sock on a stick
  flag(q) {
    const { g, a, u, F, up, col, c } = q;
    put(g, F.x, F.y, up, u, col, { ...STAND, aR: 2.7 + 0.25 * Math.sin(a * 6), eR: 0 }, 'suit', { flag: { ang: 0, t: a } });
    if (a > 0.8) put(g, F.x - Math.cos(up) * c * 1.6, F.y - Math.sin(up) * c * 1.6, up, u, col, { ...STAND, aL: -2.8, aR: 2.8 }); // hands up
  },
  // half the hull adrift: one on the bridge waves at the half that left, one on the half waves back, getting smaller
  halves(q) {
    const { g, a, u, F, up, col, c } = q, [ex, ey] = q.endDir;
    put(g, F.x, F.y, up, u, col, { ...STAND, aR: 2.6 + 0.5 * Math.sin(a * 10), eR: 0.4 * Math.sin(a * 10) });
    const d = c * (2.2 + 1.2 * a), x = F.x + ex * d, y = F.y + ey * d, k = 1 / (1 + 0.35 * a);
    g.fillStyle = 'rgba(92,104,118,0.9)';
    for (let i = 0; i < 4; i++) { const ox = (hash01(q.s + i) - 0.5) * c * 2, oy = c * 0.6 + hash01(q.s + 9 + i) * c * 0.6; g.fillRect(x + ox * k - c * 0.5 * k, y + oy * k, c * k, c * 0.5 * k); }
    put(g, x, y, up + 0.2 * a, u * k, col, { ...STAND, aL: -2.6 - 0.5 * Math.sin(a * 10), eL: -0.4 * Math.sin(a * 10) });
  },
  // escaped: the runner waves from the stern; the one left behind shakes a fist
  bye(q) {
    const { g, a, u, up, col } = q;
    if (q.runner) put(g, q.stern.x, q.stern.y, up, u, col, { ...STAND, aR: 2.6 + 0.5 * Math.sin(a * 9), eR: 0.4 * Math.sin(a * 9) });
    else put(g, q.F.x, q.F.y, up, u, col, { ...STAND, aR: 2.9, eR: 0.3 * Math.sin(a * 22), aL: -0.8, eL: -1 }); // fist
  },
  // broke off: a shrug each
  shrug(q) {
    const { g, a, u, F, up, col } = q, k = clamp((a - 0.4) / 0.3, 0, 1) * (a < 2.4 ? 1 : clamp((2.7 - a) / 0.3, 0, 1));
    put(g, F.x, F.y - k * u, up, u, col, { ...STAND, aL: -0.35 - 0.95 * k, eL: -1.6 * k, aR: 0.35 + 0.95 * k, eR: 1.6 * k });
  },
  // time: asleep at the post; on one ship the one next to him has been waiting longer
  sleep(q) {
    const { g, a, u, F, up, col, c, fade } = q;
    put(g, F.x, F.y, up + 0.25 + 0.05 * Math.sin(a * 2), u, col, SIT);
    zzz(g, F.x, F.y, up, c, a, fade);
    if (q.bonesToo) put(g, F.x - Math.cos(up) * c * 1.9, F.y - Math.sin(up) * c * 1.9, up - 0.15, u, col, SIT, 'bones');
  },
  // both dead: each bridge goes up; one comes out of each, fists up, flying at the other
  boom(q) {
    const { g, a, u, F, col, c, s } = q, [tx, ty] = q.toward;
    boom(g, F.x, F.y, c, a, s);
    splat(g, F.x - tx * c, F.y - ty * c, c, clamp(a / 0.2, 0, 1), s);
    if (a > 0.5) { const t = a - 0.5, x = F.x + tx * c * 1.3 * t, y = F.y + ty * c * 1.3 * t, rot = Math.atan2(tx, -ty) + 0.3 * Math.sin(t * 6);
      put(g, x, y, rot, u, col, { ...STAND, aR: 2.9 + 0.4 * Math.sin(t * 18), eR: 0, aL: -2.9 - 0.4 * Math.cos(t * 18), eL: 0 }); }
  },
  // the winner's PDC gunner, if they shot down a lot of torpedoes: arms up, jumping, a burst into the air
  gunner(q) {
    const { g, a, u, F, up, col, c } = q, j = Math.abs(Math.sin(a * 7)) * c * 0.8;
    const x = F.x + Math.sin(up) * j, y = F.y - Math.cos(up) * j;
    put(g, x, y, up, u, col, { ...STAND, aL: -2.8, aR: 2.9, eR: 0, lL: 0.4, lR: -0.4 }, 'suit', { gun: { ang: -Math.PI / 2 } });
    if (Math.floor(a * 12) % 2 === 0) { const mx = x + Math.sin(up) * c * 1.4, my = y - Math.cos(up) * c * 1.4;
      g.strokeStyle = 'rgba(255,225,140,0.95)'; g.lineWidth = Math.max(0.5, c * 0.08); line(g, mx, my, mx + Math.sin(up) * c * 2, my - Math.cos(up) * c * 2); }
  },
};

// shot: cine's end shot for this side (its scene, per-side data); cut: hero.js's cut frame (cut.F: the bridge);
// info.pr: the projection. side: the window's ship.
export function drawEnd(g, shot, cut, info, ship, side) {
  const a = shot.age, c = info.pr.c, P = info.pr.P, me = shot.per[side];
  const fade = clamp((shot.T - a) / 0.3, 0, 1), up = screenUp(g);
  // the other window: mine is bottom left, theirs top right
  const toward = side === 'me' ? screenDir(g, 1, -0.6) : screenDir(g, -1, 0.6);
  const q = { g, a, c, u: CREW.H * c / 10, F: cut.F, up, toward, col: CREW.SUIT[side], s: shot.s * 31 + (side === 'me' ? 1 : 2), side, P, cells: me.cells, z: cut.z, ship, fade, ...me };
  if (me.shotBear) q.shotDir = (() => { const A = P(cut.m[0], cut.m[1], cut.z), B = P(cut.m[0] - me.shotBear[0], cut.m[1] - me.shotBear[1], cut.z), l = Math.hypot(B.x - A.x, B.y - A.y) || 1; return [(B.x - A.x) / l, (B.y - A.y) / l]; })();
  if (me.end) { const sgn = me.end === 'bow' ? 1 : -1, A = P(cut.m[0], cut.m[1], cut.z), B = P(cut.m[0] + sgn, cut.m[1], cut.z), l = Math.hypot(B.x - A.x, B.y - A.y) || 1; q.endDir = [(B.x - A.x) / l, (B.y - A.y) / l]; }
  if (me.runner) { let xs = Infinity, ys = 0; ship.cells.forEach((row, y) => row.forEach((cl, x) => { if (cl && !cl.cut && x < xs) { xs = x; ys = y; } })); q.stern = P(xs + 0.5, ys + 0.5, cut.z); }
  g.save(); g.globalAlpha = fade; g.lineCap = 'round';
  (SCENES[me.scene] || SCENES.shrug)(q);
  g.restore();
}
