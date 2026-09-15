import { chromium } from 'playwright';
import path from 'path';
import http from 'http';

const ARTIFACT_DIR = '/Users/ngobeli/.gemini/antigravity-ide/brain/acf2d009-8550-4f70-80ee-f1f787d5872f';

function probePort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function getDevServerUrl() {
  for (const p of [5176, 5175, 5174, 5173]) {
    if (await probePort(p)) return `http://localhost:${p}`;
  }
  return 'http://localhost:5173';
}

async function captureSprintFixes() {
  const serverUrl = await getDevServerUrl();
  console.log(`[Capture] Connecting to ${serverUrl}...`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.__GAME_APP__ && window.__GAME_STATE__), null, { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Capture Banked Zombies in Main Menu
  await page.evaluate(() => {
    const app = window.__GAME_APP__;
    localStorage.setItem('zombie_chase_bank', '350');
    app._updateBankedZombiesUI();
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'banked_zombies_persisted.png'),
  });
  console.log('[Capture] Saved banked_zombies_persisted.png');

  // 2. Start game and capture Fortified Quarantine Zone with Hazmat and Military Garrison
  await page.evaluate(() => {
    const app = window.__GAME_APP__;
    app.startGame('outbreak', 'endless');
    const em = app.entityManager;

    // Spawn Quarantine Outpost in front of player
    const zone = em.spawnQuarantineOutpost(em.patientZero.x, em.patientZero.z - 20);

    // Look at zone
    app.cameraController.snapTo({ x: em.patientZero.x, z: em.patientZero.z - 10 });
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'quarantine_garrison_fortress.png'),
  });
  console.log('[Capture] Saved quarantine_garrison_fortress.png');

  // 3. Activate Titan Mode and capture clean colossal Infected without any purple line
  await page.evaluate(() => {
    const app = window.__GAME_APP__;
    const em = app.entityManager;
    em.isTitan = true;
    em.titanVirusTimer = 20.0;
    em.patientZero.isTitan = true;
    em.pzVisualScale = 3.0;

    // Center camera on Titan
    app.cameraController.snapTo(em.patientZero);
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'titan_clean_visual.png'),
  });
  console.log('[Capture] Saved titan_clean_visual.png');

  await browser.close();
  console.log('[Capture] All sprint screenshots captured successfully.');
}

captureSprintFixes().catch(console.error);
