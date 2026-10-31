// Strategy presets: the knobs of the rule table in enemy.js.
// Both sides can run any preset; the headless arena pits them against each other.
export const PRESETS = {
  // The default enemy: closes, rakes, fires everything, gambles on the railgun.
  brawler: {
    range: 'close',         // where it wants to be
    pdc: 'auto',            // 'auto' = guard when torpedoes are coming, rake otherwise
    torps: 'always',        // 'always' | 'guardDown' (only when their PDCs are gone) | 'never'
    railGamble: 0.3,        // chance per tick to fire at a target that can still dodge
    burnChance: 0.3,        // chance per tick to burn while a railgun aims at it
    runAt: 2,               // run when this few pieces are left and losing
    openWhenNoPdc: true,    // back off when both PDCs are gone
  },
  // Stays out at torpedo range, lets the railgun do the work.
  sniper: {
    range: 'open', pdc: 'guard', torps: 'always',
    railGamble: 0.1, burnChance: 0.6, runAt: 2, openWhenNoPdc: true,
  },
  // Closes, keeps PDCs on guard, saves torpedoes until their PDCs are down.
  turtle: {
    range: 'close', pdc: 'guard', torps: 'guardDown',
    railGamble: 0.0, burnChance: 0.6, runAt: 3, openWhenNoPdc: true,
  },
  // Fights until the end, never runs, never dodges.
  berserker: {
    range: 'close', pdc: 'rake', torps: 'always',
    railGamble: 1.0, burnChance: 0.0, runAt: 0, openWhenNoPdc: false,
  },
};
export const DEFAULT_PRESET = 'brawler';
