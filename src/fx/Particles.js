import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, maxParticles = 800) {
    this.maxParticles = maxParticles;
    this.particles = [];
    this.activeCount = 0;

    // Allocate particle pool
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.0,
        scale: 0.2,
        r: 1,
        g: 1,
        b: 1,
        active: false,
        isPuff: false,
      });
    }

    // InstancedMesh for particles
    const geom = new THREE.IcosahedronGeometry(0.18, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    this.mesh = new THREE.InstancedMesh(geom, mat, maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxParticles * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this.dummy = new THREE.Object3D();
    this.colorHelper = new THREE.Color();

    // Hide all initially
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < maxParticles; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, life, scale = 0.2, isPuff = false) {
    // Find inactive particle
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.vz = vz;
        p.r = r;
        p.g = g;
        p.b = b;
        p.life = life;
        p.maxLife = life;
        p.scale = scale;
        p.isPuff = isPuff;
        return;
      }
    }
  }

  burstInfection(x, z) {
    // Green toxic splatter
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.5;
      const vx = Math.cos(angle) * spd;
      const vz = Math.sin(angle) * spd;
      const vy = 1.5 + Math.random() * 3.5;
      this.spawn(
        x + (Math.random() - 0.5) * 0.4,
        0.5,
        z + (Math.random() - 0.5) * 0.4,
        vx,
        vy,
        vz,
        0.15,
        1.0,
        0.3,
        0.45 + Math.random() * 0.35,
        0.22
      );
    }
  }

  burstInfectionDroplets(x, z, count = 6) {
    // 6 cartoon toxic lime-green droplets bursting outward
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = 2.2 + Math.random() * 2.8;
      const vx = Math.cos(angle) * spd;
      const vz = Math.sin(angle) * spd;
      const vy = 2.4 + Math.random() * 2.2;
      this.spawn(
        x,
        0.8,
        z,
        vx,
        vy,
        vz,
        0.29,
        0.87,
        0.50, // Lime green #4ade80
        0.42 + Math.random() * 0.22,
        0.28
      );
    }
  }

  burstDustCloud(x, z, count = 8) {
    // Comic dust puff for prop knockdown collisions and explosions
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 2.5;
      this.spawn(
        x + (Math.random() - 0.5) * 0.5,
        0.35 + Math.random() * 0.4,
        z + (Math.random() - 0.5) * 0.5,
        Math.cos(angle) * spd,
        1.4 + Math.random() * 1.8,
        Math.sin(angle) * spd,
        0.85,
        0.88,
        0.92,
        0.35 + Math.random() * 0.2,
        0.35
      );
    }
  }

  burstRunDust(x, z, count = 2) {
    // Expanding and shrinking flat white comic puff spheres at feet that fade quickly
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.4 + Math.random() * 0.7;
      this.spawn(
        x + (Math.random() - 0.5) * 0.3,
        0.10,
        z + (Math.random() - 0.5) * 0.3,
        Math.cos(angle) * spd,
        0.25 + Math.random() * 0.35,
        Math.sin(angle) * spd,
        1.0,
        1.0,
        1.0, // Flat white comic puff
        0.26 + Math.random() * 0.08,
        0.35 + Math.random() * 0.12,
        true // isPuff
      );
    }
  }

  burstCure(x, z) {
    // Cyan de-infection sparkles
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.0;
      this.spawn(
        x,
        0.6,
        z,
        Math.cos(angle) * spd,
        2.0 + Math.random() * 2.0,
        Math.sin(angle) * spd,
        0.2,
        0.85,
        1.0,
        0.5,
        0.2
      );
    }
  }

  sprayMist(x, z, angle, coneLength) {
    // Spray mist emitted from Hazmat unit
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const dirAngle = angle + spread;
      const spd = 6.0 + Math.random() * 4.0;
      this.spawn(
        x + Math.sin(angle) * 0.8,
        0.5 + (Math.random() - 0.5) * 0.3,
        z + Math.cos(angle) * 0.8,
        Math.sin(dirAngle) * spd,
        (Math.random() - 0.5) * 0.4,
        Math.cos(dirAngle) * spd,
        0.9,
        0.95,
        1.0,
        0.35 + Math.random() * 0.2,
        0.28
      );
    }
  }

  burstTransfer(oldPos, newPos) {
    // Lightning line along transfer path
    const dx = newPos.x - oldPos.x;
    const dz = newPos.z - oldPos.z;
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = oldPos.x + dx * t + (Math.random() - 0.5) * 0.8;
      const pz = oldPos.z + dz * t + (Math.random() - 0.5) * 0.8;
      this.spawn(
        px,
        0.6 + Math.sin(t * Math.PI) * 1.5,
        pz,
        (Math.random() - 0.5) * 1.0,
        Math.random() * 2.0,
        (Math.random() - 0.5) * 1.0,
        0.2,
        1.0,
        0.9,
        0.6,
        0.25
      );
    }
  }

  /**
   * Spawns an expanding ground shockwave ring of comic puff spheres (Titan footsteps / stomps)
   */
  burstShockwave(x, z, radius = 3.5) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spd = 7.0 + Math.random() * 3.5;
      const vx = Math.cos(angle) * spd;
      const vz = Math.sin(angle) * spd;
      this.spawn(
        x + Math.cos(angle) * 0.5,
        0.18,
        z + Math.sin(angle) * 0.5,
        vx,
        0.8 + Math.random() * 0.6,
        vz,
        0.95,
        0.85,
        1.0, // Slight purple-white tint
        0.35 + Math.random() * 0.15,
        0.52, // Chunky puff scale
        true  // isPuff
      );
    }
  }

  /**
   * Massive comic puff burst when the Titan transforms or shrinks
   */
  burstTitanPuff(x, z) {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 1.5;
      const spd = 3.0 + Math.random() * 5.0;
      const vx = Math.cos(angle) * spd;
      const vz = Math.sin(angle) * spd;
      const isPurple = Math.random() > 0.4;
      this.spawn(
        x + Math.cos(angle) * dist,
        0.4 + Math.random() * 1.2,
        z + Math.sin(angle) * dist,
        vx,
        2.0 + Math.random() * 3.5,
        vz,
        isPurple ? 0.66 : 1.0,
        isPurple ? 0.33 : 1.0,
        1.0,
        0.55 + Math.random() * 0.25,
        0.75, // Extra large puff
        true
      );
    }
  }

  /**
   * High-velocity sniper bullet tracer sparks
   */
  burstTracer(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dy, dz);
    const steps = Math.min(14, Math.max(5, Math.floor(dist * 0.8)));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      this.spawn(
        x0 + dx * t + (Math.random() - 0.5) * 0.1,
        y0 + dy * t + (Math.random() - 0.5) * 0.1,
        z0 + dz * t + (Math.random() - 0.5) * 0.1,
        (dx / (dist || 1)) * 12 + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (dz / (dist || 1)) * 12 + (Math.random() - 0.5) * 2,
        1.0,
        0.8,
        0.2, // Bright neon-amber tracer sparks
        0.18 + Math.random() * 0.12,
        0.16,
        false
      );
    }
  }

  burstSlipstream(x, y, z, dirX, dirZ) {
    // White comic wind streaks trailing behind compressed horde flanks
    for (let i = 0; i < 4; i++) {
      const perpX = -dirZ * (Math.random() - 0.5) * 1.6;
      const perpZ = dirX * (Math.random() - 0.5) * 1.6;
      this.spawn(
        x + perpX,
        y + 0.3 + (Math.random() - 0.5) * 0.4,
        z + perpZ,
        -dirX * (3.5 + Math.random() * 2.5),
        (Math.random() - 0.5) * 0.4,
        -dirZ * (3.5 + Math.random() * 2.5),
        0.95,
        0.98,
        1.0, // White comic wind streak
        0.20 + Math.random() * 0.15,
        0.18,
        true
      );
    }
  }

  burstSlimeSplash(x, z) {
    // Toxic green slime splash when civilian slips
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 2.5;
      this.spawn(
        x + (Math.random() - 0.5) * 0.3,
        0.15,
        z + (Math.random() - 0.5) * 0.3,
        Math.cos(angle) * spd,
        1.2 + Math.random() * 2.0,
        Math.sin(angle) * spd,
        0.29,
        0.87,
        0.50, // Toxic green #4ade80
        0.35 + Math.random() * 0.25,
        0.22,
        false
      );
    }
  }

  /**
   * Massive Hollywood-style cinematic explosion for demolished cars
   */
  burstExplosion(x, z) {
    // 1. Hot white/yellow core flash puffs
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 4.0;
      this.spawn(
        x + (Math.random() - 0.5) * 0.4,
        0.5 + Math.random() * 0.6,
        z + (Math.random() - 0.5) * 0.4,
        Math.cos(angle) * spd,
        2.0 + Math.random() * 3.5,
        Math.sin(angle) * spd,
        1.0,
        0.95,
        0.35, // Brilliant radiant yellow flash
        0.28 + Math.random() * 0.15,
        0.65 + Math.random() * 0.25,
        true
      );
    }

    // 2. Expanding flame and fireball clouds (vibrant cartoon flame orange/red)
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 3.5 + Math.random() * 4.5;
      const isOrange = Math.random() > 0.4;
      this.spawn(
        x + (Math.random() - 0.5) * 0.8,
        0.6 + Math.random() * 0.8,
        z + (Math.random() - 0.5) * 0.8,
        Math.cos(angle) * spd,
        3.0 + Math.random() * 4.5,
        Math.sin(angle) * spd,
        1.0,
        isOrange ? 0.45 : 0.15,
        0.05, // Flame orange / fiery red
        0.45 + Math.random() * 0.25,
        0.75 + Math.random() * 0.35,
        true
      );
    }

    // 3. Rolling dark charcoal smoke clouds
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.0;
      const shade = 0.18 + Math.random() * 0.12;
      this.spawn(
        x + (Math.random() - 0.5) * 1.2,
        0.8 + Math.random() * 1.0,
        z + (Math.random() - 0.5) * 1.2,
        Math.cos(angle) * spd,
        2.5 + Math.random() * 3.5,
        Math.sin(angle) * spd,
        shade,
        shade,
        shade + 0.04, // Dark billow smoke
        0.65 + Math.random() * 0.35,
        0.80 + Math.random() * 0.40,
        true
      );
    }

    // 4. High-velocity burning ember sparks
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 5.0 + Math.random() * 7.5;
      this.spawn(
        x,
        0.6,
        z,
        Math.cos(angle) * spd,
        4.0 + Math.random() * 6.0,
        Math.sin(angle) * spd,
        1.0,
        0.75 + Math.random() * 0.25,
        0.10, // Fiery neon ember sparks
        0.45 + Math.random() * 0.35,
        0.20 + Math.random() * 0.10,
        false
      );
    }

    // 5. Ground dust shockwave ring
    this.burstShockwave(x, z, 4.5);
  }

  /**
   * Vibrant green leaf clusters and bark splinters when smashing bushes/trees
   */
  burstLeaves(x, z, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.5;
      const isLime = Math.random() > 0.45;
      this.spawn(
        x + (Math.random() - 0.5) * 0.8,
        0.6 + Math.random() * 1.0,
        z + (Math.random() - 0.5) * 0.8,
        Math.cos(angle) * spd,
        2.0 + Math.random() * 3.5,
        Math.sin(angle) * spd,
        isLime ? 0.52 : 0.08,
        isLime ? 0.90 : 0.72,
        isLime ? 0.12 : 0.25, // Lime green and emerald foliage
        0.45 + Math.random() * 0.30,
        0.42 + Math.random() * 0.25,
        true
      );
    }

    // Wood trunk splinter fragments
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 3.0;
      this.spawn(
        x,
        0.4,
        z,
        Math.cos(angle) * spd,
        1.8 + Math.random() * 2.5,
        Math.sin(angle) * spd,
        0.47,
        0.21,
        0.06, // Brown wood splinter #78350f
        0.35 + Math.random() * 0.2,
        0.20,
        false
      );
    }
  }

  /**
   * High-voltage sparks and electrical clatter when smashing street lamps
   */
  burstSparks(x, z, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 3.5 + Math.random() * 6.5;
      const isCyan = Math.random() > 0.65;
      this.spawn(
        x + (Math.random() - 0.5) * 0.3,
        2.2 + (Math.random() - 0.5) * 1.0,
        z + (Math.random() - 0.5) * 0.3,
        Math.cos(angle) * spd,
        3.0 + Math.random() * 4.5,
        Math.sin(angle) * spd,
        isCyan ? 0.25 : 1.0,
        isCyan ? 0.92 : 0.95,
        isCyan ? 1.00 : 0.20, // Electric yellow & cyan arcs
        0.30 + Math.random() * 0.25,
        0.18 + Math.random() * 0.08,
        false
      );
    }
  }

  /**
   * Cedar wood chips and iron brackets when pulverizing park benches
   */
  burstWoodSplinters(x, z, count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.0;
      const isIron = Math.random() > 0.65;
      this.spawn(
        x + (Math.random() - 0.5) * 0.5,
        0.5 + Math.random() * 0.4,
        z + (Math.random() - 0.5) * 0.5,
        Math.cos(angle) * spd,
        2.2 + Math.random() * 3.0,
        Math.sin(angle) * spd,
        isIron ? 0.20 : 0.85,
        isIron ? 0.22 : 0.47,
        isIron ? 0.28 : 0.05, // Cedar wood amber and cast iron slate
        0.40 + Math.random() * 0.25,
        0.24 + Math.random() * 0.12,
        false
      );
    }
  }

  /**
   * High-pressure vertical water geyser spraying into the sky from ruptured hydrant
   */
  burstWaterGeyser(x, z, count = 24) {
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const spd = 1.0 + Math.random() * 2.2;
      const angle = Math.random() * Math.PI * 2;
      this.spawn(
        x + Math.cos(angle) * 0.25,
        0.5 + Math.random() * 0.4,
        z + Math.sin(angle) * 0.25,
        Math.cos(angle) * spd,
        7.5 + Math.random() * 5.5, // Shoot straight up into the air
        Math.sin(angle) * spd,
        0.35,
        0.82,
        1.00, // Sky blue water #38bdf8
        0.55 + Math.random() * 0.35,
        0.30 + Math.random() * 0.18,
        true
      );
    }
  }

  update(dt) {
    const gravity = -9.8;
    let anyNeedsUpdate = false;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        // Hide
        this.dummy.position.set(0, -9999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        anyNeedsUpdate = true;
        continue;
      }

      // Kinematic update
      if (p.isPuff) {
        p.vy += -2.5 * dt; // Gentle gravity for buoyant dust puff
        p.x += p.vx * dt;
        p.y = Math.max(0.06, p.y + p.vy * dt);
        p.z += p.vz * dt;
        p.vx *= 0.88;
        p.vz *= 0.88;
      } else {
        p.vy += gravity * dt;
        p.x += p.vx * dt;
        p.y = Math.max(0.1, p.y + p.vy * dt);
        p.z += p.vz * dt;
        p.vx *= 0.95;
        p.vz *= 0.95;
      }

      const progress = p.life / p.maxLife;
      let currentScale;
      if (p.isPuff) {
        // Expanding and shrinking flat comic puff curve
        const t = 1.0 - progress; // 0 to 1
        currentScale = p.scale * Math.sin(t * Math.PI);
      } else {
        currentScale = p.scale * progress;
      }

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.set(currentScale, currentScale, currentScale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      this.colorHelper.setRGB(p.r, p.g, p.b);
      this.mesh.setColorAt(i, this.colorHelper);
      anyNeedsUpdate = true;
    }

    if (anyNeedsUpdate) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) {
        this.mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}
