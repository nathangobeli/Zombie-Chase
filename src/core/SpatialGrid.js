/**
 * 2D Spatial Hash Grid for high-performance proximity queries and collision detection.
 * Avoids O(N^2) checks by grouping entities into grid buckets on the X-Z plane.
 * Reuses bucket arrays across frames to eliminate GC pressure.
 */
export class SpatialGrid {
  constructor(cellSize = 4.0) {
    this.cellSize = cellSize;
    this.invCellSize = 1.0 / cellSize;
    // Map of "cellX,cellZ" => array of entity references
    this.buckets = new Map();
    // Object pool for bucket arrays to avoid GC allocations
    this.bucketPool = [];
    // Static building obstacles AABBs
    this.obstacles = [];
    this.chunkObstacles = new Map();
    this.onCarDemolished = null; // (obstacle, hitDirX, hitDirZ)
    this.onStorefrontBreached = null; // (obstacle, hitDirX, hitDirZ)
  }

  setObstacles(obstacles) {
    this.obstacles = obstacles || [];
    this.chunkObstacles.clear();
  }

  setChunkObstacles(chunkKey, obstacles) {
    this.chunkObstacles.set(chunkKey, obstacles || []);
    this._rebuildObstaclesList();
  }

  removeChunkObstacles(chunkKey) {
    if (this.chunkObstacles.delete(chunkKey)) {
      this._rebuildObstaclesList();
    }
  }

  _rebuildObstaclesList() {
    this.obstacles = [];
    for (const list of this.chunkObstacles.values()) {
      for (let i = 0; i < list.length; i++) {
        this.obstacles.push(list[i]);
      }
    }
  }

  clear() {
    for (const [key, list] of this.buckets) {
      list.length = 0;
      this.bucketPool.push(list);
    }
    this.buckets.clear();
  }

  _getKey(cellX, cellZ) {
    return `${cellX},${cellZ}`;
  }

  insert(entity) {
    const cx = Math.floor(entity.x * this.invCellSize);
    const cz = Math.floor(entity.z * this.invCellSize);
    const key = this._getKey(cx, cz);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = this.bucketPool.length > 0 ? this.bucketPool.pop() : [];
      this.buckets.set(key, bucket);
    }
    bucket.push(entity);
  }

  /**
   * Zero-allocation callback iteration for all entities within radius.
   * Callback signature: (entity, distSq) => boolean (return true to abort early)
   */
  forEachNearby(x, z, radius, callback) {
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCz = Math.floor((z - radius) * this.invCellSize);
    const maxCz = Math.floor((z + radius) * this.invCellSize);
    const rSq = radius * radius;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = this._getKey(cx, cz);
        const bucket = this.buckets.get(key);
        if (!bucket) continue;

        for (let i = 0; i < bucket.length; i++) {
          const entity = bucket[i];
          const dx = entity.x - x;
          const dz = entity.z - z;
          const dSq = dx * dx + dz * dz;

          if (dSq <= rSq) {
            const stop = callback(entity, dSq);
            if (stop) return;
          }
        }
      }
    }
  }

  /**
   * Returns array of entities in the cone originating at (x, z) pointing along (dirX, dirZ).
   */
  forEachInCone(x, z, dirX, dirZ, length, coneAngleRad, callback) {
    const minCx = Math.floor((x - length) * this.invCellSize);
    const maxCx = Math.floor((x + length) * this.invCellSize);
    const minCz = Math.floor((z - length) * this.invCellSize);
    const maxCz = Math.floor((z + length) * this.invCellSize);
    const lenSq = length * length;
    const minCos = Math.cos(coneAngleRad * 0.5);

    // Normalize direction
    const dLen = Math.hypot(dirX, dirZ) || 1.0;
    const ndx = dirX / dLen;
    const ndz = dirZ / dLen;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = this._getKey(cx, cz);
        const bucket = this.buckets.get(key);
        if (!bucket) continue;

        for (let i = 0; i < bucket.length; i++) {
          const entity = bucket[i];
          const dx = entity.x - x;
          const dz = entity.z - z;
          const dSq = dx * dx + dz * dz;

          if (dSq <= lenSq && dSq > 0.0001) {
            const dist = Math.sqrt(dSq);
            const dot = (dx * ndx + dz * ndz) / dist;
            if (dot >= minCos) {
              const stop = callback(entity, dist);
              if (stop) return;
            }
          }
        }
      }
    }
  }

  /**
   * Resolves Circle vs Static Building AABB Collisions.
   * Smoothly pushes entity outside the building box so characters slide along walls.
   * Supports Continuous Collision Detection (CCD) for fast entities to prevent tunneling.
   */
  resolveObstacles(entity, radius = 0.55, useCCD = false, prevX = null, prevZ = null) {
    let steps = 1;
    let startX = entity.x;
    let startZ = entity.z;
    let dx = 0;
    let dz = 0;

    if (useCCD && prevX !== null && prevZ !== null) {
      dx = entity.x - prevX;
      dz = entity.z - prevZ;
      const dist = Math.hypot(dx, dz);
      // If moving more than half a radius in one frame, break into multiple checks
      if (dist > radius * 0.5) {
        steps = Math.ceil(dist / (radius * 0.5));
        startX = prevX;
        startZ = prevZ;
      }
    }

    let currentX = startX;
    let currentZ = startZ;
    let collided = null;

    for (let step = 1; step <= steps; step++) {
      if (steps > 1) {
        currentX = startX + (dx * step) / steps;
        currentZ = startZ + (dz * step) / steps;
      }
      
      for (let i = 0; i < this.obstacles.length; i++) {
        const b = this.obstacles[i];
        if (b.disabled) continue;

        // Quick distance check from center
        const distX = currentX - b.centerX;
        const distZ = currentZ - b.centerZ;
        if (Math.abs(distX) > b.halfW + radius || Math.abs(distZ) > b.halfD + radius) {
          continue;
        }

        // Titan smashing through parked / blocking car without deceleration
        if (entity.isTitan && b.isCar) {
          b.disabled = true;
          if (b.prop && !b.prop.knocked) {
            b.prop.knocked = true;
            if (b.prop.chunk && b.prop.chunk.collapseProp) {
              b.prop.chunk.collapseProp(b.prop);
            }
          }
          if (this.onCarDemolished) {
            this.onCarDemolished(b, entity.vx || (currentX - b.centerX), entity.vz || (currentZ - b.centerZ));
          }
          continue;
        }

        // Storefront glass facade breached by Titan or 20+ horde members (@designer)
        if (b.isStorefront && !b.breached) {
          const isTitan = !!entity.isTitan;
          const hordeCount = entity.hordeCount || 0;
          if (isTitan || hordeCount >= 20) {
            b.breached = true;
            b.disabled = true;
            if (this.onStorefrontBreached) {
              this.onStorefrontBreached(b, entity.vx || (currentX - b.centerX), entity.vz || (currentZ - b.centerZ));
            }
            continue;
          }
        }

        // Clamped closest point on AABB
        const closestX = Math.max(b.minX, Math.min(currentX, b.maxX));
        const closestZ = Math.max(b.minZ, Math.min(currentZ, b.maxZ));

        const penX = currentX - closestX;
        const penZ = currentZ - closestZ;
        const distSq = penX * penX + penZ * penZ;

        if (distSq < radius * radius && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          currentX += (penX / dist) * overlap;
          currentZ += (penZ / dist) * overlap;
          collided = { nx: penX / dist, nz: penZ / dist };
        } else if (distSq <= 0.00001) {
          // Center is inside box - push to nearest edge
          const distLeft = currentX - b.minX;
          const distRight = b.maxX - currentX;
          const distTop = currentZ - b.minZ;
          const distBottom = b.maxZ - currentZ;

          const minDist = Math.min(distLeft, distRight, distTop, distBottom);
          if (minDist === distLeft) { currentX = b.minX - radius; collided = { nx: -1, nz: 0 }; }
          else if (minDist === distRight) { currentX = b.maxX + radius; collided = { nx: 1, nz: 0 }; }
          else if (minDist === distTop) { currentZ = b.minZ - radius; collided = { nx: 0, nz: -1 }; }
          else { currentZ = b.maxZ + radius; collided = { nx: 0, nz: 1 }; }
        }
      }
    }

    entity.x = currentX;
    entity.z = currentZ;
    return collided;
  }
}
