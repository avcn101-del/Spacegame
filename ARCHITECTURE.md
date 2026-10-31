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
src/ships/tachi.js    a ship as data: rooms bow to stern, hp each
src/sim/ship.js       rooms, facing, exposure, line of fire, damage, "is beaten"
src/sim/orders.js     the six orders: refusal() and apply()
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
  in km (the fight line is the x axis, y is lateral), `facing`,
  `roomOrder` (bow to stern) and `pieces` map of room id to
  `{hp, maxHp, alive}`; `face` / `faceTarget` (`bow | side | tail`) and
  `turnLeft` seconds of swing; `orders {range, pdc, run}`,
  `torps, torpReload, railCharge, railAim (-1 idle or seconds aiming),
  burns, thrust`.
- The one geometry rule: a shot meets the rooms from the exposed end
  (`lineOfFire`). Bow-on: rail first. Tail-on: drive first. Broadside or
  turning: a random room, spill into its neighbour. PDC chews the first
  room; torpedo and rail kill the first and wound the next.
- `projectiles`: `{kind: 'torp', owner, target, x, y, vx, vy}` and
  `{kind: 'slug', owner, target, x, y, tx, ty, hit}`.
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
- `battle.order(shipId, order)` returns null if accepted or a refusal key:
  `noDrive running noPdc noTubes noTorps reloading tooFar noRail charging
  aiming noBurns aimingNoBurn alreadyRange alreadyPdc alreadyFacing
  tailNoTubes noSensors railNeedsBow over`.

## Render module contract

- `silhouette.js`: `drawSilhouette(ctx, ship, box, fx)` where `box` is
  `{x, y, w, h}` on the canvas and `fx` is `{flash: {piece: 0..1}}`;
  `piecePoint(piece, box, facing)` returns the canvas point of a piece.
- `canvas.js`: `makeTactical(canvas)` and `makeSilhouettePanel(canvas,
  shipId)`, each returning `{draw(battle, dtReal), onEvent(ev)}`. They
  own their own particles, shake and flashes. They never mutate battle.
- `main.js` owns time: real dt, pause, slow-mo on `railHit` and
  `pieceDead`, and calls `battle.step(N.DT)` in fixed steps.
