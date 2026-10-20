/**
 * High-performance zero-allocation 2D Spatial Hash Grid for Zombie Chase v3.0
 */
export class SpatialHash {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map();
    this._pool = [];
  }

  _key(cx, cz) {
    // Pack two signed 16-bit ints into a 32-bit integer key
    return ((cx & 0xffff) << 16) | (cz & 0xffff);
  }

  clear() {
    for (const list of this.cells.values()) {
      list.length = 0;
      this._pool.push(list);
    }
    this.cells.clear();
  }

  insert(entity) {
    const cx = Math.floor(entity.x * this.invCellSize);
    const cz = Math.floor(entity.z * this.invCellSize);
    const key = this._key(cx, cz);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = this._pool.pop() || [];
      this.cells.set(key, cell);
    }
    cell.push(entity);
  }

  /**
   * Returns all entities within radius of (x, z).
   * Writes into `out` array (cleared before writing) to avoid GC pressure.
   */
  queryRadius(x, z, radius, out = []) {
    out.length = 0;
    const rSq = radius * radius;
    const minX = Math.floor((x - radius) * this.invCellSize);
    const maxX = Math.floor((x + radius) * this.invCellSize);
    const minZ = Math.floor((z - radius) * this.invCellSize);
    const maxZ = Math.floor((z + radius) * this.invCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const cell = this.cells.get(this._key(cx, cz));
        if (!cell) continue;
        for (let i = 0, len = cell.length; i < len; i++) {
          const e = cell[i];
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz <= rSq) {
            out.push(e);
          }
        }
      }
    }
    return out;
  }
}
