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
  ESCAPE_RANGE: 16,      // past this, a running ship is gone
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
  BRIDGE_WEIGHT: 0.5,    // broadside: bridge is buried in the hull, half as likely to be the room hit
  BRIDGE_HP_MULT: 2,     // bridge takes two hits, not one; one lucky hit should not end it
  FACE_TURN_TIME: 4,     // seconds to swing the hull 90 degrees; a bigger swing takes proportionally longer
  BOW_CONE: 45,          // degrees off the bearing to the enemy that still count as bow-on (or tail-on at the other end); between is broadside
  OFF_AXIS_ACCEL: 0.5,   // thrusters push half as hard as the main drive; facing the wrong way is slow
  SPILL: 0.5,            // torpedo and rail: share of damage that carries into the next room in line
  SENSORS_DEAD_HIT: 0.5, // with sensors gone, PDC and torpedoes hit this fraction as often
  CREW_DEAD_SPEED: 0.5,  // with crew gone, reload and recharge run at this speed

  // --- PDC ---
  PDC_RANGE: 3,          // short; "stopped by distance"
  PDC_RAKE_DPS: 0.5,     // hull damage per turret per second at point blank; a piece lasts about 20 s under two turrets at knife range
  PDC_GUARD_KILL_RATE: 1.0, // torpedo kill chance per turret per second at point blank
  PDC_TRACER_RATE: 14,   // tracers drawn per second per turret; purely visual

  // --- torpedo ---
  TORP_COUNT: 6,         // per ship, per battle; the stock runs out, so the fight ends
  TORP_SALVO: 2,         // fired in pairs so two turrets each have a target
  TORP_RELOAD: 20,       // between salvos; gives the enemy time to answer
  TORP_RANGE: 10,        // launch only inside this; approach phase is "torpedo range only"
  TORP_SPEED: 1.5,       // crosses PDC range in 2 s, so Guard has a chance, not a certainty
  TORP_HOMING: 2.0,      // km/s^2 toward target; enough to follow a burning ship
  TORP_FUSE: 0.3,        // km; a torpedo that passes this close goes off. Past it, at full speed it cannot turn back around (turn radius about 1.1 km) and would circle forever
  TORP_FLANK: 1.0,       // km beside the target a torpedo swings out to, to reach a room that is not exposed
  TORP_FLANK_SPEED: 0.5, // fraction of TORP_SPEED while swinging wide: slow enough to make the turn in; the cost of a buried room is time under their PDCs

  // --- railgun ---
  RAIL_RANGE: 10,        // long; the sniper weapon
  RAIL_RECHARGE: 40,     // about three shots per battle
  RAIL_START_CHARGE: 20, // capacitors are empty at battle start; first shot comes in the knife fight, not the approach
  RAIL_AIM_TIME: 3,      // the window the target has to Burn
  // A Burn at any moment during the enemy's aim makes the shot miss: readable, no timing trick.
  RAIL_SLUG_SPEED: 8,    // visual flight; near instant at these ranges

  // --- burn ---
  BURNS: 3,              // per battle; a scarce dodge, not a habit
  BURN_SPEED: 0.8,       // lateral kick, km/s; what the dodge looks like on the map

  // --- enemy ---
  AI_TICK: 1.0,          // the enemy thinks once a second, like a crew, not a computer
  AI_BURN_CHANCE: 0.3,   // per tick while a railgun is aiming at it; about two in three shots dodged
  AI_RAIL_GAMBLE: 0.3,   // chance per tick to fire the railgun at a target that could still dodge
  AI_RUN_PIECES: 2,      // runs when this few pieces are left and it is losing
  AI_HEADING_TOL: 10,    // degrees; the AI does not re-order a heading that is closer than this
};
