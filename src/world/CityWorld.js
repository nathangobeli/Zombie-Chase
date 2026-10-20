import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyBuildingCutawayShader, BuildingShaderUniforms } from '../rendering/CutawayShader.js';

const BUILDING_GLB_FILES = [
  'building-a.glb',
  'building-b.glb',
  'building-c.glb',
  'building-d.glb',
  'building-e.glb',
  'building-f.glb',
  'building-g.glb',
  'building-h.glb',
  'building-i.glb',
  'building-j.glb',
  'building-k.glb',
  'building-l.glb',
  'building-m.glb',
  'building-n.glb',
  'building-skyscraper-a.glb',
  'building-skyscraper-b.glb',
  'building-skyscraper-c.glb',
  'building-skyscraper-d.glb',
  'building-skyscraper-e.glb',
  'low-detail-building-wide-a.glb',
  'low-detail-building-wide-b.glb',
];

const DETAIL_GLB_FILES = [
  'detail-awning.glb',
  'detail-awning-wide.glb',
  'detail-overhang.glb',
  'detail-parasol-a.glb',
  'detail-parasol-b.glb',
];

const BREACH_BUILDING_THEMES = [
  { name: 'BIOCORP LAB', neonHex: 0x10b981, wallHex: 0x1e293b, dnaCount: 3 },
  { name: 'METRO PHARMACY', neonHex: 0x38bdf8, wallHex: 0x334155, dnaCount: 2 },
  { name: 'CYBER MALL', neonHex: 0xf43f5e, wallHex: 0x27272a, dnaCount: 2 },
  { name: 'PRECINCT ARMORY', neonHex: 0xf59e0b, wallHex: 0x1e1b4b, dnaCount: 3 },
];

export const DISTRICT_BIOMES = [
  { id: 'downtown', name: 'DOWNTOWN FINANCIAL CORE', color: 'cyan' },
  { id: 'biolab', name: 'BIO-RESEARCH QUARANTINE ZONE', color: 'emerald' },
  { id: 'plaza', name: 'CENTRAL EVACUATION PLAZA', color: 'amber' },
  { id: 'military', name: 'MILITARY LOCKDOWN SECTOR', color: 'crimson' },
];

/**
 * Streaming Urban World with:
 *  - 4 Distinct District Biomes (Downtown Core, Bio-Research Zone, Evacuation Plaza, Military Sector)
 *  - Real Kenney .glb 3D Buildings, Skyscrapers & Props with Screen-Space Dithered Cutaway Shader
 *  - Walkable, Breachable Ground-Floor Interiors (4-wall perimeter colliders + shatterable glass doors)
 *  - Wet Asphalt Boulevards, Concrete Sidewalks, Pooled Streetlamps, Hydrants, Bio-Barrels & DNA Canisters
 */
export class CityWorld {
  constructor(scene, textures, vfx) {
    this.scene = scene;
    this.textures = textures;
    this.vfx = vfx;

    this.chunkSize = 72; // 72m x 72m sectors (56m block + 16m wide 4-lane boulevards)
    this.chunks = new Map();

    // Active collision & interactive lists rebuilt from loaded chunks
    this.wallColliders = [];
    this.solidPillars = [];
    this.hazards = [];
    this.dnaCanisters = [];
    this.interiorRooms = [];
    this.lampPositions = [];

    // Shared Materials
    this.roadMat = new THREE.MeshStandardMaterial({
      map: this.textures.asphaltAlbedo,
      roughnessMap: this.textures.asphaltRoughness,
      roughness: 0.62,
      metalness: 0.22,
    });

    this.sidewalkMat = new THREE.MeshStandardMaterial({
      map: this.textures.sidewalkAlbedo,
      roughness: 0.75,
      metalness: 0.08,
    });

    this.parkGrassMat = new THREE.MeshStandardMaterial({
      color: 0x14532d,
      roughness: 0.85,
      metalness: 0.05,
    });

    this.interiorFloorMat = new THREE.MeshStandardMaterial({
      map: this.textures.interiorFloor,
      emissive: 0x334155,
      emissiveMap: this.textures.interiorFloor,
      emissiveIntensity: 0.58,
      roughness: 0.32,
      metalness: 0.15,
    });

    this.cutawayWallMat = applyBuildingCutawayShader(
      new THREE.MeshStandardMaterial({
        color: 0x27303f,
        roughness: 0.6,
        metalness: 0.2,
      }),
      { enableProceduralWindows: true }
    );

    this.cutawayRoofMat = applyBuildingCutawayShader(
      new THREE.MeshStandardMaterial({
        map: this.textures.windowFacade,
        roughness: 0.48,
        metalness: 0.25,
      }),
      { enableProceduralWindows: true }
    );

    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.46,
      roughness: 0.1,
      metalness: 0.8,
      side: THREE.DoubleSide,
    });

    this.dnaGeo = new THREE.OctahedronGeometry(0.48, 1);
    this.dnaMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      blending: THREE.AdditiveBlending,
    });

    this.glbTemplates = [];
    this.detailTemplates = {};
    this._loadKenneyGLBs();
  }

  getDistrictForChunk(cx, cz) {
    if (cx === 0 && cz === 0) return DISTRICT_BIOMES[0];
    const hash = Math.abs(cx * 7 + cz * 13) % DISTRICT_BIOMES.length;
    return DISTRICT_BIOMES[hash];
  }

  getDistrictAtWorld(x, z) {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    return this.getDistrictForChunk(cx, cz);
  }

  async _loadKenneyGLBs() {
    const loader = new GLTFLoader();
    const loaded = [];

    await Promise.all([
      ...BUILDING_GLB_FILES.map(
        (file) =>
          new Promise((resolve) => {
            loader.load(
              `/assets/buildings/${file}`,
              (gltf) => {
                const root = gltf.scene;
                root.traverse((child) => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                      const clonedMat = child.material.clone();
                      clonedMat.roughness = 0.52;
                      clonedMat.metalness = 0.2;
                      applyBuildingCutawayShader(clonedMat, { enableProceduralWindows: true });
                      child.material = clonedMat;
                    }
                  }
                });
                const box = new THREE.Box3().setFromObject(root);
                const size = new THREE.Vector3();
                box.getSize(size);
                loaded.push({ name: file, scene: root, size });
                resolve();
              },
              undefined,
              () => resolve()
            );
          })
      ),
      ...DETAIL_GLB_FILES.map(
        (file) =>
          new Promise((resolve) => {
            loader.load(
              `/assets/buildings/${file}`,
              (gltf) => {
                const root = gltf.scene;
                root.traverse((child) => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                  }
                });
                this.detailTemplates[file] = root;
                resolve();
              },
              undefined,
              () => resolve()
            );
          })
      ),
    ]);

    this.glbTemplates = loaded;
    for (const chunk of this.chunks.values()) {
      this._populateChunkGLBs(chunk);
    }
  }

  _chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  updateStreaming(playerX, playerZ, camPos, time) {
    BuildingShaderUniforms.uPlayerPos.value.set(playerX, 0, playerZ);
    if (camPos) {
      BuildingShaderUniforms.uCameraPos.value.copy(camPos);
    }
    BuildingShaderUniforms.uTime.value = time;

    for (let i = 0; i < this.dnaCanisters.length; i++) {
      const c = this.dnaCanisters[i];
      if (!c.collected && c.mesh) {
        c.mesh.rotation.y = time * 2.8 + i;
        c.mesh.position.y = c.baseY + Math.sin(time * 4.0 + i) * 0.18;
      }
    }

    const pcx = Math.floor(playerX / this.chunkSize);
    const pcz = Math.floor(playerZ / this.chunkSize);

    let changed = false;
    const activeKeys = new Set();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this._chunkKey(cx, cz);
        activeKeys.add(key);
        if (!this.chunks.has(key)) {
          const chunk = this._createChunk(cx, cz, key);
          this.chunks.set(key, chunk);
          changed = true;
        }
      }
    }

    for (const [key, chunk] of this.chunks.entries()) {
      if (!activeKeys.has(key)) {
        this.scene.remove(chunk.group);
        this.chunks.delete(key);
        changed = true;
      }
    }

    if (changed) {
      this._rebuildActiveLists();
    }
  }

  _rebuildActiveLists() {
    this.wallColliders.length = 0;
    this.solidPillars.length = 0;
    this.hazards.length = 0;
    this.dnaCanisters.length = 0;
    this.interiorRooms.length = 0;
    this.lampPositions.length = 0;

    for (const chunk of this.chunks.values()) {
      this.wallColliders.push(...chunk.walls);
      this.solidPillars.push(...chunk.pillars);
      this.hazards.push(...chunk.hazards);
      this.dnaCanisters.push(...chunk.dnaCanisters);
      this.interiorRooms.push(...chunk.interiorRooms);
      this.lampPositions.push(...chunk.lamps);
    }
  }

  _createChunk(cx, cz, key) {
    const group = new THREE.Group();
    const originX = cx * this.chunkSize;
    const originZ = cz * this.chunkSize;
    group.position.set(originX, 0, originZ);
    this.scene.add(group);

    const district = this.getDistrictForChunk(cx, cz);

    const chunk = {
      cx,
      cz,
      key,
      district,
      originX,
      originZ,
      group,
      glbGroup: new THREE.Group(),
      walls: [],
      pillars: [],
      hazards: [],
      dnaCanisters: [],
      interiorRooms: [],
      lamps: [],
      glbSlots: [],
      parasolSlots: [],
    };
    group.add(chunk.glbGroup);

    const S = this.chunkSize; // 72m
    const roadW = 16;         // 16m boulevard
    const blockW = S - roadW; // 56m block

    // 1. Wet Asphalt Road Plane
    const roadGeo = new THREE.PlaneGeometry(S, S);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMesh = new THREE.Mesh(roadGeo, this.roadMat);
    roadMesh.position.set(S / 2, 0, S / 2);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    // 2. Boulevard Lane Markings & Crosswalks
    this._buildRoadMarkings(group, S, roadW, blockW);

    // 3. Raised Concrete Sidewalk Island (56m x 56m centered at [36, 36])
    const swGeo = new THREE.BoxGeometry(blockW, 0.22, blockW);
    const swMesh = new THREE.Mesh(swGeo, this.sidewalkMat);
    swMesh.position.set(S / 2, 0.11, S / 2);
    swMesh.receiveShadow = true;
    group.add(swMesh);

    const center = S / 2; // 36
    const offset = 13.5;
    const isSpawnCorner = (cx === 0 || cx === -1) && (cz === 0 || cz === -1);

    // District-specific layout variations
    if (district.id === 'plaza') {
      // Central Evacuation Plaza: Open Park Quadrant + Cafe Parasols + 2 Breachable Pavilions!
      this._buildParkPlazaQuadrant(chunk, center - offset, center - offset, 22, 22);
      this._buildBreachableBuilding(chunk, center + offset, center - offset, 18, 18, 2);
      this._buildBreachableBuilding(chunk, center - offset, center + offset, 18, 18, 1);
      if (!isSpawnCorner) {
        this._buildTowerSlot(chunk, center + offset, center + offset, 17, 17, (cx * 17 + cz * 9) & 0xff);
      }
    } else {
      // Standard / BioLab / Military Sector Layout
      const themeA = district.id === 'biolab' ? 0 : Math.abs(cx * 7 + cz * 13) % BREACH_BUILDING_THEMES.length;
      const themeB = district.id === 'military' ? 3 : Math.abs(cx * 3 + cz * 19 + 1) % BREACH_BUILDING_THEMES.length;

      this._buildBreachableBuilding(chunk, center - offset, center + offset, 18, 18, themeA);
      this._buildBreachableBuilding(chunk, center + offset, center - offset, 18, 18, themeB);

      this._buildTowerSlot(chunk, center - offset, center - offset, 17, 17, (cx * 11 + cz * 5) & 0xff);
      if (!isSpawnCorner) {
        this._buildTowerSlot(chunk, center + offset, center + offset, 17, 17, (cx * 17 + cz * 9) & 0xff);
      }
    }

    // 5. Street Props: Streetlamps, Fire Hydrants & Explosive Bio-Barrels
    this._buildStreetProps(chunk, S, blockW);

    if (this.glbTemplates.length > 0) {
      this._populateChunkGLBs(chunk);
    }

    return chunk;
  }

  _buildParkPlazaQuadrant(chunk, localX, localZ, width, depth) {
    // Lush park turf pad
    const turfGeo = new THREE.BoxGeometry(width, 0.12, depth);
    const turfMesh = new THREE.Mesh(turfGeo, this.parkGrassMat);
    turfMesh.position.set(localX, 0.25, localZ);
    turfMesh.receiveShadow = true;
    chunk.group.add(turfMesh);

    // Central illuminated bio-fountain / monument
    const fountGeo = new THREE.CylinderGeometry(2.6, 3.0, 0.75, 16);
    const fountMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
    const fount = new THREE.Mesh(fountGeo, fountMat);
    fount.position.set(localX, 0.55, localZ);
    fount.castShadow = true;
    chunk.group.add(fount);

    const waterGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.82, 16);
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(localX, 0.56, localZ);
    chunk.group.add(water);

    chunk.pillars.push({
      x: chunk.originX + localX,
      z: chunk.originZ + localZ,
      r: 2.8,
    });

    // Reserve café parasol slots around the park plaza
    for (const [dx, dz] of [
      [-6, -6],
      [6, -6],
      [-6, 6],
      [6, 6],
    ]) {
      chunk.parasolSlots.push({ localX: localX + dx, localZ: localZ + dz });
    }

    // Spawn a high-yield DNA cluster in the plaza center
    const dMesh = new THREE.Mesh(this.dnaGeo, this.dnaMat);
    dMesh.position.set(localX, 1.4, localZ);
    chunk.group.add(dMesh);
    chunk.dnaCanisters.push({
      x: chunk.originX + localX,
      z: chunk.originZ + localZ,
      baseY: 1.4,
      collected: false,
      mesh: dMesh,
    });
  }

  _buildRoadMarkings(group, S, roadW, blockW) {
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });

    const dashGeo = new THREE.PlaneGeometry(3.2, 0.22);
    dashGeo.rotateX(-Math.PI / 2);

    for (let pos = 12; pos < S - 8; pos += 7.5) {
      const dX = new THREE.Mesh(dashGeo, dashMat);
      dX.position.set(pos, 0.02, 0.2);
      group.add(dX);

      const dZ = new THREE.Mesh(dashGeo, dashMat);
      dZ.rotation.y = Math.PI / 2;
      dZ.position.set(0.2, 0.02, pos);
      group.add(dZ);
    }

    const stripeGeo = new THREE.PlaneGeometry(0.65, 3.4);
    stripeGeo.rotateX(-Math.PI / 2);
    for (let i = -4; i <= 4; i += 2) {
      const cw1 = new THREE.Mesh(stripeGeo, whiteMat);
      cw1.position.set(i * 0.9, 0.02, 9.5);
      group.add(cw1);
    }
  }

  _buildBreachableBuilding(chunk, localX, localZ, width, depth, themeIdx) {
    const theme = BREACH_BUILDING_THEMES[themeIdx % BREACH_BUILDING_THEMES.length];
    const halfW = width / 2;
    const halfD = depth / 2;
    const wallThick = 0.65;
    const groundWallH = 3.2;

    const worldCX = chunk.originX + localX;
    const worldCZ = chunk.originZ + localZ;

    // 1. Interior Checkered Floor
    const floorGeo = new THREE.PlaneGeometry(width - 0.6, depth - 0.6);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, this.interiorFloorMat);
    floorMesh.position.set(localX, 0.24, localZ);
    floorMesh.receiveShadow = true;
    chunk.group.add(floorMesh);

    // 2. Corner Structural Pillars
    const pillarGeo = new THREE.BoxGeometry(1.3, groundWallH, 1.3);
    const corners = [
      [-halfW + 0.5, -halfD + 0.5],
      [halfW - 0.5, -halfD + 0.5],
      [-halfW + 0.5, halfD - 0.5],
      [halfW - 0.5, halfD - 0.5],
    ];
    for (const [dx, dz] of corners) {
      const pMesh = new THREE.Mesh(pillarGeo, this.cutawayWallMat);
      pMesh.position.set(localX + dx, 0.22 + groundWallH / 2, localZ + dz);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      chunk.group.add(pMesh);
      chunk.pillars.push({
        x: worldCX + dx,
        z: worldCZ + dz,
        r: 0.75,
      });
    }

    const spanW = width - 2.4;
    const spanD = depth - 2.4;

    const addWall = (lx, lz, w, d, isBreakable, normalX, normalZ) => {
      const h = isBreakable ? 2.8 : groundWallH;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = isBreakable ? this.glassMat.clone() : this.cutawayWallMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lx, 0.22 + h / 2, lz);
      mesh.castShadow = !isBreakable;
      mesh.receiveShadow = true;
      chunk.group.add(mesh);

      if (isBreakable) {
        const neonGeo = new THREE.BoxGeometry(w * 0.85, 0.38, d + 0.25);
        const neonMat = new THREE.MeshBasicMaterial({ color: theme.neonHex });
        const neonBar = new THREE.Mesh(neonGeo, neonMat);
        neonBar.position.set(lx, 0.22 + groundWallH - 0.15, lz);
        chunk.group.add(neonBar);
      }

      const wx = chunk.originX + lx;
      const wz = chunk.originZ + lz;
      chunk.walls.push({
        minX: wx - w / 2,
        maxX: wx + w / 2,
        minZ: wz - d / 2,
        maxZ: wz + d / 2,
        centerX: wx,
        centerZ: wz,
        normalX,
        normalZ,
        isBreakable,
        broken: false,
        hp: isBreakable ? 65 : 999999,
        maxHp: isBreakable ? 65 : 999999,
        mesh,
        themeName: theme.name,
      });
    };

    addWall(localX, localZ + halfD - wallThick / 2, spanW, wallThick, true, 0, 1);
    addWall(localX, localZ - halfD + wallThick / 2, spanW, wallThick, true, 0, -1);
    addWall(localX - halfW + wallThick / 2, localZ, wallThick, spanD, true, -1, 0);
    addWall(localX + halfW - wallThick / 2, localZ, wallThick, spanD, false, 1, 0);

    const upperH = 11.5;
    const upperGeo = new THREE.BoxGeometry(width + 0.2, upperH, depth + 0.2);
    const upperMesh = new THREE.Mesh(upperGeo, this.cutawayRoofMat);
    upperMesh.position.set(localX, 0.22 + groundWallH + upperH / 2, localZ);
    upperMesh.castShadow = true;
    upperMesh.receiveShadow = true;
    chunk.group.add(upperMesh);

    chunk.glbSlots.push({
      localX,
      localY: 0.22 + groundWallH,
      localZ,
      targetWidth: width * 0.92,
      seed: Math.abs(chunk.cx * 31 + chunk.cz * 17 + Math.round(localX)),
      upperFallbackMesh: upperMesh,
    });

    const bonusDna = chunk.district.id === 'biolab' ? 1 : 0;
    const totalDna = theme.dnaCount + bonusDna;
    for (let i = 0; i < totalDna; i++) {
      const ox = (i - (totalDna - 1) / 2) * 3.0;
      const oz = (i % 2 === 0 ? -1 : 1) * 2.2;
      const dMesh = new THREE.Mesh(this.dnaGeo, this.dnaMat);
      dMesh.position.set(localX + ox, 1.1, localZ + oz);
      chunk.group.add(dMesh);

      chunk.dnaCanisters.push({
        x: worldCX + ox,
        z: worldCZ + oz,
        baseY: 1.1,
        collected: false,
        mesh: dMesh,
      });
    }

    chunk.interiorRooms.push({
      cx: worldCX,
      cz: worldCZ,
      halfW: halfW - 1.5,
      halfD: halfD - 1.5,
      theme,
    });
  }

  _buildTowerSlot(chunk, localX, localZ, width, depth, seed) {
    const h = 18 + (seed % 16);
    const fallbackGeo = new THREE.BoxGeometry(width, h, depth);
    const fallbackMesh = new THREE.Mesh(fallbackGeo, this.cutawayRoofMat);
    fallbackMesh.position.set(localX, 0.22 + h / 2, localZ);
    fallbackMesh.castShadow = true;
    fallbackMesh.receiveShadow = true;
    chunk.group.add(fallbackMesh);

    const wx = chunk.originX + localX;
    const wz = chunk.originZ + localZ;
    chunk.walls.push({
      minX: wx - width / 2,
      maxX: wx + width / 2,
      minZ: wz - depth / 2,
      maxZ: wz + depth / 2,
      centerX: wx,
      centerZ: wz,
      normalX: 0,
      normalZ: 1,
      isBreakable: false,
      broken: false,
      hp: 999999,
      maxHp: 999999,
      mesh: fallbackMesh,
    });

    chunk.glbSlots.push({
      localX,
      localY: 0.22,
      localZ,
      targetWidth: width * 0.98,
      seed,
      upperFallbackMesh: fallbackMesh,
    });
  }

  _populateChunkGLBs(chunk) {
    if (!this.glbTemplates.length) return;
    chunk.glbGroup.clear();

    for (const slot of chunk.glbSlots) {
      const tpl = this.glbTemplates[slot.seed % this.glbTemplates.length];
      if (!tpl) continue;

      const instance = tpl.scene.clone(true);
      const maxHoriz = Math.max(0.2, tpl.size.x, tpl.size.z);
      const scale = slot.targetWidth / maxHoriz;
      instance.scale.set(scale, scale, scale);
      instance.position.set(slot.localX, slot.localY, slot.localZ);
      instance.rotation.y = ((slot.seed % 4) * Math.PI) / 2;
      chunk.glbGroup.add(instance);

      if (slot.upperFallbackMesh) {
        slot.upperFallbackMesh.visible = false;
      }
    }

    // Mount Kenney café parasols in Park Plaza chunks
    const parasolTpl =
      this.detailTemplates['detail-parasol-a.glb'] || this.detailTemplates['detail-parasol-b.glb'];
    if (parasolTpl && chunk.parasolSlots) {
      for (const pSlot of chunk.parasolSlots) {
        const p = parasolTpl.clone(true);
        p.scale.set(8, 8, 8);
        p.position.set(pSlot.localX, 0.3, pSlot.localZ);
        chunk.glbGroup.add(p);
      }
    }
  }

  _buildStreetProps(chunk, S, blockW) {
    const center = S / 2;
    const halfB = blockW / 2;

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const lampOffsets = [
      [center - halfB + 1.2, center - halfB + 1.2],
      [center + halfB - 1.2, center - halfB + 1.2],
      [center - halfB + 1.2, center + halfB - 1.2],
      [center + halfB - 1.2, center + halfB - 1.2],
    ];

    for (const [lx, lz] of lampOffsets) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.2, 8), poleMat);
      pole.position.set(lx, 2.6, lz);
      pole.castShadow = true;
      chunk.group.add(pole);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), bulbMat);
      bulb.position.set(lx, 5.25, lz);
      chunk.group.add(bulb);

      chunk.lamps.push({
        x: chunk.originX + lx,
        y: 5.0,
        z: chunk.originZ + lz,
      });
    }

    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 12);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      emissive: 0x15803d,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.4,
    });

    const hydrantGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.9, 10);
    const hydrantMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.4,
      metalness: 0.3,
    });

    const hazardSpots = [
      { lx: center - halfB - 0.8, lz: center, type: 'barrel' },
      { lx: center + halfB + 0.8, lz: center - 8, type: 'barrel' },
      { lx: center, lz: center + halfB + 0.8, type: 'hydrant' },
      { lx: center - 10, lz: center - halfB - 0.8, type: 'barrel' },
    ];

    for (const spot of hazardSpots) {
      const isBarrel = spot.type === 'barrel';
      const mesh = new THREE.Mesh(isBarrel ? barrelGeo : hydrantGeo, isBarrel ? barrelMat : hydrantMat);
      mesh.position.set(spot.lx, isBarrel ? 0.65 : 0.5, spot.lz);
      mesh.castShadow = true;
      chunk.group.add(mesh);

      chunk.hazards.push({
        x: chunk.originX + spot.lx,
        z: chunk.originZ + spot.lz,
        r: isBarrel ? 0.65 : 0.5,
        type: spot.type,
        intact: true,
        mesh,
      });
    }
  }

  damageWall(wall, dmg, audio) {
    if (!wall.isBreakable || wall.broken) return false;
    wall.hp -= dmg;
    if (wall.hp <= 0) {
      wall.broken = true;
      wall.mesh.visible = false;
      this.vfx.spawnGlassShatter(wall.centerX, wall.centerZ, wall.normalX, wall.normalZ);
      this.vfx.spawnFlashLight(wall.centerX, 1.8, wall.centerZ, 0x38bdf8, 5, 10, 0.3);
      if (audio) audio.playGlassShatter();
      return true;
    }
    return false;
  }

  resolveEntityCollision(entity, radius = 0.45, breachDamage = 0, audio = null, onBreachCallback = null) {
    for (let i = 0, len = this.wallColliders.length; i < len; i++) {
      const w = this.wallColliders[i];
      if (w.broken) continue;

      const closestX = Math.max(w.minX, Math.min(entity.x, w.maxX));
      const closestZ = Math.max(w.minZ, Math.min(entity.z, w.maxZ));
      const dx = entity.x - closestX;
      const dz = entity.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (w.isBreakable && breachDamage > 0) {
          const shattered = this.damageWall(w, breachDamage, audio);
          if (shattered && onBreachCallback) {
            onBreachCallback(w);
          }
          if (w.broken) continue;
        }

        const dist = Math.sqrt(distSq) || 0.001;
        const pen = radius - dist;
        entity.x += (dx / dist) * pen;
        entity.z += (dz / dist) * pen;
      }
    }

    for (let i = 0, len = this.solidPillars.length; i < len; i++) {
      const p = this.solidPillars[i];
      const dx = entity.x - p.x;
      const dz = entity.z - p.z;
      const minD = radius + p.r;
      const distSq = dx * dx + dz * dz;
      if (distSq < minD * minD) {
        const dist = Math.sqrt(distSq) || 0.001;
        const pen = minD - dist;
        entity.x += (dx / dist) * pen;
        entity.z += (dz / dist) * pen;
      }
    }
  }
}
