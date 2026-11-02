// Every tunable number in the game. One line of reason each.
// Tune by doubling or halving. Units: km, seconds, "hp" (abstract).

export const N = {
  // --- time ---
  DT: 1 / 60,            // sim step; fixed so the battle is deterministic
  BATTLE_MAX: 240,       // hard stop, a draw; keeps every battle under 4 minutes
  SLOWMO_SCALE: 0.25,    // time scale during an impact beat; the "epic" moment
  SLOWMO_TIME: 0.6,      // how long a beat lasts in real seconds

  // --- space ---
  START_RANGE: 12,       // far enough that approach takes about 30 to 45 s
  ESCAPE_RANGE: 20,      // past this, a running ship is gone; wider than the rail, so a sniper has a band to work in
  DRAG_FULL_PX: 120,     // a drag this long (CSS px) asks for MAX_SPEED
  DRAG_DEAD_PX: 12,      // shorter than this is a tap, not a drag
  ACCEL: 0.06,           // main drive, km/s^2; sets how fast range changes
  RUN_ACCEL_MULT: 2,     // Run dumps everything into the drive, so the gap grows
  MAX_SPEED: 0.3,        // the longest drag asks for this relative speed, km/s; 9 km in 30 s
  RANGE_MIN: 0.5,        // autopilot never closes past this; ships do not ram
  AUTOPILOT_GAIN: 2.0,   // per second; how hard the autopilot chases the asked relative velocity
  RANGE_CLOSE: 1.5,      // where the enemy AI wants to be when closing: inside PDC range
  RANGE_OPEN: 9,         // where the enemy AI wants to be when opening: outside PDC, inside torpedo range
  RANGE_TOLERANCE: 0.3,  // the AI stops adjusting inside this band

  // --- ship ---
  ROOM_HP: 10,           // a room dies to one torpedo or one slug
  ARMOR_HP_MULT: 2,      // a plated room takes two torpedoes, not one; which rooms are plated is the ship's design
  HULL_BEATEN_FRACTION: 0.5, // a ship with half its cells cut away is finished (the owner, battle 68: a bridge and one mount left is no ship)
  FRAME_HP: 5,           // a frame room (structure, an empty hardpoint) is cover: it takes half a torpedo, the rest carries into the room behind
  FACE_TURN_TIME: 4,     // seconds to swing the hull 90 degrees; a bigger swing takes proportionally longer
  BOW_CONE: 45,          // degrees off the bearing to the enemy that still count as bow-on (or tail-on at the other end); between is broadside
  OFF_AXIS_ACCEL: 0.5,   // thrusters push half as hard as the main drive; facing the wrong way is slow
  SPILL: 0.5,            // torpedo and rail: share of damage that carries into the next room on the ray (from frame, what its hp did not absorb carries instead)
  SENSORS_DEAD_HIT: 0.5, // with sensors gone, PDC and torpedoes hit this fraction as often
  CREW_DEAD_SPEED: 0.5,  // with crew gone, reload and recharge run at this speed

  // --- PDC ---
  PDC_RANGE: 3,          // short; "stopped by distance"
  PDC_RAKE_DPS: 0.5,     // hull damage per turret per second at point blank; a piece lasts about 20 s under two turrets at knife range
  PDC_GUARD_KILL_RATE: 0.375, // torpedo kill chance per mount per second at point blank; half of (0.5 + 0.25): at 1.0 six mounts end-on killed 98 percent of torpedoes, at 0.25 only 61; 40 brawler battles: three in four died with the old relative speed cap, about one in two with TORP_DV (the torpedoes close faster: approach speeds add)
  PDC_TRACER_RATE: 14,   // tracers drawn per second per turret; purely visual

  // --- torpedo ---
  TORP_COUNT: 12,        // per ship, per battle: three salvos; the stock runs out, so the fight ends
  TORP_SALVO: 4,         // four at once saturate one or two PDC turrets: a Guard kills about one in two (80 brawler battles: 51 percent), so one or two of a salvo land
  TORP_RELOAD: 20,       // between salvos; gives the enemy time to answer
  TORP_RANGE: 10,        // launch only inside this; approach phase is "torpedo range only"
  TORP_BOOST: 1.5,       // km/s the torpedo adds to the closing speed it had at launch: from a standing launch it crosses PDC range in 2 s, so Guard has a chance, not a certainty. A launcher (or a target) coming in adds its own speed: a Burn and a salvo arrive faster, with less time under the PDCs
  TORP_DV: 3,            // km/s of drive per torpedo, boost and steering together: the boost, then enough to follow one Burn of the target (0.8) with some left; a target that keeps running drains it, and a dry torpedo flies straight on and misses
  TORP_HOMING: 2.0,      // km/s^2 the torpedo's drive pushes; the faster it closes, the less time it has to correct, so a late Burn dodges a fast one more often
  TORP_FUSE: 0.3,        // km; a torpedo that passes this close goes off. Past it, at full speed it cannot turn back around (turn radius about 1.1 km) and would circle forever
  TORP_FLANK: 1.0,       // km beside the target a torpedo swings out to, to reach a room that is not exposed
  TORP_FLANK_SPEED: 0.5, // fraction of TORP_BOOST while swinging wide: slow enough to make the turn in; the cost of a buried room is time under their PDCs

  // --- railgun ---
  RAIL_RANGE: 15,        // long; the sniper weapon: 5 km past the torpedoes, so a rail ship can shoot where it cannot be shot back
  RAIL_RECHARGE: 40,     // about three shots per battle
  RAIL_START_CHARGE: 20, // capacitors are empty at battle start; first shot comes in the knife fight, not the approach
  RAIL_AIM_TIME: 3,      // the window the target has to Burn
  // A Burn at any moment during the enemy's aim makes the shot miss: readable, no timing trick.
  RAIL_SLUG_SPEED: 8,    // visual flight; near instant at these ranges

  // --- burn ---
  BURNS: 3,              // per battle; a scarce dodge, not a habit
  BURN_SPEED: 0.8,       // kick along the hull, km/s; bow-on it closes about 3 km on a ship that holds range, before that ship's drive cancels it

  // --- enemy ---
  AI_TICK: 1.0,          // the enemy thinks once a second, like a crew, not a computer
  AI_BURN_CHANCE: 0.3,   // per tick while a railgun is aiming at it; about two in three shots dodged
  AI_RAIL_GAMBLE: 0.3,   // chance per tick to fire the railgun at a target that could still dodge
  AI_RUN_PIECES: 2,      // runs when this few pieces are left and it is losing
  AI_BURN_SALVO_CONE: 30, // degrees: the AI Burns before a salvo only with the bow this close to them (the kick goes where the nose points)
  AI_TORP_DODGE: 1.0,    // km: the AI Burns when a torpedo of theirs is this close and closing (keeps one Burn for the railgun)
  AI_HEADING_TOL: 10,    // degrees; the AI does not re-order a heading that is closer than this
};
