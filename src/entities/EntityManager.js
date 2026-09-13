import * as THREE from 'three';
import { BoidController } from '../ai/Boids.js';

export class EntityManager {
  constructor(arenaRadius = Infinity) {
    this.arenaRadius = arenaRadius;
    this.boidController = new BoidController({
      arenaRadius,
      separationRadius: 1.5,
      weightSeparation: 4.4,
      weightCohesion: 0.9
    });
    this.cityStreamer = null;

    // Entities
    this.patientZero = null;
    this.zombies = [];        // Swarm horde zombies following Patient Zero
    this.strayZombies = [];   // Roaming unaligned zombies wandering the city
    this.civilians = [];      // Living civilians (wander and flee)
    this.hazmats = [];        // Hazmat quarantine sprayer enemy units
    this.militaryUnits = [];  // Military rifleman sniper units
    this.gasClouds = [];      // E7: Static gas cloud zones that auto-infect civilians
    this.ambulances = [];     // Micro-objective static props

    // Dynamic gameplay progression
    this.gameTime = 0;
    this.panicLevel = 0;      // 0.0 (calm city, slower people) to 1.0 (full alert panic sprint)

    // G1: Combo Scoring System
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;      // Seconds until combo resets
    this._comboWindow = 3.0;  // Window to chain infections for combo

    // Callbacks for events (FX, audio, HUD)
    this.onInfection = null;          // (x, z, count)
    this.onZombieRecruited = null;    // (x, z, count)
    this.onCured = null;              // (x, z)
    this.onAvatarTransfer = null;     // (oldPos, newPos)
    this.onHazmatDestroyed = null;    // (x, z)
    this.onPanicEscalation = null;    // (msg)
    this.onComboInfection = null;     // G1: (combo, score, x, z)
    this.onMilestoneUnlock = null;    // G4: (milestone)
    this.onGameOver = null;           // (reason)
    this.onPatientZeroSprayed = null; // (dt, progress)
    this.onHazmatDamageDealt = null;  // (dt)
    this.onPropKnocked = null;        // (prop, hitDirX, hitDirZ)
    this.onExplosion = null;          // (x, z)
    this.onTitanActivated = null;     // ()
    this.onTitanExpired = null;       // ()
    this.onTitanFootstep = null;      // (x, z)
    this.onMilitarySnipe = null;      // (x, z)
    this.onMilitaryInfected = null;   // (x, z)
    this.onCameraShake = null;        // (intensity, duration)
    this.onStageChanged = null;       // (stage, stageName)

    // 4-Stage Progressive Difficulty Curve
    this.currentStage = 1;
    this.cureThreshold = 3.5; // Seconds of continuous spray exposure to cure

    // Arcade Power-ups & Threat Tracking
    this.speedSurgeTimer = 0;
    this.meatMagnetTimer = 0;
    this.titanVirusTimer = 0;
    this.isTitan = false;
    this.pzVisualScale = 1.0;
    this.titanFootstepTimer = 0;
    this.isSprayInvulnerable = false;
    this.bloaters = [];
    this.pzSprayTime = 0;
    this.particles = null;

    // Horde Loss & Alone Survival Countdown (@designer)
    this.hasHadHorde = false;         // Latches to true once player has grown a horde (>= 1 zombie)
    this.aloneTimer = 7.0;            // Countdown seconds when alone before game over
    this.maxAloneTime = 7.0;
    this.isAloneHunted = false;
    this.onAloneStateChanged = null;  // (isActive, remainingTime, maxTime)

    // Swarm Squeeze, Megaphone Warden & Contagion Slime
    this.wardens = [];                // Megaphone Warden civilian leaders
    this.slimeTrail = [];             // Decal breadcrumbs dropped by Patient Zero
    this.slimeDropTimer = 0;
    this.isSqueeze = false;           // Squeeze boid compression state
    this.onWardenSilenced = null;     // (x, z)
    this.onCivilianSlipped = null;    // (x, z)
    this.onMegaphoneChant = null;     // (x, z)
    this.onSqueezeChanged = null;     // (isSqueeze)
    
    // Formations
    this.currentFormation = 'swarm';
    this.movingTimer = 0;
    this.stationaryTimer = 0;

    // G4: Milestone tracking
    this._milestonesUnlocked = new Set();

    // Entity ID counter
    this._nextId = 1;
    this._lastPanicMilestone = 0;
  }

  init(civilianCount = 50) {
    this.zombies = [];
    this.strayZombies = [];
    this.civilians = [];
    this.hazmats = [];
    this.militaryUnits = [];
    this.gasClouds = [];
    this.bloaters = [];
    this.wardens = [];
    this.ambulances = [];
    this.slimeTrail = [];
    this.slimeDropTimer = 0;
    this.isSqueeze = false;
    this.speedSurgeTimer = 0;
    this.meatMagnetTimer = 0;
    this.titanVirusTimer = 0;
    this.isTitan = false;
    this.pzVisualScale = 1.0;
    this.titanFootstepTimer = 0;
    this.isSprayInvulnerable = false;
    this.pzSprayTime = 0;
    this.gameTime = 0;
    this.panicLevel = 0;
    this._lastPanicMilestone = 0;
    this.score = 0;
    this.combo = 0;
    this._milestonesUnlocked = new Set();
    this._spawnedCells = new Set();

    // Reset alone state
    this.hasHadHorde = false;
    this.aloneTimer = this.maxAloneTime;
    this.isAloneHunted = false;

    // Create Patient Zero at central intersection
    this.patientZero = {
      id: this._nextId++,
      type: 'player',
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      radius: 0.55,
      speed: 7.5,
      angle: 0,
      walkPhase: 0,
      isFrenzy: false,
      frenzyTimer: 0,
      frenzyCooldown: 0,
      carRecoveryTimer: 0,
      health: 100,
    };

    // 4-Stage Progressive Difficulty: Initial stage is Outbreak Dawn (0:00 - 1:00)
    this.currentStage = 1;
    this.cureThreshold = 3.5;

    // Spawn wandering civilians
    for (let i = 0; i < civilianCount; i++) {
      this.spawnCivilian();
    }

    // Spawn 16 wandering stray zombies roaming city streets & alleys
    for (let i = 0; i < 16; i++) {
      this.spawnStrayZombie();
    }

    // Stage 1 (0:00 - 1:00): 0 military riflemen at launch (deploy in Stage 3)
    this.militaryUnits = [];

    // Pre-spawn Megaphone Warden rallying civilians near initial pathway
    this.spawnWarden(-8, -24);
  }

  /**
   * Returns all active zombies (horde zombies + roaming stray zombies) for rendering.
   */
  getAllZombies() {
    return this.zombies.concat(this.strayZombies);
  }

  _getRandomStreetPosition(minDist = 35, maxDist = 90) {
    if (this.cityStreamer) {
      const px = this.patientZero ? this.patientZero.x : 0;
      const pz = this.patientZero ? this.patientZero.z : 0;
      return this.cityStreamer.getRandomStreetPosition(px, pz, minDist, maxDist);
    }

    let x, z;
    const roll = Math.random();
    if (roll < 0.45) {
      if (Math.random() < 0.5) {
        x = (Math.random() - 0.5) * 8.0;
        z = (Math.random() - 0.5) * 60.0;
      } else {
        z = (Math.random() - 0.5) * 8.0;
        x = (Math.random() - 0.5) * 60.0;
      }
    } else if (roll < 0.75) {
      const street = Math.random() < 0.5 ? 28 : -28;
      if (Math.random() < 0.5) {
        x = street + (Math.random() - 0.5) * 5.0;
        z = (Math.random() - 0.5) * 60.0;
      } else {
        z = street + (Math.random() - 0.5) * 5.0;
        x = (Math.random() - 0.5) * 60.0;
      }
    } else {
      const parkSign = Math.random() < 0.5 ? -1 : 1;
      x = parkSign * 24 + (Math.random() - 0.5) * 8.0;
      z = -parkSign * 15 + (Math.random() - 0.5) * 12.0;
    }
    return { x, z };
  }

  spawnCivilian(x, z) {
    if (x === undefined || z === undefined) {
      const pos = this._getRandomStreetPosition();
      x = pos.x;
      z = pos.z;
    }

    // Speed scales dynamically with current panic level
    const wanderSpeed = 1.6 + this.panicLevel * 1.0;
    const fleeSpeed = 3.4 + this.panicLevel * 2.8;

    const civilian = {
      id: this._nextId++,
      type: 'civilian',
      x,
      z,
      vx: 0,
      vz: 0,
      radius: 0.5,
      speed: wanderSpeed,
      fleeSpeed: fleeSpeed,
      wanderAngle: Math.random() * Math.PI * 2,
      fleeTimer: 0,
      walkPhase: Math.random() * 10.0,
      colorVariation: Math.floor(Math.random() * 5),
    };

    this.civilians.push(civilian);
    return civilian;
  }

  spawnStrayZombie(x, z) {
    if (x === undefined || z === undefined) {
      const pos = this._getRandomStreetPosition();
      x = pos.x;
      z = pos.z;
    }

    const stray = {
      id: this._nextId++,
      type: 'stray_zombie',
      x,
      z,
      vx: 0,
      vz: 0,
      radius: 0.5,
      speed: 1.9,
      wanderAngle: Math.random() * Math.PI * 2,
      walkPhase: Math.random() * 10.0,
      colorVariation: Math.floor(Math.random() * 5),
      cureExposure: 0,
      convertAnim: 0,
      flail: 0,
    };

    this.strayZombies.push(stray);
    return stray;
  }

  spawnHazmat(x, z, heliDrop = false) {
    if (x === undefined || z === undefined) {
      if (this.cityStreamer || !isFinite(this.arenaRadius)) {
        const pos = this._getRandomStreetPosition(60, 95);
        x = pos.x;
        z = pos.z;
      } else {
        const isX = Math.random() < 0.5;
        const sign = Math.random() < 0.5 ? 1 : -1;
        if (isX) {
          x = sign * (this.arenaRadius - 6.0);
          z = (Math.random() - 0.5) * 4.0;
        } else {
          z = sign * (this.arenaRadius - 6.0);
          x = (Math.random() - 0.5) * 4.0;
        }
      }
    }

    // G3: Hazmat helicopter drop — spawn high, animate descent
    const dropY = heliDrop ? 18.0 : 0.0;

    const hazmat = {
      id: this._nextId++,
      type: 'hazmat',
      x,
      z,
      vx: 0,
      vz: 0,
      radius: 0.65,
      speed: 2.3,
      angle: 0,
      walkPhase: 0,
      coneLength: 10.0,
      coneAngleRad: 0.85,
      sprayActive: true,
      health: 100,
      dropY,           // G3: Current Y height (animates to 0)
      isDropping: heliDrop,
    };

    this.hazmats.push(hazmat);
    return hazmat;
  }

  /**
   * Spawn a paired Military Rifleman sniper unit on streets or choke points.
   */
  spawnMilitary(x, z) {
    if (x === undefined || z === undefined) {
      if (this.cityStreamer || !isFinite(this.arenaRadius)) {
        const pos = this._getRandomStreetPosition(40, 80);
        x = pos.x;
        z = pos.z;
      } else {
        x = (Math.random() - 0.5) * 30;
        z = (Math.random() - 0.5) * 30;
      }
    }

    const spawned = [];
    // Spawn in tactical pairs
    for (let s = 0; s < 2; s++) {
      const offsetX = s === 0 ? 0 : (Math.random() - 0.5) * 3.2;
      const offsetZ = s === 0 ? 0 : (Math.random() - 0.5) * 3.2;
      const soldier = {
        id: this._nextId++,
        type: 'military',
        x: x + offsetX,
        z: z + offsetZ,
        vx: 0,
        vz: 0,
        radius: 0.65,
        speed: 2.1,
        angle: Math.random() * Math.PI * 2,
        walkPhase: Math.random() * 10,
        state: 'patrol', // 'patrol', 'aiming', 'cooldown'
        patrolTimer: 2.0 + Math.random() * 3.0,
        patrolAngle: Math.random() * Math.PI * 2,
        targetPos: null,
        targetEntity: null,
        aimTimer: 0,
        aimThreshold: 1.8,
        cooldownTimer: 0,
        tracerShot: null,
      };
      this.militaryUnits.push(soldier);
      spawned.push(soldier);
    }
    return spawned;
  }

  /**
   * E7: Spawn a gas cloud hazard zone.
   */
  spawnGasCloud(x, z) {
    if (x === undefined || z === undefined) {
      const pos = this._getRandomStreetPosition(30, 80);
      x = pos.x;
      z = pos.z;
    }
    this.gasClouds.push({
      id: this._nextId++,
      x, z,
      radius: 4.5,
      infectionRate: 0.18, // exposure per second inside cloud
      lifetime: 20 + Math.random() * 15,
    });
  }

  /**
   * Toggle or set Swarm Squeeze (fluid boid compression)
   */
  setSqueeze(isSqueeze) {
    this.isSqueeze = !!isSqueeze;
    if (this.onSqueezeChanged) {
      this.onSqueezeChanged(this.isSqueeze);
    }
  }

  /**
   * Spawn a Megaphone Warden civilian archetype with high speed and rallying aura.
   */
  spawnWarden(x, z) {
    if (x === undefined || z === undefined) {
      if (this.cityStreamer || !isFinite(this.arenaRadius)) {
        const pos = this._getRandomStreetPosition(35, 75);
        x = pos.x;
        z = pos.z;
      } else {
        x = (Math.random() - 0.5) * 40;
        z = (Math.random() - 0.5) * 40;
      }
    }

    const warden = {
      id: this._nextId++,
      type: 'warden',
      x,
      z,
      vx: 0,
      vz: 0,
      radius: 0.65,
      speed: 4.8, // Brisk runner (4.8 m/s)
      angle: Math.random() * Math.PI * 2,
      walkPhase: Math.random() * 10,
      chantTimer: 0,
      fearFreezeTimer: 0,
      hidden: false,
    };
    this.wardens.push(warden);
    return warden;
  }

  /**
   * Recruits a stray wandering zombie into Patient Zero's active swarm horde.
   */
  recruitStrayZombie(strayIndex) {
    const stray = this.strayZombies[strayIndex];
    if (!stray) return;

    this.strayZombies.splice(strayIndex, 1);

    const zombie = {
      id: stray.id,
      type: 'zombie',
      x: stray.x,
      z: stray.z,
      vx: stray.vx * 0.5,
      vz: stray.vz * 0.5,
      radius: 0.5,
      walkPhase: stray.walkPhase,
      convertAnim: 1.0, // Visual green burst flash
      flail: 0.6,
      colorVariation: stray.colorVariation,
      cureExposure: 0,
    };

    this.zombies.push(zombie);

    if (this.onZombieRecruited) {
      this.onZombieRecruited(zombie.x, zombie.z, this.zombies.length + 1);
    } else if (this.onInfection) {
      this.onInfection(zombie.x, zombie.z, this.zombies.length + 1);
    }
  }

  /**
   * Converts a healthy civilian into a zombie and joins the swarm horde.
   * G1: Also increments combo + score.
   */
  convertCivilianToZombie(civilianIndex) {
    const civ = this.civilians[civilianIndex];
    if (!civ) return;

    this.civilians.splice(civilianIndex, 1);

    const zombie = {
      id: civ.id,
      type: 'zombie',
      x: civ.x,
      z: civ.z,
      vx: civ.vx * 0.4,
      vz: civ.vz * 0.4,
      radius: 0.5,
      walkPhase: civ.walkPhase,
      convertAnim: 1.0,
      flail: 0.8,
      colorVariation: civ.colorVariation,
      cureExposure: 0,
      sprayExposure: 0,
    };

    this.zombies.push(zombie);

    // G1: Combo scoring
    this.comboTimer = this._comboWindow;
    this.combo++;
    const multiplier = Math.max(1, this.combo);
    const points = 10 * multiplier;
    this.score += points;

    // Emit 6 lime-green cartoon droplets
    if (this.particles && this.particles.burstInfectionDroplets) {
      this.particles.burstInfectionDroplets(zombie.x, zombie.z, 6);
    }

    if (this.onComboInfection) {
      this.onComboInfection(this.combo, this.score, zombie.x, zombie.z);
    }
    if (this.onInfection) {
      this.onInfection(zombie.x, zombie.z, this.zombies.length + 1);
    }
  }

  /**
   * Converts a Megaphone Warden into a zombie upon infection.
   * Rewards +150 score, triggers +WARDEN SILENCED! floating combat text,
   * and causes all rallied followers / nearby civilians to freeze in fear for 1.5s!
   */
  convertWardenToZombie(wardenIndex) {
    const warden = this.wardens[wardenIndex];
    if (!warden) return;

    this.wardens.splice(wardenIndex, 1);

    const zombie = {
      id: warden.id,
      type: 'zombie',
      x: warden.x,
      z: warden.z,
      vx: warden.vx * 0.4,
      vz: warden.vz * 0.4,
      radius: 0.5,
      walkPhase: warden.walkPhase,
      convertAnim: 1.0,
      flail: 1.0,
      colorVariation: 2,
      cureExposure: 0,
      sprayExposure: 0,
    };
    this.zombies.push(zombie);

    // Reward: +150 score
    this.score += 150;
    this.comboTimer = this._comboWindow;
    this.combo += 2;

    // Freeze all nearby civilians / rallied followers in fear for 1.5s
    for (let i = 0; i < this.civilians.length; i++) {
      const c = this.civilians[i];
      const dist = Math.hypot(c.x - warden.x, c.z - warden.z);
      if (dist < 20.0) {
        c.fearFreezeTimer = 1.5;
        c.vx = 0;
        c.vz = 0;
        c.cureFlail = 1.2;
      }
    }

    if (this.particles && this.particles.burstInfection) {
      this.particles.burstInfection(warden.x, warden.z);
    }

    if (this.onWardenSilenced) {
      this.onWardenSilenced(warden.x, warden.z);
    }
    if (this.onInfection) {
      this.onInfection(zombie.x, zombie.z, this.zombies.length + 1);
    }
  }

  cureZombieToCivilian(zombieIndex) {
    const zombie = this.zombies[zombieIndex];
    if (!zombie) return;

    this.zombies.splice(zombieIndex, 1);

    const civ = {
      id: zombie.id,
      type: 'civilian',
      x: zombie.x,
      z: zombie.z,
      vx: -zombie.vx * 0.5,
      vz: -zombie.vz * 0.5,
      radius: 0.5,
      speed: 1.8 + this.panicLevel * 1.0,
      fleeSpeed: 3.6 + this.panicLevel * 2.6,
      wanderAngle: Math.random() * Math.PI * 2,
      fleeTimer: 3.0,
      walkPhase: zombie.walkPhase,
      colorVariation: zombie.colorVariation,
      cureFlail: 1.2,  // G7: Stagger animation on newly-cured civilians
      cureImmunity: 2.5, // Temporary chemical immunity from immediate re-infection
    };

    this.civilians.push(civ);

    if (this.onCured) {
      this.onCured(civ.x, civ.z);
    }
  }

  transferAvatar(swipeDirX, swipeDirZ) {
    if (this.zombies.length === 0) return false;

    const sLen = Math.hypot(swipeDirX, swipeDirZ);
    if (sLen < 0.001) return false;
    const ndx = swipeDirX / sLen;
    const ndz = swipeDirZ / sLen;

    const pz = this.patientZero;
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      const relX = z.x - pz.x;
      const relZ = z.z - pz.z;
      const proj = relX * ndx + relZ * ndz;
      const dist = Math.hypot(relX, relZ);
      const score = proj * 1.5 + dist;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) return false;

    const targetZombie = this.zombies[bestIndex];
    const oldPzPos = { x: pz.x, z: pz.z };
    const newPzPos = { x: targetZombie.x, z: targetZombie.z };

    pz.x = targetZombie.x;
    pz.z = targetZombie.z;
    pz.vx = targetZombie.vx;
    pz.vz = targetZombie.vz;

    targetZombie.x = oldPzPos.x;
    targetZombie.z = oldPzPos.z;
    targetZombie.vx = 0;
    targetZombie.vz = 0;

    if (this.onAvatarTransfer) {
      this.onAvatarTransfer(oldPzPos, newPzPos);
    }

    return true;
  }

  triggerFrenzy() {
    const pz = this.patientZero;
    if (!pz || pz.frenzyCooldown > 0) return false;

    pz.isFrenzy = true;
    pz.frenzyTimer = 2.0;
    pz.frenzyCooldown = 4.5;
    return true;
  }

  activatePowerup(typeId) {
    if (typeId === 'speed_surge') {
      this.speedSurgeTimer = 6.0;
      this.isSprayInvulnerable = true;
      if (this.onPanicEscalation) this.onPanicEscalation('⚡ SPEED SURGE: +60% SPEED & SPRAY SHIELD!');
    } else if (typeId === 'meat_magnet') {
      this.meatMagnetTimer = 8.0;
      if (this.onPanicEscalation) this.onPanicEscalation('🧲 MEAT MAGNET: TRIPLE REACH & VACUUM!');
    } else if (typeId === 'bloater_bomb') {
      this.spawnBloaterBomb();
      if (this.onPanicEscalation) this.onPanicEscalation('💥 BLOATER BOMB DEPLOYED!');
    } else if (typeId === 'titan_virus') {
      this.titanVirusTimer = 15.0;
      this.isTitan = true;
      this.isSprayInvulnerable = true;
      if (this.particles && this.particles.burstTitanPuff && this.patientZero) {
        this.particles.burstTitanPuff(this.patientZero.x, this.patientZero.z);
      }
      if (this.onTitanActivated) this.onTitanActivated();
      if (this.onPanicEscalation) this.onPanicEscalation('☣️ TITAN VIRUS ACTIVATED: 3X SCALE & TOTAL CONVERSION!');
    }
  }

  _createBloaterMesh() {
    const group = new THREE.Group();
    const bodyGeom = new THREE.SphereGeometry(0.85, 12, 10);
    const bodyMat = new THREE.MeshToonMaterial({
      color: 0xff5500,
      emissive: 0xff2200,
      emissiveIntensity: 0.6,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.95;
    group.add(body);

    const fuseGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.4, 8);
    fuseGeom.translate(0, 1.85, 0);
    const fuseMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const fuse = new THREE.Mesh(fuseGeom, fuseMat);
    group.add(fuse);

    return group;
  }

  spawnBloaterBomb() {
    if (!this.patientZero) return;
    const pz = this.patientZero;
    const angle = pz.angle || 0;
    const bx = pz.x + Math.sin(angle) * 2.5;
    const bz = pz.z + Math.cos(angle) * 2.5;

    const mesh = this._createBloaterMesh();
    mesh.position.set(bx, 0.1, bz);
    if (this.scene) {
      this.scene.add(mesh);
    }

    this.bloaters.push({
      id: this._nextId++,
      type: 'bloater',
      x: bx,
      z: bz,
      vx: 0,
      vz: 0,
      radius: 0.9,
      speed: 6.8,
      fuseTimer: 6.0,
      walkPhase: 0,
      angle,
      mesh,
    });
  }

  update(dt, inputVector, spatialGrid, cityStreamer = null) {
    if (!this.patientZero) return;
    if (cityStreamer) this.cityStreamer = cityStreamer;

    const pz = this.patientZero;
    const isBounded = isFinite(this.arenaRadius) && this.arenaRadius > 0;
    const maxBound = isBounded ? this.arenaRadius - pz.radius : Infinity;

    // 0. Update Patient Zero Car Recovery Window (1.5s invulnerability & lateral deflection)
    if (pz.carRecoveryTimer > 0) {
      pz.carRecoveryTimer = Math.max(0, pz.carRecoveryTimer - dt);
    }

    // 1. Dynamic Progressive Difficulty Escalation (0:00 to 5:00+)
    this.gameTime += dt;

    let newStage = 1;
    let stageName = 'STAGE 1: OUTBREAK DAWN';
    if (this.gameTime < 60) {
      newStage = 1;
      stageName = 'STAGE 1: OUTBREAK DAWN';
      this.cureThreshold = 3.5;
    } else if (this.gameTime < 150) {
      newStage = 2;
      stageName = 'STAGE 2: QUARANTINE ALERT';
      this.cureThreshold = 2.2;
    } else if (this.gameTime < 240) {
      newStage = 3;
      stageName = 'STAGE 3: MILITARY ESCALATION';
      this.cureThreshold = 1.4;
    } else {
      newStage = 4;
      stageName = 'STAGE 4: MARTIAL LAW';
      this.cureThreshold = 0.8;
    }

    if (this.currentStage !== newStage) {
      this.currentStage = newStage;
      if (this.onStageChanged) {
        this.onStageChanged(newStage, stageName);
      }
      if (newStage === 3 && this.militaryUnits.length === 0) {
        const px = pz.x;
        const pzZ = pz.z;
        this.spawnMilitary(px - 6, pzZ - 24);
        this.spawnMilitary(px + 6, pzZ - 36);
      }
    }

    // Panic starts at 0.0 (citizens relaxed and slower) and smoothly scales over 90s + horde size
    this.panicLevel = Math.min(1.0, this.gameTime / 90.0 + (this.zombies.length / 40.0) * 0.4);

    // Notify milestone when panic reaches notable tiers
    if (this.panicLevel >= 0.5 && this._lastPanicMilestone < 1) {
      this._lastPanicMilestone = 1;
      if (this.onPanicEscalation) this.onPanicEscalation('PANIC RISING - CITIZENS RUNNING FASTER!');
    } else if (this.panicLevel >= 0.85 && this._lastPanicMilestone < 2) {
      this._lastPanicMilestone = 2;
      if (this.onPanicEscalation) this.onPanicEscalation('MAXIMUM CITY PANIC - ALL OUT SPRINT!');
    }

    // G1: Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    // G4: Horde milestone unlocks
    const hordeNow = this.zombies.length + 1;
    for (const milestone of [10, 25, 50]) {
      if (hordeNow >= milestone && !this._milestonesUnlocked.has(milestone)) {
        this._milestonesUnlocked.add(milestone);
        if (this.onMilestoneUnlock) this.onMilestoneUnlock(milestone);
      }
    }

    // Civilian speeds calibrated to active difficulty stage
    let currentWanderSpeed = 1.2;
    let currentFleeSpeed = 1.8;
    if (this.currentStage === 1) {
      currentWanderSpeed = 1.2;
      currentFleeSpeed = 1.8;
    } else if (this.currentStage === 2) {
      currentWanderSpeed = 1.8;
      currentFleeSpeed = 3.2;
    } else if (this.currentStage === 3) {
      currentWanderSpeed = 2.2;
      currentFleeSpeed = 4.2;
    } else {
      currentWanderSpeed = 2.6;
      currentFleeSpeed = 5.5;
    }
    const currentThreatRadius = 4.5 + this.panicLevel * 4.0;

    // 2. Powerup Timers & Buffs
    if (this.speedSurgeTimer > 0) {
      this.speedSurgeTimer -= dt;
    }
    if (this.titanVirusTimer > 0) {
      this.titanVirusTimer -= dt;
    }
    this.isSprayInvulnerable = (this.speedSurgeTimer > 0) || (this.titanVirusTimer > 0);

    if (this.meatMagnetTimer > 0) {
      this.meatMagnetTimer -= dt;
    }

    // Horde Loss & Alone Survival Countdown (@designer)
    // When player had a horde and lost all zombies, an intense countdown triggers
    if (this.zombies.length > 0) {
      this.hasHadHorde = true;
      this.aloneTimer = this.maxAloneTime;
      if (this.isAloneHunted) {
        this.isAloneHunted = false;
        if (this.onAloneStateChanged) {
          this.onAloneStateChanged(false, 0, this.maxAloneTime);
        }
      }
    } else if (this.hasHadHorde) {
      if (!this.isAloneHunted) {
        this.isAloneHunted = true;
      }
      this.aloneTimer = Math.max(0, this.aloneTimer - dt);
      if (this.onAloneStateChanged) {
        this.onAloneStateChanged(true, this.aloneTimer, this.maxAloneTime);
      }
      if (this.aloneTimer <= 0) {
        if (this.onGameOver) {
          this.onGameOver('HORDE_WIPED_OUT');
        }
      }
    }

    // Frenzy Timers
    if (pz.frenzyTimer > 0) {
      pz.frenzyTimer -= dt;
      if (pz.frenzyTimer <= 0) pz.isFrenzy = false;
    }
    if (pz.frenzyCooldown > 0) {
      pz.frenzyCooldown -= dt;
    }

    // 3. Patient Zero Movement
    const inputMag = Math.hypot(inputVector.x, inputVector.z);

    // Formations Logic
    if (inputMag > 0.05) {
      this.stationaryTimer = 0;
      this.movingTimer = (this.movingTimer || 0) + dt;
      if (this.movingTimer > 2.0) {
        this.currentFormation = 'spearhead';
      } else {
        this.currentFormation = 'swarm';
      }
    } else {
      this.movingTimer = 0;
      this.stationaryTimer = (this.stationaryTimer || 0) + dt;
      if (this.stationaryTimer > 1.5) {
        this.currentFormation = 'shield_wall';
      } else {
        this.currentFormation = 'swarm';
      }
    }

    let speedMult = 1.0;
    if (pz.isFrenzy) speedMult *= 1.7;
    if (this.speedSurgeTimer > 0) speedMult *= 1.6; // +60% move speed from Speed Surge
    if (this.isTitan) speedMult *= 1.25; // Colossal heavy stride
    if (this.currentFormation === 'spearhead') speedMult *= 1.15; // +15% movement speed while compressed in spearhead formation
    if (pz.isSpraySlowed && !this.isSprayInvulnerable) speedMult *= 0.5; // 50% slow from spray

    const currentSpeed = pz.speed * speedMult;

    if (inputMag > 0.05) {
      const nx = inputVector.x / inputMag;
      const nz = inputVector.z / inputMag;
      pz.vx = nx * currentSpeed * Math.min(inputMag, 1.0);
      pz.vz = nz * currentSpeed * Math.min(inputMag, 1.0);
      pz.angle = Math.atan2(inputVector.x, inputVector.z);
    } else {
      pz.vx *= Math.pow(0.01, dt);
      pz.vz *= Math.pow(0.01, dt);
    }

    pz.x += pz.vx * dt;
    pz.z += pz.vz * dt;

    // Natural stride cadence (biomechanically natural ~2.8 rad per meter of travel)
    const pzActualSpeed = Math.hypot(pz.vx, pz.vz);
    pz.walkPhase += (pzActualSpeed > 0.1 ? pzActualSpeed * dt * 2.8 : dt * 1.2);

    // Contagion Slime Trail: Patient Zero drops green slime breadcrumb decals on road
    if (pzActualSpeed > 0.6) {
      this.slimeDropTimer = (this.slimeDropTimer || 0) - dt;
      if (this.slimeDropTimer <= 0) {
        this.slimeDropTimer = 0.12;
        if (!this.slimeTrail) this.slimeTrail = [];
        this.slimeTrail.push({
          x: pz.x + (Math.random() - 0.5) * 0.25,
          z: pz.z + (Math.random() - 0.5) * 0.25,
          life: 4.0,
          maxLife: 4.0,
          scale: 0.75 + Math.random() * 0.35,
          rot: Math.random() * Math.PI * 2,
        });
        if (this.slimeTrail.length > 140) {
          this.slimeTrail.shift();
        }
      }
    }

    // Decay active slime trail
    if (this.slimeTrail && this.slimeTrail.length > 0) {
      for (let i = this.slimeTrail.length - 1; i >= 0; i--) {
        const s = this.slimeTrail[i];
        s.life -= dt;
        if (s.life <= 0) {
          this.slimeTrail.splice(i, 1);
        }
      }
    }

    // Titan Dynamic Scaling & Stomp Mechanics
    if (this.titanVirusTimer > 0) {
      this.isTitan = true;
      this.pzVisualScale += (3.0 - this.pzVisualScale) * (dt * 5.5);

      // Footstep ground shockwaves every 0.35s while walking
      if (pzActualSpeed > 0.35) {
        this.titanFootstepTimer += dt;
        if (this.titanFootstepTimer >= 0.35) {
          this.titanFootstepTimer = 0;
          this._triggerTitanFootstep(pz.x, pz.z);
        }
      }

      // Total conversion stomp (3.8m radius instant infection)
      this._performTitanStomp(pz.x, pz.z);
    } else if (this.isTitan) {
      this.pzVisualScale += (1.0 - this.pzVisualScale) * (dt * 5.5);
      if (Math.abs(this.pzVisualScale - 1.0) < 0.05) {
        this.pzVisualScale = 1.0;
        this.isTitan = false;
        if (this.particles && this.particles.burstTitanPuff) {
          this.particles.burstTitanPuff(pz.x, pz.z);
        }
        if (this.onTitanExpired) this.onTitanExpired();
      }
    }

    // Arena boundary clamp (only if arena is bounded)
    if (isBounded) {
      const pzDist = Math.hypot(pz.x, pz.z);
      if (pzDist > maxBound) {
        pz.x = (pz.x / pzDist) * maxBound;
        pz.z = (pz.z / pzDist) * maxBound;
      }
    }

    // Resolve building obstacle collisions for Patient Zero
    const pzPrevX = pz.x - pz.vx * dt;
    const pzPrevZ = pz.z - pz.vz * dt;
    spatialGrid.resolveObstacles(pz, pz.radius * (this.isTitan ? 1.8 : 1.0), true, pzPrevX, pzPrevZ);

    // 4. Populate Spatial Grid
    spatialGrid.clear();
    spatialGrid.insert(pz);
    for (let i = 0; i < this.zombies.length; i++) {
      spatialGrid.insert(this.zombies[i]);
    }
    for (let i = 0; i < this.strayZombies.length; i++) {
      spatialGrid.insert(this.strayZombies[i]);
    }
    for (let i = 0; i < this.civilians.length; i++) {
      spatialGrid.insert(this.civilians[i]);
    }
    for (let i = 0; i < this.hazmats.length; i++) {
      spatialGrid.insert(this.hazmats[i]);
    }
    for (let i = 0; i < this.militaryUnits.length; i++) {
      spatialGrid.insert(this.militaryUnits[i]);
    }
    for (let i = 0; i < this.wardens.length; i++) {
      spatialGrid.insert(this.wardens[i]);
    }

    // 5. Update Swarm Horde Zombies (Follow Patient Zero & maintain cohesion)
    // Spearhead: Emit white cartoon wind slipstream lines along flanks
    if (this.currentFormation === 'spearhead' && this.particles && pzActualSpeed > 1.2 && Math.random() < 0.65) {
      const pzDirX = pz.vx / pzActualSpeed;
      const pzDirZ = pz.vz / pzActualSpeed;
      this.particles.burstSlipstream(pz.x, 0.4, pz.z, pzDirX, pzDirZ);
    }

    // P1: Boid LOD — zombies >50m use cheap linear seek instead of full Boids
    const LOD_DIST_SQ = 50.0 * 50.0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      const distToPzSq = (pz.x - z.x) * (pz.x - z.x) + (pz.z - z.z) * (pz.z - z.z);
      let steerX, steerZ;
      if (distToPzSq > LOD_DIST_SQ) {
        // Cheap linear seek toward player
        const dLen = Math.sqrt(distToPzSq) || 1;
        steerX = (pz.x - z.x) / dLen * 3.0;
        steerZ = (pz.z - z.z) / dLen * 3.0;
      } else {
        const result = this.boidController.computeSteering(z, spatialGrid, pz, dt, pz.isFrenzy, this.currentFormation);
        steerX = result.steerX;
        steerZ = result.steerZ;
      }

      z.vx += steerX * dt * 6.0;
      z.vz += steerZ * dt * 6.0;

      // Dynamic catch-up speed limit so zombies NEVER fall behind Patient Zero
      const distToPz = Math.hypot(pz.x - z.x, pz.z - z.z);
      let zSpeedLimit = pz.isFrenzy ? 12.0 : (this.currentFormation === 'spearhead' ? 9.1 : 7.6);
      if (distToPz > 3.5) {
        // Accelerate up to 11.5 m/s when catching up to the pack
        zSpeedLimit += Math.min(4.0, (distToPz - 3.5) * 0.7);
      }

      const curSpeed = Math.hypot(z.vx, z.vz);
      if (curSpeed > zSpeedLimit) {
        z.vx = (z.vx / curSpeed) * zSpeedLimit;
        z.vz = (z.vz / curSpeed) * zSpeedLimit;
      }

      z.x += z.vx * dt;
      z.z += z.vz * dt;

      // Natural zombie walk phase cadence
      z.walkPhase += (curSpeed > 0.1 ? curSpeed * dt * 2.4 : dt * 1.0);

      // Decrement conversion flail timer
      if (z.flail > 0) {
        z.flail = Math.max(0, z.flail - dt * 1.5);
      }

      // Cool down cure exposure if not currently being sprayed
      if (z.cureExposure > 0) {
        z.cureExposure = Math.max(0, z.cureExposure - dt * 0.35);
      }

      // Boundary clamp
      if (isBounded) {
        const zDist = Math.hypot(z.x, z.z);
        if (zDist > maxBound) {
          z.x = (z.x / zDist) * maxBound;
          z.z = (z.z / zDist) * maxBound;
        }
      }

      // Resolve building collisions with a slight cartoony 'boing' bounce
      const zPrevX = z.x - z.vx * dt;
      const zPrevZ = z.z - z.vz * dt;
      const collision = spatialGrid.resolveObstacles(z, z.radius, true, zPrevX, zPrevZ);
      if (collision) {
        // Slight bouncy repulsion
        z.vx += collision.nx * 2.5;
        z.vz += collision.nz * 2.5;
      }

      if (z.convertAnim > 0) {
        z.convertAnim = Math.max(0, z.convertAnim - dt * 4.0);
      }
      if (z.sprayExposure > 0) {
        z.sprayExposure = Math.max(0, z.sprayExposure - dt * 0.8);
      }
    }

    // 6. Update Stray Roaming Zombies (Wandering city alleys awaiting recruitment)
    for (let i = 0; i < this.strayZombies.length; i++) {
      const s = this.strayZombies[i];
      s.wanderAngle += (Math.random() - 0.5) * 1.8 * dt;
      s.vx = Math.cos(s.wanderAngle) * s.speed;
      s.vz = Math.sin(s.wanderAngle) * s.speed;

      s.x += s.vx * dt;
      s.z += s.vz * dt;

      const sSpeed = Math.hypot(s.vx, s.vz);
      s.walkPhase += (sSpeed > 0.1 ? sSpeed * dt * 2.4 : dt * 1.0);

      if (isBounded) {
        const sDist = Math.hypot(s.x, s.z);
        if (sDist > maxBound) {
          s.x = (s.x / sDist) * maxBound;
          s.z = (s.z / sDist) * maxBound;
          s.wanderAngle = Math.atan2(-s.z, -s.x) + (Math.random() - 0.5) * 0.5;
        }
      }

      const sPrevX = s.x - s.vx * dt;
      const sPrevZ = s.z - s.vz * dt;
      spatialGrid.resolveObstacles(s, s.radius, true, sPrevX, sPrevZ);
    }

    // 7. Update Civilians (Speed scales with panic, natural gait)
    for (let i = 0; i < this.civilians.length; i++) {
      const c = this.civilians[i];
      c.speed = currentWanderSpeed;
      c.fleeSpeed = currentFleeSpeed;

      // Fear freeze check (triggered when a nearby Warden is silenced)
      if (c.fearFreezeTimer > 0) {
        c.fearFreezeTimer = Math.max(0, c.fearFreezeTimer - dt);
        c.vx = 0;
        c.vz = 0;
        c.cureFlail = 1.0;
        c.walkPhase += dt * 3.0;
        continue;
      }

      // Slime slip stumble check
      if (c.slipTimer > 0) {
        c.slipTimer = Math.max(0, c.slipTimer - dt);
        c.vx *= 0.2;
        c.vz *= 0.2;
        c.cureFlail = 1.2;
        c.walkPhase += dt * 4.0;
        continue;
      }

      if (c.slipImmunity > 0) {
        c.slipImmunity = Math.max(0, c.slipImmunity - dt);
      }

      // G7: Cure stagger decay
      if (c.cureFlail > 0) {
        c.cureFlail = Math.max(0, c.cureFlail - dt * 1.8);
      }

      // G5: Civilian hiding — at high panic, civilians near zombies hide temporarily
      if (c.hideTimer > 0) {
        c.hideTimer -= dt;
        c.hidden = true;
        continue; // Skip movement & rendering for hidden civilians
      } else if (c.hidden) {
        c.hidden = false;
        // Re-emerge slightly offset from their hiding spot
        c.x += (Math.random() - 0.5) * 2;
        c.z += (Math.random() - 0.5) * 2;
      }

      let fleeX = 0;
      let fleeZ = 0;
      let threatCount = 0;

      // Flee awareness radius expands with panicLevel
      spatialGrid.forEachNearby(c.x, c.z, currentThreatRadius, (threat, distSq) => {
        if (threat.type !== 'zombie' && threat.type !== 'player' && threat.type !== 'stray_zombie') return false;
        const d = Math.sqrt(distSq);
        if (d > 0.001) {
          fleeX += (c.x - threat.x) / d;
          fleeZ += (c.z - threat.z) / d;
          threatCount++;
        }
        return false;
      });

      if (threatCount > 0) {
        c.fleeTimer = 1.2;
        const fLen = Math.hypot(fleeX, fleeZ) || 1.0;
        c.vx = (fleeX / fLen) * c.fleeSpeed;
        c.vz = (fleeZ / fLen) * c.fleeSpeed;

        // G5: High-panic civilians may duck into buildings
        if (this.panicLevel >= 0.6 && Math.random() < dt * 0.04) {
          c.hideTimer = 8.0 + Math.random() * 8.0;
          c.hidden = true;
          c.vx = 0; c.vz = 0;
          continue;
        }
      } else {
        c.wanderAngle += (Math.random() - 0.5) * 2.0 * dt;
        c.vx = Math.cos(c.wanderAngle) * c.speed;
        c.vz = Math.sin(c.wanderAngle) * c.speed;
      }

      // Meat Magnet vacuum pull towards Patient Zero
      if (this.meatMagnetTimer > 0) {
        const pullDx = pz.x - c.x;
        const pullDz = pz.z - c.z;
        const pullDist = Math.hypot(pullDx, pullDz);
        if (pullDist < 15.0 && pullDist > 0.05) {
          const vacuumForce = (1.0 - pullDist / 15.0) * 12.0;
          c.vx += (pullDx / pullDist) * vacuumForce;
          c.vz += (pullDz / pullDist) * vacuumForce;
        }
      }

      c.x += c.vx * dt;
      c.z += c.vz * dt;

      // Check collision with toxic slime breadcrumbs on the road
      if (c.slipTimer <= 0 && (!c.slipImmunity || c.slipImmunity <= 0) && this.slimeTrail && this.slimeTrail.length > 0) {
        for (let si = 0; si < this.slimeTrail.length; si++) {
          const sp = this.slimeTrail[si];
          const sDistSq = (c.x - sp.x) * (c.x - sp.x) + (c.z - sp.z) * (c.z - sp.z);
          if (sDistSq <= 0.85 * 0.85) {
            if (Math.random() < 0.40) {
              c.slipTimer = 1.0;
              c.slipImmunity = 2.5;
              c.cureFlail = 1.2;
              if (this.particles) this.particles.burstSlimeSplash(c.x, c.z);
              if (this.onCivilianSlipped) this.onCivilianSlipped(c.x, c.z);
            } else {
              c.slipImmunity = 1.0;
            }
            break;
          }
        }
      }

      const cSpeed = Math.hypot(c.vx, c.vz);
      c.walkPhase += (cSpeed > 0.1 ? cSpeed * dt * 2.8 : dt * 1.2);

      // Boundary bounce
      if (isBounded) {
        const cDist = Math.hypot(c.x, c.z);
        if (cDist > maxBound) {
          c.x = (c.x / cDist) * maxBound;
          c.z = (c.z / cDist) * maxBound;
          c.wanderAngle = Math.atan2(-c.z, -c.x) + (Math.random() - 0.5) * 0.5;
        }
      }

      // Building collision for civilians
      const cPrevX = c.x - c.vx * dt;
      const cPrevZ = c.z - c.vz * dt;
      const collision = spatialGrid.resolveObstacles(c, c.radius, true, cPrevX, cPrevZ);
      if (collision) {
        // Cartoony bounce for civilians too
        c.vx += collision.nx * 2.5;
        c.vz += collision.nz * 2.5;
      }
    }

    // 8a. Check Stray Zombie Recruitment:
    // When Patient Zero or any horde member runs into a stray zombie, it joins your horde!
    for (let i = this.strayZombies.length - 1; i >= 0; i--) {
      const s = this.strayZombies[i];
      let recruited = false;

      const pzDist = Math.hypot(s.x - pz.x, s.z - pz.z);
      if (pzDist <= s.radius + pz.radius + 0.4) {
        recruited = true;
      }

      if (!recruited) {
        spatialGrid.forEachNearby(s.x, s.z, s.radius + 0.8, (neighbor, distSq) => {
          if (neighbor.type === 'zombie') {
            const minDist = s.radius + neighbor.radius + 0.3;
            if (distSq <= minDist * minDist) {
              recruited = true;
              return true;
            }
          }
          return false;
        });
      }

      if (recruited) {
        this.recruitStrayZombie(i);
      }
    }

    // 8b. Check Civilian Infection:
    // When Patient Zero or any horde member touches a civilian, they turn into a zombie!
    // Meat Magnet triples infection radius
    const reachBonus = this.meatMagnetTimer > 0 ? 3.0 : 0.0;
    for (let i = this.civilians.length - 1; i >= 0; i--) {
      const c = this.civilians[i];

      // Newly cured civilians have temporary chemical immunity from re-infection
      if (c.cureImmunity > 0) {
        c.cureImmunity -= dt;
        continue;
      }

      let infected = false;

      const pzDist = Math.hypot(c.x - pz.x, c.z - pz.z);
      if (pzDist <= c.radius + pz.radius + 0.15 + reachBonus) {
        infected = true;
      }

      if (!infected) {
        spatialGrid.forEachNearby(c.x, c.z, c.radius + 0.7 + reachBonus, (neighbor, distSq) => {
          if (neighbor.type === 'zombie') {
            const minDist = c.radius + neighbor.radius + 0.15 + reachBonus;
            if (distSq <= minDist * minDist) {
              infected = true;
              return true;
            }
          }
          return false;
        });
      }

      if (infected) {
        this.convertCivilianToZombie(i);
      }
    }

    // 8c. E7: Gas cloud civilian infection
    for (let gi = this.gasClouds.length - 1; gi >= 0; gi--) {
      const gc = this.gasClouds[gi];
      gc.lifetime -= dt;
      if (gc.lifetime <= 0) {
        this.gasClouds.splice(gi, 1);
        continue;
      }
      // Infect civilians inside the cloud
      for (let ci = this.civilians.length - 1; ci >= 0; ci--) {
        const c = this.civilians[ci];
        if (c.hidden) continue;
        const d = Math.hypot(c.x - gc.x, c.z - gc.z);
        if (d < gc.radius) {
          c.gasExposure = (c.gasExposure || 0) + dt * gc.infectionRate;
          if (c.gasExposure >= 1.0) {
            this.convertCivilianToZombie(ci);
          }
        }
      }
    }

    // 8d. Megaphone Warden AI, Rallying Aura, and Infection
    for (let wIdx = this.wardens.length - 1; wIdx >= 0; wIdx--) {
      const w = this.wardens[wIdx];
      w.chantTimer = (w.chantTimer || 0) + dt;
      if (w.chantTimer >= 3.5) {
        w.chantTimer = 0;
        if (this.onMegaphoneChant) {
          this.onMegaphoneChant(w.x, w.z);
        }
      }

      // Flee from Player & Swarm
      let fleeX = 0;
      let fleeZ = 0;
      let threatCount = 0;
      spatialGrid.forEachNearby(w.x, w.z, 16.0, (threat, distSq) => {
        if (threat.type !== 'zombie' && threat.type !== 'player') return false;
        const d = Math.sqrt(distSq);
        if (d > 0.001) {
          fleeX += (w.x - threat.x) / d;
          fleeZ += (w.z - threat.z) / d;
          threatCount++;
        }
        return false;
      });

      if (threatCount > 0) {
        const fLen = Math.hypot(fleeX, fleeZ) || 1.0;
        w.vx = (fleeX / fLen) * w.speed;
        w.vz = (fleeZ / fLen) * w.speed;
        w.angle = Math.atan2(w.vx, w.vz);
      } else {
        w.angle += (Math.random() - 0.5) * 1.5 * dt;
        w.vx = Math.sin(w.angle) * (w.speed * 0.5);
        w.vz = Math.cos(w.angle) * (w.speed * 0.5);
      }

      w.x += w.vx * dt;
      w.z += w.vz * dt;
      const wSpeed = Math.hypot(w.vx, w.vz);
      w.walkPhase += wSpeed * dt * 3.0;

      // Obstacle collision
      const wPrevX = w.x - w.vx * dt;
      const wPrevZ = w.z - w.vz * dt;
      const wColl = spatialGrid.resolveObstacles(w, w.radius, true, wPrevX, wPrevZ);
      if (wColl) {
        w.vx += wColl.nx * 2.5;
        w.vz += wColl.nz * 2.5;
      }

      // 20m Rallying Aura: Civilians in range follow behind the Warden tightly
      const AURA_RADIUS = 20.0;
      spatialGrid.forEachNearby(w.x, w.z, AURA_RADIUS, (civ, distSq) => {
        if (civ.type !== 'civilian' || civ.hidden) return false;
        const targetX = w.x - Math.sin(w.angle) * 1.8;
        const targetZ = w.z - Math.cos(w.angle) * 1.8;
        const toWardenX = targetX - civ.x;
        const toWardenZ = targetZ - civ.z;
        const distToW = Math.hypot(toWardenX, toWardenZ);
        if (distToW > 0.4) {
          const steerSpeed = Math.min(w.speed, 4.6);
          civ.vx = (civ.vx * 0.6) + (toWardenX / distToW) * (steerSpeed * 0.4);
          civ.vz = (civ.vz * 0.6) + (toWardenZ / distToW) * (steerSpeed * 0.4);
          civ.fleeTimer = 1.0;
        }
        return false;
      });

      // Warden Infection Check (Player or Horde collision)
      let wardenInfected = false;
      const pzDist = Math.hypot(w.x - pz.x, w.z - pz.z);
      const reachBonus = (pz.isFrenzy ? 0.35 : 0) + (this.isTitan ? 2.2 : 0);
      if (pzDist <= w.radius + pz.radius + 0.2 + reachBonus) {
        wardenInfected = true;
      }

      if (!wardenInfected) {
        spatialGrid.forEachNearby(w.x, w.z, w.radius + 0.8 + reachBonus, (neighbor, distSq) => {
          if (neighbor.type === 'zombie') {
            const minDist = w.radius + neighbor.radius + 0.2 + reachBonus;
            if (distSq <= minDist * minDist) {
              wardenInfected = true;
              return true;
            }
          }
          return false;
        });
      }

      if (wardenInfected) {
        this.convertWardenToZombie(wIdx);
      }
    }

    // 9. Hazmat Aggressive Standoff AI & Sustained Spray Decontamination
    // Hazmats mobilize once horde reaches size 15+
    if (this.zombies.length >= 15 && this.hazmats.length === 0 && Math.random() < dt * 0.25) {
      const useHeliDrop = this.zombies.length >= 30;
      this.spawnHazmat(undefined, undefined, useHeliDrop);
      if (useHeliDrop && this.onPanicEscalation) {
        this.onPanicEscalation('🚁 CHOPPER INCOMING!');
      }
    }

    // Calculate swarm center for Hazmats to target
    let swarmCenterX = pz.x;
    let swarmCenterZ = pz.z;
    if (this.zombies.length > 0) {
      let sumX = pz.x;
      let sumZ = pz.z;
      const sampleCount = Math.min(this.zombies.length, 10);
      for (let si = 0; si < sampleCount; si++) {
        sumX += this.zombies[si].x;
        sumZ += this.zombies[si].z;
      }
      swarmCenterX = sumX / (sampleCount + 1);
      swarmCenterZ = sumZ / (sampleCount + 1);
    }

    let pzHitBySprayThisFrame = false;

    for (let hIdx = this.hazmats.length - 1; hIdx >= 0; hIdx--) {
      const h = this.hazmats[hIdx];

      // Heli drop descent
      if (h.isDropping && h.dropY > 0) {
        h.dropY = Math.max(0, h.dropY - dt * 8.0);
        if (h.dropY <= 0) {
          h.isDropping = false;
          if (this.onPanicEscalation) this.onPanicEscalation('☣️ HAZMAT DEPLOYED!');
        }
        h.walkPhase += dt * 2.0;
        continue;
      }

      // Aggressive Standoff AI: Path towards swarm center while maintaining 6-unit standoff distance
      const toTargetX = swarmCenterX - h.x;
      const toTargetZ = swarmCenterZ - h.z;
      const toTargetDist = Math.hypot(toTargetX, toTargetZ);

      if (toTargetDist > 0.05) {
        h.angle = Math.atan2(toTargetX, toTargetZ);
        const hazmatSpeed = (this.currentStage === 1 ? 1.6 : this.currentStage === 2 ? 2.0 : this.currentStage === 3 ? 2.4 : 3.0);
        h.speed = hazmatSpeed;
        if (toTargetDist > 6.5) {
          // Advance toward swarm
          h.vx = (toTargetX / toTargetDist) * h.speed;
          h.vz = (toTargetZ / toTargetDist) * h.speed;
        } else if (toTargetDist < 5.2) {
          // Back up to keep optimal 6-unit spray distance
          h.vx = -(toTargetX / toTargetDist) * (h.speed * 0.75);
          h.vz = -(toTargetZ / toTargetDist) * (h.speed * 0.75);
        } else {
          // Tactical standoff strafe at ~6m
          const perpX = -toTargetZ / toTargetDist;
          const perpZ = toTargetX / toTargetDist;
          h.vx = perpX * (h.speed * 0.4);
          h.vz = perpZ * (h.speed * 0.4);
        }
      }

      h.x += h.vx * dt;
      h.z += h.vz * dt;

      h.walkPhase += (h.speed > 0.1 ? h.speed * dt * 2.5 : dt * 1.0);
      const hPrevX = h.x - h.vx * dt;
      const hPrevZ = h.z - h.vz * dt;
      const collision = spatialGrid.resolveObstacles(h, h.radius, true, hPrevX, hPrevZ);
      if (collision) {
        h.vx += collision.nx * 2.0;
        h.vz += collision.nz * 2.0;
      }

      // Spray Cone Collision Check: 12 units range, 45 degrees angle along facing vector
      const sprayDirX = Math.sin(h.angle);
      const sprayDirZ = Math.cos(h.angle);
      const activeCureThreshold = this.cureThreshold || 0.8;

      spatialGrid.forEachInCone(
        h.x,
        h.z,
        sprayDirX,
        sprayDirZ,
        12.0,
        45 * Math.PI / 180,
        (entity, dist) => {
          if (entity.type === 'player' && this.isSprayInvulnerable) return false;

          if (entity.type === 'zombie') {
            // Sustained exposure inside spray cone cures zombie back to civilian!
            entity.sprayExposure = (entity.sprayExposure || 0) + dt;
            if (this.onHazmatDamageDealt) {
              this.onHazmatDamageDealt(dt);
            }
            if (entity.sprayExposure >= activeCureThreshold) {
              const zIdx = this.zombies.indexOf(entity);
              if (zIdx !== -1) {
                this.cureZombieToCivilian(zIdx);
              }
            }
          } else if (entity.type === 'stray_zombie') {
            entity.sprayExposure = (entity.sprayExposure || 0) + dt;
            if (this.onHazmatDamageDealt) {
              this.onHazmatDamageDealt(dt);
            }
            if (entity.sprayExposure >= activeCureThreshold) {
              const sIdx = this.strayZombies.indexOf(entity);
              if (sIdx !== -1) {
                const stray = this.strayZombies[sIdx];
                this.strayZombies.splice(sIdx, 1);
                this.civilians.push({
                  id: stray.id,
                  type: 'civilian',
                  x: stray.x,
                  z: stray.z,
                  vx: 0,
                  vz: 0,
                  radius: 0.5,
                  speed: 1.8,
                  fleeSpeed: 3.6,
                  wanderAngle: Math.random() * Math.PI * 2,
                  fleeTimer: 3.0,
                  walkPhase: 0,
                  colorVariation: stray.colorVariation,
                  cureFlail: 1.0,
                  cureImmunity: 2.5,
                });
                if (this.onCured) {
                  this.onCured(stray.x, stray.z);
                }
              }
            }
          } else if (entity.type === 'player') {
            pzHitBySprayThisFrame = true;
          }
          return false;
        }
      );

      // Swarm overwhelms Hazmat if 6+ zombies swarm directly into close range
      let surroundingZombies = 0;
      spatialGrid.forEachNearby(h.x, h.z, h.radius + 1.2, (z, distSq) => {
        if (z.type === 'zombie' || z.type === 'player') {
          surroundingZombies++;
        }
        return false;
      });

      if (surroundingZombies >= 6) {
        if (this.onHazmatDestroyed) {
          this.onHazmatDestroyed(h.x, h.z);
        }
        this.hazmats.splice(hIdx, 1);
        setTimeout(() => {
          if (this.hazmats.length < 2 && this.zombies.length >= 15) {
            this.spawnHazmat();
          }
        }, 12000);
      }
    }

    // Patient Zero Spray Threat (@designer & @qa):
    // 1. Maintain absolute invulnerability for Patient Zero while hordeCount > 0 (followers deplete first)
    // 2. When hordeCount === 0: trigger 5.0s sustained Last Stand exposure before GAME OVER
    if (this.zombies.length > 0) {
      pz.isSpraySlowed = false;
      this.pzSprayTime = 0;
      if (this.onPatientZeroSprayed) {
        this.onPatientZeroSprayed(dt, 0.0, 5.0);
      }
    } else {
      if (pzHitBySprayThisFrame && !this.isSprayInvulnerable) {
        pz.isSpraySlowed = true;
        this.pzSprayTime = Math.min(5.0, (this.pzSprayTime || 0) + dt);
        if (this.onHazmatDamageDealt) {
          this.onHazmatDamageDealt(dt);
        }
        const progress = Math.min(1.0, this.pzSprayTime / 5.0);
        const timeLeft = Math.max(0, 5.0 - this.pzSprayTime);
        if (this.onPatientZeroSprayed) {
          this.onPatientZeroSprayed(dt, progress, timeLeft);
        }
        if (this.pzSprayTime >= 5.0) {
          if (this.onGameOver) {
            this.onGameOver('QUARANTINED!');
          }
        }
      } else {
        pz.isSpraySlowed = false;
        this.pzSprayTime = Math.max(0, (this.pzSprayTime || 0) - dt * 1.0);
        const progress = Math.min(1.0, this.pzSprayTime / 5.0);
        const timeLeft = Math.max(0, 5.0 - this.pzSprayTime);
        if (this.onPatientZeroSprayed) {
          this.onPatientZeroSprayed(dt, progress, timeLeft);
        }
      }
    }

    // 10. Update Bloater Bomb Mutants (Charges nearest Hazmat & detonates)
    for (let bi = this.bloaters.length - 1; bi >= 0; bi--) {
      const b = this.bloaters[bi];
      b.fuseTimer -= dt;
      b.walkPhase += dt * 4.0;

      let nearestH = null;
      let minHDist = Infinity;
      for (const h of this.hazmats) {
        const d = Math.hypot(h.x - b.x, h.z - b.z);
        if (d < minHDist) {
          minHDist = d;
          nearestH = h;
        }
      }

      if (nearestH) {
        const hDx = nearestH.x - b.x;
        const hDz = nearestH.z - b.z;
        const dLen = Math.hypot(hDx, hDz) || 1;
        b.vx = (hDx / dLen) * b.speed;
        b.vz = (hDz / dLen) * b.speed;
        b.angle = Math.atan2(hDx, hDz);
      } else {
        b.vx = Math.sin(b.angle) * b.speed;
        b.vz = Math.cos(b.angle) * b.speed;
      }

      b.x += b.vx * dt;
      b.z += b.vz * dt;

      if (b.mesh) {
        b.mesh.position.set(b.x, 0.1, b.z);
        b.mesh.rotation.y = b.angle;
        const pulse = 1.0 + Math.sin(b.fuseTimer * 14.0) * 0.18;
        b.mesh.scale.set(pulse, pulse, pulse);
      }

      // Detonate if within 3.2m of a Hazmat or fuse expires
      if (minHDist <= 3.2 || b.fuseTimer <= 0) {
        if (b.mesh && this.scene) {
          this.scene.remove(b.mesh);
        }
        if (this.onExplosion) {
          this.onExplosion(b.x, b.z);
        }
        if (this.particles && this.particles.burstDustCloud) {
          this.particles.burstDustCloud(b.x, b.z, 14);
          this.particles.burstInfection(b.x, b.z);
        }

        // Knock Hazmats flying!
        for (let hi = this.hazmats.length - 1; hi >= 0; hi--) {
          const h = this.hazmats[hi];
          const dist = Math.hypot(h.x - b.x, h.z - b.z);
          if (dist <= 8.5) {
            const kx = h.x - b.x;
            const kz = h.z - b.z;
            const kDist = Math.hypot(kx, kz) || 1;
            h.vx += (kx / kDist) * 26.0;
            h.vz += (kz / kDist) * 26.0;
            if (this.onHazmatDestroyed) {
              this.onHazmatDestroyed(h.x, h.z);
            }
            this.hazmats.splice(hi, 1);
          }
        }
        this.bloaters.splice(bi, 1);
      }
    }

    // 10b. Update Military Riflemen (18m targeting, building occlusion check, 1.5s charge, 3-target piercing round)
    for (let mi = this.militaryUnits.length - 1; mi >= 0; mi--) {
      const m = this.militaryUnits[mi];

      // Decay bullet tracer shot visual
      if (m.tracerShot) {
        m.tracerShot.alpha -= dt * 4.0;
        if (m.tracerShot.alpha <= 0) m.tracerShot = null;
      }

      // Cooldown timer decay
      if (m.cooldownTimer > 0) {
        m.cooldownTimer -= dt;
      }

      // 1. Target Acquisition (18m range)
      // Prioritize Patient Zero if within 18m and line of sight is clear
      let target = null;
      const pzDist = Math.hypot(pz.x - m.x, pz.z - m.z);
      if (pzDist <= 18.0 && this._checkLineOfSight(m.x, m.z, pz.x, pz.z, spatialGrid)) {
        target = pz;
      } else {
        // Otherwise target the closest exposed zombie
        let closestDist = 18.0;
        for (let zi = 0; zi < this.zombies.length; zi++) {
          const z = this.zombies[zi];
          const zd = Math.hypot(z.x - m.x, z.z - m.z);
          if (zd < closestDist && this._checkLineOfSight(m.x, m.z, z.x, z.z, spatialGrid)) {
            closestDist = zd;
            target = z;
          }
        }
      }

      // 2. State Machine: Aiming -> Fire -> Cooldown -> Patrol
      if (target && m.cooldownTimer <= 0) {
        m.targetEntity = target;
        m.targetPos = { x: target.x, y: 0.7, z: target.z };
        m.angle = Math.atan2(target.x - m.x, target.z - m.z);
        m.state = 'aiming';
        m.aimTimer += dt;
        m.speed = 0;

        const aimThreshold = this.currentStage >= 4 ? 1.0 : 1.8;
        m.aimThreshold = aimThreshold;
        const tDist = Math.hypot(target.x - m.x, target.z - m.z);
        if (tDist > 20.0 || !this._checkLineOfSight(m.x, m.z, target.x, target.z, spatialGrid)) {
          m.state = 'patrol';
          m.targetPos = null;
          m.aimTimer = 0;
        } else if (m.aimTimer >= aimThreshold) {
          // FIRE!
          m.state = 'cooldown';
          m.cooldownTimer = 2.2;
          m.aimTimer = 0;

          const aimAngle = Math.atan2(target.x - m.x, target.z - m.z);
          const shotDirX = Math.sin(aimAngle);
          const shotDirZ = Math.cos(aimAngle);
          const shotLen = 22.0;
          const endX = m.x + shotDirX * shotLen;
          const endZ = m.z + shotDirZ * shotLen;

          m.tracerShot = {
            x0: m.x + shotDirX * 0.72,
            y0: 0.86,
            z0: m.z + shotDirZ * 0.72,
            x1: endX,
            y1: 0.7,
            z1: endZ,
            alpha: 1.0,
          };

          if (this.onMilitarySnipe) this.onMilitarySnipe(m.x, m.z);
          if (this.particles && this.particles.burstTracer) {
            this.particles.burstTracer(m.tracerShot.x0, 0.86, m.tracerShot.z0, endX, 0.7, endZ);
          }

          // Piercing check: hit up to 3 zombies in straight line
          const hitZombies = [];
          for (let zi = 0; zi < this.zombies.length; zi++) {
            const z = this.zombies[zi];
            const vax = z.x - m.x;
            const vaz = z.z - m.z;
            const proj = vax * shotDirX + vaz * shotDirZ;
            if (proj > 0.5 && proj < shotLen) {
              const perpDistSq = (vax * vax + vaz * vaz) - (proj * proj);
              if (perpDistSq < 0.65 * 0.65) {
                hitZombies.push({ zombie: z, proj });
              }
            }
          }

          hitZombies.sort((a, b) => a.proj - b.proj);
          const killCount = Math.min(3, hitZombies.length);
          for (let k = 0; k < killCount; k++) {
            const kz = hitZombies[k].zombie;
            const zIdx = this.zombies.indexOf(kz);
            if (zIdx !== -1) {
              this.zombies.splice(zIdx, 1);
              if (this.particles) {
                this.particles.burstInfection(kz.x, kz.z);
              }
            }
          }

          if (killCount > 0 && this.onMilitaryCasualty) {
            this.onMilitaryCasualty(target.x, target.z, killCount);
          }

          // Check if Patient Zero was in the piercing line
          const pzAx = pz.x - m.x;
          const pzAz = pz.z - m.z;
          const pzProj = pzAx * shotDirX + pzAz * shotDirZ;
          if (pzProj > 0.5 && pzProj < shotLen) {
            const pzPerpSq = (pzAx * pzAx + pzAz * pzAz) - (pzProj * pzProj);
            if (pzPerpSq < (pz.radius + 0.3) * (pz.radius + 0.3)) {
              if (this.isTitan) {
                // Titan is completely immune to gunfire! Metallic ricochet sparks
                if (this.particles && this.particles.burstTracer) {
                  this.particles.burstTracer(pz.x, 1.2, pz.z, pz.x + shotDirX * 3, 2.0, pz.z + shotDirZ * 3);
                }
              } else if (this.zombies.length > 0) {
                // Horde-first protection (@designer & @qa):
                // Maintain absolute invulnerability for Patient Zero while hordeCount > 0.
                // Piercing rounds depleted follower zombies; Patient Zero absorbs no damage/knockback.
                if (this.particles && this.particles.burstInfection) {
                  this.particles.burstInfection(pz.x, pz.z);
                }
              } else {
                // 0-follower Last Stand state: sniper round triggers immediate defeat!
                if (this.onGameOver) {
                  this.onGameOver('SNIPED_ALONE');
                }
              }
            }
          }
        }
      } else {
        // Patrol streets or choke points
        m.state = 'patrol';
        m.targetPos = null;
        m.aimTimer = 0;
        m.patrolTimer -= dt;
        if (m.patrolTimer <= 0) {
          m.patrolTimer = 2.5 + Math.random() * 3.5;
          m.patrolAngle = Math.random() * Math.PI * 2;
        }

        m.angle = m.patrolAngle;
        m.speed = 1.8;
        m.vx = Math.sin(m.angle) * m.speed;
        m.vz = Math.cos(m.angle) * m.speed;
        m.x += m.vx * dt;
        m.z += m.vz * dt;
        m.walkPhase += dt * 2.2;

        const mPrevX = m.x - m.vx * dt;
        const mPrevZ = m.z - m.vz * dt;
        const col = spatialGrid.resolveObstacles(m, m.radius, true, mPrevX, mPrevZ);
        if (col) {
          m.patrolAngle += Math.PI * 0.6;
        }
      }

      // Counterplay: Rush soldier to infect!
      const distToPz = Math.hypot(pz.x - m.x, pz.z - m.z);
      let infected = distToPz < (pz.radius * (this.isTitan ? 2.5 : 1.0) + m.radius + 0.1);

      if (!infected) {
        for (let zi = 0; zi < this.zombies.length; zi++) {
          const z = this.zombies[zi];
          if (Math.hypot(z.x - m.x, z.z - m.z) < z.radius + m.radius + 0.2) {
            infected = true;
            break;
          }
        }
      }

      if (infected) {
        const mx = m.x;
        const mz = m.z;
        this.militaryUnits.splice(mi, 1);

        // Convert soldier into a new horde zombie!
        const newZ = {
          id: this._nextId++,
          type: 'zombie',
          x: mx,
          z: mz,
          vx: 0,
          vz: 0,
          radius: 0.5,
          walkPhase: 0,
          convertAnim: 1.0,
          flail: 0.8,
          colorVariation: 1,
          cureExposure: 0,
          sprayExposure: 0,
        };
        this.zombies.push(newZ);

        this.score += 75;
        if (this.onMilitaryInfected) {
          this.onMilitaryInfected(mx, mz);
        }
        if (this.particles && this.particles.burstInfectionDroplets) {
          this.particles.burstInfectionDroplets(mx, mz, 8);
        }
      }
    }

    // 11. Bulldozer Physics: Horde >= 20 knocks down small street props
    const totalSwarm = this.zombies.length + 1;
    if (totalSwarm >= 20 && this.cityStreamer && this.cityStreamer.getNearbyKnockableProps) {
      const checkRadius = 14.0;
      const nearbyProps = this.cityStreamer.getNearbyKnockableProps(pz.x, pz.z, checkRadius);
      for (let pi = 0; pi < nearbyProps.length; pi++) {
        const prop = nearbyProps[pi];
        if (prop.knocked) continue;

        let hit = false;
        let hitDirX = pz.vx || 0;
        let hitDirZ = pz.vz || 0;

        const pzDist = Math.hypot(prop.x - pz.x, prop.z - pz.z);
        if (pzDist <= prop.radius + pz.radius + 0.4) {
          hit = true;
        }

        if (!hit) {
          for (let zi = 0; zi < this.zombies.length; zi++) {
            const z = this.zombies[zi];
            const zd = Math.hypot(prop.x - z.x, prop.z - z.z);
            if (zd <= prop.radius + z.radius + 0.4) {
              hit = true;
              hitDirX = z.vx || 1;
              hitDirZ = z.vz || 0;
              break;
            }
          }
        }

        if (hit) {
          prop.knocked = true;
          this.score += 25;
          if (this.particles && this.particles.burstDustCloud) {
            this.particles.burstDustCloud(prop.x, prop.z, 10);
          }
          if (this.onPropKnocked) {
            this.onPropKnocked(prop, hitDirX, hitDirZ);
          }
        }
      }
    }

    // 12. Ambulance Micro-Objective
    for (let ai = this.ambulances.length - 1; ai >= 0; ai--) {
      const amb = this.ambulances[ai];
      const distSq = (amb.x - pz.x) ** 2 + (amb.z - pz.z) ** 2;
      
      // Despawn if > 140m away
      if (distSq > 140.0 * 140.0) {
        this.ambulances.splice(ai, 1);
        continue;
      }
      
      let swarmed = false;
      if (distSq < 4.0 * 4.0) {
        let hordeCount = 0;
        for (let zi = 0; zi < this.zombies.length; zi++) {
          const z = this.zombies[zi];
          if ((amb.x - z.x) ** 2 + (amb.z - z.z) ** 2 < 4.0 * 4.0) {
            hordeCount++;
          }
        }
        if (hordeCount >= 5) { // Needs Patient Zero + 5 zombies close to it
          swarmed = true;
        }
      }

      if (swarmed) {
        amb.swarmTimer += dt;
        if (amb.swarmTimer >= 3.0) {
          // Detonate!
          if (this.particles && this.particles.burstDustCloud) {
            this.particles.burstDustCloud(amb.x, amb.z, 22);
            this.particles.burstShockwave(amb.x, amb.z, 5.0);
          }
          if (this.onCameraShake) this.onCameraShake(0.5, 0.6);
          if (this.onExplosion) this.onExplosion(amb.x, amb.z);
          
          this.score += 250;
          
          // Spawn powerup (handled in main.js if we pass an event, but let's just trigger a global event)
          if (this.onAmbulanceDetonated) {
            this.onAmbulanceDetonated(amb.x, amb.z);
          }
          
          this.ambulances.splice(ai, 1);
        }
      } else {
        amb.swarmTimer = Math.max(0, amb.swarmTimer - dt);
      }
    }

    // 13. Population Streaming & Memory Cleanup
    this.updatePopulationStreaming(pz);
  }

  triggerMilestoneAbility() {
    if (!this._milestonesUnlocked.has(10)) return;
    
    // Ability 1: Area of Effect Infection Burst
    if (this.zombies.length < 25) {
      if (this.onComboInfection) this.onComboInfection(1, 0, this.patientZero ? this.patientZero.x : 0, this.patientZero ? this.patientZero.z : 0); // Triggers shake
      let infectedCount = 0;
      for (let i = this.civilians.length - 1; i >= 0; i--) {
        const c = this.civilians[i];
        if (c.hidden) continue;
        const pzRef = this.patientZero || { x: 0, z: 0 };
        const distSq = (c.x - pzRef.x) ** 2 + (c.z - pzRef.z) ** 2;
        if (distSq < 64.0) { // 8m radius
          this._infectCivilian(c, i);
          infectedCount++;
        }
      }
    } 
    // Ability 2: Fear Wave (Stun Hazmats)
    else {
      if (this.onComboInfection) this.onComboInfection(1, 0, this.patientZero ? this.patientZero.x : 0, this.patientZero ? this.patientZero.z : 0); // Triggers shake
      for (const h of this.hazmats) {
        const pzRef = this.patientZero || { x: 0, z: 0 };
        const distSq = (h.x - pzRef.x) ** 2 + (h.z - pzRef.z) ** 2;
        if (distSq < 400.0) { // 20m radius
          h.stunTimer = 4.0; // Stun for 4 seconds
        }
      }
    }
  }

  triggerFrenzy() {
    this.frenzyTimer = 5.0; // 5 seconds of frenzy speed boost
    if (this.onComboInfection) {
      this.onComboInfection(this.combo, 0, this.patientZero ? this.patientZero.x : 0, this.patientZero ? this.patientZero.z : 0);
    }
  }

  /**
   * Infinite World Population Streaming:
   * Despawns distant entities, preserves the horde swarm, and replenishes civilians/strays ahead.
   */
  updatePopulationStreaming(pz) {
    if (!pz) return;

    const pzRef = pz;
    const despawnRadiusSq = 140.0 * 140.0;

    // 1. Despawn distant non-horde entities (> 140m away from Patient Zero)
    for (let i = this.civilians.length - 1; i >= 0; i--) {
      const c = this.civilians[i];
      const distSq = (c.x - pzRef.x) ** 2 + (c.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.civilians.splice(i, 1);
      }
    }

    for (let i = this.strayZombies.length - 1; i >= 0; i--) {
      const s = this.strayZombies[i];
      const distSq = (s.x - pzRef.x) ** 2 + (s.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.strayZombies.splice(i, 1);
      }
    }

    for (let i = this.hazmats.length - 1; i >= 0; i--) {
      const h = this.hazmats[i];
      const distSq = (h.x - pzRef.x) ** 2 + (h.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.hazmats.splice(i, 1);
      }
    }

    for (let i = this.militaryUnits.length - 1; i >= 0; i--) {
      const m = this.militaryUnits[i];
      const distSq = (m.x - pzRef.x) ** 2 + (m.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.militaryUnits.splice(i, 1);
      }
    }

    for (let i = this.wardens.length - 1; i >= 0; i--) {
      const w = this.wardens[i];
      const distSq = (w.x - pzRef.x) ** 2 + (w.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.wardens.splice(i, 1);
      }
    }

    // 2. Swarm Retention: Catch up any horde zombies that got stranded behind buildings (> 55m away)
    const cellSize = 30;
    const cellX = Math.floor(pz.x / cellSize);
    const cellZ = Math.floor(pz.z / cellSize);

    if (!this._spawnedCells) this._spawnedCells = new Set();
    
    // Memory Leak Fix: Periodically prune distant spawned cells from memory
    if (Math.random() < 0.05) {
      for (const key of this._spawnedCells) {
        const parts = key.split(',');
        const cx = parseInt(parts[0], 10);
        const cz = parseInt(parts[1], 10);
        if (Math.abs(cx - cellX) > 5 || Math.abs(cz - cellZ) > 5) {
          this._spawnedCells.delete(key);
        }
      }
    }

    for (let cx = cellX - 2; cx <= cellX + 2; cx++) {
      for (let cz = cellZ - 2; cz <= cellZ + 2; cz++) {
        const cellKey = `${cx},${cz}`;
        if (!this._spawnedCells.has(cellKey)) {
          this._spawnedCells.add(cellKey);

          const spawnX = (cx + Math.random()) * cellSize;
          const spawnZ = (cz + Math.random()) * cellSize;

          this.spawnCivilian(spawnX, spawnZ);
          if (Math.random() < 0.4) {
            this.spawnStrayZombie(spawnX, spawnZ);
          }

          // Removed cell-based hazmat and power-up spawn logic. Handled globally below.
        }
      }
    }

    // 2. Global Hazmat Spawning Pipeline
    // Enforce quota of 4-8 hazmats based on panic level, but scaled by active chunk clusters.
    // If we have active chunks, we should keep a quota of Hazmats up.
    if (this.cityStreamer && this.cityStreamer.activeChunks && this.cityStreamer.activeChunks.size > 0) {
      const minQuota = 4;
      const maxQuota = 8;
      const targetHazmats = Math.max(minQuota, Math.floor(this.panicLevel * maxQuota));
      
      if (this.hazmats.length < targetHazmats && Math.random() < 0.05) {
        // Spawn strictly on street points via CityStreamer
        // Spawn between 50m and 90m away from Patient Zero (just outside view or entering view)
        const pt = this.cityStreamer.getRandomStreetPoint(pzRef.x, pzRef.z, 50, 90);
        if (pt) {
          this.hazmats.push({
            id: this._nextId++,
            x: pt.x,
            z: pt.z,
            vx: 0,
            vz: 0,
            speed: 2.2,
            walkPhase: Math.random() * Math.PI * 2,
            radius: 0.6,
            angle: 0,
            stunTimer: 0
          });
        }
      }
    }

    // 2b. Global Ambulance Spawning
    if (this.cityStreamer && this.currentStage >= 2) {
      if (this.ambulances.length < 1 && Math.random() < 0.01) {
        const pt = this.cityStreamer.getRandomStreetPoint(pzRef.x, pzRef.z, 60, 100);
        if (pt) {
          this.ambulances.push({
            x: pt.x,
            z: pt.z,
            swarmTimer: 0
          });
        }
      }
    }

    // 3. Swarm Retention: Catch up any horde zombies that got stranded behind buildings (> 55m away)
    const swarmLagDistSq = 55.0 * 55.0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      const dx = z.x - pz.x;
      const dz = z.z - pz.z;
      if (dx * dx + dz * dz > swarmLagDistSq) {
        const rearAngle = (pz.angle || 0) + Math.PI + (Math.random() - 0.5) * 0.8;
        z.x = pz.x + Math.cos(rearAngle) * (6.0 + Math.random() * 6.0);
        z.z = pz.z + Math.sin(rearAngle) * (6.0 + Math.random() * 6.0);
        z.vx = pz.vx * 0.5;
        z.vz = pz.vz * 0.5;
      }
    }

    // 3. Replenish population around the player
    const targetCivilians = 50;
    while (this.civilians.length < targetCivilians) {
      const pos = this._getRandomStreetPosition(40, 95);
      this.spawnCivilian(pos.x, pos.z);
    }

    const targetStrays = 16;
    while (this.strayZombies.length < targetStrays) {
      const pos = this._getRandomStreetPosition(40, 95);
      this.spawnStrayZombie(pos.x, pos.z);
    }

    // 4. Hazmat mobilization by difficulty stage
    let targetHazmats = 0;
    if (this.currentStage === 1) {
      // Stage 1 (0:00 - 1:00): Max 1 slow Hazmat unit per 3 chunks
      targetHazmats = (this.zombies.length + 1) >= 20 ? 1 : 0;
    } else if (this.currentStage === 2) {
      // Stage 2 (1:00 - 2:30): Hazmats spawn in pairs
      targetHazmats = 2;
    } else if (this.currentStage === 3) {
      targetHazmats = 3;
    } else {
      targetHazmats = 4;
    }

    if (this.hazmats.length < targetHazmats) {
      const pos = this._getRandomStreetPosition(65, 95);
      this.spawnHazmat(pos.x, pos.z);
    }

    // 5. Military Riflemen squad deployment (0 in Stages 1 & 2, begins in Stage 3)
    let targetMilitary = 0;
    if (this.currentStage >= 4) {
      targetMilitary = 4;
    } else if (this.currentStage === 3) {
      targetMilitary = 2;
    } else {
      targetMilitary = 0;
    }

    if (this.militaryUnits.length < targetMilitary) {
      const pos = this._getRandomStreetPosition(28, 55);
      this.spawnMilitary(pos.x, pos.z);
    }

    // 6. Megaphone Warden deployment (1-2 active Wardens patrolling the streets)
    const targetWardens = Math.min(2, Math.max(1, 1 + Math.floor(this.panicLevel * 1.5)));
    if (this.wardens.length < targetWardens) {
      const pos = this._getRandomStreetPosition(35, 75);
      this.spawnWarden(pos.x, pos.z);
    }
  }

  /**
   * Fast 2D line-of-sight check against building obstacles in SpatialGrid.
   */
  _checkLineOfSight(x0, z0, x1, z1, spatialGrid) {
    if (!spatialGrid || !spatialGrid.obstacles) return true;
    const obstacles = spatialGrid.obstacles;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;

    const steps = Math.min(12, Math.max(4, Math.floor(dist / 1.5)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      for (let i = 0; i < obstacles.length; i++) {
        const b = obstacles[i];
        if (px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Ground shockwave and prop knocking for Titan footsteps
   */
  _triggerTitanFootstep(x, z) {
    if (this.particles && this.particles.burstShockwave) {
      this.particles.burstShockwave(x, z, 4.0);
    }
    if (this.onTitanFootstep) {
      this.onTitanFootstep(x, z);
    }
    if (this.onCameraShake) {
      this.onCameraShake(0.18, 0.2);
    }

    // Knock away street props within 5.0m
    if (this.cityStreamer && this.cityStreamer.getNearbyKnockableProps) {
      const props = this.cityStreamer.getNearbyKnockableProps(x, z, 5.0);
      for (let i = 0; i < props.length; i++) {
        const prop = props[i];
        if (!prop.knocked) {
          prop.knocked = true;
          this.score += 25;
          const kx = prop.x - x;
          const kz = prop.z - z;
          const kd = Math.hypot(kx, kz) || 1;
          if (this.onPropKnocked) {
            this.onPropKnocked(prop, kx / kd, kz / kd);
          }
        }
      }
    }
  }

  /**
   * Total Conversion Stomp: Instantly turns nearby Civilians, Hazmats, and Soldiers into zombies
   */
  _performTitanStomp(x, z) {
    const stompRadius = 3.8;

    // 1. Instant Civilian Conversion
    for (let ci = this.civilians.length - 1; ci >= 0; ci--) {
      const c = this.civilians[ci];
      if (c.hidden) continue;
      if (Math.hypot(c.x - x, c.z - z) <= stompRadius) {
        this.convertCivilianToZombie(ci);
      }
    }

    // 2. Instant Hazmat Conversion
    for (let hi = this.hazmats.length - 1; hi >= 0; hi--) {
      const h = this.hazmats[hi];
      if (Math.hypot(h.x - x, h.z - z) <= stompRadius) {
        const hx = h.x;
        const hz = h.z;
        this.hazmats.splice(hi, 1);
        const newZ = {
          id: this._nextId++,
          type: 'zombie',
          x: hx,
          z: hz,
          vx: 0,
          vz: 0,
          radius: 0.5,
          walkPhase: 0,
          convertAnim: 1.0,
          flail: 0.8,
          colorVariation: 0,
          cureExposure: 0,
          sprayExposure: 0,
        };
        this.zombies.push(newZ);
        this.score += 50;
        if (this.onHazmatDestroyed) this.onHazmatDestroyed(hx, hz);
        if (this.particles && this.particles.burstInfectionDroplets) {
          this.particles.burstInfectionDroplets(hx, hz, 8);
        }
      }
    }

    // 3. Instant Military Conversion
    for (let mi = this.militaryUnits.length - 1; mi >= 0; mi--) {
      const m = this.militaryUnits[mi];
      if (Math.hypot(m.x - x, m.z - z) <= stompRadius) {
        const mx = m.x;
        const mz = m.z;
        this.militaryUnits.splice(mi, 1);
        const newZ = {
          id: this._nextId++,
          type: 'zombie',
          x: mx,
          z: mz,
          vx: 0,
          vz: 0,
          radius: 0.5,
          walkPhase: 0,
          convertAnim: 1.0,
          flail: 0.8,
          colorVariation: 1,
          cureExposure: 0,
          sprayExposure: 0,
        };
        this.zombies.push(newZ);
        this.score += 75;
        if (this.onMilitaryInfected) this.onMilitaryInfected(mx, mz);
        if (this.particles && this.particles.burstInfectionDroplets) {
          this.particles.burstInfectionDroplets(mx, mz, 8);
        }
      }
    }

    // 4. Instant Warden Conversion
    for (let wi = this.wardens.length - 1; wi >= 0; wi--) {
      const w = this.wardens[wi];
      if (Math.hypot(w.x - x, w.z - z) <= stompRadius) {
        this.convertWardenToZombie(wi);
      }
    }
  }
}
