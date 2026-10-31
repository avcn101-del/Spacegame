# Handoff: paste this as the first message of a new chat

Read CLAUDE.md, STATUS.md, ARCHITECTURE.md, BRIEF.md and NOTES.md in this
repository first. This chat is the owner's: the owner replies here directly,
in Vietnamese mixed with English; answer short, verified facts only, say
"I don't know" when you don't, raise problems before doing work. Before any
work longer than about an hour, give the estimate and wait for go.

## Where things are

- Game is live at https://spacegame.avcn101.workers.dev/ (Cloudflare Workers
  Builds, deploys from `main`; `wrangler.jsonc` serves the repo root as
  static assets). Repo: github.com/avcn101-del/Spacegame. The cloud session's
  proxy cannot reach the live site; ask the owner to reload. URL knobs:
  `?seed=`, `?enemy=brawler|sniper|turtle|berserker|gunship`, `?ship=belter`
  (fly the gunship), `?auto=brawler` (the AI flies my ship),
  `?fit=pdc:tripleDeck,gun:quickRail` (the hangar's picks).
- Process: one branch and one PR per change; the owner asked me to merge PRs
  myself after the headless checks and a Playwright run pass. Every PR body
  starts with "Play this and tell me where it is boring." The session's
  designated branch can be reused across PRs: after each squash merge, `git
  merge origin/main` into it and push (no force push; the auto-mode
  classifier blocks force pushes). The stop hook complains about uncommitted
  or unpushed work; keep the tree clean between tasks.
- Headless checks before every PR: `node tools/selfplay.mjs` (determinism),
  `node tools/arena.mjs all seeds=30` (preset vs preset, 5 presets; compare
  with the run before the change, differences under about 3 wins are noise),
  `node tools/arena.mjs me=brawler them=gunship seeds=30 mefit=pdc:tripleDeck`
  for one fit, and Playwright at 844 x 390 with
  `/opt/node-tools/node_modules/playwright/index.js` (CommonJS default
  import, `hasTouch`, `isMobile`) against `python3 -m http.server 8123`;
  `window.game` exposes `battle`, `tactical`, `panels.me/them` (with
  `roomAt(x, y)`), `exportReplay()`. Force a tear in the browser with
  `b.pieceDied(ship, 'pdc', 'torp')` after setting the room dead.
- Parallel work (the owner asked, to save quota): the parent session writes the contract
  into ARCHITECTURE.md, then spawns an Opus agent for `src/sim` and a Sonnet agent for
  `src/render` on the same tree with disjoint files, reviews both, runs the checks, merges.
  The form PR was built this way.
- Replays: the owner pastes exported JSON into chat; save it to the scratchpad
  and run `node tools/replay.mjs file.json`, or a small node script that
  replays and prints per-hit events (face of the target, PDC count, range) to
  answer "why". Replay version 8 (the form); version 7 replays diverge. `ships {me, them}` are `{design, fit}`;
  pass `r.ships` to `makeBattle(seed, ships)` or the replay diverges. Older
  replays diverge anyway (the sim changed).
- Rendering (`src/render/canvas.js`, `form.js`, `silhouette.js`) follows the state
  contract in ARCHITECTURE.md; the panels draw the form from `ship.cells` (`form.js`),
  `silhouette.js` keeps the tactical mark and the art tables. Sim and AI never import render.

## What the owner decided (do not re-ask)

- Mirror match Tachi vs Tachi, Roci-inspired; one torpedo type; active
  pause; tactical strip with tracers; epic procedural impacts, no image art.
- Layout A: full-screen tactical, vertical silhouettes on the short edges.
- Railgun: any Burn during the enemy's aim makes the shot miss. Rail range
  15 km, torpedoes 10, the fight ends (apart) at 20 km: the rail has a band
  where it shoots and is not shot back (the owner: a sniper that reaches no
  further than a normal gun is no sniper).
- Rooms layer 1, bridge in the middle: rail, sensors, pdc, bridge, crew,
  tubes, drive (Tachi); a shot hits the exposed end first; rooms have only
  HP and one job. Plating (bridge, pdc, tubes: double hp) and bulkheads aft
  of sensors, pdc, tubes (spill stops). No power, crew counts, heat, oxygen.
- The tear rule: a dead room is a hole; living rooms with no path to the
  bridge tear off (hp 0, `torn`, the tubes take the torpedo stock). pdc dead
  loses rail and sensors; crew dead loses tubes and drive.
- Drag as heading: direction is an absolute heading, length is the speed,
  relative to the enemy; HOLD coasts. Face from heading versus bearing,
  BOW_CONE 45.
- Tap-a-room: torpedoes flank to a room that is not the exposed end at half
  speed (most die under a Guard); PDCs chew it broadside; rail ignores it.
- Torpedoes: salvos of four, stock of twelve, proximity fuse, speed cap
  relative to the target. TORP_DAMAGE 5 was measured and parked: it still
  lost rail and sensors to the same three hits.
- The enemy turns its stern after a salvo (`sternAfterSalvo`), outside PDC
  range, unless the enemy's bracket is on its drive; the gunship never does
  (no plating: one salvo end-on killed four rooms). The owner: since the AI
  turns, I have to keep turning too, and that is gameplay the mechanics make.
- Burn is the drive at full for an instant along the hull: bow-on closes
  (about 3 km on a kiting ship), stern-on opens, broadside sidesteps.
- A second ship as data: the Belter gunship (`belter.js`): six rooms, no
  rail, three turrets, 16 torpedoes, half drive, no plating. The owner: not
  too hard.
- The hangar (PR 21): two picks per slot, from `catalog.js`: tubes quad /
  twin (2 every 10 s), PDC deck twin plated / triple unplated, rail long
  (15 km, 40 s) / quick (10 km, 20 s), drive corvette (3 Burns) / hot (twice
  the push, 2 Burns). Every variant number is the stock one doubled or
  halved. No buying, no points. The owner has not played it yet.
- The form (2026-10-31, replaces "not the 2D grid"): the ship is draft 12 of the owner's
  "Roci form" artifact, a 28 x 9 grid of cells with fixed hardpoints; the direction is ship
  building like Cosmoteer but with a fixed form and fixed hardpoints, the player picks a
  variant per hardpoint (the hangar is already that, per slot). Cells are geometry, hp stays
  on the room; a shot is a ray along a row or a column from where it really comes from; the
  first cell's room takes it, SPILL into the next unless the first is frame, which soaks it.
  Every letter that is not one of the seven job rooms is a frame room (hp FRAME_HP, no job,
  not targetable, blocks spill): bulkheads, spine, hull frame, and the empty hardpoints
  (reactors, heat sink, shield generator, cockpit, workshop) that later rooms will fill ("các
  room khác, discuss later"). Sensors are the antenna cell (10, 2). Tear: flood from the bridge
  over living cells; cut cells drift, a room with no cell left tears off. Targeting is by room
  (tap), never by cell. The Belter has its own 20 x 7 form (mine, the owner has not judged it).
  Panels are 100 px wide; cells about 9 x 7 px. No diagonal rays (NOTES). The owner accepted
  that every arena number before this is void.
- Guardrails: three lines before any system (decision it creates, what stops
  it, what it costs); numbers file under 80 (now 71); sim under 2000 lines
  (now about 780); at most 12 battle buttons (now 7; hangar picks are not
  battle buttons); one layer per PR with battles and three lines from the
  owner in between; no physics tests, only arena and replay;
  no flares (parked in NOTES with its three lines).

## Facts measured (keep consistent)

Everything below the first bullet was measured before the form and is void for balance;
kept only as history. After the form (30 seeds, win/lose/draw):

- brawler vs brawler 9/12/9 (7 time draws), avg 124 s (was 19/9, 40 s); brawler vs
  gunship 26/4/0; sniper vs gunship 5/21/4; sniper vs sniper 6/9/15; brawler
  (tripleDeck) vs gunship 28/2/0; turtle vs turtle 14/8/8 (was 30 draws). Selfplay avg
  113 s. `arena all` takes 11 s.
- The new stalemate: both brawlers turn stern after a salvo, both drives die (the drive is
  at the stern, unplated, frame beside it), each is a hulk tail-on with tubes alive at the
  bow and torpedoes left; it cannot fire tail-on and cannot turn, nothing happens until 240
  s. Not fixed: open item 3 below is now this question. Also seen: both PDCs dead at 1.8 km,
  rail alive, the AI stays broadside, the rail never fires.
- The bridge is covered from all four directions (frame or tubes in front); pdc is exposed
  from all four; drive from the stern only; tubes from bow, top and bottom.

- Burn does not dodge torpedoes. Guard kills about 45 percent of a direct
  salvo at 3 km; flank torpedoes (a buried room) die about 85 percent. The
  brawler AI taps pdc, so most of its torpedoes flank and die: the owner
  shot down 8 of 8 in one battle (20531), which is the tail of that
  distribution, not a change.
- Arena (30 seeds, after everything): brawler vs brawler 19/9 in 40 s (the
  first side has an edge); brawler vs gunship 15/14; sniper vs gunship 10/20;
  sniper vs sniper 22 draws apart. Human battles run 25 to 70 s.
- Fits in the arena (AI vs AI, brawler mirror): twin tubes 9/17 (the AI
  fires whenever, so small salvos die), triple deck 20/8, quick rail no
  change (the AI almost never fires the rail: 3 or 4 shots in 30 battles),
  hot drive 14/14 for the brawler, 13/9 for the sniper. Informational: the
  owner judges on the phone.
- The owner's replays this session: 46641, 7852, 20531, 89957 (stern turn
  cost the AI drive, tubes, crew to one salvo), 40817 and 29836 (gunship).

## Next, in this order, each only if the owner says a battle was boring without it

1. The owner plays the form on the phone and says three things: can the grid be read at
   9 x 7 px a cell, does cover (frame in front of the bridge) make a decision, and what to
   do with the stalemate (two hulks, drives dead, tubes alive tail-on).
2. The next rooms into the empty hardpoints, only when the owner names them (he said
   "discuss later"). Then the hangar picks per hardpoint, one at a time.
3. The owner plays with fits and says which pick never gets chosen; a pick nobody takes is
   removed or doubled again, not tuned finely. Then PDC ammo (NOTES).
4. Open: a drive-dead ship drifting past 20 km is a draw today; should it be
   a win for the side that still flies. Louder now (see the stalemate).
Not the 2D grid, not 2 v 2 (both in NOTES).
