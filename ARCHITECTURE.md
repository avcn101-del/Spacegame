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
src/sim/ship.js       six pieces, damage, "is beaten"
src/sim/orders.js     the six orders: refusal() and apply()
src/sim/weapons.js    pdc, torpedo, railgun
src/sim/battle.js     makeBattle(seed): state, step(dt), phases, result
src/ai/enemy.js       makeEnemy(shipId).step(battle, dt): same orders
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
  `pieces` map of `rail pdcL pdcR bridge tubes drive` to `{hp, alive}`,
  `orders {range: 'close'|'hold'|'open', pdc: 'guard'|'rake', run}`,
  `torps, torpReload, railCharge, railAim (-1 idle or seconds aiming),
  burns`.
- `projectiles`: `{kind: 'torp', owner, target, x, y, vx, vy}` and
  `{kind: 'slug', owner, target, x, y, tx, ty, hit}`.
- `tracers`: `{x1, y1, x2, y2, ttl, owner}` short-lived PDC lines.
- `events`: pushed by the sim each step, drained by `main.js` and handed
  to every renderer's `onEvent(ev)`. Types:
  `pdcHit {x,y,ship,piece}`, `torpLaunch {x,y,by,count}`,
  `torpKilled {x,y,by}`, `torpHit {x,y,ship,piece}`, `railFire {x,y,by}`,
  `railHit {x,y,ship,piece}`, `railMiss {x,y,ship}`, `burn {x,y,by,dir}`,
  `pieceDead {x,y,ship,piece,cause}`, `end {result}`.
- `battle.order(shipId, order)` returns null if accepted or a refusal key:
  `noDrive running noPdc noTubes noTorps reloading tooFar noRail charging
  aiming noBurns aimingNoBurn over`.

## Render module contract

- `silhouette.js`: `drawSilhouette(ctx, ship, box, fx)` where `box` is
  `{x, y, w, h}` on the canvas and `fx` is `{flash: {piece: 0..1}}`;
  `piecePoint(piece, box, facing)` returns the canvas point of a piece.
- `canvas.js`: `makeTactical(canvas)` and `makeSilhouettePanel(canvas,
  shipId)`, each returning `{draw(battle, dtReal), onEvent(ev)}`. They
  own their own particles, shake and flashes. They never mutate battle.
- `main.js` owns time: real dt, pause, slow-mo on `railHit` and
  `pieceDead`, and calls `battle.step(N.DT)` in fixed steps.
