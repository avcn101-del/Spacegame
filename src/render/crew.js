// The crew in the CINE cut (R2, behind `?hero=1`): 1 to 3 small spacesuited figures flung out of the breach with the
// hull pieces, a dark-comedy beat per room kind (keyed like hero.js BLAST, never by ship class). Visual only: the sim
// counts no crew. Gore level (b): flat red smears, bones, empty suits; no flesh. Our own figure: a round helmet on a
// neck with a small round faceplate and an antenna, a boxy torso with a backpack, jointed arms and legs, boots.
// Mine in my colour, theirs in theirs. Drawn by render/hero.js drawCut in the bow-up picture's frame (zoomed); "up"
// is worked out from the canvas transform, so a gag that needs to stand (the coffee, the headphones) stands on screen.
// No Math.random: h() hashes the shot's seed.
import { glow, hash01 } from './look.js';

// Visual-only knobs. Not game numbers.
export const CREW = {
  H: 1.4,           // figure height in cells: about 12 to 16 css px in the heropop window (0.75 read as specks)
  SPEED: 2.6,       // cells per s a figure leaves the breach at (x0.6 to x1.4); the cut lasts 1.4 s
  START: 0.05,      // s after the impact the figures show (the flash covers the first frames)
  SUIT: { me: [191, 227, 255], them: [255, 160, 80] }, // the side colours of the map (canvas.js C.me, C.them)
  // per room kind (BLAST keys): how many, and the beat. gag: what the first one does; the others tumble out.
  KIND: {
    drive:    { n: 2, gag: 'burn' },    // burnt to a skeleton that drops
    crew:     { n: 3, gag: 'wave' },    // sucked out of the breach, one waving
    launcher: { n: 2, gag: 'suit' },    // blown off, the suit stays
    core:     { n: 3, gag: 'coffee' },  // red light, one still holding a coffee cup
    gun:      { n: 1, gag: 'zap' },     // electrocuted, hair on end
    sensors:  { n: 1, gag: 'tunes' },   // headphones on, never noticed
    pdc:      { n: 1, gag: 'burst' },   // still firing a short burst as he goes
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const BONE = [232, 226, 208], BLOOD = [150, 18, 22], DARK = [22, 26, 32], COFFEE = [110, 66, 34];
const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2); g.fill(); };

// A limb from (x, y): two segments, the first at angle a (0 = down), the second bent by b. Returns the end.
function limb(g, x, y, a, b, len) {
  const kx = x + Math.sin(a) * len * 0.5, ky = y + Math.cos(a) * len * 0.5;
  const ex = kx + Math.sin(a + b) * len * 0.5, ey = ky + Math.cos(a + b) * len * 0.5;
  g.beginPath(); g.moveTo(x, y); g.lineTo(kx, ky); g.lineTo(ex, ey); g.stroke();
  return [ex, ey];
}

// One figure in its own frame: origin at the torso, up = -y, u = a tenth of its height. pose: limb angles; look:
// 'suit' | 'char' (burnt) | 'bones' | 'empty'; extras: hair, phones, cup, gun.
function figure(g, u, col, pose, look, ex = {}) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (look === 'bones') return skeleton(g, u, pose);
  const suit = look === 'char' ? mix(col, DARK, 0.85) : look === 'empty' ? mix(col, [120, 120, 120], 0.35) : col;
  const shade = mix(suit, DARK, 0.45), glove = mix(suit, DARK, 0.6);
  // backpack, behind
  g.fillStyle = css(shade); g.fillRect(-2.3 * u, -1.6 * u, 1.1 * u, 3.4 * u);
  // legs, then arms (the far ones darker)
  g.lineWidth = 1.3 * u;
  g.strokeStyle = css(shade); limb(g, -0.8 * u, 2.2 * u, pose.lL, pose.kL, 3.6 * u);
  g.strokeStyle = css(suit); const fR = limb(g, 0.8 * u, 2.2 * u, pose.lR, pose.kR, 3.6 * u);
  g.fillStyle = css(DARK); disc(g, fR[0], fR[1], 0.75 * u);
  g.lineWidth = 1.1 * u;
  g.strokeStyle = css(shade); limb(g, -1.6 * u, -1.1 * u, pose.aL, pose.eL, 3.2 * u);
  // torso: a box with a chest panel and its light
  g.fillStyle = css(suit);
  g.beginPath(); if (g.roundRect) g.roundRect(-1.8 * u, -1.7 * u, 3.6 * u, 4.2 * u, 0.8 * u); else g.rect(-1.8 * u, -1.7 * u, 3.6 * u, 4.2 * u); g.fill();
  g.fillStyle = css(shade); g.fillRect(-0.9 * u, -0.6 * u, 1.8 * u, 1.3 * u);
  if (look === 'suit') { g.fillStyle = 'rgba(255,70,60,0.95)'; disc(g, 0.45 * u, -0.1 * u, 0.32 * u); }
  g.strokeStyle = css(suit); g.lineWidth = 1.1 * u;
  const hR = limb(g, 1.6 * u, -1.1 * u, pose.aR, pose.eR, 3.2 * u);
  g.fillStyle = css(glove); disc(g, hR[0], hR[1], 0.6 * u);
  if (ex.cup) cup(g, hR[0], hR[1], u, ex.cup);
  if (ex.gun) { g.fillStyle = css([60, 66, 74]); g.save(); g.translate(hR[0], hR[1]); g.rotate(ex.gun.ang); g.fillRect(-0.4 * u, -0.5 * u, 3 * u, 1 * u); g.restore(); }
  // the neck ring and the helmet: round, with a small round faceplate set to the front, and an antenna
  g.fillStyle = css(shade); g.fillRect(-0.9 * u, -2.4 * u, 1.8 * u, 0.8 * u);
  if (ex.hair) hair(g, u, ex.hair);
  g.strokeStyle = css(shade); g.lineWidth = 0.35 * u; line(g, 0.8 * u, -5.2 * u, 1.4 * u, -6.6 * u);
  if (look === 'suit') { g.fillStyle = 'rgba(255,230,120,0.95)'; disc(g, 1.4 * u, -6.6 * u, 0.35 * u); }
  g.fillStyle = css(mix(suit, [255, 255, 255], look === 'suit' ? 0.25 : 0));
  disc(g, 0, -3.8 * u, 1.9 * u);
  g.fillStyle = look === 'empty' ? 'rgba(0,0,0,0.95)' : css(DARK); disc(g, 0.55 * u, -3.7 * u, 1.05 * u);
  if (look === 'suit') { g.fillStyle = 'rgba(255,255,255,0.75)'; disc(g, 0.95 * u, -4.1 * u, 0.3 * u); }
  if (ex.phones) { // big headphones over the helmet, the band over the top
    g.strokeStyle = css([40, 40, 46]); g.lineWidth = 0.55 * u; g.beginPath(); g.arc(0, -3.8 * u, 2.25 * u, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.fillStyle = css([230, 60, 90]); disc(g, -2.1 * u, -3.4 * u, 0.75 * u); disc(g, 2.1 * u, -3.4 * u, 0.75 * u);
  }
}
function skeleton(g, u, pose) {
  g.strokeStyle = css(BONE); g.fillStyle = css(BONE);
  g.lineWidth = 0.55 * u;
  line(g, 0, -2 * u, 0, 2.2 * u); // spine
  for (let i = 0; i < 3; i++) { const y = -1.2 * u + i * 0.9 * u, w = (1.5 - i * 0.2) * u; line(g, -w, y, w, y); } // ribs
  line(g, -1 * u, 2.2 * u, 1 * u, 2.2 * u); // pelvis
  limb(g, -0.7 * u, 2.2 * u, pose.lL, pose.kL, 3.6 * u); limb(g, 0.7 * u, 2.2 * u, pose.lR, pose.kR, 3.6 * u);
  limb(g, -1.4 * u, -1.4 * u, pose.aL, pose.eL, 3 * u); limb(g, 1.4 * u, -1.4 * u, pose.aR, pose.eR, 3 * u);
  disc(g, 0, -3.6 * u, 1.45 * u); // the skull, its eyes
  g.fillStyle = css(DARK); disc(g, -0.5 * u, -3.7 * u, 0.4 * u); disc(g, 0.5 * u, -3.7 * u, 0.4 * u);
  g.fillRect(-0.5 * u, -2.7 * u, 1 * u, 0.3 * u);
}
// hair standing on end out of a cracked helmet: spikes round the top, flickering
function hair(g, u, k) {
  g.strokeStyle = css([250, 230, 140]); g.lineWidth = 0.4 * u;
  for (let i = 0; i < 9; i++) {
    const an = -Math.PI * (0.1 + 0.8 * i / 8), r0 = 1.6 * u, r1 = (3.6 + 0.9 * Math.sin(i * 7 + k * 40)) * u;
    line(g, Math.cos(an) * r0, -3.8 * u + Math.sin(an) * r0, Math.cos(an) * r1, -3.8 * u + Math.sin(an) * r1);
  }
}
// the cup, kept upright on screen (up: the angle the figure's frame must turn back by), steam or spilt drops
function cup(g, x, y, u, c) {
  g.save(); g.translate(x, y); g.rotate(c.back);
  g.fillStyle = css([240, 240, 236]); g.fillRect(-0.7 * u, -1.6 * u, 1.4 * u, 1.6 * u);
  g.strokeStyle = css([240, 240, 236]); g.lineWidth = 0.3 * u; g.beginPath(); g.arc(0.9 * u, -0.8 * u, 0.45 * u, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.fillStyle = css(COFFEE); g.fillRect(-0.55 * u, -1.6 * u, 1.1 * u, 0.35 * u);
  g.restore();
}

// Built once per cut (hero.js cutBuild): the figures, from the room's cells, where they start and how they go.
// P: the projection; F: the impact in the picture; dX, dY: the way the shot travels; c: px per cell; z: deck height.
export function crewBuild(shot, P, F, dX, dY, c, z, side) {
  const K = CREW.KIND[shot.rk];
  if (!K || shot.kind !== 'room') return null;
  const h = (i) => hash01(shot.s * 6151 + i), n = clamp(K.n, 1, 3), cells = shot.cells, out = [];
  for (let i = 0; i < n; i++) {
    const cl = cells[Math.floor(h(i) * cells.length)], p = P(cl[0] + 0.2 + 0.6 * h(i + 10), cl[1] + 0.2 + 0.6 * h(i + 20), z);
    let rx = p.x - F.x, ry = p.y - F.y; const rl = Math.hypot(rx, ry);
    if (rl < c * 0.3) { const t0 = h(i + 30) * Math.PI * 2; rx = Math.cos(t0); ry = Math.sin(t0); } else { rx /= rl; ry /= rl; }
    // out of the breach: away from the impact, along the shot, a little toward the camera; spread so they part
    const sp0 = (i - (n - 1) / 2) * 0.7;
    let vx = rx * 0.6 + dX + -dY * sp0, vy = ry * 0.6 + dY + dX * sp0 - 0.4; const vl = Math.hypot(vx, vy) || 1;
    const gag = i === 0 ? K.gag : 'tumble', slow = gag === 'tunes' ? 0.25 : gag === 'suit' ? 0.45 : 1;
    const sp = CREW.SPEED * c * (0.6 + 0.8 * h(i + 40)) * slow;
    out.push({ x: p.x, y: p.y, vx: vx / vl * sp, vy: vy / vl * sp, rot0: (h(i + 50) - 0.5) * 2, spin: (h(i + 60) - 0.5) * 7, gag, i, ph: h(i + 70) * 6 });
  }
  // gore (b): a flat red smear on the deck by the hole, for the kinds that get messy
  const smear = ['launcher', 'pdc', 'drive', 'gun'].includes(shot.rk) ? { x: F.x - dX * c * 0.4, y: F.y - dY * c * 0.4, ang: Math.atan2(dY, dX) } : null;
  return { figs: out, smear, col: CREW.SUIT[side] || CREW.SUIT.me };
}

// Drawn every frame of the cut, over the hull pieces. a: s since the impact; fade: the cut's fade out.
export function drawCrew(g, mem, a, c, fade, s) {
  if (!mem) return;
  const t = a - CREW.START;
  if (t <= 0) return;
  const u = CREW.H * c / 10, hf = (i) => hash01(s * 131 + i + Math.floor(a * 20) * 977);
  // which way is up on screen, in the picture's frame (the strips are turned a quarter round): a figure turned by
  // `up` stands on screen
  const m = g.getTransform(), det = m.a * m.d - m.b * m.c || 1, px = m.c / det, py = -m.a / det, up = Math.atan2(px, -py);
  const [dnx, dny] = [-Math.sin(up), Math.cos(up)]; // screen down, in the picture
  g.save();
  g.globalAlpha = fade;
  if (mem.smear) { // the smear: a few flat blobs stretched along the shot
    const k = clamp(t / 0.15, 0, 1);
    g.save(); g.translate(mem.smear.x, mem.smear.y); g.rotate(mem.smear.ang); g.fillStyle = css(BLOOD, 0.85);
    // a splat (an uneven blob, longer along the shot) and a few drops thrown ahead of it
    g.beginPath();
    for (let i = 0; i <= 12; i++) { const an = i / 12 * Math.PI * 2, r = c * k * (0.35 + 0.3 * hash01(s * 7 + (i % 12))) * (1 + 0.6 * Math.max(0, Math.cos(an)));
      g[i ? 'lineTo' : 'moveTo'](Math.cos(an) * r, Math.sin(an) * r * 0.75); }
    g.closePath(); g.fill();
    for (let i = 0; i < 4; i++) disc(g, c * k * (0.9 + 0.5 * i + 0.3 * hash01(s + i)), (hash01(s + 20 + i) - 0.5) * c * 0.8, c * (0.12 - 0.02 * i));
    g.restore();
  }
  for (const f of mem.figs) {
    const dr = 1 - 0.15 * t; // a little drag, so they do not leave the frame too soon
    let x = f.x + f.vx * t * dr, y = f.y + f.vy * t * dr, rot = f.rot0 + f.spin * t;
    const w = Math.sin(t * 9 + f.ph); // limb flail
    let pose = { lL: 0.3 + 0.4 * w, kL: -0.6, lR: -0.3 - 0.4 * w, kR: 0.5, aL: 2.2 + 0.8 * w, eL: 0.6, aR: -2.2 - 0.8 * w, eR: -0.6 };
    let look = 'suit'; const ex = {};
    if (f.gag === 'burn') { // the suit chars, then the bones are left; they drop (down on screen)
      look = t < 0.18 ? 'suit' : t < 0.4 ? 'char' : 'bones';
      if (t < 0.4) glow(g, x, y, c * 1.4, [170, 215, 255], 0.9 * (1 - t / 0.4), false);
      if (t >= 0.4) { const d = t - 0.4; x += dnx * c * 3 * d * d; y += dny * c * 3 * d * d; pose = { lL: 0.1, kL: 0, lR: -0.1, kR: 0, aL: 0.4, eL: 0.2, aR: -0.4, eR: -0.2 }; rot = up + 0.3 * Math.sin(t * 3); }
      else if (t >= 0.18) { g.fillStyle = 'rgba(60,62,68,0.5)'; disc(g, x - dnx * c * 0.8, y - dny * c * 0.8, c * 0.4); }
    } else if (f.gag === 'wave') { // sucked out, but polite: one arm waves goodbye, upright
      rot = up + 0.25 * Math.sin(t * 2);
      pose.aR = 2.6 + 0.5 * Math.sin(t * 16); pose.eR = 0.5 * Math.sin(t * 16);
    } else if (f.gag === 'suit') { // the body goes (a red streak and bones, fast), the empty suit drifts out limp
      look = 'empty'; pose = { lL: 0.5, kL: -1, lR: -0.2, kR: 0.9, aL: 1.2, eL: 1.2, aR: -0.6, eR: -1.1 };
      const bx = f.x + f.vx * t * 5, by = f.y + f.vy * t * 5, len = Math.min(c * 3, t * c * 12);
      const vl = Math.hypot(f.vx, f.vy) || 1;
      g.strokeStyle = css(BLOOD, 0.8); g.lineWidth = c * 0.3; g.lineCap = 'round';
      line(g, bx, by, bx - f.vx / vl * len, by - f.vy / vl * len);
      g.strokeStyle = css(BONE); g.lineWidth = c * 0.12;
      for (let i = 0; i < 3; i++) { const q = 0.6 + 0.3 * i, ox = (hash01(s + 40 + i) - 0.5) * c * 1.5, oy = (hash01(s + 50 + i) - 0.5) * c * 1.5, ang = t * (5 + i * 3);
        const cx = f.x + f.vx * t * 5 * q + ox, cy = f.y + f.vy * t * 5 * q + oy; line(g, cx - Math.cos(ang) * c * 0.3, cy - Math.sin(ang) * c * 0.3, cx + Math.cos(ang) * c * 0.3, cy + Math.sin(ang) * c * 0.3); }
      rot = f.rot0 + 1.2 * t;
    } else if (f.gag === 'coffee') { // calm, nearly upright, the cup held out level; the coffee leaves the cup anyway
      rot = up + 0.35 * Math.sin(t * 2.5); pose.aR = 1.6; pose.eR = 0.2; pose.aL = 0.6; pose.eL = 0.6;
      ex.cup = { back: up - rot };
      g.fillStyle = css(COFFEE, 0.9);
      for (let i = 0; i < 5; i++) { const k = (t * 1.5 + i / 5) % 1; disc(g, x - f.vx * 0.12 * k * 4 + (hash01(s + i) - 0.5) * c * 0.6, y - f.vy * 0.12 * k * 4 + (hash01(s + 9 + i) - 0.5) * c * 0.6, c * 0.12 * (1 - k)); }
    } else if (f.gag === 'zap') { // electrocuted: arcs, the bones flash through, hair on end
      const on = Math.floor(a * 25) % 2 === 0 && t < 0.7;
      look = on ? 'bones' : 'suit'; ex.hair = t; pose = { lL: 0.8, kL: -0.4, lR: -0.8, kR: 0.4, aL: 2.4, eL: -0.3, aR: -2.4, eR: 0.3 };
      if (t < 0.8) {
        g.strokeStyle = css([190, 230, 255], 0.9); g.lineWidth = Math.max(0.5, c * 0.07);
        for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(x, y); for (let k = 1; k <= 4; k++) g.lineTo(x + (hf(j * 9 + k) - 0.5) * c * 2.4, y + (hf(j * 9 + k + 4) - 0.5) * c * 2.4); g.stroke(); }
        glow(g, x, y, c * 1.6, [150, 210, 255], on ? 0.8 : 0.35, false);
      }
      rot = f.rot0 + 2 * t;
    } else if (f.gag === 'tunes') { // headphones on, nodding, never noticed: drifts out slowly, upright, notes
      rot = up + 0.12 * Math.sin(t * 13); ex.phones = true;
      pose = { lL: 0.7, kL: -1.4, lR: 0.5, kR: -1.3, aL: 0.9, eL: 1.2, aR: -0.9, eR: -1.2 }; // still sitting
      g.fillStyle = css([255, 240, 160], 0.95); g.font = `${Math.max(4, c * 0.8)}px sans-serif`; g.textAlign = 'center';
      for (let i = 0; i < 2; i++) { const k = (t * 1.2 + i / 2) % 1; g.globalAlpha = fade * (1 - k);
        g.save(); g.translate(x, y); g.rotate(up); g.fillText(i ? '♫' : '♪', c * (1 + i) * (i ? -1 : 1), -c * (1 + 2 * k)); g.restore(); }
      g.globalAlpha = fade;
    } else if (f.gag === 'burst') { // still on the trigger: a short burst, the recoil spins him
      const firing = t > 0.1 && t < 0.6;
      rot = f.rot0 + f.spin * 0.3 * t + (firing ? 6 * (t - 0.1) : 6 * 0.5 * (t >= 0.6 ? 1 : 0));
      pose.aR = 1.6; pose.eR = 0; ex.gun = { ang: 0 };
      if (firing) { // tracers out of the muzzle, the gun points along the arm (the figure's right, up-turned)
        const ca = Math.cos(rot), sa = Math.sin(rot), mx = x + (7.4 * u) * ca - (-1.1 * u) * sa, my = y + (7.4 * u) * sa + (-1.1 * u) * ca;
        const dx = ca, dy = sa; glow(g, mx, my, c * 0.7, [255, 220, 130], 0.9, false);
        g.strokeStyle = css([255, 225, 140], 0.95); g.lineWidth = Math.max(0.5, c * 0.08);
        for (let i = 0; i < 3; i++) { const k = ((t * 8 + i / 3) % 1) * c * 6; line(g, mx + dx * k, my + dy * k, mx + dx * (k + c * 0.9), my + dy * (k + c * 0.9)); }
      }
    }
    g.save(); g.translate(x, y); g.rotate(rot);
    figure(g, u, mem.col, pose, look, ex);
    g.restore();
  }
  g.restore();
}
