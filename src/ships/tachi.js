// Tachi-class corvette: the rooms from bow to stern. A ship is data.
// Each room has hp and what it does while alive (see ship.js). kind: what the slot holds, for
// later variants (no catalog yet). armor: plated, ARMOR_HP_MULT times the hp. bulkhead: a wall
// aft of this room that spill damage does not cross. The bridge sits in the middle of the chain:
// a room with no living path to it tears off (ship.js tornRooms), so one cut loses at most three
// rooms. Order matters: shots from ahead hit the first room, shots from behind the last.
import { N } from '../numbers.js';

export const TACHI = {
  id: 'tachi',
  rooms: [
    { id: 'rail', kind: 'gun' },                            // keel railgun; at the bow so charging in costs you the gun first
    { id: 'sensors', kind: 'sensors', bulkhead: true },     // targeting; dead: weapons hit half as often, no rail aim
    { id: 'pdc', kind: 'pdc', armor: true, bulkhead: true },// PDC deck, two turrets; plated (its magazine); dead: the bow tears off
    { id: 'bridge', kind: 'core', armor: true },            // dead: the ship is beaten; plated; the room every other room must reach
    { id: 'crew', kind: 'crew' },                           // damage control; dead: reload and recharge at half speed, and the stern tears off
    { id: 'tubes', kind: 'launcher', armor: true, bulkhead: true }, // torpedoes; plated (its bays); cannot fire tail-on; dead: the drive tears off
    { id: 'drive', kind: 'drive' },                         // dead: no moving, no turning, no burns
  ].map((r) => ({ ...r, hp: N.ROOM_HP * (r.armor ? N.ARMOR_HP_MULT : 1) })),
};
