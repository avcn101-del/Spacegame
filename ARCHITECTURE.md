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
src/input/tap.js      tap on the dock -> target order or room info; input only
src/sim/weapons.js    pdc, torpedo, railgun
src/sim/battle.js     makeBattle(seed): state, step(dt), phases, result
src/sim/stats.js      per-side counters fed by battle.emit()
src/sim/replay.js     exportReplay(battle), makeReplayer(replay), parseReplay(text)
src/ai/presets.js     strategy presets: the knobs of the rule table; `ship` names the design a preset flies (gunship: belter)
src/ai/enemy.js       makeEnemy(shipId, preset): decide/apply/step, same orders
tools/selfplay.mjs    20 seeds AI vs AI, determinism check
tools/arena.mjs       preset vs preset over many seeds: the balance tool
tools/replay.mjs      replay a battle JSON headless, print stats and orders
src/render/form.js    the form drawn as a grid (horizontal in the dock and the hangar): cells lit, dark, adrift; roomAtPoint for the tap
src/render/hangar.js  the hangar drawing: hardpoints with their picks over the form, slotAt for the tap
src/render/silhouette.js  drawShipMark (the drag ghost, the small mark) and COLORS; the art tables are dead code (cleanup PR later)
src/render/canvas.js  the world stage (makeTactical: engage camera, marks, tracers, impacts) and makeFx (shared with the dock)
src/render/closeup.js the cutaway dock: both forms, local hits, threat ticks, brackets, roomAt for the tap
src/render/look.js    key light, bloom, plume, stars, vignette (G1)
src/render/hud.js     four numbers, status deck (alerts, order summary, room inspector), toasts, buttons, mode badges, help menu (HELP opens it, pause does not), result, the hangar overlay (onFit hands the fit back; main.js keeps it in the URL `?fit=` and localStorage)
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
  in the close-up; pause works. The view only changes when the button is pressed. (Replaced by the
  world stage + dock below, step E.)
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

## Close-up: world stage + cutaway dock (HUD plan step E, 2026-11-01; render and input only)

The owner: the close-up must take the same orders as TAC and show the projectiles where they really
are. The fixed stage of PR 38 is split in two, stacked, between the top bar and the status deck:

- `#closeup-wrap` (a flex column, the area the old `#closeup` had): `#cu-world` on top takes what is
  left, `#closeup` below is the dock, `height: clamp(96px, 40%, 150px)`. Phone 844 x 390: wrap 262 px,
  dock about 105, world about 157.
- World stage `#cu-world`: a second `makeTactical(canvas, {inset, camera: 'engage', quiet: true})`.
  Same drawing as TAC (marks, real headings, plume, aim lines, tracers, torpedoes, slugs, rings,
  ghost), the same `attachDrag` and the same move dispatch as TAC: one drag model, `readDrag`,
  no camera rotation. `quiet: true`: its fx never shake the screen and never white-flash
  (`shakeIt` and `whiteFlash` are no-ops there); the dock owns those beats.
  `camera: 'engage'` (TAC keeps its own camera): every frame the required points are both ships,
  every live projectile, a slug's `{tx, ty}`, and the points of `railMiss`, `torpMiss`,
  `torpKilled`, `railHit`, `torpHit` for 0.8 s of real (unpaused) time. Center = middle of their
  bounds; scale = min((rect.w - 2 pad) / max(bw, 1 km), (rect.h - 2 pad) / max(bh, 1 km)), capped by
  `MAX_SCALE` only (no `MIN_SCALE`; overridden by PR 51: the engage camera floors at `V.MIN_SCALE`, and with the floor
  active only my own ship is guaranteed in frame); pad = clamp(0.15 * min(rect.w, rect.h), 24, 48) px. Zoom out at
  once, zoom in eased (about 0.4 s); if after easing any required point is outside the rect less pad,
  snap to the target. Exposed for tests: `requiredPoints()` (km) and `safeRect()` (CSS px, rect less pad).
- Dock `#closeup` (`closeup.js`): both forms, mine left bow right, theirs right mirrored, label
  `CUTAWAY · NOT TO SCALE`, ship names >= 11 px. Only local consequence: hit cell (`ev.at`),
  rail penetration as a bolt `r.entry -> cell -> exit` (not from the shooter's muzzle), torpedo
  impact as a short bolt `r.entry -> cell`, spill, PDC sparks and scars (no tracer streams from
  mounts across the gap), room death, smoulder, soot, tear, cut cells drifting, rail and tube muzzle
  flashes on the shooter's own hull, the plume, side chevrons. Removed: torpedoes in the gap
  (`torpTarget`, `stepTorps`, `torpDisp`, the distance share), the rail miss path to `W + 60`,
  `torpKilled` pops, guard/rake tracer bolts. Shake and white flash stay here (rail hit and tear
  biggest).
  Brackets: the room `me.target` on their hull, `roomBracket` with a dark under-stroke (3 to 4 px)
  under a 1.5 to 2 px stroke in their colour, label `TARGET · DRIVE` (>= 11 px, backplate
  `rgba(5,7,12,0.85)`), drawn last; pulses once (150 ms) when the target changes; gone at once when
  cleared or dead. `setInspect(room | null)`: my tapped room gets a white bracket `INSPECT · CREW`
  for 5.5 s. Both through the same mirror transform as the hull.
  API: `makeCloseup(canvas)` returns `{draw, onEvent, reset, roomAt(x, y), setInspect}`;
  `roomAt` returns `{side: 'me' | 'them', room}` or null (hull boxes of this canvas only).
- Input: `#cu-world` has `attachDrag` (pointer capture: a drag that passes over the dock still
  ends in one move order); `#closeup` has `attachTap` only (tap their room = target, mine =
  inspect); a drag that starts on the dock never steers. Pause, replay and auto rules are TAC's.
- Events and draws go to the visible view only: `VIEWS.closeup = [world, closeup]`; every renderer
  of the view switching in gets `reset` (`makeTactical` has one now: drops frozen fx, refits).
- As built (PR 42): the brackets are drawn in `closeup.js` from `roomBounds` (the same four-corner
  shape as `roomBracket`, which has a fixed 2 px line and cannot take the under-stroke or the flare).

## Close-up combat feel: action-framing camera, big marks, contact sparks, threat ticks (PR F, 2026-11-01)

The owner after playing A to E: in the world stage the marks are too small and the fit-everything
camera stays too wide while projectiles fly, so tracers, hull impacts and intercepts do not read.
Presentation only: no sim, rng or balance change; TAC unchanged (every new behaviour is behind a
`makeTactical` option the close-up passes).

- Camera modes (`camera: 'engage'`), picked every frame, first that applies:
  1. `inbound`: live torpedoes with `target === 'me'` -> required = my ship + those torpedoes.
  2. `outbound`: live torpedoes with `target === 'them'` -> required = their ship + those torpedoes +
     my ship (always: the drag ghost starts at my mark).
  3. `rail`: either ship's `railAim >= 0`, or a live slug -> required = both ships + every live slug's
     position and `{tx, ty}`.
  4. `idle`: both ships.
  Recent event points (0.8 s, as now) join the required set of the mode they belong to: `torpHit`,
  `torpMiss` (`ev.ship` = the ship that was targeted) and `torpKilled` (`ev.by` = the guarding ship) go to
  inbound when that ship is me, to outbound when it is them; `railHit`, `railMiss` go to rail.
  Linger: when a mode's trigger ends, the camera keeps that mode (its last required points plus the
  event points) for `MODE_LINGER` 1.0 s of dt, then takes the new mode. Within a mode: zoom out at
  once, zoom in eased (as now). On a mode change only: the points the new mode adds may ease in over
  0.35 s (zoom out eased, k = 1 - exp(-dt / 0.12)); the points both modes share stay hard. `requiredPoints()`
  returns the hard set: the no-clip test holds on it every frame. Paused (dt 0): nothing moves, the
  mode cannot change. Expose `cameraState()` -> `{x, y, scale, mode}` for tests.
  `opts.maxScale` overrides `V.MAX_SCALE` for this instance; the close-up passes 90 px/km (overlap of
  the big marks then starts under about 0.45 km). If it looks bloated in screenshots, back to 55.
- Big hull marks (`opts.markPx: [36, 48]`): each ship is drawn top-down from its form, living cells
  only (cut cells gone, dead rooms dark, job rooms in their room colour dimmed, frame in the ship
  tint), rotated to the real heading (bow along `noseAngle`), length L = clamp(0.25 * rect.h, 36, 48)
  px, width L * form.h / form.w, a 1 px outline. Plume, velocity vector and aim reticle start from
  the mark's edge (stern / centre) instead of `MARK_LEN`. Without the option: today's mark.
- Contact points (big marks only): a tracer whose end is within the target mark's box is drawn to
  where its line enters the box (the rotated rectangle), not to the ship centre; the first frame a
  rake tracer is seen it makes a small spark there (2 to 3 sparks, a 4 px flash, life <= 0.15 s).
  `pdcHit`, `torpHit`, `railHit` world fx anchor on the mark edge on the shooter's (or torpedo's) side.
  No new shake or white flash (the world stage is quiet).
- As built (PR 44): no pumping when torpedoes die: once a projectile of the current mode is gone, or
  the mode lingers, the camera does not zoom in again until the mode changes (a snap then only moves
  the centre); it holds on the intercept and pulls back once. `torpHit` carries the victim's centre,
  so its world fx take the direction of the nearest live torpedo recorded on the frame before. TAC
  pixel-identical to before (compared at 844 x 390, dpr 2.6).
- Threat ticks on the dock (`closeup.js`): for live torpedoes with `target === 'me'`, grouped by
  `shotFrom(me, p.x, p.y)` (bow, stern, top, bottom), a red tick on that edge of my hull pointing in,
  label `▼ 4 · 2.3` (count, nearest distance km, 11 px, dark backplate) next to its own tick (beside it
  for top and bottom, under it for bow and stern; F.1), tick and label clamped in the canvas with the shake
  (a tick with too little margin slides inward onto the hull edge),
  drawn after the hulls and before the brackets. HUD only: no travel. Gone when no torpedo comes.

## The look: key light, bloom, plume, vignette (PR G1, 2026-11-01, render only)

`src/render/look.js`, shared by `canvas.js` (TAC and the close-up world stage) and `closeup.js` (the dock).
Decoration only: never reads input, never writes battle; no `Math.random` (flicker hashes time).
- One key light, screen space, upper left (`LOOK.KEY`), every view. World marks (TAC small mark, close-up big
  mark) are drawn into a sprite and lit there: a gradient along the key light (source-atop), the impact
  tints, a rim on the edges facing the light (the silhouette less itself shifted away from the light).
  Generic for any shape. The sprite is reused while its angle (snapped to 0.004 rad), dead rooms and cut
  cells stay the same and no tint is live. Dock only: cell shading from the form (one gradient over the
  standing cells, a rim on light-facing cell edges with nothing beyond, a dark line on the others), baked
  into a bitmap per hull state.
- Fake bloom: additive halo + white core sprites per beat kind, `BLOOM` (r px, a, life). Amplitude rule:
  tracer < torp < plume < kill < burn < torpHit < rail < tear (energy r * r * a; Playwright checks the
  drawn light in that order). World blooms scale with the mark (`markL / 40`, 0.5 to 1.2).
- Impact light: a warm radial tint on the hull near a hit (pdc small and short, torp, rail biggest), in the
  mark's own frame (world) or clipped to the hull cells (dock), 0.15 to 0.5 s.
- Drive plume (world and dock): sheath, plume, white-hot core, four shock diamonds, a nozzle glow; length
  and width as before (not bloated at zoom 90).
- Starfield: four parallax layers (0.04 to 0.45), three tints, batched by colour. World: camera km times
  30 px. Dock: my ship's km times 30 px (the stars slide behind the hulls as I move).
- Vignette and a cool grade toward the shadow corner, world canvases only, cached per size, blitted in the
  four edge bands only. Over the scene and the fx, before the drag ghost; these canvases have no text (HUD
  is DOM). Not in the dock (its labels and ticks are canvas text).
- Pixel ratio (PR 50): `renderDpr()` in look.js = min(devicePixelRatio, `LOOK.MAX_DPR` 2) sizes the world stage, the dock
  and every look.js / dock cache (`fit`, lit sprites, vignette, dock shading); `perf()` reports `dpr` and `renderDpr`.
- `game.perf()`: frame interval and render work (ms, avg and p95) over the last 600 frames, `fps`,
  `dpr` (`view` removed in PR H); `?perf=1` draws it as one line over the header's CLOCK / RANGE corner, once a second, tap
  to reset (PR 49; no element without the flag); `game.perf.reset()`. Debug only.
- Unchanged by rule: layout, hit areas, DOM geometry (Playwright: every element's rect identical to main in
  both views at 844 x 390 dpr 2.6 and 1, 1440 x 900), drag orders (same as main), no CSS transform anywhere.

## F.2: mark without a box, wide dock (PR 47, 2026-11-01, render only)

- The world-stage big mark no longer draws its 1 px outline rect; `markGeom`, `boxEdge` and `boxEntry` keep the
  box for contact points and hit offsets (nothing drawn).
- Dock `boxes()`: canvas width >= `V.WIDE` (1024 px): my hull at `V.MARGIN` from the left, theirs at `V.MARGIN` from
  the right, the middle for threat ticks and labels. Below: the centred pair with `V.GAP` 40 (844 x 390 unchanged).

## One view (PR H, 2026-11-01, render and input only)

(PR 55 brought TAC back as a second view, map only; see "TAC back as a second view".)
The close-up was a superset of TAC (world stage = map, dock = silhouette panels), so it is the only view.
The sections above that mention TAC, the side panels, `--side`, the VIEW button or `VIEWS` are history.
- Deleted: the `#tactical` canvas and its `makeTactical` instance, the two side panels (`#panel-me`,
  `#panel-them`, `makeSilhouettePanel`), the VIEW button and `T.view`, `setView` / `onView` / `VIEWS`,
  `hud.hit` and `.panel.hit` (the dock's shake and white flash carry the big hits), `--side`, `--panel`,
  the panel's TORPS / BURNS numbers (the TORPS and BURN buttons show both in their corner).
- Layout: the old `body.closeup` rules are the defaults at every viewport: `--bottom` 50 px, buttons with
  no hint line (a reason line stays), `#status` and `#toasts` 10 px from the edges, `#closeup-wrap` shown.
  The header loses the VIEW column: PAUSE and HELP keep their place, `#title` is 92 px wider and `#phase`
  sits 92 px further right. Every other rect equals main's close-up (844 x 390 dpr 1 and 2.6, 1440 x 900).
- `main.js`: `VIEW = [cuWorld, closeup]` gets every event and draw; one `attachDrag` on `#cu-world`, one
  `attachTap` on `#closeup`. `start()` resets both (before H only the dock was reset, so a restart from the
  close-up kept the old camera and fx). `window.game` = `{battle, closeup, cuWorld, exportReplay, perf}`.
- Range rings, ghost arcs, PDC arc counts and aim lines were already the same code in both views
  (`drawRangeRings`, `drawGhost`, `drawArcs`, `drawPdcCounts` at `cam.scale`); nothing moved.
- `makeTactical` keeps its default camera and small-mark branches (no caller now; harmless, small).

## Engage camera floor and bearing wedge (PR 51, 2026-11-01, render only)

The owner's phone: the world stage is about 108 px tall, so a long-range approach along the screen's vertical
axis fit at about 4 px/km and the 36 to 48 px marks read as point-blank. (PR E had no min scale on purpose: "no min
scale that breaks the fit".) Now:
- `target()` of the engage camera: when the fit scale is below `V.MIN_SCALE` (9 px/km) the scale is 9 and the centre
  moves toward the fit centre only as far as keeps my ship inside the pad margin. Then only my ship is a hard point
  (`requiredPoints()` returns it alone; the snap guards it); the enemy, torpedoes and event points may leave the frame.
  Same rule in every mode. `cameraState().floor` says whether the floor held on the last frame.
- `drawBearing`: whenever their ship's centre is off the world canvas (the floor, or the inbound mode, which never
  needed them), a wedge in their colour on the canvas edge (`V.WEDGE_INSET` 10 px in, `V.WEDGE_PX` 6) on the line from
  my mark toward them, pointing at them, and `T.bearing` (`PELLA 18.2 km`, 11 px, dark backplate) behind it, inside
  the canvas. Drawn over the vignette, before the ghost. `cuWorld.bearing()` returns its geometry for tests.
  The owner decided (2026-11-01): one rule in every mode, the wedge shows whenever they are off the stage, not only at
  the floor; revisit only if it flickers on the phone when they hug the edge.
- `railMiss` points are the slug's end, 0.6 km off the target (`weapons.js`), not far away; they did not cause this.

## TAC back as a second view (PR 55, 2026-11-01, render and input only)

The owner, after playing PR 54: the world stage is about 108 CSS px tall on the phone, so 12 km of vertical
separation cannot fit at a readable scale; the floor, wedge, rings and labels treat symptoms. H is rolled back in
part: TAC, the map over the whole screen, is back as a view. The close-up stays as PR 54 left it (the knife view).
- `index.html`: `<canvas id="tactical">` before `#game`, `<button id="view">` in the header between PHASE and PAUSE
  (where it was before H). `style.css`: `#tactical` fixed over the screen, shown only under `body.tac`, which hides
  `#closeup-wrap`; the header grid gets its 84 px column back. Nothing else in the layout changed: against main
  in the close-up view every rect is the same except the header (`#title` 92 px narrower, `#phase` 92 px left,
  `#view` new). No panels: the dock covers what they showed.
- `main.js`: a second `makeTactical` with the default camera (centre between the ships, fit at 78 % x 72 % of the
  view, clamped to `V.MIN_SCALE` 9 and `V.MAX_SCALE` 55 px/km), small 14 px marks, not quiet (TAC has no dock to
  carry the shake and flash). Its inset is the HUD: `--top` above, `--bottom` + `--status` below, 8 px at the sides.
  `VIEWS = {tac: [tactical], closeup: [cuWorld, closeup]}`; events and draws go only to the view on show, and
  `setView` resets the renderers of the view it shows, so nothing frozen while hidden replays. TAC on load, no
  storage. Drag steers on both maps (`move()`, one dispatch; each drag acts only in its own view).
  `window.game` adds `tactical`, `setView(v)` and `view()`; `perf()` reports `view`.
- Targeting on TAC (PR 56; PR 55's tap-to-cycle took up to 11 taps and was dropped): a tap within `TAP_MARK_PX`
  (24) of their mark opens their layout (`src/render/picker.js`, its own `#picker` canvas over the map, centred in
  the TAC stage): their cutaway grid drawn by the dock's `drawForm` (same colours, dead rooms dark, bow left as in
  the dock), cells up to 17 px (shrunk to fit a short screen, at least 9), the current target bracketed
  (`roomBracket`), title `T.picker.title`. A tap on a standing room sends it through `tapThem` (the dock's order
  path, refusals and toasts; tapping the current target clears it, the dock's rule), then the panel closes. A tap
  on the panel off a room keeps it open; a tap elsewhere on the map, a view switch, a new battle or 6 s of real
  time (paused too) close it with no change. A drag still steers. Not in a replay or AUTO.
- Readouts on both views: `drawBearing` runs for TAC too (their range under their mark; the wedge only as insurance:
  at 9 px/km the TAC stage holds about 22 km of vertical separation at 844 x 332, past `ESCAPE_RANGE` 20). The
  stage for the wedge, the label and the ruler labels is the view rect (the canvas on the close-up, so nothing
  moved there; on TAC the part the HUD does not cover). Ruler rings and my PDC ring are shared code.
- Fix (close-up): the wedge now shows when their mark is not all on the stage, not only when its centre is off.
  Anchored near the threshold (their separation a little past what the stage holds at 9 px/km) their mark sat half
  cut by the edge with no wedge: a 16 to 6 km vertical sweep at 844 x 390 had 524 such frames on main, 0 now.

## Anchored stage (PR 54, 2026-11-01, render only)

The owner's playtest: on the merged view's world stage he lost his own ship's position, their bearing and the feel
of range (the old TAC did this better). Reference: a chase camera with the own ship anchored, a range on every
target and edge indicators, mapped to our top-down stage. No sim, AI, RNG, `numbers.js`, input or rule change.
- The anchor (`anchorCamera` in `canvas.js`, called by `engageCamera` after the mode and its points are worked out).
  `sBoth` is the honest fit of my ship and theirs (the same formula as `target()`: pad, 1 km span floor, no
  `maxScale` cap). Below `V.ANCHOR_IN` (18 px/km) the stage is anchored until it rises above `V.ANCHOR_OUT` (22).
  Anchored, in every mode (the owner approved the deviation from "idle only": a 20 km sniper fight with the rail
  aim toggling would otherwise jump between frames): the scale is `V.MIN_SCALE` (9 px/km) and my ship sits at
  `V.ANCHOR_X` of the width (0.3, or 0.7 when they are left of me on entry) and half the height. Only my ship is
  required; their ship, torpedoes and event points may leave the frame. The side flips when their bearing has
  crossed the vertical centreline by `V.ANCHOR_FLIP_DEG` (20) for `V.ANCHOR_FLIP_HOLD` (1.5 s of dt) in a row.
  Entering (from where my ship is drawn now, at the current scale) and flipping ease over `V.ANCHOR_EASE` (0.4 s,
  smoothstep). On exit the fit camera eases back in (its zoom-in hold and transition are cleared). Paused: nothing
  changes. Above the threshold the fit camera (modes, PR 51 floor, snaps) is the same code as before: the probes
  at 12 km horizontal and at knife range are identical to main to the pixel. At 1440 x 900 the stage is tall
  enough that a vertical approach still fits above 18 px/km, so it is rarely anchored there.
  `cameraState()` adds `anchored` and `anchor` `{x, y, side}` (CSS px).
- Rings: their ship keeps both envelopes (PDC solid, torpedo dashed: range is symmetric, so their torpedo ring
  reads both ways); my ship keeps the PDC ring (the defensive bubble) and loses its torpedo ring. Round my ship
  the ruler, `V.RULER_KM` 1 / 2 / 4 / 8 km at true scale (same `cam.scale` as the arcs), neutral grey dotted
  `[1, 4]`, so it never reads as a weapon range. A ring that does not cross the canvas is skipped. Labels
  (`T.ruler`, 11 px) go only on rings wider than my mark; each sits at the first of `V.RULER_ANGLES` (200, 340,
  160, 20 degrees) whose point is on the stage, clamped inside it, and is dropped if it would sit on a label
  already drawn. `cuWorld.rulerLabels()` returns them for tests.
- Their range, always: on the stage, `T.bearing` (`PELLA 14.5 km`, the wedge's string) under their mark (over it
  when there is no room), on a dark plate, kept inside the canvas (`cuWorld.rangeLabel()`); off the stage the
  PR 51 wedge, which already starts from my mark, so anchored it reads from the anchor.
- Toast: one line at the top of the world stage, the newest wins (`hud.js` keeps at most one). Two lines covered
  the ships during big beats; the alert lane in the status deck keeps what matters. The `#toasts` rect is the only
  DOM rect that differs from main (38 -> 18 px tall when two toasts would have shown).

## Hero window spike, S1 (`?hero=1`, 2026-11-01, render only; merged with the flag off so the owner can play it, the beauty gate still decides S2)

My ship as an object, rear-oblique, in a window at the left of both views. `src/render/hero.js`; default off.
- Flag: `?hero=1`, read at boot in `main.js`. Off: no window, `makeHero` is never called, both insets are what they
  were (TAC left 8, close-up 0). Proof: every DOM rect and the 12 km / knife camera probes equal main in both views at
  844 x 390 dpr 2.6 and 1, 844 x 332, 1440 x 900.
- Layout: canvas-drawn on the view's own canvas after its draw (TAC: `#tactical`; close-up: `#cu-world`), no DOM, no
  hit-testing. TAC: x 8, from `--top` + 6 to the status deck - 6 (at most 300 tall); the close-up: x 0, the stage's
  full height. Width fitted to the ship's beam (`BEAM_SHARE`), TAC at most 34 % of the screen. Its right edge + 6 px
  is the LEFT INSET of that view's camera (`opts.inset`), so fit, required points, wedge, labels and rulers inherit it.
- Hull: derived from `ship.form`, `ship.cells` and the design's room kinds only. Box-blurred cell mask thresholded
  (round, not cells), keystone warp (bow end 20 % narrower), fixed pitch, hull wall, deck lit along `LOOK.KEY` with
  a rim, faint job-room tint and plate seams; raised blocks per room kind (`HERO.HEIGHT`) with contact shadows, far
  first; PDC domes at `form.mounts`; a rail spine and barrel only when the form has rail cells; an engine bell at the
  drive's stern edge and an idle plume; running lights (port red, starboard green, bow strobe). Dead rooms sink and
  go dark, cut and torn cells drop out.
- Cache: one bitmap per battle, view, window size, dpr and hull state (dead, torn, cut); per frame only the plume,
  bell glow and lights (~0.05 ms). A bake costs 15 to 30 ms headless at dpr 2.6 (one-off; again on each room death).
- S2 (not built): bank, plume by thrust, Burn lines, hit flashes, local impact frame, scorch via a dock getter.

## Render module contract

- `silhouette.js`: `drawShipMark` and `COLORS` are used; the art tables
  (`drawSilhouette`, `shipPoint`, `piecePoint`, `landmark`, `SHIP_ASPECT`, ...)
  have had no caller since the panels drew the form; cleanup PR later.
- `canvas.js`: `makeTactical(canvas, opts)` returns `{draw, onEvent, reset,
  toScreen, toWorld, shipScreen, setGhost, requiredPoints, safeRect, cameraState, bearing, rangeLabel,
  rulerLabels}`
  (two instances since PR 55: TAC and the close-up's world stage). `closeup.js`: `makeCloseup(canvas)`
  returns `{draw, onEvent, reset, roomAt, setInspect, threats}`. They own their
  own particles, shake and flashes. They never mutate battle.
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
