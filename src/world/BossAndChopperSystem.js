import * as THREE from 'three';

/**
 * Manages the Hunter-Killer Armored Boss Tank Encounter.
 * (Removed the spinning helicopter spotlight disk/cone that obstructed the player view on mobile!)
 */
export class BossAndChopperSystem {
  constructor(scene, vfx) {
    this.scene = scene;
    this.vfx = vfx;

    this._initBoss();
    this._initMortarIndicators(3);
  }

  _initBoss() {
    this.bossGroup = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.6,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
      metalness: 0.5,
    });
    this.bossCoreMat = new THREE.MeshBasicMaterial({
      color: 0xff1e42,
    });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.7, 6.2), hullMat);
    hull.position.y = 1.25;
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.bossGroup.add(hull);

    const treadGeo = new THREE.BoxGeometry(0.8, 1.25, 6.6);
    const treadL = new THREE.Mesh(treadGeo, armorMat);
    treadL.position.set(-2.2, 0.85, 0);
    const treadR = new THREE.Mesh(treadGeo, armorMat);
    treadR.position.set(2.2, 0.85, 0);
    this.bossGroup.add(treadL, treadR);

    this.bossTurret = new THREE.Group();
    this.bossTurret.position.set(0, 2.4, -0.2);

    const turretHead = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.6, 1.0, 10), hullMat);
    turretHead.castShadow = true;
    this.bossTurret.add(turretHead);

    const barrelGeo = new THREE.CylinderGeometry(0.16, 0.2, 2.8, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelL = new THREE.Mesh(barrelGeo, armorMat);
    barrelL.position.set(-0.5, 0.1, 1.8);
    const barrelR = new THREE.Mesh(barrelGeo, armorMat);
    barrelR.position.set(0.5, 0.1, 1.8);
    this.bossTurret.add(barrelL, barrelR);

    const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 1), this.bossCoreMat);
    coreMesh.position.set(0, 0.7, 0);
    this.bossTurret.add(coreMesh);

    this.bossGroup.add(this.bossTurret);
    this.bossGroup.visible = false;
    this.scene.add(this.bossGroup);

    this.boss = {
      active: false,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      heading: 0,
      hp: 1000,
      maxHp: 1000,
      phase: 1,
      mortarCooldown: 4.5,
      chargeCooldown: 6.5,
      charging: 0,
    };
  }

  _initMortarIndicators(max) {
    this.mortars = [];
    const outerGeo = new THREE.RingGeometry(2.6, 2.9, 28);
    outerGeo.rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(2.7, 28);
    fillGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < max; i++) {
      const group = new THREE.Group();
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.scale.set(0.05, 1, 0.05);
      group.add(outer, fill);
      group.position.y = 0.08;
      group.visible = false;
      this.scene.add(group);

      this.mortars.push({
        active: false,
        x: 0,
        z: 0,
        age: 0,
        fuse: 1.7,
        group,
        fill,
      });
    }
  }

  spawnBoss(playerX, playerZ, sim) {
    if (this.boss.active) return false;
    const angle = Math.random() * Math.PI * 2;
    this.boss.active = true;
    this.boss.x = playerX + Math.cos(angle) * 26;
    this.boss.z = playerZ + Math.sin(angle) * 26;
    this.boss.vx = 0;
    this.boss.vz = 0;
    this.boss.maxHp = 1000 + sim.threatLevel * 200;
    this.boss.hp = this.boss.maxHp;
    this.boss.phase = 1;
    this.boss.mortarCooldown = 3.5;
    this.boss.chargeCooldown = 6.0;
    this.boss.charging = 0;

    this.bossGroup.position.set(this.boss.x, 0, this.boss.z);
    this.bossGroup.visible = true;

    this.vfx.spawnShockwave(this.boss.x, this.boss.z, 0xef4444, 12, 0.6);
    if (sim.audio) sim.audio.playFrenzyRoar();
    return true;
  }

  _launchMortarSalvo(sim) {
    const pz = sim.patientZero;
    const count = 2;
    for (let i = 0; i < count; i++) {
      const slot = this.mortars.find((m) => !m.active);
      if (!slot) break;
      slot.active = true;
      slot.age = 0;
      slot.fuse = 1.7;
      slot.x = pz.x + (i === 0 ? 0 : (Math.random() - 0.5) * 14);
      slot.z = pz.z + (i === 0 ? 0 : (Math.random() - 0.5) * 14);
      slot.group.position.set(slot.x, 0.08, slot.z);
      slot.fill.scale.set(0.05, 1, 0.05);
      slot.group.visible = true;
    }
  }

  update(dt, sim) {
    const pz = sim.patientZero;

    if (!this.boss.active && sim.threatLevel >= 3 && sim.totalInfected >= 40 && !this._autoSpawnedOnce) {
      this._autoSpawnedOnce = true;
      this.spawnBoss(pz.x, pz.z, sim);
    }

    for (let i = 0; i < this.mortars.length; i++) {
      const m = this.mortars[i];
      if (!m.active) continue;
      m.age += dt;
      const t = Math.min(1, m.age / m.fuse);
      m.fill.scale.set(t, 1, t);

      if (m.age >= m.fuse) {
        m.active = false;
        m.group.visible = false;
        sim.spawnExplosionDamage(m.x, m.z, 4.0, false);
        if (sim.audio) sim.audio.playExplosion(0.7);
      }
    }

    if (!this.boss.active) return;

    const b = this.boss;
    const dx = pz.x - b.x;
    const dz = pz.z - b.z;
    const dist = Math.hypot(dx, dz) || 1;

    this.bossTurret.rotation.y = Math.atan2(dx, dz) - b.heading;

    if (b.phase === 1 && b.hp <= b.maxHp * 0.5) {
      b.phase = 2;
      this.vfx.spawnExplosion(b.x, b.z, 6.5, false);
    }

    b.mortarCooldown -= dt;
    if (b.mortarCooldown <= 0) {
      b.mortarCooldown = b.phase === 2 ? 4.8 : 6.5;
      this._launchMortarSalvo(sim);
    }

    b.chargeCooldown -= dt;
    if (b.chargeCooldown <= 0 && dist < 24) {
      b.chargeCooldown = 8.0;
      b.charging = 1.2;
      b.vx = (dx / dist) * 15.0;
      b.vz = (dz / dist) * 15.0;
      b.heading = Math.atan2(b.vx, b.vz);
    }

    if (b.charging > 0) {
      b.charging -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
    } else {
      const moveSpeed = b.phase === 2 ? 4.8 : 3.4;
      const targetVx = dist > 8.5 ? (dx / dist) * moveSpeed : 0;
      const targetVz = dist > 8.5 ? (dz / dist) * moveSpeed : 0;
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

    const attackingZombies = sim.zombieGrid.queryRadius(b.x, b.z, 4.4);
    for (let i = 0; i < attackingZombies.length; i++) {
      const z = attackingZombies[i];
      if (z.dead) continue;

      const dps = z.caste === 'brute' ? 110 : z.caste === 'leaper' ? 48 : 28;
      b.hp -= dps * dt * (pz.frenzyTimer > 0 ? 1.8 : 1.0);

      if (b.charging > 0 && z.caste !== 'brute') {
        z.dead = true;
        this.vfx.spawnRagdoll(z.x, z.z, b.vx * 1.1, 8.0, b.vz * 1.1, 0x4ade80, z.scale);
      }
    }

    if (b.hp <= 0) {
      b.active = false;
      this.bossGroup.visible = false;
      this.vfx.spawnExplosion(b.x, b.z, 10.0, false);
      if (sim.audio) sim.audio.playExplosion(1.0);
      sim.addDNA(150);
      sim.score += 5000;
    }
  }
}
