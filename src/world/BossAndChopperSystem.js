import * as THREE from 'three';

/**
 * Manages:
 *  1) Overhead Patrol Helicopter with Volumetric Searchlight God-Ray Cone & SpotLight
 *  2) Multi-Phase "HUNTER-KILLER TITAN" Boss Encounter (Telegraphed Mortar Rings + Ram Charge)
 */
export class BossAndChopperSystem {
  constructor(scene, vfx) {
    this.scene = scene;
    this.vfx = vfx;

    this._initHelicopter();
    this._initBoss();
    this._initMortarIndicators(4);
  }

  // ---------------------------------------------------------------------------
  // 1. Volumetric Searchlight Helicopter
  // ---------------------------------------------------------------------------
  _initHelicopter() {
    this.chopperGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.7,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      roughness: 0.1,
      metalness: 0.9,
    });
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    // Fuselage & cockpit
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 4.2), bodyMat);
    this.chopperGroup.add(fuselage);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 10), glassMat);
    nose.position.set(0, -0.05, 1.7);
    this.chopperGroup.add(nose);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 3.8), bodyMat);
    tail.position.set(0, 0.25, -3.5);
    this.chopperGroup.add(tail);

    // Main spinning rotor
    this.mainRotor = new THREE.Group();
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.06, 0.32), rotorMat);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 7.5), rotorMat);
    this.mainRotor.add(blade1, blade2);
    this.mainRotor.position.set(0, 0.85, 0);
    this.chopperGroup.add(this.mainRotor);

    // Volumetric Searchlight Cone (God-Ray effect)
    const coneGeo = new THREE.ConeGeometry(5.2, 19.5, 24, 1, true);
    coneGeo.translate(0, -19.5 / 2, 0);
    this.coneMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.searchCone = new THREE.Mesh(coneGeo, this.coneMat);
    this.searchCone.position.set(0, -0.6, 1.2);
    this.chopperGroup.add(this.searchCone);

    // Ground searchlight projection ring
    const spotRingGeo = new THREE.RingGeometry(0.2, 5.0, 32);
    spotRingGeo.rotateX(-Math.PI / 2);
    this.spotRingMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.spotRing = new THREE.Mesh(spotRingGeo, this.spotRingMat);
    this.spotRing.position.y = 0.06;
    this.scene.add(this.spotRing);

    this.chopperGroup.position.set(0, 19.5, 0);
    this.scene.add(this.chopperGroup);

    this.chopperAngle = 0;
    this.spotTargetX = 0;
    this.spotTargetZ = 0;
  }

  // ---------------------------------------------------------------------------
  // 2. Multi-Phase Boss: Hunter-Killer Titan Siege Mech-APC
  // ---------------------------------------------------------------------------
  _initBoss() {
    this.bossGroup = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.35,
      metalness: 0.78,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      roughness: 0.4,
      metalness: 0.6,
    });
    this.bossCoreMat = new THREE.MeshBasicMaterial({
      color: 0xff1e42,
    });

    // Heavy armored lower hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.8, 6.8), hullMat);
    hull.position.y = 1.3;
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.bossGroup.add(hull);

    // Side reactive armor treads
    const treadGeo = new THREE.BoxGeometry(0.85, 1.35, 7.2);
    const treadL = new THREE.Mesh(treadGeo, armorMat);
    treadL.position.set(-2.35, 0.9, 0);
    const treadR = new THREE.Mesh(treadGeo, armorMat);
    treadR.position.set(2.35, 0.9, 0);
    this.bossGroup.add(treadL, treadR);

    // Rotating Siege Turret & Twin Plasma Cannons
    this.bossTurret = new THREE.Group();
    this.bossTurret.position.set(0, 2.55, -0.2);

    const turretHead = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.75, 1.1, 10), hullMat);
    turretHead.castShadow = true;
    this.bossTurret.add(turretHead);

    const barrelGeo = new THREE.CylinderGeometry(0.18, 0.22, 3.2, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelL = new THREE.Mesh(barrelGeo, armorMat);
    barrelL.position.set(-0.55, 0.1, 2.0);
    const barrelR = new THREE.Mesh(barrelGeo, armorMat);
    barrelR.position.set(0.55, 0.1, 2.0);
    this.bossTurret.add(barrelL, barrelR);

    // Glowing HDR Core Vent on Turret
    const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 1), this.bossCoreMat);
    coreMesh.position.set(0, 0.75, 0);
    this.bossTurret.add(coreMesh);

    this.bossGroup.add(this.bossTurret);

    // Boss Threat Aura Ring
    const bossRingGeo = new THREE.RingGeometry(3.4, 3.9, 40);
    bossRingGeo.rotateX(-Math.PI / 2);
    this.bossRingMat = new THREE.MeshBasicMaterial({
      color: 0xff1e42,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bossRing = new THREE.Mesh(bossRingGeo, this.bossRingMat);
    this.bossRing.position.y = 0.08;
    this.bossGroup.add(this.bossRing);

    this.bossGroup.visible = false;
    this.scene.add(this.bossGroup);

    this.boss = {
      active: false,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      heading: 0,
      hp: 1200,
      maxHp: 1200,
      phase: 1,
      mortarCooldown: 3.5,
      chargeCooldown: 6.0,
      charging: 0,
    };
  }

  _initMortarIndicators(max) {
    this.mortars = [];
    const outerGeo = new THREE.RingGeometry(3.2, 3.6, 32);
    outerGeo.rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(3.4, 32);
    fillGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < max; i++) {
      const group = new THREE.Group();
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.scale.set(0.05, 1, 0.05);
      group.add(outer, fill);
      group.position.y = 0.09;
      group.visible = false;
      this.scene.add(group);

      this.mortars.push({
        active: false,
        x: 0,
        z: 0,
        age: 0,
        fuse: 1.65,
        group,
        fill,
      });
    }
  }

  spawnBoss(playerX, playerZ, sim) {
    if (this.boss.active) return false;
    const angle = Math.random() * Math.PI * 2;
    this.boss.active = true;
    this.boss.x = playerX + Math.cos(angle) * 28;
    this.boss.z = playerZ + Math.sin(angle) * 28;
    this.boss.vx = 0;
    this.boss.vz = 0;
    this.boss.maxHp = 1200 + sim.threatLevel * 250;
    this.boss.hp = this.boss.maxHp;
    this.boss.phase = 1;
    this.boss.mortarCooldown = 2.5;
    this.boss.chargeCooldown = 5.5;
    this.boss.charging = 0;

    this.bossGroup.position.set(this.boss.x, 0, this.boss.z);
    this.bossGroup.visible = true;

    this.vfx.spawnShockwave(this.boss.x, this.boss.z, 0xff1e42, 16, 0.7);
    if (sim.audio) sim.audio.playFrenzyRoar();
    sim.pushRadioAlert('WARNING: HUNTER-KILLER TITAN MECH DEPLOYED!', 'crimson');
    return true;
  }

  _launchMortarSalvo(sim) {
    const pz = sim.patientZero;
    const count = this.boss.phase === 2 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const slot = this.mortars.find((m) => !m.active);
      if (!slot) break;
      slot.active = true;
      slot.age = 0;
      slot.fuse = 1.6;
      slot.x = pz.x + (i === 0 ? 0 : (Math.random() - 0.5) * 16);
      slot.z = pz.z + (i === 0 ? 0 : (Math.random() - 0.5) * 16);
      slot.group.position.set(slot.x, 0.09, slot.z);
      slot.fill.scale.set(0.05, 1, 0.05);
      slot.group.visible = true;
    }
    sim.pushRadioAlert('TITAN MORTAR SALVO INCOMING — EVADE RED ZONES!', 'crimson');
  }

  update(dt, sim, time) {
    const pz = sim.patientZero;

    // 1. Update Helicopter & Volumetric Searchlight
    this.chopperAngle += dt * 0.42;
    const cx = pz.x + Math.cos(this.chopperAngle) * 16;
    const cz = pz.z + Math.sin(this.chopperAngle * 0.8) * 14;
    this.chopperGroup.position.set(cx, 19.5 + Math.sin(time * 2.5) * 0.6, cz);
    this.chopperGroup.rotation.y = -this.chopperAngle + Math.PI / 2;
    this.mainRotor.rotation.y = time * 22.0;

    // Smoothly sweep ground spotlight ring toward Patient Zero
    this.spotTargetX += (pz.x - this.spotTargetX) * Math.min(1, dt * 3.2);
    this.spotTargetZ += (pz.z - this.spotTargetZ) * Math.min(1, dt * 3.2);
    this.spotRing.position.set(this.spotTargetX, 0.06, this.spotTargetZ);
    this.spotRing.rotation.z = time * 1.5;

    // Aim searchlight cone at ground ring
    this.searchCone.lookAt(this.spotTargetX, 0, this.spotTargetZ);
    this.searchCone.rotateX(Math.PI / 2);

    // Auto-spawn Boss when reaching Threat Level 3+ if not yet active
    if (!this.boss.active && sim.threatLevel >= 3 && sim.totalInfected >= 36 && !this._autoSpawnedOnce) {
      this._autoSpawnedOnce = true;
      this.spawnBoss(pz.x, pz.z, sim);
    }

    // 2. Update Telegraphed Mortar Rings
    for (let i = 0; i < this.mortars.length; i++) {
      const m = this.mortars[i];
      if (!m.active) continue;
      m.age += dt;
      const t = Math.min(1, m.age / m.fuse);
      m.fill.scale.set(t, 1, t);

      if (m.age >= m.fuse) {
        m.active = false;
        m.group.visible = false;
        sim.spawnExplosionDamage(m.x, m.z, 4.5, false);
        if (sim.audio) sim.audio.playExplosion(0.8);
      }
    }

    // 3. Update Hunter-Killer Boss
    if (!this.boss.active) return;

    const b = this.boss;
    const dx = pz.x - b.x;
    const dz = pz.z - b.z;
    const dist = Math.hypot(dx, dz) || 1;

    // Aim turret at Patient Zero
    this.bossTurret.rotation.y = Math.atan2(dx, dz) - b.heading;

    // Phase 2 transition at 50% HP
    if (b.phase === 1 && b.hp <= b.maxHp * 0.5) {
      b.phase = 2;
      this.vfx.spawnExplosion(b.x, b.z, 7.5, false);
      sim.pushRadioAlert('TITAN MECH ENTERED PHASE 2 OVERDRIVE!', 'crimson');
      // Deploy Spec-Ops guards
      sim.spawnHuman(b.x + 4, b.z, 'sniper');
      sim.spawnHuman(b.x - 4, b.z, 'hazmat');
    }

    b.mortarCooldown -= dt;
    if (b.mortarCooldown <= 0) {
      b.mortarCooldown = b.phase === 2 ? 4.2 : 6.0;
      this._launchMortarSalvo(sim);
    }

    b.chargeCooldown -= dt;
    if (b.chargeCooldown <= 0 && dist < 26) {
      b.chargeCooldown = 7.5;
      b.charging = 1.4;
      b.vx = (dx / dist) * 16.5;
      b.vz = (dz / dist) * 16.5;
      b.heading = Math.atan2(b.vx, b.vz);
      this.vfx.emitSparks(b.x, 1.2, b.z, 0xff1e42, 18, 9, 1.3, 0.45);
    }

    if (b.charging > 0) {
      b.charging -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
    } else {
      const moveSpeed = b.phase === 2 ? 5.2 : 3.6;
      const targetVx = dist > 9.0 ? (dx / dist) * moveSpeed : 0;
      const targetVz = dist > 9.0 ? (dz / dist) * moveSpeed : 0;
      b.vx += (targetVx - b.vx) * Math.min(1, dt * 4);
      b.vz += (targetVz - b.vz) * Math.min(1, dt * 4);
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (Math.hypot(b.vx, b.vz) > 0.2) {
        b.heading = Math.atan2(b.vx, b.vz);
      }
    }

    this.bossGroup.position.set(b.x, 0, b.z);
    this.bossGroup.rotation.y = b.heading;

    // Horde & Brute attacks against the Boss!
    const attackingZombies = sim.zombieGrid.queryRadius(b.x, b.z, 4.4);
    for (let i = 0; i < attackingZombies.length; i++) {
      const z = attackingZombies[i];
      if (z.dead) continue;

      const dps = z.caste === 'brute' ? 95 : z.caste === 'leaper' ? 42 : 24;
      b.hp -= dps * dt * (pz.frenzyTimer > 0 ? 1.75 : 1.0);

      if (Math.random() < 0.15) {
        this.vfx.emitSparks(b.x + (Math.random() - 0.5) * 3, 1.5, b.z + (Math.random() - 0.5) * 3, 0xfbbf24, 2, 6, 0.9, 0.25);
      }

      // If Boss is ram-charging, non-Brute zombies get launched!
      if (b.charging > 0 && z.caste !== 'brute') {
        z.dead = true;
        this.vfx.spawnRagdoll(z.x, z.z, b.vx * 1.1, 8.5, b.vz * 1.1, 0x4ade80, z.scale);
      }
    }

    // Spore clouds corrode Boss armor rapidly!
    for (let i = 0; i < sim.sporeClouds.length; i++) {
      const sc = sim.sporeClouds[i];
      if (Math.hypot(sc.x - b.x, sc.z - b.z) < sc.radius + 3.0) {
        b.hp -= 65 * dt;
      }
    }

    if (b.hp <= 0) {
      b.active = false;
      this.bossGroup.visible = false;
      this.vfx.spawnExplosion(b.x, b.z, 11.0, false);
      this.vfx.spawnExplosion(b.x + 2, b.z - 2, 8.0, true);
      if (sim.audio) sim.audio.playExplosion(1.0);
      sim.addDNA(150);
      sim.score += 5000;
      sim.pushRadioAlert('HUNTER-KILLER TITAN DESTROYED! (+150 DNA & +5,000 BIOMASS)', 'emerald');
    }
  }
}
