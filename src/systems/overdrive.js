/* ============================= OVERDRIVE =============================== */
// Ultimate meter (pure run-state math). Charges from kills; at full it can be
// activated for a short window granting a fire-rate + damage boost. Charge and
// the active timer tick on REAL dt (like combo) so hitstop/slow-mo can't warp
// them. Game/Player read the multipliers while active.
const OD_DURATION = 6; // seconds of overdrive when activated
const OD_FIRE_MULT = 1.7; // fire-rate multiplier while active
const OD_DAMAGE_MULT = 1.5; // damage multiplier while active

function addCharge(run, amount) {
  if (run.odActive > 0) return; // don't refill mid-overdrive
  run.odCharge = Math.min(100, (run.odCharge || 0) + amount);
}

function canActivate(run) {
  return (run.odCharge || 0) >= 100 && (run.odActive || 0) <= 0;
}

function activate(run) {
  if (!canActivate(run)) return false;
  run.odActive = OD_DURATION;
  run.odCharge = 0;
  return true;
}

function tickOverdrive(run, dt) {
  if (run.odActive > 0) run.odActive = Math.max(0, run.odActive - dt);
}

function isActive(run) {
  return (run.odActive || 0) > 0;
}

export {
  addCharge,
  canActivate,
  activate,
  tickOverdrive,
  isActive,
  OD_DURATION,
  OD_FIRE_MULT,
  OD_DAMAGE_MULT,
};
