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

## Done this chat: the AI turns its stern after a salvo (PR 15)

The owner said a salvo is too strong: whoever fires first wins. Measured (arena,
40 seeds): room targeting is not the cause; the snowball is the exposed-end rule,
a bow-on salvo of four kills rail, then sensors, then wounds bridge. Two fixes
were on the table. TORP_DAMAGE 5 (a torpedo does half a room) measured well on
averages but, replayed on the owner's battle 46641, still lost rail and sensors to
the same three hits (two rooms of 10 hp side by side, spill adds up); it only
saved the bridge. The owner's own tactic, fire and then turn the stern to them,
was built into the AI instead (`sternAfterSalvo` in presets, all but berserker):
after a salvo or with torpedoes coming, outside PDC range, the AI shows its
stern and holds range, and swings back when the tubes are nearly loaded. It
does not when the enemy's bracket is on its drive: a stern-on ship that loses
its drive is a hulk facing away that never fires again (sniper vs sniper went
to 30 timeouts before that clause). Measured brawler vs brawler: torpedo hits
bow-on 120 to 8, rooms lost per battle 6.2 to 5.4, battles 38 to 44 s, brawler
now beats berserker 28/2. TORP_DAMAGE 5 stays in the pocket if the owner still
says the first salvo wins. The owner's replays: 46641, 7852 (tap bridge, salvo,
stern: win in 24 s with no room lost).

## Done this chat: ships break with consequences (PR 16)

The tear rule, as agreed: a dead room is a hole; any living room with no path
to the bridge through living rooms tears off (hp 0, `torn` for the renderer,
the tubes take the torpedo stock). The bridge moved to the middle of the chain
(rail, sensors, pdc, bridge, crew, tubes, drive); bulkheads stay aft of
sensors, pdc, tubes, so the pdc is its own cell and the bridge spills into
crew. The silhouette art swapped bridge and pdc; a torn room is drawn adrift
past its end, the hull base shrinks to what is attached; one event `tear
{end, pieces}` per end, one toast line. `kind` per slot in `tachi.js`, no UI.
Measured (arena 30 seeds): brawler vs brawler 40 s avg (44 before), rooms lost
per battle 6.2 (5.4), brawler vs berserker 23 s. Risks said out loud: crew
(10 hp, unplated, next to the bridge) is the obvious tap, one torpedo or slug
there loses tubes, torpedoes and drive; more "broke off" draws, because a
drive-dead ship drifts past 16 km (open: should that be a win for the other
side; in NOTES). Bulkheads no longer claim to be tear lines in the text.

## Done this chat: the Belter gunship as data (PR 18)

`src/ships/belter.js`, picked by the `gunship` preset (`?enemy=gunship`) or
flown with `?ship=belter`. Six rooms (sensors, pdc, bridge, crew, tubes,
drive), no rail, a PDC deck with three turrets (two end-on), 16 torpedoes, half
the drive, no plating at all: a cobbled hull, every room dies to one torpedo.
What the design can now say: `turrets` per PDC deck, `torps` stock, `accel`
fraction; the sim reads them, no new number. A replay records the two designs
(version 6). The silhouette art is one table per design (`ART`), picked from
`ship.design`. Arena, 30 seeds: gunship beats brawler 19/11 and sniper 20/10;
plated it was 23/7 and 22/8, which is why it is unplated. The owner has not
played it yet. Owner's line after the tear rule: since the AI turns its stern,
the owner has to keep turning too, and that is gameplay the mechanics make, not
randomness (replay 89957: the stern turn cost the AI drive, tubes and crew to
one salvo). A hangar was asked about and parked: slot variants come next.

After that, in this order, each only if the owner says a battle was boring
without it: slot variants from a small catalog (a hangar screen before the
battle; `kind` per slot is in place), PDC ammo. Not the 2D grid.
