/* =============================== POOL =================================== */
// Generic object pool to avoid per-frame allocation (GC hitches) for hot,
// short-lived entities like projectiles, particles and damage numbers.
// `factory()` builds a fresh instance; `reset(obj, ...args)` re-initializes a
// recycled one to the state its constructor would have set. Callers acquire on
// spawn and release when the entity is dead.
class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
  }
  acquire(...args) {
    const obj = this.free.length ? this.free.pop() : this.factory();
    this.reset(obj, ...args);
    return obj;
  }
  release(obj) {
    this.free.push(obj);
  }
}

export { Pool };
