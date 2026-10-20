import * as THREE from 'three';

const VEHICLE_COLORS = [
  0x3b82f6,
  0xef4444,
  0xeab308,
  0x10b981,
  0x8b5cf6,
  0x64748b,
  0xf97316,
];

/**
 * Manages 3D Vehicles (Civilian Sedans, Police Cruisers with Siren Lightbars, Military APCs).
 * Supports physics knockback, Brute vehicle-flipping, and explosive vehicle destruction!
 */
export class VehicleManager {
  constructor(scene, vfx) {
    this.scene = scene;
    this.vfx = vfx;
    this.vehicles = [];
    this.maxVehicles = 16;

    this._initSharedMaterials();
  }

  _initSharedMaterials() {
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.12,
      metalness: 0.85,
    });
    this.wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
      metalness: 0.2,
    });
    this.headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    this.taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.sirenRedMat = new THREE.MeshBasicMaterial({ color: 0xff1e42 });
    this.sirenBlueMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  }

  _buildVehicleMesh(type = 'sedan', bodyHex = 0x3b82f6) {
    const group = new THREE.Group();
    const isAPC = type === 'apc';
    const isPolice = type === 'police';

    const bodyColor = isPolice ? 0x1e293b : isAPC ? 0x365314 : bodyHex;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: isAPC ? 0.65 : 0.28,
      metalness: isAPC ? 0.45 : 0.65,
    });

    const w = isAPC ? 2.6 : 2.0;
    const h = isAPC ? 1.45 : 0.82;
    const l = isAPC ? 5.4 : 4.2;

    // Lower chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), bodyMat);
    chassis.position.y = h / 2 + 0.32;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // Cabin greenhouse
    const cabW = w * 0.86;
    const cabH = isAPC ? 0.65 : 0.62;
    const cabL = isAPC ? l * 0.68 : l * 0.52;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(cabW, cabH, cabL),
      isPolice ? new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 }) : bodyMat
    );
    cabin.position.set(0, h + 0.32 + cabH / 2 - 0.05, -0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // Windshield & rear glass bands
    const wind = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.04, cabH * 0.72, cabL + 0.06), this.glassMat);
    wind.position.copy(cabin.position);
    group.add(wind);

    // Headlights & Taillights
    const hlGeo = new THREE.BoxGeometry(0.36, 0.22, 0.1);
    const hlL = new THREE.Mesh(hlGeo, this.headlightMat);
    hlL.position.set(-w * 0.34, 0.72, l / 2 + 0.02);
    const hlR = new THREE.Mesh(hlGeo, this.headlightMat);
    hlR.position.set(w * 0.34, 0.72, l / 2 + 0.02);
    group.add(hlL, hlR);

    const tlL = new THREE.Mesh(hlGeo, this.taillightMat);
    tlL.position.set(-w * 0.34, 0.72, -l / 2 - 0.02);
    const tlR = new THREE.Mesh(hlGeo, this.taillightMat);
    tlR.position.set(w * 0.34, 0.72, -l / 2 - 0.02);
    group.add(tlL, tlR);

    // Police lightbar
    if (isPolice) {
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.28), this.sirenRedMat);
      barR.position.set(-0.28, h + cabH + 0.35, -0.15);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.28), this.sirenBlueMat);
      barB.position.set(0.28, h + cabH + 0.35, -0.15);
      group.add(barR, barB);
    }

    // APC Roof Turret
    if (isAPC) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.45, 8), bodyMat);
      turret.position.set(0, h + cabH + 0.45, 0.2);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), this.wheelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, h + cabH + 0.45, 1.2);
      group.add(turret, barrel);
    }

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wx = w / 2 - 0.05;
    const wz = l * 0.32;
    for (const [sx, sz] of [
      [-wx, wz],
      [wx, wz],
      [-wx, -wz],
      [wx, -wz],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, this.wheelMat);
      wheel.position.set(sx, 0.38, sz);
      group.add(wheel);
    }

    this.scene.add(group);
    return group;
  }

  spawnTrafficAround(playerX, playerZ, chunkSize, threatLevel = 1) {
    while (this.vehicles.length < this.maxVehicles) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const dir = Math.random() < 0.5 ? 1 : -1;
      const laneOffset = dir > 0 ? 3.2 : -3.2;

      const baseGridX = Math.round(playerX / chunkSize) * chunkSize;
      const baseGridZ = Math.round(playerZ / chunkSize) * chunkSize;
      const roadLineOffset = (Math.floor(Math.random() * 3) - 1) * chunkSize;
      const alongOffset = (Math.random() - 0.5) * 150;

      let x, z, vx, vz, heading;
      const roll = Math.random();
      const type =
        threatLevel >= 3 && roll < 0.22
          ? 'apc'
          : threatLevel >= 2 && roll < 0.48
          ? 'police'
          : 'sedan';

      const baseSpeed = type === 'apc' ? 9.5 : type === 'police' ? 13.5 : 11.5;

      if (axis === 'x') {
        x = playerX + alongOffset;
        z = baseGridZ + roadLineOffset + laneOffset;
        if (Math.hypot(x - playerX, z - playerZ) < 24) x += dir * 32;
        vx = dir * baseSpeed;
        vz = 0;
        heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        x = baseGridX + roadLineOffset + laneOffset;
        z = playerZ + alongOffset;
        if (Math.hypot(x - playerX, z - playerZ) < 24) z += dir * 32;
        vx = 0;
        vz = dir * baseSpeed;
        heading = dir > 0 ? 0 : Math.PI;
      }

      const colorHex = VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];
      const mesh = this._buildVehicleMesh(type, colorHex);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;

      this.vehicles.push({
        type,
        x,
        y: 0,
        z,
        vx,
        vy: 0,
        vz,
        heading,
        hp: type === 'apc' ? 240 : type === 'police' ? 120 : 75,
        radius: type === 'apc' ? 2.4 : 1.9,
        mesh,
        wrecked: false,
        wreckTimer: 0,
        fireCooldown: 0,
      });
    }
  }

  update(dt, sim, chunkSize, audio) {
    const pz = sim.patientZero;
    this.spawnTrafficAround(pz.x, pz.z, chunkSize, sim.threatLevel);

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];

      // Despawn far-away vehicles
      if (Math.hypot(v.x - pz.x, v.z - pz.z) > 135) {
        this.scene.remove(v.mesh);
        this.vehicles.splice(i, 1);
        continue;
      }

      if (v.wrecked) {
        v.wreckTimer += dt;
        v.vy -= 20 * dt;
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        v.z += v.vz * dt;
        if (v.y < 0) {
          v.y = 0;
          v.vy *= -0.3;
          v.vx *= 0.82;
          v.vz *= 0.82;
        }
        v.mesh.position.set(v.x, v.y, v.z);
        v.mesh.rotation.x += v.vx * 0.12 * dt;
        v.mesh.rotation.z += v.vz * 0.12 * dt;

        if (v.wreckTimer > 4.0) {
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
        }
        continue;
      }

      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.mesh.position.set(v.x, v.y, v.z);

      // APC turret fires suppressive burst at large horde clusters
      if (v.type === 'apc') {
        v.fireCooldown -= dt;
        if (v.fireCooldown <= 0 && Math.hypot(v.x - pz.x, v.z - pz.z) < 28) {
          v.fireCooldown = 2.4;
          sim.spawnExplosionDamage(
            pz.x + (Math.random() - 0.5) * 6,
            pz.z + (Math.random() - 0.5) * 6,
            4.2,
            false
          );
          if (audio) audio.playExplosion(0.5);
        }
      }

      // Check collision with Zombies & Brutes
      const nearZombies = sim.zombieGrid.queryRadius(v.x, v.z, v.radius + 1.1);
      for (let j = 0; j < nearZombies.length; j++) {
        const z = nearZombies[j];
        if (z.dead) continue;

        // Juggernaut Brute or Frenzy Zombie SMASHES and FLIPS the vehicle!
        if (z.caste === 'brute' || sim.patientZero.frenzyTimer > 0) {
          v.hp -= z.caste === 'brute' ? 140 : 45;
          this.vfx.emitSparks(v.x, 1.0, v.z, 0xfbbf24, 10, 8, 1.1, 0.4);
          if (v.hp <= 0 && !v.wrecked) {
            this._wreckVehicle(v, z.x, z.z, sim, audio);
            break;
          }
        } else {
          // Vehicle knocks standard zombie into a flying ragdoll!
          z.dead = true;
          v.hp -= 18;
          this.vfx.spawnRagdoll(
            z.x,
            z.z,
            v.vx * 1.1 + (Math.random() - 0.5) * 6,
            7.5 + Math.random() * 4,
            v.vz * 1.1 + (Math.random() - 0.5) * 6,
            0x4ade80,
            z.scale || 1.0
          );
          this.vfx.addDecal(z.x, z.z, 0x15803d, 1.5);
          if (audio) audio.playCrunch();

          if (v.hp <= 0 && !v.wrecked) {
            this._wreckVehicle(v, z.x, z.z, sim, audio);
            break;
          }
        }
      }

      // Check if Patient Zero himself rams the vehicle
      if (!v.wrecked && Math.hypot(v.x - pz.x, v.z - pz.z) < v.radius + 0.75) {
        if (pz.frenzyTimer > 0 || sim.upgrades.brute >= 2) {
          this._wreckVehicle(v, pz.x, pz.z, sim, audio);
        } else {
          // Push Patient Zero aside with sparks
          const dx = pz.x - v.x;
          const dz = pz.z - v.z;
          const d = Math.hypot(dx, dz) || 1;
          pz.x = v.x + (dx / d) * (v.radius + 0.85);
          pz.z = v.z + (dz / d) * (v.radius + 0.85);
          v.hp -= 35;
          if (v.hp <= 0) {
            this._wreckVehicle(v, pz.x, pz.z, sim, audio);
          }
        }
      }
    }
  }

  _wreckVehicle(v, impactX, impactZ, sim, audio) {
    v.wrecked = true;
    const dx = v.x - impactX;
    const dz = v.z - impactZ;
    const d = Math.hypot(dx, dz) || 1;
    v.vx = (dx / d) * 9.0;
    v.vy = 7.5;
    v.vz = (dz / d) * 9.0;

    this.vfx.spawnExplosion(v.x, v.z, 6.0, false);
    if (audio) audio.playExplosion(0.85);
    sim.addDNA(15);
    sim.pushRadioAlert(
      v.type === 'apc'
        ? 'ARMORED APC FLIPPED BY HORDE (+15 DNA)'
        : v.type === 'police'
        ? 'POLICE CRUISER WRECKED (+15 DNA)'
        : 'VEHICLE DEMOLISHED (+15 DNA)',
      'amber'
    );
  }
}
