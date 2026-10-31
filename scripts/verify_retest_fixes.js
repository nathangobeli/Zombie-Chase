import { chromium } from 'playwright';

async function runRetestVerification() {
  console.log('--- STARTING RETEST FIXES VERIFICATION ---');

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

  // 1. Verify Mode Selection Plumbing: ENDLESS selection -> Start -> Pause menu reads ENDLESS
  console.log('\n[1/4] Verifying ENDLESS mode selection plumbing and pause menu badge...');
  const endlessCheck = await page.evaluate(() => {
    const endlessPill = document.querySelector('.mode-pill[data-mode="endless"]');
    if (endlessPill) endlessPill.click();

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.click();

    const app = window.__GAME_APP__;
    app.pauseGame();

    const pauseModeBadge = document.getElementById('pause-mode-badge');
    const hudTimeAttack = document.getElementById('hud-time-attack');

    const badgeText = pauseModeBadge ? pauseModeBadge.textContent : '';
    const isEndless = badgeText.trim() === 'ENDLESS';
    const isEngineEndless = app.activeGameMode === 'endless';
    const isTimerHidden = hudTimeAttack ? hudTimeAttack.classList.contains('hidden') : false;

    // Quit back to menu
    app._quitToMenu();

    return {
      badgeText,
      isEndless,
      isEngineEndless,
      isTimerHidden,
      success: isEndless && isEngineEndless && isTimerHidden
    };
  });
  console.log('Endless mode check:', endlessCheck);
  results.endlessCheck = endlessCheck;

  // 2. Verify Mode Selection Plumbing: TIME ATTACK (2 MIN) selection -> Start -> live timer visible + pause badge reads TIME ATTACK: 2 MIN
  console.log('\n[2/4] Verifying TIME ATTACK mode selection plumbing, live timer, and pause badge...');
  await page.evaluate(() => {
    const timeAttackPill = document.querySelector('.mode-pill[data-mode="time_attack_2"]');
    if (timeAttackPill) timeAttackPill.click();

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.click();
  });

  // Let active loop tick for 1.5 seconds in browser
  await page.waitForTimeout(1500);

  const timeAttackCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const hudTimeAttack = document.getElementById('hud-time-attack');
    const hudVal = document.getElementById('hud-time-attack-val');

    const timerVisibleOnStart = hudTimeAttack && !hudTimeAttack.classList.contains('hidden');
    const currentTimerVal = hudVal ? hudVal.textContent : '';
    const countingDown = app.timeAttackTimer < 120;

    // Pause and check readout
    app.pauseGame();
    const pauseModeBadge = document.getElementById('pause-mode-badge');
    const badgeText = pauseModeBadge ? pauseModeBadge.textContent : '';
    const isTimeAttackBadge = badgeText.trim() === 'TIME ATTACK: 2 MIN';

    // Quit back to menu
    app._quitToMenu();

    return {
      timerVisibleOnStart,
      countingDown,
      currentTimerVal,
      badgeText,
      isTimeAttackBadge,
      success: timerVisibleOnStart && countingDown && isTimeAttackBadge
    };
  });
  console.log('Time Attack mode check:', timeAttackCheck);
  results.timeAttackCheck = timeAttackCheck;

  // 3. Verify Banner Teardown on Quit to Menu (no leaked 30% panic or stage banner)
  console.log('\n[3/4] Verifying banner teardown on quit-to-menu (toast banner, stage banner, alone warning)...');
  const bannerTeardownCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    app.startGame('outbreak', 'endless');

    // Trigger panic toast banner
    app.entityManager.onPanicEscalation('🚨 30% PANIC: RIOT VEHICLES DISPATCHED WITH 360° MIST!');
    app._showStageBanner('STAGE 2: ESCALATION');

    const toastEl = document.getElementById('toast-banner');
    const stageEl = document.getElementById('stage-banner');

    const toastVisibleBefore = toastEl && toastEl.classList.contains('show');
    const stageVisibleBefore = stageEl && stageEl.classList.contains('stage-banner-active');

    // Quit to menu
    app._quitToMenu();

    const toastVisibleAfter = toastEl && toastEl.classList.contains('show');
    const stageVisibleAfter = stageEl && stageEl.classList.contains('stage-banner-active');
    const toastDisplayAfter = toastEl ? toastEl.style.display : '';
    const stageHiddenAfter = stageEl ? stageEl.classList.contains('hidden') : true;

    return {
      toastVisibleBefore,
      stageVisibleBefore,
      toastVisibleAfter,
      stageVisibleAfter,
      toastDisplayAfter,
      stageHiddenAfter,
      success: toastVisibleBefore && stageVisibleBefore && !toastVisibleAfter && !stageVisibleAfter && stageHiddenAfter
    };
  });
  console.log('Banner teardown check:', bannerTeardownCheck);
  results.bannerTeardownCheck = bannerTeardownCheck;

  // 4. Verify Mystery NPC (Warden) visual identity & Rules entries
  console.log('\n[4/4] Verifying Warden visual identity (overhead badge), Rules entries, and Pause Legend...');
  const visualIdentityCheck = await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const renderer3D = app.renderer3D;

    // Check overhead badge sprites exist in renderer3D
    const hasWardenBadges = renderer3D.wardenBadgeSprites && renderer3D.wardenBadgeSprites.length > 0;

    // Check rules modal contents
    const rulesModal = document.getElementById('rules-modal');
    const rulesText = rulesModal ? rulesModal.textContent : '';
    const hasWardenRule = rulesText.includes('MEGAPHONE WARDEN') && rulesText.includes('CHASE AND INFECT THEM');
    const hasCombatRingsRule = rulesText.includes('COMBAT RINGS') && rulesText.includes('Red Lock-On Reticle');

    // Check pause legend
    const pauseLegend = document.querySelector('.pause-legend');
    const hasPauseLegend = !!pauseLegend;

    return {
      hasWardenBadges,
      hasWardenRule,
      hasCombatRingsRule,
      hasPauseLegend,
      success: hasWardenBadges && hasWardenRule && hasCombatRingsRule && hasPauseLegend
    };
  });
  console.log('Visual identity & rules check:', visualIdentityCheck);
  results.visualIdentityCheck = visualIdentityCheck;

  await browser.close();

  const allPassed = Object.values(results).every(r => r.success);
  console.log('\n=============================================');
  if (allPassed && errors.length === 0) {
    console.log('>>> ALL RETEST CHECKS PASSED PERFECTLY! <<<');
    console.log('=============================================');
    process.exit(0);
  } else {
    console.error('>>> SOME CHECKS FAILED! <<<', { results, errors });
    console.log('=============================================');
    process.exit(1);
  }
}

runRetestVerification().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
