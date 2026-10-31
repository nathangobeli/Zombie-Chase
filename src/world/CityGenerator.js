import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class CityGenerator {
  constructor(size = 96, options = {}) {
    this.size = size;
    this.halfSize = size * 0.5;
    this.buildingModels = options.buildingModels || [];
    this.colormapTexture = options.colormapTexture || null;

    this.buildings = [];
    this.obstacles = [];
    this.parkZones = [];
    this.treePositions = [];
    this.benchPositions = [];
    this.lampPositions = [];
    this.carPositions = [];
    this.hydrantPositions = [];
    this.dumpsterPositions = [];
  }

  generate() {
    const roadGeometries = [];
    const roadMarkingGeometries = [];
    const sidewalkGeometries = [];
    const buildingGeometries = [];
    const kenneyBuildingGeometries = [];
    const windowGeometries = [];
    const parkGrassGeometries = [];
    const roofPropGeometries = [];

    // 1. Base Ground (Under all roads)
    const baseGroundGeom = new THREE.PlaneGeometry(this.size + 14, this.size + 14);
    baseGroundGeom.rotateX(-Math.PI / 2);
    roadGeometries.push(baseGroundGeom);

    // 2. City Block Ranges
    const colRanges = [
      { min: -45, max: -32 },
      { min: -24, max: -6 },
      { min: 6, max: 24 },
      { min: 32, max: 45 },
    ];

    const rowRanges = [
      { min: -45, max: -32 },
      { min: -24, max: -6 },
      { min: 6, max: 24 },
      { min: 32, max: 45 },
    ];

    const parkKeys = new Set(['0,1', '3,2']);
    const plazaKeys = new Set(['1,2']);

    let modelIdx = 0;

    // Generate Blocks
    for (let c = 0; c < colRanges.length; c++) {
      for (let r = 0; r < rowRanges.length; r++) {
        const key = `${c},${r}`;
        const col = colRanges[c];
        const row = rowRanges[r];

        const blockWidth = col.max - col.min;
        const blockDepth = row.max - row.min;
        const blockCenterX = (col.min + col.max) * 0.5;
        const blockCenterZ = (row.min + row.max) * 0.5;

        // Sidewalk base (raised 0.22m)
        const sidewalkGeom = new THREE.BoxGeometry(blockWidth, 0.22, blockDepth);
        sidewalkGeom.translate(blockCenterX, 0.11, blockCenterZ);
        sidewalkGeometries.push(sidewalkGeom);

        // Street furniture along block perimeter
        this._addBlockPerimeterProps(col.min, col.max, row.min, row.max);

        if (parkKeys.has(key)) {
          this._generatePark(col, row, parkGrassGeometries);
        } else if (plazaKeys.has(key)) {
          this._generatePlaza(col, row);
        } else {
          // Generate Buildings (Using Kenney Commercial Models when available!)
          if (this.buildingModels.length > 0) {
            this._generateKenneyBuildingBlock(
              col,
              row,
              kenneyBuildingGeometries,
              modelIdx
            );
            modelIdx += 2;
          } else {
            this._generateProceduralBuildingBlock(
              col,
              row,
              buildingGeometries,
              windowGeometries,
              roofPropGeometries
            );
          }
        }
      }
    }

    // 3. Road Markings
    this._generateRoadMarkings(roadMarkingGeometries);

    // 4. Consolidate and Merge Meshes
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.85,
      metalness: 0.15,
    });
    const mergedRoad = BufferGeometryUtils.mergeGeometries(roadGeometries);
    const roadMesh = new THREE.Mesh(mergedRoad, roadMat);
    roadMesh.receiveShadow = true;

    const roadMarkingMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mergedMarkings = BufferGeometryUtils.mergeGeometries(roadMarkingGeometries);
    const markingsMesh = new THREE.Mesh(mergedMarkings, roadMarkingMat);

    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x767d87,
      roughness: 0.75,
      metalness: 0.1,
    });
    const mergedSidewalk = BufferGeometryUtils.mergeGeometries(sidewalkGeometries);
    const sidewalkMesh = new THREE.Mesh(mergedSidewalk, sidewalkMat);
    sidewalkMesh.receiveShadow = true;

    // Kenney Merged Commercial Buildings Mesh
    let kenneyMesh = null;
    if (kenneyBuildingGeometries.length > 0) {
      const kenneyMat = new THREE.MeshStandardMaterial({
        color: this.colormapTexture ? 0xffffff : 0x5b6e7a,
        map: this.colormapTexture,
        roughness: 0.45,
        metalness: 0.1,
      });
      const mergedKenney = BufferGeometryUtils.mergeGeometries(kenneyBuildingGeometries);
      if (mergedKenney) {
        mergedKenney.computeVertexNormals();
        kenneyMesh = new THREE.Mesh(mergedKenney, kenneyMat);
        kenneyMesh.castShadow = true;
        kenneyMesh.receiveShadow = true;
      }
    }

    // Fallback procedural buildings mesh
    let buildingMesh = null;
    if (buildingGeometries.length > 0) {
      const buildingMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.2,
      });
      const mergedBuildings = BufferGeometryUtils.mergeGeometries(buildingGeometries);
      buildingMesh = new THREE.Mesh(mergedBuildings, buildingMat);
      buildingMesh.castShadow = true;
      buildingMesh.receiveShadow = true;
    }

    let parkGrassMesh = null;
    if (parkGrassGeometries.length > 0) {
      const parkGrassMat = new THREE.MeshStandardMaterial({
        color: 0x2e6f40,
        roughness: 0.9,
        metalness: 0.05,
      });
      const mergedPark = BufferGeometryUtils.mergeGeometries(parkGrassGeometries);
      parkGrassMesh = new THREE.Mesh(mergedPark, parkGrassMat);
      parkGrassMesh.receiveShadow = true;
    }

    const cityGroup = new THREE.Group();
    cityGroup.add(roadMesh);
    cityGroup.add(markingsMesh);
    cityGroup.add(sidewalkMesh);
    if (kenneyMesh) cityGroup.add(kenneyMesh);
    if (buildingMesh) cityGroup.add(buildingMesh);
    if (parkGrassMesh) cityGroup.add(parkGrassMesh);

    return {
      mesh: cityGroup,
      obstacles: this.obstacles,
      treePositions: this.treePositions,
      benchPositions: this.benchPositions,
      lampPositions: this.lampPositions,
      carPositions: this.carPositions,
      hydrantPositions: this.hydrantPositions,
      dumpsterPositions: this.dumpsterPositions,
    };
  }

  _generateKenneyBuildingBlock(col, row, kenneyGeoms, startIndex) {
    const width = col.max - col.min;
    const depth = row.max - row.min;
    const splitHoriz = width >= depth;

    const subBlocks = [];
    if (splitHoriz) {
      const halfW = (width - 2.8) * 0.5;
      subBlocks.push({
        minX: col.min + 0.6,
        maxX: col.min + 0.6 + halfW,
        minZ: row.min + 0.6,
        maxZ: row.max - 0.6,
        rotY: col.min < 0 ? Math.PI / 2 : -Math.PI / 2,
      });
      subBlocks.push({
        minX: col.max - 0.6 - halfW,
        maxX: col.max - 0.6,
        minZ: row.min + 0.6,
        maxZ: row.max - 0.6,
        rotY: col.max > 0 ? -Math.PI / 2 : Math.PI / 2,
      });

      this.dumpsterPositions.push({
        x: (col.min + col.max) * 0.5,
        z: (row.min + row.max) * 0.5,
        rotation: 0,
      });
    } else {
      const halfD = (depth - 2.8) * 0.5;
      subBlocks.push({
        minX: col.min + 0.6,
        maxX: col.max - 0.6,
        minZ: row.min + 0.6,
        maxZ: row.min + 0.6 + halfD,
        rotY: 0,
      });
      subBlocks.push({
        minX: col.min + 0.6,
        maxX: col.max - 0.6,
        minZ: row.max - 0.6 - halfD,
        maxZ: row.max - 0.6,
        rotY: Math.PI,
      });

      this.dumpsterPositions.push({
        x: (col.min + col.max) * 0.5,
        z: (row.min + row.max) * 0.5,
        rotation: Math.PI / 2,
      });
    }

    for (let i = 0; i < subBlocks.length; i++) {
      const b = subBlocks[i];
      const bWidth = b.maxX - b.minX;
      const bDepth = b.maxZ - b.minZ;
      const bCenterX = (b.minX + b.maxX) * 0.5;
      const bCenterZ = (b.minZ + b.maxZ) * 0.5;

      // Select Kenney commercial building model
      const model = this.buildingModels[(startIndex + i) % this.buildingModels.length];
      if (!model) continue;

      const geom = model.geometry.clone();
      geom.computeBoundingBox();
      const bb = geom.boundingBox;
      const origW = bb.max.x - bb.min.x;
      const origH = bb.max.y - bb.min.y;
      const origD = bb.max.z - bb.min.z;

      // Scale building to fit block footprint
      const isRotated = Math.abs(Math.sin(b.rotY)) > 0.5;
      const targetW = isRotated ? bDepth : bWidth;
      const targetD = isRotated ? bWidth : bDepth;

      const scaleX = targetW / (origW || 1.0);
      const scaleZ = targetD / (origD || 1.0);
      const isSkyscraper = model.name.includes('skyscraper');
      const scaleY = isSkyscraper ? Math.max(scaleX, scaleZ) * 1.5 : Math.max(scaleX, scaleZ) * 1.05;

      // Register collision AABB
      this.obstacles.push({
        minX: b.minX,
        maxX: b.maxX,
        minZ: b.minZ,
        maxZ: b.maxZ,
        centerX: bCenterX,
        centerZ: bCenterZ,
        halfW: bWidth * 0.5,
        halfD: bDepth * 0.5,
      });

      // Transform geometry to world position & rotation
      // 1. Center in X & Z, and align bottom at Y = 0
      geom.translate(-(bb.min.x + bb.max.x) * 0.5, -bb.min.y, -(bb.min.z + bb.max.z) * 0.5);

      // 2. Scale building to footprint and height
      geom.scale(scaleX, scaleY, scaleZ);

      // 3. Apply Y rotation
      if (b.rotY !== 0) {
        geom.applyMatrix4(new THREE.Matrix4().makeRotationY(b.rotY));
      }

      // 4. Place on top of sidewalk (y = 0.22) at block center
      geom.translate(bCenterX, 0.22, bCenterZ);

      kenneyGeoms.push(geom);
    }
  }

  _generateProceduralBuildingBlock(col, row, buildingGeoms, windowGeoms, roofGeoms) {
    const palettes = [
      new THREE.Color(0x913d36),
      new THREE.Color(0x32475b),
      new THREE.Color(0xb5a084),
      new THREE.Color(0x272b33),
      new THREE.Color(0xd6dbdf),
      new THREE.Color(0x3c6478),
    ];

    const width = col.max - col.min;
    const depth = row.max - row.min;
    const splitHoriz = width >= depth;

    const subBlocks = [];
    if (splitHoriz) {
      const halfW = (width - 2.6) * 0.5;
      subBlocks.push({
        minX: col.min + 0.6,
        maxX: col.min + 0.6 + halfW,
        minZ: row.min + 0.6,
        maxZ: row.max - 0.6,
      });
      subBlocks.push({
        minX: col.max - 0.6 - halfW,
        maxX: col.max - 0.6,
        minZ: row.min + 0.6,
        maxZ: row.max - 0.6,
      });

      this.dumpsterPositions.push({
        x: (col.min + col.max) * 0.5,
        z: (row.min + row.max) * 0.5,
        rotation: 0,
      });
    } else {
      const halfD = (depth - 2.6) * 0.5;
      subBlocks.push({
        minX: col.min + 0.6,
        maxX: col.max - 0.6,
        minZ: row.min + 0.6,
        maxZ: row.min + 0.6 + halfD,
      });
      subBlocks.push({
        minX: col.min + 0.6,
        maxX: col.max - 0.6,
        minZ: row.max - 0.6 - halfD,
        maxZ: row.max - 0.6,
      });

      this.dumpsterPositions.push({
        x: (col.min + col.max) * 0.5,
        z: (row.min + row.max) * 0.5,
        rotation: Math.PI / 2,
      });
    }

    for (const b of subBlocks) {
      const bWidth = b.maxX - b.minX;
      const bDepth = b.maxZ - b.minZ;
      const bCenterX = (b.minX + b.maxX) * 0.5;
      const bCenterZ = (b.minZ + b.maxZ) * 0.5;
      const height = 9.0 + Math.random() * 14.0;
      const color = palettes[Math.floor(Math.random() * palettes.length)];

      this.obstacles.push({
        minX: b.minX,
        maxX: b.maxX,
        minZ: b.minZ,
        maxZ: b.maxZ,
        centerX: bCenterX,
        centerZ: bCenterZ,
        halfW: bWidth * 0.5,
        halfD: bDepth * 0.5,
      });

      const bodyGeom = new THREE.BoxGeometry(bWidth, height, bDepth);
      bodyGeom.translate(bCenterX, height * 0.5 + 0.22, bCenterZ);
      this._applyVertexColors(bodyGeom, color);
      buildingGeoms.push(bodyGeom);

      const roofBorderGeom = new THREE.BoxGeometry(bWidth + 0.3, 0.5, bDepth + 0.3);
      roofBorderGeom.translate(bCenterX, height + 0.45, bCenterZ);
      this._applyVertexColors(roofBorderGeom, color.clone().multiplyScalar(0.8));
      buildingGeoms.push(roofBorderGeom);

      const windowRows = Math.floor(height / 3.0);
      for (let w = 1; w < windowRows; w++) {
        const winY = w * 2.8 + 1.2;
        const winGeom1 = new THREE.BoxGeometry(bWidth - 1.2, 1.4, bDepth + 0.1);
        winGeom1.translate(bCenterX, winY, bCenterZ);
        windowGeoms.push(winGeom1);

        const winGeom2 = new THREE.BoxGeometry(bWidth + 0.1, 1.4, bDepth - 1.2);
        winGeom2.translate(bCenterX, winY, bCenterZ);
        windowGeoms.push(winGeom2);
      }
    }
  }

  _generatePark(col, row, parkGrassGeoms) {
    const width = col.max - col.min;
    const depth = row.max - row.min;
    const centerX = (col.min + col.max) * 0.5;
    const centerZ = (row.min + row.max) * 0.5;

    const turfGeom = new THREE.BoxGeometry(width - 1.6, 0.12, depth - 1.6);
    turfGeom.translate(centerX, 0.28, centerZ);
    parkGrassGeoms.push(turfGeom);

    this.parkZones.push({
      minX: col.min + 1.0,
      maxX: col.max - 1.0,
      minZ: row.min + 1.0,
      maxZ: row.max - 1.0,
    });

    const treeOffsets = [
      { ox: -3.5, oz: -3.5 },
      { ox: 3.5, oz: -3.5 },
      { ox: -3.5, oz: 3.5 },
      { ox: 3.5, oz: 3.5 },
      { ox: 0, oz: 0 },
    ];

    for (const off of treeOffsets) {
      const tx = centerX + off.ox + (Math.random() - 0.5) * 1.5;
      const tz = centerZ + off.oz + (Math.random() - 0.5) * 1.5;
      this.treePositions.push({
        x: tx,
        z: tz,
        scale: 0.85 + Math.random() * 0.3,
        type: Math.random() > 0.4 ? 'deciduous' : 'pine',
      });
    }

    this.benchPositions.push({ x: centerX - 2.5, z: centerZ, rotation: Math.PI / 2 });
    this.benchPositions.push({ x: centerX + 2.5, z: centerZ, rotation: -Math.PI / 2 });
  }

  _generatePlaza(col, row) {
    const centerX = (col.min + col.max) * 0.5;
    const centerZ = (row.min + row.max) * 0.5;

    this.treePositions.push({ x: col.min + 2.0, z: row.min + 2.0, scale: 0.9 });
    this.treePositions.push({ x: col.max - 2.0, z: row.min + 2.0, scale: 0.9 });
    this.treePositions.push({ x: col.min + 2.0, z: row.max - 2.0, scale: 0.9 });
    this.treePositions.push({ x: col.max - 2.0, z: row.max - 2.0, scale: 0.9 });

    this.benchPositions.push({ x: centerX - 2.0, z: centerZ - 2.0, rotation: 0 });
    this.benchPositions.push({ x: centerX + 2.0, z: centerZ + 2.0, rotation: Math.PI });
  }

  _addBlockPerimeterProps(minX, maxX, minZ, maxZ) {
    this.lampPositions.push({ x: minX + 0.8, z: minZ + 0.8 });
    this.lampPositions.push({ x: maxX - 0.8, z: maxZ - 0.8 });

    if (Math.random() > 0.4) {
      this.hydrantPositions.push({
        x: minX + 1.2,
        z: (minZ + maxZ) * 0.5,
      });
    }

    if (Math.random() > 0.3) {
      this.carPositions.push({
        x: minX - 1.8,
        z: (minZ + maxZ) * 0.5 + (Math.random() - 0.5) * 3.0,
        rotation: 0,
      });
    }
    if (Math.random() > 0.3) {
      this.carPositions.push({
        x: (minX + maxX) * 0.5 + (Math.random() - 0.5) * 3.0,
        z: minZ - 1.8,
        rotation: Math.PI / 2,
      });
    }
  }

  _generateRoadMarkings(markingsGeoms) {
    const yLineSegments = [
      { minX: -48, maxX: -6, z: 0 },
      { minX: 6, maxX: 48, z: 0 },
    ];
    for (const seg of yLineSegments) {
      const len = seg.maxX - seg.minX;
      const g1 = new THREE.PlaneGeometry(len, 0.18);
      g1.rotateX(-Math.PI / 2);
      g1.translate(seg.minX + len * 0.5, 0.03, seg.z - 0.15);
      markingsGeoms.push(g1);

      const g2 = new THREE.PlaneGeometry(len, 0.18);
      g2.rotateX(-Math.PI / 2);
      g2.translate(seg.minX + len * 0.5, 0.03, seg.z + 0.15);
      markingsGeoms.push(g2);
    }

    const zLineSegments = [
      { minZ: -48, maxZ: -6, x: 0 },
      { minZ: 6, maxZ: 48, x: 0 },
    ];
    for (const seg of zLineSegments) {
      const len = seg.maxZ - seg.minZ;
      const g1 = new THREE.PlaneGeometry(0.18, len);
      g1.rotateX(-Math.PI / 2);
      g1.translate(seg.x - 0.15, 0.03, seg.minZ + len * 0.5);
      markingsGeoms.push(g1);

      const g2 = new THREE.PlaneGeometry(0.18, len);
      g2.rotateX(-Math.PI / 2);
      g2.translate(seg.x + 0.15, 0.03, seg.minZ + len * 0.5);
      markingsGeoms.push(g2);
    }

    this._addCrosswalk(0, -5.5, 8.0, true, markingsGeoms);
    this._addCrosswalk(0, 5.5, 8.0, true, markingsGeoms);
    this._addCrosswalk(-5.5, 0, 8.0, false, markingsGeoms);
    this._addCrosswalk(5.5, 0, 8.0, false, markingsGeoms);
  }

  _addCrosswalk(cx, cz, width, horizontal, markingsGeoms) {
    const stripes = 6;
    const stripeWidth = 0.55;
    const stripeGap = 0.55;
    const stripeLength = 2.4;

    for (let i = 0; i < stripes; i++) {
      const offset = (i - (stripes - 1) * 0.5) * (stripeWidth + stripeGap);
      let g;
      if (horizontal) {
        g = new THREE.PlaneGeometry(stripeWidth, stripeLength);
        g.rotateX(-Math.PI / 2);
        g.translate(cx + offset, 0.03, cz);
      } else {
        g = new THREE.PlaneGeometry(stripeLength, stripeWidth);
        g.rotateX(-Math.PI / 2);
        g.translate(cx, 0.03, cz + offset);
      }
      markingsGeoms.push(g);
    }
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
}
