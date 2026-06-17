/* ============================== CLASSES ================================= */
// Clone classes change moment-to-moment feel via stat multipliers + a class
// ability (G). All fields optional with neutral defaults (missing mult ⇒ 1),
// so adding a class never touches Player logic. Weapon choice stays with the
// loadout system; classes adjust stats + grant an ability (deviation from the
// plan's startWeapons override, to avoid fighting the loadout picker).
const CLASSES = {
  vanguard: {
    name: 'Vanguard',
    desc: 'Balanced all-rounder.',
    ability: { id: 'overclock', name: 'Overclock', cd: 18, dur: 4 },
  },
  scout: {
    name: 'Scout',
    desc: 'Fast & fragile. Blink dash, weaker frame.',
    hpMult: 0.8,
    speedMult: 1.25,
    dashCdMult: 0.7,
    scanRangeMult: 1.4,
    ability: { id: 'blink', name: 'Blink Dash', cd: 8, dur: 0.4 },
  },
  engineer: {
    name: 'Engineer',
    desc: 'Devices recharge faster; repair pulse.',
    deviceCdMult: 0.7,
    ability: { id: 'repairPulse', name: 'Repair Pulse', cd: 20, dur: 0 },
  },
  heavy: {
    name: 'Heavy',
    desc: 'Slow tank. More HP & armor; bulwark.',
    hpMult: 1.4,
    speedMult: 0.85,
    armorAdd: 20,
    ability: { id: 'bulwark', name: 'Bulwark', cd: 16, dur: 3 },
  },
};

const CLASS_KEYS = Object.keys(CLASSES);

export { CLASSES, CLASS_KEYS };
