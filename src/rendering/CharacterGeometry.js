import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Builds stylized low-poly humanoid geometries with custom vertex attributes
 * (aLimb for limb segmentation) and custom shader injection for GPU-driven kinetic animations.
 */

/**
 * Generates a crisp 2-tone gradient ramp map for graphic novel cel-shaded lighting.
 */
export function createCelGradientMap() {
  const colors = new Uint8Array([100, 255]);
  const format = THREE.RedFormat;
  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, format);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function createHumanoidGeometry(archetype = 'civilian', colorVariation = 0) {
  const parts = [];

  // Color palettes per archetype
  let skinColor, shirtColor, pantsColor, hairColor, accentColor;

  if (archetype === 'zombie') {
    // Patient Zero / Horde: Moss-green skin (#6ee7b7), torn teal/purple clothing
    skinColor = new THREE.Color(0x6ee7b7);
    shirtColor = colorVariation % 2 === 0 ? new THREE.Color(0x0d9488) : new THREE.Color(0x7e22ce); // torn teal or purple
    pantsColor = new THREE.Color(0x1e293b); // dark ragged trousers
    hairColor = new THREE.Color(0x14532d); // Dark mossy wild hair
    accentColor = new THREE.Color(0x6ee7b7);
  } else if (archetype === 'patient_zero') {
    // Patient Zero: Moss-green skin (#6ee7b7) with vibrant torn teal (#0d9488) jacket & accents
    skinColor = new THREE.Color(0x6ee7b7);
    shirtColor = new THREE.Color(0x0d9488);
    pantsColor = new THREE.Color(0x0f172a);
    hairColor = new THREE.Color(0x166534);
    accentColor = new THREE.Color(0x6ee7b7);
  } else if (archetype === 'hazmat') {
    // High-visibility neon-yellow suit with red hazard beacon
    skinColor = new THREE.Color(0xffff00);
    shirtColor = new THREE.Color(0xffff00);
    pantsColor = new THREE.Color(0xffff00);
    hairColor = new THREE.Color(0x1e293b); // Dark visor
    accentColor = new THREE.Color(0xff0000); // Red beacon / Oxygen tank
  } else if (archetype === 'military') {
    // Military Rifleman: Army green camo fatigues (#15803d), helmet, dark boots
    skinColor = new THREE.Color(0xfdba74);
    shirtColor = new THREE.Color(0x15803d);
    pantsColor = new THREE.Color(0x166534);
    hairColor = new THREE.Color(0x1e293b); // Helmet strap / boots
    accentColor = new THREE.Color(0x15803d); // Army green helmet
  } else if (archetype === 'warden') {
    // Megaphone Warden: High-visibility safety neon orange vest (#f97316), white reflective bands (#f8fafc), white hardhat
    skinColor = new THREE.Color(0xfdba74); // Warm Peach
    shirtColor = new THREE.Color(0xf97316); // High-vis safety orange
    pantsColor = new THREE.Color(0x1e293b); // Dark navy trousers
    hairColor = new THREE.Color(0x334155); // Dark strap
    accentColor = new THREE.Color(0xf8fafc); // Crisp white reflective stripe
  } else {
    // Civilians: Warm peach/tan skin, bright playful clothing palettes (salmon #fb7185, mustard #facc15, sky blue #38bdf8)
    const shirts = [
      new THREE.Color(0xfb7185), // Salmon Pink
      new THREE.Color(0xfacc15), // Mustard Yellow
      new THREE.Color(0x38bdf8), // Sky Blue
      new THREE.Color(0x34d399), // Fresh Mint
      new THREE.Color(0xc084fc), // Playful Lavender
    ];
    // Warm peach/tan skin
    const skins = [
      new THREE.Color(0xfdba74), // Warm Peach
      new THREE.Color(0xf5cd79), // Warm Tan
      new THREE.Color(0xfbbf24), // Golden Warm
    ];
    skinColor = skins[colorVariation % skins.length];
    shirtColor = shirts[colorVariation % shirts.length];
    pantsColor = colorVariation % 2 === 0 ? new THREE.Color(0x334155) : new THREE.Color(0x475569);

    // Varied colorful hairstyles (Brown, Blonde, Auburn, Teal Streak, Charcoal)
    const hairColors = [
      new THREE.Color(0x3d2b1f), // Deep Espresso Brown
      new THREE.Color(0xf59e0b), // Golden Blonde
      new THREE.Color(0xb45309), // Auburn
      new THREE.Color(0x0284c7), // Sky Teal
      new THREE.Color(0x1e293b), // Charcoal Black
    ];
    hairColor = hairColors[colorVariation % hairColors.length];
    accentColor = new THREE.Color(0xffffff);
  }

  // -------------------------------------------------------------
  // CHIBI HUMAN GEOMETRY (Total height: ~1.46m)
  // Proportions: Oversized head (~36% of height), compact pill torso, short chunky limbs
  // -------------------------------------------------------------

  // 1. Torso / Body (aLimb = 0)
  // Compact slightly tapered rounded cuboid (width: 0.48, height: 0.46, depth: 0.36)
  // Spans Y = 0.48 to 0.94, centered at Y = 0.71
  const torso = new THREE.BoxGeometry(0.48, 0.46, 0.36);
  torso.translate(0, 0.71, 0);
  _tagGeometry(torso, 0.0, shirtColor);
  parts.push(torso);

  if (archetype === 'warden') {
    // High-vis reflective horizontal stripes across chest and back
    const stripe1 = new THREE.BoxGeometry(0.50, 0.06, 0.38);
    stripe1.translate(0, 0.78, 0);
    _tagGeometry(stripe1, 0.0, accentColor);
    parts.push(stripe1);

    const stripe2 = new THREE.BoxGeometry(0.50, 0.06, 0.38);
    stripe2.translate(0, 0.62, 0);
    _tagGeometry(stripe2, 0.0, accentColor);
    parts.push(stripe2);
  }

  // 2. Head (aLimb = 1)
  // Oversized rounded box (~36% of total height: 0.58 wide x 0.52 high x 0.50 deep)
  // Spans Y = 0.94 to 1.46, centered at Y = 1.20
  const head = new THREE.BoxGeometry(0.58, 0.52, 0.50);
  head.translate(0, 1.20, 0);
  _tagGeometry(head, 1.0, archetype === 'hazmat' ? hairColor : skinColor);
  parts.push(head);

  // Stylized Expressive Eyes with Blush Cheeks (for zombies & civilians)
  if (archetype !== 'hazmat') {
    const eyeWhiteColor = new THREE.Color(0xffffff);
    const pupilColor = archetype === 'zombie' || archetype === 'patient_zero' 
      ? new THREE.Color(0x064e3b) // Eerie dark moss pupil
      : new THREE.Color(0x111827); // Cute dark dot pupil

    // Left Eye White (Oversized cute cartoon eye)
    const eyeL = new THREE.BoxGeometry(0.11, 0.13, 0.02);
    eyeL.translate(-0.13, 1.23, 0.255);
    _tagGeometry(eyeL, 1.0, eyeWhiteColor);
    parts.push(eyeL);

    // Left Pupil
    const pupilL = new THREE.BoxGeometry(0.06, 0.07, 0.02);
    pupilL.translate(-0.13, 1.23, 0.265);
    _tagGeometry(pupilL, 1.0, pupilColor);
    parts.push(pupilL);

    // Right Eye White
    const eyeR = new THREE.BoxGeometry(0.11, 0.13, 0.02);
    eyeR.translate(0.13, 1.23, 0.255);
    _tagGeometry(eyeR, 1.0, eyeWhiteColor);
    parts.push(eyeR);

    // Right Pupil
    const pupilR = new THREE.BoxGeometry(0.06, 0.07, 0.02);
    pupilR.translate(0.13, 1.23, 0.265);
    _tagGeometry(pupilR, 1.0, pupilColor);
    parts.push(pupilR);

    // Cute Blush Cheeks (Soft Coral/Pink)
    const blushColor = archetype === 'zombie' || archetype === 'patient_zero'
      ? new THREE.Color(0x10b981) // Pale toxic highlight
      : new THREE.Color(0xf472b6); // Warm cute pink cheek
    const cheekL = new THREE.BoxGeometry(0.09, 0.04, 0.02);
    cheekL.translate(-0.18, 1.12, 0.255);
    _tagGeometry(cheekL, 1.0, blushColor);
    parts.push(cheekL);

    const cheekR = new THREE.BoxGeometry(0.09, 0.04, 0.02);
    cheekR.translate(0.18, 1.12, 0.255);
    _tagGeometry(cheekR, 1.0, blushColor);
    parts.push(cheekR);
  }

  // Hair / Caps / Headgear (aLimb = 1)
  if (archetype === 'zombie' || archetype === 'patient_zero') {
    // Wild jagged zombie hair: Messy top clumpy cap + jagged wild tufts
    const hairBase = new THREE.BoxGeometry(0.62, 0.16, 0.54);
    hairBase.translate(0, 1.45, 0.01);
    _tagGeometry(hairBase, 1.0, hairColor);
    parts.push(hairBase);

    // Wild tuft 1 (left front)
    const tuft1 = new THREE.BoxGeometry(0.16, 0.18, 0.16);
    tuft1.translate(-0.22, 1.51, 0.12);
    _tagGeometry(tuft1, 1.0, hairColor);
    parts.push(tuft1);

    // Wild tuft 2 (right back)
    const tuft2 = new THREE.BoxGeometry(0.18, 0.20, 0.16);
    tuft2.translate(0.20, 1.50, -0.14);
    _tagGeometry(tuft2, 1.0, hairColor);
    parts.push(tuft2);

    // Wild tuft 3 (center spike)
    const tuft3 = new THREE.BoxGeometry(0.14, 0.22, 0.14);
    tuft3.translate(0.02, 1.53, 0.18);
    _tagGeometry(tuft3, 1.0, hairColor);
    parts.push(tuft3);

    // Wild tuft 4 (side spike)
    const tuft4 = new THREE.BoxGeometry(0.14, 0.16, 0.14);
    tuft4.translate(-0.16, 1.48, -0.22);
    _tagGeometry(tuft4, 1.0, hairColor);
    parts.push(tuft4);
  } else if (archetype === 'hazmat') {
    // Hazmat Helmet Visor + Oxygen Tank + Hazard Beacon
    // Oxygen Tank on back (-Z)
    const tank = new THREE.CylinderGeometry(0.12, 0.12, 0.45, 8);
    tank.translate(0, 0.72, -0.24);
    _tagGeometry(tank, 0.0, accentColor);
    parts.push(tank);

    // Top Red Hazard Beacon
    const beacon = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    beacon.translate(0, 1.62, 0);
    _tagGeometry(beacon, 1.0, accentColor);
    parts.push(beacon);
  } else if (archetype === 'military') {
    // Army Combat Helmet
    const helmetDome = new THREE.BoxGeometry(0.64, 0.22, 0.56);
    helmetDome.translate(0, 1.46, 0.01);
    _tagGeometry(helmetDome, 1.0, shirtColor);
    parts.push(helmetDome);

    const helmetBrim = new THREE.BoxGeometry(0.56, 0.05, 0.16);
    helmetBrim.translate(0, 1.36, 0.30);
    _tagGeometry(helmetBrim, 1.0, shirtColor);
    parts.push(helmetBrim);

    const strap = new THREE.BoxGeometry(0.60, 0.04, 0.52);
    strap.translate(0, 1.37, 0.01);
    _tagGeometry(strap, 1.0, hairColor);
    parts.push(strap);
  } else if (archetype === 'warden') {
    // Warden White Safety Hardhat
    const hardhatDome = new THREE.BoxGeometry(0.64, 0.20, 0.56);
    hardhatDome.translate(0, 1.46, 0.01);
    _tagGeometry(hardhatDome, 1.0, new THREE.Color(0xffffff));
    parts.push(hardhatDome);

    const hardhatBrim = new THREE.BoxGeometry(0.60, 0.05, 0.22);
    hardhatBrim.translate(0, 1.36, 0.30);
    _tagGeometry(hardhatBrim, 1.0, new THREE.Color(0xffffff));
    parts.push(hardhatBrim);
  } else {
    // Civilians: Caps for runners (~40% of civs) or varied chunky hairstyles
    const hasCap = (colorVariation % 5 === 0) || (colorVariation % 5 === 2);
    if (hasCap) {
      // Runner Cap: Curved cap dome + forward shade visor bill
      const capColor = shirtColor; // Match lively shirt color
      const capDome = new THREE.BoxGeometry(0.60, 0.16, 0.52);
      capDome.translate(0, 1.44, 0.01);
      _tagGeometry(capDome, 1.0, capColor);
      parts.push(capDome);

      const capVisor = new THREE.BoxGeometry(0.44, 0.04, 0.22);
      capVisor.translate(0, 1.38, 0.33);
      _tagGeometry(capVisor, 1.0, capColor);
      parts.push(capVisor);
    } else {
      // Chunky Hairstyles (Bob / Spiky / Textured hair)
      const hairDome = new THREE.BoxGeometry(0.62, 0.20, 0.54);
      hairDome.translate(0, 1.45, 0.02);
      _tagGeometry(hairDome, 1.0, hairColor);
      parts.push(hairDome);

      // Side bangs / hair locks framing face
      const bangL = new THREE.BoxGeometry(0.12, 0.25, 0.20);
      bangL.translate(-0.28, 1.30, 0.15);
      _tagGeometry(bangL, 1.0, hairColor);
      parts.push(bangL);

      const bangR = new THREE.BoxGeometry(0.12, 0.25, 0.20);
      bangR.translate(0.28, 1.30, 0.15);
      _tagGeometry(bangR, 1.0, hairColor);
      parts.push(bangR);
    }
  }

  // -------------------------------------------------------------
  // 3 & 4. SHORT CHUNKY ARMS (Shoulder pivot at Y = 0.86)
  // -------------------------------------------------------------
  if (archetype === 'zombie' || archetype === 'patient_zero') {
    // ZOMBIES & PATIENT ZERO: Clutching forward arms (+Z in model space)
    // Left Arm (aLimb = 2)
    const leftSleeve = new THREE.BoxGeometry(0.18, 0.18, 0.14);
    leftSleeve.translate(-0.31, 0.84, 0.08);
    _tagGeometry(leftSleeve, 2.0, shirtColor);
    parts.push(leftSleeve);

    const leftForearm = new THREE.BoxGeometry(0.15, 0.15, 0.26);
    leftForearm.translate(-0.31, 0.84, 0.27);
    _tagGeometry(leftForearm, 2.0, skinColor);
    parts.push(leftForearm);

    const leftHand = new THREE.BoxGeometry(0.14, 0.11, 0.12);
    leftHand.translate(-0.31, 0.84, 0.44);
    _tagGeometry(leftHand, 2.0, skinColor);
    parts.push(leftHand);

    // Right Arm (aLimb = 3)
    const rightSleeve = new THREE.BoxGeometry(0.18, 0.18, 0.14);
    rightSleeve.translate(0.31, 0.84, 0.08);
    _tagGeometry(rightSleeve, 3.0, shirtColor);
    parts.push(rightSleeve);

    const rightForearm = new THREE.BoxGeometry(0.15, 0.15, 0.26);
    rightForearm.translate(0.31, 0.84, 0.27);
    _tagGeometry(rightForearm, 3.0, skinColor);
    parts.push(rightForearm);

    const rightHand = new THREE.BoxGeometry(0.14, 0.11, 0.12);
    rightHand.translate(0.31, 0.84, 0.44);
    _tagGeometry(rightHand, 3.0, skinColor);
    parts.push(rightHand);
  } else if (archetype === 'hazmat') {
    // Hazmat: Left arm at side, Right arm raised forward (+Z) aiming disinfectant spray
    const leftArm = new THREE.BoxGeometry(0.16, 0.40, 0.16);
    leftArm.translate(-0.31, 0.67, 0);
    _tagGeometry(leftArm, 2.0, shirtColor);
    parts.push(leftArm);

    const rightArm = new THREE.BoxGeometry(0.16, 0.16, 0.40);
    rightArm.translate(0.31, 0.84, 0.20);
    _tagGeometry(rightArm, 3.0, shirtColor);
    parts.push(rightArm);
  } else if (archetype === 'military') {
    // Military Rifleman: Tactical forward two-hand rifle stance
    // Left support arm (aLimb = 2.0)
    const leftArm = new THREE.BoxGeometry(0.15, 0.15, 0.32);
    leftArm.translate(-0.16, 0.82, 0.16);
    _tagGeometry(leftArm, 2.0, shirtColor);
    parts.push(leftArm);

    // Right trigger arm (aLimb = 3.0)
    const rightArm = new THREE.BoxGeometry(0.15, 0.15, 0.34);
    rightArm.translate(0.20, 0.84, 0.17);
    _tagGeometry(rightArm, 3.0, shirtColor);
    parts.push(rightArm);

    // Assault Rifle Mesh (attached to right arm aLimb = 3.0)
    // Gun receiver & stock
    const rifleBody = new THREE.BoxGeometry(0.08, 0.13, 0.54);
    rifleBody.translate(0.12, 0.84, 0.30);
    _tagGeometry(rifleBody, 3.0, new THREE.Color(0x1e293b));
    parts.push(rifleBody);

    // Barrel & Muzzle
    const barrel = new THREE.CylinderGeometry(0.022, 0.022, 0.30, 6);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(0.12, 0.86, 0.64);
    _tagGeometry(barrel, 3.0, new THREE.Color(0x0f172a));
    parts.push(barrel);

    // Curved magazine clip
    const mag = new THREE.BoxGeometry(0.06, 0.16, 0.10);
    mag.translate(0.12, 0.72, 0.34);
    _tagGeometry(mag, 3.0, new THREE.Color(0x14532d));
    parts.push(mag);
  } else if (archetype === 'warden') {
    // Megaphone Warden: Left arm swings (aLimb = 2.0), Right arm raised forward holding Megaphone (aLimb = 3.0)
    const leftArm = new THREE.BoxGeometry(0.16, 0.38, 0.16);
    leftArm.translate(-0.31, 0.67, 0);
    _tagGeometry(leftArm, 2.0, shirtColor);
    parts.push(leftArm);

    // Right arm raised forward (+Z)
    const rightArm = new THREE.BoxGeometry(0.16, 0.16, 0.38);
    rightArm.translate(0.26, 0.84, 0.16);
    _tagGeometry(rightArm, 3.0, shirtColor);
    parts.push(rightArm);

    // Right hand
    const rightHand = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    rightHand.translate(0.26, 0.84, 0.34);
    _tagGeometry(rightHand, 3.0, skinColor);
    parts.push(rightHand);

    // Low-poly Megaphone attached to right hand (aLimb = 3.0)
    // Megaphone cone (tapered cylinder pointing forward +Z)
    const cone = new THREE.CylinderGeometry(0.16, 0.06, 0.28, 8);
    cone.rotateX(Math.PI / 2);
    cone.translate(0.26, 0.84, 0.50);
    _tagGeometry(cone, 3.0, new THREE.Color(0xffffff));
    parts.push(cone);

    // Megaphone red warning rim
    const rim = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 8);
    rim.rotateX(Math.PI / 2);
    rim.translate(0.26, 0.84, 0.64);
    _tagGeometry(rim, 3.0, new THREE.Color(0xef4444));
    parts.push(rim);

    // Megaphone red handle
    const handle = new THREE.BoxGeometry(0.06, 0.14, 0.08);
    handle.translate(0.26, 0.74, 0.38);
    _tagGeometry(handle, 3.0, new THREE.Color(0xef4444));
    parts.push(handle);
  } else {
    // Civilian: Short chunky arms hanging at side, anchored at shoulder (Y = 0.86)
    const leftArm = new THREE.BoxGeometry(0.16, 0.38, 0.16);
    leftArm.translate(-0.31, 0.67, 0);
    _tagGeometry(leftArm, 2.0, shirtColor);
    parts.push(leftArm);

    const rightArm = new THREE.BoxGeometry(0.16, 0.38, 0.16);
    rightArm.translate(0.31, 0.67, 0);
    _tagGeometry(rightArm, 3.0, shirtColor);
    parts.push(rightArm);
  }

  // -------------------------------------------------------------
  // 5 & 6. SHORT CHUNKY LEGS (Hip pivot at Y = 0.48)
  // -------------------------------------------------------------
  // 5. Left Leg (aLimb = 4) - Spans Y = 0.0 to 0.48, centered at Y = 0.24
  const leftLeg = new THREE.BoxGeometry(0.19, 0.48, 0.20);
  leftLeg.translate(-0.13, 0.24, 0);
  _tagGeometry(leftLeg, 4.0, pantsColor);
  parts.push(leftLeg);

  // 6. Right Leg (aLimb = 5) - Spans Y = 0.0 to 0.48, centered at Y = 0.24
  const rightLeg = new THREE.BoxGeometry(0.19, 0.48, 0.20);
  rightLeg.translate(0.13, 0.24, 0);
  _tagGeometry(rightLeg, 5.0, pantsColor);
  parts.push(rightLeg);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

function _tagGeometry(geom, limbId, color) {
  const count = geom.attributes.position.count;
  const limbs = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    limbs[i] = limbId;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geom.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Injects procedural GPU kinetic animation vertex shader chunks into Three.js materials.
 * Guaranteed zero vertex detachment:
 * - Zombie arms are statically forward (-Z) with whole-body shamble tilt.
 * - Civilian arms strictly pivot around the shoulder with a controlled +/- 20° swing.
 * - Legs pivot rigidly at hip.
 * - Vertical stride bounce translates the entire character as a single unit without non-uniform stretching.
 */
export function injectCharacterAnimationShader(material) {
  material.onBeforeCompile = (shader) => {
    // 1. Declare instance attributes and vertex limb attribute
    shader.vertexShader = `
      attribute vec4 instanceAnim; // (speed, walkPhase, animType, flail)
      attribute float aLimb;
    ` + shader.vertexShader;

    // 2. Inject limb articulation and procedural kinetic motion
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      float animSpeed = instanceAnim.x;
      float phase = instanceAnim.y;
      float animType = instanceAnim.z; // 0=civ, 1=zombie swarm, 1.5=stray zombie, 2=player, 3=hazmat
      float flail = instanceAnim.w;

      float speedFactor = clamp(animSpeed / 4.2, 0.0, 1.0);

      // 1. LEGS SWING (aLimb == 4.0 [Left Leg] or 5.0 [Right Leg])
      // Pivot rigidly at hip (Y = 0.48, Z = 0.0)
      if (aLimb > 3.5) {
        float legSign = (aLimb > 4.5) ? -1.0 : 1.0;
        float legSwing = sin(phase) * 0.46 * speedFactor * legSign;
        float py = transformed.y - 0.48;
        float pz = transformed.z;
        transformed.y = 0.48 + py * cos(legSwing) - pz * sin(legSwing);
        transformed.z = py * sin(legSwing) + pz * cos(legSwing);
      }

      // 2. ARMS ANIMATION (aLimb == 2.0 [Left Arm] or 3.0 [Right Arm])
      if (animType > 0.5 && animType < 2.5) {
        // ZOMBIES & PATIENT ZERO: Arms locked reaching forward (+Z) with alternating clutch sway
        float armSign = (aLimb > 2.5) ? -1.0 : 1.0;
        float zombieArmSway = sin(phase * 0.9 + (aLimb > 2.5 ? 1.57 : 0.0)) * 0.08;
        float py = transformed.y - 0.86;
        float pz = transformed.z;
        transformed.y = 0.86 + py * cos(zombieArmSway) - pz * sin(zombieArmSway);
        transformed.z = py * sin(zombieArmSway) + pz * cos(zombieArmSway);
      } else if (animType > 3.5) {
        // MILITARY: Tactical rifle aim locked forward with subtle breathing micro-sway
        float aimSway = sin(phase * 0.5) * 0.02;
        float py = transformed.y - 0.86;
        float pz = transformed.z;
        transformed.y = 0.86 + py * cos(aimSway) - pz * sin(aimSway);
        transformed.z = py * sin(aimSway) + pz * cos(aimSway);
      } else if (animType > 2.5) {
        // HAZMAT: Left arm swings, right arm stays locked aiming forward
        if (aLimb < 2.5) {
          // Left arm swing
          float armSwing = -sin(phase) * 0.35 * speedFactor;
          float py = transformed.y - 0.86;
          float pz = transformed.z;
          transformed.y = 0.86 + py * cos(armSwing) - pz * sin(armSwing);
          transformed.z = py * sin(armSwing) + pz * cos(armSwing);
        }
      } else {
        // CIVILIANS & PLAYER: Anchored firmly at shoulder (Y = 0.86, Z = 0.0)
        // Clean, small +/- 20 degree swing along movement axis (max 0.35 rad)
        if (aLimb > 1.5 && aLimb < 3.5) {
          float armSign = (aLimb > 2.5) ? -1.0 : 1.0;
          float armSwing = -sin(phase) * (speedFactor * 0.35) * armSign;
          float py = transformed.y - 0.86;
          float pz = transformed.z;
          transformed.y = 0.86 + py * cos(armSwing) - pz * sin(armSwing);
          transformed.z = py * sin(armSwing) + pz * cos(armSwing);
        }
      }

      // 3. HEAD BOB / TILT (aLimb == 1.0)
      // Pivot around neck (Y = 0.94)
      if (aLimb > 0.5 && aLimb < 1.5) {
        float headTilt = sin(phase * 0.5) * 0.06 * speedFactor;
        float hpx = transformed.x;
        float hpy = transformed.y - 0.94;
        transformed.x = hpx * cos(headTilt) - hpy * sin(headTilt);
        transformed.y = 0.94 + hpx * sin(headTilt) + hpy * cos(headTilt);
      }

      // 4. POSTURE & EXAGGERATED SIDE-TO-SIDE WADDLE (Rotated around hip Y = 0.48)
      if (animType > 0.5 && animType < 2.5) {
        // Chibi Zombie: Forward hunch + exaggerated side-to-side waddle roll
        float zombieLean = 0.12;
        float pyL = transformed.y - 0.48;
        float pzL = transformed.z;
        transformed.y = 0.48 + pyL * cos(zombieLean) - pzL * sin(zombieLean);
        transformed.z = pyL * sin(zombieLean) + pzL * cos(zombieLean);

        // Side-to-side waddle roll
        float waddleRoll = sin(phase * 0.9) * 0.13 * speedFactor;
        float pxW = transformed.x;
        float pyW = transformed.y - 0.48;
        transformed.x = pxW * cos(waddleRoll) - pyW * sin(waddleRoll);
        transformed.y = 0.48 + pxW * sin(waddleRoll) + pyW * cos(waddleRoll);

        // Lateral hip shift
        transformed.x += sin(phase * 0.9) * 0.06 * speedFactor;
      } else if (animType < 0.5 && speedFactor > 0.7) {
        // Civilian: Slight forward sprint lean
        float civLean = 0.08;
        float pyL = transformed.y - 0.48;
        float pzL = transformed.z;
        transformed.y = 0.48 + pyL * cos(civLean) - pzL * sin(civLean);
        transformed.z = pyL * sin(civLean) + pzL * cos(civLean);
      }

      // Flail jitter during conversion
      if (flail > 0.01) {
        transformed.x += sin(phase * 3.5) * 0.06 * flail;
      }

      // 5. RIGID WHOLE-CHARACTER VERTICAL STRIDE BOUNCE
      // Rigidly shifts the entire mesh vertically without non-uniform vertex distortion
      if (speedFactor > 0.05) {
        float strideBounce = abs(sin(phase)) * 0.05 * speedFactor;
        transformed.y += strideBounce;
      }
      `
    );
  };
}
