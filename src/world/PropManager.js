import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class PropManager {
  constructor(scene) {
    this.scene = scene;
    this.instancedMeshes = [];
    this.dummy = new THREE.Object3D();
    this.colorHelper = new THREE.Color();
  }

  init(cityData) {
    this._createTrees(cityData.treePositions);
    this._createLamps(cityData.lampPositions);
    this._createCars(cityData.carPositions);
    this._createBenches(cityData.benchPositions);
    this._createHydrants(cityData.hydrantPositions);
    this._createDumpsters(cityData.dumpsterPositions);
    if (cityData.wastebasketPositions) {
      this._createWastebaskets(cityData.wastebasketPositions);
    }
  }

  _createTrees(treePositions) {
    if (!treePositions || treePositions.length === 0) return;

    // Chunky cloud-style bush: Clustered green spheres with top-lit light green caps
    const trunkGeom = new THREE.CylinderGeometry(0.18, 0.24, 0.8, 6);
    trunkGeom.translate(0, 0.4, 0);

    // Base deep foliage cluster (#15803d)
    const b1 = new THREE.IcosahedronGeometry(1.2, 1);
    b1.translate(0, 1.45, 0);
    const b2 = new THREE.IcosahedronGeometry(0.85, 1);
    b2.translate(-0.55, 1.25, 0.25);
    const b3 = new THREE.IcosahedronGeometry(0.90, 1);
    b3.translate(0.55, 1.30, -0.20);
    const b4 = new THREE.IcosahedronGeometry(0.80, 1);
    b4.translate(-0.15, 1.20, -0.50);
    const mergedBase = BufferGeometryUtils.mergeGeometries([b1, b2, b3, b4]);

    // Top-lit light green caps (#86efac)
    const capTop = new THREE.IcosahedronGeometry(0.80, 1);
    capTop.translate(0, 2.15, 0);
    const capSide1 = new THREE.IcosahedronGeometry(0.58, 1);
    capSide1.translate(0.35, 1.90, 0.28);
    const capSide2 = new THREE.IcosahedronGeometry(0.55, 1);
    capSide2.translate(-0.35, 1.85, -0.18);
    const mergedCaps = BufferGeometryUtils.mergeGeometries([capTop, capSide1, capSide2]);

    // Trunk mesh
    const trunkMat = new THREE.MeshToonMaterial({
      color: 0x78350f,
    });
    const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, treePositions.length);
    trunkMesh.castShadow = true;

    // Base Foliage mesh
    const baseMat = new THREE.MeshToonMaterial({
      color: 0x15803d,
    });
    const baseMesh = new THREE.InstancedMesh(mergedBase, baseMat, treePositions.length);
    baseMesh.castShadow = true;

    // Top-lit Caps mesh
    const capsMat = new THREE.MeshToonMaterial({
      color: 0x86efac,
    });
    const capsMesh = new THREE.InstancedMesh(mergedCaps, capsMat, treePositions.length);
    capsMesh.castShadow = true;

    for (let i = 0; i < treePositions.length; i++) {
      const t = treePositions[i];
      const s = t.scale || 1.0;
      this.dummy.position.set(t.x, 0, t.z);
      this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, this.dummy.matrix);
      baseMesh.setMatrixAt(i, this.dummy.matrix);
      capsMesh.setMatrixAt(i, this.dummy.matrix);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    baseMesh.instanceMatrix.needsUpdate = true;
    capsMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(trunkMesh);
    this.scene.add(baseMesh);
    this.scene.add(capsMesh);
    this.instancedMeshes.push(trunkMesh, baseMesh, capsMesh);
  }

  _createLamps(lampPositions) {
    if (!lampPositions || lampPositions.length === 0) return;

    // Dual-arm retro lamppost
    const baseGeom = new THREE.CylinderGeometry(0.14, 0.24, 0.48, 8);
    baseGeom.translate(0, 0.24, 0);

    const poleGeom = new THREE.CylinderGeometry(0.08, 0.11, 3.6, 8);
    poleGeom.translate(0, 2.1, 0);

    const finialGeom = new THREE.ConeGeometry(0.10, 0.32, 6);
    finialGeom.translate(0, 4.2, 0);

    const crossArmGeom = new THREE.BoxGeometry(1.65, 0.08, 0.08);
    crossArmGeom.translate(0, 3.95, 0);

    const hoodL = new THREE.ConeGeometry(0.22, 0.16, 6);
    hoodL.translate(-0.72, 3.92, 0);

    const hoodR = new THREE.ConeGeometry(0.22, 0.16, 6);
    hoodR.translate(0.72, 3.92, 0);

    const mergedLamp = BufferGeometryUtils.mergeGeometries([
      baseGeom,
      poleGeom,
      finialGeom,
      crossArmGeom,
      hoodL,
      hoodR,
    ]);

    const lampMat = new THREE.MeshToonMaterial({
      color: 0x1e293b,
    });

    const lampMesh = new THREE.InstancedMesh(mergedLamp, lampMat, lampPositions.length);
    lampMesh.castShadow = true;

    // Dual glowing warm lantern bulbs (#fef08a)
    const bulbL = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    bulbL.translate(-0.72, 3.76, 0);

    const bulbR = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    bulbR.translate(0.72, 3.76, 0);

    const mergedBulbs = BufferGeometryUtils.mergeGeometries([bulbL, bulbR]);
    const bulbMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
    });
    const bulbMesh = new THREE.InstancedMesh(mergedBulbs, bulbMat, lampPositions.length);

    for (let i = 0; i < lampPositions.length; i++) {
      const pos = lampPositions[i];
      const rotY = Math.atan2(-pos.x, -pos.z);
      this.dummy.position.set(pos.x, 0.22, pos.z);
      this.dummy.rotation.set(0, rotY, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();

      lampMesh.setMatrixAt(i, this.dummy.matrix);
      bulbMesh.setMatrixAt(i, this.dummy.matrix);
    }

    lampMesh.instanceMatrix.needsUpdate = true;
    bulbMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(lampMesh);
    this.scene.add(bulbMesh);
    this.instancedMeshes.push(lampMesh, bulbMesh);
  }

  _createCars(carPositions) {
    if (!carPositions || carPositions.length === 0) return;

    // Stylized low-poly sedan: Lower body + cabin + wheels
    const bodyGeom = new THREE.BoxGeometry(2.0, 0.65, 4.2);
    bodyGeom.translate(0, 0.55, 0);

    const cabinGeom = new THREE.BoxGeometry(1.7, 0.65, 2.2);
    cabinGeom.translate(0, 1.15, -0.2);

    const carGeom = BufferGeometryUtils.mergeGeometries([bodyGeom, cabinGeom]);

    const carMat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.4,
    });

    const carMesh = new THREE.InstancedMesh(carGeom, carMat, carPositions.length);
    carMesh.castShadow = true;
    carMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(carPositions.length * 3),
      3
    );

    const carColors = [
      new THREE.Color(0xb22222), // Crimson
      new THREE.Color(0x1a3a60), // Deep blue
      new THREE.Color(0xe8ecef), // Polar white
      new THREE.Color(0x2a2f35), // Dark charcoal
      new THREE.Color(0xd4af37), // Metallic gold
    ];

    for (let i = 0; i < carPositions.length; i++) {
      const c = carPositions[i];
      this.dummy.position.set(c.x, 0.05, c.z);
      this.dummy.rotation.set(0, c.rotation || 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      carMesh.setMatrixAt(i, this.dummy.matrix);

      const col = carColors[i % carColors.length];
      carMesh.setColorAt(i, col);
    }

    carMesh.instanceMatrix.needsUpdate = true;
    carMesh.instanceColor.needsUpdate = true;

    this.scene.add(carMesh);
    this.instancedMeshes.push(carMesh);
  }

  _createBenches(benchPositions) {
    if (!benchPositions || benchPositions.length === 0) return;

    // Wooden park bench with warm cedar slats and cast-iron frame
    const slat1 = new THREE.BoxGeometry(1.6, 0.06, 0.13);
    slat1.translate(0, 0.45, -0.14);
    const slat2 = new THREE.BoxGeometry(1.6, 0.06, 0.13);
    slat2.translate(0, 0.45, 0.0);
    const slat3 = new THREE.BoxGeometry(1.6, 0.06, 0.13);
    slat3.translate(0, 0.45, 0.14);
    const back1 = new THREE.BoxGeometry(1.6, 0.12, 0.05);
    back1.translate(0, 0.65, -0.22);
    const back2 = new THREE.BoxGeometry(1.6, 0.12, 0.05);
    back2.translate(0, 0.82, -0.22);
    const mergedWood = BufferGeometryUtils.mergeGeometries([slat1, slat2, slat3, back1, back2]);

    const legL = new THREE.BoxGeometry(0.08, 0.45, 0.44);
    legL.translate(-0.65, 0.23, 0);
    const legR = new THREE.BoxGeometry(0.08, 0.45, 0.44);
    legR.translate(0.65, 0.23, 0);
    const mergedIron = BufferGeometryUtils.mergeGeometries([legL, legR]);

    const woodMat = new THREE.MeshToonMaterial({
      color: 0xb45309, // Warm honey/oak wood
    });
    const ironMat = new THREE.MeshToonMaterial({
      color: 0x1e293b, // Cast iron
    });

    const woodMesh = new THREE.InstancedMesh(mergedWood, woodMat, benchPositions.length);
    woodMesh.castShadow = true;
    const ironMesh = new THREE.InstancedMesh(mergedIron, ironMat, benchPositions.length);
    ironMesh.castShadow = true;

    for (let i = 0; i < benchPositions.length; i++) {
      const b = benchPositions[i];
      this.dummy.position.set(b.x, 0.22, b.z);
      this.dummy.rotation.set(0, b.rotation || 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();

      woodMesh.setMatrixAt(i, this.dummy.matrix);
      ironMesh.setMatrixAt(i, this.dummy.matrix);
    }

    woodMesh.instanceMatrix.needsUpdate = true;
    ironMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(woodMesh);
    this.scene.add(ironMesh);
    this.instancedMeshes.push(woodMesh, ironMesh);
  }

  _createWastebaskets(positions) {
    if (!positions || positions.length === 0) return;

    // Rounded wastebasket: Tapered cylindrical bin with collar rim
    const bodyGeom = new THREE.CylinderGeometry(0.28, 0.22, 0.72, 12);
    bodyGeom.translate(0, 0.36, 0);
    const collarGeom = new THREE.CylinderGeometry(0.30, 0.30, 0.06, 12);
    collarGeom.translate(0, 0.72, 0);
    const mergedCan = BufferGeometryUtils.mergeGeometries([bodyGeom, collarGeom]);

    const canMat = new THREE.MeshToonMaterial({
      color: 0x64748b, // Soft slate grey
    });

    const canMesh = new THREE.InstancedMesh(mergedCan, canMat, positions.length);
    canMesh.castShadow = true;

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      this.dummy.position.set(p.x, 0.22, p.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      canMesh.setMatrixAt(i, this.dummy.matrix);
    }

    canMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(canMesh);
    this.instancedMeshes.push(canMesh);
  }

  _createHydrants(hydrantPositions) {
    if (!hydrantPositions || hydrantPositions.length === 0) return;

    const body = new THREE.CylinderGeometry(0.20, 0.24, 0.60, 8);
    body.translate(0, 0.30, 0);
    const cap = new THREE.CylinderGeometry(0.14, 0.18, 0.25, 8);
    cap.translate(0, 0.68, 0);
    const nozzle = new THREE.BoxGeometry(0.55, 0.14, 0.14);
    nozzle.translate(0, 0.45, 0);

    const hydrantGeom = BufferGeometryUtils.mergeGeometries([body, cap, nozzle]);
    const hydrantMat = new THREE.MeshToonMaterial({
      color: 0xe63946, // Red
    });

    const hydrantMesh = new THREE.InstancedMesh(hydrantGeom, hydrantMat, hydrantPositions.length);
    hydrantMesh.castShadow = true;

    for (let i = 0; i < hydrantPositions.length; i++) {
      const h = hydrantPositions[i];
      this.dummy.position.set(h.x, 0.22, h.z);
      this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      hydrantMesh.setMatrixAt(i, this.dummy.matrix);
    }

    hydrantMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(hydrantMesh);
    this.instancedMeshes.push(hydrantMesh);
  }

  _createDumpsters(dumpsterPositions) {
    if (!dumpsterPositions || dumpsterPositions.length === 0) return;

    // Dark green bin body
    const binGeom = new THREE.BoxGeometry(2.0, 1.2, 1.2);
    binGeom.translate(0, 0.60, 0);
    // Dark lid
    const lidGeom = new THREE.BoxGeometry(2.06, 0.18, 1.26);
    lidGeom.translate(0, 1.22, 0);

    const dumpsterGeom = BufferGeometryUtils.mergeGeometries([binGeom, lidGeom]);
    const dumpsterMat = new THREE.MeshToonMaterial({
      color: 0x1b4332, // Dark green
    });

    const dumpsterMesh = new THREE.InstancedMesh(
      dumpsterGeom,
      dumpsterMat,
      dumpsterPositions.length
    );
    dumpsterMesh.castShadow = true;

    for (let i = 0; i < dumpsterPositions.length; i++) {
      const d = dumpsterPositions[i];
      this.dummy.position.set(d.x, 0.22, d.z);
      this.dummy.rotation.set(0, d.rotation || 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      dumpsterMesh.setMatrixAt(i, this.dummy.matrix);
    }

    dumpsterMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(dumpsterMesh);
    this.instancedMeshes.push(dumpsterMesh);
  }
}
