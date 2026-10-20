import * as THREE from 'three';
import { CharacterMeshes, CharacterShaderUniforms } from './CharacterMeshes.js';

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

const CIVILIAN_TINTS = [
  0xffffff,
  0x93c5fd,
  0xfca5a5,
  0xfde047,
  0xc4b5fd,
  0x6ee7b7,
  0xfdba74,
];

/**
 * GPU-Instanced Renderer for Patient Zero, 4 Evolved Zombie Castes,
 * and 5 Human/Military Archetypes. Optimized for clean mobile readability.
 */
export class HordeInstancer {
  constructor(scene) {
    this.scene = scene;
    this.geometries = CharacterMeshes.createAllCastesAndArchetypes();

    // 1. Patient Zero Hero Group (scaled up slightly for crystal-clear mobile visibility)
    this.pzGroup = new THREE.Group();
    const pzMat = CharacterMeshes.createCharacterMaterial(0x10b981, 1.8);
    const pzCount = this.geometries.patientZero.attributes.position.count;
    const pzAnim = new Float32Array(pzCount * 4);
    for (let i = 0; i < pzCount; i++) {
      pzAnim[i * 4] = 0;
      pzAnim[i * 4 + 1] = 0.8;
      pzAnim[i * 4 + 2] = 0;
      pzAnim[i * 4 + 3] = 1.0;
    }
    this.pzAnimAttr = new THREE.BufferAttribute(pzAnim, 4);
    this.geometries.patientZero.setAttribute('aAnimData', this.pzAnimAttr);

    this.pzMesh = new THREE.Mesh(this.geometries.patientZero, pzMat);
    this.pzMesh.scale.set(1.22, 1.22, 1.22);
    this.pzMesh.castShadow = true;
    this.pzMesh.receiveShadow = true;
    this.pzGroup.add(this.pzMesh);

    // Subtle, compact foot-ring under Patient Zero (no large spinning disks!)
    const auraGeo = new THREE.RingGeometry(0.68, 0.88, 32);
    auraGeo.rotateX(-Math.PI / 2);
    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.auraRing = new THREE.Mesh(auraGeo, this.auraMat);
    this.auraRing.position.y = 0.04;
    this.pzGroup.add(this.auraRing);

    this.scene.add(this.pzGroup);

    // 2. Clean, compact Surge Target Marker (only shown while surging)
    this.surgeGroup = new THREE.Group();
    const beaconRingGeo = new THREE.RingGeometry(0.8, 1.15, 28);
    beaconRingGeo.rotateX(-Math.PI / 2);
    this.surgeRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.surgeRing = new THREE.Mesh(beaconRingGeo, this.surgeRingMat);
    this.surgeRing.position.y = 0.06;
    this.surgeGroup.add(this.surgeRing);
    this.surgeGroup.visible = false;
    this.scene.add(this.surgeGroup);

    // 3. Instanced Batches for Zombie Castes & Human Archetypes
    this.batches = {
      walker: this._createBatch(this.geometries.walker, 700, 0x34d399, 1.5),
      leaper: this._createBatch(this.geometries.leaper, 250, 0xf43f5e, 1.8),
      brute: this._createBatch(this.geometries.brute, 120, 0xf59e0b, 1.8),
      spitter: this._createBatch(this.geometries.spitter, 150, 0xa3e635, 1.8),
      civilian: this._createBatch(this.geometries.civilian, 450, 0x000000, 0.1, true),
      sprinter: this._createBatch(this.geometries.sprinter, 150, 0x38bdf8, 0.8),
      police: this._createBatch(this.geometries.police, 120, 0x60a5fa, 1.0),
      hazmat: this._createBatch(this.geometries.hazmat, 100, 0x38bdf8, 1.2),
      sniper: this._createBatch(this.geometries.sniper, 80, 0xef4444, 1.8),
    };

    // 4. Sniper Laser Beams
    this.laserPool = [];
    const laserGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6);
    laserGeo.rotateX(Math.PI / 2);
    laserGeo.translate(0, 0, 0.5);
    this.laserMat = new THREE.MeshBasicMaterial({
      color: 0xff1e42,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let i = 0; i < 24; i++) {
      const beam = new THREE.Mesh(laserGeo, this.laserMat);
      beam.visible = false;
      this.scene.add(beam);
      this.laserPool.push(beam);
    }
  }

  _createBatch(baseGeo, maxCount, emissiveHex, emissiveBoost, useInstanceColor = false) {
    const geo = baseGeo.clone();
    const animArray = new Float32Array(maxCount * 4);
    const animAttr = new THREE.InstancedBufferAttribute(animArray, 4);
    animAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnimData', animAttr);

    const mat = CharacterMeshes.createCharacterMaterial(emissiveHex, emissiveBoost);
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;

    if (useInstanceColor) {
      for (let i = 0; i < maxCount; i++) {
        _color.setHex(0xffffff);
        mesh.setColorAt(i, _color);
      }
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }

    this.scene.add(mesh);
    return { mesh, animArray, animAttr, maxCount, useInstanceColor };
  }

  update(sim, time) {
    CharacterShaderUniforms.uTime.value = time;

    // 1. Update Patient Zero
    const pz = sim.patientZero;
    this.pzGroup.position.set(pz.x, pz.y || 0, pz.z);
    this.pzMesh.rotation.y = pz.heading;

    const pzSpeedNorm = Math.min(1.5, Math.hypot(pz.vx, pz.vz) / 8.5);
    const pzFlash = Math.max(0, pz.hitFlash || 0);
    const arr = this.pzAnimAttr.array;
    for (let i = 0, len = arr.length; i < len; i += 4) {
      arr[i + 1] = pzSpeedNorm;
      arr[i + 2] = pzFlash;
    }
    this.pzAnimAttr.needsUpdate = true;

    if (pz.frenzyTimer > 0) {
      this.auraMat.color.setHex(0xf43f5e);
      this.auraRing.scale.set(1.25, 1.25, 1);
    } else {
      this.auraMat.color.setHex(0x10b981);
      this.auraRing.scale.set(1.0, 1.0, 1);
    }

    // 2. Update Surge Target Marker
    if (sim.surgeState.active) {
      this.surgeGroup.visible = true;
      this.surgeGroup.position.set(sim.surgeState.tx, 0, sim.surgeState.tz);
    } else {
      this.surgeGroup.visible = false;
    }

    // 3. Reset counts on all zombie caste batches
    const counts = {
      walker: 0,
      leaper: 0,
      brute: 0,
      spitter: 0,
      civilian: 0,
      sprinter: 0,
      police: 0,
      hazmat: 0,
      sniper: 0,
    };

    const mobileScaleBoost = 1.15;

    for (let i = 0, len = sim.zombies.length; i < len; i++) {
      const z = sim.zombies[i];
      const caste = z.caste || 'walker';
      const batch = this.batches[caste] || this.batches.walker;
      const idx = counts[caste];
      if (idx >= batch.maxCount) continue;

      _dummy.position.set(z.x, z.y || 0, z.z);
      _dummy.rotation.set(z.leapVy > 0.5 ? 0.35 : 0, z.heading, 0);
      const s = (z.scale || 1.0) * mobileScaleBoost;
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      batch.mesh.setMatrixAt(idx, _dummy.matrix);

      const base = idx * 4;
      batch.animArray[base] = z.phase || 0;
      batch.animArray[base + 1] = Math.min(1.5, Math.hypot(z.vx, z.vz) / 8.0);
      batch.animArray[base + 2] = z.hitFlash || 0;
      batch.animArray[base + 3] = 1.0;
      counts[caste]++;
    }

    let laserIdx = 0;
    for (let i = 0, len = sim.humans.length; i < len; i++) {
      const h = sim.humans[i];
      const type = h.type || 'civilian';
      const batch = this.batches[type] || this.batches.civilian;
      const idx = counts[type];
      if (idx >= batch.maxCount) continue;

      _dummy.position.set(h.x, h.y || 0, h.z);
      _dummy.rotation.set(0, h.heading, 0);
      const s = (h.scale || 1.0) * mobileScaleBoost;
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      batch.mesh.setMatrixAt(idx, _dummy.matrix);

      if (batch.useInstanceColor) {
        if (h.infecting > 0) {
          _color.setHex(0x4ade80);
        } else {
          _color.setHex(CIVILIAN_TINTS[h.id % CIVILIAN_TINTS.length]);
        }
        batch.mesh.setColorAt(idx, _color);
      }

      const base = idx * 4;
      batch.animArray[base] = h.phase || 0;
      batch.animArray[base + 1] = Math.min(1.4, Math.hypot(h.vx, h.vz) / 7.5);
      batch.animArray[base + 2] = h.hitFlash || 0;
      batch.animArray[base + 3] =
        h.type === 'police' || h.type === 'sniper' || h.type === 'hazmat' ? 0.6 : 0.0;
      counts[type]++;

      if (h.type === 'sniper' && h.aimTarget && laserIdx < this.laserPool.length) {
        const beam = this.laserPool[laserIdx++];
        beam.visible = true;
        beam.position.set(h.x, 1.35, h.z);
        const dx = h.aimTarget.x - h.x;
        const dz = h.aimTarget.z - h.z;
        const dist = Math.hypot(dx, dz);
        beam.rotation.y = Math.atan2(dx, dz);
        beam.scale.set(1, 1, Math.max(0.5, dist));
      }
    }

    for (let i = laserIdx; i < this.laserPool.length; i++) {
      this.laserPool[i].visible = false;
    }

    for (const [key, batch] of Object.entries(this.batches)) {
      const c = counts[key];
      batch.mesh.count = c;
      if (c > 0) {
        batch.mesh.instanceMatrix.needsUpdate = true;
        batch.animAttr.needsUpdate = true;
        if (batch.useInstanceColor && batch.mesh.instanceColor) {
          batch.mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }
}
