import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CHUNK_SIZE = 64.0;
export const HALF_CHUNK = CHUNK_SIZE * 0.5; // 32.0
export const SIDEWALK_HALF = 26.0;           // 52x52m block, leaving 6m road margin on all sides

// Fast, deterministic 2D integer hash
export function hash2D(x, z) {
  let h = (x * 374761393) ^ (z * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// PRNG generator
export function createPRNG(seed) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Curated vibrant arcade architectural palette for cartoon buildings
export const BUILDING_PALETTE = [
  new THREE.Color(0xe76f51), // Warm Coral
  new THREE.Color(0xe9c46a), // Mustard Yellow
  new THREE.Color(0x2a9d8f), // Mint Green
  new THREE.Color(0xd62828), // Brick Red
  new THREE.Color(0x1d3557), // Navy
  new THREE.Color(0xf4a261), // Sandy Amber
  new THREE.Color(0x38a3c4), // Sky Glass Cyan
  new THREE.Color(0x5c3d75), // Deep Plum
];

// Contrasting trim colors for roof parapets, ledges, and belt courses
export const TRIM_PALETTE = [
  new THREE.Color(0xf8f9fa), // Clean White / Cream
  new THREE.Color(0x264653), // Dark Slate
  new THREE.Color(0xf1c40f), // Golden Accent
  new THREE.Color(0x343a40), // Dark Charcoal
  new THREE.Color(0xe0e6ed), // Light Silver
];

// Intense emissive window pane colors for UnrealBloomPass glow
export const WINDOW_PALETTES = [
  new THREE.Color(2.8, 2.6, 1.4), // Intense Neon Yellow Pane
  new THREE.Color(1.2, 2.2, 3.2), // Intense Neon Blue Pane
  new THREE.Color(3.0, 1.8, 1.0), // Intense Warm Amber Pane
  new THREE.Color(1.5, 3.0, 3.0), // Intense Cyan Pane
];

export const CAR_PALETTE = [
  new THREE.Color(0xe63946), // Red
  new THREE.Color(0x00b4d8), // Blue
  new THREE.Color(0xffb703), // Yellow Cab
  new THREE.Color(0x55a630), // Green
  new THREE.Color(0xf1faee), // White
  new THREE.Color(0xfb8500), // Orange
  new THREE.Color(0x7209b7), // Purple
];

export class CityChunk {
  constructor(cx, cz, sharedMaterials, options = {}) {
    this.cx = cx;
    this.cz = cz;
    this.key = `${cx},${cz}`;
    this.worldX = cx * CHUNK_SIZE;
    this.worldZ = cz * CHUNK_SIZE;
    this.materials = sharedMaterials;
    this.buildingModels = options.buildingModels || [];
    this.colormapTexture = options.colormapTexture || null;

    this.meshes = [];
    this.buildingMeshes = [];
    this.obstacles = [];
    this.streetSpawnPoints = [];
    this.lampPositions = [];    // E1: Positions for runtime PointLights
    this.firePositions = [];    // E3: Dumpster fire positions for PointLights
    this.stopLightPositions = []; // Positions for dynamic intersection Stop Lights
    this.knockableProps = [];   // Small props (lamps, hydrants, trash cans, bushes, benches, cars) for Bulldozer & Titan physics
    this.propsMesh = null;      // Direct reference to the merged props Mesh
    this._currentPropVertexCount = 0;

    // Quarantine Zone parameters (@designer & @artist)
    this.isQuarantineZone = false;
    this.quarantineRadius = 16.0;
    this.quarantineCenter = null;
    this.quarantineOverrun = false;
    this.quarantineRingMesh = null;
    this.quarantineBannerSprite = null;
    this.quarantineSandbagPositions = [];
    this.forceQuarantineZone = !!(options && options.forceQuarantineZone);
    this._overrunTime = 0;

    this.seed = hash2D(cx, cz);
    this.rng = createPRNG(this.seed);

    this._generate();
  }

  _generate() {
    this._currentPropVertexCount = 0;
    this.propsMesh = null;
    const roadGeoms = [];
    const markingGeoms = [];
    const sidewalkGeoms = [];
    const parkGrassGeoms = [];
    const buildingGeoms = [];
    const kenneyGeoms = [];
    const propGeoms = [];
    const puddleGeoms = [];  // V4: separate array to avoid color attribute mismatch

    const wx = this.worldX;
    const wz = this.worldZ;

    // 1. Road Base Plane (Spans entire 64x64m chunk at Y = 0)
    const roadPlane = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    roadPlane.rotateX(-Math.PI / 2);
    roadPlane.translate(wx, 0.0, wz);
    roadGeoms.push(roadPlane);

    // 2. Road Markings (Crosswalks & Lane Lines)
    this._generateRoadMarkings(wx, wz, markingGeoms);

    // V4: Road Puddles — flat reflective planes on road surface (separate from road base)
    this._generatePuddles(wx, wz, puddleGeoms);

    // 3. Central Block: Decide Archetype
    if (this.cx === 0 && this.cz === 0) {
      this._generateSpawnIntersectionBlock(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms, markingGeoms);
    } else {
      const archetypeRoll = this.rng();

      if (archetypeRoll < 0.40) {
        this._generateCommercialBlock(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms);
      } else if (archetypeRoll < 0.65) {
        this._generateSkyscraperPlaza(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms);
      } else if (archetypeRoll < 0.85) {
        this._generateParkBlock(wx, wz, sidewalkGeoms, parkGrassGeoms, propGeoms);
      } else {
        this._generateMultiShopBlock(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms);
      }
    }

    // 4. Perimeter Sidewalk Props (Street lamps, hydrants, parked cars)
    this._generatePerimeterProps(wx, wz, propGeoms);

    // E4: Road-blocking abandoned cars (1-2 per chunk, ~60% of chunks) - skip on spawn chunk (0,0)
    if (this.cx !== 0 || this.cz !== 0) {
      if (this.rng() < 0.60) {
        this._generateBlockingCars(wx, wz, propGeoms);
      }
    }

    // E3: Dumpster fire (~15% of chunks) - skip on spawn chunk (0,0)
    if (this.cx !== 0 || this.cz !== 0) {
      if (this.rng() < 0.15) {
        const fx = wx + (this.rng() - 0.5) * 20;
        const fz = wz + (this.rng() - 0.5) * 20;
        // Add glowing orange box
        const fireBoxGeom = new THREE.BoxGeometry(0.8, 1.1, 0.8);
        fireBoxGeom.translate(fx, 0.55, fz);
        _tagGeomColor(fireBoxGeom, new THREE.Color(0xff4400));
        this._pushPropGeom(fireBoxGeom, propGeoms);
        this.firePositions.push({ x: fx, z: fz });
      }
    }

    // 5. Gather Street Spawn Points for Entities
    this._recordStreetPoints(wx, wz);

    // 6. Consolidate and Create Meshes
    // A. Road Mesh
    if (roadGeoms.length > 0) {
      const mergedRoad = safeMergeGeometries(roadGeoms, false, true);
      if (mergedRoad) {
        const roadMesh = new THREE.Mesh(mergedRoad, this.materials.road);
        roadMesh.receiveShadow = true;
        this.meshes.push(roadMesh);
      }
    }

    // B. Road Markings Mesh
    if (markingGeoms.length > 0) {
      const mergedMarkings = safeMergeGeometries(markingGeoms, true);
      if (mergedMarkings) {
        const markingsMesh = new THREE.Mesh(mergedMarkings, this.materials.markings);
        this.meshes.push(markingsMesh);
      }
    }

    // C. Sidewalk & Curbs Mesh
    if (sidewalkGeoms.length > 0) {
      const mergedSidewalk = safeMergeGeometries(sidewalkGeoms, true);
      if (mergedSidewalk) {
        const sidewalkMesh = new THREE.Mesh(mergedSidewalk, this.materials.sidewalk);
        sidewalkMesh.receiveShadow = true;
        this.meshes.push(sidewalkMesh);
      }
    }

    // D. Park Grass Mesh
    if (parkGrassGeoms.length > 0) {
      const mergedGrass = safeMergeGeometries(parkGrassGeoms, true);
      if (mergedGrass) {
        const grassMesh = new THREE.Mesh(mergedGrass, this.materials.parkGrass);
        grassMesh.receiveShadow = true;
        this.meshes.push(grassMesh);
      }
    }

    // E. Kenney Commercial Buildings Mesh
    if (kenneyGeoms.length > 0) {
      const mergedKenney = safeMergeGeometries(kenneyGeoms, true, true);
      if (mergedKenney) {
        mergedKenney.computeVertexNormals();
        mergedKenney.computeBoundingBox();
        mergedKenney.computeBoundingSphere();
        const kenneyMesh = new THREE.Mesh(mergedKenney, this.materials.kenney.clone());
        kenneyMesh.castShadow = true;
        kenneyMesh.receiveShadow = true;
        kenneyMesh.userData = { isBuilding: true };
        this.meshes.push(kenneyMesh);
        this.buildingMeshes.push(kenneyMesh);
      }
    }

    // F. Procedural Buildings Mesh (Vertex Colored)
    if (buildingGeoms.length > 0) {
      const mergedBuildings = safeMergeGeometries(buildingGeoms, true);
      if (mergedBuildings) {
        mergedBuildings.computeVertexNormals();
        mergedBuildings.computeBoundingBox();
        mergedBuildings.computeBoundingSphere();
        const buildingMesh = new THREE.Mesh(mergedBuildings, this.materials.building.clone());
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;
        buildingMesh.userData = { isBuilding: true };
        this.meshes.push(buildingMesh);
        this.buildingMeshes.push(buildingMesh);
      }
    }

    // G. Props Mesh (Vertex Colored Trees, Lamps, Benches, Dumpsters, Cars)
    if (propGeoms.length > 0) {
      const mergedProps = safeMergeGeometries(propGeoms, true);
      if (mergedProps) {
        mergedProps.computeVertexNormals();
        const propMesh = new THREE.Mesh(mergedProps, this.materials.props);
        propMesh.castShadow = true;
        propMesh.receiveShadow = true;
        this.meshes.push(propMesh);
        this.propsMesh = propMesh;
      }
    }

    // H. Puddles Mesh
    if (puddleGeoms.length > 0) {
      const mergedPuddles = safeMergeGeometries(puddleGeoms, true);
      if (mergedPuddles) {
        mergedPuddles.computeVertexNormals();
        const puddleMesh = new THREE.Mesh(mergedPuddles, this.materials.props);
        puddleMesh.receiveShadow = false;
        this.meshes.push(puddleMesh);
      }
    }
  }

  /**
   * Pushes a prop geometry into propGeoms while tracking its vertex offset for zero-draw-call collapsing.
   * If propData is provided, registers it in this.knockableProps with vertexStart, vertexCount, and chunk reference.
   */
  _pushPropGeom(geom, propGeoms, propData = null) {
    if (!geom) return;
    const nonIndexed = geom.index ? geom.toNonIndexed() : geom;
    if (propData) {
      propData.vertexStart = this._currentPropVertexCount || 0;
      propData.vertexCount = nonIndexed.attributes.position.count;
      propData.chunk = this;
      this.knockableProps.push(propData);
    }
    this._currentPropVertexCount = (this._currentPropVertexCount || 0) + nonIndexed.attributes.position.count;
    propGeoms.push(nonIndexed);
  }

  /**
   * Instantly collapses a smashed prop's vertices below ground (Y = -999.0) in propsMesh.
   * Zero draw calls created; instant visual demolition of the static model.
   */
  collapseProp(prop) {
    if (!this.propsMesh || !this.propsMesh.geometry || prop.vertexCount === undefined) return;
    const pos = this.propsMesh.geometry.attributes.position;
    const start = prop.vertexStart;
    const end = prop.vertexStart + prop.vertexCount;
    for (let i = start; i < end; i++) {
      pos.setY(i, -999.0);
    }
    pos.needsUpdate = true;
  }

  _generateRoadMarkings(wx, wz, markingGeoms) {
    // Crosswalks on each of the 4 road entry legs
    // North (z = +28.5), South (z = -28.5), East (x = +28.5), West (x = -28.5)
    this._addCrosswalk(wx, wz + 28.5, 9.0, true, markingGeoms);
    this._addCrosswalk(wx, wz - 28.5, 9.0, true, markingGeoms);
    this._addCrosswalk(wx + 28.5, wz, 9.0, false, markingGeoms);
    this._addCrosswalk(wx - 28.5, wz, 9.0, false, markingGeoms);

    // Subtle painted yellow dashed lines (#f1c40f, non-emissive)
    const yellow = new THREE.Color(0xf1c40f);
    const dashLen = 2.4;
    const dashGap = 2.0;
    const dashW = 0.22;

    // East-West road dashes (north edge: z = wz + 31.85, south edge: z = wz - 31.85)
    for (let x = -26; x <= 26; x += (dashLen + dashGap)) {
      if (Math.abs(x) < 4.5) continue; // Skip intersection junction
      const dN = new THREE.PlaneGeometry(dashLen, dashW);
      dN.rotateX(-Math.PI / 2);
      dN.translate(wx + x, 0.025, wz + 31.85);
      _tagGeomColor(dN, yellow);
      markingGeoms.push(dN);
    }

    // North-South road dashes (east edge: x = wx + 31.85)
    for (let z = -26; z <= 26; z += (dashLen + dashGap)) {
      if (Math.abs(z) < 4.5) continue; // Skip intersection junction
      const dE = new THREE.PlaneGeometry(dashW, dashLen);
      dE.rotateX(-Math.PI / 2);
      dE.translate(wx + 31.85, 0.025, wz + z);
      _tagGeomColor(dE, yellow);
      markingGeoms.push(dE);
    }
  }

  _addCrosswalk(cx, cz, width, horizontal, markingGeoms) {
    const stripes = 7;
    const stripeWidth = 0.55;
    const stripeGap = 0.55;
    const stripeLength = 2.4;
    // Matte, non-emissive off-white striping (#b0b8c4)
    const offWhite = new THREE.Color(0xb0b8c4);

    for (let i = 0; i < stripes; i++) {
      const offset = (i - (stripes - 1) * 0.5) * (stripeWidth + stripeGap);
      let g;
      if (horizontal) {
        g = new THREE.PlaneGeometry(stripeWidth, stripeLength);
        g.rotateX(-Math.PI / 2);
        g.translate(cx + offset, 0.028, cz);
      } else {
        g = new THREE.PlaneGeometry(stripeLength, stripeWidth);
        g.rotateX(-Math.PI / 2);
        g.translate(cx, 0.028, cz + offset);
      }
      _tagGeomColor(g, offWhite);
      markingGeoms.push(g);
    }
  }

  /** Sidewalk slab: Matte grey stone (#c0cbd8) with darker trim curbs (#94a3b8) */
  _addSidewalkAndCurbs(wx, wz, sidewalkGeoms) {
    const swColor = new THREE.Color(0xc0cbd8); // Matte grey stone
    const curbColor = new THREE.Color(0x94a3b8); // Darker trim curbs

    // 1. Inner sidewalk slab (51.2 x 51.2m, height 0.22m)
    const sw = new THREE.BoxGeometry(SIDEWALK_HALF * 2 - 0.8, 0.22, SIDEWALK_HALF * 2 - 0.8);
    sw.translate(wx, 0.11, wz);
    _tagGeomColor(sw, swColor);
    sidewalkGeoms.push(sw);

    // 2. Curbs along all 4 perimeter borders (height 0.24m, thickness 0.40m)
    const curbN = new THREE.BoxGeometry(SIDEWALK_HALF * 2, 0.24, 0.40);
    curbN.translate(wx, 0.12, wz + SIDEWALK_HALF - 0.20);
    _tagGeomColor(curbN, curbColor);
    sidewalkGeoms.push(curbN);

    const curbS = new THREE.BoxGeometry(SIDEWALK_HALF * 2, 0.24, 0.40);
    curbS.translate(wx, 0.12, wz - SIDEWALK_HALF + 0.20);
    _tagGeomColor(curbS, curbColor);
    sidewalkGeoms.push(curbS);

    const curbW = new THREE.BoxGeometry(0.40, 0.24, SIDEWALK_HALF * 2 - 0.8);
    curbW.translate(wx - SIDEWALK_HALF + 0.20, 0.12, wz);
    _tagGeomColor(curbW, curbColor);
    sidewalkGeoms.push(curbW);

    const curbE = new THREE.BoxGeometry(0.40, 0.24, SIDEWALK_HALF * 2 - 0.8);
    curbE.translate(wx + SIDEWALK_HALF - 0.20, 0.12, wz);
    _tagGeomColor(curbE, curbColor);
    sidewalkGeoms.push(curbE);
  }

  _generateCommercialBlock(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms) {
    this._addSidewalkAndCurbs(wx, wz, sidewalkGeoms);

    // Split block into 2 large commercial lots with an alley in between
    const splitHoriz = this.rng() > 0.5;
    const subBlocks = [];

    if (splitHoriz) {
      subBlocks.push({
        minX: wx - SIDEWALK_HALF + 1.2,
        maxX: wx - 3.0,
        minZ: wz - SIDEWALK_HALF + 1.2,
        maxZ: wz + SIDEWALK_HALF - 1.2,
        rotY: Math.PI / 2,
      });
      subBlocks.push({
        minX: wx + 3.0,
        maxX: wx + SIDEWALK_HALF - 1.2,
        minZ: wz - SIDEWALK_HALF + 1.2,
        maxZ: wz + SIDEWALK_HALF - 1.2,
        rotY: -Math.PI / 2,
      });
      this._addDumpster(wx, wz - 8, 0, propGeoms);
      this._addDumpster(wx, wz + 8, Math.PI, propGeoms);
    } else {
      subBlocks.push({
        minX: wx - SIDEWALK_HALF + 1.2,
        maxX: wx + SIDEWALK_HALF - 1.2,
        minZ: wz - SIDEWALK_HALF + 1.2,
        maxZ: wz - 3.0,
        rotY: 0,
      });
      subBlocks.push({
        minX: wx - SIDEWALK_HALF + 1.2,
        maxX: wx + SIDEWALK_HALF - 1.2,
        minZ: wz + 3.0,
        maxZ: wz + SIDEWALK_HALF - 1.2,
        rotY: Math.PI,
      });
      this._addDumpster(wx - 8, wz, Math.PI / 2, propGeoms);
      this._addDumpster(wx + 8, wz, -Math.PI / 2, propGeoms);
    }

    for (let i = 0; i < subBlocks.length; i++) {
      const b = subBlocks[i];
      this._placeBuilding(b, buildingGeoms, kenneyGeoms, propGeoms);
    }
  }

  _generateSkyscraperPlaza(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms) {
    this._addSidewalkAndCurbs(wx, wz, sidewalkGeoms);

    // Skyscraper occupies the north half (48m x 22m), Plaza occupies the south half
    const b = {
      minX: wx - SIDEWALK_HALF + 1.5,
      maxX: wx + SIDEWALK_HALF - 1.5,
      minZ: wz + 2.5,
      maxZ: wz + SIDEWALK_HALF - 1.5,
      rotY: Math.PI,
      forceSkyscraper: true,
    };
    this._placeBuilding(b, buildingGeoms, kenneyGeoms, propGeoms);

    // Plaza area in south half
    const plazaY = 0.23;
    const tileMat = new THREE.BoxGeometry(40.0, 0.04, 18.0);
    tileMat.translate(wx, plazaY, wz - 12.0);
    this._applyVertexColors(tileMat, new THREE.Color(0xdde3ea));
    this._pushPropGeom(tileMat, propGeoms);

    this._addBench(wx - 8, wz - 12, 0, propGeoms);
    this._addBench(wx + 8, wz - 12, Math.PI, propGeoms);
    this._addBench(wx, wz - 6, Math.PI / 2, propGeoms);

    this._addTree(wx - 14, wz - 12, 1.1, propGeoms);
    this._addTree(wx + 14, wz - 12, 1.1, propGeoms);
    this._addTree(wx - 14, wz - 6, 0.95, propGeoms);
    this._addTree(wx + 14, wz - 6, 0.95, propGeoms);

    // Procedural Quarantine Zone (~15% of plaza chunks, skip chunk 0,0)
    if (this.forceQuarantineZone || ((this.cx !== 0 || this.cz !== 0) && this.rng() < 0.15)) {
      this._generateQuarantineZone(wx, wz - 12.0, propGeoms);
    }
  }

  _generateParkBlock(wx, wz, sidewalkGeoms, parkGrassGeoms, propGeoms) {
    this._addSidewalkAndCurbs(wx, wz, sidewalkGeoms);

    // Warm vibrant lime green grass (#84cc16) occupying central 46x46m, elevated to Y = 0.25
    const grass = new THREE.BoxGeometry(46.0, 0.06, 46.0);
    grass.translate(wx, 0.25, wz);
    _tagGeomColor(grass, new THREE.Color(0x84cc16));
    parkGrassGeoms.push(grass);

    // Dual-tone decorative grass patches (#65a30d)
    const patchCoords = [
      { px: -12.0, pz: -12.0, pw: 12.0, pd: 12.0 },
      { px: 12.0, pz: -12.0, pw: 10.0, pd: 14.0 },
      { px: -13.0, pz: 11.0, pw: 11.0, pd: 11.0 },
      { px: 11.0, pz: 13.0, pw: 13.0, pd: 9.0 },
      { px: -18.0, pz: -4.0, pw: 7.0, pd: 6.0 },
      { px: 18.0, pz: 4.0, pw: 6.0, pd: 7.0 },
    ];
    const patchColor = new THREE.Color(0x65a30d);
    for (let i = 0; i < patchCoords.length; i++) {
      const p = patchCoords[i];
      const patch = new THREE.BoxGeometry(p.pw, 0.062, p.pd);
      patch.translate(wx + p.px, 0.251, wz + p.pz);
      _tagGeomColor(patch, patchColor);
      parkGrassGeoms.push(patch);
    }

    // Walking paths
    const path1 = new THREE.BoxGeometry(46.0, 0.02, 3.4);
    path1.translate(wx, 0.29, wz);
    this._applyVertexColors(path1, new THREE.Color(0xdfd7c8));
    this._pushPropGeom(path1, propGeoms);

    const path2 = new THREE.BoxGeometry(3.4, 0.02, 46.0);
    path2.translate(wx, 0.29, wz);
    this._applyVertexColors(path2, new THREE.Color(0xdfd7c8));
    this._pushPropGeom(path2, propGeoms);

    // Central park plaza circle / fountain base
    const centerPad = new THREE.CylinderGeometry(4.5, 4.5, 0.35, 12);
    centerPad.translate(wx, 0.4, wz);
    this._applyVertexColors(centerPad, new THREE.Color(0xcfd6df));
    this._pushPropGeom(centerPad, propGeoms);

    const treeOffsets = [
      { ox: -12, oz: -12 },
      { ox: 12, oz: -12 },
      { ox: -12, oz: 12 },
      { ox: 12, oz: 12 },
      { ox: -17, oz: 0 },
      { ox: 17, oz: 0 },
      { ox: 0, oz: -17 },
      { ox: 0, oz: 17 },
    ];

    for (const off of treeOffsets) {
      const tx = wx + off.ox + (this.rng() - 0.5) * 2.5;
      const tz = wz + off.oz + (this.rng() - 0.5) * 2.5;
      this._addTree(tx, tz, 0.95 + this.rng() * 0.4, propGeoms);
    }

    this._addBench(wx - 5.5, wz, Math.PI / 2, propGeoms);
    this._addBench(wx + 5.5, wz, -Math.PI / 2, propGeoms);
    this._addBench(wx, wz - 5.5, 0, propGeoms);
    this._addBench(wx, wz + 5.5, Math.PI, propGeoms);

    // Procedural Quarantine Zone (~15% of park chunks, skip chunk 0,0)
    if (this.forceQuarantineZone || ((this.cx !== 0 || this.cz !== 0) && this.rng() < 0.15)) {
      this._generateQuarantineZone(wx, wz, propGeoms);
    }
  }

  /**
   * Procedural Fortified Quarantine Outpost (@designer, @artist & @qa)
   * Yellow/black hazard barrier tape meshes and barricade props along street access points,
   * concrete sandbag barriers with collision for sniper posts,
   * pulsing red/yellow holographic ground projection ring (radius: ~16m),
   * and hovering warning banner ("⚠️ HIGH-RISK QUARANTINE ZONE").
   */
  _generateQuarantineZone(qx, qz, propGeoms) {
    this.isQuarantineZone = true;
    this.quarantineRadius = 16.0;
    this.quarantineCenter = { x: qx, z: qz };
    this.quarantineSandbagPositions = [];

    // 1. Perimeter Hazard Barrier Tapes and Barricade Props at 4 Access Choke Points (radius ~14.8m)
    const accessOffsets = [
      { dx: 0, dz: 14.8, rotY: 0 },          // North entrance
      { dx: 0, dz: -14.8, rotY: 0 },         // South entrance
      { dx: 14.8, dz: 0, rotY: Math.PI / 2 }, // East entrance
      { dx: -14.8, dz: 0, rotY: Math.PI / 2 },// West entrance
    ];

    for (let i = 0; i < accessOffsets.length; i++) {
      const ao = accessOffsets[i];
      const bx = qx + ao.dx;
      const bz = qz + ao.dz;

      // Heavy concrete barrier base (width: 3.8m, height: 1.0m, depth: 0.6m)
      const barBase = new THREE.BoxGeometry(3.8, 1.0, 0.6);
      barBase.translate(0, 0.5, 0);
      if (ao.rotY !== 0) barBase.rotateY(ao.rotY);
      barBase.translate(bx, 0.25, bz);
      this._applyVertexColors(barBase, new THREE.Color(0x64748b));
      this._pushPropGeom(barBase, propGeoms);

      // Yellow & black hazard stripes across the barrier face
      const stripeWidth = 0.62;
      for (let s = -2; s <= 2; s++) {
        const stripeBox = new THREE.BoxGeometry(stripeWidth, 0.95, 0.64);
        stripeBox.translate(s * (stripeWidth + 0.05), 0.5, 0);
        if (ao.rotY !== 0) stripeBox.rotateY(ao.rotY);
        stripeBox.translate(bx, 0.25, bz);
        const stripeColor = (s % 2 === 0) ? new THREE.Color(0xfacc15) : new THREE.Color(0x18181b);
        this._applyVertexColors(stripeBox, stripeColor);
        this._pushPropGeom(stripeBox, propGeoms);
      }

      // Vertical hazard posts with warning tape anchors on ends
      for (const pSign of [-1.85, 1.85]) {
        const pylon = new THREE.CylinderGeometry(0.08, 0.1, 1.3, 8);
        pylon.translate(pSign, 0.65, 0);
        if (ao.rotY !== 0) pylon.rotateY(ao.rotY);
        pylon.translate(bx, 0.25, bz);
        this._applyVertexColors(pylon, new THREE.Color(0xf59e0b));
        this._pushPropGeom(pylon, propGeoms);
      }

      // Register collision box obstacle
      if (ao.rotY === 0) {
        this.obstacles.push({
          minX: bx - 2.0,
          maxX: bx + 2.0,
          minZ: bz - 0.45,
          maxZ: bz + 0.45,
          isBarricade: true,
        });
      } else {
        this.obstacles.push({
          minX: bx - 0.45,
          maxX: bx + 0.45,
          minZ: bz - 2.0,
          maxZ: bz + 2.0,
          isBarricade: true,
        });
      }
    }

    // 2. Concrete Sandbag Defense Posts for 3 Military Riflemen (radius ~7.5m)
    const sandbagPosts = [
      { angle: -Math.PI * 0.25, dist: 7.5 }, // North-West post
      { angle: Math.PI * 0.25, dist: 7.5 },  // North-East post
      { angle: Math.PI * 0.85, dist: 7.5 },  // South post
    ];

    for (let i = 0; i < sandbagPosts.length; i++) {
      const sp = sandbagPosts[i];
      const sx = qx + Math.sin(sp.angle) * sp.dist;
      const sz = qz + Math.cos(sp.angle) * sp.dist;

      // Lower row sandbags
      const row1 = new THREE.BoxGeometry(2.6, 0.42, 0.6);
      row1.translate(0, 0.21, 0);
      row1.rotateY(sp.angle);
      row1.translate(sx, 0.25, sz);
      this._applyVertexColors(row1, new THREE.Color(0xc2b280));
      this._pushPropGeom(row1, propGeoms);

      // Upper row sandbags (staggered)
      const row2 = new THREE.BoxGeometry(2.3, 0.38, 0.52);
      row2.translate(0, 0.58, 0);
      row2.rotateY(sp.angle);
      row2.translate(sx, 0.25, sz);
      this._applyVertexColors(row2, new THREE.Color(0x9a8e63));
      this._pushPropGeom(row2, propGeoms);

      // Register obstacle
      this.obstacles.push({
        minX: sx - 1.3,
        maxX: sx + 1.3,
        minZ: sz - 0.5,
        maxZ: sz + 0.5,
        isSandbag: true,
      });

      this.quarantineSandbagPositions.push({
        x: sx,
        z: sz,
        facingAngle: sp.angle,
      });
    }

    // 3. Pulsing Red/Yellow Holographic Ground Projection Ring (radius: ~16m)
    const ringGeom = new THREE.RingGeometry(15.2, 16.0, 64);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.position.set(qx, 0.28, qz);
    this.quarantineRingMesh = ringMesh;
    this.meshes.push(ringMesh);

    // 4. Hovering Hazard Warning Banner ("⚠️ HIGH-RISK QUARANTINE ZONE")
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      if (ctx.roundRect) {
        ctx.roundRect(8, 8, 496, 112, 16);
      } else {
        ctx.rect(8, 8, 496, 112);
      }
      ctx.fill();

      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();

      ctx.font = '900 24px "Outfit", "Inter", sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️ HIGH-RISK QUARANTINE ZONE', 256, 48);

      ctx.font = '700 14px "Outfit", "Inter", sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.fillText('LETHAL DEFENSES • OVERRUN FOR REWARDS', 256, 84);

      const bannerTex = new THREE.CanvasTexture(canvas);
      const bannerMat = new THREE.SpriteMaterial({ map: bannerTex, transparent: true });
      const bannerSprite = new THREE.Sprite(bannerMat);
      bannerSprite.scale.set(9.0, 2.25, 1.0);
      bannerSprite.position.set(qx, 4.8, qz);
      this.quarantineBannerSprite = bannerSprite;
      this.meshes.push(bannerSprite);
    }
  }

  /**
   * Updates holographic ring pulse and warning banner bobbing animation.
   */
  updateQuarantineVisuals(time, dt) {
    if (!this.isQuarantineZone) return;

    if (this.quarantineOverrun) {
      if (this.quarantineRingMesh && this.quarantineRingMesh.material) {
        this.quarantineRingMesh.material.color.setHex(0x10b981);
        this.quarantineRingMesh.material.opacity = 0.5 + 0.3 * Math.sin(time * 3.0);
      }
      if (this.quarantineBannerSprite && this.quarantineBannerSprite.material) {
        this.quarantineBannerSprite.position.y = 4.8 + Math.sin(time * 2.0) * 0.1;
        this._overrunTime = (this._overrunTime || 0) + dt;
        this.quarantineBannerSprite.material.opacity = Math.max(0.2, 1.0 - this._overrunTime * 0.15);
      }
    } else {
      if (this.quarantineRingMesh && this.quarantineRingMesh.material) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4.5);
        this.quarantineRingMesh.material.color.setRGB(0.95, 0.18 + pulse * 0.45, 0.04);
        this.quarantineRingMesh.material.opacity = 0.65 + pulse * 0.3;
      }
      if (this.quarantineBannerSprite) {
        this.quarantineBannerSprite.position.y = 4.8 + Math.sin(time * 2.5) * 0.15;
      }
    }
  }

  _generateMultiShopBlock(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms) {
    this._addSidewalkAndCurbs(wx, wz, sidewalkGeoms);

    const quadrants = [
      {
        minX: wx - SIDEWALK_HALF + 1.2,
        maxX: wx - 1.8,
        minZ: wz - SIDEWALK_HALF + 1.2,
        maxZ: wz - 1.8,
        rotY: 0,
      },
      {
        minX: wx + 1.8,
        maxX: wx + SIDEWALK_HALF - 1.2,
        minZ: wz - SIDEWALK_HALF + 1.2,
        maxZ: wz - 1.8,
        rotY: Math.PI / 2,
      },
      {
        minX: wx - SIDEWALK_HALF + 1.2,
        maxX: wx - 1.8,
        minZ: wz + 1.8,
        maxZ: wz + SIDEWALK_HALF - 1.2,
        rotY: -Math.PI / 2,
      },
      {
        minX: wx + 1.8,
        maxX: wx + SIDEWALK_HALF - 1.2,
        minZ: wz + 1.8,
        maxZ: wz + SIDEWALK_HALF - 1.2,
        rotY: Math.PI,
      },
    ];

    for (const q of quadrants) {
      this._placeBuilding(q, buildingGeoms, kenneyGeoms, propGeoms);
    }

    this._addDumpster(wx, wz, 0, propGeoms);
  }

  /**
   * Spawn Chunk (0, 0): Grand Open Street Intersection & Avenues
   * Creates a central open 4-way intersection at (0, 0) with open asphalt roadways
   * running along X = 0 and Z = 0. Four corner sidewalk quadrants are set back
   * to guarantee zero building occlusions and unobstructed line of sight for Patient Zero.
   */
  _generateSpawnIntersectionBlock(wx, wz, sidewalkGeoms, buildingGeoms, kenneyGeoms, propGeoms, markingGeoms) {
    const swColor = new THREE.Color(0xc0cbd8); // Matte grey stone
    const curbColor = new THREE.Color(0x94a3b8); // Darker trim curbs

    // Four corner quadrants: NW, NE, SW, SE
    // Avenue width: 14m (x from -7.0 to +7.0, z from -7.0 to +7.0)
    // Sidewalk outer boundary: SIDEWALK_HALF (26.0m)
    // Sidewalk inner boundary: 7.0m
    // Quadrant dimensions: width = 19.0m, depth = 19.0m
    const qW = 19.0;
    const qD = 19.0;
    const qCenterX = 16.5; // (26.0 + 7.0) / 2 = 16.5
    const qCenterZ = 16.5;

    const quadrants = [
      { cx: wx - qCenterX, cz: wz + qCenterZ, rotY: 0 },         // NW
      { cx: wx + qCenterX, cz: wz + qCenterZ, rotY: Math.PI },   // NE
      { cx: wx - qCenterX, cz: wz - qCenterZ, rotY: 0 },         // SW
      { cx: wx + qCenterX, cz: wz - qCenterZ, rotY: Math.PI },   // SE
    ];

    for (let i = 0; i < quadrants.length; i++) {
      const q = quadrants[i];

      // 1. Corner Sidewalk Slab (19.0 x 19.0m, height 0.22m, y = 0.11)
      const sw = new THREE.BoxGeometry(qW - 0.4, 0.22, qD - 0.4);
      sw.translate(q.cx, 0.11, q.cz);
      _tagGeomColor(sw, swColor);
      sidewalkGeoms.push(sw);

      // 2. Curbs along the 4 borders of each corner quadrant
      const curbN = new THREE.BoxGeometry(qW, 0.24, 0.35);
      curbN.translate(q.cx, 0.12, q.cz + qD * 0.5 - 0.175);
      _tagGeomColor(curbN, curbColor);
      sidewalkGeoms.push(curbN);

      const curbS = new THREE.BoxGeometry(qW, 0.24, 0.35);
      curbS.translate(q.cx, 0.12, q.cz - qD * 0.5 + 0.175);
      _tagGeomColor(curbS, curbColor);
      sidewalkGeoms.push(curbS);

      const curbW = new THREE.BoxGeometry(0.35, 0.24, qD - 0.7);
      curbW.translate(q.cx - qW * 0.5 + 0.175, 0.12, q.cz);
      _tagGeomColor(curbW, curbColor);
      sidewalkGeoms.push(curbW);

      const curbE = new THREE.BoxGeometry(0.35, 0.24, qD - 0.7);
      curbE.translate(q.cx + qW * 0.5 - 0.175, 0.12, q.cz);
      _tagGeomColor(curbE, curbColor);
      sidewalkGeoms.push(curbE);

      // 3. Place low-rise or commercial building firmly on the corner quadrant
      // Sub-block bounds: setback 2.0m from sidewalk edges (buildings start at |x| >= 9.0 and |z| >= 9.0)
      const bLot = {
        minX: q.cx - qW * 0.5 + 2.0,
        maxX: q.cx + qW * 0.5 - 2.0,
        minZ: q.cz - qD * 0.5 + 2.0,
        maxZ: q.cz + qD * 0.5 - 2.0,
        rotY: q.rotY,
      };
      this._placeBuilding(bLot, buildingGeoms, kenneyGeoms, propGeoms);

      // Add a decorative corner tree setback on sidewalk
      const treeX = q.cx > wx ? q.cx - 5.5 : q.cx + 5.5;
      const treeZ = q.cz > wz ? q.cz - 5.5 : q.cz + 5.5;
      this._addTree(treeX, treeZ, 0.95, propGeoms);
    }

    // 4. Crosswalk Markings at the 4 approach legs of the central intersection
    if (markingGeoms) {
      this._addCrosswalk(wx, wz + 7.0, 9.0, true, markingGeoms);
      this._addCrosswalk(wx, wz - 7.0, 9.0, true, markingGeoms);
      this._addCrosswalk(wx + 7.0, wz, 9.0, false, markingGeoms);
      this._addCrosswalk(wx - 7.0, wz, 9.0, false, markingGeoms);
    }
  }

  _placeBuilding(b, buildingGeoms, kenneyGeoms, propGeoms) {
    const bWidth = b.maxX - b.minX;
    const bDepth = b.maxZ - b.minZ;
    const bCenterX = (b.minX + b.maxX) * 0.5;
    const bCenterZ = (b.minZ + b.maxZ) * 0.5;

    // Commercial glass storefronts can be breached by Titan or 20+ horde (@designer)
    const isStorefront = (bWidth >= 10 && bDepth >= 10 && this.rng() < 0.35);

    this.obstacles.push({
      minX: b.minX,
      maxX: b.maxX,
      minZ: b.minZ,
      maxZ: b.maxZ,
      centerX: bCenterX,
      centerZ: bCenterZ,
      halfW: bWidth * 0.5,
      halfD: bDepth * 0.5,
      isStorefront,
      breached: false,
    });

    // Generate hand-made stylized cartoon building with 2-3 stepped stories,
    // roof parapets/ledges with contrasting trim, and simple grid windows (pale yellow/blue panes)
    this._buildCartoonBuilding(bCenterX, bCenterZ, bWidth, bDepth, b.forceSkyscraper, buildingGeoms);
  }

  _buildCartoonBuilding(cx, cz, bWidth, bDepth, forceSkyscraper, buildingGeoms) {
    const color = BUILDING_PALETTE[Math.floor(this.rng() * BUILDING_PALETTE.length)];
    const trimColor = TRIM_PALETTE[Math.floor(this.rng() * TRIM_PALETTE.length)];
    const winColor = WINDOW_PALETTES[Math.floor(this.rng() * WINDOW_PALETTES.length)];

    const has3Stories = forceSkyscraper || this.rng() > 0.35;

    // --- Story 1 (Ground Story) ---
    const h1 = forceSkyscraper ? 8.0 + this.rng() * 3.0 : 5.0 + this.rng() * 2.0;
    const story1 = new THREE.BoxGeometry(bWidth, h1, bDepth);
    story1.translate(cx, h1 * 0.5 + 0.22, cz);
    _tagGeomColor(story1, color);
    buildingGeoms.push(story1);

    // Story 1 Trim Ledge / Belt Course
    const ledge1 = new THREE.BoxGeometry(bWidth + 0.45, 0.35, bDepth + 0.45);
    ledge1.translate(cx, h1 + 0.22 + 0.175, cz);
    _tagGeomColor(ledge1, trimColor);
    buildingGeoms.push(ledge1);

    // Ground story grid windows
    this._addWindowGrid(cx, cz, bWidth, bDepth, 0.22, h1, winColor, buildingGeoms);

    // Ground story storefront awning
    this._addStorefrontAwning(cx, cz, bWidth, bDepth, buildingGeoms);

    // --- Story 2 (Middle Tier) ---
    const inset2 = 1.4;
    const w2 = Math.max(5.0, bWidth - inset2 * 2);
    const d2 = Math.max(5.0, bDepth - inset2 * 2);
    const h2 = forceSkyscraper ? 7.0 + this.rng() * 3.0 : 4.5 + this.rng() * 2.0;
    const y2Base = h1 + 0.22 + 0.35;

    const story2 = new THREE.BoxGeometry(w2, h2, d2);
    story2.translate(cx, y2Base + h2 * 0.5, cz);
    _tagGeomColor(story2, color);
    buildingGeoms.push(story2);

    // Story 2 Windows
    this._addWindowGrid(cx, cz, w2, d2, y2Base, h2, winColor, buildingGeoms);

    if (has3Stories) {
      // Story 2 Trim Ledge
      const ledge2 = new THREE.BoxGeometry(w2 + 0.45, 0.35, d2 + 0.45);
      ledge2.translate(cx, y2Base + h2 + 0.175, cz);
      _tagGeomColor(ledge2, trimColor);
      buildingGeoms.push(ledge2);

      // --- Story 3 (Top Tier / Tower) ---
      const inset3 = 1.2;
      const w3 = Math.max(3.8, w2 - inset3 * 2);
      const d3 = Math.max(3.8, d2 - inset3 * 2);
      const h3 = forceSkyscraper ? 6.5 + this.rng() * 4.0 : 3.8 + this.rng() * 1.5;
      const y3Base = y2Base + h2 + 0.35;

      const story3 = new THREE.BoxGeometry(w3, h3, d3);
      story3.translate(cx, y3Base + h3 * 0.5, cz);
      _tagGeomColor(story3, color);
      buildingGeoms.push(story3);

      // Story 3 Windows
      this._addWindowGrid(cx, cz, w3, d3, y3Base, h3, winColor, buildingGeoms);

      // Roof Parapet on Story 3
      const parapet = new THREE.BoxGeometry(w3 + 0.5, 0.65, d3 + 0.5);
      parapet.translate(cx, y3Base + h3 + 0.32, cz);
      _tagGeomColor(parapet, trimColor);
      buildingGeoms.push(parapet);

      // Rooftop props (AC condenser units and water towers)
      this._addRooftopDetails(cx, cz, w3, d3, y3Base + h3 + 0.65, buildingGeoms);
    } else {
      // Roof Parapet on Story 2
      const parapet = new THREE.BoxGeometry(w2 + 0.5, 0.65, d2 + 0.5);
      parapet.translate(cx, y2Base + h2 + 0.32, cz);
      _tagGeomColor(parapet, trimColor);
      buildingGeoms.push(parapet);

      // Rooftop props (AC condenser units and water towers)
      this._addRooftopDetails(cx, cz, w2, d2, y2Base + h2 + 0.65, buildingGeoms);
    }
  }

  _addStorefrontAwning(cx, cz, bWidth, bDepth, buildingGeoms) {
    if (bWidth < 5.0) return;
    const AWNING_COLORS = [
      new THREE.Color(0xd90429), // Crimson
      new THREE.Color(0x0284c7), // Sky Blue
      new THREE.Color(0x16a34a), // Emerald Green
      new THREE.Color(0xea580c), // Tangerine
      new THREE.Color(0x7c3aed), // Royal Purple
    ];
    const awnColor = AWNING_COLORS[Math.floor(this.rng() * AWNING_COLORS.length)];
    const whiteColor = new THREE.Color(0xc0cbd8);

    const awnW = Math.min(bWidth - 1.6, 6.0);
    const numStripes = 6;
    const stripeW = awnW / numStripes;
    const awnY = 3.1;
    const proj = 1.25;

    // Front awning (+Z face)
    for (let i = 0; i < numStripes; i++) {
      const color = (i % 2 === 0) ? awnColor : whiteColor;
      const sx = cx - awnW * 0.5 + (i + 0.5) * stripeW;

      // Sloped canopy
      const canopy = new THREE.BoxGeometry(stripeW * 0.96, 0.1, proj);
      canopy.rotateX(0.24);
      canopy.translate(sx, awnY, cz + bDepth * 0.5 + proj * 0.48);
      _tagGeomColor(canopy, color);
      buildingGeoms.push(canopy);

      // Hanging decorative valance flap
      const valance = new THREE.BoxGeometry(stripeW * 0.96, 0.28, 0.08);
      valance.translate(sx, awnY - 0.22, cz + bDepth * 0.5 + proj * 0.95);
      _tagGeomColor(valance, color);
      buildingGeoms.push(valance);
    }
  }

  _addRooftopDetails(cx, cz, topW, topD, roofY, buildingGeoms) {
    const metalColor = new THREE.Color(0x64748b);
    const grillColor = new THREE.Color(0x1e293b);
    const woodColor = new THREE.Color(0x854d0e);
    const capColor = new THREE.Color(0x334155);

    // 1. Primary AC Condenser Unit
    const ac1 = new THREE.BoxGeometry(1.5, 0.85, 1.2);
    const acX = cx - Math.min(topW * 0.25, 2.0);
    const acZ = cz - Math.min(topD * 0.25, 2.0);
    ac1.translate(acX, roofY + 0.425, acZ);
    _tagGeomColor(ac1, metalColor);
    buildingGeoms.push(ac1);

    // Circular fan grill on top of AC unit
    const grill1 = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 8);
    grill1.translate(acX, roofY + 0.85 + 0.03, acZ);
    _tagGeomColor(grill1, grillColor);
    buildingGeoms.push(grill1);

    // Optional second AC unit (50% chance)
    if (this.rng() > 0.5 && topW > 5.0) {
      const ac2 = new THREE.BoxGeometry(1.1, 0.7, 0.9);
      const ac2X = acX + 1.8;
      ac2.translate(ac2X, roofY + 0.35, acZ);
      _tagGeomColor(ac2, metalColor);
      buildingGeoms.push(ac2);

      const grill2 = new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8);
      grill2.translate(ac2X, roofY + 0.7 + 0.025, acZ);
      _tagGeomColor(grill2, grillColor);
      buildingGeoms.push(grill2);
    }

    // 2. Water Tower on larger rooftops (55% chance if roof is large enough)
    if (this.rng() > 0.45 && topW >= 5.5 && topD >= 5.5) {
      const towerX = cx + Math.min(topW * 0.25, 2.2);
      const towerZ = cz + Math.min(topD * 0.25, 2.2);
      const legH = 1.6;
      const legOffset = 0.55;

      // 4 Stilts / Legs
      const legPositions = [
        [-legOffset, -legOffset],
        [legOffset, -legOffset],
        [-legOffset, legOffset],
        [legOffset, legOffset],
      ];
      for (const [ox, oz] of legPositions) {
        const leg = new THREE.BoxGeometry(0.12, legH, 0.12);
        leg.translate(towerX + ox, roofY + legH * 0.5, towerZ + oz);
        _tagGeomColor(leg, grillColor);
        buildingGeoms.push(leg);
      }

      // Wooden support platform
      const platform = new THREE.BoxGeometry(1.5, 0.15, 1.5);
      platform.translate(towerX, roofY + legH + 0.075, towerZ);
      _tagGeomColor(platform, woodColor);
      buildingGeoms.push(platform);

      // Water Tank (Cedar wood barrel)
      const tankH = 1.4;
      const tank = new THREE.CylinderGeometry(0.85, 0.85, tankH, 10);
      tank.translate(towerX, roofY + legH + 0.15 + tankH * 0.5, towerZ);
      _tagGeomColor(tank, woodColor);
      buildingGeoms.push(tank);

      // Conical Roof Cap
      const capH = 0.55;
      const cap = new THREE.ConeGeometry(0.95, capH, 10);
      cap.translate(towerX, roofY + legH + 0.15 + tankH + capH * 0.5, towerZ);
      _tagGeomColor(cap, capColor);
      buildingGeoms.push(cap);
    }
  }

  _addWindowGrid(cx, cz, w, d, yBase, h, winColor, buildingGeoms) {
    const winW = 1.0;
    const winH = 1.2;
    const spacingX = 2.4;
    const spacingY = 2.2;

    const rows = Math.max(1, Math.floor((h - 1.0) / spacingY));
    const colsX = Math.max(1, Math.floor((w - 2.0) / spacingX));
    const colsZ = Math.max(1, Math.floor((d - 2.0) / spacingX));

    for (let r = 0; r < rows; r++) {
      const wy = yBase + 1.2 + r * spacingY;

      // Front (+Z) and Back (-Z) faces
      for (let c = 0; c < colsX; c++) {
        const wx = cx - (colsX - 1) * 0.5 * spacingX + c * spacingX;
        const winF = new THREE.BoxGeometry(winW, winH, 0.12);
        winF.translate(wx, wy, cz + d * 0.5 + 0.04);
        _tagGeomColor(winF, winColor);
        buildingGeoms.push(winF);

        const winB = new THREE.BoxGeometry(winW, winH, 0.12);
        winB.translate(wx, wy, cz - d * 0.5 - 0.04);
        _tagGeomColor(winB, winColor);
        buildingGeoms.push(winB);
      }

      // Left (-X) and Right (+X) faces
      for (let c = 0; c < colsZ; c++) {
        const wz = cz - (colsZ - 1) * 0.5 * spacingX + c * spacingX;
        const winL = new THREE.BoxGeometry(0.12, winH, winW);
        winL.translate(cx - w * 0.5 - 0.04, wy, wz);
        _tagGeomColor(winL, winColor);
        buildingGeoms.push(winL);

        const winR = new THREE.BoxGeometry(0.12, winH, winW);
        winR.translate(cx + w * 0.5 + 0.04, wy, wz);
        _tagGeomColor(winR, winColor);
        buildingGeoms.push(winR);
      }
    }
  }

  _generatePerimeterProps(wx, wz, propGeoms) {
    const swMinX = wx - SIDEWALK_HALF;
    const swMaxX = wx + SIDEWALK_HALF;
    const swMinZ = wz - SIDEWALK_HALF;
    const swMaxZ = wz + SIDEWALK_HALF;

    // E1: Record lamp head positions for runtime PointLights
    const lampPos = [
      { x: swMinX + 1.2 + 0.6, z: swMinZ + 1.2 },
      { x: swMaxX - 1.2 + 0.6, z: swMinZ + 1.2 },
      { x: swMinX + 1.2 + 0.6, z: swMaxZ - 1.2 },
      { x: swMaxX - 1.2 + 0.6, z: swMaxZ - 1.2 },
    ];
    this.lampPositions.push(...lampPos);

    this._addStreetLamp(swMinX + 1.2, swMinZ + 1.2, propGeoms);
    this._addStreetLamp(swMaxX - 1.2, swMinZ + 1.2, propGeoms);
    this._addStreetLamp(swMinX + 1.2, swMaxZ - 1.2, propGeoms);
    this._addStreetLamp(swMaxX - 1.2, swMaxZ - 1.2, propGeoms);

    // Stop Lights at the four corners facing the intersection
    this._addStopLight(swMinX + 1.0, swMinZ + 1.0, Math.PI * 0.25, propGeoms);
    this._addStopLight(swMaxX - 1.0, swMinZ + 1.0, Math.PI * 0.75, propGeoms);
    this._addStopLight(swMinX + 1.0, swMaxZ - 1.0, -Math.PI * 0.25, propGeoms);
    this._addStopLight(swMaxX - 1.0, swMaxZ - 1.0, -Math.PI * 0.75, propGeoms);

    if (this.rng() > 0.4) {
      this._addHydrant(swMinX + 1.2, wz, propGeoms);
    }
    if (this.rng() > 0.4) {
      this._addHydrant(wx, swMinZ + 1.2, propGeoms);
    }
    if (this.rng() > 0.4) {
      this._addTrashCan(swMaxX - 1.2, wz, propGeoms);
    }

    if (this.rng() > 0.3) {
      this._addParkedCar(swMinX - 2.4, wz + (this.rng() - 0.5) * 12.0, 0, propGeoms);
    }
    if (this.rng() > 0.3) {
      this._addParkedCar(swMaxX + 2.4, wz + (this.rng() - 0.5) * 12.0, Math.PI, propGeoms);
    }
    if (this.rng() > 0.3) {
      this._addParkedCar(wx + (this.rng() - 0.5) * 12.0, swMinZ - 2.4, Math.PI / 2, propGeoms);
    }

    // Chunky cloud-style bushes & trees along perimeter sidewalks
    this._addTree(swMinX + 1.2, wz - 10.0, 0.9, propGeoms);
    this._addTree(swMinX + 1.2, wz + 10.0, 0.9, propGeoms);
    this._addTree(swMaxX - 1.2, wz - 10.0, 0.9, propGeoms);
    this._addTree(swMaxX - 1.2, wz + 10.0, 0.9, propGeoms);

    // Wooden park benches along perimeter sidewalks
    if (this.rng() > 0.4) {
      this._addBench(swMinX + 1.2, wz - 4.0, Math.PI / 2, propGeoms);
    }
    if (this.rng() > 0.4) {
      this._addBench(swMaxX - 1.2, wz + 4.0, -Math.PI / 2, propGeoms);
    }

    // Wooden planters with flowers along perimeter sidewalks
    if (this.rng() > 0.45) {
      this._addPlanter(wx + 6.0, swMaxZ - 1.2, 0, propGeoms);
    }
    if (this.rng() > 0.45) {
      this._addPlanter(wx - 6.0, swMinZ + 1.2, 0, propGeoms);
    }
  }

  /**
   * Chunky cloud-style bush / tree: Clustered green spheres with top-lit light green caps
   */
  _addTree(x, z, scale, propGeoms) {
    const s = scale || 1.0;
    const parts = [];

    // Short chunky wooden trunk
    const trunk = new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 0.8 * s, 6);
    trunk.translate(x, 0.4 * s + 0.22, z);
    _tagGeomColor(trunk, new THREE.Color(0x78350f));
    parts.push(trunk);

    // Base green sphere cluster (#15803d and #16a34a)
    const baseGreen = new THREE.Color(0x15803d);
    const midGreen = new THREE.Color(0x16a34a);

    const b1 = new THREE.IcosahedronGeometry(1.2 * s, 1);
    b1.translate(x, 1.45 * s + 0.22, z);
    _tagGeomColor(b1, baseGreen);
    parts.push(b1);

    const b2 = new THREE.IcosahedronGeometry(0.85 * s, 1);
    b2.translate(x - 0.55 * s, 1.25 * s + 0.22, z + 0.25 * s);
    _tagGeomColor(b2, midGreen);
    parts.push(b2);

    const b3 = new THREE.IcosahedronGeometry(0.90 * s, 1);
    b3.translate(x + 0.55 * s, 1.30 * s + 0.22, z - 0.20 * s);
    _tagGeomColor(b3, baseGreen);
    parts.push(b3);

    const b4 = new THREE.IcosahedronGeometry(0.80 * s, 1);
    b4.translate(x - 0.15 * s, 1.20 * s + 0.22, z - 0.50 * s);
    _tagGeomColor(b4, midGreen);
    parts.push(b4);

    // Top-lit light green caps (#84cc16 and #86efac)
    const capLight = new THREE.Color(0x86efac);
    const capLime = new THREE.Color(0x84cc16);

    const capTop = new THREE.IcosahedronGeometry(0.80 * s, 1);
    capTop.translate(x, 2.15 * s + 0.22, z);
    _tagGeomColor(capTop, capLight);
    parts.push(capTop);

    const capSide1 = new THREE.IcosahedronGeometry(0.58 * s, 1);
    capSide1.translate(x + 0.35 * s, 1.90 * s + 0.22, z + 0.28 * s);
    _tagGeomColor(capSide1, capLime);
    parts.push(capSide1);

    const capSide2 = new THREE.IcosahedronGeometry(0.55 * s, 1);
    capSide2.translate(x - 0.35 * s, 1.85 * s + 0.22, z - 0.18 * s);
    _tagGeomColor(capSide2, capLight);
    parts.push(capSide2);

    const mergedTree = safeMergeGeometries(parts, true);
    if (mergedTree) {
      this._pushPropGeom(mergedTree, propGeoms, {
        type: 'bush',
        x,
        z,
        radius: 1.1 * s,
        scale: s,
        knocked: false,
      });
    }
  }

  /**
   * Small wooden planter box with soil and cloud foliage
   */
  _addPlanter(x, z, rotation, propGeoms) {
    const woodColor = new THREE.Color(0x92400e);
    const soilColor = new THREE.Color(0x3f2c22);
    const plantColor = new THREE.Color(0x16a34a);
    const flowerColor1 = new THREE.Color(0xfb7185); // Salmon
    const flowerColor2 = new THREE.Color(0xfacc15); // Mustard
    const parts = [];

    // Wooden planter box
    const box = new THREE.BoxGeometry(1.3, 0.42, 0.68);
    box.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
    box.translate(x, 0.21 + 0.22, z);
    _tagGeomColor(box, woodColor);
    parts.push(box);

    // Soil bed
    const soil = new THREE.BoxGeometry(1.18, 0.04, 0.56);
    soil.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
    soil.translate(x, 0.42 + 0.22, z);
    _tagGeomColor(soil, soilColor);
    parts.push(soil);

    // Clustered cloud foliage on top
    const bush1 = new THREE.IcosahedronGeometry(0.35, 1);
    bush1.translate(x - 0.3, 0.58 + 0.22, z);
    _tagGeomColor(bush1, plantColor);
    parts.push(bush1);

    const bush2 = new THREE.IcosahedronGeometry(0.38, 1);
    bush2.translate(x + 0.25, 0.60 + 0.22, z);
    _tagGeomColor(bush2, new THREE.Color(0x86efac));
    parts.push(bush2);

    // Flowers
    const fl1 = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    fl1.translate(x - 0.22, 0.72 + 0.22, z + 0.1);
    _tagGeomColor(fl1, flowerColor1);
    parts.push(fl1);

    const fl2 = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    fl2.translate(x + 0.2, 0.74 + 0.22, z - 0.08);
    _tagGeomColor(fl2, flowerColor2);
    parts.push(fl2);

    const mergedPlanter = safeMergeGeometries(parts, true);
    if (mergedPlanter) {
      this._pushPropGeom(mergedPlanter, propGeoms, {
        type: 'planter',
        x,
        z,
        radius: 0.75,
        rotation,
        knocked: false,
      });
    }
  }

  /**
   * Dual-arm retro lamppost with hanging lanterns and warm glowing bulbs
   */
  _addStreetLamp(x, z, propGeoms) {
    const ironColor = new THREE.Color(0x1e293b);
    const bulbColor = new THREE.Color(0xfef08a);
    const parts = [];

    // Flared retro base
    const base = new THREE.CylinderGeometry(0.14, 0.24, 0.48, 8);
    base.translate(x, 0.24 + 0.22, z);
    _tagGeomColor(base, ironColor);
    parts.push(base);

    // Main fluted vertical pole
    const pole = new THREE.CylinderGeometry(0.08, 0.11, 3.6, 8);
    pole.translate(x, 2.1 + 0.22, z);
    _tagGeomColor(pole, ironColor);
    parts.push(pole);

    // Top decorative spire / finial
    const finial = new THREE.ConeGeometry(0.10, 0.32, 6);
    finial.translate(x, 4.2 + 0.22, z);
    _tagGeomColor(finial, ironColor);
    parts.push(finial);

    // Horizontal dual cross arms extending to both sides
    const crossArm = new THREE.BoxGeometry(1.65, 0.08, 0.08);
    crossArm.translate(x, 3.95 + 0.22, z);
    _tagGeomColor(crossArm, ironColor);
    parts.push(crossArm);

    // Left curved support bracket
    const leftBracket = new THREE.BoxGeometry(0.40, 0.06, 0.06);
    leftBracket.rotateZ(0.5);
    leftBracket.translate(x - 0.40, 3.75 + 0.22, z);
    _tagGeomColor(leftBracket, ironColor);
    parts.push(leftBracket);

    // Right curved support bracket
    const rightBracket = new THREE.BoxGeometry(0.40, 0.06, 0.06);
    rightBracket.rotateZ(-0.5);
    rightBracket.translate(x + 0.40, 3.75 + 0.22, z);
    _tagGeomColor(rightBracket, ironColor);
    parts.push(rightBracket);

    // Left Lantern: Hood + glowing bulb
    const hoodL = new THREE.ConeGeometry(0.22, 0.16, 6);
    hoodL.translate(x - 0.72, 3.92 + 0.22, z);
    _tagGeomColor(hoodL, ironColor);
    parts.push(hoodL);

    const bulbL = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    bulbL.translate(x - 0.72, 3.76 + 0.22, z);
    _tagGeomColor(bulbL, bulbColor);
    parts.push(bulbL);

    // Right Lantern: Hood + glowing bulb
    const hoodR = new THREE.ConeGeometry(0.22, 0.16, 6);
    hoodR.translate(x + 0.72, 3.92 + 0.22, z);
    _tagGeomColor(hoodR, ironColor);
    parts.push(hoodR);

    const bulbR = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    bulbR.translate(x + 0.72, 3.76 + 0.22, z);
    _tagGeomColor(bulbR, bulbColor);
    parts.push(bulbR);

    const mergedLamp = safeMergeGeometries(parts, true);
    if (mergedLamp) {
      this._pushPropGeom(mergedLamp, propGeoms, {
        type: 'lamp',
        x,
        z,
        radius: 0.65,
        knocked: false,
      });
    }
  }

  /**
   * Intersection Stop Light pole and housing. 
   * Records the XYZ coordinates for the Red, Yellow, and Green emissive lenses.
   */
  _addStopLight(x, z, rotY, propGeoms) {
    const ironColor = new THREE.Color(0x111827); // Very dark metal
    const yellowBoxColor = new THREE.Color(0xf59e0b); // Warning yellow housing
    const parts = [];

    // Main pole
    const pole = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8);
    pole.translate(x, 1.6 + 0.22, z);
    _tagGeomColor(pole, ironColor);
    parts.push(pole);

    // Traffic light main housing box
    const housing = new THREE.BoxGeometry(0.4, 0.9, 0.4);
    housing.translate(0, 3.2 + 0.22, 0);
    housing.rotateY(rotY);
    housing.translate(x, 0, z);
    _tagGeomColor(housing, yellowBoxColor);
    parts.push(housing);

    const mergedStopLight = safeMergeGeometries(parts, true);
    if (mergedStopLight) {
      this._pushPropGeom(mergedStopLight, propGeoms, {
        type: 'stoplight',
        x,
        z,
        radius: 0.65,
        knocked: false,
      });
    }

    const bulbZOffset = Math.cos(rotY) * 0.22;
    const bulbXOffset = Math.sin(rotY) * 0.22;

    this.stopLightPositions.push({
      x: x + bulbXOffset,
      y: 3.2 + 0.22,
      z: z + bulbZOffset,
      rotY: rotY
    });
  }

  /**
   * Wooden park bench with warm cedar slats and cast-iron frame
   */
  _addBench(x, z, rotation, propGeoms) {
    const woodDark = new THREE.Color(0xb45309);
    const woodLight = new THREE.Color(0xd97706);
    const ironColor = new THREE.Color(0x1e293b);

    const benchParts = [];

    // 3 wooden seat slats
    const slat1 = new THREE.BoxGeometry(1.6, 0.06, 0.13);
    slat1.translate(0, 0.45, -0.14);
    _tagGeomColor(slat1, woodDark);
    benchParts.push(slat1);

    const slat2 = new THREE.BoxGeometry(1.6, 0.06, 0.13);
    slat2.translate(0, 0.45, 0.0);
    _tagGeomColor(slat2, woodLight);
    benchParts.push(slat2);

    const slat3 = new THREE.BoxGeometry(1.6, 0.06, 0.13);
    slat3.translate(0, 0.45, 0.14);
    _tagGeomColor(slat3, woodDark);
    benchParts.push(slat3);

    // 2 wooden backrest slats
    const back1 = new THREE.BoxGeometry(1.6, 0.12, 0.05);
    back1.translate(0, 0.65, -0.22);
    _tagGeomColor(back1, woodLight);
    benchParts.push(back1);

    const back2 = new THREE.BoxGeometry(1.6, 0.12, 0.05);
    back2.translate(0, 0.82, -0.22);
    _tagGeomColor(back2, woodDark);
    benchParts.push(back2);

    // Cast iron frame legs
    const legL = new THREE.BoxGeometry(0.08, 0.45, 0.44);
    legL.translate(-0.65, 0.23, 0);
    _tagGeomColor(legL, ironColor);
    benchParts.push(legL);

    const legR = new THREE.BoxGeometry(0.08, 0.45, 0.44);
    legR.translate(0.65, 0.23, 0);
    _tagGeomColor(legR, ironColor);
    benchParts.push(legR);

    // Merge and transform
    const mergedBench = safeMergeGeometries(benchParts, true);
    if (mergedBench) {
      mergedBench.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
      mergedBench.translate(x, 0.22, z);
      this._pushPropGeom(mergedBench, propGeoms, {
        type: 'bench',
        x,
        z,
        radius: 0.85,
        rotation,
        knocked: false,
      });
    }
  }

  _addHydrant(x, z, propGeoms) {
    const red = new THREE.Color(0xe63946);
    const parts = [];
    const body = new THREE.CylinderGeometry(0.20, 0.24, 0.60, 8);
    body.translate(x, 0.30 + 0.22, z);
    _tagGeomColor(body, red);
    parts.push(body);

    const cap = new THREE.CylinderGeometry(0.14, 0.18, 0.25, 8);
    cap.translate(x, 0.68 + 0.22, z);
    _tagGeomColor(cap, red);
    parts.push(cap);

    const nozzles = new THREE.BoxGeometry(0.55, 0.14, 0.14);
    nozzles.translate(x, 0.45 + 0.22, z);
    _tagGeomColor(nozzles, new THREE.Color(0xffffff));
    parts.push(nozzles);

    const mergedHydrant = safeMergeGeometries(parts, true);
    if (mergedHydrant) {
      this._pushPropGeom(mergedHydrant, propGeoms, {
        type: 'hydrant',
        x,
        z,
        radius: 0.55,
        knocked: false,
      });
    }
  }

  /**
   * Rounded wastebasket: Tapered cylindrical bin with collar rim and top aperture
   */
  _addTrashCan(x, z, propGeoms) {
    const slateColor = new THREE.Color(0x64748b);
    const rimColor = new THREE.Color(0x334155);
    const interiorColor = new THREE.Color(0x0f172a);
    const parts = [];

    // Rounded tapered cylinder
    const body = new THREE.CylinderGeometry(0.28, 0.22, 0.72, 12);
    body.translate(x, 0.36 + 0.22, z);
    _tagGeomColor(body, slateColor);
    parts.push(body);

    // Top collar rim
    const collar = new THREE.CylinderGeometry(0.30, 0.30, 0.06, 12);
    collar.translate(x, 0.72 + 0.22, z);
    _tagGeomColor(collar, rimColor);
    parts.push(collar);

    // Recessed dark opening
    const opening = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12);
    opening.translate(x, 0.74 + 0.22, z);
    _tagGeomColor(opening, interiorColor);
    parts.push(opening);

    const mergedTrash = safeMergeGeometries(parts, true);
    if (mergedTrash) {
      this._pushPropGeom(mergedTrash, propGeoms, {
        type: 'trash',
        x,
        z,
        radius: 0.55,
        knocked: false,
      });
    }
  }

  _addDumpster(x, z, rotation, propGeoms) {
    const parts = [];
    // Dark green bin body (#1b4332)
    const body = new THREE.BoxGeometry(2.0, 1.2, 1.2);
    body.translate(0, 0.60, 0);
    _tagGeomColor(body, new THREE.Color(0x1b4332));
    parts.push(body);

    // Dark charcoal lid (#081c15)
    const lid = new THREE.BoxGeometry(2.06, 0.18, 1.26);
    lid.translate(0, 1.22, 0);
    _tagGeomColor(lid, new THREE.Color(0x081c15));
    parts.push(lid);

    // Side forklift pockets
    const pocketL = new THREE.BoxGeometry(0.12, 0.16, 0.9);
    pocketL.translate(-1.06, 0.65, 0);
    _tagGeomColor(pocketL, new THREE.Color(0x2d6a4f));
    parts.push(pocketL);

    const pocketR = new THREE.BoxGeometry(0.12, 0.16, 0.9);
    pocketR.translate(1.06, 0.65, 0);
    _tagGeomColor(pocketR, new THREE.Color(0x2d6a4f));
    parts.push(pocketR);

    const merged = safeMergeGeometries(parts, true);
    if (merged) {
      merged.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
      merged.translate(x, 0.22, z);
      this._pushPropGeom(merged, propGeoms);
    }
  }

  _addParkedCar(x, z, rotation, propGeoms) {
    const carColor = CAR_PALETTE[Math.floor(this.rng() * CAR_PALETTE.length)];
    const parts = [];

    // 1. Lower Body / Chassis
    const body = new THREE.BoxGeometry(2.0, 0.65, 3.8);
    body.translate(0, 0.55, 0);
    _tagGeomColor(body, carColor);
    parts.push(body);

    // 2. Cabin / Roof with tinted cartoon windows
    const roof = new THREE.BoxGeometry(1.65, 0.60, 2.0);
    roof.translate(0, 1.15, -0.2);
    _tagGeomColor(roof, new THREE.Color(0x1e293b));
    parts.push(roof);

    // 3. Front & Rear Bumpers
    const frontBumper = new THREE.BoxGeometry(2.05, 0.25, 0.25);
    frontBumper.translate(0, 0.35, -1.95);
    _tagGeomColor(frontBumper, new THREE.Color(0x475569));
    parts.push(frontBumper);

    const rearBumper = new THREE.BoxGeometry(2.05, 0.25, 0.25);
    rearBumper.translate(0, 0.35, 1.95);
    _tagGeomColor(rearBumper, new THREE.Color(0x475569));
    parts.push(rearBumper);

    // 4. Headlights & Taillights
    const hlL = new THREE.BoxGeometry(0.35, 0.2, 0.1);
    hlL.translate(-0.65, 0.55, -1.92);
    _tagGeomColor(hlL, new THREE.Color(0xfff8e7));
    parts.push(hlL);

    const hlR = new THREE.BoxGeometry(0.35, 0.2, 0.1);
    hlR.translate(0.65, 0.55, -1.92);
    _tagGeomColor(hlR, new THREE.Color(0xfff8e7));
    parts.push(hlR);

    const tlL = new THREE.BoxGeometry(0.35, 0.2, 0.1);
    tlL.translate(-0.65, 0.55, 1.92);
    _tagGeomColor(tlL, new THREE.Color(0xd90429));
    parts.push(tlL);

    const tlR = new THREE.BoxGeometry(0.35, 0.2, 0.1);
    tlR.translate(0.65, 0.55, 1.92);
    _tagGeomColor(tlR, new THREE.Color(0xd90429));
    parts.push(tlR);

    // 5. Stylized Wheels (4 wheels)
    const wheelPositions = [
      { wx: -1.0, wz: -1.1 },
      { wx: 1.0, wz: -1.1 },
      { wx: -1.0, wz: 1.1 },
      { wx: 1.0, wz: 1.1 },
    ];
    for (const wp of wheelPositions) {
      const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(wp.wx, 0.32, wp.wz);
      _tagGeomColor(wheel, new THREE.Color(0x1a1a1a));
      parts.push(wheel);
    }

    const merged = safeMergeGeometries(parts, true);
    if (merged) {
      merged.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
      merged.translate(x, 0.0, z);
      const obs = this._registerCarObstacle(x, z, rotation);
      const propData = {
        type: 'parked_car',
        isCar: true,
        x,
        z,
        radius: 2.2,
        rotation,
        color: carColor,
        obstacle: obs,
        knocked: false,
      };
      if (obs) {
        obs.prop = propData;
      }
      this._pushPropGeom(merged, propGeoms, propData);
    }
  }

  /**
   * Registers a parked or blocking car as a solid 2D AABB obstacle.
   * Standard vehicle dimensions: width ~2.2m (halfW: 1.1m), length ~4.5m (halfD: 2.25m).
   */
  _registerCarObstacle(x, z, rotation) {
    const isRotated = Math.abs(Math.sin(rotation)) > 0.5;
    const halfW = isRotated ? 2.25 : 1.1;
    const halfD = isRotated ? 1.1 : 2.25;
    const obs = {
      centerX: x,
      centerZ: z,
      halfW,
      halfD,
      minX: x - halfW,
      maxX: x + halfW,
      minZ: z - halfD,
      maxZ: z + halfD,
      isCar: true,
      disabled: false,
    };
    this.obstacles.push(obs);
    return obs;
  }

  _recordStreetPoints(wx, wz) {
    if (this.cx === 0 && this.cz === 0) {
      // Keep central spawn intersection completely clear of stray zombies & early spawns
      this.streetSpawnPoints.push(
        { x: wx - 29.0, z: wz },
        { x: wx + 29.0, z: wz },
        { x: wx, z: wz - 29.0 },
        { x: wx, z: wz + 29.0 },
        { x: wx - 29.0, z: wz - 29.0 },
        { x: wx + 29.0, z: wz + 29.0 }
      );
      return;
    }
    this.streetSpawnPoints.push(
      { x: wx - 29.0, z: wz },
      { x: wx + 29.0, z: wz },
      { x: wx, z: wz - 29.0 },
      { x: wx, z: wz + 29.0 },
      { x: wx - 29.0, z: wz - 29.0 },
      { x: wx + 29.0, z: wz + 29.0 }
    );
  }

  _applyVertexColors(geometry, color) {
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /** V4: Add reflective puddle planes randomly on road surface */
  _generatePuddles(wx, wz, roadGeoms) {
    const count = 2 + Math.floor(this.rng() * 3); // 2-4 puddles
    for (let i = 0; i < count; i++) {
      const pw = 1.5 + this.rng() * 2.5;
      const ph = 0.8 + this.rng() * 1.5;
      const puddle = new THREE.PlaneGeometry(pw, ph);
      puddle.rotateX(-Math.PI / 2);
      const px = wx + (this.rng() - 0.5) * 44;
      const pz = wz + (this.rng() - 0.5) * 44;
      puddle.translate(px, 0.008, pz);
      // Tag as reflective blue-grey
      _tagGeomColor(puddle, new THREE.Color(0x5a8fa8));
      roadGeoms.push(puddle);
    }
  }

  /** E4: Road-blocking abandoned cars registered as spatial grid obstacles */
  _generateBlockingCars(wx, wz, propGeoms) {
    const count = 1 + Math.floor(this.rng() * 2); // 1-2 blocking cars
    for (let i = 0; i < count; i++) {
      const laneChoices = [
        { x: wx - 3.5, z: wz + (this.rng() - 0.5) * 30, rot: 0 },
        { x: wx + 3.5, z: wz + (this.rng() - 0.5) * 30, rot: Math.PI },
        { x: wx + (this.rng() - 0.5) * 30, z: wz - 3.5, rot: Math.PI / 2 },
        { x: wx + (this.rng() - 0.5) * 30, z: wz + 3.5, rot: -Math.PI / 2 },
      ];
      const lane = laneChoices[Math.floor(this.rng() * laneChoices.length)];
      this._addParkedCar(lane.x, lane.z, lane.rot, propGeoms);
    }
  }

  /**
   * Returns driving lanes strictly matching roadway coordinates.
   * North/South avenues: X = chunkOriginX + 3.0 or X = chunkOriginX - 3.0
   * East/West avenues: Z = chunkOriginZ + 3.0 or Z = chunkOriginZ - 3.0
   * Also includes perimeter border roadway lanes (X = chunkOriginX + 32 +/- 3.0, Z = chunkOriginZ + 32 +/- 3.0).
   * Only returns lanes that do not intersect any building bounding box.
   */
  getDrivingLanes() {
    const wx = this.worldX;
    const wz = this.worldZ;
    const candidates = [
      // Central chunk avenues
      { axis: 'z', fixedX: wx - 3.0, dirZ: -1, angle: 0, minZ: wz - HALF_CHUNK, maxZ: wz + HALF_CHUNK },
      { axis: 'z', fixedX: wx + 3.0, dirZ: 1, angle: Math.PI, minZ: wz - HALF_CHUNK, maxZ: wz + HALF_CHUNK },
      { axis: 'x', fixedZ: wz - 3.0, dirX: 1, angle: Math.PI / 2, minX: wx - HALF_CHUNK, maxX: wx + HALF_CHUNK },
      { axis: 'x', fixedZ: wz + 3.0, dirX: -1, angle: -Math.PI / 2, minX: wx - HALF_CHUNK, maxX: wx + HALF_CHUNK },
      // Perimeter border roadways between chunks (guaranteed zero building overlap)
      { axis: 'z', fixedX: wx + 32.0 - 3.0, dirZ: -1, angle: 0, minZ: wz - HALF_CHUNK, maxZ: wz + HALF_CHUNK },
      { axis: 'z', fixedX: wx + 32.0 + 3.0, dirZ: 1, angle: Math.PI, minZ: wz - HALF_CHUNK, maxZ: wz + HALF_CHUNK },
      { axis: 'x', fixedZ: wz + 32.0 - 3.0, dirX: 1, angle: Math.PI / 2, minX: wx - HALF_CHUNK, maxX: wx + HALF_CHUNK },
      { axis: 'x', fixedZ: wz + 32.0 + 3.0, dirX: -1, angle: -Math.PI / 2, minX: wx - HALF_CHUNK, maxX: wx + HALF_CHUNK },
    ];

    // Filter out lanes that intersect any building obstacle in this chunk
    return candidates.filter(lane => {
      if (lane.axis === 'z') {
        const carMinX = lane.fixedX - 1.1;
        const carMaxX = lane.fixedX + 1.1;
        for (let i = 0; i < this.obstacles.length; i++) {
          const obs = this.obstacles[i];
          if (obs.isCar) continue; // Stationary cars do not define building footprints
          if (obs.minX <= carMaxX && obs.maxX >= carMinX) {
            if (obs.minZ <= lane.maxZ && obs.maxZ >= lane.minZ) {
              return false; // Collides with building footprint
            }
          }
        }
      } else {
        const carMinZ = lane.fixedZ - 1.1;
        const carMaxZ = lane.fixedZ + 1.1;
        for (let i = 0; i < this.obstacles.length; i++) {
          const obs = this.obstacles[i];
          if (obs.isCar) continue;
          if (obs.minZ <= carMaxZ && obs.maxZ >= carMinZ) {
            if (obs.minX <= lane.maxX && obs.maxX >= lane.minX) {
              return false; // Collides with building footprint
            }
          }
        }
      }
      return true;
    });
  }

  /**
   * Complete memory disposal for this chunk.
   * Removes meshes from scene, frees WebGL vertex & index buffers, and purges references.
   */
  dispose(scene) {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      if (scene) {
        scene.remove(mesh);
      }
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material && mesh.userData && mesh.userData.isBuilding) {
        mesh.material.dispose();
      }
    }
    if (this.quarantineRingMesh) {
      if (scene) scene.remove(this.quarantineRingMesh);
      if (this.quarantineRingMesh.geometry) this.quarantineRingMesh.geometry.dispose();
      if (this.quarantineRingMesh.material) this.quarantineRingMesh.material.dispose();
      this.quarantineRingMesh = null;
    }
    if (this.quarantineBannerSprite) {
      if (scene) scene.remove(this.quarantineBannerSprite);
      if (this.quarantineBannerSprite.material) {
        if (this.quarantineBannerSprite.material.map) this.quarantineBannerSprite.material.map.dispose();
        this.quarantineBannerSprite.material.dispose();
      }
      this.quarantineBannerSprite = null;
    }
    this.quarantineSandbagPositions.length = 0;
    this.meshes.length = 0;
    this.buildingMeshes.length = 0;
    this.obstacles.length = 0;
    this.streetSpawnPoints.length = 0;
    this.lampPositions.length = 0;
    this.firePositions.length = 0;
    this.knockableProps.length = 0;
    this.propsMesh = null;
    this._currentPropVertexCount = 0;
  }
}

/** Module-level helper: tag all vertices of a geometry with a solid color */
function _tagGeomColor(geom, color) {
  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Normalizes an array of geometries to guarantee 100% compatible BufferGeometry attributes
 * before calling BufferGeometryUtils.mergeGeometries().
 */
function safeMergeGeometries(geoms, useVertexColors = false, keepUV = false) {
  if (!geoms || geoms.length === 0) return null;
  const processed = [];
  for (let i = 0; i < geoms.length; i++) {
    let g = geoms[i];
    if (!g || !g.attributes || !g.attributes.position) continue;
    // Normalize to non-indexed so all geometries are 100% compatible
    if (g.index) {
      g = g.toNonIndexed();
    } else {
      g = g.clone();
    }
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    if (useVertexColors) {
      if (!g.attributes.color) {
        _tagGeomColor(g, new THREE.Color(0xffffff));
      }
    } else {
      if (g.attributes.color) {
        delete g.attributes.color;
      }
    }
    if (!keepUV && g.attributes.uv) {
      delete g.attributes.uv;
    }
    processed.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(processed);
}
