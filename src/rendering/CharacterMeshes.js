import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CharacterShaderUniforms = {
  uTime: { value: 0 },
};

/**
 * Helper to tag a BufferGeometry with vertex RGB color and a `aPartId` attribute:
 *   0 = Torso / Body
 *   1 = Head
 *   2 = Left Arm
 *   3 = Right Arm
 *   4 = Left Leg
 *   5 = Right Leg
 *   6 = HDR Bioluminescent Emissive (Eyes, Spinal Crystals, Acid Sacs, Visors)
 */
function tagPart(geo, hexColor, partId) {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
  const count = nonIndexed.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const parts = new Float32Array(count);
  const col = new THREE.Color(hexColor);

  // Subtle vertical gradient baked into vertex colors for natural ambient occlusion
  const pos = nonIndexed.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.01, maxY - minY);

  for (let i = 0; i < count; i++) {
    const yNorm = (pos.getY(i) - minY) / spanY;
    const shade = partId === 6 ? 1.0 : 0.72 + 0.36 * yNorm;
    colors[i * 3] = col.r * shade;
    colors[i * 3 + 1] = col.g * shade;
    colors[i * 3 + 2] = col.b * shade;
    parts[i] = partId;
  }

  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  nonIndexed.setAttribute('aPartId', new THREE.BufferAttribute(parts, 1));
  return nonIndexed;
}

/**
 * Builds sculpted, smooth-shaded stylized humanoid & mutant caste geometries.
 */
export class CharacterMeshes {
  static createCharacterMaterial(emissiveTint = 0x10b981, emissiveBoost = 2.2) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.15,
    });

    const eColor = new THREE.Color(emissiveTint);

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = CharacterShaderUniforms.uTime;
      shader.uniforms.uEmissiveTint = { value: eColor };
      shader.uniforms.uEmissiveBoost = { value: emissiveBoost };

      shader.vertexShader = `
        attribute float aPartId;
        attribute vec4 aAnimData; // x: phase, y: speedNorm, z: hitFlash, w: casteMode
        uniform float uTime;
        varying float vPartId;
        varying float vHitFlash;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vPartId = aPartId;
        vHitFlash = aAnimData.z;

        float phase = aAnimData.x + uTime * (6.5 + aAnimData.y * 6.0);
        float moveAmt = clamp(aAnimData.y, 0.08, 1.4);

        // Articulated limb swing around shoulder/hip pivots
        if (aPartId > 1.5 && aPartId < 5.5) {
          float dir = (aPartId == 2.0 || aPartId == 5.0) ? 1.0 : -1.0;
          float angle = sin(phase) * 0.62 * moveAmt * dir;
          float pivotY = (aPartId < 3.5) ? 1.25 : 0.72;

          // Zombie castes hold arms forward hungrily
          if (aPartId < 3.5 && aAnimData.w > 0.5) {
            angle -= 0.75;
          }

          float dy = transformed.y - pivotY;
          float dz = transformed.z;
          float c = cos(angle);
          float s = sin(angle);
          transformed.y = pivotY + dy * c - dz * s;
          transformed.z = dy * s + dz * c;
        }

        // Subtle torso bob and forward lean when sprinting
        if (aPartId < 1.5 || aPartId > 5.5) {
          transformed.y += abs(sin(phase)) * 0.06 * moveAmt;
          transformed.z += (transformed.y * 0.09) * moveAmt;
        }

        // Pulsing bioluminescent sacs/crystals (partId == 6)
        if (aPartId > 5.5) {
          float pulse = 1.0 + 0.12 * sin(uTime * 7.0 + aAnimData.x * 3.0);
          transformed.x *= pulse;
          transformed.z *= pulse;
        }
        `
      );

      shader.fragmentShader = `
        uniform vec3 uEmissiveTint;
        uniform float uEmissiveBoost;
        varying float vPartId;
        varying float vHitFlash;
        ${shader.fragmentShader}
      `.replace(
        '#include <dithering_fragment>',
        `
        // True HDR Bioluminescent Emissive on Eyes, Dorsal Spines, and Acid Sacs
        if (vPartId > 5.5) {
          gl_FragColor.rgb = vColor.rgb * uEmissiveBoost + uEmissiveTint * 0.65;
        }
        // Combat impact white-hot flash
        if (vHitFlash > 0.01) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(2.2, 2.0, 1.8), clamp(vHitFlash, 0.0, 1.0));
        }
        #include <dithering_fragment>
        `
      );
    };

    return mat;
  }

  /**
   * Base sculpted humanoid builder with customizable proportions & dorsal mutations.
   */
  static buildSculptedCharacter(cfg) {
    const {
      skinColor = 0x4ade80,
      topColor = 0x1e293b,
      pantsColor = 0x0f172a,
      emissiveColor = 0x34d399,
      scale = 1.0,
      bulk = 1.0,
      hunch = 0.0,
      hasSpines = false,
      hasAcidSacs = false,
      hasShoulderArmor = false,
      hasHelmet = false,
      hasBackpack = false,
    } = cfg;

    const parts = [];

    // 1. Sculpted Torso (tapered chest + waist)
    const chest = new THREE.CylinderGeometry(0.26 * bulk, 0.21 * bulk, 0.56, 10);
    chest.translate(0, 1.02, hunch * 0.5);
    parts.push(tagPart(chest, topColor, 0));

    const pelvis = new THREE.CylinderGeometry(0.21 * bulk, 0.22 * bulk, 0.22, 10);
    pelvis.translate(0, 0.66, 0);
    parts.push(tagPart(pelvis, pantsColor, 0));

    // 2. Sculpted Head (smooth icosahedron/capsule + jaw)
    const head = new THREE.IcosahedronGeometry(0.23 * (0.9 + bulk * 0.1), 2);
    head.scale(0.95, 1.08, 0.98);
    head.translate(0, 1.50, hunch);
    parts.push(tagPart(head, skinColor, 1));

    // Glowing Eyes (partId = 6 => HDR Emissive!)
    const eyeL = new THREE.SphereGeometry(0.048, 8, 8);
    eyeL.translate(-0.085, 1.52, 0.19 + hunch);
    parts.push(tagPart(eyeL, emissiveColor, 6));

    const eyeR = new THREE.SphereGeometry(0.048, 8, 8);
    eyeR.translate(0.085, 1.52, 0.19 + hunch);
    parts.push(tagPart(eyeR, emissiveColor, 6));

    // 3. Articulated Left & Right Arms
    const armL = new THREE.CapsuleGeometry(0.085 * bulk, 0.38, 6, 8);
    armL.translate(-0.34 * bulk, 1.02, hunch * 0.4);
    parts.push(tagPart(armL, skinColor, 2));

    const armR = new THREE.CapsuleGeometry(0.085 * bulk, 0.38, 6, 8);
    armR.translate(0.34 * bulk, 1.02, hunch * 0.4);
    parts.push(tagPart(armR, skinColor, 3));

    // 4. Articulated Left & Right Legs
    const legL = new THREE.CapsuleGeometry(0.095 * bulk, 0.38, 6, 8);
    legL.translate(-0.12 * bulk, 0.36, 0);
    parts.push(tagPart(legL, pantsColor, 4));

    const legR = new THREE.CapsuleGeometry(0.095 * bulk, 0.38, 6, 8);
    legR.translate(0.12 * bulk, 0.36, 0);
    parts.push(tagPart(legR, pantsColor, 5));

    // Optional Caste / Military Features
    if (hasSpines) {
      for (let i = 0; i < 3; i++) {
        const spine = new THREE.ConeGeometry(0.075, 0.34 - i * 0.05, 6);
        spine.rotateX(-0.65);
        spine.translate(0, 1.32 - i * 0.18, -0.22 + hunch * 0.4);
        parts.push(tagPart(spine, emissiveColor, 6));
      }
    }

    if (hasAcidSacs) {
      const sacPositions = [
        [-0.14, 1.22, -0.20],
        [0.14, 1.18, -0.22],
        [0.0, 1.02, -0.24],
      ];
      for (const [sx, sy, sz] of sacPositions) {
        const sac = new THREE.IcosahedronGeometry(0.16, 2);
        sac.translate(sx, sy, sz);
        parts.push(tagPart(sac, emissiveColor, 6));
      }
    }

    if (hasShoulderArmor) {
      const padL = new THREE.DodecahedronGeometry(0.19 * bulk, 1);
      padL.translate(-0.36 * bulk, 1.26, 0);
      parts.push(tagPart(padL, 0x334155, 0));

      const padR = new THREE.DodecahedronGeometry(0.22 * bulk, 1);
      padR.translate(0.36 * bulk, 1.28, 0);
      parts.push(tagPart(padR, 0x334155, 0));

      // Glowing chest core fissure
      const core = new THREE.OctahedronGeometry(0.12 * bulk, 1);
      core.translate(0, 1.08, 0.24 * bulk);
      parts.push(tagPart(core, emissiveColor, 6));
    }

    if (hasHelmet) {
      const helm = new THREE.SphereGeometry(0.255, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
      helm.translate(0, 1.52, hunch);
      parts.push(tagPart(helm, topColor, 1));
    }

    if (hasBackpack) {
      const pack = new THREE.BoxGeometry(0.32, 0.42, 0.22);
      pack.translate(0, 1.06, -0.24);
      parts.push(tagPart(pack, 0xf59e0b, 0));
    }

    const merged = mergeGeometries(parts, false);
    if (scale !== 1.0) {
      merged.scale(scale, scale, scale);
    }
    merged.computeVertexNormals();
    return merged;
  }

  static createAllCastesAndArchetypes() {
    return {
      // Patient Zero (Alpha Overlord)
      patientZero: this.buildSculptedCharacter({
        skinColor: 0x10b981,
        topColor: 0x064e3b,
        pantsColor: 0x022c22,
        emissiveColor: 0x34d399,
        scale: 1.28,
        bulk: 1.18,
        hunch: 0.08,
        hasSpines: true,
        hasShoulderArmor: true,
      }),

      // Caste 1: Standard Shambler / Walker
      walker: this.buildSculptedCharacter({
        skinColor: 0x4ade80,
        topColor: 0x334155,
        pantsColor: 0x1e293b,
        emissiveColor: 0x4ade80,
        scale: 1.0,
        bulk: 0.96,
        hunch: 0.10,
      }),

      // Caste 2: Crimson Leaper (Predatory Hunter Caste)
      leaper: this.buildSculptedCharacter({
        skinColor: 0xef4444,
        topColor: 0x450a0a,
        pantsColor: 0x1f2937,
        emissiveColor: 0xfb7185,
        scale: 0.96,
        bulk: 0.88,
        hunch: 0.22,
        hasSpines: true,
      }),

      // Caste 3: Juggernaut Brute (Armored Heavy Tank Caste)
      brute: this.buildSculptedCharacter({
        skinColor: 0x059669,
        topColor: 0x1e293b,
        pantsColor: 0x0f172a,
        emissiveColor: 0xf59e0b,
        scale: 1.65,
        bulk: 1.42,
        hunch: 0.14,
        hasShoulderArmor: true,
      }),

      // Caste 4: Volatile Spitter (Bio-Artillery Caste)
      spitter: this.buildSculptedCharacter({
        skinColor: 0x84cc16,
        topColor: 0x365314,
        pantsColor: 0x1a2e05,
        emissiveColor: 0xa3e635,
        scale: 1.08,
        bulk: 1.12,
        hunch: 0.15,
        hasAcidSacs: true,
      }),

      // Human Archetype 1: Civilian
      civilian: this.buildSculptedCharacter({
        skinColor: 0xfdba74,
        topColor: 0x3b82f6,
        pantsColor: 0x1e293b,
        emissiveColor: 0x1e293b,
        scale: 1.0,
        bulk: 0.95,
        hunch: 0.0,
      }),

      // Human Archetype 2: Athlete Sprinter
      sprinter: this.buildSculptedCharacter({
        skinColor: 0xfed7aa,
        topColor: 0xec4899,
        pantsColor: 0x111827,
        emissiveColor: 0x38bdf8,
        scale: 1.02,
        bulk: 0.90,
        hunch: 0.05,
      }),

      // Human Archetype 3: Police / Tactical Vanguard
      police: this.buildSculptedCharacter({
        skinColor: 0xfdba74,
        topColor: 0x1d4ed8,
        pantsColor: 0x0f172a,
        emissiveColor: 0x60a5fa,
        scale: 1.05,
        bulk: 1.06,
        hasHelmet: true,
      }),

      // Human Archetype 4: Hazmat Bio-Trooper
      hazmat: this.buildSculptedCharacter({
        skinColor: 0xfacc15,
        topColor: 0xeab308,
        pantsColor: 0xca8a04,
        emissiveColor: 0x38bdf8,
        scale: 1.08,
        bulk: 1.14,
        hasHelmet: true,
        hasBackpack: true,
      }),

      // Human Archetype 5: Spec-Ops Sniper / Military Commando
      sniper: this.buildSculptedCharacter({
        skinColor: 0x334155,
        topColor: 0x0f172a,
        pantsColor: 0x020617,
        emissiveColor: 0xef4444, // Red night-vision optics!
        scale: 1.06,
        bulk: 1.05,
        hasHelmet: true,
      }),
    };
  }
}
