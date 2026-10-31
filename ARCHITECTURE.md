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
src/ships/index.js    every design by id: tachi, belter; a battle names its two, a replay records them
src/ships/tachi.js    a ship as data (rooms, and the form: draft 12 as rows of letters): rooms bow to stern, bridge in the middle; kind per slot; armor (plated, double hp); turrets per PDC deck; torps stock; accel fraction
src/ships/belter.js   the Belter gunship: no rail, three turrets, 16 torpedoes, half drive, no plating, six rooms
src/ships/catalog.js  the hangar's catalog: two variants per slot kind (launcher, pdc, gun, drive); a fit picks one each; parseFit / fitString
src/sim/ship.js       rooms, the form as cells, facing, rays (shotFrom, lineOfFire), damage, the tear rule (cutOff), "is beaten" (no bridge, half the cells cut, or no weapon)
src/sim/orders.js     the orders: refusal() and apply(); 'move' carries {heading, speed}
src/input/drag.js     drag on the map -> move order; input only
src/input/tap.js      tap on a silhouette panel -> target order or room info; input only
src/sim/weapons.js    pdc, torpedo, railgun
src/sim/battle.js     makeBattle(seed): state, step(dt), phases, result
src/sim/stats.js      per-side counters fed by battle.emit()
src/sim/replay.js     exportReplay(battle), makeReplayer(replay), parseReplay(text)
src/ai/presets.js     strategy presets: the knobs of the rule table; `ship` names the design a preset flies (gunship: belter)
src/ai/enemy.js       makeEnemy(shipId, preset): decide/apply/step, same orders
tools/selfplay.mjs    20 seeds AI vs AI, determinism check
tools/arena.mjs       preset vs preset over many seeds: the balance tool
tools/replay.mjs      replay a battle JSON headless, print stats and orders
src/render/form.js    the form drawn as a grid (vertical in a panel, horizontal in the hangar): cells lit, dark, adrift; roomAtPoint for the tap
src/render/hangar.js  the hangar drawing: hardpoints with their picks over the form, slotAt for the tap
src/render/silhouette.js  Roci outline (the tactical mark and the art tables)
src/render/canvas.js  tactical strip, tracers, impacts, debris, shake
src/render/hud.js     four numbers, current order, buttons, pause, result, the hangar overlay (onFit hands the fit back; main.js keeps it in the URL `?fit=` and localStorage)
```

## State contract (what render reads)

`battle` from `makeBattle(seed, {me, them})` (each a design id or `{design, fit}`; `battle.designs` keeps both as `{design, fit}`):

- `t` seconds of game time; `phase` `'approach' | 'knife' | 'break'`;
  `result` null or `{kind: 'win'|'lose'|'escaped'|'draw', reason}`.
- `ships[0]` is `'me'` (Rocinante, facing +1, starts at negative x),
  `ships[1]` is `'them'` (Pella, facing -1). Each ship: `design` (id), `fit`,
  `accel` (fraction of ACCEL), `turrets` (room id to PDC turrets: one per mount), `salvo`, `reloadTime`, `railRange`,
  `railRecharge`, `burns` (the fitted variant's, else the stock number; the
  sim and HUD read these from the ship, never from the catalog), `x, y, vx, vy`
  in km (the fight line starts as the x axis, y is lateral), `facing`,
  `roomOrder` (bow to stern; Tachi: rail, sensors, pdc, bridge, crew, tubes,
  drive; Belter: sensors, pdc, bridge, crew, tubes, drive)
  and `pieces` map of room id to `{hp, maxHp, alive, torn?}` (`torn`: it broke
  off and drifts; frame rooms `frame:<letter><n>` included), `armor` map of room id to true
  (plated rooms); `form {w, h}`, `cells[y][x]` (null or `{room, cut}`), `frames` (see "The
  form" below); `heading` / `headingTarget` radians on the map (0 is
  +x), `turnLeft` seconds of swing left, `face` (`bow | side | tail`: what the
  enemy sees, derived every step from heading versus bearing, `BOW_CONE`);
  `move {speed, coast}`; `orders {pdc, run}`,
  `torps, torpReload, railCharge, railAim (-1 idle or seconds aiming),
  burns, thrust`; `target` is the enemy room this ship's weapons go for, or
  null (whatever the ray meets). The sim clears it when that room dies.
- The one geometry rule: a shot is a ray through the form from where it really
  comes from (`shotFrom`, `lineOfFire`, `lineOfFireAt`): along a row from the
  bow or the stern, along a column from a side. The first living cell's room
  takes the hit; `SPILL` into the next room on the ray; from frame, the part its
  hp did not absorb carries instead. PDC chews the first room of its ray; torpedo and rail
  kill the first and wound the next.
- The tear rule: when a room dies, flood from the bridge over living cells;
  cells not reached are `cut`, a room with no living cell left tears off
  (`cutOff`, `tearOff`): hp 0, not alive, `torn` true, the tubes take the
  torpedo stock with them. One `pieceDead {cause: 'tear'}` per room, then one
  `tear {ship, end: 'bow'|'stern', pieces}` per end (by mean cell x against the
  bridge), only when a room tore. Pieces may include frame ids.
- Tap-a-room: a `target` order names an enemy job room (frame is refused). A
  torpedo carries the room it was sent at (`room`); while that room is not
  `exposed` from where the torpedo is (no ray from there meets it first) it slows
  to `TORP_FLANK_SPEED`, swings out `TORP_FLANK` beside the target on its
  launch side, then turns in; on impact it takes the ray with the least cover
  to that room, and the cover takes the hit first: longer and slower inside PDC
  range, so more are shot down. PDCs chew the chosen room while a ray from
  the shooter meets it first. The railgun aims the same way (since the form;
  on the chain it ignored the tap). Torpedoes have a
  proximity fuse (`TORP_FUSE`): they go off at closest approach.
- `projectiles`: `{kind: 'torp', owner, target, x, y, vx, vy, room, side, dove}`
  and `{kind: 'slug', owner, target, x, y, tx, ty, hit, room}`.
- `tracers`: `{x1, y1, x2, y2, ttl, owner}` short-lived PDC lines.
- `events`: pushed by the sim each step, drained by `main.js` and handed
  to every renderer's `onEvent(ev)`. Types:
  `pdcHit {x,y,ship,piece}`, `torpLaunch {x,y,by,count}`,
  `torpKilled {x,y,by}`, `torpHit {x,y,ship,piece}`, `railFire {x,y,by}`,
  `railHit {x,y,ship,piece}`, `railMiss {x,y,ship}`, `burn {x,y,by,dir}`,
  `pieceDead {x,y,ship,piece,cause}` (cause `torp | rail | tear`),
  `tear {x,y,ship,end,pieces}`, `turn {x,y,by,to}`, `torpMiss {x,y,ship}`,
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
  over`. `target` takes `{room}` (null clears). Replay version 4 adds it;
  version 6 adds `ships {me, them}` design ids; version 7 makes each `{design, fit}`;
  version 8 is the form (older replays diverge).

## The form: a ship as a grid of cells (decided 2026-10-31, replaces "not the 2D grid")

A design carries a `form`: rows of letters, one letter per 5 m cell, `.` void, stern at
x 0 and bow at the right, the keel on the middle row. The Tachi form is draft 12 of the
owner's "Roci form" (28 x 9). Each letter maps to a room: the seven job rooms keep their
ids and jobs (`rail` G, `sensors` the antenna cell (10, 2), `pdc` the two turrets with
their magazines T m, `bridge` B, `crew` quarters and medbay Q D, `tubes` the two bays L,
`drive` E). Every other letter is frame: a 4-connected group of one frame letter is one
frame room (`frame:<letter><n>`), kind `frame`, hp `FRAME_HP`, no job, not targetable.
Empty hardpoints (reactors, heat sink, shield generator, cockpit, workshop, empty slots)
are frame rooms today; later rooms slot into them. Rooms still have only hp and one job:
cells are geometry, hp stays on the room. The Belter gets its own, smaller form.

What the sim exposes (render reads, never writes):

- `ship.form {w, h}` and `ship.cells[y][x]`: `null` for void, else `{room, cut}`; a cell
  is alive when its room is alive and it is not `cut`.
- `ship.pieces[room]` as before, frame rooms included; `ship.roomOrder` stays the job
  rooms bow to stern (HUD, AI, hangar, `alivePieces`, `isBeaten` are unchanged).
  `ship.frames` lists the frame room ids. `armor` keeps the catalog's plating; `bulkheadAft`
  is gone: the K columns are the bulkheads now, as frame.
- A shot is a ray along one row (from the bow or the stern) or one column (from a side).
  `face` still comes from heading versus bearing with `BOW_CONE`; the side (top or bottom
  rows) from the sign of the bearing. Unaimed: the ray is drawn uniformly from the rows or
  columns that show a living cell to the shooter. Aimed at a room (tap-a-room): among the
  rays from that direction through a living cell of that room, the one with the fewest
  living cells in front (ties by the seeded rng). The rail aims the same way as a torpedo.
  Diagonal rays are not built (NOTES).
- Resolution: the first living cell's room takes the hit; `SPILL` carries into the next
  distinct room along the ray. When the hit room is frame, what its hp did not absorb
  carries instead: frame is cover, not a wall.
  PDC Rake chews the first room of its ray, re-drawn when that room dies, as today.
  "Exposed" (torpedo flank, HUD): a room with a zero-cover ray from that direction; a
  torpedo sent at a covered room flanks to the side as today and resolves from there.
- The tear rule: after a room dies, flood from the bridge's living cells over living
  cells, 4-neighbours. Cells not reached are `cut` (holes, drawn adrift); a room with no
  living cell left tears off (`tearOff`: hp 0, `torn`, the tubes take the stock). Events
  stay `pieceDead {cause: 'tear'}` per room and `tear {end, pieces}` per end.
- Panels: `roomAt(x, y)` maps a tap to a cell, then to its job room (frame gives null).
  The panel width `--side` grows to about 100 px so a cell is about 10 x 7 px vertical.
- Replay version 8 (the form changes every hit; older replays diverge).
- PDC mounts (2026-10-31, revised the same day): six fixed PDC mounts on the hull edge of
  the Tachi, letter P, one cell each, placed by the owner: (6, 1) (13, 1) (19, 2) above the
  keel, (6, 7) (13, 7) (19, 6) below. Every mount is a PDC, always; there is no PDC pick (the
  `pdc` slot is gone from the catalog; `parseFit` ignores it in old URLs). Each mount is its
  own room `pdc1` .. `pdc6`, numbered in `form.mounts` order, kind `pdc`, hp ROOM_HP,
  unplated, one turret; it dies, tears and is targeted on its own. The Belter has four:
  (10, 1) (15, 1) above, (10, 5) (15, 5) below. `ship.form.mounts` is the list; ship.js
  exports `isPdc(room)`, `pdcRooms(ship)` (the ids) and `pdcAlive(ship)` (any alive), which
  replace every `alive(ship, 'pdc')` (hasWeapons, the noPdc refusal, the AI, the HUD).
  Fire by real direction: a mount above the keel sees a point that is `top`, `bow` or
  `stern` of the hull (`shotFrom`); below, `bottom`, `bow` or `stern` (`mountSees`). Guard
  checks each torpedo against each mount's arc (a flanker meets only the mounts on its
  side); Rake uses `pdcCount(ship, enemy)`, the living mounts that see the enemy ship:
  broadside about three, end-on all six. The old all-broadside, half-end-on rule is gone. Tap-a-room on a mount targets that mount; the AI's "go for the pdc" picks the living
  mount with the least cover from where it is. The T sponsons stay frame.
- The hangar draws the form (`hud.js`, render): `main.js` hands it `preview(fit)`, a ship
  built with `makeShip` for the current fit, and the hangar draws it with `drawForm`
  (horizontal, bow right, big cells) on its own canvas, then marks every hardpoint that has
  a pick: the rail cells (gun), the tubes cells (launcher), the drive cells (drive). The PDC
  mounts are drawn as pdc cells and have no pick. A tap on a hardpoint cycles that slot's variant
  and redraws; the pick's name and reason show under the drawing. LAUNCH and the close
  button stay. No battle buttons are added.

## Hangar labels, firing arcs, panel width (PR 32 to 34, render only)

- The sim is not touched. Render reads `ship.cells`, `ship.form.mounts`, `ship.heading`,
  `ship.railRange` (or `N.RAIL_RANGE`), `N.TORP_RANGE`, `N.PDC_RANGE`, `N.BOW_CONE`, and
  `mountSide(ship, room)` from `sim/ship.js` (render may import sim helpers read-only).
- The arcs, in the ship's own frame (bow = heading), BOW_CONE 45 degrees: rail fires only
  within the bow cone, out to the rail range; tubes fire anywhere but the tail cone, out to
  TORP_RANGE; a PDC mount fires into its own side (top = local -y, see `shotFrom`) plus the bow
  and stern cones, out to PDC_RANGE. A dead or torn weapon draws no arc.
- Hangar (PR 32): every job room has a name label (`T.pieces`); a tap on any room says what it
  does (`T.roomInfo`) in `#hg-line`; a tap on a hardpoint with a pick also opens its variant list
  as now; a tap on frame says `T.roomInfo.frame`. Hangar (PR 33): the three arcs drawn round
  the form as wedges, not to scale with range (a short legend gives the km).
- Battle (PR 33): while a move is being dragged, `drawGhost` draws my arcs at the asked
  heading, to scale (km × `cam.scale`), plus a word BOW / SIDE / TAIL and which weapons bear
  on the enemy at that heading. Not drawn when no drag is active.
- Panels (PR 34): `--side` 100 px to 130 px; the panels draw the form bigger; tactical inset
  follows the CSS variable.

## AP rounds and the close-up view (PR 37 sim, PR 38 render; parallel agents)

Sim (Opus agent; owns `src/sim/*`, `src/ships/catalog.js`, `src/numbers.js`, `src/ai/*` if needed):
- A new catalog slot `rounds` with two variants: `he` (the stock: today's Rake exactly: chews the
  first living cell's room on the ray, frame included, at `PDC_RAKE_DPS`) and `ap` (Rake pierces
  frame: it chews the first living JOB room on the ray, skipping frame cells, at `PDC_RAKE_DPS / 2`).
  `DEFAULT_FIT.rounds = 'he'`, so stock fits, old URLs and old replays (no `rounds`) behave as today:
  `node tools/arena.mjs all seeds=30` must print the same numbers before and after. Replay version
  unchanged. The ship carries `ship.rounds` ('he' | 'ap') and its rake dps; the sim reads the ship.
  With AP, a tapped room counts as reachable for Rake when it is the first non-frame living room on
  some ray from the shooter's side. Guard is unchanged.
- Hit events gain `at: [x, y]`, the grid cell where the shot met the hull (the first living cell on
  the ray), on `torpHit`, `railHit` and `pdcHit` (for AP the job room's first cell). Additive only:
  no rule or rng change.
- No new number unless needed (AP is the stock dps halved, one line of reason in catalog.js).

Render (Sonnet agent; owns new `src/render/closeup.js`, `index.html`, `style.css`, `src/main.js`,
`src/render/hud.js` for the view button only, `T.view` in `src/text.js` only; may add exports to
`form.js`/`canvas.js` without changing their behaviour):
- A view button in the top bar, `CLOSE-UP` / `TAC`. TAC is today's screen, unchanged. The close-up
  covers the tactical map and both side panels (the area between the top bar and the order line);
  the top numbers, the order line, toasts and the order buttons stay and work. Drag-to-steer is off
  in the close-up; pause works. The view only changes when the button is pressed.
- A fixed stage: my ship on the left half, bow right; theirs on the right half, bow left (mirrored);
  each form horizontal, as big as fits (Tachi about 14 px cells; a bigger form scales down). Whatever
  the real range and headings. The side chevrons show where the fire comes from (`shotFrom`).
- Impact fx on the cell (`ev.at`, else a cell of `ev.piece`), from the side the shot came from:
  torpedo: flash, shockwave, debris, and a smaller burst on the spill room; rail: a slug streak
  across the stage then a punch along the ray; PDC: tracer streams from my living mounts' cells to the
  raked cell with sparks; Guard: tracers at the torpedoes and a pop on `torpKilled`; pieceDead: the
  room's cells burst; tear: the cut cells drift away (form.js already draws cut cells adrift).
  Torpedoes in flight cross the gap between the hulls (position as a share of their real distance).
- Tap-a-room on their hull in the close-up targets it, like the panel (`closeup.roomAt(x, y)`).

## Render module contract

- `silhouette.js`: one art table per design (profile, rooms as shapes,
  draw order, landmarks, details), picked from `ship.design`.
  `drawSilhouette(ctx, ship, box, fx)` where `box` is
  `{x, y, w, h}` on the canvas and `fx` is `{flash: {piece: 0..1}}`;
  `piecePoint(piece, box, facing, orientation, design)` returns the canvas
  point of a piece; `landmark(name, design)` a named point.
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
