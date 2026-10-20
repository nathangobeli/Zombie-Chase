import * as THREE from 'three';
import { SpatialHash } from '../core/SpatialHash.js';

export const FORMATIONS = ['SWARM', 'SHIELD_WALL', 'PINCER_SPLIT'];

const STORAGE_KEY = 'zombie_chase_v3_meta_save';

/**
 * Core Gameplay & Horde Simulation Engine for Zombie Chase v3.0:
 *  - 4 Distinct Zombie Castes (Walker, Crimson Leaper, Juggernaut Brute, Volatile Spitter)
 *  - Viral Chain Combo Multiplier (x1 .. x10)
 *  - Active Horde Surge / Target Lock Command (Right-Click / Q)
 *  - 3 Tactical Formations (Swarm, Shield Wall, Pincer Split)
 *  - Fixed & Supercharged Frenzy Overdrive (Spacebar)
 *  - Walkable Breachable Interior Room Encounters, District Biome Tracking & Persistent Mutation Lab
 */
export class Simulation {
  constructor(scene, world, vfx, audio) {
    this.scene = scene;
    this.world = world;
    this.vfx = vfx;
    this.audio = audio;

    this.zombieGrid = new SpatialHash(8);
    this.humanGrid = new SpatialHash(8);

    this.nextId = 1;
    this.time = 0;

    this.radioAlerts = [];

    this.acidGlobules = [];
    this._initAcidPool(24);
    this.sporeClouds = [];

    this._loadMetaSave();
    this.reset();
  }

  _loadMetaSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.meta = {
          bankedDna: parsed.bankedDna ?? 100,
          startPackLevel: parsed.startPackLevel ?? 1,
          viralWindowLevel: parsed.viralWindowLevel ?? 1,
          carapaceLevel: parsed.carapaceLevel ?? 1,
        };
        return;
      }
    } catch (_) {}
    this.meta = {
      bankedDna: 120,
      startPackLevel: 1,
      viralWindowLevel: 1,
      carapaceLevel: 1,
    };
  }

  saveMeta() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.meta));
    } catch (_) {}
  }

  upgradeMetaTrait(traitKey) {
    const level = this.meta[traitKey] || 1;
    const cost = level * 60;
    if (this.dna + this.meta.bankedDna < cost) {
      this.pushRadioAlert(`NEED ${cost} TOTAL DNA FOR LAB MUTATION`, 'crimson');
      return false;
    }

    // Spend from current run DNA first, then banked DNA
    if (this.dna >= cost) {
      this.dna -= cost;
    } else {
      const rem = cost - this.dna;
      this.dna = 0;
      this.meta.bankedDna = Math.max(0, this.meta.bankedDna - rem);
    }

    this.meta[traitKey] = level + 1;
    this.saveMeta();

    // Apply immediate in-run benefit!
    const pz = this.patientZero;
    if (traitKey === 'startPackLevel') {
      this.spawnZombie(pz.x + 2, pz.z, 'leaper');
      this.spawnZombie(pz.x - 2, pz.z, 'brute');
      this.spawnZombie(pz.x, pz.z + 2, 'spitter');
    } else if (traitKey === 'carapaceLevel') {
      pz.maxHp += 75;
      pz.hp = pz.maxHp;
    }

    if (this.audio) this.audio.playEvolutionChord();
    this.pushRadioAlert(`LAB MUTATION UPGRADED TO LV.${this.meta[traitKey]}!`, 'emerald');
    return true;
  }

  _initAcidPool(max) {
    this.acidMeshes = [];
    const geo = new THREE.SphereGeometry(0.28, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa3e635,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.acidMeshes.push(m);
    }
  }

  reset() {
    this.score = 0;
    this.totalInfected = 0;
    this.buildingsBreached = 0;
    this.dna = 80;
    this.threatLevel = 1;
    this.gameOver = false;

    // Viral Chain Combo state
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.maxComboTimer = 4.5 + (this.meta.viralWindowLevel - 1) * 0.8;

    this.currentDistrict = this.world.getDistrictAtWorld(0, 0);

    this.upgrades = {
      leaper: 1,
      brute: 1,
      spitter: 1,
      alpha: 1,
    };

    this.upgradeCosts = {
      leaper: 35,
      brute: 45,
      spitter: 40,
      alpha: 50,
    };

    const baseHp = 250 + (this.meta.carapaceLevel - 1) * 60;
    this.patientZero = {
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vz: 0,
      heading: 0,
      hp: baseHp,
      maxHp: baseHp,
      frenzyTimer: 0,
      frenzyCooldown: 0,
      hitFlash: 0,
    };

    this.surgeState = {
      active: false,
      tx: 0,
      tz: 0,
      timer: 0,
      cooldown: 0,
    };

    this.formationIndex = 0;
    this.formation = FORMATIONS[0];

    this.zombies = [];
    this.humans = [];
    this.acidGlobules.length = 0;
    this.sporeClouds.length = 0;
    this.populatedInteriors = new Set();

    // Spawn starting horde pack (scaled by Mutation Lab startPackLevel!)
    this.spawnZombie(1.8, 1.5, 'walker');
    this.spawnZombie(-1.8, 1.5, 'walker');
    this.spawnZombie(0, 2.4, 'walker');
    this.spawnZombie(2.4, -1.2, 'leaper');
    this.spawnZombie(-2.4, -1.2, 'brute');
    this.spawnZombie(0, -2.5, 'spitter');

    for (let extra = 1; extra < this.meta.startPackLevel; extra++) {
      this.spawnZombie((extra % 2 === 0 ? 1 : -1) * 3.0, extra * 1.5, extra % 2 === 0 ? 'leaper' : 'brute');
    }

    this.pushRadioAlert('OUTBREAK PROTOCOL v3.0 — COMMAND YOUR HORDE', 'emerald');
    this.pushRadioAlert('RIGHT-CLICK OR [Q] TO SURGE • [B] SUMMON BOSS • [M] MUTATION LAB', 'cyan');
  }

  pushRadioAlert(text, tone = 'emerald') {
    this.radioAlerts.unshift({
      id: this.nextId++,
      text,
      tone,
      time: this.time,
    });
    if (this.radioAlerts.length > 5) {
      this.radioAlerts.pop();
    }
  }

  addDNA(amount) {
    this.dna += amount;
    this.meta.bankedDna += Math.ceil(amount * 0.25);
    this.saveMeta();
    this.score += amount * 10 * this.comboMultiplier;
  }

  triggerFrenzy() {
    const pz = this.patientZero;
    if (pz.frenzyCooldown > 0 || pz.frenzyTimer > 0) return false;

    const duration = 5.0 + (this.upgrades.alpha - 1) * 0.8;
    pz.frenzyTimer = duration;
    pz.frenzyCooldown = 10.0;

    this.vfx.spawnShockwave(pz.x, pz.z, 0xf43f5e, 14.0, 0.65);
    this.vfx.spawnFlashLight(pz.x, 2.5, pz.z, 0xf43f5e, 10, 22, 0.5);
    this.vfx.emitSparks(pz.x, 1.2, pz.z, 0xf43f5e, 32, 11.0, 1.4, 0.65);

    const nearHumans = this.humanGrid.queryRadius(pz.x, pz.z, 11.0);
    for (let i = 0; i < nearHumans.length; i++) {
      const h = nearHumans[i];
      const dx = h.x - pz.x;
      const dz = h.z - pz.z;
      const d = Math.hypot(dx, dz) || 1;
      h.vx += (dx / d) * 14;
      h.vz += (dz / d) * 14;
      h.hitFlash = 0.8;
    }

    for (let i = 0; i < this.world.wallColliders.length; i++) {
      const w = this.world.wallColliders[i];
      if (w.isBreakable && !w.broken) {
        if (Math.hypot(w.centerX - pz.x, w.centerZ - pz.z) < 9.5) {
          if (this.world.damageWall(w, 100, this.audio)) {
            this.buildingsBreached++;
            this.pushRadioAlert(`FRENZY ROAR SHATTERED ${w.themeName}!`, 'amber');
          }
        }
      }
    }

    if (this.audio) this.audio.playFrenzyRoar();
    this.pushRadioAlert('FRENZY OVERDRIVE ACTIVATED (+65% HORDE SPEED & BITE)', 'crimson');
    return true;
  }

  triggerSurge(targetX, targetZ) {
    if (this.surgeState.cooldown > 0) return false;

    const pz = this.patientZero;
    let tx = targetX;
    let tz = targetZ;

    if (!Number.isFinite(tx) || !Number.isFinite(tz) || (tx === 0 && tz === 0)) {
      tx = pz.x + Math.sin(pz.heading) * 16;
      tz = pz.z + Math.cos(pz.heading) * 16;
    }

    this.surgeState.active = true;
    this.surgeState.tx = tx;
    this.surgeState.tz = tz;
    this.surgeState.timer = 4.2;
    this.surgeState.cooldown = 4.8;

    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.caste === 'leaper' || z.caste === 'brute' || i % 3 !== 0) {
        z.surging = true;
      }
    }

    this.vfx.spawnShockwave(tx, tz, 0xf43f5e, 6.0, 0.45);
    if (this.audio) this.audio.playSurgeCommand();
    this.pushRadioAlert('HORDE SURGE DIRECTED TO TARGET VECTOR!', 'amber');
    return true;
  }

  cycleFormation() {
    this.formationIndex = (this.formationIndex + 1) % FORMATIONS.length;
    this.formation = FORMATIONS[this.formationIndex];
    const labels = {
      SWARM: 'FORMATION: ENCIRCLEMENT SWARM',
      SHIELD_WALL: 'FORMATION: JUGGERNAUT SHIELD WALL',
      PINCER_SPLIT: 'FORMATION: TWIN PINCER SPLIT',
    };
    if (this.audio) this.audio.playUIBlip();
    this.pushRadioAlert(labels[this.formation], 'cyan');
  }

  evolveGenome(type) {
    const cost = this.upgradeCosts[type];
    if (!cost || this.dna < cost) {
      this.pushRadioAlert(`INSUFFICIENT DNA FOR ${type.toUpperCase()} EVOLUTION (NEED ${cost} DNA)`, 'crimson');
      return false;
    }

    this.dna -= cost;
    this.upgrades[type]++;
    this.upgradeCosts[type] = Math.round(cost * 1.45);

    const pz = this.patientZero;
    if (type === 'leaper') {
      for (let i = 0; i < 3; i++) {
        this.spawnZombie(pz.x + (Math.random() - 0.5) * 4, pz.z + (Math.random() - 0.5) * 4, 'leaper');
      }
      this.pushRadioAlert(`CRIMSON LEAPER GENOME LV.${this.upgrades.leaper} (+3 LEAPERS SPAWNED)`, 'crimson');
    } else if (type === 'brute') {
      for (let i = 0; i < 2; i++) {
        this.spawnZombie(pz.x + (Math.random() - 0.5) * 4, pz.z + (Math.random() - 0.5) * 4, 'brute');
      }
      this.pushRadioAlert(`JUGGERNAUT BRUTE GENOME LV.${this.upgrades.brute} (+2 BRUTES SPAWNED)`, 'amber');
    } else if (type === 'spitter') {
      for (let i = 0; i < 2; i++) {
        this.spawnZombie(pz.x + (Math.random() - 0.5) * 4, pz.z + (Math.random() - 0.5) * 4, 'spitter');
      }
      this.pushRadioAlert(`VOLATILE SPITTER GENOME LV.${this.upgrades.spitter} (+2 SPITTERS SPAWNED)`, 'emerald');
    } else if (type === 'alpha') {
      pz.maxHp += 60;
      pz.hp = pz.maxHp;
      this.spawnZombie(pz.x + 2, pz.z, 'leaper');
      this.spawnZombie(pz.x - 2, pz.z, 'brute');
      this.pushRadioAlert(`ALPHA OVERLORD MUTATION LV.${this.upgrades.alpha} (SPEED & ARMOR UP)`, 'emerald');
    }

    this.vfx.spawnShockwave(pz.x, pz.z, 0x34d399, 8.5, 0.5);
    this.vfx.emitSparks(pz.x, 1.2, pz.z, 0x34d399, 24, 9.0, 1.3, 0.6);
    if (this.audio) this.audio.playEvolutionChord();
    return true;
  }

  _pickAutoCaste() {
    const r = Math.random();
    const leaperChance = Math.min(0.28, 0.10 + (this.upgrades.leaper - 1) * 0.05);
    const bruteChance = Math.min(0.20, 0.07 + (this.upgrades.brute - 1) * 0.04);
    const spitterChance = Math.min(0.20, 0.08 + (this.upgrades.spitter - 1) * 0.04);

    if (r < bruteChance) return 'brute';
    if (r < bruteChance + leaperChance) return 'leaper';
    if (r < bruteChance + leaperChance + spitterChance) return 'spitter';
    return 'walker';
  }

  spawnZombie(x, z, forcedCaste = null) {
    if (this.zombies.length >= 650) return null;
    const caste = forcedCaste || this._pickAutoCaste();

    const isBrute = caste === 'brute';
    const isLeaper = caste === 'leaper';
    const isSpitter = caste === 'spitter';
    const armorBonus = (this.meta.carapaceLevel - 1) * 20;

    const zomb = {
      id: this.nextId++,
      caste,
      x,
      y: 0,
      z,
      vx: 0,
      vz: 0,
      leapVy: 0,
      heading: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      hp: (isBrute ? 260 + this.upgrades.brute * 40 : isSpitter ? 95 : isLeaper ? 85 : 75) + armorBonus,
      maxHp: isBrute ? 300 : 85,
      scale: isBrute ? 1.0 : 0.92 + Math.random() * 0.16,
      speedMult: isLeaper ? 1.34 : isBrute ? 0.94 : isSpitter ? 0.96 : 1.05,
      leapCooldown: Math.random() * 1.5,
      spitCooldown: 1.0 + Math.random() * 2.0,
      surging: this.surgeState.active,
      hitFlash: 0,
      dead: false,
    };

    this.zombies.push(zomb);
    return zomb;
  }

  spawnHuman(x, z, forcedType = null) {
    if (this.humans.length >= 240) return null;

    let type = forcedType;
    if (!type) {
      const r = Math.random();
      if (this.threatLevel >= 4 && r < 0.14) type = 'sniper';
      else if (this.threatLevel >= 3 && r < 0.28) type = 'hazmat';
      else if (this.threatLevel >= 2 && r < 0.45) type = 'police';
      else if (r < 0.65) type = 'sprinter';
      else type = 'civilian';
    }

    const human = {
      id: this.nextId++,
      type,
      x,
      y: 0,
      z,
      vx: 0,
      vz: 0,
      heading: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      hp: type === 'hazmat' ? 130 : type === 'police' || type === 'sniper' ? 95 : 55,
      scale: 0.94 + Math.random() * 0.12,
      infecting: 0,
      fireCooldown: 0.8 + Math.random() * 1.2,
      aimTarget: null,
      hitFlash: 0,
      dead: false,
    };

    this.humans.push(human);
    return human;
  }

  spawnSporeCloud(x, z, radius = 5.5, duration = 6.5) {
    this.sporeClouds.push({
      x,
      z,
      radius,
      age: 0,
      duration,
      emitTimer: 0,
    });
    this.vfx.emitSoftCloud(x, 0.8, z, 0x84cc16, 16, radius * 0.6, 3.2, 2.2);
    this.vfx.addDecal(x, z, 0x3f6212, radius * 0.7);
  }

  spawnExplosionDamage(x, z, radius = 6.0, isBio = false) {
    this.vfx.spawnExplosion(x, z, radius, isBio);

    const hitHumans = this.humanGrid.queryRadius(x, z, radius);
    for (let i = 0; i < hitHumans.length; i++) {
      const h = hitHumans[i];
      if (h.dead) continue;
      if (isBio) {
        this._convertHumanToZombie(h);
      } else {
        h.dead = true;
        const dx = h.x - x;
        const dz = h.z - z;
        const d = Math.hypot(dx, dz) || 1;
        this.vfx.spawnRagdoll(h.x, h.z, (dx / d) * 11, 9, (dz / d) * 11, 0xfdba74, 1.0);
        this.vfx.addDecal(h.x, h.z, 0x991b1b, 1.6);
      }
    }

    if (!isBio) {
      const hitZombies = this.zombieGrid.queryRadius(x, z, radius * 0.85);
      for (let i = 0; i < hitZombies.length; i++) {
        const z = hitZombies[i];
        if (z.dead) continue;
        z.hp -= z.caste === 'brute' ? 45 : 95;
        z.hitFlash = 0.9;
        if (z.hp <= 0) {
          z.dead = true;
          const dx = z.x - x;
          const dz = z.z - z;
          const d = Math.hypot(dx, dz) || 1;
          this.vfx.spawnRagdoll(z.x, z.z, (dx / d) * 12, 9.5, (dz / d) * 12, 0x4ade80, z.scale);
        }
      }
    }
  }

  _convertHumanToZombie(h) {
    if (h.dead) return;
    h.dead = true;
    this.totalInfected++;

    // Increment Viral Chain Combo!
    this.comboCount++;
    this.comboTimer = this.maxComboTimer;
    this.comboMultiplier = Math.min(10, 1 + Math.floor(this.comboCount / 3));

    const baseScore = h.type === 'sniper' || h.type === 'hazmat' ? 150 : h.type === 'police' ? 100 : 50;
    this.score += baseScore * this.comboMultiplier;

    const baseDna = h.type === 'hazmat' ? 10 : h.type === 'police' || h.type === 'sniper' ? 7 : 4;
    this.addDNA(baseDna + Math.floor(this.comboMultiplier * 0.8));

    if (h.type === 'hazmat') {
      this.spawnSporeCloud(h.x, h.z, 6.0, 7.0);
    }

    this.vfx.emitSparks(h.x, 1.1, h.z, 0x4ade80, 14, 7.5, 1.1, 0.45);
    this.vfx.addDecal(h.x, h.z, 0x991b1b, 1.4);
    if (this.audio) this.audio.playInfect();

    this.spawnZombie(h.x, h.z);

    const newThreat = Math.min(5, 1 + Math.floor(this.totalInfected / 18));
    if (newThreat > this.threatLevel) {
      this.threatLevel = newThreat;
      const threatMsgs = {
        2: 'THREAT LEVEL 2: METRO POLICE VANGUARDS DEPLOYED',
        3: 'THREAT LEVEL 3: HAZMAT SQUADS & TITAN BOSS INBOUND',
        4: 'THREAT LEVEL 4: SPEC-OPS SNIPERS & ARMORED APCs ACTIVE',
        5: 'THREAT LEVEL 5: MAXIMUM OUTBREAK — FULL MILITARY LOCKDOWN',
      };
      if (threatMsgs[newThreat]) {
        this.pushRadioAlert(threatMsgs[newThreat], 'crimson');
      }
    }
  }

  update(dt, input) {
    if (this.gameOver) return;
    this.time += dt;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboMultiplier = 1;
      }
    }

    this._updatePatientZero(dt, input);
    this._maintainPopulation();
    this._rebuildSpatialGrids();
    this._updateSporeClouds(dt);
    this._updateAcidGlobules(dt);
    this._updateZombies(dt);
    this._updateHumans(dt);
    this._checkWorldInteractions();
  }

  _updatePatientZero(dt, input) {
    const pz = this.patientZero;
    if (pz.frenzyTimer > 0) pz.frenzyTimer = Math.max(0, pz.frenzyTimer - dt);
    if (pz.frenzyCooldown > 0) pz.frenzyCooldown = Math.max(0, pz.frenzyCooldown - dt);
    if (pz.hitFlash > 0) pz.hitFlash = Math.max(0, pz.hitFlash - dt * 3.5);

    if (this.surgeState.active) {
      this.surgeState.timer -= dt;
      if (this.surgeState.timer <= 0) {
        this.surgeState.active = false;
      }
    }
    if (this.surgeState.cooldown > 0) {
      this.surgeState.cooldown = Math.max(0, this.surgeState.cooldown - dt);
    }

    const baseSpeed = 9.6 + (this.upgrades.alpha - 1) * 0.75;
    const frenzyBoost = pz.frenzyTimer > 0 ? 1.55 : 1.0;
    const targetSpeed = baseSpeed * frenzyBoost;

    const tx = input.moveX * targetSpeed;
    const tz = input.moveZ * targetSpeed;

    pz.vx += (tx - pz.vx) * Math.min(1, dt * 12);
    pz.vz += (tz - pz.vz) * Math.min(1, dt * 12);

    pz.x += pz.vx * dt;
    pz.z += pz.vz * dt;

    if (Math.hypot(pz.vx, pz.vz) > 0.35) {
      pz.heading = Math.atan2(pz.vx, pz.vz);
    }

    const pzBreachDmg = (pz.frenzyTimer > 0 ? 180 : 55) * dt;
    this.world.resolveEntityCollision(pz, 0.55, pzBreachDmg, this.audio, (wall) => {
      this.buildingsBreached++;
      this.addDNA(10);
      this.pushRadioAlert(`BREACHED ${wall.themeName} STOREFRONT (+10 DNA)!`, 'emerald');
    });

    // Check District Biome transitions
    const distObj = this.world.getDistrictAtWorld(pz.x, pz.z);
    if (distObj && distObj.id !== this.currentDistrict.id) {
      this.currentDistrict = distObj;
      this.pushRadioAlert(`ENTERING SECTOR: ${distObj.name}`, distObj.color);
    }
  }

  _maintainPopulation() {
    const pz = this.patientZero;

    for (let i = 0; i < this.world.interiorRooms.length; i++) {
      const room = this.world.interiorRooms[i];
      const key = `${Math.round(room.cx)},${Math.round(room.cz)}`;
      if (!this.populatedInteriors.has(key)) {
        this.populatedInteriors.add(key);
        for (let c = 0; c < 5; c++) {
          const rx = room.cx + (Math.random() - 0.5) * room.halfW * 1.4;
          const rz = room.cz + (Math.random() - 0.5) * room.halfD * 1.4;
          this.spawnHuman(rx, rz, c === 0 ? 'hazmat' : c === 1 ? 'police' : 'civilian');
        }
      }
    }

    const targetHumans = Math.min(150, 75 + this.threatLevel * 14);
    let attempts = 0;
    while (this.humans.length < targetHumans && attempts < 8) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 48;
      const sx = pz.x + Math.cos(angle) * dist;
      const sz = pz.z + Math.sin(angle) * dist;
      this.spawnHuman(sx, sz);
    }

    for (let i = this.humans.length - 1; i >= 0; i--) {
      const h = this.humans[i];
      if (h.dead || Math.hypot(h.x - pz.x, h.z - pz.z) > 115) {
        this.humans.splice(i, 1);
      }
    }

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].dead) {
        this.zombies.splice(i, 1);
      }
    }
  }

  _rebuildSpatialGrids() {
    this.zombieGrid.clear();
    this.humanGrid.clear();
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (!z.dead) this.zombieGrid.insert(z);
    }
    for (let i = 0; i < this.humans.length; i++) {
      const h = this.humans[i];
      if (!h.dead) this.humanGrid.insert(h);
    }
  }

  _updateSporeClouds(dt) {
    for (let i = this.sporeClouds.length - 1; i >= 0; i--) {
      const sc = this.sporeClouds[i];
      sc.age += dt;
      if (sc.age >= sc.duration) {
        this.sporeClouds.splice(i, 1);
        continue;
      }

      sc.emitTimer -= dt;
      if (sc.emitTimer <= 0) {
        sc.emitTimer = 0.35;
        this.vfx.emitSoftCloud(sc.x, 0.7, sc.z, 0x84cc16, 3, sc.radius * 0.7, 2.8, 1.2);
      }

      const victims = this.humanGrid.queryRadius(sc.x, sc.z, sc.radius);
      for (let j = 0; j < victims.length; j++) {
        const h = victims[j];
        h.infecting += dt * 1.6;
        if (h.infecting >= 1.0) {
          this._convertHumanToZombie(h);
        }
      }
    }
  }

  _fireAcidGlobule(spitter, targetX, targetZ) {
    if (this.acidGlobules.length >= this.acidMeshes.length) return;
    const mesh = this.acidMeshes[this.acidGlobules.length];
    mesh.visible = true;
    mesh.position.set(spitter.x, 1.3, spitter.z);

    const dx = targetX - spitter.x;
    const dz = targetZ - spitter.z;
    const dist = Math.max(1, Math.hypot(dx, dz));
    const flightTime = Math.min(1.1, Math.max(0.4, dist / 18.0));

    this.acidGlobules.push({
      x: spitter.x,
      y: 1.3,
      z: spitter.z,
      vx: dx / flightTime,
      vy: 0.5 * 18.0 * flightTime,
      vz: dz / flightTime,
      age: 0,
      maxAge: flightTime,
      mesh,
    });
  }

  _updateAcidGlobules(dt) {
    for (let i = this.acidGlobules.length - 1; i >= 0; i--) {
      const g = this.acidGlobules[i];
      g.age += dt;
      g.vy -= 18.0 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;

      g.mesh.position.set(g.x, Math.max(0.2, g.y), g.z);

      if (g.age >= g.maxAge || g.y <= 0.15) {
        g.mesh.visible = false;
        this.spawnSporeCloud(g.x, g.z, 4.2, 4.5);
        this.vfx.emitSparks(g.x, 0.4, g.z, 0xa3e635, 12, 6.5, 1.1, 0.4);
        this.acidGlobules.splice(i, 1);
      }
    }

    for (let i = 0; i < this.acidMeshes.length; i++) {
      this.acidMeshes[i].visible = i < this.acidGlobules.length;
      if (i < this.acidGlobules.length) {
        this.acidGlobules[i].mesh = this.acidMeshes[i];
      }
    }
  }

  _updateZombies(dt) {
    const pz = this.patientZero;
    const isFrenzy = pz.frenzyTimer > 0;
    const fwdX = Math.sin(pz.heading);
    const fwdZ = Math.cos(pz.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;

    for (let i = 0, len = this.zombies.length; i < len; i++) {
      const z = this.zombies[i];
      if (z.dead) continue;

      if (z.hitFlash > 0) z.hitFlash = Math.max(0, z.hitFlash - dt * 3.5);
      if (z.leapCooldown > 0) z.leapCooldown -= dt;
      if (z.spitCooldown > 0) z.spitCooldown -= dt;

      let anchorX = pz.x;
      let anchorZ = pz.z;
      let surgeSpeedBonus = 1.0;

      if (this.surgeState.active && z.surging) {
        anchorX = this.surgeState.tx;
        anchorZ = this.surgeState.tz;
        surgeSpeedBonus = 1.38;
      } else if (this.formation === 'SHIELD_WALL') {
        if (z.caste === 'brute') {
          const slot = ((i % 5) - 2) * 1.4;
          anchorX = pz.x + fwdX * 3.8 + rightX * slot;
          anchorZ = pz.z + fwdZ * 3.8 + rightZ * slot;
        } else {
          anchorX = pz.x - fwdX * 1.5;
          anchorZ = pz.z - fwdZ * 1.5;
        }
      } else if (this.formation === 'PINCER_SPLIT') {
        const wing = i % 2 === 0 ? 1 : -1;
        anchorX = pz.x + fwdX * 5.0 + rightX * wing * 6.5;
        anchorZ = pz.z + fwdZ * 5.0 + rightZ * wing * 6.5;
      }

      const searchRad = z.caste === 'leaper' ? 16.0 : 12.5;
      const nearbyPrey = this.humanGrid.queryRadius(z.x, z.z, searchRad);
      let closestPrey = null;
      let minPreyDist = Infinity;

      for (let p = 0; p < nearbyPrey.length; p++) {
        const h = nearbyPrey[p];
        if (h.dead) continue;
        const d = Math.hypot(h.x - z.x, h.z - z.z);
        if (d < minPreyDist) {
          minPreyDist = d;
          closestPrey = h;
        }
      }

      if (
        z.caste === 'leaper' &&
        closestPrey &&
        minPreyDist > 2.5 &&
        minPreyDist < 10.5 &&
        z.leapCooldown <= 0 &&
        z.y <= 0.05
      ) {
        z.leapCooldown = 2.6;
        const dx = (closestPrey.x - z.x) / minPreyDist;
        const dz = (closestPrey.z - z.z) / minPreyDist;
        z.vx = dx * 18.5;
        z.vz = dz * 18.5;
        z.leapVy = 6.8;
        this.vfx.emitSparks(z.x, 0.5, z.z, 0xf43f5e, 6, 4.0, 0.8, 0.3);
      }

      if (
        z.caste === 'spitter' &&
        closestPrey &&
        minPreyDist > 5.0 &&
        minPreyDist < 16.0 &&
        z.spitCooldown <= 0
      ) {
        z.spitCooldown = 3.2;
        this._fireAcidGlobule(z, closestPrey.x, closestPrey.z);
      }

      let steerX = 0;
      let steerZ = 0;

      if (closestPrey && (!this.surgeState.active || minPreyDist < 7.0)) {
        steerX += ((closestPrey.x - z.x) / minPreyDist) * 2.2;
        steerZ += ((closestPrey.z - z.z) / minPreyDist) * 2.2;
      } else {
        const dx = anchorX - z.x;
        const dz = anchorZ - z.z;
        const distToAnchor = Math.hypot(dx, dz) || 1;
        if (distToAnchor > 1.8) {
          steerX += (dx / distToAnchor) * 1.65;
          steerZ += (dz / distToAnchor) * 1.65;
        }
      }

      const neighbors = this.zombieGrid.queryRadius(z.x, z.z, 1.35);
      for (let n = 0; n < neighbors.length; n++) {
        const other = neighbors[n];
        if (other === z) continue;
        const sx = z.x - other.x;
        const sz = z.z - other.z;
        const dSq = sx * sx + sz * sz;
        if (dSq > 0.0001 && dSq < 1.8) {
          const invD = 1 / Math.sqrt(dSq);
          steerX += sx * invD * 1.35;
          steerZ += sz * invD * 1.35;
        }
      }

      const maxSpeed =
        (8.8 + (this.upgrades.alpha - 1) * 0.6) *
        z.speedMult *
        (isFrenzy ? 1.55 : 1.0) *
        surgeSpeedBonus;

      const steerLen = Math.hypot(steerX, steerZ) || 1;
      const desiredVx = (steerX / steerLen) * maxSpeed;
      const desiredVz = (steerZ / steerLen) * maxSpeed;

      z.vx += (desiredVx - z.vx) * Math.min(1, dt * 8.5);
      z.vz += (desiredVz - z.vz) * Math.min(1, dt * 8.5);

      z.x += z.vx * dt;
      z.z += z.vz * dt;

      if (z.y > 0 || z.leapVy > 0) {
        z.y += z.leapVy * dt;
        z.leapVy -= 20.0 * dt;
        if (z.y <= 0) {
          z.y = 0;
          z.leapVy = 0;
        }
      }

      if (Math.hypot(z.vx, z.vz) > 0.25) {
        z.heading = Math.atan2(z.vx, z.vz);
      }

      if (closestPrey && minPreyDist < (z.caste === 'brute' ? 1.45 : 1.05)) {
        const biteRate = (z.caste === 'leaper' ? 3.2 : z.caste === 'brute' ? 4.0 : 2.2) * (isFrenzy ? 2.0 : 1.0);
        closestPrey.infecting += biteRate * dt;
        closestPrey.hitFlash = 0.5;
        if (closestPrey.infecting >= 1.0) {
          this._convertHumanToZombie(closestPrey);
        }
      }

      const breachRate = (z.caste === 'brute' ? 180 : z.surging ? 65 : 28) * dt;
      this.world.resolveEntityCollision(
        z,
        z.caste === 'brute' ? 0.65 : 0.42,
        breachRate,
        this.audio,
        (wall) => {
          this.buildingsBreached++;
          this.addDNA(10);
          this.pushRadioAlert(`HORDE BREACHED ${wall.themeName} (+10 DNA)!`, 'emerald');
        }
      );
    }
  }

  _updateHumans(dt) {
    const pz = this.patientZero;

    for (let i = 0, len = this.humans.length; i < len; i++) {
      const h = this.humans[i];
      if (h.dead) continue;

      if (h.hitFlash > 0) h.hitFlash = Math.max(0, h.hitFlash - dt * 3.5);
      if (h.fireCooldown > 0) h.fireCooldown -= dt;
      h.aimTarget = null;

      const nearZombies = this.zombieGrid.queryRadius(h.x, h.z, 18.0);
      let threat = pz;
      let minDist = Math.hypot(pz.x - h.x, pz.z - h.z);

      for (let j = 0; j < nearZombies.length; j++) {
        const z = nearZombies[j];
        const d = Math.hypot(z.x - h.x, z.z - h.z);
        if (d < minDist) {
          minDist = d;
          threat = z;
        }
      }

      let moveX = 0;
      let moveZ = 0;
      const baseSpeed =
        h.type === 'sprinter'
          ? 7.8
          : h.type === 'police' || h.type === 'sniper'
          ? 5.2
          : h.type === 'hazmat'
          ? 4.6
          : 5.8;

      if (minDist < 18.0) {
        const awayX = (h.x - threat.x) / Math.max(0.1, minDist);
        const awayZ = (h.z - threat.z) / Math.max(0.1, minDist);

        if ((h.type === 'police' || h.type === 'hazmat' || h.type === 'sniper') && minDist > 4.8) {
          h.aimTarget = threat;
          h.heading = Math.atan2(threat.x - h.x, threat.z - h.z);

          if (h.fireCooldown <= 0) {
            this._humanFireWeapon(h, threat);
          }
        } else {
          moveX = awayX * baseSpeed;
          moveZ = awayZ * baseSpeed;
        }
      } else {
        moveX = Math.sin(h.phase + this.time * 0.4) * 1.8;
        moveZ = Math.cos(h.phase + this.time * 0.4) * 1.8;
      }

      h.vx += (moveX - h.vx) * Math.min(1, dt * 7.0);
      h.vz += (moveZ - h.vz) * Math.min(1, dt * 7.0);
      h.x += h.vx * dt;
      h.z += h.vz * dt;

      if (!h.aimTarget && Math.hypot(h.vx, h.vz) > 0.25) {
        h.heading = Math.atan2(h.vx, h.vz);
      }

      const distToPZ = Math.hypot(h.x - pz.x, h.z - pz.z);
      if (distToPZ < 1.25) {
        this._convertHumanToZombie(h);
        continue;
      }

      this.world.resolveEntityCollision(h, 0.42, 0);
    }
  }

  _humanFireWeapon(h, target) {
    if (h.type === 'sniper') {
      h.fireCooldown = 2.4;
      this.vfx.emitSparks(h.x, 1.35, h.z, 0xef4444, 8, 9.0, 0.9, 0.25);
      this.vfx.spawnFlashLight(h.x, 1.5, h.z, 0xef4444, 5, 10, 0.18);
      if (this.audio) this.audio.playGunshot(true);

      const dmgMult = this.formation === 'SHIELD_WALL' ? 0.4 : 1.0;
      if (target === this.patientZero) {
        target.hp = Math.max(25, target.hp - 18 * dmgMult);
        target.hitFlash = 0.8;
      } else {
        target.hp -= 85 * dmgMult;
        target.hitFlash = 0.9;
        if (target.hp <= 0 && !target.dead) {
          target.dead = true;
          const dx = target.x - h.x;
          const dz = target.z - h.z;
          const d = Math.hypot(dx, dz) || 1;
          this.vfx.spawnRagdoll(target.x, target.z, (dx / d) * 10, 6.5, (dz / d) * 10, 0x4ade80, target.scale);
        }
      }
    } else if (h.type === 'hazmat') {
      h.fireCooldown = 0.45;
      const dx = target.x - h.x;
      const dz = target.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vfx.emitSoftCloud(h.x + (dx / d) * 2.2, 1.1, h.z + (dz / d) * 2.2, 0x38bdf8, 4, 1.2, 2.0, 0.65);
      if (target !== this.patientZero) {
        target.hp -= 24;
        target.hitFlash = 0.6;
        if (target.hp <= 0 && !target.dead) {
          target.dead = true;
          this.vfx.spawnRagdoll(target.x, target.z, (dx / d) * 6, 4.5, (dz / d) * 6, 0x4ade80, target.scale);
        }
      }
    } else if (h.type === 'police') {
      h.fireCooldown = 1.25;
      this.vfx.emitSparks(h.x, 1.3, h.z, 0xfef08a, 5, 7.0, 0.7, 0.2);
      if (this.audio) this.audio.playGunshot(false);

      if (target !== this.patientZero) {
        target.hp -= 32;
        target.hitFlash = 0.7;
        if (target.hp <= 0 && !target.dead) {
          target.dead = true;
          const dx = target.x - h.x;
          const dz = target.z - h.z;
          const d = Math.hypot(dx, dz) || 1;
          this.vfx.spawnRagdoll(target.x, target.z, (dx / d) * 7, 5.5, (dz / d) * 7, 0x4ade80, target.scale);
        }
      }
    }
  }

  _checkWorldInteractions() {
    const pz = this.patientZero;

    for (let i = 0; i < this.world.dnaCanisters.length; i++) {
      const c = this.world.dnaCanisters[i];
      if (c.collected) continue;

      let grabbed = Math.hypot(c.x - pz.x, c.z - pz.z) < 2.2;
      if (!grabbed) {
        const nearZ = this.zombieGrid.queryRadius(c.x, c.z, 1.8);
        grabbed = nearZ.length > 0;
      }

      if (grabbed) {
        c.collected = true;
        c.mesh.visible = false;
        this.addDNA(25);
        this.vfx.emitSparks(c.x, 1.1, c.z, 0x34d399, 18, 8.0, 1.2, 0.55);
        this.vfx.spawnFlashLight(c.x, 1.5, c.z, 0x34d399, 6, 10, 0.35);
        if (this.audio) this.audio.playDNAPickup();
        this.pushRadioAlert('MUTAGEN CANISTER SECURED (+25 DNA)', 'emerald');
      }
    }

    for (let i = 0; i < this.world.hazards.length; i++) {
      const hz = this.world.hazards[i];
      if (!hz.intact) continue;

      const hitByPZ = Math.hypot(hz.x - pz.x, hz.z - pz.z) < hz.r + 0.85;
      const nearZ = this.zombieGrid.queryRadius(hz.x, hz.z, hz.r + 0.65);

      if (hitByPZ || nearZ.length >= 2) {
        hz.intact = false;
        hz.mesh.visible = false;

        if (hz.type === 'barrel') {
          this.spawnExplosionDamage(hz.x, hz.z, 6.5, true);
          this.spawnSporeCloud(hz.x, hz.z, 6.0, 7.5);
          if (this.audio) this.audio.playExplosion(0.75);
          this.pushRadioAlert('BIO-HAZARD DRUM RUPTURED — INFECTIOUS SPORES RELEASED!', 'emerald');
        } else {
          this.vfx.emitSoftCloud(hz.x, 1.2, hz.z, 0xbae6fd, 18, 1.2, 2.6, 1.4);
          this.vfx.emitSparks(hz.x, 1.0, hz.z, 0x38bdf8, 22, 10.0, 1.1, 0.65);
          if (this.audio) this.audio.playGlassShatter();
        }
      }
    }
  }

  getCasteCounts() {
    const counts = { walker: 0, leaper: 0, brute: 0, spitter: 0 };
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (!z.dead) {
        counts[z.caste] = (counts[z.caste] || 0) + 1;
      }
    }
    return counts;
  }
}
