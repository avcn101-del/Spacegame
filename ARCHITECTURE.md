# Architecture

Plain ES modules, no build. One rule: `src/sim/` and `src/ai/` never touch
the DOM or import from `src/render/`. Render reads battle state and drains
`battle.events`. This lets several people (or agents) work in parallel:
shipyard later replaces `sim/ship.js`, a smarter enemy replaces
`ai/enemy.js`, better art replaces `render/` only.

```
index.html            one page, loads src/main.js
src/main.js           game loop, active pause, slow-mo, wires modules
src/numbers.js        every tunable number, one-line reason each
src/rng.js            seeded random, the only random source
src/text.js           all player-facing English strings
src/ships/tachi.js    a ship as data: rooms bow to stern; armor (plated, double hp), bulkhead (aft wall spill does not cross)
src/sim/ship.js       rooms, facing, exposure, line of fire, damage, "is beaten"
src/sim/orders.js     the orders: refusal() and apply(); 'move' carries {heading, speed}
src/input/drag.js     drag on the map -> move order; input only
src/input/tap.js      tap on a silhouette panel -> target order or room info; input only
src/sim/weapons.js    pdc, torpedo, railgun
src/sim/battle.js     makeBattle(seed): state, step(dt), phases, result
src/sim/stats.js      per-side counters fed by battle.emit()
src/sim/replay.js     exportReplay(battle), makeReplayer(replay), parseReplay(text)
src/ai/presets.js     strategy presets: the knobs of the rule table
src/ai/enemy.js       makeEnemy(shipId, preset): decide/apply/step, same orders
tools/selfplay.mjs    20 seeds AI vs AI, determinism check
tools/arena.mjs       preset vs preset over many seeds: the balance tool
tools/replay.mjs      replay a battle JSON headless, print stats and orders
src/render/silhouette.js  Roci outline, pieces lit or dark
src/render/canvas.js  tactical strip, tracers, impacts, debris, shake
src/render/hud.js     four numbers, current order, buttons, pause, result
```

## State contract (what render reads)

`battle` from `makeBattle(seed)`:

- `t` seconds of game time; `phase` `'approach' | 'knife' | 'break'`;
  `result` null or `{kind: 'win'|'lose'|'escaped'|'draw', reason}`.
- `ships[0]` is `'me'` (Rocinante, facing +1, starts at negative x),
  `ships[1]` is `'them'` (Pella, facing -1). Each ship: `x, y, vx, vy`
  in km (the fight line starts as the x axis, y is lateral), `facing`,
  `roomOrder` (bow to stern) and `pieces` map of room id to
  `{hp, maxHp, alive}`, `armor` and `bulkheadAft` maps of room id to true
  (plated rooms; walls that stop spill, the hull's tear lines); `heading` / `headingTarget` radians on the map (0 is
  +x), `turnLeft` seconds of swing left, `face` (`bow | side | tail`: what the
  enemy sees, derived every step from heading versus bearing, `BOW_CONE`);
  `move {speed, coast}`; `orders {pdc, run}`,
  `torps, torpReload, railCharge, railAim (-1 idle or seconds aiming),
  burns, thrust`; `target` is the enemy room this ship's weapons go for, or
  null (the exposed end). The sim clears it when that room dies.
- The one geometry rule: a shot meets the rooms from the exposed end
  (`lineOfFire`). Bow-on: rail first. Tail-on: drive first. Broadside or
  turning: a random room, spill into its neighbour. PDC chews the first
  room; torpedo and rail kill the first and wound the next.
- Tap-a-room: a `target` order names an enemy room. A torpedo carries the
  room it was sent at (`room`); if that room is not the exposed end it slows
  to `TORP_FLANK_SPEED`, swings out `TORP_FLANK` beside the target on its
  launch side, then turns in and hits that room (spill into its neighbour):
  longer and slower inside PDC range, so more are shot down. Broadside, every
  room is exposed and there is no detour. PDCs chew the chosen room only when
  the enemy is broadside or turning. The railgun ignores it. Torpedoes have a
  proximity fuse (`TORP_FUSE`): they go off at closest approach.
- `projectiles`: `{kind: 'torp', owner, target, x, y, vx, vy, room, side, dove}`
  and `{kind: 'slug', owner, target, x, y, tx, ty, hit}`.
- `tracers`: `{x1, y1, x2, y2, ttl, owner}` short-lived PDC lines.
- `events`: pushed by the sim each step, drained by `main.js` and handed
  to every renderer's `onEvent(ev)`. Types:
  `pdcHit {x,y,ship,piece}`, `torpLaunch {x,y,by,count}`,
  `torpKilled {x,y,by}`, `torpHit {x,y,ship,piece}`, `railFire {x,y,by}`,
  `railHit {x,y,ship,piece}`, `railMiss {x,y,ship}`, `burn {x,y,by,dir}`,
  `pieceDead {x,y,ship,piece,cause}`, `turn {x,y,by,to}`, `torpMiss {x,y,ship}`,
  `end {result}`. `torpHit` and `railHit` carry `piece` and `spill`.
- `battle.emit(ev)` is the only way the sim publishes an event; it also feeds
  `battle.stats`. `battle.log` holds every accepted order with its exact `t`;
  seed plus log is a replay. The AI rolls its own seeded dice so a replay
  without the AI reproduces the same battle. The weapons loop alternates which
  ship goes first each step: a fixed order gave the first ship a 60/40 edge.
- `battle.order(shipId, order, arg)` returns null if accepted or a refusal key:
  `noDrive running noPdc noTubes noTorps reloading tooFar noRail charging
  aiming noBurns aimingNoBurn alreadyPdc alreadyHolding badMove
  tailNoTubes noSensors railNeedsBow badTarget roomDead sameTarget noTarget
  over`. `target` takes `{room}` (null clears). Replay version 4 adds it.

## Render module contract

- `silhouette.js`: `drawSilhouette(ctx, ship, box, fx)` where `box` is
  `{x, y, w, h}` on the canvas and `fx` is `{flash: {piece: 0..1}}`;
  `piecePoint(piece, box, facing)` returns the canvas point of a piece.
- `canvas.js`: `makeTactical(canvas, {inset})` returns `{draw, onEvent,
  toScreen, toWorld, shipScreen, setGhost}`; `makeSilhouettePanel(canvas,
  shipId, {orientation})` returns `{draw, onEvent, roomAt(x, y)}`. The panel
  draws a bracket around the room the other side is going for, in that
  side's color. They own their own particles, shake and flashes. They never
  mutate battle.
- Movement: one `move` order `{heading, speed}`: the hull swings to the
  heading (90 degrees per `FACE_TURN_TIME`, the railgun aim is lost) and the
  autopilot flies along it at `speed` relative to the enemy, matching their
  drift so a Burn or a runner can be followed; it never closes faster than
  the thrusters can stop before `RANGE_MIN`. The main drive pushes forward
  along the hull, braking and sideways thrusters at `OFF_AXIS_ACCEL`. `hold`
  cuts thrust and keeps the velocity (coast). `run` is full drive straight
  away from them. The drag input maps a finger vector to this order: the
  direction is the heading, the length the speed; a drag barely past the dead
  zone is stop.
- `main.js` owns time: real dt, pause, slow-mo on `railHit` and
  `pieceDead`, and calls `battle.step(N.DT)` in fixed steps.
