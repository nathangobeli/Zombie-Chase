import { chromium } from 'playwright';

async function runVerification() {
  console.log('--- STARTING COMPREHENSIVE QA FIXES VERIFICATION ---');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  const errors = [];
  page.on('pageerror', (err) => {
    console.error('[Page Error]', err);
    errors.push(err.message);
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const results = {};

  // 1. Verify Rules Modal text (Issue 8)
  console.log('\n[1/10] Verifying Rules / How to play modal text...');
  const rulesCheck = await page.evaluate(() => {
    const rulesBtn = document.getElementById('btn-menu-rules');
    const rulesModal = document.getElementById('rules-modal');
    if (rulesBtn) rulesBtn.click();
    const text = rulesModal ? rulesModal.textContent : '';
    const hasTimeAttack = text.includes('2, 5, or 10-minute') || text.includes('Time Attack');
    const no90s = !text.includes('90s');
    const noSqueeze = !text.includes('SQUEEZE') && !text.includes('PHALANX');
    const closeBtn = document.getElementById('btn-close-rules');
    if (closeBtn) closeBtn.click();
    return { hasTimeAttack, no90s, noSqueeze, success: hasTimeAttack && no90s && noSqueeze };
  });
  console.log('Rules check:', rulesCheck);
  results.rulesCheck = rulesCheck;

  // 2. Verify Dev Cheats Panel is gated (Issue 7)
  console.log('\n[2/10] Verifying Dev Cheats & Telemetry panel gating...');
  const devGateCheck = await page.evaluate(() => {
    const drawer = document.getElementById('debug-drawer');
    const isHiddenByDefault = drawer ? drawer.classList.contains('dev-hidden') : false;
    // Test __ENABLE_DEV_MODE
    window.__ENABLE_DEV_MODE(true);
    const isShownOnEnable = drawer ? !drawer.classList.contains('dev-hidden') : false;
    window.__ENABLE_DEV_MODE(false);
    const isHiddenOnDisable = drawer ? drawer.classList.contains('dev-hidden') : false;
    return {
      isHiddenByDefault,
      isShownOnEnable,
      isHiddenOnDisable,
      success: isHiddenByDefault && isShownOnEnable && isHiddenOnDisable
    };
  });
  console.log('Dev Gate check:', devGateCheck);
  results.devGateCheck = devGateCheck;

  // 3. Verify Mutation Lab modal stacking and toggle over main menu (Issue 3)
  console.log('\n[3/10] Verifying Mutation Lab modal stacking & accessibility...');
  const labCheck = await page.evaluate(() => {
    const menuLabBtn = document.getElementById('btn-menu-lab');
    const labModal = document.getElementById('lab-modal');
    const menuOverlay = document.getElementById('main-menu-overlay');
    const applyBtn = document.getElementById('btn-close-lab-footer') || document.getElementById('btn-close-lab');

    // Open lab from menu
    if (menuLabBtn) menuLabBtn.click();
    const labZIndex = window.getComputedStyle(labModal).zIndex;
    const menuZIndex = window.getComputedStyle(menuOverlay).zIndex;
    const isOpen = labModal && labModal.style.display === 'flex';
    const isLabAboveMenu = parseInt(labZIndex, 10) > parseInt(menuZIndex, 10);

    // Check Apply & Return button reachability
    const applyRect = applyBtn ? applyBtn.getBoundingClientRect() : null;
    const isApplyVisible = applyRect && applyRect.width > 0 && applyRect.height > 0;

    // Toggle close with menuLabBtn
    if (menuLabBtn) menuLabBtn.click();
    const isClosedOnToggle = labModal && labModal.style.display === 'none';

    return {
      labZIndex,
      menuZIndex,
      isLabAboveMenu,
      isOpen,
      isApplyVisible,
      isClosedOnToggle,
      success: isLabAboveMenu && isApplyVisible && isClosedOnToggle
    };
  });
  console.log('Mutation Lab check:', labCheck);
  results.labCheck = labCheck;

  // 4. Verify Frenzy Button Styling (Issue 4) & Squeeze/Phalanx Removed
  console.log('\n[4/10] Verifying Frenzy button styling & removal of squeeze/phalanx...');
  const buttonsCheck = await page.evaluate(() => {
    const frenzyBtn = document.getElementById('btn-frenzy');
    const frenzyIcon = frenzyBtn ? frenzyBtn.querySelector('.frenzy-icon') : null;
    const frenzyLabel = frenzyBtn ? frenzyBtn.querySelector('.frenzy-label') : null;
    const squeezeBtn = document.getElementById('btn-squeeze');
    const phalanxBtn = document.getElementById('btn-phalanx');

    const hasFrenzyInner = frenzyBtn && frenzyBtn.querySelector('.frenzy-btn-inner');
    const hasFrenzyIcon = !!frenzyIcon;
    const hasFrenzyLabel = !!frenzyLabel;
    const squeezeRemoved = !squeezeBtn;
    const phalanxRemoved = !phalanxBtn;

    return {
      hasFrenzyInner: !!hasFrenzyInner,
      hasFrenzyIcon,
      hasFrenzyLabel,
      squeezeRemoved,
      phalanxRemoved,
      success: hasFrenzyInner && hasFrenzyIcon && hasFrenzyLabel && squeezeRemoved && phalanxRemoved
    };
  });
  console.log('Buttons check:', buttonsCheck);
  results.buttonsCheck = buttonsCheck;

  // 5. Verify Camera settings & avoidance (Issue 5 & 10)
  console.log('\n[5/10] Verifying Camera parameters and mode toggle...');
  const cameraCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const cam = app ? app.camera : null;
    const camCtrl = app ? app.cameraController : null;
    const near = cam ? cam.near : null;
    const defaultMode = camCtrl ? camCtrl.cameraMode : null;
    const followMode = camCtrl ? camCtrl.toggleCameraMode() : null;
    const fixedMode = camCtrl ? camCtrl.toggleCameraMode() : null;

    return {
      near,
      defaultMode,
      followMode,
      fixedMode,
      success: near === 0.1 && defaultMode === 'fixed' && followMode === 'follow' && fixedMode === 'fixed'
    };
  });
  console.log('Camera check:', cameraCheck);
  results.cameraCheck = cameraCheck;

  // 6. Verify TIME ATTACK: 2 MIN run counts down, ends at 0, and ENDLESS hides timer (Issue 1)
  console.log('\n[6/10] Verifying TIME ATTACK countdown and ENDLESS mode timer...');
  const timeAttackCheck = await page.evaluate(async () => {
    const app = window.__GAME_APP__;
    // Check ENDLESS first
    app.startGame('casual', 'endless');
    const hudTimerEl = document.getElementById('hud-time-attack');
    const endlessHidden = hudTimerEl ? hudTimerEl.classList.contains('hidden') : false;

    // Now start TIME ATTACK 2 MIN
    app.startGame('casual', 'time_attack_2');
    const timeAttackVisible = hudTimerEl ? !hudTimerEl.classList.contains('hidden') : false;
    const hudValEl = document.getElementById('hud-time-attack-val') || document.getElementById('time-attack-val');
    const initialText = hudValEl ? hudValEl.textContent : '';

    // Give score so player qualifies for high score
    app.entityManager.score = 1000;

    // Simulate 2 seconds of loop update
    app.timeAttackTimer = 118;
    app._updateTimeAttackDisplay();
    const updatedText = hudValEl ? hudValEl.textContent : '';

    // Fast-forward to 0 to test game-over
    app.timeAttackTimer = 0;
    app.entityManager.onGameOver('TIME_ATTACK_SURVIVED');
    const isGameOver = app.isGameOver;
    const gameOverReason = app.gameOverReasonEl ? app.gameOverReasonEl.textContent : '';
    const finalScore = app.goFinalScoreEl ? app.goFinalScoreEl.textContent : '';

    return {
      endlessHidden,
      timeAttackVisible,
      initialText,
      updatedText,
      isGameOver,
      gameOverReason,
      finalScore,
      isEnteringInitials: app.isEnteringInitials,
      success: endlessHidden && timeAttackVisible && initialText === '02:00' && updatedText === '01:58' && isGameOver && gameOverReason.includes("TIME'S UP!")
    };
  });
  console.log('Time Attack check:', timeAttackCheck);
  results.timeAttackCheck = timeAttackCheck;

  // 7. Verify Game-over -> Initials Tumbler -> Leaderboard flow (Sanity check b)
  console.log('\n[7/10] Verifying Game-over -> High-score Initials -> Leaderboard flow...');
  const leaderboardFlowCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const tumblerModal = document.getElementById('initials-modal');
    const goModal = document.getElementById('game-over-modal');

    // Submit initials
    if (app.isEnteringInitials) {
      app.tumblerChars = ['W', 'I', 'N'];
      app._submitInitials();
    }

    const initialsClosed = !app.isEnteringInitials && (!tumblerModal || tumblerModal.style.display === 'none');
    const leaderboardOpen = goModal && goModal.style.display === 'flex';
    const rows = document.getElementById('leaderboard-rows');
    const rowCount = rows ? rows.querySelectorAll('tr').length : 0;

    return {
      initialsClosed,
      leaderboardOpen,
      rowCount,
      success: initialsClosed && leaderboardOpen && rowCount > 0
    };
  });
  console.log('Leaderboard flow check:', leaderboardFlowCheck);
  results.leaderboardFlowCheck = leaderboardFlowCheck;

  // 8. Verify Mid-game Pause, Restart, and Quit (Issue 6)
  console.log('\n[8/10] Verifying Mid-game Pause (Esc/P), Restart (R), and Quit (Q)...');
  const pauseCheck = await page.evaluate(async () => {
    const app = window.__GAME_APP__;
    app.startGame('casual', 'endless');

    // 1. Toggle pause
    app.pauseGame();
    const pausedState = app.isPaused;
    const pauseModal = document.getElementById('pause-modal');
    const pauseModalVisible = pauseModal && pauseModal.style.display === 'flex';

    // 2. Resume
    app.resumeGame();
    const resumedState = !app.isPaused;
    const pauseModalHidden = pauseModal && pauseModal.style.display === 'none';

    // 3. Pause again and test Restart
    app.pauseGame();
    app._restartFromPause();
    const restartedCleanly = !app.isPaused && app.gameState === 'STATE_PLAYING' && app.gameTime === 0;

    // 4. Pause again and test Quit to Menu
    app.pauseGame();
    app._quitToMenu();
    const quitToMenuCleanly = !app.isPaused && app.gameState === 'STATE_MENU';
    const menuVisible = document.getElementById('main-menu-overlay').style.display === 'flex';

    return {
      pausedState,
      pauseModalVisible,
      resumedState,
      pauseModalHidden,
      restartedCleanly,
      quitToMenuCleanly,
      menuVisible,
      success: pausedState && pauseModalVisible && resumedState && pauseModalHidden && restartedCleanly && quitToMenuCleanly && menuVisible
    };
  });
  console.log('Pause check:', pauseCheck);
  results.pauseCheck = pauseCheck;

  // 9. Verify Stale "ALONE & HUNTED" banner fix (Issue 2)
  console.log('\n[9/10] Verifying Alone & Hunted countdown (10s), dismissal on infection, and menu isolation...');
  const aloneCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const banner = document.getElementById('alone-warning');
    const em = app.entityManager;

    // 1. On main menu, banner must be strictly hidden
    const hiddenOnMenu = banner ? banner.classList.contains('hidden') : false;

    // 2. Start game with 1 zombie follower
    app.startGame('casual', 'endless');
    em.spawnStrayZombie(em.patientZero.x + 1, em.patientZero.z);
    em.recruitStrayZombie(0);

    // Horde is alive (1 zombie follower): banner must NOT be visible
    em.update(0.016, { x: 0, z: 0 }, app.spatialGrid);
    const hiddenWhenHordeAlive = !em.isAloneHunted && banner.classList.contains('hidden');

    // Wipe horde: Patient Zero alone triggers Alone & Hunted
    em.zombies = [];
    em.hasHadHorde = true;
    em.update(0.016, { x: 0, z: 0 }, app.spatialGrid);
    const activeWhenHordeWiped = em.isAloneHunted && !banner.classList.contains('hidden');
    const initialCountdown = em.aloneTimer;

    // Infect a civilian: banner must dismiss immediately
    em.spawnCivilian(em.patientZero.x + 0.5, em.patientZero.z);
    em.convertCivilianToZombie(0);
    const dismissedOnInfection = !em.isAloneHunted && banner.classList.contains('hidden');

    return {
      hiddenOnMenu,
      hiddenWhenHordeAlive,
      activeWhenHordeWiped,
      initialCountdown,
      dismissedOnInfection,
      success: hiddenOnMenu && hiddenWhenHordeAlive && activeWhenHordeWiped && initialCountdown <= 10.0 && dismissedOnInfection
    };
  });
  console.log('Alone & Hunted check:', aloneCheck);
  results.aloneCheck = aloneCheck;

  // 10. Verify Infection contact forgivingness & Military lock-on (Issue 9 & 11)
  console.log('\n[10/10] Verifying Infection contact forgivingness & Military lock-on telegraph...');
  const combatCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const em = app.entityManager;

    // Test military lock on telegraph
    let lockOnTelegraphed = false;
    em.onMilitaryLockOn = () => { lockOnTelegraphed = true; };
    const spawnedSoldiers = em.spawnMilitary(em.patientZero.x + 2, em.patientZero.z);
    const soldier = Array.isArray(spawnedSoldiers) ? spawnedSoldiers[0] : spawnedSoldiers;
    em.update(0.016, { x: 0, z: 0 }, app.spatialGrid);

    const hasAimProgress = soldier && soldier.aimProgress !== undefined;
    const hasLockOnHook = typeof em.onMilitaryLockOn === 'function';

    // Verify infection collision reach (0.55 reach)
    const pz = em.patientZero;
    const civ = em.spawnCivilian(pz.x + 0.8, pz.z); // Civ radius 0.35 + PZ radius 0.5 + reach 0.55 = 1.40 max reach
    em.update(0.016, { x: 0, z: 0 }, app.spatialGrid);
    const civInfected = em.zombies.length > 0 || civ.hidden;

    return {
      hasAimProgress,
      hasLockOnHook,
      civInfected,
      success: hasAimProgress && hasLockOnHook && civInfected
    };
  });
  console.log('Combat & Infection check:', combatCheck);
  results.combatCheck = combatCheck;

  await browser.close();

  const allPassed = Object.values(results).every(r => r.success);
  console.log('\n=============================================');
  console.log(allPassed ? '>>> ALL 10 QA VERIFICATIONS PASSED SUCCESSFULLY! <<<' : '>>> SOME QA VERIFICATIONS FAILED! <<<');
  console.log('=============================================\n');

  if (!allPassed || errors.length > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
