import { WEAPONS, DEVICES } from './data.js';

/* ============================== LOADOUTS ================================ */
// Selectable loadout choices for the station screen. The player picks three
// weapon slots (keys 1/2/3) and four device slots (Q/F/C/X). cycleChoice
// steps through the available keys, skipping ones already taken by the
// other slots so a loadout never contains duplicates.
const WEAPON_CHOICES = Object.keys(WEAPONS);
const DEVICE_CHOICES = Object.keys(DEVICES);

function cycleChoice(list, current, dir, taken = []) {
  let i = list.indexOf(current);
  for (let n = 0; n < list.length; n++) {
    i = (i + dir + list.length) % list.length;
    if (!taken.includes(list[i])) return list[i];
  }
  return current;
}

export { WEAPON_CHOICES, DEVICE_CHOICES, cycleChoice };
