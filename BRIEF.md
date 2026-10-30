# Prototype 0 brief

Approved by the owner in chat, 2026-10-30. This is the whole scope of
prototype 0. Anything not here goes to `NOTES.md`.

## Ships

Two Tachi-class corvettes, Martian build, identical rules and loadout.
Yours is Roci-inspired. The enemy is Pella-inspired. Mirror match: fairness
is free, only the decisions are being tested.

Each ship is six pieces, drawn on its silhouette. A piece that takes enough
hits goes dark and stops working.

| Piece        | Where | Does                                   |
|--------------|-------|----------------------------------------|
| Railgun      | bow   | one shot, kills a whole piece on hit   |
| PDC port     | mid   | tracers, guards or rakes               |
| PDC starboard| mid   | tracers, guards or rakes               |
| Bridge       | mid   | if dark, the ship is beaten            |
| Tubes        | stern | fires torpedoes                        |
| Drive        | stern | range orders and burns need it         |

A ship is beaten when its Bridge is dark, or when Railgun, both PDCs and
Tubes are all dark (nothing left to shoot with).

## Weapons, and the one thing that stops each

- PDC: constant tracers, short range. Stopped by distance.
- Torpedo: slow, homing, breaks a piece. Stopped by a PDC in Guard mode.
  One warhead type. 6 per ship, fired in pairs.
- Railgun: needs 3 s of steady aim, no burning while aiming. Stopped by the
  target burning sideways during those 3 s.

All three are in prototype 0. Nothing else from the show is.

## Orders (the decisions)

1. Range: Close / Hold / Open. Start of battle, any time after.
2. PDC: Guard (shoot torpedoes) / Rake (shoot their hull). When torpedoes
   are in the air; when inside PDC range.
3. Torpedoes: fire a pair. When the tubes are loaded, 6 total.
4. Railgun: aim 3 s and shoot. When charged, about every 40 s.
5. Burn: sideways dodge, 3 per battle. When the screen warns their railgun
   is charging.
6. Run: disengage, battle ends as an escape. Any time; meant for when half
   the ship is dark.

The enemy uses the same six orders from a small rule table plus seeded
random. Active pause: Pause stops the clock, orders can be given while
paused, resume executes them.

## Screen

Phone landscape, about 844 x 390. Left: your silhouette, pieces dark as
they die. Right: theirs. Middle: a tactical strip with both ships as marks,
PDC tracers, torpedoes, railgun slugs. Four numbers: Range, Torpedoes,
Burns, Clock. One line of text: the current order. Six order buttons along
the bottom. Pause in a top corner.

Impacts are the spectacle: flash, shockwave ring, debris flying off the
silhouette, screen shake, a short slow-motion beat when a railgun lands or a
piece dies. All drawn procedurally on canvas, no image files.

## Phases

- Approach, 0:30 to 0:45: torpedo range only.
- Knife fight, 1:00 to 2:00: inside PDC range, railgun chances.
- Break, 0:30 to 1:00: one ship crippled, finish or run.
- Hard stop at 4:00 as a draw. The clock is game time, pause does not count.

## Out of prototype 0

Shipyard and parts, power routing, crew, heat, more than two ships,
asymmetric ships, nuke warheads, boarding, campaign, sound, image art,
save files, desktop layout, smart AI.
