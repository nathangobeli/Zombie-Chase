import { chromium } from 'playwright';

async function verifyGameplayEnhancements() {
  console.log('=== STARTING GAMEPLAY & VISUAL ENHANCEMENT VERIFICATION ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('[Browser Page Error]', err);
    pageErrors.push(err.message);
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const testReport = {
    viralChains: false,
    civilianArchetypes: false,
    frenzyMultiplier: false,
    hordeCommands: false,
    escalationBoss: false,
    visualPolish: false,
    pageErrors,
  };

  // Start Outbreak
  await page.evaluate(() => {
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.click();
  });
  await page.waitForTimeout(500);

  // 1. VERIFY VIRAL CHAIN INFECTIONS
  console.log('[Test 1/6] Verifying Viral Chain Infections...');
  const viralChainsResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const em = app.entityManager;

    // Convert a civilian into a zombie
    em.civilians = [];
    em.zombies = [];
    // Ensure patient zero is on opposite road so PZ cannot infect (58m away: > 1.5m reach, < 140m despawn radius)
    em.patientZero.x = -29.0;
    em.patientZero.z = 0;
    em.patientZero.vx = 0;
    em.patientZero.vz = 0;

    em.spawnCivilian(29.0, 0.0);
    em.convertCivilianToZombie(0, false);

    const firstZombie = em.zombies[0];
    firstZombie.x = 29.0;
    firstZombie.z = 0;
    firstZombie.vx = 0;
    firstZombie.vz = 0;
    const hasInitialTimer = firstZombie && firstZombie.chainVirulentTimer === 8.0;

    // Spawn a target civilian right next to the virulent zombie on the open street (distance 0.42m < 1.45m reach)
    const targetCiv = em.spawnCivilian(29.3, 0.3);
    targetCiv.x = 29.3;
    targetCiv.z = 0.3;
    targetCiv.preventDespawn = true;

    const civsCountBefore = em.civilians.length;
    const zCountBefore = em.zombies.length;

    // Simulate update step
    em.update(0.016, { x: 0, z: 0 }, app.spatialGrid, app.cityStreamer);

    // Verify chain infection occurred without player contact
    const chainZombie = em.zombies[em.zombies.length - 1];
    const wasChainInfected = chainZombie && chainZombie.isChained === true;
    const isSlowerThanPz = chainZombie && chainZombie.chainSpeedFactor === 0.85;

    // Verify virulent aura mesh exists and is active in renderer
    const virulentMesh = app.renderer3D.virulentAuraMesh;
    const hasVirulentAuraMesh = !!virulentMesh;

    return {
      hasInitialTimer,
      wasChainInfected,
      isSlowerThanPz,
      hasVirulentAuraMesh,
      hordeCountAfterChain: em.zombies.length,
      success: hasInitialTimer && wasChainInfected && isSlowerThanPz && hasVirulentAuraMesh
    };
  });
  console.log('Viral Chains Result:', viralChainsResult);
  testReport.viralChains = viralChainsResult.success;

  // 2. VERIFY CIVILIAN ARCHETYPES
  console.log('\n[Test 2/6] Verifying Civilian Archetypes (Sprinter, Cop, Carrier)...');
  const archetypesResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const em = app.entityManager;

    // Test Sprinter
    const sprinter = em.spawnCivilian(20, 20, 'sprinter');
    const isSprinterFast = sprinter.civType === 'sprinter' && sprinter.fleeSpeed >= 6.8;

    // Test Cop
    const cop = em.spawnCivilian(25, 25, 'cop');
    const isCopType = cop.civType === 'cop' && cop.aimTimer !== undefined;
    // Add a horde zombie within Cop range (13m)
    const targetZ = {
      id: 'target-zombie',
      type: 'zombie',
      x: cop.x + 4.0,
      z: cop.z + 4.0,
      vx: 0, vz: 0, radius: 0.5,
      walkPhase: 0, convertAnim: 0,
      chainVirulentTimer: 0
    };
    em.zombies.push(targetZ);
    // Fast-forward cop aiming (aimDuration is 1.0s, remaining 0.05s)
    cop.aimTimer = 0.04;
    cop.copTarget = targetZ;
    cop.shootCooldown = 0;
    em.update(0.06, { x: 0, z: 0 }, app.spatialGrid, app.cityStreamer);
    const copKilledZombie = !em.zombies.includes(targetZ);

    // Test Carrier Bio-Burst
    em.civilians = [];
    const carrier = em.spawnCivilian(30, 30, 'carrier');
    // Spawn 4 nearby standard civilians within 5m
    em.spawnCivilian(31, 30, 'standard');
    em.spawnCivilian(29, 30, 'standard');
    em.spawnCivilian(30, 32, 'standard');
    em.spawnCivilian(30, 28, 'standard');
    const civsBeforeBioBurst = em.civilians.length;
    const zombiesBeforeBioBurst = em.zombies.length;

    // Convert carrier
    const carrierIdx = em.civilians.indexOf(carrier);
    em.convertCivilianToZombie(carrierIdx, false);
    const allNearbyTurned = em.civilians.length === 0 && em.zombies.length >= zombiesBeforeBioBurst + 5;

    // Verify 9 variants in InstancedRenderer
    const numCivVariants = app.renderer3D.civMeshes.length;

    return {
      isSprinterFast,
      isCopType,
      copKilledZombie,
      carrierBioBurstSuccess: allNearbyTurned,
      numCivVariants,
      success: isSprinterFast && isCopType && copKilledZombie && allNearbyTurned && (numCivVariants === 9)
    };
  });
  console.log('Archetypes Result:', archetypesResult);
  testReport.civilianArchetypes = archetypesResult.success;

  // 3. VERIFY FRENZY COMBO MULTIPLIER
  console.log('\n[Test 3/6] Verifying FRENZY Combo Multiplier...');
  const frenzyMultiplierResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const em = app.entityManager;
    em.isFrenzyActive = true;
    em.frenzyComboMultiplier = 1;
    em.frenzyComboTimer = 0;

    // Spawn and convert civilian 1 during frenzy
    em.spawnCivilian(0, 0);
    em.convertCivilianToZombie(em.civilians.length - 1, false);
    const multAfterFirst = em.frenzyComboMultiplier; // 2

    // Spawn and convert civilian 2 during frenzy
    em.spawnCivilian(0, 0);
    em.convertCivilianToZombie(em.civilians.length - 1, false);
    const multAfterSecond = em.frenzyComboMultiplier; // 3

    const badge = document.getElementById('hud-frenzy-combo');
    const badgeText = document.getElementById('frenzy-combo-val')?.textContent;
    const badgeVisible = badge && !badge.classList.contains('hidden');

    // Simulate 3.2s lapse to test timeout reset
    app.spatialGrid.clear();
    em.update(3.2, { x: 0, z: 0 }, app.spatialGrid, app.cityStreamer);
    const multAfterReset = em.frenzyComboMultiplier;
    const badgeHiddenAfterReset = badge && badge.classList.contains('hidden');

    em.isFrenzyActive = false;

    return {
      multAfterFirst,
      multAfterSecond,
      badgeText,
      badgeVisible,
      multAfterReset,
      badgeHiddenAfterReset,
      success: (multAfterFirst === 2) && (multAfterSecond === 3) && (badgeText === 'x3') && badgeVisible && (multAfterReset === 1) && badgeHiddenAfterReset
    };
  });
  console.log('Frenzy Multiplier Result:', frenzyMultiplierResult);
  testReport.frenzyMultiplier = frenzyMultiplierResult.success;

  // 4. VERIFY HORDE COMMANDS (KEYS 1 & 2)
  console.log('\n[Test 4/6] Verifying Horde Commands (Keys 1 & 2, Formation HUD)...');
  // Dispatch Keydown Digit1
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(100);
  const scatterResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const btnScatter = document.getElementById('btn-formation-scatter');
    const btnRegroup = document.getElementById('btn-formation-regroup');
    return {
      formation: app.entityManager.currentFormation,
      scatterActive: btnScatter ? btnScatter.classList.contains('active') : false,
      regroupActive: btnRegroup ? btnRegroup.classList.contains('active') : false,
    };
  });

  // Dispatch Keydown Digit2
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(100);
  const regroupResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const btnScatter = document.getElementById('btn-formation-scatter');
    const btnRegroup = document.getElementById('btn-formation-regroup');
    return {
      formation: app.entityManager.currentFormation,
      scatterActive: btnScatter ? btnScatter.classList.contains('active') : false,
      regroupActive: btnRegroup ? btnRegroup.classList.contains('active') : false,
    };
  });

  // Click Scatter button
  await page.click('#btn-formation-scatter');
  await page.waitForTimeout(100);
  const clickScatterResult = await page.evaluate(() => {
    return window.__GAME_APP__.entityManager.currentFormation;
  });

  const hordeCommandsSuccess = (scatterResult.formation === 'scatter' && scatterResult.scatterActive) &&
                               (regroupResult.formation === 'regroup' && regroupResult.regroupActive) &&
                               (clickScatterResult === 'scatter');
  console.log('Horde Commands Result:', { scatterResult, regroupResult, clickScatterResult, success: hordeCommandsSuccess });
  testReport.hordeCommands = hordeCommandsSuccess;

  // 5. VERIFY ESCALATION BOSS UNIT
  console.log('\n[Test 5/6] Verifying Hunter-Killer Boss Unit...');
  const bossResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const em = app.entityManager;

    // Trigger boss spawn manually or via panic
    em.panicLevel = 0.72;
    em.spawnHunterKillerBoss();
    const boss = em.hunterKillerBoss;
    const hasBoss = !!boss;
    const bossSpeed = boss ? boss.speed : 0;

    // Check boss mesh created in InstancedRenderer
    const bossMesh = app.renderer3D.bossVehicleMesh;
    const attackConeMesh = app.renderer3D.bossAttackConeMesh;
    const hasBossMeshes = !!bossMesh && !!attackConeMesh;

    // Test destruction via horde sacrifices or frenzy ram
    const panicBefore = em.panicLevel;
    const scoreBefore = em.score;
    let slowMoTriggered = false;
    em.onSlowMoTriggered = () => { slowMoTriggered = true; };

    // Ram with Frenzy
    em.destroyHunterKillerBoss(true);
    const bossDestroyed = em.hunterKillerBoss === null;
    const panicAfter = em.panicLevel;
    const scoreAfter = em.score;

    return {
      hasBoss,
      bossSpeed,
      hasBossMeshes,
      bossDestroyed,
      panicDropped: panicAfter < panicBefore,
      panicDifference: (panicBefore - panicAfter).toFixed(2),
      scoreAwarded: scoreAfter === scoreBefore + 1000,
      slowMoTriggered,
      success: hasBoss && (bossSpeed === 5.4) && hasBossMeshes && bossDestroyed && ((panicBefore - panicAfter) >= 0.14) && (scoreAfter === scoreBefore + 1000) && slowMoTriggered
    };
  });
  console.log('Escalation Boss Result:', bossResult);
  testReport.escalationBoss = bossResult.success;

  // 6. VERIFY VISUAL POLISH (Night Mode, Kill Feed, Floating Combat Text, Rules Modal)
  console.log('\n[Test 6/6] Verifying Visual Polish (Night Mode, Kill Feed, Rules Modal)...');
  const visualPolishResult = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const killFeed = document.getElementById('kill-feed');

    // Add kill feed test items
    app._addKillFeedItem('🧟 Civilian Infected (+1)', 'kf-civ');
    app._addKillFeedItem('⚡ Viral Chain (+1)', 'kf-chain');
    app._addKillFeedItem('☣️ Carrier Bio-Burst (+4)', 'kf-carrier');
    const killFeedCount = killFeed ? killFeed.children.length : 0;

    // Toggle Night Mode via method
    app.toggleNightMode(true);
    const isNight = app.isNightMode;
    const nightBtnActive = app.nightToggleBtn ? app.nightToggleBtn.classList.contains('active') : false;

    // Verify rules modal entries
    const rulesModal = document.getElementById('rules-modal');
    const rulesText = rulesModal ? rulesModal.textContent : '';
    const hasChainsInRules = rulesText.includes('VIRAL CHAIN INFECTIONS');
    const hasArchetypesInRules = rulesText.includes('CIVILIAN ARCHETYPES') && rulesText.includes('Sprinter') && rulesText.includes('Police Officer') && rulesText.includes('Toxic Carrier');
    const hasFrenzyInRules = rulesText.includes('FRENZY COMBO MULTIPLIER');
    const hasFormationsInRules = rulesText.includes('HORDE FORMATIONS');
    const hasBossInRules = rulesText.includes('ESCALATION BOSS');

    // Verify Slow-Mo system
    app.triggerSlowMo(0.3, 0.5);
    const slowMoActive = app._slowMoScale === 0.3 && app._slowMoTimer === 0.5;

    return {
      killFeedWorking: killFeedCount >= 3,
      isNight,
      nightBtnActive,
      hasChainsInRules,
      hasArchetypesInRules,
      hasFrenzyInRules,
      hasFormationsInRules,
      hasBossInRules,
      slowMoActive,
      success: (killFeedCount >= 3) && isNight && nightBtnActive && hasChainsInRules && hasArchetypesInRules && hasFrenzyInRules && hasFormationsInRules && hasBossInRules && slowMoActive
    };
  });
  console.log('Visual Polish Result:', visualPolishResult);
  testReport.visualPolish = visualPolishResult.success;

  // Test Night Mode Keypress
  await page.keyboard.press('KeyN');
  await page.waitForTimeout(100);
  const nightKeyResult = await page.evaluate(() => {
    return window.__GAME_APP__.isNightMode === false; // Toggled back to day
  });
  console.log('Night Mode KeyN Toggle Result:', nightKeyResult);

  // Take screenshot for visual confirmation
  await page.evaluate(() => window.__GAME_APP__.toggleNightMode(true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'dist/night_mode_preview.png' });
  console.log('Saved night mode screenshot to dist/night_mode_preview.png');

  await browser.close();

  console.log('\n=== FINAL VERIFICATION SUMMARY ===');
  console.log(JSON.stringify(testReport, null, 2));

  const allPassed = testReport.viralChains &&
                    testReport.civilianArchetypes &&
                    testReport.frenzyMultiplier &&
                    testReport.hordeCommands &&
                    testReport.escalationBoss &&
                    testReport.visualPolish &&
                    pageErrors.length === 0;

  if (allPassed) {
    console.log('\n🎉 ALL 6 REQUIREMENTS AND ENHANCEMENTS PASSED WITH FLYING COLORS!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME CHECKS FAILED. Please review report above.');
    process.exit(1);
  }
}

verifyGameplayEnhancements().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
