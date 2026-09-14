import * as THREE from 'three';

const POWERUP_TYPES = [
  { id: 'speed_surge', label: '⚡ SPEED SURGE!', symbol: '⚡', color: 0x00ffcc },
  { id: 'meat_magnet', label: '🧲 MEAT MAGNET!', symbol: '🧲', color: 0xff0055 },
  { id: 'bloater_bomb', label: '💥 BLOATER BOMB!', symbol: '💥', color: 0xffaa00 },
  { id: 'titan_virus', label: '☣️ TITAN VIRUS!', symbol: '☣️', color: 0xa855f7 }
];

function createBadgeTexture(symbol, hexColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background dark circle with neon border
  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();

  ctx.lineWidth = 14;
  const hexStr = '#' + hexColor.toString(16).padStart(6, '0');
  ctx.strokeStyle = hexStr;
  ctx.stroke();

  // Glow shadow for symbol
  ctx.shadowColor = hexStr;
  ctx.shadowBlur = 24;
  ctx.font = 'bold 112px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 128, 136);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export class PowerupManager {
  constructor(scene) {
    this.scene = scene;
    this.powerups = [];
    this.cityStreamer = null;
    this.entityManager = null;

    // Group to hold all powerup meshes
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Reusable geometries
    this.badgeGeom = new THREE.PlaneGeometry(1.6, 1.6);
    this.ringGeom = new THREE.RingGeometry(1.1, 1.45, 32);
    this.ringGeom.rotateX(-Math.PI / 2);
    this.waveGeom = new THREE.RingGeometry(1.45, 1.6, 32);
    this.waveGeom.rotateX(-Math.PI / 2);

    // Cache textures and materials
    this.materials = {};
    for (const type of POWERUP_TYPES) {
      const tex = createBadgeTexture(type.symbol, type.color);
      this.materials[type.id] = {
        badge: new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        ring: new THREE.MeshBasicMaterial({
          color: type.color,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        wave: new THREE.MeshBasicMaterial({
          color: type.color,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      };
    }

    this.spawnTimer = 0;
    this._hasSpawnedInitial = false;
  }

  initStartingPowerups() {
    if (this._hasSpawnedInitial) return;
    this._hasSpawnedInitial = true;
    // Guaranteed Titan Virus canister directly ahead on the starting road (clearly in camera view)
    this.spawnPowerup(0, -14, 'titan_virus');
    // Speed Surge powerup at the upcoming intersection
    this.spawnPowerup(6, -26, 'speed_surge');
  }

  update(time, dt, pz) {
    if (!pz) return;

    // Auto-init starting powerups on first active frame
    if (!this._hasSpawnedInitial) {
      this.initStartingPowerups();
    }

    // 1. Spawning Logic: Spawn on roads ahead of the player
    this.spawnTimer += dt;
    if (this.spawnTimer > 7.0 && this.powerups.length < 4 && this.cityStreamer) {
      this.spawnTimer = 0;
      // Calculate target position 20-45m ahead in player direction
      const angle = pz.angle || 0;
      const fwdDist = 20 + Math.random() * 22;
      const targetX = pz.x + Math.sin(angle) * fwdDist + (Math.random() - 0.5) * 14;
      const targetZ = pz.z + Math.cos(angle) * fwdDist + (Math.random() - 0.5) * 14;

      const pt = this.cityStreamer.getRandomStreetPoint(targetX, targetZ, 3, 18) ||
                 this.cityStreamer.getRandomStreetPoint(pz.x, pz.z, 20, 42);
      if (pt) {
        // 35% chance to roll Titan Virus so player frequently gets to experience colossal mode
        const forcedType = Math.random() < 0.35 ? 'titan_virus' : null;
        this.spawnPowerup(pt.x, pt.z, forcedType);
      }
    }

    // 2. Update & Collision Logic
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];

      // Animate Billboard Badge (spinning + 0.5Hz vertical bob hovered 1.5m above ground)
      p.badgeMesh.rotation.y += dt * 2.8;
      p.badgeMesh.position.y = 1.5 + Math.sin(time * 3.14 + p.x * 0.1) * 0.28;
      if (p.canisterMesh) {
        p.canisterMesh.rotation.y += dt * 1.8;
        p.canisterMesh.position.y = p.badgeMesh.position.y;
      }

      // Animate Ground Beacon & Wave Ring
      const pulse = 1.0 + Math.sin(time * 7.0) * 0.12;
      p.ringMesh.scale.set(pulse, 1, pulse);
      p.ringMesh.material.opacity = 0.5 + Math.sin(time * 6.0) * 0.25;

      const waveProgress = (time * 1.5 + p.z * 0.1) % 1.0;
      const waveScale = 1.0 + waveProgress * 1.6;
      p.waveMesh.scale.set(waveScale, 1, waveScale);
      p.waveMesh.material.opacity = (1.0 - waveProgress) * 0.55;

      // Distance check for despawn
      const distSq = (p.x - pz.x) ** 2 + (p.z - pz.z) ** 2;
      if (distSq > 150 * 150) {
        this._removePowerup(i);
        continue;
      }

      // Collision Check with Patient Zero (2.2m pickup radius)
      if (distSq < 4.84) {
        this._collectPowerup(p, i, pz.x, pz.z);
        continue;
      }

      // Collision Check with Swarm Zombies
      if (this.entityManager) {
        let collected = false;
        const horde = this.entityManager.zombies;
        for (let j = 0; j < horde.length; j++) {
          const z = horde[j];
          const zdx = p.x - z.x;
          const zdz = p.z - z.z;
          if (zdx * zdx + zdz * zdz < 4.84) {
            this._collectPowerup(p, i, z.x, z.z);
            collected = true;
            break;
          }
        }
        if (collected) continue;
      }
    }
  }

  spawnPowerup(x, z, forcedTypeId = null) {
    const typeDef = forcedTypeId 
      ? (POWERUP_TYPES.find(t => t.id === forcedTypeId) || POWERUP_TYPES[0])
      : POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const mats = this.materials[typeDef.id];

    // Double-sided floating billboard badge
    const badgeMesh = new THREE.Mesh(this.badgeGeom, mats.badge);
    badgeMesh.position.set(x, 1.5, z);

    // Giant dark-purple biohazard canister for Titan Virus
    let canisterMesh = null;
    if (typeDef.id === 'titan_virus') {
      const canGroup = new THREE.Group();
      const liquidGeom = new THREE.CylinderGeometry(0.38, 0.38, 1.0, 16);
      const liquidMat = new THREE.MeshToonMaterial({
        color: 0xa855f7,
        emissive: 0x7e22ce,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.85,
      });
      const liquid = new THREE.Mesh(liquidGeom, liquidMat);
      canGroup.add(liquid);

      const capGeom = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 16);
      const capMat = new THREE.MeshToonMaterial({ color: 0x1e293b });
      const topCap = new THREE.Mesh(capGeom, capMat);
      topCap.position.y = 0.58;
      const btmCap = new THREE.Mesh(capGeom, capMat);
      btmCap.position.y = -0.58;
      canGroup.add(topCap);
      canGroup.add(btmCap);

      canGroup.position.set(x, 1.5, z);
      this.group.add(canGroup);
      canisterMesh = canGroup;
    }

    // Ground Beacon Rings
    const ringMesh = new THREE.Mesh(this.ringGeom, mats.ring.clone());
    ringMesh.position.set(x, 0.05, z);

    const waveMesh = new THREE.Mesh(this.waveGeom, mats.wave.clone());
    waveMesh.position.set(x, 0.04, z);

    this.group.add(badgeMesh);
    this.group.add(ringMesh);
    this.group.add(waveMesh);

    this.powerups.push({
      x, z,
      type: typeDef,
      typeId: typeDef.id,
      badgeMesh,
      canisterMesh,
      ringMesh,
      waveMesh
    });
  }

  _removePowerup(index) {
    const p = this.powerups[index];
    this.group.remove(p.badgeMesh);
    if (p.canisterMesh) this.group.remove(p.canisterMesh);
    this.group.remove(p.ringMesh);
    this.group.remove(p.waveMesh);
    this.powerups.splice(index, 1);
  }

  _collectPowerup(p, index, collectX, collectZ) {
    // 1. Trigger actual game mechanic in EntityManager
    if (this.entityManager) {
      if (this.entityManager.activatePowerup) {
        this.entityManager.activatePowerup(p.type.id);
      }
      this.entityManager.score += 600;
      if (this.entityManager.onComboInfection) {
        this.entityManager.onComboInfection(this.entityManager.combo, this.entityManager.score, collectX, collectZ);
      }
    }

    // 2. Create Floating Text Popup
    this._createFloatingText(p.type.label, p.type.color);

    // 3. Trigger audio / FX callback
    if (this.onPowerupCollected) {
      this.onPowerupCollected(p.type.id, p.type.label, p.type.color);
    }

    // 4. Cleanup
    this._removePowerup(index);
  }

  _createFloatingText(text, hexColor) {
    const popup = document.createElement('div');
    popup.className = 'floating-popup-text';
    popup.innerText = text;
    const hexStr = '#' + hexColor.toString(16).padStart(6, '0');
    popup.style.color = hexStr;
    popup.style.textShadow = `0 4px 15px rgba(0,0,0,0.8), 0 0 25px ${hexStr}`;

    const container = document.getElementById('game-container') || document.body;
    container.appendChild(popup);

    setTimeout(() => {
      if (popup.parentElement) {
        popup.parentElement.removeChild(popup);
      }
    }, 1500);
  }

  clearAll() {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      this._removePowerup(i);
    }
    this._hasSpawnedInitial = false;
  }

  reset() {
    this.clearAll();
    this.initStartingPowerups();
  }
}
