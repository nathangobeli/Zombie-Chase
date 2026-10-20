import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Next-Gen VFX Manager for Zombie Chase v3.0:
 *  - 3D Tumbling Ragdoll Physics Pool (car hits, explosions, Brute slams, sniper kills)
 *  - Dual-Pass GPU Particles:
 *      1) Additive HDR Embers/Sparks/Plasma
 *      2) Soft Alpha-Fading Smoke/Spore Billboards (with per-instance opacity shader!)
 *  - Persistent Ground Blood, Bio-Slime & Scorch Decals
 *  - Expanding 3D Shockwave Rings
 *  - Pooled Dynamic Point Lights
 */
export class VFXManager {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;

    this._initAdditiveParticles(900);
    this._initSoftAlphaParticles(600);
    this._initDecals(450);
    this._initRagdolls(140);
    this._initShockwaves(16);
    this._initDynamicLights(10);
  }

  // ---------------------------------------------------------------------------
  // 1. Additive HDR Particles (Sparks, Fire, Acid Plasma, DNA Orbs)
  // ---------------------------------------------------------------------------
  _initAdditiveParticles(max) {
    this.maxAdd = max;
    this.addList = [];
    const geo = new THREE.IcosahedronGeometry(0.18, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.addMesh = new THREE.InstancedMesh(geo, mat, max);
    this.addMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.addMesh.frustumCulled = false;
    this.addMesh.count = 0;
    for (let i = 0; i < max; i++) {
      this.addMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.addMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.addMesh);
  }

  // ---------------------------------------------------------------------------
  // 2. Soft Alpha-Fading Billboards (Smoke, Toxic Spores, Water Mist)
  // ---------------------------------------------------------------------------
  _initSoftAlphaParticles(max) {
    this.maxSoft = max;
    this.softList = [];
    const geo = new THREE.PlaneGeometry(1.0, 1.0);
    const opacities = new Float32Array(max);
    this.softOpacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
    this.softOpacityAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOpacity', this.softOpacityAttr);

    const mat = new THREE.MeshBasicMaterial({
      map: this.textures.softParticle,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute float aOpacity;
        varying float vAlpha;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vAlpha = aOpacity;
        `
      );
      shader.fragmentShader = `
        varying float vAlpha;
        ${shader.fragmentShader}
      `.replace(
        '#include <dithering_fragment>',
        `
        gl_FragColor.a *= vAlpha;
        #include <dithering_fragment>
        `
      );
    };

    this.softMesh = new THREE.InstancedMesh(geo, mat, max);
    this.softMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.softMesh.frustumCulled = false;
    this.softMesh.count = 0;
    for (let i = 0; i < max; i++) {
      this.softMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.softMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.softMesh);
  }

  // ---------------------------------------------------------------------------
  // 3. Persistent Ground Splat & Scorch Decals
  // ---------------------------------------------------------------------------
  _initDecals(max) {
    this.maxDecals = max;
    this.decalHead = 0;
    this.decalCount = 0;

    const geo = new THREE.PlaneGeometry(1.0, 1.0);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.splatDecal,
      transparent: true,
      alphaTest: 0.08,
      roughness: 0.22,
      metalness: 0.1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    this.decalMesh = new THREE.InstancedMesh(geo, mat, max);
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.receiveShadow = true;
    this.decalMesh.frustumCulled = false;
    this.decalMesh.count = 0;
    for (let i = 0; i < max; i++) {
      this.decalMesh.setColorAt(i, _color.setHex(0x991b1b));
    }
    this.decalMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.decalMesh);
  }

  // ---------------------------------------------------------------------------
  // 4. 3D Tumbling Ragdoll Physics Pool
  // ---------------------------------------------------------------------------
  _initRagdolls(max) {
    this.maxRagdolls = max;
    this.ragdolls = [];

    const geo = new THREE.CapsuleGeometry(0.24, 0.72, 5, 8);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.1,
    });

    this.ragdollMesh = new THREE.InstancedMesh(geo, mat, max);
    this.ragdollMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ragdollMesh.castShadow = true;
    this.ragdollMesh.frustumCulled = false;
    this.ragdollMesh.count = 0;
    for (let i = 0; i < max; i++) {
      this.ragdollMesh.setColorAt(i, _color.setHex(0x4ade80));
    }
    this.ragdollMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.ragdollMesh);
  }

  // ---------------------------------------------------------------------------
  // 5. Expanding 3D Shockwave Rings
  // ---------------------------------------------------------------------------
  _initShockwaves(max) {
    this.shockwaves = [];
    const geo = new THREE.RingGeometry(0.75, 1.0, 36);
    geo.rotateX(-Math.PI / 2);

    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({
        mesh,
        mat,
        active: false,
        age: 0,
        duration: 0.5,
        maxRadius: 10,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Dynamic Point Light Pool
  // ---------------------------------------------------------------------------
  _initDynamicLights(max) {
    this.lightPool = [];
    for (let i = 0; i < max; i++) {
      const light = new THREE.PointLight(0xff8800, 0, 16, 1.8);
      light.visible = false;
      this.scene.add(light);
      this.lightPool.push({
        light,
        active: false,
        age: 0,
        duration: 0.35,
        peakIntensity: 6,
      });
    }
  }

  // ===========================================================================
  // PUBLIC SPAWN API
  // ===========================================================================

  spawnFlashLight(x, y, z, colorHex = 0xff7700, intensity = 8, distance = 18, duration = 0.38) {
    let slot = this.lightPool.find((l) => !l.active);
    if (!slot) slot = this.lightPool[0];
    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.peakIntensity = intensity;
    slot.light.color.setHex(colorHex);
    slot.light.distance = distance;
    slot.light.intensity = intensity;
    slot.light.position.set(x, y, z);
    slot.light.visible = true;
  }

  spawnShockwave(x, z, colorHex = 0x10b981, maxRadius = 11, duration = 0.55) {
    let sw = this.shockwaves.find((s) => !s.active);
    if (!sw) sw = this.shockwaves[0];
    sw.active = true;
    sw.age = 0;
    sw.duration = duration;
    sw.maxRadius = maxRadius;
    sw.mat.color.setHex(colorHex);
    sw.mat.opacity = 0.9;
    sw.mesh.position.set(x, 0.12, z);
    sw.mesh.scale.set(0.5, 0.5, 1);
    sw.mesh.visible = true;
  }

  addDecal(x, z, colorHex = 0x991b1b, scale = 1.6) {
    const idx = this.decalHead;
    this.decalHead = (this.decalHead + 1) % this.maxDecals;
    if (this.decalCount < this.maxDecals) this.decalCount++;

    _dummy.position.set(x, 0.02 + (idx % 7) * 0.002, z);
    _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = scale * (0.8 + Math.random() * 0.45);
    _dummy.scale.set(s, 1, s);
    _dummy.updateMatrix();

    this.decalMesh.setMatrixAt(idx, _dummy.matrix);
    this.decalMesh.setColorAt(idx, _color.setHex(colorHex));
    this.decalMesh.count = this.decalCount;
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalMesh.instanceColor.needsUpdate = true;
  }

  spawnRagdoll(x, z, vx, vy, vz, colorHex = 0x4ade80, scale = 1.0) {
    if (this.ragdolls.length >= this.maxRagdolls) {
      this.ragdolls.shift();
    }
    this.ragdolls.push({
      x,
      y: 0.75,
      z,
      vx,
      vy: Math.max(4.5, vy),
      vz,
      rx: Math.random() * 3,
      ry: Math.random() * 3,
      rz: Math.random() * 3,
      avx: (Math.random() - 0.5) * 16,
      avy: (Math.random() - 0.5) * 16,
      avz: (Math.random() - 0.5) * 16,
      colorHex,
      scale,
      age: 0,
      maxAge: 2.2 + Math.random() * 0.8,
      bounced: false,
    });
  }

  emitSparks(x, y, z, colorHex = 0xfbbf24, count = 16, speed = 8.0, size = 1.0, life = 0.55) {
    for (let i = 0; i < count; i++) {
      if (this.addList.length >= this.maxAdd) break;
      const theta = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI * 0.48;
      const spd = speed * (0.4 + Math.random() * 0.8);
      this.addList.push({
        x,
        y,
        z,
        vx: Math.cos(theta) * Math.cos(elev) * spd,
        vy: Math.sin(elev) * spd + 2.0,
        vz: Math.sin(theta) * Math.cos(elev) * spd,
        colorHex,
        size: size * (0.7 + Math.random() * 0.6),
        age: 0,
        maxAge: life * (0.65 + Math.random() * 0.6),
        gravity: 16.0,
      });
    }
  }

  emitSoftCloud(x, y, z, colorHex = 0x4ade80, count = 8, radius = 1.5, size = 2.4, life = 1.6) {
    for (let i = 0; i < count; i++) {
      if (this.softList.length >= this.maxSoft) break;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.softList.push({
        x: x + Math.cos(a) * r,
        y: y + Math.random() * 0.6,
        z: z + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 0.9 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 2.2,
        colorHex,
        size: size * (0.8 + Math.random() * 0.5),
        age: 0,
        maxAge: life * (0.75 + Math.random() * 0.5),
      });
    }
  }

  spawnExplosion(x, z, radius = 6.5, isBio = false) {
    const primaryHex = isBio ? 0x84cc16 : 0xf97316;
    const secondaryHex = isBio ? 0x10b981 : 0xfef08a;
    const smokeHex = isBio ? 0x365314 : 0x334155;
    const decalHex = isBio ? 0x3f6212 : 0x0f172a;

    this.spawnFlashLight(x, 2.2, z, primaryHex, 12, radius * 3.0, 0.45);
    this.spawnShockwave(x, z, primaryHex, radius * 1.45, 0.5);
    this.addDecal(x, z, decalHex, radius * 0.75);
    this.emitSparks(x, 0.8, z, secondaryHex, 28, 12.0, 1.6, 0.65);
    this.emitSparks(x, 0.6, z, primaryHex, 22, 9.0, 2.1, 0.75);
    this.emitSoftCloud(x, 0.8, z, smokeHex, 14, radius * 0.45, 3.4, 1.8);
  }

  spawnGlassShatter(x, z, normalX = 0, normalZ = 1) {
    for (let i = 0; i < 24; i++) {
      if (this.addList.length >= this.maxAdd) break;
      const spreadX = (Math.random() - 0.5) * 3.5;
      const spreadZ = (Math.random() - 0.5) * 3.5;
      this.addList.push({
        x: x + spreadX * 0.5,
        y: 0.5 + Math.random() * 1.8,
        z: z + spreadZ * 0.5,
        vx: normalX * (3 + Math.random() * 5) + spreadX,
        vy: 1.5 + Math.random() * 4.0,
        vz: normalZ * (3 + Math.random() * 5) + spreadZ,
        colorHex: 0xbae6fd,
        size: 0.85,
        age: 0,
        maxAge: 0.7,
        gravity: 18.0,
      });
    }
  }

  // ===========================================================================
  // FRAME UPDATE
  // ===========================================================================
  update(dt, camera) {
    // 1. Update Additive Particles
    let addIdx = 0;
    for (let i = this.addList.length - 1; i >= 0; i--) {
      const p = this.addList[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.addList[i] = this.addList[this.addList.length - 1];
        this.addList.pop();
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.08) {
        p.y = 0.08;
        p.vy *= -0.45;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }

      const lifeRatio = 1.0 - p.age / p.maxAge;
      const s = p.size * lifeRatio;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.age * 4, p.age * 6, 0);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();

      this.addMesh.setMatrixAt(addIdx, _dummy.matrix);
      this.addMesh.setColorAt(addIdx, _color.setHex(p.colorHex));
      addIdx++;
    }
    this.addMesh.count = addIdx;
    if (addIdx > 0) {
      this.addMesh.instanceMatrix.needsUpdate = true;
      this.addMesh.instanceColor.needsUpdate = true;
    }

    // 2. Update Soft Alpha-Fading Billboards
    let softIdx = 0;
    const camQuat = camera ? camera.quaternion : null;
    for (let i = this.softList.length - 1; i >= 0; i--) {
      const p = this.softList[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.softList[i] = this.softList[this.softList.length - 1];
        this.softList.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.97;
      p.vz *= 0.97;

      const t = p.age / p.maxAge;
      const alpha = Math.sin(t * Math.PI) * 0.58;
      const scale = p.size * (0.7 + t * 0.75);

      _dummy.position.set(p.x, p.y, p.z);
      if (camQuat) {
        _dummy.quaternion.copy(camQuat);
      }
      _dummy.scale.set(scale, scale, 1);
      _dummy.updateMatrix();

      this.softMesh.setMatrixAt(softIdx, _dummy.matrix);
      this.softMesh.setColorAt(softIdx, _color.setHex(p.colorHex));
      this.softOpacityAttr.array[softIdx] = alpha;
      softIdx++;
    }
    this.softMesh.count = softIdx;
    if (softIdx > 0) {
      this.softMesh.instanceMatrix.needsUpdate = true;
      this.softMesh.instanceColor.needsUpdate = true;
      this.softOpacityAttr.needsUpdate = true;
    }

    // 3. Update 3D Tumbling Ragdolls
    let ragIdx = 0;
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const r = this.ragdolls[i];
      r.age += dt;
      if (r.age >= r.maxAge) {
        this.ragdolls[i] = this.ragdolls[this.ragdolls.length - 1];
        this.ragdolls.pop();
        continue;
      }

      r.vy -= 22.0 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;

      if (r.y <= 0.26) {
        r.y = 0.26;
        r.vy = Math.abs(r.vy) * 0.36;
        r.vx *= 0.62;
        r.vz *= 0.62;
        r.avx *= 0.55;
        r.avy *= 0.55;
        r.avz *= 0.55;
        if (!r.bounced) {
          r.bounced = true;
          this.addDecal(r.x, r.z, r.colorHex === 0x4ade80 ? 0x15803d : 0x991b1b, 1.35);
        }
      }

      r.rx += r.avx * dt;
      r.ry += r.avy * dt;
      r.rz += r.avz * dt;

      const shrink = r.age > r.maxAge - 0.35 ? (r.maxAge - r.age) / 0.35 : 1.0;
      const s = r.scale * Math.max(0.05, shrink);

      _dummy.position.set(r.x, r.y, r.z);
      _dummy.rotation.set(r.rx, r.ry, r.rz);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();

      this.ragdollMesh.setMatrixAt(ragIdx, _dummy.matrix);
      this.ragdollMesh.setColorAt(ragIdx, _color.setHex(r.colorHex));
      ragIdx++;
    }
    this.ragdollMesh.count = ragIdx;
    if (ragIdx > 0) {
      this.ragdollMesh.instanceMatrix.needsUpdate = true;
      this.ragdollMesh.instanceColor.needsUpdate = true;
    }

    // 4. Update Expanding Shockwave Rings
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.age += dt;
      if (sw.age >= sw.duration) {
        sw.active = false;
        sw.mesh.visible = false;
        continue;
      }
      const t = sw.age / sw.duration;
      const rad = 0.8 + (sw.maxRadius - 0.8) * (1 - Math.pow(1 - t, 2.4));
      sw.mesh.scale.set(rad, rad, 1);
      sw.mat.opacity = (1.0 - t) * 0.85;
    }

    // 5. Update Pooled Dynamic Point Lights
    for (let i = 0; i < this.lightPool.length; i++) {
      const lp = this.lightPool[i];
      if (!lp.active) continue;
      lp.age += dt;
      if (lp.age >= lp.duration) {
        lp.active = false;
        lp.light.visible = false;
        lp.light.intensity = 0;
        continue;
      }
      const t = lp.age / lp.duration;
      lp.light.intensity = lp.peakIntensity * (1.0 - t * t);
    }
  }
}
