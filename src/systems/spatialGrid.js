/* ============================ SPATIAL GRID ============================== */
// Uniform grid for fast neighbor queries (projectile collision, AOE, turret
// targeting). Rebuilt every frame: clear() + insert() each live entity, then
// query. Cells are reused across frames (arrays truncated, not re-allocated)
// to avoid GC churn.
class SpatialGrid {
  constructor(cell = 128) {
    this.cell = cell;
    this.cells = new Map(); // "cx,cy" -> array of entities
  }
  clear() {
    for (const arr of this.cells.values()) arr.length = 0;
  }
  insert(e) {
    const key = Math.floor(e.x / this.cell) + ',' + Math.floor(e.y / this.cell);
    let arr = this.cells.get(key);
    if (!arr) {
      arr = [];
      this.cells.set(key, arr);
    }
    arr.push(e);
  }
  // Calls cb(entity) for every entity in cells overlapping the circle.
  // Candidates may lie outside the radius — callers do their own exact
  // distance check. If cb returns true, iteration stops early.
  queryCircle(x, y, r, cb) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c),
      x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c),
      y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(cx + ',' + cy);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          if (cb(arr[i]) === true) return;
        }
      }
    }
  }
}

export { SpatialGrid };
