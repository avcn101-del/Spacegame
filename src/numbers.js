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
  ACCEL: 0.06,           // main drive, km/s^2; sets how fast range changes
  RUN_ACCEL_MULT: 2,     // Run dumps everything into the drive, so the gap grows
  MAX_SPEED: 0.15,       // closing speed cap per ship; two ships close 9 km in about 30 s
  RANGE_CLOSE: 1.5,      // where Close settles: inside PDC range, knife fight
  RANGE_OPEN: 9,         // where Open settles: outside PDC, inside torpedo range
  RANGE_TOLERANCE: 0.3,  // autopilot stops adjusting inside this band
  LATERAL_DAMP: 1.0,     // per second; autopilot bleeds off sideways drift

  // --- ship ---
  PIECE_HP: 10,          // every piece dies to one torpedo or one slug
  BRIDGE_WEIGHT: 0.5,    // bridge is buried in the hull: half as likely to be the piece hit
  BRIDGE_HP_MULT: 2,     // bridge takes two torpedoes, not one; one lucky hit should not end it

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

  // --- railgun ---
  RAIL_RANGE: 10,        // long; the sniper weapon
  RAIL_RECHARGE: 40,     // about three shots per battle
  RAIL_START_CHARGE: 20, // capacitors are empty at battle start; first shot comes in the knife fight, not the approach
  RAIL_AIM_TIME: 3,      // the window the target has to Burn
  RAIL_DODGE_SPEED: 0.3, // target lateral speed above this at fire time means a miss
  RAIL_SLUG_SPEED: 8,    // visual flight; near instant at these ranges

  // --- burn ---
  BURNS: 3,              // per battle; a scarce dodge, not a habit
  BURN_SPEED: 0.8,       // lateral kick, km/s; well above RAIL_DODGE_SPEED

  // --- enemy ---
  AI_TICK: 1.0,          // the enemy thinks once a second, like a crew, not a computer
  AI_BURN_CHANCE: 0.6,   // per tick while a railgun is aiming at it; it is not perfect
  AI_RUN_PIECES: 2,      // runs when this few pieces are left and it is losing
};
