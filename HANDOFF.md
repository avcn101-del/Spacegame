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
- Replays: the owner pastes exported JSON into chat; save it to the scratchpad
  and run `node tools/replay.mjs file.json`, or a small node script that
  replays and prints per-hit events (face of the target, PDC count, range) to
  answer "why". Replay version 7: `ships {me, them}` are `{design, fit}`;
  pass `r.ships` to `makeBattle(seed, ships)` or the replay diverges. Older
  replays diverge anyway (the sim changed).
- Rendering (`src/render/canvas.js`, `silhouette.js`) follows the state
  contract in ARCHITECTURE.md; `silhouette.js` holds one art table per design
  (`ART`, picked from `ship.design`). Sim and AI never import render.

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
- Guardrails: three lines before any system (decision it creates, what stops
  it, what it costs); numbers file under 80 (now 52); sim under 2000 lines
  (now about 690); at most 12 battle buttons (now 7; hangar picks are not
  battle buttons); one layer per PR with battles and three lines from the
  owner in between; no physics tests, only arena and replay; not the 2D grid;
  no flares (parked in NOTES with its three lines).

## Facts measured (keep consistent)

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

1. The owner plays with fits from the hangar and says which pick never gets
   chosen; a pick nobody takes is removed or doubled again, not tuned finely.
2. PDC ammo (in NOTES): Guard spends rounds, a decision between Guard now
   and Rake later.
3. Open: a drive-dead ship drifting past 20 km is a draw today; should it be
   a win for the side that still flies.
Not the 2D grid, not 2 v 2 (both in NOTES).
