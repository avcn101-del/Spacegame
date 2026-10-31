// Tachi-class corvette: the rooms from bow to stern. A ship is data.
// Each room has hp and what it does while alive (see ship.js). armor: plated, ARMOR_HP_MULT
// times the hp. bulkhead: a wall aft of this room that spill damage does not cross; the
// bulkheads are the hull's planned tear lines (bow | core | aft | stern sections).
// Order matters: shots from ahead hit the first room, shots from behind the last.
import { N } from '../numbers.js';

export const TACHI = {
  id: 'tachi',
  rooms: [
    { id: 'rail' },                            // keel railgun; at the bow so charging in costs you the gun first
    { id: 'sensors', bulkhead: true },         // targeting; dead: weapons hit half as often, no rail aim
    { id: 'bridge', armor: true },             // dead: the ship is beaten; plated
    { id: 'pdc', armor: true, bulkhead: true },// PDC deck, two turrets; plated (its magazine)
    { id: 'crew' },                            // damage control; dead: reload and recharge at half speed
    { id: 'tubes', armor: true, bulkhead: true }, // torpedoes; plated (its bays); cannot fire tail-on
    { id: 'drive' },                           // dead: no moving, no turning, no burns
  ].map((r) => ({ ...r, hp: N.ROOM_HP * (r.armor ? N.ARMOR_HP_MULT : 1) })),
};
