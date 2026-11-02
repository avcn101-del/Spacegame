// CINE-2D cut shots (behind `?hero=1`): which beats get a cut, one at a time, skip and toggle. The cut itself is drawn
// by the hero window of the ship that was hit (render/hero.js: the window grows to CINE.W of the screen, zooms on the
// room, the room's hull rips into pieces, its interior flashes through the hole; a tear: the section breaks off and
// drifts away). The owner, after C1 and C2 on the phone: a room blowing up in a panel of its own, away from the ship,
// does not read; the impact must be seen on the ship. Presentation only: reads events and battle, never writes them,
// owns no input (a tap anywhere skips, main.js). No Math.random: the shot's seed is a per-battle counter.
import { meanX } from '../sim/ship.js';
import { kindOf } from './hero.js';
import { ENDING } from './ending.js';

// Visual-only knobs. Not game numbers.
export const CINE = {
  TIME: 1.2,        // s (real time) a cut lasts; the beat's slow-mo is 0.6 s, so the cut outlives it a little
  GAP: 2,           // s after a cut starts in which a new room beat is dropped (a tear still cuts in)
  W: 0.45,          // share of the screen's width the hit ship's window grows to (the owner's pick)
  GROW: 0.15,       // s the window takes to grow, and SHRINK to come back
  SHRINK: 0.2,
  ZOOM: 2.6,        // the camera's push on the hit room (1 = the window as it is)
  ZOOM_TEAR: 1.5,   // a tear: less, so the section can be seen going
  ZOOM_IN: 0.25,    // s to push in, ZOOM_OUT to pull back at the end
  ZOOM_OUT: 0.3,
};

// shows(side): whether that ship has a window in the view on show (TAC has mine only); a beat it cannot show is not
// taken, so it never holds back the next one for nothing.
// time: s a cut lasts (CINE.TIME; heropop gives a little more, the window first shows the whole ship).
export function makeCine(shows = () => true, time = CINE.TIME) {
  let on = true, shot = null, lastStart = -1e9, clock = 0, seq = 0;
  try { on = localStorage.getItem('cine') !== '0'; } catch (e) { /* no storage: on */ }
  const gone = { me: new Set(), them: new Set() }; // cells already shown tearing off, per ship

  function begin(s) { shot = { ...s, age: 0, s: ++seq, T: time }; lastStart = clock; }
  // The enemy's bearing in the hit ship's frame: (cells toward the bow, toward row h), as shotFrom sees it.
  function bearing(ship, foe) {
    const dx = foe.x - ship.x, dy = foe.y - ship.y, c = Math.cos(ship.heading), s = Math.sin(ship.heading);
    return [dx * c + dy * s, -dx * s + dy * c];
  }
  // what the end scene is picked from: per ship, the cause of the last hit that killed a job room on the bridge, and
  // which end tore off last
  const last = { me: {}, them: {} };
  function onEvent(ev, battle) {
    if (ev.type === 'pieceDead' && ev.piece === 'bridge' && last[ev.ship]) last[ev.ship].bridge = ev.cause;
    if (ev.type === 'tear' && last[ev.ship]) last[ev.ship].tear = ev.end;
    if (ev.type === 'tear') {
      const ship = battle.shipById(ev.ship), bx = meanX(ship, 'bridge');
      const fresh = [];
      ship.cells.forEach((row, y) => row.forEach((c, x) => {
        if (!c || gone[ev.ship].has(`${x},${y}`)) return;
        if (!(c.cut || ship.pieces[c.room].torn)) return;
        if ((x + 0.5 > bx) !== (ev.end === 'bow')) return;
        fresh.push([x, y]);
      }));
      for (const [x, y] of fresh) gone[ev.ship].add(`${x},${y}`);
      if (!on || !fresh.length || !shows(ev.ship)) return;
      if (shot && shot.kind === 'tear' && clock - lastStart < CINE.GAP) return; // one tear at a time
      begin({ kind: 'tear', side: ev.ship, end: ev.end, cells: fresh, bear: bearing(ship, battle.enemyOf(ship)) });
      return;
    }
    if (ev.type !== 'pieceDead' || ev.cause === 'tear' || String(ev.piece).startsWith('frame:')) return;
    if (!on || clock - lastStart < CINE.GAP || !shows(ev.ship)) return;
    const ship = battle.shipById(ev.ship);
    const cells = [];
    ship.cells.forEach((row, y) => row.forEach((c, x) => { if (c && c.room === ev.piece) cells.push([x, y]); }));
    if (!cells.length) return;
    begin({ kind: 'room', side: ev.ship, room: ev.piece, rk: kindOf(ship, ev.piece), cells, cause: ev.cause, bear: bearing(ship, battle.enemyOf(ship)) });
  }
  // The battle is over: a ~3 s scene before the result screen, from what happened (the owner: by the battle's events).
  // It replaces any cut playing. Win or lose: the beaten ship's window (and the winner's gunner if their PDCs shot
  // down ENDING.GUNNER torpedoes or more); escaped and draws: both windows.
  function end(battle) {
    if (!on) return;
    const r = battle.result, st = battle.stats || {}, other = (x) => (x === 'me' ? 'them' : 'me');
    const bridgeCells = (id) => { const sh = battle.shipById(id), out = []; sh.cells.forEach((row, y) => row.forEach((c, x) => { if (c && c.room === 'bridge') out.push([x, y]); })); return out; };
    const per = {};
    const add = (id, o) => { const sh = battle.shipById(id), cells = bridgeCells(id); if (cells.length) per[id] = { cells, shotBear: bearing(sh, battle.enemyOf(sh)), ...o }; };
    if (r.kind === 'win' || r.kind === 'lose') {
      const L = r.kind === 'win' ? 'them' : 'me', W = other(L), cause = last[L].bridge;
      const scene = r.reason === 'disarmed' ? 'flag' : r.reason === 'hull' ? 'halves'
        : cause === 'rail' ? 'chair' : cause === 'pdc' ? 'cheese' : 'cup';
      add(L, { scene, end: last[L].tear || 'stern' });
      if (((st[L] || {}).torpsShotDown || 0) >= ENDING.GUNNER) add(W, { scene: 'gunner' });
    } else if (r.kind === 'escaped') {
      for (const id of ['me', 'them']) add(id, { scene: 'bye', runner: r.reason === id });
    } else {
      const scene = r.reason === 'both' ? 'boom' : r.reason === 'time' ? 'sleep' : 'shrug';
      const sleeper = (battle.seed | 0) % 2 ? 'me' : 'them'; // time: on one of the two, a skeleton waits beside him
      for (const id of ['me', 'them']) add(id, { scene, bonesToo: id === sleeper });
    }
    const sides = Object.keys(per).filter(shows);
    if (!sides.length) return;
    shot = { kind: 'end', side: sides[0], sides, per, cells: per[sides[0]].cells, rk: 'core', age: 0, s: ++seq, T: ENDING.TIME };
    lastStart = clock;
  }
  function step(dtReal) {
    clock += dtReal;
    if (shot) { shot.age += dtReal; if (shot.age >= shot.T) shot = null; }
  }
  function skip() { shot = null; }
  function setOn(v) { on = v; if (!on) shot = null; try { localStorage.setItem('cine', on ? '1' : '0'); } catch (e) { /* the toggle still works this session */ } }
  function reset() { shot = null; lastStart = -1e9; seq = 0; gone.me.clear(); gone.them.clear(); last.me = {}; last.them = {}; }
  return { onEvent, end, step, skip, reset, setOn, isOn: () => on, playing: () => !!shot, current: () => shot };
}
