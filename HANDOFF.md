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
  `?fit=gun:quickRail,drive:hot` (the hangar's picks; `pdc:` in old URLs is ignored).
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
  `node tools/arena.mjs me=brawler them=gunship seeds=30 mefit=gun:quickRail`
  for one fit, and Playwright at 844 x 390 with
  `/opt/node-tools/node_modules/playwright/index.js` (CommonJS default
  import, `hasTouch`, `isMobile`) against `python3 -m http.server 8123`;
  `window.game` exposes `battle`, `tactical`, `panels.me/them` (with
  `roomAt(x, y)`), `exportReplay()`. Force a tear in the browser with
  `b.pieceDied(ship, 'pdc2', 'torp')` after setting the room dead.
- Parallel work (the owner asked, to save quota): the parent session writes the contract
  into ARCHITECTURE.md, then spawns an Opus agent for `src/sim` and a Sonnet agent for
  `src/render` on the same tree with disjoint files, reviews both, runs the checks, merges.
  PRs 22 to 25 were built this way; briefs name the files each agent owns, and say never
  to run `pkill -f` with a pattern that matches the agent's own shell line.
- Replays: the owner pastes exported JSON into chat; save it to the scratchpad
  and run `node tools/replay.mjs file.json`, or a small node script that
  replays and prints per-hit events (face of the target, PDC count, range) to
  answer "why". Replay version 9 (the six mounts); older replays diverge. `ships {me, them}` are `{design, fit}`;
  pass `r.ships` to `makeBattle(seed, ships)` or the replay diverges. Older
  replays diverge anyway (the sim changed).
- Rendering (`src/render/canvas.js`, `form.js`, `hangar.js`, `silhouette.js`) follows the state
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
- Rooms have only HP and one job. Job rooms: rail, sensors, pdc1..pdc6, bridge, crew,
  tubes, drive (Tachi; the Belter has no rail and pdc1..pdc4). Plating (bridge, tubes:
  double hp). No power, crew counts, heat, oxygen. (History: layer 1 was a chain of seven
  rooms with the exposed end hit first and bulkheads; the form replaced it, see below.)
- The tear rule: a dead room is a hole; cells with no path to the bridge are cut, a room
  with no cell left tears off (hp 0, `torn`, the tubes take the torpedo stock).
- Drag as heading: direction is an absolute heading, length is the speed,
  relative to the enemy; HOLD coasts. Face from heading versus bearing,
  BOW_CONE 45.
- Tap-a-room: torpedoes flank to a room that is not the exposed end at half
  speed (most die under a Guard); PDCs chew it broadside; the rail aims at it too
  (since the form, 2026-10-31: on the chain the rail ignored the tap; on the grid that was
  a random ray into frame, battle 97424: five rail hits, five into frame).
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
- The hangar (PR 21, redrawn in PR 24 and 25): two picks per slot, from `catalog.js`:
  tubes quad / twin (2 every 10 s), rail long (15 km, 40 s) / quick (10 km, 20 s), drive
  corvette (3 Burns) / hot (twice the push, 2 Burns). Every variant number is the stock
  one doubled or halved. No buying, no points. The hangar draws the form; a tap on a
  hardpoint opens a list of its variants with the stats (the owner: "each choice must
  show stats or I do not know what I pick"). The PDC pick is gone (below).
  The enemy pick (PR 31, the owner): an ENEMY button in the hangar's button row opens the
  same list with the five AI presets, a stats line from the preset's knobs and one line of
  text each; remembered in localStorage `enemy`, `?enemy=` wins; the enemy flies its stock fit.
- Hangar labels and arcs, panels (PRs 32 to 34, the owner; built by a Sonnet render agent): every
  job room named on the hangar form, a tap on any room says `T.roomInfo` (frame too); the three
  arcs (`src/render/arcs.js`, shared) drawn under the hangar form, not to scale, with a km legend,
  and to scale in `drawGhost` while a move is dragged, with "BOW · RAIL · PDC 6 (far)". Panels
  `--side` 130 px and `PANEL.CELL_ASPECT` 1.8: cells only got wider (about 10 x 5.4 px), the row
  height is bound by the panel height (28 rows in about 194 px), so the gain is small; my panel
  is shorter than theirs (TORPS and BURNS under it). Orbit at range in place of HOLD: parked in
  NOTES with its three lines (it hands the steering decision to the autopilot).
- Arc colours (PR 35, the owner): tubes are red (255, 84, 110), not orange ("looks like the yellow");
  RAIL, TORPS, GUARD and RAKE buttons wear their room's colour, the same as the arc and the panel
  room. The PDC arc is four sectors, each shaded by and labelled with the living mounts that see
  it (bow and stern every mount, a broadside that side's): where a torpedo is easiest to stop.
- Broadside chevrons (PR 36, the owner: "show which side of my ship faces them, so I can put the
  broadside without the bridge in front"): the panel's side chevrons sit on the side that faces the
  enemy (`shotFrom`: top = row 0 side, where the bridge is: from the top one frame cell covers it,
  from the bottom four: F, C, C, S in column 14). Before, they were always on one fixed side.
- PDC rounds (PR 37, the owner): hangar pick on the PDC mounts, `rounds` slot: HE (stock, today's
  Rake: chews the first living cell, frame too) or AP (pierces frame to the first job room, half
  dps; cannot break frame, so it never splits the hull). Hit events carry `at: [x, y]`. Arena all
  unchanged. AI vs AI with AP (the AI does not pick targets for it): brawler mirror 6/12/12 (HE
  10/13/7), brawler vs turtle 7/3/20 with 16 time draws (HE 19/2/9). The owner judges on the phone.
  Fast/Heavy PDC (Guard vs Rake) agreed but not built: one layer at a time.
- Close-up view (PR 38, the owner: "keep the view, add a close-up, I want to see the impacts"; built
  by a Sonnet render agent): `#view` button CLOSE-UP / TAC in the top bar; `src/render/closeup.js`
  draws a fixed stage, my form left bow right, theirs right mirrored, one cell size (Tachi 13.3 px),
  whatever the real range; impact fx on `ev.at` (torpedo flash, rings, debris, spill burst; rail bolt
  through the ray; PDC tracer streams from the mounts that see; Guard tracers and pops; room bursts;
  tear line, cut cells drift 3x); torpedoes in flight cross the gap by their distance share; side
  chevrons from `shotFrom`; tap their hull to target. Buttons and pause work; drag is off there;
  only the visible view gets events and draws. A bigger ship scales down; past about 80 columns it
  will need zoom (later).
- The form (2026-10-31, replaces "not the 2D grid"): the ship is draft 12 of the owner's
  "Roci form" artifact, a 28 x 9 grid of cells with fixed hardpoints; the direction is ship
  building like Cosmoteer but with a fixed form and fixed hardpoints, the player picks a
  variant per hardpoint (the hangar is already that, per slot). Cells are geometry, hp stays
  on the room; a shot is a ray along a row or a column from where it really comes from; the
  first cell's room takes it, SPILL into the next; frame is cover, not a wall: what its hp
  (FRAME_HP 5) does not absorb carries into the room behind.
- PDC (PR 25, the owner, 2026-10-31): six fixed PDC mounts on the hull edge, placed by the
  owner on a screenshot: (6, 1) (13, 1) (19, 2) above the keel, (6, 7) (13, 7) (19, 6)
  below. Each is its own room pdc1..pdc6, 10 hp, unplated, one turret; it dies, tears and
  is tapped alone (tap near a one-cell mount within 8 px picks it). A mount fires by its
  arc: above the keel when the target is top, bow or stern; below when bottom, bow or stern
  ("every living mount fires" end-on). Guard checks the arc against each torpedo (PR 26, the
  owner: "a mount sees the torpedo, not the ship, that is how it really is"); Rake against
  the ship. So broadside three guard, end-on all six. The PDC
  pick is gone from the catalog. The two T sponsons of draft 12 are Gun mount M, a weapon
  the game lacks: frame. The Belter has four mounts (10, 1) (15, 1) (10, 5) (15, 5), mine.
  Every letter that is not one of the seven job rooms is a frame room (hp FRAME_HP, no job,
  not targetable, blocks spill): bulkheads, spine, hull frame, and the empty hardpoints
  (reactors, heat sink, shield generator, cockpit, workshop) that later rooms will fill ("các
  room khác, discuss later"). Sensors are the antenna cell (10, 2). Tear: flood from the bridge
  over living cells; cut cells drift, a room with no cell left tears off. Targeting is by room
  (tap), never by cell. The Belter has its own 20 x 7 form (mine, the owner has not judged it).
  Panels are 100 px wide; cells about 9 x 7 px. No diagonal rays (NOTES). The owner accepted
  that every arena number before this is void.
- Guardrails: three lines before any system (decision it creates, what stops
  it, what it costs); numbers file under 80 (now 72); sim under 2000 lines
  (now about 780); at most 12 battle buttons (now 7; hangar picks are not
  battle buttons); one layer per PR with battles and three lines from the
  owner in between; no physics tests, only arena and replay;
  no flares (parked in NOTES with its three lines).

## Facts measured (keep consistent)

Everything below the second bullet was measured before the form and is void for balance;
kept only as history. After the form (30 seeds, win/lose/draw):

- Guard at 0.375 (PR 28, the owner: 94 percent is too boring; "half of (0.5 + 0.25)"). Why it
  was 94: before PR 25 the Tachi guarded with 2 turrets broadside and 1 end-on; six mounts
  made that 3 and 6 with the same rate per mount, and the AI's stern turn sends most
  torpedoes in end-on (5.4 mounts saw the torpedo at the average kill). Measured at 1.0 /
  0.5 / 0.375 / 0.25, brawler mirror: 98 / 85 / 75 / 61 percent of torpedoes killed, time
  draws 15 / 11 / 5 / 2. At 0.375: brawler mirror 10/13/7 avg 144 s; brawler vs gunship
  25/0/5; sniper mirror 12/13/5 (was 30 time draws); sniper vs gunship 29/0/1; gunship
  mirror 14/9/7; quickRail brawler vs gunship 24/0/6. Turtle mirror and berserker mirror
  unchanged (no torpedo dies there). Script: a node file that replays the arena and counts
  torpKilled by shotFrom and the mounts that see it.

- After the six independent mounts firing by arc (PR 25): Guard kills about 94 percent of
  torpedoes (was 58): bow-on all six guard where one turret did. brawler vs brawler 7/10/13
  avg 194 s (10 time draws); brawler vs sniper 0/12/18; brawler vs gunship 20/0/10; sniper
  vs sniper 0/1/29 (27 time draws); sniper vs gunship 29/0/1 (the Belter flies broadside,
  so 2 of 4 mounts fire where its deck had 3); gunship mirror 6/4/20. Torpedoes barely land
  end-on. Not tuned; the owner plays first. Candidate if he says boring: halve
  PDC_GUARD_KILL_RATE. Guard by the torpedo's side (PR 26) changed little: brawler mirror
  7/6/17 avg 200 s, sniper mirror 30 time draws, sniper vs gunship 30/0/0, brawler vs
  gunship 18/1/11.
- Battle 68 (the owner, played at Guard 1.0 before PR 28 deployed; replays only with
  `N.PDC_GUARD_KILL_RATE = 1.0`, at 0.375 it diverges and ends 66 s as a win): at 227.5 s
  the owner's Rake killed `frame:S1`, the spine, one frame room of 16 cells on the keel row
  with FRAME_HP 5; the flood from the bridge then reached only 17 of 158 cells, so sensors,
  crew, drive, pdc1, pdc4 tore off astern and pdc6 off the bow. What stayed: bridge and pdc3,
  no torpedoes, no rail, no tubes, no drive. `isBeaten` is bridge dead or `hasWeapons`
  false, and a living PDC mount counts as a weapon, so the stub was not beaten; the owner had
  0 torpedoes, rail charge 0 (40 s recharge), range drifting 0.6 to 2.2 km on HOLD, Rake
  on a plated covered bridge; draw by time 12.5 s later. The owner: "the enemy has only the
  bridge and nothing else and it is still a stalemate; really, from the break, if half the
  ship is cut, mostly the whole ship explodes."
  Decided (PR 30, the owner): a ship is beaten when half or more of its form's cells are cut
  away from the bridge (`HULL_BEATEN_FRACTION` 0.5 on `cell.cut`, `hullGone` in `isBeaten`,
  result reason `hull`: "IS FINISHED. Half her hull is adrift."). Dead rooms (holes) do not
  count, only cut cells. Chosen over three candidates measured counterfactually on 480 AI
  battles (Tachi presets crossed, 30 seeds; a hulk = a side with no rail and no torpedoes
  more than 10 s before the end, 217 such battles, 51 time draws):
  cut >= half: ends 81 battles early, 32 before any hulk, flips 0 winners, ends 46 hulks,
  9 time draws. Living-and-connected < half: 317 early, 184 before any hulk, flips 9.
  Reactor (the owner's idea: R1 and R2 as rooms, shot or torn off = lose; modelled as the
  frame R rooms at 10 hp): 335 early, 207 before any hulk, flips 26, ends 203 hulks: it
  becomes a third way to win that mostly dies to spill, so it was parked. Reactor torn only:
  231 early, 87 before, flips 6. Replay 21108 (the owner's, after battle 68): the spine and
  the rail died to one salvo at 68.8 s (71 of 158 cells cut, 45 percent); now finished at
  87.9 s by `hull` (95 cut) instead of the bridge at 93.2. Battle 68 has no saved replay.
  The duplicate tear (below) is fixed in the same PR: every torn room of both ends is torn
  off first, then the events per end.
  Arena after (30 seeds, before in brackets where it moved): turtle mirror 14/9/7 (11/7/12,
  time draws 12 to 7); turtle vs gunship 11/11/8 (10/9/11); brawler vs turtle 19/2/9
  (17/1/12); berserker vs brawler 0/29/1 avg 37 s (0/28/2, 47 s); the rest within a win.
  The hulks left are mostly "out of ammunition with the hull whole"; a rule for that is a
  different question (item 2 and 5 below), not the reactor.
- Bug seen in battle 68 (fixed in PR 30): `pieceDied` tore one end, and the nested `pieceDied`
  of each torn room ran `cutOff` again and tore the other end too; then the outer loop
  tore that end again, so the stern `tear` event and the `pieceDead` of its rooms were
  emitted twice (piecesLost 15 for 10 rooms; replay 21108 piecesLost 14 for 11).
- The AI presets run at `runAt: 2` pieces left and the break phase at 3 job rooms left;
  with 12 job rooms (Belter 9) both come much later than before. Left as is.
- After the PDC mounts (PR 24; the pdc was six one-cell mounts on the hull edge, open to shots
  from the sides only): brawler vs brawler 7/14/9 avg 113 s; brawler vs gunship 8/19/3 (was
  27/2/1: the Belter's PDC used to be twelve sponson cells hit from every side); sniper vs
  gunship 5/5/20 with 19 time draws avg 193 s (the gunship keeps its PDCs, the sniper's
  torpedoes die); sniper vs sniper 4/10/16; tripleDeck brawler vs gunship 13/15/2. Not tuned.
- The hangar title says Rocinante for the Belter too; the Belter shares the Tachi's
  catalog. Cosmetic until the Belter has its own.
- After the form, with the rail aiming and frame carrying (PR 23): brawler vs brawler
  12/11/7 (5 time draws), avg 95 s (chain: 19/9, 40 s); brawler vs gunship 27/2/1; sniper
  vs gunship 6/21/3; sniper vs sniper 9/10/11; brawler (tripleDeck) vs gunship 25/5/0;
  turtle vs turtle 14/8/8. With frame soaking everything (PR 22 alone) the mirror was
  9/12/9 at 124 s.
- Battle 97424 (the owner, PR 22 rules): them lost the drive at 34 s and sat as a hulk for
  200 s; the owner's five rail hits all went into frame; 10 of 12 torpedoes shot down each
  side; draw by time. Under PR 23 rules the same orders put a rail hit through frame into
  the bridge from the side (cover 1 layer); from the bow the bridge has four layers.
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
  cost the AI drive, tubes, crew to one salvo), 40817 and 29836 (gunship); 97424 (the
  first on the form, see above).

## Next, in this order, each only if the owner says a battle was boring without it

1. Done (PR 30): half the cells cut = beaten, the duplicate tear fixed. Next the owner plays
   PR 28 (Guard at 0.375) and PR 30 and says: can the grid be read, does cover make a
   decision, does one torpedo in a salvo landing feel right, does a split hull end right.
2. Only if the owner says so: a drive-dead ship with no weapon to bear is beaten (or tail-on
   tubes at half rate), the half-hull rule (PR 30) covers only about one hulk in five: most hulks are
   out of ammunition with the hull whole.
3. The next rooms into the empty hardpoints, only when the owner names them (he said
   "discuss later"). Then the hangar picks per hardpoint, one at a time.
4. The owner plays with fits and says which pick never gets chosen; a pick nobody takes is
   removed or doubled again, not tuned finely. Then PDC ammo (NOTES).
5. Open: a drive-dead ship drifting past 20 km is a draw today; should it be
   a win for the side that still flies. Louder now (see the stalemate).
Not 2 v 2, not diagonal rays, not the other rooms yet (all in NOTES).
