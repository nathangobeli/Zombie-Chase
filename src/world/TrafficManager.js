import * as THREE from 'three';

const CAR_COLORS = [
  0xd90429, // Cherry red
  0x1e3a8a, // Deep blue
  0xf59e0b, // Taxi amber
  0xf8fafc, // Snow white
  0x334155, // Charcoal slate
  0x10b981, // Emerald green
];

export class TrafficManager {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = [];
    this.spawnTimer = 2.0;
    this.activeDifficulty = 'outbreak';
    this.maxVehicles = 8;
    this.carGeom = this._createCarGeometry();
    this.materials = CAR_COLORS.map(c => new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.35,
      metalness: 0.3,
    }));
    this.headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7 });
    this.taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
    this.wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  }

  _createCarGeometry() {
    const group = new THREE.Group();

    // 1. Lower Body / Chassis
    const bodyGeom = new THREE.BoxGeometry(2.0, 0.65, 3.8);
    const bodyMesh = new THREE.Mesh(bodyGeom);
    bodyMesh.position.set(0, 0.55, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // 2. Cabin / Roof with tinted windows
    const roofGeom = new THREE.BoxGeometry(1.65, 0.60, 2.0);
    const roofMesh = new THREE.Mesh(roofGeom, this.windowMat);
    roofMesh.position.set(0, 1.15, -0.2);
    roofMesh.castShadow = true;
    group.add(roofMesh);

    // 3. Headlights (glowing yellow)
    const hlGeom = new THREE.BoxGeometry(0.35, 0.2, 0.1);
    const hlL = new THREE.Mesh(hlGeom, this.headlightMat);
    hlL.position.set(-0.65, 0.55, -1.92);
    const hlR = new THREE.Mesh(hlGeom, this.headlightMat);
    hlR.position.set(0.65, 0.55, -1.92);
    group.add(hlL);
    group.add(hlR);

    // 4. Taillights (red)
    const tlGeom = new THREE.BoxGeometry(0.35, 0.2, 0.1);
    const tlL = new THREE.Mesh(tlGeom, this.taillightMat);
    tlL.position.set(-0.65, 0.55, 1.92);
    const tlR = new THREE.Mesh(tlGeom, this.taillightMat);
    tlR.position.set(0.65, 0.55, 1.92);
    group.add(tlL);
    group.add(tlR);

    // 5. Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
    wheelGeom.rotateZ(Math.PI / 2);
    const wPositions = [
      [-1.0, 0.32, -1.1],
      [1.0, 0.32, -1.1],
      [-1.0, 0.32, 1.1],
      [1.0, 0.32, 1.1],
    ];
    for (const [wx, wy, wz] of wPositions) {
      const wheel = new THREE.Mesh(wheelGeom, this.wheelMat);
      wheel.position.set(wx, wy, wz);
      group.add(wheel);
    }

    return group;
  }

  setDifficulty(difficulty) {
    this.activeDifficulty = difficulty;
  }

  reset() {
    for (let i = 0; i < this.vehicles.length; i++) {
      this.scene.remove(this.vehicles[i].mesh);
    }
    this.vehicles = [];
    this.spawnTimer = 2.0;
  }

  /**
   * Spawns a vehicle driving down an open roadway lane toward Patient Zero
   */
  /**
   * Spawns a vehicle driving down an open roadway lane toward Patient Zero
   */
  spawnVehicle(pzX = 0, pzZ = 0, cityStreamer = null, spatialGrid = null, stage = 2) {
    if (this.activeDifficulty === 'casual' || stage <= 1) return null; // 0 moving cars in casual & Stage 1

    let maxVehicles = 3;
    let baseSpeed = 8.0;
    if (stage === 2) {
      maxVehicles = 2;
      baseSpeed = 7.0 + Math.random() * 1.5; // 7.0 - 8.5 m/s
    } else if (stage === 3) {
      maxVehicles = 4;
      baseSpeed = 9.0 + Math.random() * 1.5; // 9.0 - 10.5 m/s
    } else if (stage >= 4) {
      maxVehicles = this.activeDifficulty === 'martial_law' ? 8 : 6;
      baseSpeed = 11.0 + Math.random() * 2.0; // 11.0 - 13.0 m/s
    }

    if (this.vehicles.length >= maxVehicles) return null;

    // 1. Determine candidate lanes strictly aligned with city street grid
    let candidateLanes = [];
    if (cityStreamer && cityStreamer.getDrivingLanes) {
      const activeLanes = cityStreamer.getDrivingLanes();
      // Filter lanes within 15m - 90m of Patient Zero
      candidateLanes = activeLanes.filter(l => {
        if (l.axis === 'z') {
          return Math.abs(l.fixedX - pzX) <= 65.0;
        } else {
          return Math.abs(l.fixedZ - pzZ) <= 65.0;
        }
      });
      if (candidateLanes.length === 0) candidateLanes = activeLanes;
    }

    // Fallback if no streamer lanes: construct strict chunk-origin road lanes
    if (candidateLanes.length === 0) {
      const cx = Math.round(pzX / 64.0);
      const cz = Math.round(pzZ / 64.0);
      const wx = cx * 64.0;
      const wz = cz * 64.0;
      candidateLanes = [
        { axis: 'z', fixedX: wx - 3.0, dirZ: -1, angle: 0 },
        { axis: 'z', fixedX: wx + 3.0, dirZ: 1, angle: Math.PI },
        { axis: 'x', fixedZ: wz - 3.0, dirX: 1, angle: Math.PI / 2 },
        { axis: 'x', fixedZ: wz + 3.0, dirX: -1, angle: -Math.PI / 2 },
        // Border lanes
        { axis: 'z', fixedX: wx + 32.0 - 3.0, dirZ: -1, angle: 0 },
        { axis: 'z', fixedX: wx + 32.0 + 3.0, dirZ: 1, angle: Math.PI },
        { axis: 'x', fixedZ: wz + 32.0 - 3.0, dirX: 1, angle: Math.PI / 2 },
        { axis: 'x', fixedZ: wz + 32.0 + 3.0, dirX: -1, angle: -Math.PI / 2 },
      ];
    }

    const lane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
    let x = 0;
    let z = 0;
    let vx = 0;
    let vz = 0;
    const angle = lane.angle;
    const spawnDist = 45.0 + Math.random() * 20.0;

    if (lane.axis === 'z') {
      x = lane.fixedX;
      z = pzZ - lane.dirZ * spawnDist;
      vx = 0;
      vz = lane.dirZ * baseSpeed;
    } else {
      z = lane.fixedZ;
      x = pzX - lane.dirX * spawnDist;
      vx = lane.dirX * baseSpeed;
      vz = 0;
    }

    // 2. AABB Building Collision Check: Verify spawn point does not overlap any building
    if (spatialGrid && spatialGrid.obstacles) {
      const halfW = 1.1;
      const halfD = 2.2;
      const spawnMinX = x - halfW;
      const spawnMaxX = x + halfW;
      const spawnMinZ = z - halfD;
      const spawnMaxZ = z + halfD;
      for (let i = 0; i < spatialGrid.obstacles.length; i++) {
        const obs = spatialGrid.obstacles[i];
        if (obs.isCar) continue; // Only buildings define impassable bounds
        if (obs.minX <= spawnMaxX && obs.maxX >= spawnMinX && obs.minZ <= spawnMaxZ && obs.maxZ >= spawnMinZ) {
          return null; // Reject spawn inside building footprint
        }
      }
    }

    // Clone car mesh
    const mesh = this.carGeom.clone();
    const colorMat = this.materials[Math.floor(Math.random() * this.materials.length)];
    mesh.children[0].material = colorMat; // Set body material
    mesh.position.set(x, 0.01, z);
    mesh.rotation.y = angle;
    this.scene.add(mesh);

    const vehicle = {
      id: Math.random(),
      mesh,
      x,
      z,
      y: 0.01,
      vx,
      vz,
      speed: baseSpeed,
      angle,
      width: 2.0,
      length: 4.2,
      isCrushed: false,
      crushTimer: 0,
      crushVy: 0,
      crushRotSpeed: 0,
      life: 18.0,
    };

    this.vehicles.push(vehicle);
    return vehicle;
  }

  update(dt, patientZero, entityManager, audioSystem, cameraController, particles, showFloatingText, cityStreamer = null, spatialGrid = null, gameTime = 0) {
    if (this.activeDifficulty === 'casual') {
      if (this.vehicles.length > 0) this.reset();
      return;
    }

    // Determine current Stage from gameTime
    let stage = 1;
    if (gameTime < 60) {
      stage = 1; // Stage 1: Outbreak Dawn (0 moving cars)
    } else if (gameTime < 150) {
      stage = 2; // Stage 2: Quarantine Alert (low-density traffic)
    } else if (gameTime < 240) {
      stage = 3; // Stage 3: Military Escalation (moderate traffic)
    } else {
      stage = 4; // Stage 4: Martial Law (high-density traffic)
    }

    // Stage 1 enforcement: 0 moving cars during initial 60 seconds
    if (stage === 1) {
      if (this.vehicles.length > 0) this.reset();
      return;
    }

    // 1. Spawning lifecycle according to stage pacing
    let spawnInterval = 7.0;
    if (stage === 2) spawnInterval = 7.5;
    else if (stage === 3) spawnInterval = 4.8;
    else if (stage >= 4) spawnInterval = this.activeDifficulty === 'martial_law' ? 2.2 : 3.2;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && patientZero) {
      this.spawnTimer = spawnInterval + Math.random() * 1.5;
      this.spawnVehicle(patientZero.x, patientZero.z, cityStreamer, spatialGrid, stage);
    }

    const pz = patientZero;

    // 2. Vehicle updates and collision resolution
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];

      if (v.isCrushed) {
        // Physics debris flip animation when stomped by Titan
        v.crushTimer += dt;
        v.crushVy -= 24.0 * dt;
        v.y += v.crushVy * dt;
        v.x += v.vx * 0.3 * dt;
        v.z += v.vz * 0.3 * dt;
        v.mesh.rotation.x += v.crushRotSpeed * dt;
        v.mesh.rotation.z += v.crushRotSpeed * 0.5 * dt;
        v.mesh.position.set(v.x, Math.max(0.01, v.y), v.z);

        if (v.crushTimer >= 2.0 || v.y < -1.0) {
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
        }
        continue;
      }

      // Forward AABB Obstacle Raycast: Destroy/despawn vehicle if forward path hits ANY building
      if (spatialGrid && spatialGrid.obstacles) {
        const lookAheadTime = 0.6; // 0.6 seconds ahead
        const nextX = v.x + v.vx * lookAheadTime;
        const nextZ = v.z + v.vz * lookAheadTime;
        const checkMinX = Math.min(v.x, nextX) - 1.1;
        const checkMaxX = Math.max(v.x, nextX) + 1.1;
        const checkMinZ = Math.min(v.z, nextZ) - 2.2;
        const checkMaxZ = Math.max(v.z, nextZ) + 2.2;

        let buildingBlocked = false;
        for (let o = 0; o < spatialGrid.obstacles.length; o++) {
          const obs = spatialGrid.obstacles[o];
          if (obs.isCar) continue;
          if (obs.minX <= checkMaxX && obs.maxX >= checkMinX && obs.minZ <= checkMaxZ && obs.maxZ >= checkMinZ) {
            buildingBlocked = true;
            break;
          }
        }

        if (buildingBlocked) {
          // Immediately despawn vehicle before penetrating building footprint or sidewalk curb
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
          continue;
        }
      }

      // Normal driving strictly on asphalt (Y = 0.01)
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.y = 0.01;
      v.mesh.position.set(v.x, 0.01, v.z);
      v.mesh.rotation.y = v.angle;
      v.life -= dt;

      // Distance despawn check: despawn smoothly upon exiting active chunk window (> 120m from PZ)
      if (pz) {
        const distSq = (v.x - pz.x) * (v.x - pz.x) + (v.z - pz.z) * (v.z - pz.z);
        if (distSq > 120.0 * 120.0 || v.life <= 0) {
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
          continue;
        }
      }

      if (!pz) continue;

      // 3. Continuous Collision with Patient Zero (Swept Line Segment vs Point)
      const prevX = v.x - v.vx * dt;
      const prevZ = v.z - v.vz * dt;
      
      let pzDistSq;
      const l2 = (v.x - prevX) ** 2 + (v.z - prevZ) ** 2;
      if (l2 === 0) {
        pzDistSq = (pz.x - v.x) ** 2 + (pz.z - v.z) ** 2;
      } else {
        let t = ((pz.x - prevX) * (v.x - prevX) + (pz.z - prevZ) * (v.z - prevZ)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = prevX + t * (v.x - prevX);
        const projZ = prevZ + t * (v.z - prevZ);
        pzDistSq = (pz.x - projX) ** 2 + (pz.z - projZ) ** 2;
      }

      // Skip collision check completely if Patient Zero is within the 1.5s Car Recovery window
      if (pz.carRecoveryTimer > 0) {
        // Patient Zero has recovery invulnerability: vehicle passes cleanly without pinning
        // Still check follower casualties below
      } else if (pzDistSq < 3.2 * 3.2) {
        if (entityManager && entityManager.isTitan && entityManager.titanVirusTimer > 0) {
          // TITAN VIRUS EXPLOSIVE DEMOLITION: Vehicle detonates into flying fireball & debris
          v.active = false;
          v.isCrushed = false;
          if (v.mesh) {
            v.mesh.visible = false;
          }
          if (entityManager.onCarSmashed) {
            entityManager.onCarSmashed(
              { x: v.x, z: v.z, color: v.color || 0xef4444 },
              pz.vx || v.vx || 1,
              pz.vz || v.vz || 0
            );
          } else {
            if (particles && particles.burstExplosion) particles.burstExplosion(v.x, v.z);
            if (audioSystem) {
              audioSystem.playExplosion();
              audioSystem.playCarCrash();
            }
            if (cameraController) cameraController.triggerShake(0.55, 0.7);
            if (showFloatingText) showFloatingText('💥 CAR DEMOLISHED! +500', v.x, v.z, 'fct-powerup');
          }
          if (entityManager) entityManager.score += 500;
          continue;
        } else {
          // NORMAL PATIENT ZERO COLLISION:
          // 1. Follower casualties: follower zombies absorb car impact first
          if (entityManager && entityManager.zombies && entityManager.zombies.length > 0) {
            const kills = Math.min(entityManager.zombies.length, 2 + Math.floor(Math.random() * 3));
            for (let k = 0; k < kills; k++) {
              if (entityManager.zombies.length > 0) {
                const z = entityManager.zombies.pop();
                if (particles) particles.burstDustCloud(z.x, z.z, 10);
              }
            }
            if (showFloatingText) showFloatingText('🚗 SCATTERED!', pz.x, pz.z, 'fct-danger');
          }

          // 2. Lateral Deflection Vector: Perpendicular impulse pushing player outward toward sidewalk/shoulder
          if (Math.abs(v.vz) >= Math.abs(v.vx)) {
            // Moving along North/South avenue: lateral impulse is on X axis
            const lateralSign = (pz.x !== v.x) ? Math.sign(pz.x - v.x) : (v.x >= 0 ? 1 : -1);
            pz.x += lateralSign * 4.0;
          } else {
            // Moving along East/West boulevard: lateral impulse is on Z axis
            const lateralSign = (pz.z !== v.z) ? Math.sign(pz.z - v.z) : (v.z >= 0 ? 1 : -1);
            pz.z += lateralSign * 4.0;
          }

          // 3. Resolve obstacle boundaries immediately so PZ is never launched into a building
          if (spatialGrid && spatialGrid.resolveObstacles) {
            spatialGrid.resolveObstacles(pz, pz.radius);
          }

          // 4. Grant 1.5 seconds Car Recovery window (flashing opacity & collision immunity)
          pz.carRecoveryTimer = 1.5;

          if (audioSystem) audioSystem.playTireScreech();
          if (cameraController) cameraController.triggerShake(0.35, 0.45);
          if (particles) particles.burstDustCloud(pz.x, pz.z, 16);
          if (showFloatingText) showFloatingText('🚗 DEFLECTED!', pz.x, pz.z, 'fct-danger');
        }
      }

      // 4. Collision with Follower Zombies (Scattering minions)
      if (entityManager && entityManager.zombies && entityManager.zombies.length > 0) {
        for (let zi = entityManager.zombies.length - 1; zi >= 0; zi--) {
          const z = entityManager.zombies[zi];
          const dzx = z.x - v.x;
          const dzz = z.z - v.z;
          if (dzx * dzx + dzz * dzz < 2.2 * 2.2) {
            // Scatter and kill minion
            entityManager.zombies.splice(zi, 1);
            if (particles) particles.burstDustCloud(z.x, z.z, 12);
            if (audioSystem && Math.random() > 0.5) audioSystem.playTireScreech();
          }
        }
      }
    }
  }

  dispose() {
    this.reset();
  }
}
