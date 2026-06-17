/* ============================= MODIFIERS ================================ */
// Expedition modifiers: risk/reward run mutators drafted before landing.
// Each is plain data with multiplier/flag fields read generically by the
// systems (no per-id switch). aggregate() folds a chosen set into one neutral-
// defaulted object; payout is clamped to keep balance sane.
const MODIFIERS = {
  ironHives: {
    name: 'Iron Swarm',
    desc: '+40% enemy armor.',
    enemyArmorAdd: 0.4,
    payoutMult: 1.25,
  },
  blackout: {
    name: 'Signal Blackout',
    desc: 'Signal drains 60% faster.',
    signalDrainMult: 1.6,
    payoutMult: 1.3,
  },
  swarmlord: {
    name: 'Swarmlord',
    desc: 'Spawn rate +35%.',
    spawnRateMult: 1.35,
    payoutMult: 1.3,
  },
  richVeins: {
    name: 'Rich Veins',
    desc: '+50% resource value, start at +1 threat.',
    valueMult: 1.5,
    startThreatAdd: 1,
  },
  glassClone: {
    name: 'Glass Protocol',
    desc: '-30% clone HP, +40% damage.',
    playerHpMult: 0.7,
    playerDmgMult: 1.4,
    payoutMult: 1.2,
  },
  bulwarkSwarm: {
    name: 'Brood Vigor',
    desc: '+30% enemy HP.',
    enemyHpMult: 1.3,
    payoutMult: 1.25,
  },
};

const MODIFIER_KEYS = Object.keys(MODIFIERS);

const NEUTRAL = {
  payoutMult: 1,
  spawnRateMult: 1,
  enemyHpMult: 1,
  enemyArmorAdd: 0,
  signalDrainMult: 1,
  valueMult: 1,
  playerHpMult: 1,
  playerDmgMult: 1,
  startThreatAdd: 0,
};

// Fold chosen modifier ids into one aggregate. Mults multiply, adds sum.
// Payout product is clamped to ×3 to protect balance.
function aggregate(ids) {
  const agg = { ...NEUTRAL };
  for (const id of ids || []) {
    const m = MODIFIERS[id];
    if (!m) continue;
    if (m.payoutMult) agg.payoutMult *= m.payoutMult;
    if (m.spawnRateMult) agg.spawnRateMult *= m.spawnRateMult;
    if (m.enemyHpMult) agg.enemyHpMult *= m.enemyHpMult;
    if (m.enemyArmorAdd) agg.enemyArmorAdd += m.enemyArmorAdd;
    if (m.signalDrainMult) agg.signalDrainMult *= m.signalDrainMult;
    if (m.valueMult) agg.valueMult *= m.valueMult;
    if (m.playerHpMult) agg.playerHpMult *= m.playerHpMult;
    if (m.playerDmgMult) agg.playerDmgMult *= m.playerDmgMult;
    if (m.startThreatAdd) agg.startThreatAdd += m.startThreatAdd;
  }
  agg.payoutMult = Math.min(3, agg.payoutMult);
  return agg;
}

export { MODIFIERS, MODIFIER_KEYS, NEUTRAL, aggregate };
