# NOTES

Ideas go here. They are not built until the owner asks.

- Asymmetric enemies: Belter gunship (many PDCs and torpedoes, no railgun,
  slow); UNN destroyer (bigger, you are the underdog).
- Nuke torpedo: one per ship, one hit kills, firing it is a decision.
- Breaching pods / boarding.
- Shipyard: ships built from parts, Cosmoteer style.
- Power routing between systems, FTL style.
- Crew and a Star Trek bridge: orders acknowledged with a delay.
- Sound.
- From the DTN "Roci form draft 12" (the owner's artifact), to borrow later, in
  this order (built so far: bulkheads, the tear rule with the bridge in the
  middle, a `kind` per slot): hardpoints fixed in kind and size, the player
  picks a variant (a catalog of 2 or 3 per kind); torpedo launchers at the bow.
- A ship whose drive is gone and drifts past ESCAPE_RANGE (20 km): today a draw
  ("broke off"); could be a win for the side that still flies. Not to borrow until a battle is boring without it: plate
  thickness, ERA, blast doors, blow-out panels, magazines with vents, reactors
  and power routing, radiators and heat, mass and thrust, the shield bubble.
- Burn as a torpedo dodge (today it only beats the railgun).
- PDC ammo: Guard spends rounds, a decision between Guard now and Rake later.
- Dead code in silhouette.js (art tables, shipPoint/piecePoint/landmark/SHIP_ASPECT), cleanup PR later. Also
  makeTactical's default camera and small-mark branches have no caller since PR H.
- Lock time for tap-a-room: the sensors need a few seconds to lock a room, like the rail aim; moving or losing sensors drops it.
- PDC variants per mount (plated, or fast): the PDC pick was removed with the six fixed mounts.
- Stalemate after the form: two hulks, drives dead, tubes alive but tail-on, 200 s of nothing
  (brawler mirror seeds 2, 6, 20, 30). Candidates: tail-on tubes may fire at half rate; a
  drive-dead ship is beaten when it cannot bring a weapon to bear; the AI stops turning stern
  when its drive is the only unplated room aft. The owner decides after playing.
- 2 v 2 (the owner asked). Everything assumes one enemy: `enemyOf`, the
  face from one bearing, two silhouette panels on the short edges, tap-a-room
  on one ship, torpedo targets, the AI's rule table, replays. Four ships means
  a new layout, an order for "which enemy", and a battle twice as long to read
  on a phone. Not before the 1 v 1 is fun for a month.
- The enemy AI almost never fires its railgun: 3 shots in 30 sniper vs
  brawler battles (it re-orders headings, so the aim is lost; the gamble is
  0.1). Keeping the bow while the rail is charged made the sniper lose more
  (measured in the hangar PR, reverted). The human is the rail user.
- Flares or decoys against torpedoes (the owner asked after battle 20531, where
  Guard killed 8 of 8). Decision it creates: pop a flare before their salvo
  and keep Raking instead of switching to Guard. What stops it: a small stock,
  like Burns; their living sensors see through part of it. What it costs: an
  eighth button, one more number, torpedoes weaker still. Worth a look only
  after a battle lost because Guard was forced all the way and Rake never got
  its turn, or when a sniper's torpedoes reach the drive too easily.
- Orbit at range in place of HOLD (the owner asked, 2026-10-31): a drag that
  sets a range to keep and the autopilot circles there. Decision it creates:
  pick a band (rail 10 to 15 km, PDC under 3) instead of steering. What stops
  it: the face still matters, an orbit shows the side. What it costs: a new
  order in the sim, a replay version, and the steering decision handed to the
  autopilot. Parked: first the firing arcs while dragging (PR 33); build only
  if steering still feels like work after that.
- From the owner's HUD/FX playtest and blueprint (2026-11-01), parked, not in A, D, E or C:
  a persistent CMD vector (dashed, `CMD`) apart from the actual velocity; threat direction
  ticks and torpedo count/ETA; a dedicated Burn burst in the close-up world stage; reduced
  motion (no shake, white flash, blink); help responsive (one column on the phone, groups);
  hangar stats bigger. Build each only when the owner asks after a battle.

## Long-term visual direction (the owner, 2026-11-01) — do NOT start yet

Sequence: F.1 → the owner's phone playtest → the owner green-lights G. Nothing below is built before that.

- Hard constraint for the multi-class roadmap: every ship visual is generated from form data, never
  hand-authored per class. Many ship classes are planned; anything hand-made per hull is tech debt times N.
- Tier 1 — PR G (2.5D art pass + audio; split by the owner: G1 visual done in PR 46, G2 audio after his G1 playtest: event-matrix sounds, a mute icon in the top bar, hit area ≥ 36 px, not a battle button, default on (armed by the first tap), choice in localStorage): multi-layer parallax starfield; directional hull shading + rim
  light (one consistent key light); Expanse-style drive plume (additive, hash-random flicker, never
  `Math.random`); fake bloom via additive core + halo sprites, strictly respecting the amplitude
  hierarchy (rail/tear > torp hit > Burn > tracers — if everything glows, nothing is epic); a brief
  impact light tint on the hull mark near the hit point; vignette/color grade that never dims HUD text.
  Transforms on decorative layers only — never skew interactive layers (drag parity is sacred). Must
  hold frame rate at 844 × 390 DPR 2.6. Plus an audio pass mapped to the existing event matrix.
- Tier 2 — CINE-2D, room-scale cutaways. The dramatic unit is the room, not the hull: players target
  DRIVE/RAIL/SENSORS, and events carry `ev.at`. Cinematic shots key off (event type × room type), never
  ship class — every class shares the same room types, so one shot set serves all classes. Two shot
  families: (a) hull-plate exterior — close on the armor section covering the hit room, slug/tracer/
  torpedo strikes the plate; (b) room interior — machinery, conduit, red emergency light, debris,
  venting. Cut only on big beats: room death, rail hit/penetration, tear, maybe torp hull hit; never per
  PDC spark. 2–3 variants per shot (clean vs smouldering), flippable to the event's real bearing,
  skippable and toggleable, never blocks command input. The same room art should enrich dock cells (one
  investment, two payoffs). Presentation only: reads events, never touches sim.
- Approved by the owner 2026-11-02, after the hero cam (order in HANDOFF "Now"): explosions by room kind in the hero
  windows (keyed by event x room kind, every class), then the CINE-2D cut shots, spec and owner's answers first.
- Tier 3 — parked: a 3D presentation spike (extrude the room grid into low-poly hulls) only if, after G
  + CINE-2D, it still does not feel right; the owner expects it will not be needed.
