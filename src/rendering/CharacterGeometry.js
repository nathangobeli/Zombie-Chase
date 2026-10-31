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
  const colors = new Uint8Array([175, 205, 235, 255]);
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
    // Civilians: 6 Rich Distinct Archetypes (Varying skin tones, clothing, hairstyles, accessories)
    const variant = Math.abs(colorVariation) % 6;

    // 0: Sporty Runner (Coral/Pink, Runner Cap, Running Shorts)
    // 1: Business Commuter (Mustard Yellow, Necktie, Slick Hair, Messenger Pouch)
    // 2: Casual Student (Mint Green Hoodie, Kangaroo Pocket, Beanie, Blue Jeans)
    // 3: Hipster / Stylist (Sky Blue, Black Glasses, Spiky Auburn Hair)
    // 4: Outdoor Explorer (Burnt Orange Utility Jacket, Olive Backpack, Afro Puff, Khakis)
    // 5: Playful Violet (Pastel Lavender, Pink Headband, Teal Shorts)

    const skins = [
      new THREE.Color(0xfdba74), // 0: Warm Peach
      new THREE.Color(0xc68642), // 1: Golden Olive Tan
      new THREE.Color(0xf5cd79), // 2: Warm Tan
      new THREE.Color(0xfed7aa), // 3: Soft Fair Peach
      new THREE.Color(0x8d5524), // 4: Deep Rich Espresso
      new THREE.Color(0xfdba74), // 5: Peach
    ];

    const shirts = [
      new THREE.Color(0xfb7185), // 0: Coral Pink
      new THREE.Color(0xfacc15), // 1: Mustard Yellow
      new THREE.Color(0x34d399), // 2: Fresh Mint
      new THREE.Color(0x38bdf8), // 3: Sky Blue
      new THREE.Color(0xea580c), // 4: Burnt Orange
      new THREE.Color(0xc084fc), // 5: Playful Lavender
    ];

    const pants = [
      new THREE.Color(0x1e293b), // 0: Dark Charcoal Running Shorts
      new THREE.Color(0x334155), // 1: Slate Trousers
      new THREE.Color(0x1d4ed8), // 2: Indigo Denim Jeans
      new THREE.Color(0x64748b), // 3: Heather Grey
      new THREE.Color(0x78716c), // 4: Khaki Cargo
      new THREE.Color(0x0d9488), // 5: Teal Shorts
    ];

    const hairs = [
      new THREE.Color(0x1e293b), // 0: Dark Charcoal
      new THREE.Color(0x1e293b), // 1: Slick Black
      new THREE.Color(0xf59e0b), // 2: Golden Blonde
      new THREE.Color(0xb45309), // 3: Auburn / Flame
      new THREE.Color(0x0f172a), // 4: Deep Black Afro
      new THREE.Color(0x3d2b1f), // 5: Espresso Brown
    ];

    skinColor = skins[variant];
    shirtColor = shirts[variant];
    pantsColor = pants[variant];
    hairColor = hairs[variant];
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
  } else if (archetype === 'civilian') {
    const variant = Math.abs(colorVariation) % 6;
    if (variant === 1) {
      // Business Commuter: Dark Tie + Messenger Bag
      const tie = new THREE.BoxGeometry(0.08, 0.22, 0.03);
      tie.translate(0, 0.73, 0.19);
      _tagGeometry(tie, 0.0, new THREE.Color(0x0f172a));
      parts.push(tie);

      const bag = new THREE.BoxGeometry(0.12, 0.18, 0.22);
      bag.translate(0.24, 0.62, 0);
      _tagGeometry(bag, 0.0, new THREE.Color(0x334155));
      parts.push(bag);
    } else if (variant === 2) {
      // Casual Student: Hoodie front pocket + rolled hood on back
      const pocket = new THREE.BoxGeometry(0.28, 0.15, 0.03);
      pocket.translate(0, 0.62, 0.19);
      _tagGeometry(pocket, 0.0, new THREE.Color(0x059669));
      parts.push(pocket);

      const hood = new THREE.BoxGeometry(0.36, 0.12, 0.14);
      hood.translate(0, 0.88, -0.16);
      _tagGeometry(hood, 0.0, new THREE.Color(0x059669));
      parts.push(hood);
    } else if (variant === 4) {
      // Outdoor Explorer: Utility Backpack on back
      const backpack = new THREE.BoxGeometry(0.34, 0.34, 0.20);
      backpack.translate(0, 0.72, -0.25);
      _tagGeometry(backpack, 0.0, new THREE.Color(0x15803d));
      parts.push(backpack);

      const pocketBack = new THREE.BoxGeometry(0.22, 0.14, 0.08);
      pocketBack.translate(0, 0.66, -0.37);
      _tagGeometry(pocketBack, 0.0, new THREE.Color(0x166534));
      parts.push(pocketBack);
    }
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
    // Civilians: 6 Rich Distinct Head Styles & Accessories (aLimb = 1)
    const variant = Math.abs(colorVariation) % 6;
    if (variant === 0) {
      // Variant 0: Sporty Runner Cap (Curved Cap Dome + Shade Visor Bill)
      const capDome = new THREE.BoxGeometry(0.60, 0.18, 0.52);
      capDome.translate(0, 1.45, 0.01);
      _tagGeometry(capDome, 1.0, shirtColor);
      parts.push(capDome);

      const capVisor = new THREE.BoxGeometry(0.44, 0.05, 0.22);
      capVisor.translate(0, 1.38, 0.33);
      _tagGeometry(capVisor, 1.0, shirtColor);
      parts.push(capVisor);
    } else if (variant === 1) {
      // Variant 1: Business Commuter Slick Side-Part Hair
      const hairDome = new THREE.BoxGeometry(0.62, 0.18, 0.54);
      hairDome.translate(0, 1.45, 0.02);
      _tagGeometry(hairDome, 1.0, hairColor);
      parts.push(hairDome);

      const sidePart = new THREE.BoxGeometry(0.14, 0.24, 0.38);
      sidePart.translate(-0.28, 1.34, 0.05);
      _tagGeometry(sidePart, 1.0, hairColor);
      parts.push(sidePart);
    } else if (variant === 2) {
      // Variant 2: Casual Student Knit Beanie
      const beanie = new THREE.BoxGeometry(0.62, 0.22, 0.54);
      beanie.translate(0, 1.46, 0.01);
      _tagGeometry(beanie, 1.0, new THREE.Color(0xf97316));
      parts.push(beanie);

      const beanieRim = new THREE.BoxGeometry(0.64, 0.07, 0.56);
      beanieRim.translate(0, 1.38, 0.01);
      _tagGeometry(beanieRim, 1.0, new THREE.Color(0xea580c));
      parts.push(beanieRim);
    } else if (variant === 3) {
      // Variant 3: Hipster Stylist with Anime Spiky Hair + Black Glasses
      const hairDome = new THREE.BoxGeometry(0.62, 0.18, 0.54);
      hairDome.translate(0, 1.45, 0.02);
      _tagGeometry(hairDome, 1.0, hairColor);
      parts.push(hairDome);

      const spike1 = new THREE.BoxGeometry(0.14, 0.18, 0.14);
      spike1.translate(0, 1.54, 0.12);
      _tagGeometry(spike1, 1.0, hairColor);
      parts.push(spike1);

      const spike2 = new THREE.BoxGeometry(0.14, 0.16, 0.14);
      spike2.translate(-0.16, 1.52, -0.10);
      _tagGeometry(spike2, 1.0, hairColor);
      parts.push(spike2);

      // Black Frame Hipster Glasses
      const frameL = new THREE.BoxGeometry(0.13, 0.15, 0.03);
      frameL.translate(-0.13, 1.23, 0.27);
      _tagGeometry(frameL, 1.0, new THREE.Color(0x0f172a));
      parts.push(frameL);

      const frameR = new THREE.BoxGeometry(0.13, 0.15, 0.03);
      frameR.translate(0.13, 1.23, 0.27);
      _tagGeometry(frameR, 1.0, new THREE.Color(0x0f172a));
      parts.push(frameR);

      const bridge = new THREE.BoxGeometry(0.08, 0.03, 0.03);
      bridge.translate(0, 1.25, 0.27);
      _tagGeometry(bridge, 1.0, new THREE.Color(0x0f172a));
      parts.push(bridge);
    } else if (variant === 4) {
      // Variant 4: Outdoor Explorer Afro Puff / High Bun
      const hairDome = new THREE.BoxGeometry(0.62, 0.16, 0.54);
      hairDome.translate(0, 1.44, 0.01);
      _tagGeometry(hairDome, 1.0, hairColor);
      parts.push(hairDome);

      const puff = new THREE.BoxGeometry(0.32, 0.26, 0.32);
      puff.translate(0, 1.58, -0.05);
      _tagGeometry(puff, 1.0, hairColor);
      parts.push(puff);
    } else {
      // Variant 5: Playful Violet Bob with Hot Pink Headband
      const hairDome = new THREE.BoxGeometry(0.62, 0.20, 0.54);
      hairDome.translate(0, 1.45, 0.02);
      _tagGeometry(hairDome, 1.0, hairColor);
      parts.push(hairDome);

      const bangL = new THREE.BoxGeometry(0.12, 0.26, 0.22);
      bangL.translate(-0.28, 1.30, 0.14);
      _tagGeometry(bangL, 1.0, hairColor);
      parts.push(bangL);

      const bangR = new THREE.BoxGeometry(0.12, 0.26, 0.22);
      bangR.translate(0.28, 1.30, 0.14);
      _tagGeometry(bangR, 1.0, hairColor);
      parts.push(bangR);

      const headband = new THREE.BoxGeometry(0.64, 0.06, 0.18);
      headband.translate(0, 1.44, 0.08);
      _tagGeometry(headband, 1.0, new THREE.Color(0xec4899));
      parts.push(headband);
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
    // Civilian: Short chunky arms hanging at side with skin hands
    // Left Arm (aLimb = 2.0)
    const leftSleeve = new THREE.BoxGeometry(0.16, 0.26, 0.16);
    leftSleeve.translate(-0.31, 0.73, 0);
    _tagGeometry(leftSleeve, 2.0, shirtColor);
    parts.push(leftSleeve);

    const leftHand = new THREE.BoxGeometry(0.13, 0.12, 0.13);
    leftHand.translate(-0.31, 0.54, 0);
    _tagGeometry(leftHand, 2.0, skinColor);
    parts.push(leftHand);

    // Right Arm (aLimb = 3.0)
    const rightSleeve = new THREE.BoxGeometry(0.16, 0.26, 0.16);
    rightSleeve.translate(0.31, 0.73, 0);
    _tagGeometry(rightSleeve, 3.0, shirtColor);
    parts.push(rightSleeve);

    const rightHand = new THREE.BoxGeometry(0.13, 0.12, 0.13);
    rightHand.translate(0.31, 0.54, 0);
    _tagGeometry(rightHand, 3.0, skinColor);
    parts.push(rightHand);
  }

  // -------------------------------------------------------------
  // 5 & 6. SHORT CHUNKY LEGS (Hip pivot at Y = 0.48)
  // -------------------------------------------------------------
  let shoeColor;
  if (archetype === 'civilian') {
    const variant = Math.abs(colorVariation) % 6;
    const shoes = [
      new THREE.Color(0xf8fafc), // 0: White running kicks
      new THREE.Color(0x451a03), // 1: Polished brown dress shoes
      new THREE.Color(0x090d16), // 2: Dark skate sneakers
      new THREE.Color(0xf8fafc), // 3: White sneakers
      new THREE.Color(0x3b2219), // 4: Trail boots
      new THREE.Color(0x9333ea), // 5: Purple sneakers
    ];
    shoeColor = shoes[variant];
  } else {
    shoeColor = pantsColor;
  }

  // 5. Left Leg (aLimb = 4)
  const leftLeg = new THREE.BoxGeometry(0.19, 0.36, 0.20);
  leftLeg.translate(-0.13, 0.30, 0);
  _tagGeometry(leftLeg, 4.0, pantsColor);
  parts.push(leftLeg);

  const leftShoe = new THREE.BoxGeometry(0.20, 0.12, 0.24);
  leftShoe.translate(-0.13, 0.06, 0.02);
  _tagGeometry(leftShoe, 4.0, shoeColor);
  parts.push(leftShoe);

  // 6. Right Leg (aLimb = 5)
  const rightLeg = new THREE.BoxGeometry(0.19, 0.36, 0.20);
  rightLeg.translate(0.13, 0.30, 0);
  _tagGeometry(rightLeg, 5.0, pantsColor);
  parts.push(rightLeg);

  const rightShoe = new THREE.BoxGeometry(0.20, 0.12, 0.24);
  rightShoe.translate(0.13, 0.06, 0.02);
  _tagGeometry(rightShoe, 5.0, shoeColor);
  parts.push(rightShoe);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

function _tagGeometry(geom, limbId, color) {
  const count = geom.attributes.position.count;
  const limbs = new Float32Array(count);
  const weights = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    limbs[i] = limbId;
    weights[i] = 1.0;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geom.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
  geom.setAttribute('aLimbWeight', new THREE.BufferAttribute(weights, 1));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function _tagPropForKenneyMerge(geom, limbId, hexColor) {
  const nonIdx = geom.index ? geom.toNonIndexed() : geom.clone();
  nonIdx.computeVertexNormals();
  const count = nonIdx.attributes.position.count;
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const limbs = new Float32Array(count);
  const weights = new Float32Array(count);
  const col = new THREE.Color(hexColor);

  for (let i = 0; i < count; i++) {
    // (0.54, 0.46) sits on the pure white (#ffffff) background of all Kenney character skins
    uvs[i * 2] = 0.54;
    uvs[i * 2 + 1] = 0.46;
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    limbs[i] = limbId;
    weights[i] = 1.0;
  }

  // Keep only compatible attributes: position, normal, uv, color, aLimb, aLimbWeight
  for (const key of Object.keys(nonIdx.attributes)) {
    if (key !== 'position' && key !== 'normal') {
      nonIdx.deleteAttribute(key);
    }
  }
  nonIdx.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  nonIdx.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  nonIdx.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
  nonIdx.setAttribute('aLimbWeight', new THREE.BufferAttribute(weights, 1));
  return nonIdx;
}

function _rotateBoneWorld(bone, worldAxis, angle) {
  if (!bone || !bone.parent) return;
  bone.parent.updateMatrixWorld(true);
  const parentWorldQuat = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorldQuat);
  const worldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(worldQuat);
  const rotQuat = new THREE.Quaternion().setFromAxisAngle(worldAxis, angle);
  worldQuat.premultiply(rotQuat);
  bone.quaternion.copy(parentWorldQuat.invert().multiply(worldQuat));
  bone.updateMatrixWorld(true);
}

function _smoothNonIndexedNormals(geom) {
  geom.computeVertexNormals();
  const pos = geom.attributes.position;
  const norm = geom.attributes.normal;
  const count = pos.count;
  const map = new Map();

  for (let i = 0; i < count; i++) {
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    let acc = map.get(key);
    if (!acc) {
      acc = { nx: 0, ny: 0, nz: 0, indices: [] };
      map.set(key, acc);
    }
    acc.nx += norm.getX(i);
    acc.ny += norm.getY(i);
    acc.nz += norm.getZ(i);
    acc.indices.push(i);
  }

  for (const acc of map.values()) {
    const len = Math.hypot(acc.nx, acc.ny, acc.nz) || 1.0;
    const nx = acc.nx / len;
    const ny = acc.ny / len;
    const nz = acc.nz / len;
    for (let j = 0; j < acc.indices.length; j++) {
      norm.setXYZ(acc.indices[j], nx, ny, nz);
    }
  }
  norm.needsUpdate = true;
}

/**
 * Builds posed, smooth-shaded, bone-weighted BufferGeometries from Kenney's characterMedium.fbx
 * and idle.fbx animation clip for all game archetypes.
 */
export function buildKenneyArchetypeGeometries(fbx, idleClip) {
  let skinnedMesh = null;
  fbx.traverse((child) => {
    if (child.isSkinnedMesh && !skinnedMesh) {
      skinnedMesh = child;
    }
  });
  if (!skinnedMesh || !skinnedMesh.skeleton) return null;

  const mixer = new THREE.AnimationMixer(fbx);
  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;

  const resetToIdle = () => {
    if (idleAction) {
      idleAction.reset().play();
      mixer.update(0.0);
    }
    fbx.updateMatrixWorld(true);
    skinnedMesh.skeleton.update();
  };

  // Establish consistent reference scale & Hips horizontal origin from pure Idle pose
  resetToIdle();
  const refGeom = skinnedMesh.geometry.clone();
  const refPos = refGeom.attributes.position;
  const tmpV = new THREE.Vector3();
  for (let i = 0; i < refPos.count; i++) {
    tmpV.fromBufferAttribute(refPos, i);
    skinnedMesh.applyBoneTransform(i, tmpV);
    tmpV.applyMatrix4(skinnedMesh.matrixWorld);
    refPos.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
  }
  refGeom.computeBoundingBox();
  const refBB = refGeom.boundingBox;
  const targetHeight = 1.52;
  const refScale = targetHeight / ((refBB.max.y - refBB.min.y) || 1.0);
  const refMinY = refBB.min.y;
  const hipsWP = new THREE.Vector3();
  if (skinnedMesh.skeleton.bones[13]) {
    skinnedMesh.skeleton.bones[13].getWorldPosition(hipsWP);
  } else {
    hipsWP.set((refBB.min.x + refBB.max.x) * 0.5, 0, (refBB.min.z + refBB.max.z) * 0.5);
  }

  // Helper to bake current skeleton pose into a normalized, smooth-shaded BufferGeometry
  const bakeCurrentPose = (colorPainter = null, extraProps = []) => {
    fbx.updateMatrixWorld(true);
    skinnedMesh.skeleton.update();

    const baseGeom = skinnedMesh.geometry.index
      ? skinnedMesh.geometry.toNonIndexed()
      : skinnedMesh.geometry.clone();

    const pos = baseGeom.attributes.position;
    const si = baseGeom.attributes.skinIndex;
    const sw = baseGeom.attributes.skinWeight;
    const uv = baseGeom.attributes.uv;
    const count = pos.count;

    const limbs = new Float32Array(count);
    const weights = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    const col = new THREE.Color(0xffffff);

    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(pos, i);
      skinnedMesh.applyBoneTransform(i, v);
      v.applyMatrix4(skinnedMesh.matrixWorld);
      pos.setXYZ(
        i,
        (v.x - hipsWP.x) * refScale,
        (v.y - refMinY) * refScale,
        (v.z - hipsWP.z) * refScale
      );

      // Compute smooth bone-driven limb assignment and blend weight
      let wHead = 0;
      let wLeftArm = 0;
      let wRightArm = 0;
      let wLeftLeg = 0;
      let wRightLeg = 0;
      let dominantBone = 0;
      let maxBoneW = -1;

      if (si && sw) {
        for (let k = 0; k < 4; k++) {
          const bIdx = si.getComponent(i, k);
          const bW = sw.getComponent(i, k);
          if (bW > maxBoneW) {
            maxBoneW = bW;
            dominantBone = bIdx;
          }
          if (bIdx === 17 || bIdx === 18) {
            wHead += bW;
          } else if (bIdx === 19) {
            wLeftArm += bW * 0.35;
          } else if (bIdx >= 20 && bIdx <= 27) {
            wLeftArm += bW;
          } else if (bIdx === 28) {
            wRightArm += bW * 0.35;
          } else if (bIdx >= 29 && bIdx <= 36) {
            wRightArm += bW;
          } else if ((bIdx >= 0 && bIdx <= 5) || (bIdx >= 37 && bIdx <= 40)) {
            wLeftLeg += bW;
          } else if ((bIdx >= 6 && bIdx <= 11) || (bIdx >= 41 && bIdx <= 44)) {
            wRightLeg += bW;
          }
        }
      }

      let limbId = 0.0;
      let limbW = 0.0;
      const best = Math.max(wHead, wLeftArm, wRightArm, wLeftLeg, wRightLeg);
      if (best > 0.04) {
        if (best === wHead) {
          limbId = 1.0;
          limbW = wHead;
        } else if (best === wLeftArm) {
          limbId = 2.0;
          limbW = wLeftArm;
        } else if (best === wRightArm) {
          limbId = 3.0;
          limbW = wRightArm;
        } else if (best === wLeftLeg) {
          limbId = 4.0;
          limbW = wLeftLeg;
        } else if (best === wRightLeg) {
          limbId = 5.0;
          limbW = wRightLeg;
        }
      }

      limbs[i] = limbId;
      weights[i] = limbW;

      col.setHex(0xffffff);
      if (colorPainter) {
        const u = uv ? uv.getX(i) : 0;
        const vCoord = uv ? uv.getY(i) : 0;
        colorPainter(col, dominantBone, limbId, u, vCoord);
      }
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    _smoothNonIndexedNormals(baseGeom);

    for (const key of Object.keys(baseGeom.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        baseGeom.deleteAttribute(key);
      }
    }
    baseGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    baseGeom.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
    baseGeom.setAttribute('aLimbWeight', new THREE.BufferAttribute(weights, 1));

    if (extraProps.length > 0) {
      return BufferGeometryUtils.mergeGeometries([baseGeom, ...extraProps]);
    }
    return baseGeom;
  };

  // -------------------------------------------------------------
  // 1. ZOMBIE & PATIENT ZERO GEOMETRY (Undead Hunch + Outstretched Arms)
  // -------------------------------------------------------------
  resetToIdle();
  const bones = skinnedMesh.skeleton.bones;
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  // Subtle forward spine hunch & head tilt
  _rotateBoneWorld(bones[14], axisX, 0.10);  // Spine forward
  _rotateBoneWorld(bones[15], axisX, 0.08);  // Chest forward
  _rotateBoneWorld(bones[18], axisZ, 0.08);  // Slight eerie head cock
  // Both arms raised reaching hungrily forward (+Z)
  _rotateBoneWorld(bones[20], axisX, -1.22); // LeftArm forward
  _rotateBoneWorld(bones[20], axisY, -0.18); // LeftArm slightly inward
  _rotateBoneWorld(bones[29], axisX, -1.28); // RightArm forward
  _rotateBoneWorld(bones[29], axisY, 0.18);  // RightArm slightly inward

  const zombieGeom = bakeCurrentPose();
  const pzGeom = zombieGeom.clone();

  // -------------------------------------------------------------
  // 2. CIVILIAN GEOMETRIES (6 Variants in Natural Upright Pose)
  // -------------------------------------------------------------
  resetToIdle();
  const civShirtTints = [
    0xffffff, // 0: Male Classic Sky Blue Shirt
    0xff9ebb, // 1: Female Coral Rose Top
    0xffe066, // 2: Male Mustard Gold Shirt
    0x7bf1a8, // 3: Female Mint Green Top
    0xffa970, // 4: Male Warm Tangerine Shirt
    0xd8b4fe, // 5: Female Lavender Top
  ];

  const civGeoms = civShirtTints.map((shirtHex) => {
    const shirtCol = new THREE.Color(shirtHex);
    return bakeCurrentPose((col, boneIdx, limbId, u, v) => {
      // Tint only shirt/sleeve region (u < 0.62, v < 0.54) so skin, face, hair, jeans & shoes stay untouched
      const isShirtUV = u < 0.62 && v < 0.54;
      const isUpperBodyBone =
        boneIdx === 14 || boneIdx === 15 || boneIdx === 16 ||
        boneIdx === 19 || boneIdx === 20 || boneIdx === 28 || boneIdx === 29;
      if (isShirtUV && isUpperBodyBone) {
        col.copy(shirtCol);
      }
    });
  });

  // -------------------------------------------------------------
  // 3. HAZMAT GEOMETRY (Right Arm Aiming Sprayer + Oxygen Tank & Visor)
  // -------------------------------------------------------------
  resetToIdle();
  _rotateBoneWorld(bones[29], axisX, -1.28);
  _rotateBoneWorld(bones[29], axisY, 0.22);

  const hazmatProps = [];
  // Dark glass protective visor across face
  const visor = new THREE.BoxGeometry(0.28, 0.14, 0.12);
  visor.translate(0, 1.24, 0.18);
  hazmatProps.push(_tagPropForKenneyMerge(visor, 1.0, 0x0f172a));

  // Red pressurized oxygen tank on back
  const oxTank = new THREE.CylinderGeometry(0.09, 0.09, 0.36, 8);
  oxTank.translate(0, 0.76, -0.15);
  hazmatProps.push(_tagPropForKenneyMerge(oxTank, 0.0, 0xef4444));

  // Disinfectant sprayer nozzle in right hand
  const nozzle = new THREE.CylinderGeometry(0.035, 0.05, 0.34, 8);
  nozzle.rotateX(Math.PI / 2);
  nozzle.translate(-0.14, 0.81, 0.48);
  hazmatProps.push(_tagPropForKenneyMerge(nozzle, 3.0, 0x334155));

  const hazmatGeom = bakeCurrentPose((col, boneIdx) => {
    // High-vis yellow hazmat suit with charcoal gloves/boots
    const isGloveOrBoot =
      (boneIdx >= 22 && boneIdx <= 27) ||
      (boneIdx >= 31 && boneIdx <= 36) ||
      boneIdx === 39 || boneIdx === 40 || boneIdx === 43 || boneIdx === 44;
    col.setHex(isGloveOrBoot ? 0x1e293b : 0xfacc15);
  }, hazmatProps);

  // -------------------------------------------------------------
  // 4. MILITARY RIFLEMAN GEOMETRY (Tactical Rifle Stance + Helmet & Rifle)
  // -------------------------------------------------------------
  resetToIdle();
  _rotateBoneWorld(bones[20], axisX, -1.05); // Left support hand
  _rotateBoneWorld(bones[20], axisY, -0.45);
  _rotateBoneWorld(bones[29], axisX, -1.28); // Right trigger hand
  _rotateBoneWorld(bones[29], axisY, 0.24);

  const milProps = [];
  // Army combat helmet
  const helmet = new THREE.BoxGeometry(0.36, 0.14, 0.36);
  helmet.translate(0, 1.44, 0.05);
  milProps.push(_tagPropForKenneyMerge(helmet, 1.0, 0x15803d));

  // Tactical Assault Rifle receiver + barrel
  const rifleBody = new THREE.BoxGeometry(0.06, 0.11, 0.46);
  rifleBody.translate(-0.11, 0.83, 0.38);
  milProps.push(_tagPropForKenneyMerge(rifleBody, 3.0, 0x1e293b));

  const rifleBarrel = new THREE.CylinderGeometry(0.018, 0.018, 0.26, 6);
  rifleBarrel.rotateX(Math.PI / 2);
  rifleBarrel.translate(-0.11, 0.85, 0.68);
  milProps.push(_tagPropForKenneyMerge(rifleBarrel, 3.0, 0x0f172a));

  const militaryGeom = bakeCurrentPose((col, boneIdx, limbId, u, v) => {
    const isShirtUV = u < 0.62 && v < 0.54;
    const isPantsUV = u >= 0.62 && v < 0.68;
    if (isShirtUV && limbId !== 1.0) {
      col.setHex(0x4d7c0f); // Olive drab fatigues
    } else if (isPantsUV && limbId >= 4.0) {
      col.setHex(0x365314); // Dark army cargo pants
    }
  }, milProps);

  // -------------------------------------------------------------
  // 5. MEGAPHONE WARDEN GEOMETRY (Right Arm Holding Megaphone + Hardhat)
  // -------------------------------------------------------------
  resetToIdle();
  _rotateBoneWorld(bones[29], axisX, -1.28);
  _rotateBoneWorld(bones[29], axisY, 0.20);

  const wardenProps = [];
  // White safety hardhat
  const hardhat = new THREE.BoxGeometry(0.36, 0.13, 0.38);
  hardhat.translate(0, 1.44, 0.05);
  wardenProps.push(_tagPropForKenneyMerge(hardhat, 1.0, 0xf8fafc));

  // Megaphone cone & red rim
  const megaCone = new THREE.CylinderGeometry(0.14, 0.05, 0.26, 10);
  megaCone.rotateX(Math.PI / 2);
  megaCone.translate(-0.14, 0.82, 0.50);
  wardenProps.push(_tagPropForKenneyMerge(megaCone, 3.0, 0xffffff));

  const megaRim = new THREE.CylinderGeometry(0.15, 0.15, 0.035, 10);
  megaRim.rotateX(Math.PI / 2);
  megaRim.translate(-0.14, 0.82, 0.63);
  wardenProps.push(_tagPropForKenneyMerge(megaRim, 3.0, 0xef4444));

  const wardenGeom = bakeCurrentPose((col, boneIdx, limbId, u, v) => {
    const isShirtUV = u < 0.62 && v < 0.54;
    if (isShirtUV && limbId !== 1.0) {
      col.setHex(0xff7b29); // High-vis safety orange vest
    }
  }, wardenProps);

  // Clean up mixer state
  mixer.stopAllAction();

  return {
    zombieGeom,
    pzGeom,
    civGeoms,
    hazmatGeom,
    militaryGeom,
    wardenGeom,
  };
}

/**
 * Injects procedural GPU kinetic animation vertex shader chunks into Three.js materials.
 * Uses smooth bone-derived weights (aLimbWeight) so Kenney 3D meshes articulate with zero vertex tearing.
 */
export function injectCharacterAnimationShader(material) {
  material.onBeforeCompile = (shader) => {
    // 1. Declare instance attributes and vertex limb + smooth weight attributes
    shader.vertexShader = `
      attribute vec4 instanceAnim; // (speed, walkPhase, animType, flail)
      attribute float aLimb;
      attribute float aLimbWeight;
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
      float limbW = aLimbWeight > 0.001 ? clamp(aLimbWeight, 0.0, 1.0) : 1.0;

      // 1. LEGS SWING (aLimb == 4.0 [Left Leg] or 5.0 [Right Leg])
      // Pivot smoothly around hip (Y = 0.49, Z = 0.0)
      if (aLimb > 3.5) {
        float legSign = (aLimb > 4.5) ? -1.0 : 1.0;
        float legSwing = sin(phase) * 0.46 * speedFactor * legSign * limbW;
        float py = transformed.y - 0.49;
        float pz = transformed.z;
        transformed.y = 0.49 + py * cos(legSwing) - pz * sin(legSwing);
        transformed.z = py * sin(legSwing) + pz * cos(legSwing);
      }

      // 2. ARMS ANIMATION (aLimb == 2.0 [Left Arm] or 3.0 [Right Arm])
      if (animType > 0.5 && animType < 2.5) {
        // ZOMBIES & PATIENT ZERO: Arms reaching forward (+Z) with alternating clutch sway
        if (aLimb > 1.5 && aLimb < 3.5) {
          float zombieArmSway = sin(phase * 0.9 + (aLimb > 2.5 ? 1.57 : 0.0)) * 0.09 * limbW;
          float py = transformed.y - 0.90;
          float pz = transformed.z;
          transformed.y = 0.90 + py * cos(zombieArmSway) - pz * sin(zombieArmSway);
          transformed.z = py * sin(zombieArmSway) + pz * cos(zombieArmSway);
        }
      } else if (animType > 3.5) {
        // MILITARY: Tactical rifle aim locked forward with subtle breathing micro-sway
        if (aLimb > 1.5 && aLimb < 3.5) {
          float aimSway = sin(phase * 0.5) * 0.02 * limbW;
          float py = transformed.y - 0.90;
          float pz = transformed.z;
          transformed.y = 0.90 + py * cos(aimSway) - pz * sin(aimSway);
          transformed.z = py * sin(aimSway) + pz * cos(aimSway);
        }
      } else if (animType > 2.5) {
        // HAZMAT & WARDEN: Left arm swings, right arm stays locked aiming forward
        if (aLimb > 1.5 && aLimb < 2.5) {
          float armSwing = -sin(phase) * 0.35 * speedFactor * limbW;
          float py = transformed.y - 0.90;
          float pz = transformed.z;
          transformed.y = 0.90 + py * cos(armSwing) - pz * sin(armSwing);
          transformed.z = py * sin(armSwing) + pz * cos(armSwing);
        }
      } else {
        // CIVILIANS: Anchored at shoulder (Y = 0.90, Z = 0.0)
        if (aLimb > 1.5 && aLimb < 3.5) {
          float armSign = (aLimb > 2.5) ? -1.0 : 1.0;
          float armSwing = -sin(phase) * (speedFactor * 0.38) * armSign * limbW;
          float py = transformed.y - 0.90;
          float pz = transformed.z;
          transformed.y = 0.90 + py * cos(armSwing) - pz * sin(armSwing);
          transformed.z = py * sin(armSwing) + pz * cos(armSwing);
        }
      }

      // 3. HEAD BOB / TILT (aLimb == 1.0)
      // Pivot around neck (Y = 0.95)
      if (aLimb > 0.5 && aLimb < 1.5) {
        float headTilt = sin(phase * 0.5) * 0.06 * speedFactor * limbW;
        float hpx = transformed.x;
        float hpy = transformed.y - 0.95;
        transformed.x = hpx * cos(headTilt) - hpy * sin(headTilt);
        transformed.y = 0.95 + hpx * sin(headTilt) + hpy * cos(headTilt);
      }

      // 4. POSTURE & SIDE-TO-SIDE SHAMBLE (Rotated around hip Y = 0.49)
      if (animType > 0.5 && animType < 2.5) {
        // Zombie: Subtle shamble roll
        float waddleRoll = sin(phase * 0.9) * 0.09 * speedFactor;
        float pxW = transformed.x;
        float pyW = transformed.y - 0.49;
        transformed.x = pxW * cos(waddleRoll) - pyW * sin(waddleRoll);
        transformed.y = 0.49 + pxW * sin(waddleRoll) + pyW * cos(waddleRoll);

        // Lateral hip shift
        transformed.x += sin(phase * 0.9) * 0.04 * speedFactor;
      } else if (animType < 0.5 && speedFactor > 0.7) {
        // Civilian: Slight forward sprint lean
        float civLean = 0.08;
        float pyL = transformed.y - 0.49;
        float pzL = transformed.z;
        transformed.y = 0.49 + pyL * cos(civLean) - pzL * sin(civLean);
        transformed.z = pyL * sin(civLean) + pzL * cos(civLean);
      }

      // Flail jitter during conversion
      if (flail > 0.01) {
        transformed.x += sin(phase * 3.5) * 0.06 * flail;
      }

      // 5. RIGID WHOLE-CHARACTER VERTICAL STRIDE BOUNCE
      if (speedFactor > 0.05) {
        float strideBounce = abs(sin(phase)) * 0.05 * speedFactor;
        transformed.y += strideBounce;
      }
      `
    );
  };
}
