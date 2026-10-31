// Tachi-class corvette: the rooms from bow to stern. A ship is data.
// Each room has hp and what it does while alive (see ship.js). kind: what the slot holds, for
// later variants (no catalog yet). armor: plated, ARMOR_HP_MULT times the hp. The order is bow to
// stern for the HUD and the AI; where a shot lands is the form below (ship.js lineOfFire), and a
// cell with no living path to the bridge breaks away (ship.js cutOff). The bulkheads are frame now.
import { N } from '../numbers.js';

export const TACHI = {
  id: 'tachi',
  torps: N.TORP_COUNT, // three salvos
  accel: 1,            // fraction of ACCEL: the full corvette drive
  rooms: [
    { id: 'rail', kind: 'gun' },                            // keel railgun; at the bow so charging in costs you the gun first
    { id: 'sensors', kind: 'sensors' },                     // targeting; dead: weapons hit half as often, no rail aim
    { id: 'pdc', kind: 'pdc', armor: true, turrets: 2 },    // PDC deck, two turrets broadside, one end-on; plated (its magazine)
    { id: 'bridge', kind: 'core', armor: true },            // dead: the ship is beaten; plated; the cell every other cell must reach
    { id: 'crew', kind: 'crew' },                           // damage control; dead: reload and recharge at half speed
    { id: 'tubes', kind: 'launcher', armor: true },         // torpedoes; plated (its bays); cannot fire tail-on
    { id: 'drive', kind: 'drive' },                         // dead: no moving, no turning, no burns
  ].map((r) => ({ ...r, hp: N.ROOM_HP * (r.armor ? N.ARMOR_HP_MULT : 1) })),
  // The form (ARCHITECTURE.md "The form"): draft 12 of the owner's Roci form, 28 x 9 cells of 5 m,
  // stern at x 0, bow at the right, the keel on row 4. A letter in `rooms` is a job room's cell; every
  // other letter is frame, one frame room per 4-connected group of the same letter (bulkheads K,
  // spine S, hull frame F, and the empty hardpoints: reactors R, heat sink H, shield generator X,
  // cockpit C, workshop W, empty slots e c, the vent v). A: the antenna, the sensors' one cell.
  form: {
    rows: [
      '........TT..................',
      '.FFFKKFFTT..FFFFF...........',
      'FFeeKKQQQmAKWWBBHHRRKLL.....',
      'EEeeKKQQQFFKWWBBHHRRKFFFFF..',
      'EESSSSSSSSSSSSSSSSGGGGGGGGGG',
      'EEeeKKDDDFFKccCCXXRRKFFFFF..',
      'FFeeKKDDDmvKccCCXXRRKLL.....',
      '.FFFKKFFTT..FFFFF...........',
      '........TT..................',
    ],
    rooms: { G: 'rail', A: 'sensors', T: 'pdc', m: 'pdc', B: 'bridge', Q: 'crew', D: 'crew', L: 'tubes', E: 'drive' },
  },
};
