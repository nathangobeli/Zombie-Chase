import * as THREE from 'three';
import {
  createHumanoidGeometry,
  injectCharacterAnimationShader,
  createCelGradientMap,
} from './CharacterGeometry.js';

// Dynamic ground elevation so characters step onto sidewalks and never sink or clip
function getCharacterGroundY(x, z) {
  // Open intersection and central avenues in spawn chunk (0, 0)
  if (Math.abs(x) < 6.5 || Math.abs(z) < 6.5) {
    return 0.01;
  }
  const rx = Math.abs(((x + 32.0) % 64.0 + 64.0) % 64.0 - 32.0);
  const rz = Math.abs(((z + 32.0) % 64.0 + 64.0) % 64.0 - 32.0);
  return (rx <= 26.0 && rz <= 26.0) ? 0.23 : 0.01;
}

export class InstancedRenderer {
  constructor(scene, maxCapacity = 1200) {
    this.scene = scene;
    this.maxCapacity = maxCapacity;

    this.dummy = new THREE.Object3D();
    this.colorHelper = new THREE.Color();

    // Reusable 3-step cel-shading gradient map
    this.celGradientMap = createCelGradientMap();

    // 1. Initial Humanoid Geometries
    this.zombieGeom = createHumanoidGeometry('zombie');
    this.civGeom = createHumanoidGeometry('civilian');
    this.hazmatGeom = createHumanoidGeometry('hazmat');
    this.militaryGeom = createHumanoidGeometry('military');
    this.pzGeom = createHumanoidGeometry('patient_zero');

    // 2. Materials with GPU Kinetic Animation & Cel Gradient Injected
    this.zombieMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: this.celGradientMap,
      emissive: 0x064e3b, // Deep moss green emissive floor
      emissiveIntensity: 0.20,
    });
    injectCharacterAnimationShader(this.zombieMat);

    this.civMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: this.celGradientMap,
    });
    injectCharacterAnimationShader(this.civMat);

    this.hazmatMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: this.celGradientMap,
      emissive: 0x551100,
      emissiveIntensity: 0.35,
    });
    injectCharacterAnimationShader(this.hazmatMat);

    this.militaryMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: this.celGradientMap,
      emissive: 0x064e3b, // Subtle dark forest green emissive
      emissiveIntensity: 0.20,
    });
    injectCharacterAnimationShader(this.militaryMat);

    this.pzMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: this.celGradientMap,
      emissive: 0x0d9488, // Vibrant teal/emerald glow
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 1.0,
    });
    injectCharacterAnimationShader(this.pzMat);

    // 3. Zombie Instanced Mesh (Single Draw Call)
    this.zombieMesh = new THREE.InstancedMesh(this.zombieGeom, this.zombieMat, this.maxCapacity);
    this.zombieMesh.frustumCulled = false; // CRUCIAL: Prevent Three.js from falsely culling mesh when origin leaves frustum
    this.zombieMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.zombieAnimAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxCapacity * 4),
      4
    );
    this.zombieAnimAttr.setUsage(THREE.DynamicDrawUsage);
    this.zombieGeom.setAttribute('instanceAnim', this.zombieAnimAttr);
    this.zombieMesh.count = 0;
    this.zombieMesh.castShadow = true;
    this.zombieMesh.receiveShadow = true;
    scene.add(this.zombieMesh);

    // 4. Civilian Instanced Mesh (Single Draw Call)
    this.civMesh = new THREE.InstancedMesh(this.civGeom, this.civMat, this.maxCapacity);
    this.civMesh.frustumCulled = false; // Prevent culling away from origin
    this.civMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.civAnimAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxCapacity * 4),
      4
    );
    this.civAnimAttr.setUsage(THREE.DynamicDrawUsage);
    this.civGeom.setAttribute('instanceAnim', this.civAnimAttr);
    this.civMesh.count = 0;
    this.civMesh.castShadow = true;
    this.civMesh.receiveShadow = true;
    scene.add(this.civMesh);

    // 5. Hazmat Instanced Mesh (Single Draw Call)
    this.hazmatMesh = new THREE.InstancedMesh(this.hazmatGeom, this.hazmatMat, 32);
    this.hazmatMesh.frustumCulled = false;
    this.hazmatMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.hazmatAnimAttr = new THREE.InstancedBufferAttribute(new Float32Array(32 * 4), 4);
    this.hazmatAnimAttr.setUsage(THREE.DynamicDrawUsage);
    this.hazmatGeom.setAttribute('instanceAnim', this.hazmatAnimAttr);
    this.hazmatMesh.count = 0;
    this.hazmatMesh.castShadow = true;
    scene.add(this.hazmatMesh);

    // 5b. Military Rifleman Instanced Mesh (Single Draw Call)
    this.militaryMesh = new THREE.InstancedMesh(this.militaryGeom, this.militaryMat, 32);
    this.militaryMesh.frustumCulled = false;
    this.militaryMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.militaryAnimAttr = new THREE.InstancedBufferAttribute(new Float32Array(32 * 4), 4);
    this.militaryAnimAttr.setUsage(THREE.DynamicDrawUsage);
    this.militaryGeom.setAttribute('instanceAnim', this.militaryAnimAttr);
    this.militaryMesh.count = 0;
    this.militaryMesh.castShadow = true;
    scene.add(this.militaryMesh);

    // 5c. Megaphone Warden Instanced Mesh (Single Draw Call)
    this.wardenGeom = createHumanoidGeometry('warden');
    this.wardenMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: this.celGradientMap,
      emissive: 0xc2410c, // Vibrant warm orange emissive
      emissiveIntensity: 0.25,
    });
    injectCharacterAnimationShader(this.wardenMat);
    this.wardenMesh = new THREE.InstancedMesh(this.wardenGeom, this.wardenMat, 16);
    this.wardenMesh.frustumCulled = false;
    this.wardenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wardenAnimAttr = new THREE.InstancedBufferAttribute(new Float32Array(16 * 4), 4);
    this.wardenAnimAttr.setUsage(THREE.DynamicDrawUsage);
    this.wardenGeom.setAttribute('instanceAnim', this.wardenAnimAttr);
    this.wardenMesh.count = 0;
    this.wardenMesh.castShadow = true;
    scene.add(this.wardenMesh);

    // 5d. Warden Megaphone Soundwave Comic Rings (Single Draw Call)
    this.soundwaveGeom = new THREE.RingGeometry(0.3, 0.48, 24);
    this.soundwaveGeom.rotateX(-Math.PI / 2);
    this.soundwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a, // Electric comic yellow soundwave
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.soundwaveMesh = new THREE.InstancedMesh(this.soundwaveGeom, this.soundwaveMat, 48);
    this.soundwaveMesh.frustumCulled = false;
    this.soundwaveMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.soundwaveMesh.count = 0;
    scene.add(this.soundwaveMesh);

    // 5e. Toxic Slime Decals Instanced Mesh (Single Draw Call)
    this.slimeGeom = new THREE.CircleGeometry(0.65, 16);
    this.slimeGeom.rotateX(-Math.PI / 2);
    this.slimeMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80, // Vibrant toxic green
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
    });
    this.slimeMesh = new THREE.InstancedMesh(this.slimeGeom, this.slimeMat, 160);
    this.slimeMesh.frustumCulled = false;
    this.slimeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.slimeMesh.count = 0;
    scene.add(this.slimeMesh);

    // 5f. Ambulance Micro-Objective (Single Draw Call)
    this.ambulanceGeom = new THREE.BoxGeometry(2.0, 1.4, 4.4);
    this.ambulanceMat = new THREE.MeshToonMaterial({
      color: 0xffffff, // White
      gradientMap: this.celGradientMap,
    });
    this.ambulanceMesh = new THREE.InstancedMesh(this.ambulanceGeom, this.ambulanceMat, 8);
    this.ambulanceMesh.frustumCulled = false;
    this.ambulanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ambulanceMesh.count = 0;
    this.ambulanceMesh.castShadow = true;
    scene.add(this.ambulanceMesh);

    // 6. Patient Zero Distinct Mesh (Single Draw Call)
    this.pzMesh = new THREE.InstancedMesh(this.pzGeom, this.pzMat, 1);
    this.pzMesh.frustumCulled = false;
    this.pzAnimAttr = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
    this.pzGeom.setAttribute('instanceAnim', this.pzAnimAttr);
    this.pzMesh.count = 1;
    this.pzMesh.castShadow = true;
    scene.add(this.pzMesh);

    // 7. Patient Zero Distinct Ground Decal & Beacon Ring
    this._createPatientZeroBeacon();

    // 8. Hazmat Spray Cones (12m range, 45 degree cone)
    this.hazmatCones = [];
    const coneRadius = 12.0 * Math.tan(22.5 * Math.PI / 180); // ~4.97m
    const coneGeom = new THREE.ConeGeometry(coneRadius, 12.0, 16, 1, true);
    coneGeom.rotateX(-Math.PI / 2);
    coneGeom.translate(0, 0, 6.0);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x00eeff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (let i = 0; i < 16; i++) {
      const cMesh = new THREE.Mesh(coneGeom, coneMat.clone());
      cMesh.visible = false;
      scene.add(cMesh);
      this.hazmatCones.push(cMesh);
    }

    // 8b. Military Laser Sight Lines (Neon-red aiming beams)
    this.militaryLasers = [];
    for (let i = 0; i < 16; i++) {
      const laserGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1)
      ]);
      const laserMat = new THREE.LineBasicMaterial({
        color: 0xff0044,
        transparent: true,
        opacity: 0.85,
        linewidth: 2,
        depthWrite: false,
      });
      const laserLine = new THREE.Line(laserGeom, laserMat);
      laserLine.visible = false;
      scene.add(laserLine);
      this.militaryLasers.push(laserLine);
    }

    // 8c. Bullet Tracer Lines (High-velocity muzzle flash streak)
    this.tracerLines = [];
    for (let i = 0; i < 8; i++) {
      const tracerGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1)
      ]);
      const tracerMat = new THREE.LineBasicMaterial({
        color: 0xffea00,
        transparent: true,
        opacity: 0.9,
        linewidth: 3,
        depthWrite: false,
      });
      const tracerLine = new THREE.Line(tracerGeom, tracerMat);
      tracerLine.visible = false;
      scene.add(tracerLine);
      this.tracerLines.push(tracerLine);
    }

    // V3: Horde Shadow Mass — dark ellipse decal under zombie swarm
    const shadowGeom = new THREE.CircleGeometry(1.0, 32);
    shadowGeom.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.hordeShadow = new THREE.Mesh(shadowGeom, shadowMat);
    this.hordeShadow.visible = false;
    scene.add(this.hordeShadow);
  }

  applyKenneyAssets(characterGeometry, textures) {
    // Keep our cleanly articulated procedural humanoid geometries (with static zombie arms and shoulder-anchored civilian arms).
    // Do not replace with monolithic Kenney geometry to prevent vertex tearing/exploding.
    console.log('[InstancedRenderer] Maintained stylized segmented character humanoid geometries.');
  }

  _createPatientZeroBeacon() {
    this.beaconGroup = new THREE.Group();

    // Flashing rings removed per user request (@artist)
    // Keep clean diorama presentation without pulsating ground rings
    this.innerRing = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    this.innerRing.visible = false;

    this.outerRing = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    this.outerRing.visible = false;

    // Directional chevron / arrow
    const arrowGeom = new THREE.ConeGeometry(0.38, 0.95, 12);
    arrowGeom.rotateX(Math.PI / 2);
    arrowGeom.translate(0, 0.07, 1.7);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.85,
    });
    this.arrowMesh = new THREE.Mesh(arrowGeom, arrowMat);
    this.beaconGroup.add(this.arrowMesh);

    // 3D Floating Radial Countdown Ring for Titan Virus
    const titanRingGeom = new THREE.RingGeometry(0.7, 0.95, 32);
    titanRingGeom.rotateX(-Math.PI / 2);
    const titanRingMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.titanRing = new THREE.Mesh(titanRingGeom, titanRingMat);
    this.titanRing.position.y = 2.4;
    this.titanRing.visible = false;
    this.beaconGroup.add(this.titanRing);

    // 3D Warning Radial Ring for Last Stand Decontamination
    const mistRingGeom = new THREE.RingGeometry(0.65, 0.9, 32);
    mistRingGeom.rotateX(-Math.PI / 2);
    const mistRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mistDecontamRing = new THREE.Mesh(mistRingGeom, mistRingMat);
    this.mistDecontamRing.position.y = 2.2;
    this.mistDecontamRing.visible = false;
    this.beaconGroup.add(this.mistDecontamRing);

    // Vertical translucent light pillar beacon beam
    const beamGeom = new THREE.CylinderGeometry(0.18, 0.28, 7.0, 12, 1, true);
    beamGeom.translate(0, 3.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    this.beaconBeam = new THREE.Mesh(beamGeom, beamMat);
    this.beaconGroup.add(this.beaconBeam);

    this.scene.add(this.beaconGroup);
  }

  render(entityManager, time, dt) {
    const pz = entityManager.patientZero;

    // 1. Update Patient Zero Mesh & Beacon Decal (Dynamic Titan Scaling)
    if (pz) {
      const pzSpeed = Math.hypot(pz.vx, pz.vz);
      const groundY = getCharacterGroundY(pz.x, pz.z);
      const pzScale = entityManager.pzVisualScale || 1.0;

      this.dummy.position.set(pz.x, groundY, pz.z);
      this.dummy.rotation.set(0, pz.angle, 0);
      this.dummy.scale.set(1.05 * pzScale, 1.05 * pzScale, 1.05 * pzScale);
      this.dummy.updateMatrix();
      this.pzMesh.setMatrixAt(0, this.dummy.matrix);

      this.pzAnimAttr.setXYZW(0, pzSpeed, pz.walkPhase, 2.0, 0.0);
      this.pzAnimAttr.needsUpdate = true;
      this.pzMesh.instanceMatrix.needsUpdate = true;

      // Car Recovery invulnerability flashing (50% opacity blink)
      if (pz.carRecoveryTimer > 0) {
        const flashPhase = Math.floor(time * 12.0) % 2;
        this.pzMat.opacity = flashPhase === 0 ? 0.5 : 1.0;
      } else {
        this.pzMat.opacity = 1.0;
      }

      this.beaconGroup.position.set(pz.x, groundY, pz.z);
      this.arrowMesh.rotation.y = pz.angle;
      this.arrowMesh.visible = pzSpeed > 0.15;

      if (entityManager.isTitan && entityManager.titanVirusTimer > 0) {
        // Geometric purple ring graphic eliminated per designer & artist requirements
        this.titanRing.visible = false;
        this.beaconBeam.visible = true;
        this.beaconBeam.material.opacity = 0.45;
        this.beaconBeam.material.color.setHex(0xa855f7);
      } else {
        this.titanRing.visible = false;
        this.beaconBeam.visible = false;
      }

      // Last Stand Decontamination Warning Ring (above head when taking mist with 0 followers)
      if (entityManager.pzSprayTime > 0 && entityManager.zombies.length === 0 && !entityManager.isTitan) {
        this.mistDecontamRing.visible = true;
        this.mistDecontamRing.position.y = 2.2 * pzScale;
        const pulse = 1.0 + Math.sin(time * 16.0) * 0.15;
        this.mistDecontamRing.scale.set(pulse, pulse, pulse);
        this.mistDecontamRing.material.opacity = 0.7 + Math.sin(time * 14.0) * 0.25;
      } else {
        this.mistDecontamRing.visible = false;
      }
    }

    // 2. Update Zombies (InstancedMesh - Single Draw Call)
    // A5: Stray zombies get animType 1.5 for the slow shuffle shader branch
    const allZombies = entityManager.getAllZombies ? entityManager.getAllZombies() : entityManager.zombies;
    const zCount = Math.min(allZombies.length, this.maxCapacity);
    this.zombieMesh.count = zCount;

    const zAnimArr = this.zombieAnimAttr.array;
    const hordeSet = new Set(entityManager.zombies);

    for (let i = 0; i < zCount; i++) {
      const z = allZombies[i];
      const speed = Math.hypot(z.vx, z.vz);
      const angle = speed > 0.08 ? Math.atan2(z.vx, z.vz) : (z.wanderAngle || 0);
      const groundY = getCharacterGroundY(z.x, z.z);

      this.dummy.position.set(z.x, groundY, z.z);
      this.dummy.rotation.set(0, angle, 0);

      if (z.convertAnim > 0) {
        // Organic volume-preserving pop: height stretches up to 1.35x, XZ squashes
        const pop = Math.sin(z.convertAnim * Math.PI);
        const scaleY = 1.0 + pop * 0.35;
        const scaleXZ = 1.0 / Math.sqrt(scaleY);
        this.dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      } else {
        this.dummy.scale.set(1.0, 1.0, 1.0);
      }
      this.dummy.updateMatrix();

      this.zombieMesh.setMatrixAt(i, this.dummy.matrix);

      const idx = i * 4;
      zAnimArr[idx] = speed;
      zAnimArr[idx + 1] = z.walkPhase;
      // A5: Stray zombies use animType 1.5 for slow-shuffle shader branch
      zAnimArr[idx + 2] = hordeSet.has(z) ? 1.0 : 1.5;
      zAnimArr[idx + 3] = z.flail || 0.0;
    }

    this.zombieMesh.instanceMatrix.needsUpdate = true;
    this.zombieAnimAttr.needsUpdate = true;

    // V3: Horde Shadow Mass — dark ellipse grows with swarm size
    if (this.hordeShadow && pz) {
      const hordeMag = Math.min(entityManager.zombies.length / 80, 1.0);
      const shadowScale = 1.5 + hordeMag * 6.0;
      this.hordeShadow.position.set(pz.x, 0.02, pz.z);
      this.hordeShadow.scale.set(shadowScale, 1, shadowScale);
      this.hordeShadow.material.opacity = 0.08 + hordeMag * 0.22;
      this.hordeShadow.visible = entityManager.zombies.length > 2;
    }

    // 3. Update Civilians (InstancedMesh - Single Draw Call)
    // G5: Skip hidden civilians; G7: Pass cureFlail as flail param
    const civs = entityManager.civilians;
    const cCount = Math.min(civs.filter(c => !c.hidden).length, this.maxCapacity);
    this.civMesh.count = cCount;

    const cAnimArr = this.civAnimAttr.array;
    let cIdx = 0;

    for (let i = 0; i < civs.length && cIdx < cCount; i++) {
      const c = civs[i];
      if (c.hidden) continue;
      const speed = Math.hypot(c.vx, c.vz);
      const angle = speed > 0.08 ? Math.atan2(c.vx, c.vz) : c.wanderAngle;
      const groundY = getCharacterGroundY(c.x, c.z);

      this.dummy.position.set(c.x, groundY, c.z);
      this.dummy.rotation.set(0, angle, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();

      this.civMesh.setMatrixAt(cIdx, this.dummy.matrix);

      const ia = cIdx * 4;
      cAnimArr[ia] = speed;
      cAnimArr[ia + 1] = c.walkPhase;
      cAnimArr[ia + 2] = 0.0; // Civilian walk/run
      cAnimArr[ia + 3] = c.cureFlail || 0.0; // G7: stagger on newly-cured
      cIdx++;
    }

    this.civMesh.instanceMatrix.needsUpdate = true;
    this.civAnimAttr.needsUpdate = true;

    // 4. Update Hazmats & Cones
    // G3: Hazmat heli drop — interpolate Y from dropY to ground
    const hazmats = entityManager.hazmats;
    const hCount = Math.min(hazmats.length, 32);
    this.hazmatMesh.count = hCount;

    const hAnimArr = this.hazmatAnimAttr.array;

    for (let i = 0; i < this.hazmatCones.length; i++) {
      this.hazmatCones[i].visible = false;
    }

    for (let i = 0; i < hCount; i++) {
      const h = hazmats[i];
      const groundY = getCharacterGroundY(h.x, h.z);
      const hazmatY = groundY + (h.dropY || 0); // G3: elevate during heli drop

      this.dummy.position.set(h.x, hazmatY, h.z);
      this.dummy.rotation.set(0, h.angle, 0);
      this.dummy.scale.set(1.15, 1.15, 1.15);
      this.dummy.updateMatrix();
      this.hazmatMesh.setMatrixAt(i, this.dummy.matrix);

      const idx = i * 4;
      hAnimArr[idx] = h.speed;
      hAnimArr[idx + 1] = h.walkPhase;
      hAnimArr[idx + 2] = 3.0; // Hazmat march
      hAnimArr[idx + 3] = 0.0;

      if (i < this.hazmatCones.length && !h.isDropping) {
        const cone = this.hazmatCones[i];
        cone.visible = true;
        cone.position.set(h.x, hazmatY + 0.38, h.z);
        cone.rotation.y = h.angle;
        cone.material.opacity = 0.2 + Math.sin(time * 14.0 + i) * 0.08;
      }
    }

    this.hazmatMesh.instanceMatrix.needsUpdate = true;
    this.hazmatAnimAttr.needsUpdate = true;

    // 5. Update Military Units, Laser Sights & Tracer Shots
    const military = entityManager.militaryUnits || [];
    const mCount = Math.min(military.length, 32);
    this.militaryMesh.count = mCount;
    const mAnimArr = this.militaryAnimAttr.array;

    for (let i = 0; i < this.militaryLasers.length; i++) {
      this.militaryLasers[i].visible = false;
    }
    for (let i = 0; i < this.tracerLines.length; i++) {
      this.tracerLines[i].visible = false;
    }

    for (let i = 0; i < mCount; i++) {
      const m = military[i];
      const groundY = getCharacterGroundY(m.x, m.z);

      this.dummy.position.set(m.x, groundY, m.z);
      this.dummy.rotation.set(0, m.angle, 0);
      this.dummy.scale.set(1.15, 1.15, 1.15);
      this.dummy.updateMatrix();
      this.militaryMesh.setMatrixAt(i, this.dummy.matrix);

      const idx = i * 4;
      mAnimArr[idx] = m.speed || 0;
      mAnimArr[idx + 1] = m.walkPhase || 0;
      mAnimArr[idx + 2] = 4.0; // animType 4.0 = military rifle aim stance
      mAnimArr[idx + 3] = 0.0;

      // Update Laser Sight Line (visible while aiming)
      if (i < this.militaryLasers.length && m.targetPos && m.state === 'aiming') {
        const laser = this.militaryLasers[i];
        laser.visible = true;

        // Gun muzzle origin (rifle tip in world coordinates)
        const mx = m.x + Math.sin(m.angle) * 0.72;
        const my = groundY + 0.86;
        const mz = m.z + Math.cos(m.angle) * 0.72;

        const posAttr = laser.geometry.attributes.position;
        const pArr = posAttr.array;
        pArr[0] = mx;
        pArr[1] = my;
        pArr[2] = mz;
        pArr[3] = m.targetPos.x;
        pArr[4] = m.targetPos.y ?? (getCharacterGroundY(m.targetPos.x, m.targetPos.z) + 0.7);
        pArr[5] = m.targetPos.z;
        posAttr.needsUpdate = true;

        // Brighten and pulse laser as 1.5s charge completes
        const chargeRatio = Math.min(1.0, (m.aimTimer || 0) / 1.5);
        laser.material.opacity = 0.4 + chargeRatio * 0.55 + Math.sin(time * 20.0) * 0.1;
      }

      // Update High-Velocity Tracer Flash Line
      if (i < this.tracerLines.length && m.tracerShot) {
        const tracer = this.tracerLines[i];
        tracer.visible = true;
        const tPos = tracer.geometry.attributes.position;
        const tpArr = tPos.array;
        tpArr[0] = m.tracerShot.x0;
        tpArr[1] = m.tracerShot.y0;
        tpArr[2] = m.tracerShot.z0;
        tpArr[3] = m.tracerShot.x1;
        tpArr[4] = m.tracerShot.y1;
        tpArr[5] = m.tracerShot.z1;
        tPos.needsUpdate = true;
        tracer.material.opacity = m.tracerShot.alpha || 0.95;
      }
    }

    this.militaryMesh.instanceMatrix.needsUpdate = true;
    this.militaryAnimAttr.needsUpdate = true;

    // 6. Update Megaphone Wardens & Soundwave Rings
    const wardens = entityManager.wardens || [];
    const wCount = Math.min(wardens.filter(w => !w.hidden).length, 16);
    this.wardenMesh.count = wCount;
    const wAnimArr = this.wardenAnimAttr.array;

    let soundwaveCount = 0;
    let wIdx = 0;
    for (let i = 0; i < wardens.length && wIdx < wCount; i++) {
      const w = wardens[i];
      if (w.hidden) continue;
      const speed = Math.hypot(w.vx, w.vz);
      const angle = speed > 0.08 ? Math.atan2(w.vx, w.vz) : (w.angle || 0);
      const groundY = getCharacterGroundY(w.x, w.z);

      this.dummy.position.set(w.x, groundY, w.z);
      this.dummy.rotation.set(0, angle, 0);
      this.dummy.scale.set(1.15, 1.15, 1.15);
      this.dummy.updateMatrix();
      this.wardenMesh.setMatrixAt(wIdx, this.dummy.matrix);

      const idx = wIdx * 4;
      wAnimArr[idx] = speed;
      wAnimArr[idx + 1] = w.walkPhase || 0;
      wAnimArr[idx + 2] = 3.0; // animType 3.0 (left arm swings, right arm holds megaphone forward)
      wAnimArr[idx + 3] = 0.0;
      wIdx++;

      // Emit 3 comic soundwave rings pulsing in front of megaphone
      for (let r = 0; r < 3 && soundwaveCount < 48; r++) {
        const ringProg = ((time * 2.2 + r * 0.33) % 1.0);
        const ringDist = 0.8 + ringProg * 3.5;
        const ringScale = 0.6 + ringProg * 2.2;
        const rx = w.x + Math.sin(angle) * ringDist;
        const rz = w.z + Math.cos(angle) * ringDist;
        const ry = groundY + 0.85 + Math.sin(ringProg * Math.PI) * 0.15;

        this.dummy.position.set(rx, ry, rz);
        this.dummy.rotation.set(0, angle, 0);
        this.dummy.scale.set(ringScale, ringScale, ringScale);
        this.dummy.updateMatrix();
        this.soundwaveMesh.setMatrixAt(soundwaveCount, this.dummy.matrix);
        soundwaveCount++;
      }
    }
    this.wardenMesh.instanceMatrix.needsUpdate = true;
    this.wardenAnimAttr.needsUpdate = true;

    // --- Ambulance Update ---
    const ambulances = entityManager.ambulances || [];
    const ambCount = Math.min(ambulances.length, 8);
    this.ambulanceMesh.count = ambCount;
    for (let i = 0; i < ambCount; i++) {
      const amb = ambulances[i];
      const pulse = 1.0 + (amb.swarmTimer > 0 ? Math.sin(Date.now() * 0.02) * (0.05 * amb.swarmTimer) : 0);
      this.dummy.position.set(amb.x, 0.7, amb.z);
      this.dummy.rotation.set(0, amb.angle || 0, 0);
      this.dummy.scale.set(pulse, pulse, pulse);
      this.dummy.updateMatrix();
      this.ambulanceMesh.setMatrixAt(i, this.dummy.matrix);
      
      if (amb.swarmTimer > 0) {
        this.color.setHex(0xffcccc).lerp(new THREE.Color(0xff0000), amb.swarmTimer / 3.0);
        this.ambulanceMesh.setColorAt(i, this.color);
      } else {
        this.ambulanceMesh.setColorAt(i, new THREE.Color(0xffffff));
      }
    }
    this.ambulanceMesh.instanceMatrix.needsUpdate = true;
    if (this.ambulanceMesh.instanceColor) this.ambulanceMesh.instanceColor.needsUpdate = true;
    this.soundwaveMesh.count = soundwaveCount;
    if (soundwaveCount > 0) {
      this.soundwaveMesh.instanceMatrix.needsUpdate = true;
    }

    // 7. Update Toxic Slime Puddles
    const slimePuddles = entityManager.slimeTrail || [];
    const sCount = Math.min(slimePuddles.length, 160);
    this.slimeMesh.count = sCount;
    for (let i = 0; i < sCount; i++) {
      const sp = slimePuddles[i];
      const groundY = getCharacterGroundY(sp.x, sp.z) + 0.025; // Sits slightly above asphalt/sidewalk
      const lifeRatio = Math.max(0.1, sp.life / (sp.maxLife || 4.0));
      const puddleScale = (sp.scale || 1.0) * (0.4 + 0.6 * Math.sqrt(lifeRatio));

      this.dummy.position.set(sp.x, groundY, sp.z);
      this.dummy.rotation.set(0, sp.rot || 0, 0);
      this.dummy.scale.set(puddleScale, 1.0, puddleScale);
      this.dummy.updateMatrix();
      this.slimeMesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (sCount > 0) {
      this.slimeMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
