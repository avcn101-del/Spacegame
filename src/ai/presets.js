// Strategy presets: the knobs of the rule table in enemy.js.
// Both sides can run any preset; the headless arena pits them against each other.
// ship: the design the preset flies (ships/index.js); tachi when unset.
export const PRESETS = {
  // The default enemy: closes, rakes, fires everything, gambles on the railgun.
  brawler: {
    range: 'close',         // where it wants to be
    face: 'auto',           // 'auto' = bow while approaching, side in the knife fight; or 'bow' | 'side'
    pdc: 'auto',            // 'auto' = guard when torpedoes are coming, rake otherwise
    torps: 'always',        // 'always' | 'guardDown' (only when their PDCs are gone) | 'never'
    railGamble: 0.3,        // chance per tick to fire at a target that can still dodge
    burnChance: 0.3,        // chance per tick to burn while a railgun aims at it
    runAt: 2,               // run when this few pieces are left and losing
    openWhenNoPdc: true,    // back off when both PDCs are gone
    target: 'pdc',          // the enemy room it goes for: torpedoes flank to it, PDCs chew it broadside; null for the exposed end
    sternAfterSalvo: true,  // after firing, swing the stern to them while the tubes reload: their answer meets drive and tubes, not rail and sensors
  },
  // Stays out at torpedo range, lets the railgun do the work.
  sniper: {
    range: 'open', face: 'bow', pdc: 'guard', torps: 'always',
    railGamble: 0.1, burnChance: 0.6, runAt: 2, openWhenNoPdc: true, target: 'drive', sternAfterSalvo: true,
  },
  // Closes, keeps PDCs on guard, saves torpedoes until their PDCs are down.
  turtle: {
    range: 'close', face: 'side', pdc: 'guard', torps: 'guardDown',
    railGamble: 0.0, burnChance: 0.6, runAt: 3, openWhenNoPdc: true, target: 'tubes', sternAfterSalvo: true,
  },
  // The Belter gunship: closes broadside for its three turrets, fires everything, never has a rail to gamble.
  // It never shows its stern: with no plating, one salvo end-on kills drive, tubes, crew and bridge (replay 29836).
  gunship: {
    ship: 'belter', range: 'close', face: 'side', pdc: 'auto', torps: 'always',
    railGamble: 0, burnChance: 0.3, runAt: 2, openWhenNoPdc: true, target: 'pdc', sternAfterSalvo: false,
  },
  // Fights until the end, never runs, never dodges.
  berserker: {
    range: 'close', face: 'side', pdc: 'rake', torps: 'always',
    railGamble: 1.0, burnChance: 0.0, runAt: 0, openWhenNoPdc: false, target: null, sternAfterSalvo: false,
  },
};
export const DEFAULT_PRESET = 'brawler';
