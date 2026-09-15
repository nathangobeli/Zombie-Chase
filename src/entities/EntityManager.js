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
    this.onCarSmashed = null;         // (carProp, hitDirX, hitDirZ)
    this.onExplosion = null;          // (x, z)
    this.onTitanActivated = null;     // ()
    this.onTitanExpired = null;       // ()
    this.onTitanFootstep = null;      // (x, z)
    this.onMilitarySnipe = null;      // (x, z)
    this.onMilitaryInfected = null;   // (x, z)
    this.onCameraShake = null;        // (intensity, duration)
    this.onStageChanged = null;       // (stage, stageName)
    this.onQuarantineOverrun = null;  // (zone, rewardType)
    this.onTankFired = null;          // (tankX, tankZ, targetX, targetZ)

    // 4-Stage Progressive Difficulty Curve
    this.currentStage = 1;
    this.cureThreshold = 3.5;         // Base progressive stage cure window
    this.followerCureThreshold = 0.55; // Calibrated ~0.55s continuous mist window for follower zombies
    this.quarantineZones = new Map();  // Active Fortified Quarantine Outposts

    // Safe Zone parameters & callbacks (@designer, @artist & @qa)
    this.safeZones = new Map();
    this.safeZoneChannelTimer = 0;
    this.safeZoneChannelTarget = 1.5;
    this.isChannelingSafeZone = false;
    this.onSafeZoneProgress = null;   // (isChanneling, progress, remainingTime)
    this.onSafeZoneDeposit = null;    // (count, pointsAwarded)

    // Mutation Lab meta-progression enhancement buffs
    this.activeEnhancements = {};
    this.titanDurationBuff = 15.0;
    this.swarmSpeedMultiplier = 1.0;
    this.enhancementFollowerCureMult = 1.0;

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
    this.isPhalanx = false;
    this.onPhalanxChanged = null;

    // Dynamic Panic Pacing & Reduction
    this.panicAccumulated = 0;
    this.panicReduction = 0;
    this.panicPauseTimer = 0;
    this.mediaBlackoutTimer = 0;
    this.onPanicChanged = null;

    // Roguelite Mutation Rewards
    this.onShowMutationModal = null; // (callback)
    this.mutations = { acidicBlood: false, bruteBone: false, hyperInfectious: false };
    this.infectionHitRadiusMultiplier = 1.0;

    // Advanced Enemies: Attack Helicopters & Tanks
    this.helicopters = [];
    this.tanks = [];

    // Systemic Environmental & Acid Hazards
    this.acidPuddles = [];
    this.waterPuddles = [];

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
    this.isPhalanx = false;
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
    this.panicAccumulated = 0;
    this.panicReduction = 0;
    this.panicPauseTimer = 0;
    this.mediaBlackoutTimer = 0;
    this.followerCureThreshold = 0.55 * (this.enhancementFollowerCureMult || 1.0);
    this.infectionHitRadiusMultiplier = this.activeEnhancements?.civilianPheromone ? 1.35 : 1.0;
    this.mutations = { acidicBlood: false, bruteBone: false, hyperInfectious: false };

    // Clean up dynamic meshes for helicopters, tanks, and puddles
    if (this.scene) {
      for (const h of this.helicopters) {
        if (h.mesh) this.scene.remove(h.mesh);
      }
      for (const t of this.tanks) {
        if (t.mesh) this.scene.remove(t.mesh);
      }
      for (const ap of this.acidPuddles) {
        if (ap.mesh) this.scene.remove(ap.mesh);
      }
      for (const wp of this.waterPuddles) {
        if (wp.mesh) this.scene.remove(wp.mesh);
      }
      if (this.gasClouds) {
        for (const gc of this.gasClouds) {
          if (gc.mesh) this.scene.remove(gc.mesh);
        }
      }
    }
    this.helicopters = [];
    this.tanks = [];
    this.acidPuddles = [];
    this.waterPuddles = [];
    this.gasClouds = [];

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
    this.followerCureThreshold = 0.55 * (this.enhancementFollowerCureMult || 1.0);
    this.quarantineZones.clear();
    this.safeZones.clear();
    this.safeZoneChannelTimer = 0;
    this.isChannelingSafeZone = false;

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

    const px = this.patientZero ? this.patientZero.x : 0;
    const pz = this.patientZero ? this.patientZero.z : 0;
    const angle = Math.random() * Math.PI * 2;
    const rad = minDist + Math.random() * (maxDist - minDist);
    return {
      x: px + Math.cos(angle) * rad,
      z: pz + Math.sin(angle) * rad,
    };
  }

  spawnCivilian(x, z) {
    if (x === undefined || z === undefined) {
      let attempts = 0;
      let pos;
      const pzX = this.patientZero ? this.patientZero.x : 0;
      const pzZ = this.patientZero ? this.patientZero.z : 0;
      do {
        pos = this._getRandomStreetPosition(25, 90);
        attempts++;
      } while (pos && Math.hypot(pos.x - pzX, pos.z - pzZ) < 22.0 && attempts < 15);
      x = pos ? pos.x : pzX + 35;
      z = pos ? pos.z : pzZ + 35;
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
      colorVariation: Math.floor(Math.random() * 6),
      variant: Math.floor(Math.random() * 6),
    };

    this.civilians.push(civilian);
    return civilian;
  }

  spawnStrayZombie(x, z) {
    if (x === undefined || z === undefined) {
      let attempts = 0;
      let pos;
      const pzX = this.patientZero ? this.patientZero.x : 0;
      const pzZ = this.patientZero ? this.patientZero.z : 0;
      do {
        pos = this._getRandomStreetPosition(35, 95);
        attempts++;
      } while (pos && Math.hypot(pos.x - pzX, pos.z - pzZ) < 32.0 && attempts < 15);
      x = pos ? pos.x : pzX + 45;
      z = pos ? pos.z : pzZ + 45;
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
   * Toggle or set Phalanx / Shield Wall formation (defensive ring wrapping Patient Zero)
   */
  setPhalanx(isPhalanx) {
    this.isPhalanx = !!isPhalanx;
    if (this.onPhalanxChanged) {
      this.onPhalanxChanged(this.isPhalanx);
    }
  }

  /**
   * Reduce city Panic meter by a specific amount (e.g. 0.20 for Quarantine Overrun, 0.15 for Media Blackout)
   */
  reducePanic(amount) {
    this.panicReduction = (this.panicReduction || 0) + amount;
    this.panicLevel = Math.max(0.0, Math.min(1.0, (this.panicLevel || 0) - amount));
    this.panicAccumulated = this.panicLevel;
    this._checkPanicMilestones();
    this._syncPanicUI();
  }

  /**
   * Directly sets panic level for test assertions or debug tooling
   */
  setPanicLevel(val) {
    this.panicLevel = Math.max(0.0, Math.min(1.0, val));
    this.panicAccumulated = this.panicLevel;
    this.panicReduction = 0;
    this.panicPauseTimer = 0;
    this.mediaBlackoutTimer = 0;
    this._checkPanicMilestones();
    this._syncPanicUI();
  }

  /**
   * Evaluates escalation thresholds when panic changes
   */
  _checkPanicMilestones() {
    if (this.panicLevel >= 0.85 && this._lastPanicMilestone < 3) {
      this._lastPanicMilestone = 3;
      if (this.onPanicEscalation) this.onPanicEscalation('🚨 85% PANIC: ARMORED BATTLE TANKS AT INTERSECTIONS!');
    } else if (this.panicLevel >= 0.60 && this._lastPanicMilestone < 2) {
      this._lastPanicMilestone = 2;
      if (this.onPanicEscalation) this.onPanicEscalation('🚁 60% PANIC: ATTACK HELICOPTER INBOUND WITH SPOTLIGHT!');
    } else if (this.panicLevel >= 0.30 && this._lastPanicMilestone < 1) {
      this._lastPanicMilestone = 1;
      if (this.onPanicEscalation) this.onPanicEscalation('🚨 30% PANIC: RIOT VEHICLES DISPATCHED WITH 360° MIST!');
    }

    if (this.panicLevel < 0.30) {
      this._lastPanicMilestone = 0;
    } else if (this.panicLevel < 0.60) {
      this._lastPanicMilestone = Math.min(this._lastPanicMilestone, 1);
    } else if (this.panicLevel < 0.85) {
      this._lastPanicMilestone = Math.min(this._lastPanicMilestone, 2);
    }
  }

  /**
   * Immediately syncs panic values to DOM HUD and telemetry
   */
  _syncPanicUI() {
    if (typeof window !== 'undefined') {
      if (window.__GAME_STATE__) {
        window.__GAME_STATE__.panicLevel = Math.round((this.panicLevel || 0) * 100) / 100;
      }
      const valEl = document.getElementById('panic-val');
      if (valEl) valEl.textContent = `${Math.round((this.panicLevel || 0) * 100)}%`;
      const barFill = document.getElementById('panic-bar-fill');
      if (barFill) barFill.style.width = `${Math.min(100, Math.round((this.panicLevel || 0) * 100))}%`;
    }
    if (typeof this.onPanicChanged === 'function') {
      this.onPanicChanged(this.panicLevel);
    }
  }

  /**
   * Applies permanent Roguelite run mutation:
   * - 'acidicBlood': Slain followers leave toxic puddles that stun Hazmat/Military for 3s
   * - 'bruteBone': +40% follower resistance against mist
   * - 'hyperInfectious': +25% wider infection reach
   */
  applyMutation(mutationId) {
    if (!this.mutations) {
      this.mutations = { acidicBlood: false, bruteBone: false, hyperInfectious: false };
    }
    this.mutations[mutationId] = true;

    if (mutationId === 'bruteBone') {
      this.followerCureThreshold = 0.55 * 1.4;
      if (this.onPanicEscalation) {
        this.onPanicEscalation('🦴 BRUTE BONE MUTATION: +40% MIST RESISTANCE!');
      }
    } else if (mutationId === 'hyperInfectious') {
      this.infectionHitRadiusMultiplier = 1.25;
      if (this.onPanicEscalation) {
        this.onPanicEscalation('☣️ HYPER-INFECTIOUS MUTATION: +25% INFECTION REACH!');
      }
    } else if (mutationId === 'acidicBlood') {
      if (this.onPanicEscalation) {
        this.onPanicEscalation('🧪 ACIDIC BLOOD MUTATION: SLAIN ZOMBIES EMIT STUNNING ACID!');
      }
    }
  }

  /**
   * Decontaminates a single follower zombie into a civilian, applying Acidic Blood if active
   */
  decontaminateFollowerZombie(z) {
    const idx = this.zombies.indexOf(z);
    if (idx === -1) return null;
    const stray = this.zombies.splice(idx, 1)[0];
    const civ = {
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
    };
    this.civilians.push(civ);
    if (this.onCured) {
      this.onCured(stray.x, stray.z);
    }
    if (this.mutations && this.mutations.acidicBlood) {
      this.spawnAcidPuddle(stray.x, stray.z);
    }
    return civ;
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
      this.titanVirusTimer = this.titanDurationBuff || 15.0;
      this.isTitan = true;
      this.isSprayInvulnerable = true;
      if (this.particles && this.particles.burstTitanPuff && this.patientZero) {
        this.particles.burstTitanPuff(this.patientZero.x, this.patientZero.z);
      }
      if (this.onTitanActivated) this.onTitanActivated();
    } else if (typeId === 'media_blackout') {
      // Explicitly subtract 15% (0.15) from current panic state variable, clamped >= 0
      this.panicLevel = Math.max(0.0, (this.panicLevel || 0) - 0.15);
      this.panicAccumulated = this.panicLevel;
      this.panicReduction = (this.panicReduction || 0) + 0.15;
      this.panicPauseTimer = 10.0;
      this.mediaBlackoutTimer = 10.0;
      this._checkPanicMilestones();
      this._syncPanicUI();
      if (this.onPanicEscalation) this.onPanicEscalation('📡 MEDIA BLACKOUT: -15% PANIC & 10s TRANSMISSION PAUSE!');
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

    // Main panic accumulation loop (strictly respects panicPauseTimer / mediaBlackoutTimer)
    const isPanicPaused = (this.panicPauseTimer > 0.0001) || (this.mediaBlackoutTimer > 0.0001);
    if (isPanicPaused) {
      const remaining = Math.max(this.panicPauseTimer || 0, this.mediaBlackoutTimer || 0) - dt;
      this.panicPauseTimer = remaining <= 0.0001 ? 0 : remaining;
      this.mediaBlackoutTimer = this.panicPauseTimer;
      // While paused, panic accumulation is strictly suspended and panicLevel remains completely static
    } else {
      this.panicPauseTimer = 0;
      this.mediaBlackoutTimer = 0;
      // 50% slower passive panic accumulation rate (scales over 180s baseline)
      this.panicLevel = Math.max(0.0, Math.min(1.0, (this.panicLevel || 0) + dt / 180.0));
      this.panicAccumulated = this.panicLevel;
      this._checkPanicMilestones();
    }
    this._syncPanicUI();

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
    if (this.isPhalanx) {
      this.currentFormation = 'shield_wall';
    } else if (this.isSqueeze) {
      this.currentFormation = 'squeeze';
    } else if (inputMag > 0.05) {
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
    } else {
      // Titan virus duration expired: immediately exit Titan demolition state
      this.isTitan = false;

      // Smoothly shrink down visual model back to normal size
      if (this.pzVisualScale > 1.0) {
        this.pzVisualScale += (1.0 - this.pzVisualScale) * (dt * 5.5);
        if (Math.abs(this.pzVisualScale - 1.0) < 0.05) {
          this.pzVisualScale = 1.0;
          if (this.particles && this.particles.burstTitanPuff) {
            this.particles.burstTitanPuff(pz.x, pz.z);
          }
          if (this.onTitanExpired) this.onTitanExpired();
        }
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
    pz.isTitan = !!(this.isTitan && this.titanVirusTimer > 0);
    pz.hordeCount = this.zombies.length;
    spatialGrid.resolveObstacles(pz, pz.radius * (pz.isTitan ? 1.8 : 1.0), true, pzPrevX, pzPrevZ);

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

      const swarmMult = this.swarmSpeedMultiplier || 1.0;
      z.vx += steerX * dt * 6.0 * swarmMult;
      z.vz += steerZ * dt * 6.0 * swarmMult;

      // Dynamic catch-up speed limit so zombies NEVER fall behind Patient Zero
      const distToPz = Math.hypot(pz.x - z.x, pz.z - z.z);
      let zSpeedLimit = (pz.isFrenzy ? 12.0 : (this.currentFormation === 'spearhead' ? 9.1 : 7.6)) * swarmMult;
      if (distToPz > 3.5) {
        // Accelerate up to 11.5 m/s when catching up to the pack
        zSpeedLimit += Math.min(4.0, (distToPz - 3.5) * 0.7) * swarmMult;
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
      z.isTitan = pz.isTitan;
      z.hordeCount = this.zombies.length;
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

      // Captive civilians remain huddled inside the fortified quarantine outpost
      if (c.isCaptive && c.guardCenter) {
        const gdx = c.x - c.guardCenter.x;
        const gdz = c.z - c.guardCenter.z;
        const gDist = Math.hypot(gdx, gdz);
        if (gDist > 4.5) {
          c.vx = -(gdx / gDist) * 1.5;
          c.vz = -(gdz / gDist) * 1.5;
        } else {
          c.vx *= 0.25;
          c.vz *= 0.25;
        }
      }

      // Meat Magnet vacuum pull towards Patient Zero
      if (this.meatMagnetTimer > 0 && !c.isCaptive) {
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
    const hitRadiusMult = this.infectionHitRadiusMultiplier || 1.0;
    for (let i = this.strayZombies.length - 1; i >= 0; i--) {
      const s = this.strayZombies[i];
      let recruited = false;

      const pzDist = Math.hypot(s.x - pz.x, s.z - pz.z);
      if (pzDist <= (s.radius + pz.radius + 0.4) * hitRadiusMult) {
        recruited = true;
      }

      if (!recruited) {
        spatialGrid.forEachNearby(s.x, s.z, (s.radius + 0.8) * hitRadiusMult, (neighbor, distSq) => {
          if (neighbor.type === 'zombie') {
            const minDist = (s.radius + neighbor.radius + 0.3) * hitRadiusMult;
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
    // Meat Magnet triples infection radius, Hyper-Infectious adds +25% reach
    const reachBonus = this.meatMagnetTimer > 0 ? 3.0 : 0.0;
    for (let i = this.civilians.length - 1; i >= 0; i--) {
      const c = this.civilians[i];

      // Captive civilians are protected behind outpost barricades until the zone is overrun
      if (c.isCaptive) {
        continue;
      }

      // Newly cured civilians have temporary chemical immunity from re-infection
      if (c.cureImmunity > 0) {
        c.cureImmunity -= dt;
        continue;
      }

      let infected = false;

      const pzDist = Math.hypot(c.x - pz.x, c.z - pz.z);
      if (pzDist <= (c.radius + pz.radius + 0.15 + reachBonus) * hitRadiusMult) {
        infected = true;
      }

      if (!infected) {
        spatialGrid.forEachNearby(c.x, c.z, (c.radius + 0.7 + reachBonus) * hitRadiusMult, (neighbor, distSq) => {
          if (neighbor.type === 'zombie') {
            const minDist = (c.radius + neighbor.radius + 0.15 + reachBonus) * hitRadiusMult;
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

      // Stun check (from Acid or Electrified water puddles)
      if (h.stunTimer > 0) {
        h.stunTimer = Math.max(0, h.stunTimer - dt);
        h.vx = 0;
        h.vz = 0;
        continue;
      }

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

      // Quarantine Outpost Garrison AI (@designer & @qa):
      // Stationed at choke points with overlapping spray cones covering perimeter entrances
      if (h.isQuarantineGarrison && h.guardCenter) {
        let closestDist = 14.0;
        let threat = null;
        const pzDist = Math.hypot(pz.x - h.x, pz.z - h.z);
        if (pzDist < closestDist) {
          closestDist = pzDist;
          threat = pz;
        }
        for (let zi = 0; zi < this.zombies.length; zi++) {
          const z = this.zombies[zi];
          const zd = Math.hypot(z.x - h.x, z.z - h.z);
          if (zd < closestDist) {
            closestDist = zd;
            threat = z;
          }
        }

        if (threat) {
          h.angle = Math.atan2(threat.x - h.x, threat.z - h.z);
        } else if (h.stationAngle !== undefined) {
          h.angle = h.stationAngle;
        }
        h.speed = 0;
        h.vx = 0;
        h.vz = 0;
      } else {
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
      const activeCureThreshold = this.followerCureThreshold || 0.55;

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
            // Sustained exposure inside spray cone cures zombie back to civilian (~0.55s continuous exposure)!
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
        const wasGarrison = h.isQuarantineGarrison;
        this.hazmats.splice(hIdx, 1);
        if (!wasGarrison) {
          setTimeout(() => {
            if (this.hazmats.length < 2 && this.zombies.length >= 15) {
              this.spawnHazmat();
            }
          }, 12000);
        }
      }
    }

    // Patient Zero Spray Threat (@designer & @qa):
    // 1. Maintain absolute invulnerability for Patient Zero while hordeCount > 0 (followers deplete first)
    // 2. When hordeCount === 0: trigger calibrated 3.5s sustained Last Stand exposure before GAME OVER
    const maxLastStandTime = 3.5;
    if (this.zombies.length > 0) {
      pz.isSpraySlowed = false;
      this.pzSprayTime = 0;
      if (this.onPatientZeroSprayed) {
        this.onPatientZeroSprayed(dt, 0.0, maxLastStandTime);
      }
    } else {
      if (pzHitBySprayThisFrame && !this.isSprayInvulnerable) {
        pz.isSpraySlowed = true;
        this.pzSprayTime = Math.min(maxLastStandTime, (this.pzSprayTime || 0) + dt);
        if (this.onHazmatDamageDealt) {
          this.onHazmatDamageDealt(dt);
        }
        const progress = Math.min(1.0, this.pzSprayTime / maxLastStandTime);
        const timeLeft = Math.max(0, maxLastStandTime - this.pzSprayTime);
        if (this.onPatientZeroSprayed) {
          this.onPatientZeroSprayed(dt, progress, timeLeft);
        }
        if (this.pzSprayTime >= maxLastStandTime) {
          if (this.onGameOver) {
            this.onGameOver('QUARANTINED!');
          }
        }
      } else {
        pz.isSpraySlowed = false;
        this.pzSprayTime = Math.max(0, (this.pzSprayTime || 0) - dt * 1.0);
        const progress = Math.min(1.0, this.pzSprayTime / maxLastStandTime);
        const timeLeft = Math.max(0, maxLastStandTime - this.pzSprayTime);
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

      // Stun check (from Acid or Electrified water puddles)
      if (m.stunTimer > 0) {
        m.stunTimer = Math.max(0, m.stunTimer - dt);
        m.laserTarget = null;
        m.chargeTimer = 0;
        continue;
      }

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
      } else if (m.isQuarantineGarrison && m.sandbagCoverPos) {
        m.state = 'patrol';
        m.targetPos = null;
        m.aimTimer = 0;
        m.speed = 0;
        m.vx = 0;
        m.vz = 0;
        m.x = m.sandbagCoverPos.x;
        m.z = m.sandbagCoverPos.z;
        m.angle = m.patrolAngle;
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

    // 11. Titan Demolition Physics: ONLY when actively in the Titan state (this.isTitan && this.titanVirusTimer > 0)
    const isActivelyTitan = this.isTitan && this.titanVirusTimer > 0;
    if (isActivelyTitan && this.cityStreamer && this.cityStreamer.getNearbyKnockableProps) {
      const checkRadius = 16.0;
      const nearbyProps = this.cityStreamer.getNearbyKnockableProps(pz.x, pz.z, checkRadius);
      for (let pi = 0; pi < nearbyProps.length; pi++) {
        const prop = nearbyProps[pi];
        if (prop.knocked) continue;

        // Titan reach is ~3.0m
        const pzReach = 3.0;
        const pzDist = Math.hypot(prop.x - pz.x, prop.z - pz.z);
        if (pzDist <= prop.radius + pzReach) {
          prop.knocked = true;
          // Collapse static vertices in propsMesh
          if (prop.chunk && prop.chunk.collapseProp) {
            prop.chunk.collapseProp(prop);
          }
          // If this was an obstacle (e.g. parked car), disable it in spatialGrid
          if (prop.obstacle) {
            prop.obstacle.disabled = true;
          }

          const hitDirX = pz.vx || 0;
          const hitDirZ = pz.vz || 0;
          if (prop.isCar) {
            this.score += 100;
            if (this.onCarSmashed) {
              this.onCarSmashed(prop, hitDirX, hitDirZ);
            }
          } else {
            this.score += 25;
            if (this.onPropKnocked) {
              this.onPropKnocked(prop, hitDirX, hitDirZ);
            }
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

    // 13a. Systemic Environmental & Acid Hazards (@designer)
    this._updatePuddles(dt);

    // 13b. Attack Helicopters Escalation (@designer)
    this._updateHelicopters(dt, pz);

    // 13c. Armored Battle Tanks Escalation (@designer)
    this._updateTanks(dt, pz, spatialGrid);

    // 13d. Quarantine Zones Overrun Evaluation (@designer, @artist & @qa)
    this._updateQuarantineZones(dt);

    // 13e. Zombie Safe Zone & Deposit Evaluation (@designer, @artist & @qa)
    this._updateSafeZones(dt, pz);

    // 14. Population Streaming & Memory Cleanup
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
      if (c.preventDespawn || c.isCaptive) continue;
      const distSq = (c.x - pzRef.x) ** 2 + (c.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.civilians.splice(i, 1);
      }
    }

    for (let i = this.strayZombies.length - 1; i >= 0; i--) {
      const s = this.strayZombies[i];
      if (s.preventDespawn) continue;
      const distSq = (s.x - pzRef.x) ** 2 + (s.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.strayZombies.splice(i, 1);
      }
    }

    for (let i = this.hazmats.length - 1; i >= 0; i--) {
      const h = this.hazmats[i];
      if (h.preventDespawn || h.isQuarantineGarrison) continue;
      const distSq = (h.x - pzRef.x) ** 2 + (h.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.hazmats.splice(i, 1);
      }
    }

    for (let i = this.militaryUnits.length - 1; i >= 0; i--) {
      const m = this.militaryUnits[i];
      if (m.preventDespawn || m.isQuarantineGarrison) continue;
      const distSq = (m.x - pzRef.x) ** 2 + (m.z - pzRef.z) ** 2;
      if (distSq > despawnRadiusSq) {
        this.militaryUnits.splice(i, 1);
      }
    }

    for (let i = this.wardens.length - 1; i >= 0; i--) {
      const w = this.wardens[i];
      if (w.preventDespawn) continue;
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
            radius: 0.65,
            angle: 0,
            stunTimer: 0,
            coneLength: 10.0,
            coneAngleRad: 0.85,
            sprayActive: true,
            health: 100,
            dropY: 0.0,
            isDropping: false,
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
          if (prop.chunk && prop.chunk.collapseProp) {
            prop.chunk.collapseProp(prop);
          }
          if (prop.obstacle) {
            prop.obstacle.disabled = true;
          }
          const kx = prop.x - x;
          const kz = prop.z - z;
          const kd = Math.hypot(kx, kz) || 1;
          if (prop.isCar) {
            this.score += 100;
            if (this.onCarSmashed) {
              this.onCarSmashed(prop, kx / kd, kz / kd);
            }
          } else {
            this.score += 25;
            if (this.onPropKnocked) {
              this.onPropKnocked(prop, kx / kd, kz / kd);
            }
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

  /**
   * Registers a newly generated Fortified Quarantine Outpost chunk.
   * Stations 4–6 Hazmat Sprayers with overlapping mist cones covering key choke points,
   * 2–3 Military Riflemen behind concrete sandbag barriers with telegraph laser sights,
   * and a trapped cluster of 8–12 captive civilians huddled inside the perimeter.
   */
  registerQuarantineZone(chunk) {
    if (!chunk || !chunk.isQuarantineZone) return null;
    if (this.quarantineZones.has(chunk.key)) return this.quarantineZones.get(chunk.key);

    const qx = chunk.quarantineCenter.x;
    const qz = chunk.quarantineCenter.z;
    const zone = {
      chunkKey: chunk.key,
      chunk: chunk,
      center: { x: qx, z: qz },
      radius: chunk.quarantineRadius || 16.0,
      isOverrun: false,
      garrisonHazmatIds: [],
      garrisonMilitaryIds: [],
      captiveCivilianIds: [],
    };

    // 1. Station 4–6 Hazmat Sprayers (5 stationed) covering perimeter access choke points
    const hazmatStations = [
      { x: qx, z: qz + 13.5, angle: 0 },                   // North choke point
      { x: qx, z: qz - 13.5, angle: Math.PI },             // South choke point
      { x: qx + 13.5, z: qz, angle: Math.PI / 2 },         // East choke point
      { x: qx - 13.5, z: qz, angle: -Math.PI / 2 },        // West choke point
      { x: qx + 1.5, z: qz + 1.5, angle: Math.PI * 0.25 }, // Center interior patrol
    ];

    for (let i = 0; i < hazmatStations.length; i++) {
      const pos = hazmatStations[i];
      const h = this.spawnHazmat(pos.x, pos.z, false);
      h.preventDespawn = true;
      h.isQuarantineGarrison = true;
      h.quarantineZoneKey = chunk.key;
      h.guardCenter = { x: qx, z: qz };
      h.guardRadius = 15.5;
      h.stationAngle = pos.angle;
      h.angle = pos.angle;
      zone.garrisonHazmatIds.push(h.id);
    }

    // 2. Station 2–3 Military Riflemen (3 stationed) behind concrete sandbag barriers
    const sandbagPosts = (chunk.quarantineSandbagPositions && chunk.quarantineSandbagPositions.length > 0)
      ? chunk.quarantineSandbagPositions
      : [
          { x: qx - 5.5, z: qz + 5.5, facingAngle: -Math.PI * 0.25 },
          { x: qx + 5.5, z: qz + 5.5, facingAngle: Math.PI * 0.25 },
          { x: qx, z: qz - 7.5, facingAngle: Math.PI * 0.85 },
        ];

    for (let i = 0; i < sandbagPosts.length; i++) {
      const sp = sandbagPosts[i];
      const soldier = {
        id: this._nextId++,
        type: 'military',
        x: sp.x,
        z: sp.z,
        vx: 0,
        vz: 0,
        radius: 0.65,
        speed: 2.1,
        angle: sp.facingAngle,
        walkPhase: Math.random() * 10,
        state: 'patrol',
        patrolTimer: 3.0,
        patrolAngle: sp.facingAngle,
        targetPos: null,
        targetEntity: null,
        aimTimer: 0,
        aimThreshold: 1.4,
        cooldownTimer: 0,
        tracerShot: null,
        preventDespawn: true,
        isQuarantineGarrison: true,
        quarantineZoneKey: chunk.key,
        sandbagCoverPos: { x: sp.x, z: sp.z },
        guardCenter: { x: qx, z: qz },
        guardRadius: 15.5,
      };
      this.militaryUnits.push(soldier);
      zone.garrisonMilitaryIds.push(soldier.id);
    }

    // 3. Trapped cluster of 8–12 captive civilians (10 civilians) huddled inside outpost
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const r = 1.0 + Math.random() * 3.5;
      const civ = {
        id: this._nextId++,
        type: 'civilian',
        x: qx + Math.cos(ang) * r,
        z: qz + Math.sin(ang) * r,
        vx: 0,
        vz: 0,
        radius: 0.5,
        speed: 0.8,
        fleeSpeed: 3.6,
        wanderAngle: Math.random() * Math.PI * 2,
        fleeTimer: 0,
        walkPhase: 0,
        colorVariation: Math.floor(Math.random() * 6),
        variant: Math.floor(Math.random() * 6),
        cureFlail: 0,
        cureImmunity: 0,
        preventDespawn: true,
        isCaptive: true,
        quarantineZoneKey: chunk.key,
        guardCenter: { x: qx, z: qz },
      };
      this.civilians.push(civ);
      zone.captiveCivilianIds.push(civ.id);
    }

    this.quarantineZones.set(chunk.key, zone);
    return zone;
  }

  /**
   * Unregisters a quarantine outpost when its chunk is unloaded.
   */
  unregisterQuarantineZone(chunkKey) {
    if (!this.quarantineZones.has(chunkKey)) return;
    const zone = this.quarantineZones.get(chunkKey);
    // If not overrun, purge lingering captive civilians and garrison units
    if (!zone.isOverrun) {
      for (let i = this.civilians.length - 1; i >= 0; i--) {
        if (this.civilians[i].quarantineZoneKey === chunkKey) {
          this.civilians.splice(i, 1);
        }
      }
      for (let i = this.hazmats.length - 1; i >= 0; i--) {
        if (this.hazmats[i].quarantineZoneKey === chunkKey) {
          this.hazmats.splice(i, 1);
        }
      }
      for (let i = this.militaryUnits.length - 1; i >= 0; i--) {
        if (this.militaryUnits[i].quarantineZoneKey === chunkKey) {
          this.militaryUnits.splice(i, 1);
        }
      }
    }
    this.quarantineZones.delete(chunkKey);
  }

  /**
   * Spawns a synthetic Quarantine Outpost at specific coordinates (for testing and manual triggering).
   */
  spawnQuarantineOutpost(x, z) {
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
    ringMesh.position.set(x, 0.28, z);
    if (this.scene) this.scene.add(ringMesh);

    let bannerSprite = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      if (ctx.roundRect) ctx.roundRect(8, 8, 496, 112, 16); else ctx.rect(8, 8, 496, 112);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();
      ctx.font = '900 24px sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️ HIGH-RISK QUARANTINE ZONE', 256, 48);

      const bannerTex = new THREE.CanvasTexture(canvas);
      const bannerMat = new THREE.SpriteMaterial({ map: bannerTex, transparent: true });
      bannerSprite = new THREE.Sprite(bannerMat);
      bannerSprite.scale.set(9.0, 2.25, 1.0);
      bannerSprite.position.set(x, 4.8, z);
      if (this.scene) this.scene.add(bannerSprite);
    }

    const mockChunk = {
      key: `custom_${Math.round(x)},${Math.round(z)}`,
      isQuarantineZone: true,
      quarantineRadius: 16.0,
      quarantineCenter: { x, z },
      quarantineRingMesh: ringMesh,
      quarantineBannerSprite: bannerSprite,
      quarantineSandbagPositions: [
        { x: x - 5.5, z: z + 5.5, facingAngle: -Math.PI * 0.25 },
        { x: x + 5.5, z: z + 5.5, facingAngle: Math.PI * 0.25 },
        { x: x, z: z - 7.5, facingAngle: Math.PI * 0.85 },
      ],
      quarantineOverrun: false,
      meshes: [ringMesh, bannerSprite].filter(Boolean),
    };
    return this.registerQuarantineZone(mockChunk);
  }

  /**
   * Evaluates active quarantine zones for Overrun victory conditions:
   * When all stationed Hazmats and Military units are converted or eliminated:
   * 1. Award +1,500 score bonus.
   * 2. Free captive civilians (immediately vulnerable to infection).
   * 3. Spawn guaranteed high-tier drop ("Titan Virus" or "Meat Magnet").
   * 4. Trigger onQuarantineOverrun callback with animated banner.
   */
  _updateQuarantineZones(dt) {
    if (!this.quarantineZones || this.quarantineZones.size === 0) return;

    for (const [key, zone] of this.quarantineZones) {
      if (zone.isOverrun) continue;

      let livingHazmats = 0;
      for (let hi = 0; hi < this.hazmats.length; hi++) {
        if (this.hazmats[hi].quarantineZoneKey === key) {
          livingHazmats++;
        }
      }

      let livingMilitary = 0;
      for (let mi = 0; mi < this.militaryUnits.length; mi++) {
        if (this.militaryUnits[mi].quarantineZoneKey === key) {
          livingMilitary++;
        }
      }

      if (livingHazmats === 0 && livingMilitary === 0) {
        zone.isOverrun = true;
        if (zone.chunk) {
          zone.chunk.quarantineOverrun = true;
          zone.chunk._overrunTime = 0;
        }

        // 1. Massive Score Bonus: +1,500 points
        this.score += 1500;

        // 2. Reduce Panic by 20% on clearing Quarantine Zone (@designer)
        this.reducePanic(0.20);

        // 3. Free trapped captive civilians
        let freedCount = 0;
        for (let ci = 0; ci < this.civilians.length; ci++) {
          const c = this.civilians[ci];
          if (c.quarantineZoneKey === key && c.isCaptive) {
            c.isCaptive = false;
            c.preventDespawn = false;
            c.fleeTimer = 5.0;
            c.fleeSpeed = 4.2;
            c.cureImmunity = 0; // Immediately vulnerable to infection!
            freedCount++;
          }
        }

        // 4. Guaranteed High-Tier Drop: "Titan Virus" or "Meat Magnet"
        const rewardType = Math.random() < 0.5 ? 'titan_virus' : 'meat_magnet';

        // 5. Fire event callback
        if (this.onQuarantineOverrun) {
          this.onQuarantineOverrun(zone, rewardType, freedCount);
        }

        // 6. Roguelite Mutation Selection Modal (@designer)
        if (this.onShowMutationModal) {
          this.onShowMutationModal();
        }
      }
    }
  }

  // =========================================================================
  // ZOMBIE SAFE ZONES & DEPOSIT REFUGE SYSTEM (@designer, @artist & @qa)
  // =========================================================================

  /**
   * Registers a newly streamed Safe Zone chunk.
   */
  registerSafeZone(chunk) {
    if (!chunk || !chunk.isSafeZone || !chunk.safeZone) return null;
    if (this.safeZones.has(chunk.key)) return this.safeZones.get(chunk.key);
    const zone = {
      chunkKey: chunk.key,
      x: chunk.safeZone.x,
      z: chunk.safeZone.z,
      radius: chunk.safeZone.radius || 5.5,
      halfW: chunk.safeZone.halfW || 5.0,
      halfD: chunk.safeZone.halfD || 5.0,
      chunkRef: chunk,
    };
    this.safeZones.set(chunk.key, zone);
    return zone;
  }

  /**
   * Unregisters a safe zone when its chunk is unstreamed.
   */
  unregisterSafeZone(chunkKey) {
    this.safeZones.delete(chunkKey);
  }

  /**
   * Spawns a synthetic Safe Zone at given coordinates (for testing and manual triggers).
   */
  spawnSafeZone(x, z) {
    const mockChunk = {
      key: `mock_safe_${x}_${z}`,
      isSafeZone: true,
      safeZone: { x, z, radius: 5.5, halfW: 5.0, halfD: 5.0 },
    };
    return this.registerSafeZone(mockChunk);
  }

  /**
   * Evaluates Patient Zero positioning inside Safe Zone AABB and ticks channeling.
   */
  _updateSafeZones(dt, pz) {
    if (!this.safeZones || this.safeZones.size === 0 || !pz) {
      if (this.isChannelingSafeZone) {
        this.isChannelingSafeZone = false;
        this.safeZoneChannelTimer = 0;
        if (this.onSafeZoneProgress) this.onSafeZoneProgress(false, 0, 0);
      }
      return;
    }

    let insideZone = null;
    for (const [, zone] of this.safeZones) {
      const dx = Math.abs(pz.x - zone.x);
      const dz = Math.abs(pz.z - zone.z);
      if (dx <= zone.halfW && dz <= zone.halfD) {
        insideZone = zone;
        break;
      }
    }

    // Only channel if inside a safe zone AND player has follower zombies
    if (insideZone && this.zombies.length > 0) {
      this.isChannelingSafeZone = true;
      this.safeZoneChannelTimer += dt;
      const progress = Math.min(1.0, this.safeZoneChannelTimer / this.safeZoneChannelTarget);
      const remainingTime = Math.max(0, this.safeZoneChannelTarget - this.safeZoneChannelTimer);

      if (this.onSafeZoneProgress) {
        this.onSafeZoneProgress(true, progress, remainingTime);
      }

      if (this.safeZoneChannelTimer >= this.safeZoneChannelTarget) {
        this.depositSwarmToSafeZone(insideZone);
      }
    } else {
      if (this.isChannelingSafeZone) {
        this.isChannelingSafeZone = false;
        this.safeZoneChannelTimer = 0;
        if (this.onSafeZoneProgress) {
          this.onSafeZoneProgress(false, 0, 0);
        }
      }
    }
  }

  /**
   * Completes Safe Zone deposit: removes all followers, awards points,
   * triggers Alone & Hunted countdown, and emits deposit callback.
   */
  depositSwarmToSafeZone(zone) {
    const count = this.zombies.length;
    if (count === 0) return;

    // Visual poofs for all deposited zombies
    for (let zi = 0; zi < this.zombies.length; zi++) {
      const z = this.zombies[zi];
      if (this.particles && this.particles.burstInfectionPuff) {
        this.particles.burstInfectionPuff(z.x, z.z, 0x10b981);
      }
    }

    // Clear follower zombies
    this.zombies.length = 0;

    // Award +250 points per deposited zombie
    const pointsAwarded = count * 250;
    this.score += pointsAwarded;

    // Instantly trigger "Alone & Hunted" survival countdown
    this.hasHadHorde = true;
    this.isAloneHunted = true;
    this.aloneTimer = this.maxAloneTime;
    if (this.onAloneStateChanged) {
      this.onAloneStateChanged(true, this.aloneTimer, this.maxAloneTime);
    }

    // Explicitly persist banked zombies to localStorage ('zombie_chase_bank')
    try {
      if (this.storageSystem && typeof this.storageSystem.addBankedZombies === 'function') {
        this.bankedZombies = this.storageSystem.addBankedZombies(count);
      } else if (typeof localStorage !== 'undefined') {
        const stored = parseInt(localStorage.getItem('zombie_chase_bank') || localStorage.getItem('zombie_chase_banked') || '0', 10) || 0;
        const total = stored + count;
        localStorage.setItem('zombie_chase_bank', String(total));
        localStorage.setItem('zombie_chase_banked', String(total));
        this.bankedZombies = total;
      }
    } catch (e) {
      console.warn('[EntityManager] Failed to persist banked zombies to localStorage:', e);
    }

    // Reset channel state
    this.isChannelingSafeZone = false;
    this.safeZoneChannelTimer = 0;
    if (this.onSafeZoneProgress) {
      this.onSafeZoneProgress(false, 0, 0);
    }

    // Dispatch event to main.js / UI
    if (this.onSafeZoneDeposit) {
      this.onSafeZoneDeposit(count, pointsAwarded);
    }
  }

  /**
   * Applies active Mutation Lab enhancement buffs (@designer & @qa).
   */
  applyEnhancementBuffs(enhancements = {}) {
    this.activeEnhancements = { ...this.activeEnhancements, ...enhancements };

    // 1. Titan Duration +50%: base is 15.0s, buffed is 22.5s
    if (this.activeEnhancements.titanDuration) {
      this.titanDurationBuff = 22.5;
    } else {
      this.titanDurationBuff = 15.0;
    }

    // 2. Swarm Speed +20%: multiplier for zombies in swarm
    if (this.activeEnhancements.swarmSpeed) {
      this.swarmSpeedMultiplier = 1.20;
    } else {
      this.swarmSpeedMultiplier = 1.0;
    }

    // 3. Civilian Pheromone Attraction: increases infection hit radius / attraction
    if (this.activeEnhancements.civilianPheromone) {
      this.infectionHitRadiusMultiplier = 1.35;
    } else {
      this.infectionHitRadiusMultiplier = 1.0;
    }

    // 4. Thick Skulls: increases follower cure resistance threshold by +30%
    if (this.activeEnhancements.thickSkulls) {
      this.enhancementFollowerCureMult = 1.30;
      this.followerCureThreshold = 0.55 * 1.30;
    } else {
      this.enhancementFollowerCureMult = 1.0;
      this.followerCureThreshold = 0.55;
    }
  }

  // =========================================================================
  // ADVANCED ENEMY SYSTEMS: ATTACK HELICOPTERS & ARMORED TANKS (@designer)
  // =========================================================================

  _createHelicopterMesh() {
    const group = new THREE.Group();

    // Fuselage: Slate military navy body
    const bodyGeom = new THREE.BoxGeometry(1.8, 1.3, 3.2);
    const bodyMat = new THREE.MeshToonMaterial({ color: 0x334155 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0;
    group.add(body);

    // Dark Cockpit Visor
    const glassGeom = new THREE.BoxGeometry(1.6, 0.7, 1.2);
    const glassMat = new THREE.MeshToonMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4,
    });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.set(0, 0.25, 1.1);
    group.add(glass);

    // Tail Boom
    const tailGeom = new THREE.BoxGeometry(0.4, 0.4, 3.0);
    const tailMat = new THREE.MeshToonMaterial({ color: 0x1e293b });
    const tail = new THREE.Mesh(tailGeom, tailMat);
    tail.position.set(0, 0.3, -2.4);
    group.add(tail);

    // Main Rotor Blades (spinning)
    const rotorGeom = new THREE.BoxGeometry(6.4, 0.08, 0.35);
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const rotor = new THREE.Mesh(rotorGeom, rotorMat);
    rotor.position.set(0, 0.85, 0);
    group.add(rotor);

    // Spotlight Cone (volumetric light beam down to ground Y = -18)
    const coneGeom = new THREE.ConeGeometry(8.0, 18.0, 16, 1, true);
    coneGeom.translate(0, -9.0, 0);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    group.add(cone);

    // Ground Target Reticle Ring at ground level
    const ringGeom = new THREE.RingGeometry(7.0, 8.0, 24);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const groundRing = new THREE.Mesh(ringGeom, ringMat);
    groundRing.position.y = -17.95; // Sits just above ground at Y=0.05 when heli is at Y=18
    group.add(groundRing);

    return { group, rotor, cone, coneMat, groundRing, ringMat };
  }

  spawnAttackHelicopter(x, z) {
    if (x === undefined || z === undefined) {
      const pz = this.patientZero;
      const angle = Math.random() * Math.PI * 2;
      x = (pz ? pz.x : 0) + Math.cos(angle) * 40;
      z = (pz ? pz.z : 0) + Math.sin(angle) * 40;
    }

    const meshData = this._createHelicopterMesh();
    meshData.group.position.set(x, 18.0, z);
    if (this.scene) {
      this.scene.add(meshData.group);
    }

    const heli = {
      id: this._nextId++,
      type: 'helicopter',
      x,
      z,
      y: 18.0,
      vx: 0,
      vz: 0,
      speed: 10.5,
      spotlightX: x,
      spotlightZ: z,
      spotlightSpeed: 7.5,
      lockOnTimer: 0,
      meshData,
    };
    this.helicopters.push(heli);
    return heli;
  }

  _updateHelicopters(dt, pz) {
    if (!pz) return;

    // Escalation check: Helicopters active when panicLevel >= 0.60
    if (this.panicLevel >= 0.60) {
      const desiredCount = this.panicLevel >= 0.85 ? 2 : 1;
      if (this.helicopters.length < desiredCount) {
        this.spawnAttackHelicopter();
      }
    } else {
      // Clean up helicopters if panic was reduced below 60%
      for (let i = this.helicopters.length - 1; i >= 0; i--) {
        const h = this.helicopters[i];
        if (this.scene && h.meshData) this.scene.remove(h.meshData.group);
        this.helicopters.splice(i, 1);
      }
      return;
    }

    for (let i = this.helicopters.length - 1; i >= 0; i--) {
      const h = this.helicopters[i];
      if (h.meshData && h.meshData.rotor) {
        h.meshData.rotor.rotation.y += dt * 32.0;
      }

      // 1. Helicopter physical flight tracking towards Patient Zero
      const dx = pz.x - h.x;
      const dz = pz.z - h.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.0) {
        h.vx = (dx / dist) * h.speed;
        h.vz = (dz / dist) * h.speed;
        h.x += h.vx * dt;
        h.z += h.vz * dt;
      }

      if (h.meshData && h.meshData.group) {
        h.meshData.group.position.set(h.x, 18.0, h.z);
      }

      // 2. Helicopter spotlight tracking: maximum tracking velocity capped at 7.5 m/s
      if (h.spotlightX === undefined) h.spotlightX = h.x;
      if (h.spotlightZ === undefined) h.spotlightZ = h.z;

      const sDx = pz.x - h.spotlightX;
      const sDz = pz.z - h.spotlightZ;
      const sDist = Math.hypot(sDx, sDz);
      const maxSpotlightSpeed = h.spotlightSpeed || 7.5; // 7.5 m/s maximum tracking velocity
      const maxSpotlightStep = maxSpotlightSpeed * dt;

      if (sDist <= maxSpotlightStep) {
        h.spotlightX = pz.x;
        h.spotlightZ = pz.z;
      } else if (sDist > 0) {
        h.spotlightX += (sDx / sDist) * maxSpotlightStep;
        h.spotlightZ += (sDz / sDist) * maxSpotlightStep;
      }

      // Update 3D visual position of ground ring and spotlight cone
      if (h.meshData && h.meshData.groundRing) {
        h.meshData.groundRing.position.set(h.spotlightX - h.x, -17.95, h.spotlightZ - h.z);
      }
      if (h.meshData && h.meshData.cone) {
        h.meshData.cone.position.set(
          (h.spotlightX - h.x) * 0.5,
          -9.0,
          (h.spotlightZ - h.z) * 0.5
        );
      }

      // 3. Check distance from Patient Zero to spotlight center
      const distFromSpotlight = Math.hypot(pz.x - h.spotlightX, pz.z - h.spotlightZ);

      // Player naturally outruns spotlight (> 8.0m) during Speed Surge (12 m/s) or Titan (9.375 m/s)
      if (distFromSpotlight > 8.0) {
        h.lockOnTimer = 0; // Reset airstrike timer when player outruns spotlight
        if (h.meshData && h.meshData.ringMat) {
          h.meshData.ringMat.color.setHex(0xfacc15);
          h.meshData.coneMat.color.setHex(0xfef08a);
          h.meshData.ringMat.opacity = 0.65;
        }
      } else {
        // Player lingers inside spotlight circle (<= 8.0m)
        h.lockOnTimer = (h.lockOnTimer || 0) + dt;
        if (h.meshData && h.meshData.ringMat) {
          h.meshData.ringMat.color.setHex(0xef4444);
          h.meshData.coneMat.color.setHex(0xf87171);
          h.meshData.ringMat.opacity = 0.5 + Math.sin(this.gameTime * 20.0) * 0.4;
        }

        if (h.lockOnTimer >= 2.0) {
          this.triggerAirstrike(h.spotlightX, h.spotlightZ);
          h.lockOnTimer = -3.0; // 3.0s cooldown before next lock
        }
      }
    }
  }

  triggerAirstrike(x, z) {
    if (this.particles) {
      this.particles.burstExplosion(x, z);
      this.particles.burstShockwave(x, z, 9.0);
      if (this.particles.burstCure) this.particles.burstCure(x, z);
      if (this.particles.burstDustCloud) this.particles.burstDustCloud(x, z, 20);
    }
    if (this.onCameraShake) this.onCameraShake(0.85, 0.8);
    if (this.onExplosion) this.onExplosion(x, z);

    // Impact on swarm followers within 7.5m: decontaminate 4-6 zombies back to civilians
    let decontaminatedCount = 0;
    const maxFollowersToCure = 5;
    for (let zi = this.zombies.length - 1; zi >= 0; zi--) {
      const zomb = this.zombies[zi];
      const d = Math.hypot(zomb.x - x, zomb.z - z);
      if (d <= 7.5 && decontaminatedCount < maxFollowersToCure) {
        this.decontaminateFollowerZombie(zomb);
        decontaminatedCount++;
      } else if (d <= 7.5) {
        // Violent knockback to surviving followers
        const force = (1.0 - d / 7.5) * 16.0;
        zomb.vx += ((zomb.x - x) / (d || 1)) * force;
        zomb.vz += ((zomb.z - z) / (d || 1)) * force;
      }
    }

    // Impact on Patient Zero: concussive shockwave & chemical slow
    if (this.patientZero) {
      const pz = this.patientZero;
      const pzDist = Math.hypot(pz.x - x, pz.z - z);
      if (pzDist <= 7.5 && !this.isSprayInvulnerable) {
        // Apply concussive knockback
        const pzForce = (1.0 - pzDist / 7.5) * 10.0;
        pz.vx += ((pz.x - x) / (pzDist || 1)) * pzForce;
        pz.vz += ((pz.z - z) / (pzDist || 1)) * pzForce;
        pz.isSpraySlowed = true;

        // If alone, airstrike delivers devastating Last Stand exposure
        if (this.zombies.length === 0) {
          this.pzSprayTime = (this.pzSprayTime || 0) + 2.0;
          if (this.pzSprayTime >= 3.5 && this.onGameOver) {
            this.onGameOver('AIRSTRIKE_ELIMINATED');
          }
        }
      }
    }

    // Spawn lingering toxic chemical gas decontamination zone (6.5s)
    this.spawnGasCloud(x, z, 5.5, 6.5);

    if (this.onPanicEscalation) {
      this.onPanicEscalation('⚠️ AIRSTRIKE DETONATED! TOXIC GAS BOMB SCATTERS HORDE!');
    }
  }

  _createTankMesh() {
    const group = new THREE.Group();

    // Hull: Camo slate grey
    const hullGeom = new THREE.BoxGeometry(3.0, 1.1, 4.4);
    const hullMat = new THREE.MeshToonMaterial({ color: 0x475569 });
    const hull = new THREE.Mesh(hullGeom, hullMat);
    hull.position.y = 0.55;
    group.add(hull);

    // Dark rubber treads
    const treadMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    for (const s of [-1.55, 1.55]) {
      const treadGeom = new THREE.BoxGeometry(0.5, 0.9, 4.6);
      const tread = new THREE.Mesh(treadGeom, treadMat);
      tread.position.set(s, 0.45, 0);
      group.add(tread);
    }

    // Rotatable Turret
    const turretGeom = new THREE.BoxGeometry(2.0, 0.85, 2.4);
    const turretMat = new THREE.MeshToonMaterial({ color: 0x334155 });
    const turret = new THREE.Mesh(turretGeom, turretMat);
    turret.position.set(0, 1.45, 0);

    // Cannon Barrel
    const barrelGeom = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 8);
    barrelGeom.rotateX(Math.PI / 2);
    barrelGeom.translate(0, 0, 1.7);
    const barrelMat = new THREE.MeshToonMaterial({ color: 0x1e293b });
    const barrel = new THREE.Mesh(barrelGeom, barrelMat);
    turret.add(barrel);

    group.add(turret);

    return { group, turret, barrel };
  }

  spawnTank(x, z) {
    if (x === undefined || z === undefined) {
      const pos = this._getRandomStreetPosition(30, 55);
      x = pos.x;
      z = pos.z;
    }

    const meshData = this._createTankMesh();
    meshData.group.position.set(x, 0, z);
    if (this.scene) {
      this.scene.add(meshData.group);
    }

    const tank = {
      id: this._nextId++,
      type: 'tank',
      x,
      z,
      vx: 0,
      vz: 0,
      angle: 0,
      speed: 2.2,
      radius: 1.8,
      fireCooldown: 4.5,
      meshData,
    };
    this.tanks.push(tank);
    return tank;
  }

  _updateTanks(dt, pz, spatialGrid) {
    if (!pz) return;

    // Escalation check: Tanks deploy when panicLevel >= 0.85
    if (this.panicLevel >= 0.85) {
      if (this.tanks.length < 1) {
        this.spawnTank();
      }
    } else {
      // Clean up if panic was reduced below 85%
      for (let i = this.tanks.length - 1; i >= 0; i--) {
        const t = this.tanks[i];
        if (this.scene && t.meshData) this.scene.remove(t.meshData.group);
        this.tanks.splice(i, 1);
      }
      return;
    }

    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i];
      const dx = pz.x - t.x;
      const dz = pz.z - t.z;
      const dist = Math.hypot(dx, dz);

      // Aim turret towards Patient Zero
      if (t.meshData && t.meshData.turret) {
        const targetAngle = Math.atan2(dx, dz);
        t.meshData.turret.rotation.y = targetAngle - t.angle;
      }

      // Destruction Condition 1: Titan Mode ramming collision
      // Destruction Condition 2: 40+ Zombie Phalanx Push
      const isTitanRam = (this.isTitan && dist <= 3.2);
      const isPhalanxOverwhelm = (this.isPhalanx && this.zombies.length >= 40 && dist <= 3.5);

      if (isTitanRam || isPhalanxOverwhelm) {
        this.destroyTank(i, isTitanRam ? 'TITAN RAM!' : '40+ PHALANX OVERRUN!');
        continue;
      }

      // Move slowly towards horde
      if (dist > 8.0) {
        t.angle = Math.atan2(dx, dz);
        t.vx = (dx / dist) * t.speed;
        t.vz = (dz / dist) * t.speed;
        t.x += t.vx * dt;
        t.z += t.vz * dt;
      } else {
        t.vx = 0;
        t.vz = 0;
      }

      if (spatialGrid) {
        spatialGrid.resolveObstacles(t, t.radius);
      }

      if (t.meshData && t.meshData.group) {
        t.meshData.group.position.set(t.x, 0, t.z);
        t.meshData.group.rotation.y = t.angle;
      }

      // Tank Shell Firing (calibrated 3.8s cooldown for high tactical urgency)
      t.fireCooldown -= dt;
      if (t.fireCooldown <= 0 && dist <= 35.0) {
        t.fireCooldown = 3.8;
        this.fireTankShell(t, pz.x, pz.z);
      }
    }
  }

  destroyTank(tankIndex, reason = 'DEMOLISHED!') {
    const t = this.tanks[tankIndex];
    if (!t) return;

    if (this.scene && t.meshData) {
      this.scene.remove(t.meshData.group);
    }
    this.tanks.splice(tankIndex, 1);

    if (this.particles) {
      this.particles.burstExplosion(t.x, t.z);
      this.particles.burstShockwave(t.x, t.z, 7.0);
    }
    if (this.onCameraShake) this.onCameraShake(0.6, 0.8);
    if (this.onExplosion) this.onExplosion(t.x, t.z);

    this.score += 500;
    if (this.onPanicEscalation) {
      this.onPanicEscalation(`💥 TANK DESTROYED: ${reason} +500 PTS!`);
    }
  }

  fireTankShell(tank, targetX, targetZ) {
    if (this.particles && this.particles.burstSparks) {
      this.particles.burstSparks(tank.x, tank.z, 15);
    }

    // Heavy impact explosion & blast shockwave at target
    if (this.particles) {
      this.particles.burstExplosion(targetX, targetZ);
      this.particles.burstShockwave(targetX, targetZ, 8.0);
      if (this.particles.burstDustCloud) this.particles.burstDustCloud(targetX, targetZ, 16);
    }
    if (this.onCameraShake) this.onCameraShake(0.75, 0.65);
    if (this.onTankFired) {
      this.onTankFired(tank.x, tank.z, targetX, targetZ);
    } else if (this.onExplosion) {
      this.onExplosion(targetX, targetZ);
    }

    // If player is in Phalanx formation, the dense shield-wall absorbs the shell!
    // Absorbs shockwave and limits losses to 2-3 vanguard zombies instead of widespread devastation.
    if (this.isPhalanx && this.zombies.length > 0) {
      let decontam = 0;
      for (let zi = this.zombies.length - 1; zi >= 0; zi--) {
        const z = this.zombies[zi];
        if (Math.hypot(z.x - targetX, z.z - targetZ) <= 5.0 && decontam < 2) {
          this.decontaminateFollowerZombie(z);
          decontam++;
        }
      }
      if (this.onPanicEscalation) {
        this.onPanicEscalation('🛡️ PHALANX MEAT-SHIELD BLOCKED TANK SHELL!');
      }
    } else {
      // Direct high-explosive impact: Decontaminates 3-5 horde followers within 5.5m blast radius!
      let decontam = 0;
      const maxShellKills = 4;
      for (let zi = this.zombies.length - 1; zi >= 0; zi--) {
        const z = this.zombies[zi];
        const d = Math.hypot(z.x - targetX, z.z - targetZ);
        if (d <= 5.5 && decontam < maxShellKills) {
          this.decontaminateFollowerZombie(z);
          decontam++;
        } else if (d <= 6.5) {
          // Violent outward shockwave hurling survivors back
          const force = (1.0 - d / 6.5) * 18.0;
          z.vx += ((z.x - targetX) / (d || 1)) * force;
          z.vz += ((z.z - targetZ) / (d || 1)) * force;
        }
      }

      if (this.onPanicEscalation && decontam > 0) {
        this.onPanicEscalation('💥 TANK SHELL DIRECT HIT! SWARM BLASTED!');
      }
    }

    // Impact on Patient Zero: Concussive stun, slow, and Last Stand exposure if alone
    if (this.patientZero) {
      const pz = this.patientZero;
      const pzDist = Math.hypot(pz.x - targetX, pz.z - targetZ);
      if (pzDist <= 5.5 && !this.isSprayInvulnerable) {
        const pzForce = (1.0 - pzDist / 5.5) * 12.0;
        pz.vx += ((pz.x - targetX) / (pzDist || 1)) * pzForce;
        pz.vz += ((pz.z - targetZ) / (pzDist || 1)) * pzForce;
        pz.isSpraySlowed = true; // 50% concussive slow

        if (this.zombies.length === 0) {
          this.pzSprayTime = (this.pzSprayTime || 0) + 1.8;
          if (this.pzSprayTime >= 3.5 && this.onGameOver) {
            this.onGameOver('HORDE_WIPED_OUT');
          }
        }
      }
    }
  }

  // =========================================================================
  // SYSTEMIC ENVIRONMENTAL HAZARDS: ACID & WATER PUDDLES (@designer)
  // =========================================================================

  spawnAcidPuddle(x, z) {
    const geom = new THREE.CircleGeometry(2.5, 18);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x84cc16,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, 0.04, z);
    if (this.scene) this.scene.add(mesh);

    this.acidPuddles.push({
      x,
      z,
      radius: 2.5,
      life: 6.0,
      mesh,
    });
    if (this.particles && this.particles.burstAcidBubbles) {
      this.particles.burstAcidBubbles(x, z, 8);
    }
  }

  spawnWaterPuddle(x, z, isToxic = false) {
    const geom = new THREE.CircleGeometry(3.5, 20);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: isToxic ? 0x22c55e : 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, 0.03, z);
    if (this.scene) this.scene.add(mesh);

    this.waterPuddles.push({
      x,
      z,
      radius: 3.5,
      life: 20.0,
      isToxic,
      isElectrified: false,
      electrifiedTimer: 0,
      mesh,
      mat,
    });
  }

  electrifyWaterPuddleNear(x, z, radius = 6.0) {
    let electrifiedAny = false;
    for (const wp of this.waterPuddles) {
      const d = Math.hypot(wp.x - x, wp.z - z);
      if (d <= radius + wp.radius) {
        wp.isElectrified = true;
        wp.electrifiedTimer = 8.0;
        wp.mat.color.setHex(0x93c5fd);
        electrifiedAny = true;
      }
    }
    if (electrifiedAny && this.particles && this.particles.burstSparks) {
      this.particles.burstSparks(x, z, 25);
    }
  }

  poisonWaterPuddleNear(x, z, radius = 4.0) {
    for (const wp of this.waterPuddles) {
      const d = Math.hypot(wp.x - x, wp.z - z);
      if (d <= radius + wp.radius) {
        wp.isToxic = true;
        wp.mat.color.setHex(0x22c55e);
      }
    }
  }

  _updatePuddles(dt) {
    // 1. Acid Puddles (Stuns Hazmats and Military for 3s)
    for (let i = this.acidPuddles.length - 1; i >= 0; i--) {
      const ap = this.acidPuddles[i];
      ap.life -= dt;
      if (ap.life <= 0) {
        if (this.scene && ap.mesh) this.scene.remove(ap.mesh);
        this.acidPuddles.splice(i, 1);
        continue;
      }

      // Check Hazmats
      for (const h of this.hazmats) {
        if (Math.hypot(h.x - ap.x, h.z - ap.z) <= ap.radius) {
          h.stunTimer = 3.0;
          if (this.particles && this.particles.burstAcidBubbles && Math.random() < 0.15) {
            this.particles.burstAcidBubbles(h.x, h.z, 2);
          }
        }
      }
      // Check Military
      for (const m of this.militaryUnits) {
        if (Math.hypot(m.x - ap.x, m.z - ap.z) <= ap.radius) {
          m.stunTimer = 3.0;
          if (this.particles && this.particles.burstAcidBubbles && Math.random() < 0.15) {
            this.particles.burstAcidBubbles(m.x, m.z, 2);
          }
        }
      }
    }

    // 2. Water Puddles (Electrified stuns Hazmat/Military, Toxic converts civilians)
    for (let i = this.waterPuddles.length - 1; i >= 0; i--) {
      const wp = this.waterPuddles[i];
      wp.life -= dt;
      if (wp.life <= 0) {
        if (this.scene && wp.mesh) this.scene.remove(wp.mesh);
        this.waterPuddles.splice(i, 1);
        continue;
      }

      if (wp.isElectrified) {
        wp.electrifiedTimer -= dt;
        if (wp.electrifiedTimer <= 0) {
          wp.isElectrified = false;
          wp.mat.color.setHex(wp.isToxic ? 0x22c55e : 0x38bdf8);
        } else {
          // Stun Hazmats & Military
          for (const h of this.hazmats) {
            if (Math.hypot(h.x - wp.x, h.z - wp.z) <= wp.radius) {
              h.stunTimer = 3.0;
            }
          }
          for (const m of this.militaryUnits) {
            if (Math.hypot(m.x - wp.x, m.z - wp.z) <= wp.radius) {
              m.stunTimer = 3.0;
            }
          }
        }
      }

      if (wp.isToxic) {
        // Converts healthy civilians who step into the puddle
        for (let ci = this.civilians.length - 1; ci >= 0; ci--) {
          const c = this.civilians[ci];
          if (c.hidden || c.isCaptive) continue;
          if (Math.hypot(c.x - wp.x, c.z - wp.z) <= wp.radius) {
            this.convertCivilianToZombie(ci);
          }
        }
      }
    }

    // 3. Chemical Gas Clouds (spawned from Helicopter Airstrikes)
    if (this.gasClouds && this.gasClouds.length > 0) {
      const pz = this.patientZero;
      const activeCureThreshold = this.followerCureThreshold || 0.55;

      for (let i = this.gasClouds.length - 1; i >= 0; i--) {
        const gc = this.gasClouds[i];
        gc.life -= dt;
        if (gc.life <= 0) {
          if (this.scene && gc.mesh) this.scene.remove(gc.mesh);
          this.gasClouds.splice(i, 1);
          continue;
        }

        // Pulse gas cloud visual opacity & gentle expansion
        if (gc.mat) {
          gc.mat.opacity = 0.35 + Math.sin((gc.initialLife - gc.life) * 5.0) * 0.12;
        }

        // Emit light chemical gas / cure particles
        if (this.particles && Math.random() < 0.25) {
          if (this.particles.burstCure) {
            this.particles.burstCure(gc.x + (Math.random() - 0.5) * gc.radius, gc.z + (Math.random() - 0.5) * gc.radius);
          }
        }

        // A. Threat to Horde: Cures zombies standing or moving through the lingering chemical cloud
        for (let zi = this.zombies.length - 1; zi >= 0; zi--) {
          const z = this.zombies[zi];
          if (Math.hypot(z.x - gc.x, z.z - gc.z) <= gc.radius) {
            z.sprayExposure = (z.sprayExposure || 0) + dt * 1.5;
            if (this.onHazmatDamageDealt) {
              this.onHazmatDamageDealt(dt * 0.5);
            }
            if (z.sprayExposure >= activeCureThreshold) {
              this.cureZombieToCivilian(zi);
            }
          }
        }

        // B. Threat to Patient Zero: Applies chemical slow & Last Stand exposure if alone
        if (pz && Math.hypot(pz.x - gc.x, pz.z - gc.z) <= gc.radius && !this.isSprayInvulnerable) {
          pz.isSpraySlowed = true;
          if (this.zombies.length === 0) {
            this.pzSprayTime = Math.min(3.5, (this.pzSprayTime || 0) + dt * 1.2);
            if (this.pzSprayTime >= 3.5 && this.onGameOver) {
              this.onGameOver('QUARANTINED!');
            }
          }
        }
      }
    }
  }

  /**
   * Spawn a lingering toxic chemical decontamination gas cloud on the ground
   * (e.g. from Helicopter airstrikes) that persists for 6.0s.
   */
  spawnGasCloud(x, z, radius = 5.5, life = 6.0) {
    if (!this.gasClouds) this.gasClouds = [];

    let mesh = null;
    let mat = null;
    if (typeof THREE !== 'undefined' && THREE.CircleGeometry && THREE.MeshBasicMaterial) {
      const geom = new THREE.CircleGeometry(radius, 22);
      geom.rotateX(-Math.PI / 2);
      mat = new THREE.MeshBasicMaterial({
        color: 0x34d399, // Emerald cyan chemical agent
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, 0.05, z);
      if (this.scene) this.scene.add(mesh);
    }

    this.gasClouds.push({
      x,
      z,
      radius,
      life,
      initialLife: life,
      mesh,
      mat,
    });

    if (this.particles && this.particles.burstDustCloud) {
      this.particles.burstDustCloud(x, z, 14);
    }
  }
}
