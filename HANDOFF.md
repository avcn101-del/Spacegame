# Handoff: paste this as the first message of a new chat

Read CLAUDE.md, STATUS.md, ARCHITECTURE.md, BRIEF.md and NOTES.md in this
repository first. This chat is the owner's: the owner replies here directly,
in Vietnamese mixed with English; answer short, verified facts only, say
"I don't know" when you don't, raise problems before doing work.

## Where things are

- Game is live at https://spacegame.avcn101.workers.dev/ (Cloudflare Workers
  Builds, deploys from `main`; `wrangler.jsonc` serves the repo root as
  static assets). Repo: github.com/avcn101-del/Spacegame.
- Process so far: one branch and one PR per change; the owner has asked
  me to merge PRs myself after the browser test passes. Every PR body
  starts with "Play this and tell me where it is boring."
- Headless checks before every PR: `node tools/selfplay.mjs` (determinism),
  `node tools/arena.mjs all seeds=30` (preset vs preset, watch the draw
  counts), and a Playwright run at 844 x 390 with
  `/opt/node-tools/node_modules/playwright/index.js` (CommonJS default
  import) against `python3 -m http.server 8123`; `window.game` exposes
  `battle`, `tactical`, `exportReplay()` for tests.
- Rendering (`src/render/canvas.js`, `silhouette.js`) was written by a
  render subagent given the state contract in ARCHITECTURE.md; it works
  well to delegate render changes the same way while editing sim and HUD
  yourself. Sim and AI never import render.

## What the owner decided (do not re-ask)

- Mirror match Tachi vs Tachi, Roci-inspired; one torpedo type; active
  pause; tactical strip with tracers; epic procedural impacts, no image art.
- Layout A: full-screen tactical, vertical silhouettes on the short edges.
- Railgun: any Burn during the enemy's aim makes the shot miss.
- Rooms layer 1: seven rooms bow to stern (rail, sensors, bridge, pdc,
  crew, tubes, drive); a shot hits the exposed end first; sensors and crew
  are rooms with one effect each. Rooms have only HP and one job. No
  power, crew counts, heat, oxygen. Shields and jammer are parked in NOTES.
- Drag replaced the range and face buttons; one HOLD button remains.
- Tap-a-room: broadside means no detour (every room exposed); the bracket
  shows on both silhouettes, each in the targeting side's color.
- Guardrails agreed against the DTN Bridge failure: three lines before any
  system (decision it creates, what stops it, what it costs); numbers file
  under 80 numbers; sim under 2000 lines; at most 12 buttons; one layer per
  PR with five battles and three lines from the owner in between; no
  physics tests, only arena and replay.

- Tap-a-room targeting is built (one PR): `target {room}` order, torpedoes
  flank a buried room slowly and wide, PDCs chew the chosen room broadside,
  rail unchanged, AI targets by preset, bracket on the silhouette, tap your
  own room for its info. Torpedoes got a proximity fuse (`TORP_FUSE`): before
  it, a torpedo that missed by more than 0.08 km inside 3 km circled forever
  (replays 6045 and 70368: 9 of 12 and 6 of 12 torpedoes never resolved).

## Next task, already agreed

Drag as heading, one PR. The owner said drag is confusing. Wanted: drag
picks a direction on the map, the ship turns to it; a longer drag is a harder
burn (faster). The owner says the DTN bridge did it that way; ask what
exactly that was before building (absolute heading or relative to the
enemy; does speed persist until a new drag). Face (bow / side / tail) then
follows from heading versus the bearing to the enemy.

After that, ideas the owner raised but did not approve: drifting starfield
or circling already came with drag; layer 2 (a second ship design as data,
a Belter gunship); layer 3 (2D room grid); shipyard; multiple ships.
