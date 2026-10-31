# Handoff: paste this as the first message of a new chat

Read CLAUDE.md, STATUS.md, ARCHITECTURE.md, BRIEF.md and NOTES.md in this
repository first. This chat is the owner's: the owner replies here directly,
in Vietnamese mixed with English; answer short, verified facts only, say
"I don't know" when you don't, raise problems before doing work.

## Where things are

- Game is live at https://spacegame.avcn101.workers.dev/ (Cloudflare Workers
  Builds, deploys from `main`; `wrangler.jsonc` serves the repo root as
  static assets). Repo: github.com/avcn101-del/Spacegame. The cloud session's
  proxy cannot reach the live site; check deploys on the GitHub branches page
  (`main` check green) and ask the owner to reload.
- Process: one branch and one PR per change; the owner asked me to merge PRs
  myself after the browser test passes. Every PR body starts with "Play this
  and tell me where it is boring." Use a fresh branch name per PR
  (`claude/<topic>`): the auto-mode classifier blocks force pushes even when
  the owner allows them, so a squash-merged branch cannot be reused. The stop
  hook then complains about "unpushed commits" on the stale branch; ignore it.
- Headless checks before every PR: `node tools/selfplay.mjs` (determinism),
  `node tools/arena.mjs all seeds=30` (preset vs preset, watch draws and
  battle length), and Playwright at 844 x 390 with
  `/opt/node-tools/node_modules/playwright/index.js` (CommonJS default
  import, `hasTouch`, `isMobile`) against `python3 -m http.server 8123`;
  `window.game` exposes `battle`, `tactical`, `panels.me/them` (with
  `roomAt(x, y)`), `exportReplay()`.
- Replays: the owner pastes exported JSON into chat; save it to the scratchpad
  and run `node tools/replay.mjs file.json` (or a small node script that
  replays with the order log filtered) to answer "why" with events. Replay
  version 5: move orders are `{heading, speed}`. Old replays diverge.
- Rendering (`src/render/canvas.js`, `silhouette.js`) follows the state
  contract in ARCHITECTURE.md; small render changes are fine to do directly.
  Sim and AI never import render.

## What the owner decided (do not re-ask)

- Mirror match Tachi vs Tachi, Roci-inspired; one torpedo type; active
  pause; tactical strip with tracers; epic procedural impacts, no image art.
- Layout A: full-screen tactical, vertical silhouettes on the short edges.
- Railgun: any Burn during the enemy's aim makes the shot miss.
- Rooms layer 1: seven rooms bow to stern (rail, sensors, bridge, pdc,
  crew, tubes, drive); a shot hits the exposed end first; sensors and crew
  are rooms with one effect each. Rooms have only HP and one job. No
  power, crew counts, heat, oxygen. Shields and jammer are parked in NOTES.
- Drag as heading (PR 9): the drag direction is an absolute heading on the
  map, the hull swings to it (90 degrees per FACE_TURN_TIME), the length is
  the speed. Face (bow / side / tail) is derived from heading versus bearing
  with BOW_CONE 45. HOLD coasts. The asked speed is relative to the enemy
  (my call, flagged: an absolute cap made any Burned ship uncatchable).
- Tap-a-room (PR 8): `target {room}` order; torpedoes sent at a room that is
  not the exposed end slow to half speed, swing out 1 km and turn in; PDCs
  chew the chosen room only broadside; rail unchanged; AI targets by preset
  (sniper drive, brawler pdc, turtle tubes); brackets on both silhouettes;
  tapping a room shows its hp and job (both ships).
- Torpedoes: proximity fuse TORP_FUSE 0.3 km (PR 8) and a speed cap relative
  to the target (PR 10); both fixed torpedoes that circled forever.
- Salvos of four, stock of twelve (PR 11): the owner said this made the game
  dramatic, torpedoes are the weapon with the most impact, a bit overpowered.
- Plating and bulkheads (PR 13, this handoff): bridge, pdc, tubes are plated
  (ARMOR_HP_MULT 2); bulkheads aft of sensors, pdc, tubes stop spill. Chosen
  by the owner over nerfing torpedoes. Measured knobs if still overpowered:
  TORP_RELOAD 40 lengthens battles (54 s avg vs 35), salvo 3 does not.
- A line when a room dies (PR 12): "THEIR SENSORS GONE: rail blind, ...".
- Guardrails against the DTN failure: three lines before any system
  (decision it creates, what stops it, what it costs); numbers file under 80
  numbers (now 50); sim under 2000 lines (now about 620); at most 12
  buttons; one layer per PR with five battles and three lines from the owner
  in between; no physics tests, only arena and replay. The owner's DTN "Roci
  form draft 12" artifact (claude.ai/artifact/NvCPh7wurmHa8ZkZ2NvePP) has ten
  systems and no fight; what to borrow from it is listed in NOTES.md.

## Facts the owner asked about (answered, keep consistent)

- Burn does not dodge torpedoes (measured on replay 80172: the hit moved by
  0.3 s). It only beats the railgun. A torpedo-dodging Burn is in NOTES.
- Guard kills about 45 percent of a direct salvo at 3 km; flank torpedoes
  (a buried room, half speed) die 85 percent. PDC "direction" already exists
  coarsely: two turrets broadside, one end-on.
- Rail aim is lost when the enemy leaves the 45 degree bow cone, not only
  when you turn. The sure shot is while they aim (they cannot Burn).
- Arena battles are 16 to 50 s now, below the 2 to 4 minute target; human
  battles ran 37 to 150 s. berserker vs berserker is a 16 s mutual kill.
- The owner's replays this session: 6045, 70368 (torpedoes circled), 51965,
  15851 (Burned ship uncatchable), 80172 (win by two lucky bridge hits).

## Next task, proposed (the owner has not said go; ask, estimate 20 minutes)

The owner says a salvo is too strong: whoever fires first wins, the second
salvo surely lands. Measured (arena, 40 seeds): room targeting is not the
cause (an AI that does not target wins 30/1 against brawler, one that targets
pdc 23/13; making a chosen room always take the slow approach changes
nothing). The snowball is the exposed-end rule: a bow-on salvo of four kills
rail, then sensors, then wounds bridge; without sensors the victim's PDCs and
torpedoes hit half as often. The fix that measured well: a new number
TORP_DAMAGE 5 (a torpedo does half a room, the rail still 10): battles 36 to
50 s, rooms lost per battle 6.5 to 3.8, first room dies at 27 s instead of
24. Side effect to say out loud: sniper vs brawler becomes 30 draws of 40
(torpedoes from range too weak, both drift). If the owner still wants a
trade-off for locking a room, the natural one is a lock time (tap, then the
sensors need a few seconds, like the rail aim); it is in NOTES.

## After that, agreed in principle (ask go, give the estimate first)

Ships break with consequences, one PR, about 1.5 hours: a dead room is a
hole; any room with no path to the bridge through living rooms detaches and
drifts away as debris (its drive stops pushing, its tubes and torpedoes are
lost). Bulkheads are already in place as the tear lines. Move the bridge to
the middle of the chain (rail, sensors, pdc, bridge, crew, tubes, drive) so
a cut loses at most three rooms; the silhouette art must swap the two rooms.
Add a `kind` per slot in the design for later variants, no UI. Risk flagged
to the owner: the room next to the bridge becomes the obvious tap, and
battles get shorter still. Open: should a drive-dead ship drifting past 16
km be a win for the other side rather than a draw.

After that, in this order, each only if the owner says a battle was boring
without it: a second ship as data (Belter gunship), slot variants from a
small catalog, PDC ammo. Not the 2D grid.
