import { MISSIONS } from '../config/data.js';

/* =============================== MISSION ================================ */
class Mission {
  constructor(game, key) {
    this.game = game;
    this.key = key;
    this.def = MISSIONS[key];
    this.complete = false;
    this.bonus = false;
  }
  update(dt) {
    const g = this.game,
      r = g.run;
    switch (this.key) {
      case 'resourceRun':
        this.complete = r.deliveredValue >= 120;
        this.bonus = r.deliveredValue >= 200;
        break;
      case 'hivePurge':
        this.complete = r.hivesDestroyed >= 2;
        this.bonus = r.maxHiveLevelKilled >= 3;
        break;
      case 'outpostRecovery':
        if (r.reactorActivated) r.reactorTimer += dt;
        this.complete = r.reactorActivated && r.deliveredValue >= 60 && r.reactorTimer >= 90;
        this.bonus = this.complete && !r.muleLost;
        break;
    }
  }
  objectiveText() {
    const g = this.game,
      r = g.run;
    switch (this.key) {
      case 'resourceRun':
        return 'Deliver: ' + Math.min(120, r.deliveredValue) + ' / 120 cr';
      case 'hivePurge':
        return 'Hives: ' + Math.min(2, r.hivesDestroyed) + ' / 2 destroyed';
      case 'outpostRecovery': {
        if (!r.reactorActivated) return 'Activate the outpost reactor [E]';
        const parts = [];
        parts.push('Cargo: ' + Math.min(60, r.deliveredValue) + '/60 cr');
        parts.push('Hold: ' + Math.min(90, Math.floor(r.reactorTimer)) + '/90s');
        return parts.join('  •  ');
      }
    }
    return '';
  }
}

export { Mission };
