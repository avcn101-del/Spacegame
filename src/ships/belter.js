// Belter gunship: the second ship, as data. No railgun, a PDC deck with three turrets, a deeper
// torpedo stock, half the drive, and no plating anywhere: a cobbled hull, every room dies to one
// torpedo. Six rooms, bridge in the middle. Shots from ahead meet the
// sensors first: a gunship that charges nose-first goes blind early. Arena, 30 seeds: beats the
// brawler 19/11 and the sniper 20/10; plated it was 23/7 and 22/8.
import { N } from '../numbers.js';

export const BELTER = {
  id: 'belter',
  torps: 16,     // four salvos, not three: it fights with torpedoes and guns, nothing else
  accel: 0.5,    // fraction of ACCEL: a hauler's drive; it cannot pick the range, you can
  rooms: [
    { id: 'sensors', kind: 'sensors' },                     // at the bow, unplated: the gunship's soft nose
    { id: 'pdc', kind: 'pdc', turrets: 3 },                 // three turrets broadside, two end-on
    { id: 'bridge', kind: 'core' },            // dead: the ship is beaten; one torpedo does it
    { id: 'crew', kind: 'crew' },                           // dead: half-speed reload
    { id: 'tubes', kind: 'launcher' },                 // dead: no torpedoes
    { id: 'drive', kind: 'drive' },                         // dead: adrift
  ].map((r) => ({ ...r, hp: N.ROOM_HP * (r.armor ? N.ARMOR_HP_MULT : 1) })),
  // The form: a shorter, boxier hull, 20 x 7 cells, keel on row 3. Three turret sponsons (two above,
  // one below), the sensors A filling the soft nose, the bays L just aft of them, two bulkheads K.
  form: {
    rows: [
      '......TT.....TT.....',
      '.FFFKFTTFFFFFTTFFKF.',
      'EEFFKQQFFBBFFFFLLKAA',
      'EEFFKQQFFBBFFFFLLKAA',
      'EEFFKQQFFBBFFFFLLKAA',
      '.FFFKFFFFFFFFTTFFKF.',
      '.............TT.....',
    ],
    rooms: { A: 'sensors', T: 'pdc', B: 'bridge', Q: 'crew', L: 'tubes', E: 'drive' },
  },
};
