// Tachi-class corvette: the rooms from bow to stern. A ship is data.
// Each room has two properties: hp, and what it does while alive (see ship.js).
// Order matters: shots from ahead hit the first room, shots from behind the last.
import { N } from '../numbers.js';

export const TACHI = {
  id: 'tachi',
  rooms: [
    { id: 'rail',    hp: N.ROOM_HP },     // keel railgun; at the bow so charging in costs you the gun first
    { id: 'sensors', hp: N.ROOM_HP },     // targeting; dead: weapons hit half as often, no rail aim
    { id: 'bridge',  hp: N.ROOM_HP * N.BRIDGE_HP_MULT }, // dead: the ship is beaten
    { id: 'pdc',     hp: N.ROOM_HP },     // PDC deck, two turrets; both fire only broadside
    { id: 'crew',    hp: N.ROOM_HP },     // damage control; dead: reload and recharge at half speed
    { id: 'tubes',   hp: N.ROOM_HP },     // torpedoes; cannot fire when the tail faces the enemy
    { id: 'drive',   hp: N.ROOM_HP },     // dead: no range orders, no turning, no burns
  ],
};
