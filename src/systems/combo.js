/* =============================== COMBO ================================== */
// Kill-combo scoring (pure math, unit-tested). Kills within the decay window
// build a score multiplier; the timer is ticked with REAL dt so hitstop
// slow-mo never extends a combo.
const COMBO_WINDOW = 4; // seconds to keep a combo alive after a kill
const COMBO_STEP = 5; // kills per +0.5x
const COMBO_MULT_CAP = 2.5; // max bonus over the base 1x

function registerKill(run) {
  run.combo = (run.combo || 0) + 1;
  run.comboT = COMBO_WINDOW;
  run.comboMult = 1 + Math.min(COMBO_MULT_CAP, Math.floor(run.combo / COMBO_STEP) * 0.5);
}

function tickCombo(run, dt) {
  if (!run.combo) return;
  run.comboT -= dt;
  if (run.comboT <= 0) {
    run.combo = 0;
    run.comboT = 0;
    run.comboMult = 1;
  }
}

export { registerKill, tickCombo, COMBO_WINDOW, COMBO_STEP, COMBO_MULT_CAP };
