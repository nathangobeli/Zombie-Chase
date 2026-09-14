import * as THREE from 'three';
import { CityChunk, CHUNK_SIZE } from './CityChunk.js';
import { createCelGradientMap } from '../rendering/CharacterGeometry.js';

export class CityStreamer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.buildingModels = options.buildingModels || [];
    this.colormapTexture = options.colormapTexture || null;

    // Render radius in chunks: 2 = 5x5 grid = 25 chunks (320x320m active world)
    this.renderDistance = options.renderDistance ?? 2;
    // Unload radius in chunks (hysteresis buffer to prevent load/unload thrashing)
    this.unloadDistance = this.renderDistance + 1;

    this.activeChunks = new Map();
    this.lastPlayerCx = null;
    this.lastPlayerCz = null;

    // Discrete 3-step cel-shading gradient map
    this.celGradientMap = createCelGradientMap();

    // Shared Materials (reused across all chunks to minimize draw calls and avoid memory leaks)
    this.sharedMaterials = {
      // 1. Asphalt Road: Soft warm asphalt grey (#64748b)
      road: new THREE.MeshToonMaterial({
        color: 0x64748b,
        gradientMap: this.celGradientMap,
      }),

      // 2. Road Markings: Non-emissive (emissive: 0x000000), matte off-white striping (#f1f5f9)
      markings: new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: this.celGradientMap,
        emissive: 0x000000,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),

      // 3. Sidewalk & Curbs: Creamy light stone (#f8fafc) with darker trim curbs (#94a3b8)
      sidewalk: new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: this.celGradientMap,
      }),

      // 4. Park Grass: Warm vibrant lime green (#84cc16 to #65a30d) with dual-tone patches
      parkGrass: new THREE.MeshToonMaterial({
        color: 0x84cc16,
        vertexColors: true,
        gradientMap: this.celGradientMap,
      }),

      // 5. Procedural Buildings: Vertex-colored with vibrant arcade palette & stepped stories
      building: new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: this.celGradientMap,
      }),

      // 6. Kenney Commercial Buildings: Atlas textured
      kenney: new THREE.MeshToonMaterial({
        color: 0xffffff,
        map: this.colormapTexture,
        vertexColors: true,
        gradientMap: this.celGradientMap,
      }),

      // 7. Props: Trees, lamps, benches, dumpsters, cars (vertex-colored)
      props: new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: this.celGradientMap,
      }),
    };
  }

  /**
   * Initializes world around the initial player position.
   */
  init(startX = 0, startZ = 0, spatialGrid = null) {
    this.clear(spatialGrid);
    this.update(startX, startZ, spatialGrid, true);
  }

  /**
   * Updates chunk streaming around player coordinates.
   * Loads new chunks within renderDistance, disposes chunks beyond unloadDistance.
   */
  update(playerX, playerZ, spatialGrid = null, force = false) {
    const playerCx = Math.round(playerX / CHUNK_SIZE);
    const playerCz = Math.round(playerZ / CHUNK_SIZE);

    if (!force && playerCx === this.lastPlayerCx && playerCz === this.lastPlayerCz) {
      return;
    }

    this.lastPlayerCx = playerCx;
    this.lastPlayerCz = playerCz;

    // 1. Load Missing Chunks in Render Window
    const minCx = playerCx - this.renderDistance;
    const maxCx = playerCx + this.renderDistance;
    const minCz = playerCz - this.renderDistance;
    const maxCz = playerCz + this.renderDistance;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = `${cx},${cz}`;
        if (!this.activeChunks.has(key)) {
          this._loadChunk(cx, cz, spatialGrid);
        }
      }
    }

    // 2. Unload & Dispose Distant Chunks Outside Unload Window
    for (const [key, chunk] of this.activeChunks) {
      const dist = Math.max(Math.abs(chunk.cx - playerCx), Math.abs(chunk.cz - playerCz));
      if (dist >= this.unloadDistance) {
        this._unloadChunk(key, chunk, spatialGrid);
      }
    }
  }

  _loadChunk(cx, cz, spatialGrid) {
    const chunk = new CityChunk(cx, cz, this.sharedMaterials, {
      buildingModels: this.buildingModels,
      colormapTexture: this.colormapTexture,
    });

    // Add chunk meshes to Three.js scene
    for (let i = 0; i < chunk.meshes.length; i++) {
      this.scene.add(chunk.meshes[i]);
    }

    // Register chunk obstacles in spatial grid
    if (spatialGrid && chunk.obstacles.length > 0) {
      spatialGrid.setChunkObstacles(chunk.key, chunk.obstacles);
    }

    this.activeChunks.set(chunk.key, chunk);
  }

  _unloadChunk(key, chunk, spatialGrid) {
    // 1. Free WebGL buffers and remove from scene
    chunk.dispose(this.scene);

    // 2. Purge obstacle AABBs from spatial collision queries
    if (spatialGrid) {
      spatialGrid.removeChunkObstacles(key);
    }

    // 3. Remove from active tracking map for GC
    this.activeChunks.delete(key);
  }

  /**
   * Applies Kenney building models and colormap atlas after async download.
   */
  applyKenneyAssets(buildingModels, colormapTexture, spatialGrid = null) {
    this.buildingModels = buildingModels || [];
    this.colormapTexture = colormapTexture || null;

    if (colormapTexture) {
      this.sharedMaterials.kenney.map = colormapTexture;
      this.sharedMaterials.kenney.needsUpdate = true;
    }

    // Re-stream active chunks with Kenney models
    if (this.lastPlayerCx !== null && this.lastPlayerCz !== null) {
      const px = this.lastPlayerCx * CHUNK_SIZE;
      const pz = this.lastPlayerCz * CHUNK_SIZE;
      this.clear(spatialGrid);
      this.update(px, pz, spatialGrid, true);
    }
  }

  /**
   * Returns a random valid street position in one of the active chunks near player.
   */
  getRandomStreetPoint(nearX = 0, nearZ = 0, minRadius = 35, maxRadius = 90) {
    return this.getRandomStreetPosition(nearX, nearZ, minRadius, maxRadius);
  }

  getRandomStreetPosition(nearX = 0, nearZ = 0, minRadius = 35, maxRadius = 90) {
    const activeKeys = Array.from(this.activeChunks.keys());
    if (activeKeys.length === 0) {
      return { x: nearX + 30, z: nearZ + 30 };
    }

    // Attempt candidate points across active chunks
    for (let attempt = 0; attempt < 16; attempt++) {
      const randKey = activeKeys[Math.floor(Math.random() * activeKeys.length)];
      const chunk = this.activeChunks.get(randKey);
      if (!chunk || chunk.streetSpawnPoints.length === 0) continue;

      const pt = chunk.streetSpawnPoints[Math.floor(Math.random() * chunk.streetSpawnPoints.length)];
      const dist = Math.hypot(pt.x - nearX, pt.z - nearZ);
      if (dist >= minRadius && dist <= maxRadius) {
        return {
          x: pt.x + (Math.random() - 0.5) * 4.0,
          z: pt.z + (Math.random() - 0.5) * 4.0,
        };
      }
    }

    // Guaranteed fallback: compute a safe offset position respecting minRadius
    const angle = Math.random() * Math.PI * 2;
    const rad = minRadius + Math.random() * Math.max(10, maxRadius - minRadius);
    return {
      x: nearX + Math.cos(angle) * rad,
      z: nearZ + Math.sin(angle) * rad,
    };
  }

  /**
   * Retrieves active, unknocked small props (lamps, hydrants, trash) within radius.
   */
  getNearbyKnockableProps(x, z, radius) {
    const rSq = radius * radius;
    const result = [];
    for (const chunk of this.activeChunks.values()) {
      const props = chunk.knockableProps;
      if (!props) continue;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (p.knocked) continue;
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz <= rSq) {
          result.push(p);
        }
      }
    }
    return result;
  }

  /**
   * Returns a flat array of all building meshes across currently active chunks.
   * Used for camera occlusion raycasting.
   */
  getActiveBuildingMeshes() {
    const list = [];
    for (const chunk of this.activeChunks.values()) {
      if (chunk.buildingMeshes) {
        for (let i = 0; i < chunk.buildingMeshes.length; i++) {
          list.push(chunk.buildingMeshes[i]);
        }
      }
    }
    return list;
  }

  /**
   * Returns a flat array of all street lamp bulb positions across active chunks.
   * Used for dynamic proximity lighting.
   */
  getAllLampPositions() {
    const list = [];
    for (const chunk of this.activeChunks.values()) {
      if (chunk.lampPositions) {
        list.push(...chunk.lampPositions);
      }
    }
    return list;
  }

  /**
   * Returns a flat array of all intersection Stop Light bulb positions across active chunks.
   * Used to animate Red/Yellow/Green glow cycles.
   */
  getAllStopLightPositions() {
    const list = [];
    for (const chunk of this.activeChunks.values()) {
      if (chunk.stopLightPositions) {
        list.push(...chunk.stopLightPositions);
      }
    }
    return list;
  }

  /**
   * Retrieves all verified driving lanes from active chunks around player.
   * Only returns lanes strictly aligned with grid roadways with 0 building collisions.
   */
  getDrivingLanes() {
    const lanes = [];
    for (const chunk of this.activeChunks.values()) {
      if (chunk.getDrivingLanes) {
        lanes.push(...chunk.getDrivingLanes());
      }
    }
    return lanes;
  }

  /**
   * Cleans up all active chunks.
   */
  clear(spatialGrid = null) {
    for (const [key, chunk] of this.activeChunks) {
      chunk.dispose(this.scene);
      if (spatialGrid) {
        spatialGrid.removeChunkObstacles(key);
      }
    }
    this.activeChunks.clear();
    this.lastPlayerCx = null;
    this.lastPlayerCz = null;
  }
}
