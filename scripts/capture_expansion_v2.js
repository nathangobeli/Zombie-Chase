import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/ngobeli/.gemini/antigravity-ide/brain/acf2d009-8550-4f70-80ee-f1f787d5872f';

async function captureScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  console.log('[Capture] Loading game...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.__GAME_APP__ && window.__GAME_STATE__), null, { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Capture Main Menu with Mode Selector Pills and Mutation Lab button
  await page.evaluate(() => {
    const app = window.__GAME_APP__;
    app.storageSystem.addBankedZombies(125);
    app._updateBankedZombiesUI();
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'game_modes_main_menu.png'),
  });
  console.log('[Capture] Captured game_modes_main_menu.png');

  // 2. Open and Capture Mutation Lab Meta-Progression Modal
  await page.evaluate(() => {
    document.getElementById('btn-menu-lab')?.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'mutation_lab_store_modal.png'),
  });
  console.log('[Capture] Captured mutation_lab_store_modal.png');

  // Close Lab Modal
  await page.evaluate(() => {
    window.__GAME_APP__?._closeLabModal();
  });
  await page.waitForTimeout(300);

  // 3. Start Game, Spawn Safe Zone & Followers, and Capture Safe Zone in Action
  await page.evaluate(() => {
    const app = window.__GAME_APP__;
    app.startGame('outbreak', 'time_attack_2');
    const em = app.entityManager;

    // Spawn 10 followers
    for (let i = 0; i < 10; i++) {
      em.spawnStrayZombie(em.patientZero.x + (i % 3 - 1) * 1.5, em.patientZero.z + Math.floor(i / 3) * 1.5);
    }
    for (let i = em.strayZombies.length - 1; i >= 0; i--) {
      em.recruitStrayZombie(i);
    }

    // Spawn safe zone directly in front of Patient Zero
    em.spawnSafeZone(em.patientZero.x, em.patientZero.z - 3);

    // Position camera nicely
    app.cameraController.snapTo(em.patientZero);
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'safe_zone_refuge_gameplay.png'),
  });
  console.log('[Capture] Captured safe_zone_refuge_gameplay.png');

  // 4. Capture Leaderboard with 🧬 DNA Badge and Mode Tabs
  await page.evaluate(() => {
    const app = window.__GAME_APP__;
    app.storageSystem.addScore({
      initials: 'MUT',
      score: 18500,
      peakHorde: 64,
      timeSurvived: '02:00',
      difficulty: 'outbreak',
      mode: 'time_attack_2',
      enhancementsUsed: true,
    });
    app._openStandaloneLeaderboard();
    // Click Time Attack 2m tab
    const tab = document.querySelector('#standalone-mode-tabs .lead-tab[data-mode="time_attack_2"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'leaderboard_enhancement_partition.png'),
  });
  console.log('[Capture] Captured leaderboard_enhancement_partition.png');

  await browser.close();
  console.log('[Capture] All screenshots captured successfully.');
}

captureScreenshots().catch(console.error);
