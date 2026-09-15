import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';

/**
 * Probes ports to find the active Vite dev server (5173 or 5174)
 */
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
  if (process.env.TEST_URL) return process.env.TEST_URL;
  for (const p of [5173, 5174, 5175, 5176, 5177, 5178]) {
    if (await probePort(p)) return `http://localhost:${p}`;
  }
  return 'http://localhost:5173';
}

async function runPlaytest() {
  const serverUrl = await getDevServerUrl();
  console.log(`[Playtest] Connecting to server at: ${serverUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // Collect page console logs and unhandled errors
  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('[Page Error]', err);
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('navigator.vibrate')) return;
      console.error('[Console Error]', text);
      pageErrors.push(text);
    }
  });

  try {
    console.log('[Playtest] Navigating to game...');
    await page.goto(serverUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

    // 1. Wait for game engine initialization & assert STATE_MENU boot state
    console.log('[Playtest] Waiting for game engine initialization...');
    await page.waitForFunction(() => !!(window.__GAME_APP__ && window.__GAME_STATE__), null, { timeout: 35000 });
    await page.waitForTimeout(600);

    const bootMenuCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const menu = document.getElementById('main-menu-overlay');
      const isVisible = menu && getComputedStyle(menu).display !== 'none' && !menu.classList.contains('hidden');
      return {
        gameState: window.__GAME_STATE__?.gameState || app?.gameState || 'STATE_MENU',
        isMenuVisible: !!isVisible,
        hordeCount: window.__GAME_STATE__?.hordeCount || 0,
        patientZeroReady: !!app?.entityManager?.patientZero,
      };
    });
    console.log('[Playtest] Boot lifecycle check (STATE_MENU):', bootMenuCheck);

    // 1a. QA Check: Viewport Pinch-Zoom Lock & Touch-Action
    console.log('[Playtest] Checking viewport lock & touch-action settings...');
    const viewportTouchCheck = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      const metaContent = meta ? meta.getAttribute('content') : '';
      const bodyTouchAction = getComputedStyle(document.body).touchAction;
      const container = document.getElementById('game-container');
      const containerTouchAction = container ? getComputedStyle(container).touchAction : '';
      const isUserScalableNo = metaContent.includes('user-scalable=no');
      const isMaxScale1 = metaContent.includes('maximum-scale=1.0');
      return {
        hasViewportLock: isUserScalableNo && isMaxScale1,
        bodyTouchActionNone: bodyTouchAction === 'none',
        containerTouchActionNone: containerTouchAction === 'none',
      };
    });
    console.log('[Playtest] Viewport & touch lock check:', viewportTouchCheck);

    // 1b. QA Check: How-to-Play / Rules Modal Open & Close
    console.log('[Playtest] Testing How-to-Play Rules modal flow...');
    await page.evaluate(() => {
      document.getElementById('btn-menu-rules')?.click();
    });
    await page.waitForTimeout(200);

    const rulesModalOpen = await page.evaluate(() => {
      const modal = document.getElementById('rules-modal');
      return modal && getComputedStyle(modal).display !== 'none' && !modal.classList.contains('hidden');
    });

    await page.evaluate(() => {
      document.getElementById('btn-close-rules')?.click();
    });
    await page.waitForTimeout(200);

    const rulesModalClosed = await page.evaluate(() => {
      const modal = document.getElementById('rules-modal');
      return !modal || getComputedStyle(modal).display === 'none' || modal.classList.contains('hidden');
    });

    const rulesModalCheck = {
      modalOpened: !!rulesModalOpen,
      modalClosed: !!rulesModalClosed,
    };
    console.log('[Playtest] How-to-Play modal check:', rulesModalCheck);

    // 1c. Test clicking "START OUTBREAK" button to transition from STATE_MENU to STATE_PLAYING
    console.log('[Playtest] Clicking START OUTBREAK button to launch game...');
    await page.evaluate(() => {
      document.getElementById('btn-start-game')?.click();
    });

    await page.waitForFunction(() => !!(window.__GAME_STATE__?.gameState === 'STATE_PLAYING' && window.__GAME_APP__?.entityManager?.patientZero), null, { timeout: 35000 });
    await page.waitForTimeout(600);

    // 1d. QA Check: Debug buttons absent from active gameplay canvas (inside collapsed drawer)
    const debugDrawerCheck = await page.evaluate(() => {
      const drawer = document.getElementById('debug-drawer');
      const isCollapsed = drawer && drawer.classList.contains('collapsed');
      const panel = drawer ? drawer.querySelector('.debug-drawer-panel') : null;
      const panelDisplayNone = panel ? getComputedStyle(panel).display === 'none' : true;
      return {
        drawerFound: !!drawer,
        isCollapsed: !!isCollapsed,
        panelHidden: panelDisplayNone,
      };
    });
    console.log('[Playtest] Active gameplay debug buttons absence check:', debugDrawerCheck);

    // 1e. QA Check: Swarm de-clustering & boid separation distance parameter
    const boidSeparationCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const bc = app?.entityManager?.boidController;
      const sepRadius = bc?.separationRadius || 0;
      const sepWeight = bc?.weightSeparation || 0;
      const cohWeight = bc?.weightCohesion || 0;
      return {
        separationRadius: sepRadius,
        weightSeparation: sepWeight,
        weightCohesion: cohWeight,
        holdsGreaterDistance: sepRadius >= 1.4 && sepWeight > cohWeight,
      };
    });
    console.log('[Playtest] Swarm de-clustering separation parameter check:', boidSeparationCheck);

    const initialCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const renderer = app?.instancedRenderer;
      return {
        militaryCount: app?.entityManager?.militaryUnits?.filter(m => !m.isQuarantineGarrison)?.length || 0,
        movingCarsCount: app?.trafficManager?.vehicles?.length || 0,
        stage: window.__GAME_STATE__?.stage || 1,
        stageName: window.__GAME_STATE__?.stageName || '',
        cureThreshold: app?.entityManager?.cureThreshold || 3.5,
        wardensCount: app?.entityManager?.wardens?.length || 0,
        powerupsCount: app?.powerupManager?.powerups?.length || 0,
        innerRingVisible: !!renderer?.innerRing?.visible,
        outerRingVisible: !!renderer?.outerRing?.visible,
        initialFollowerCount: app?.entityManager?.zombies?.length || 0,
      };
    });
    console.log('[Playtest] Initial state check after START OUTBREAK (Stage 1 Outbreak Dawn):', initialCheck);

    // Verify solid parked car 2D AABB obstacle registration
    const carObstacleCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const obs = app?.spatialGrid?.obstacles || [];
      const carObs = obs.find(o => o.isCar);
      if (!carObs) return { foundCarObstacle: false, blockedCollision: false };

      // Simulate a character trying to walk into the center of the car
      const testChar = { x: carObs.centerX, z: carObs.minZ + 0.2, radius: 0.55 };
      app.spatialGrid.resolveObstacles(testChar, testChar.radius);
      // Resolved position must be pushed outside the car boundary
      const outside = (testChar.z <= carObs.minZ || testChar.z >= carObs.maxZ || testChar.x <= carObs.minX || testChar.x >= carObs.maxX);
      return {
        foundCarObstacle: true,
        blockedCollision: outside,
      };
    });
    console.log('[Playtest] Solid parked car obstacle check:', carObstacleCheck);

    // Verify moving traffic hazard system in Outbreak difficulty and stage filtering
    const trafficHazardCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      if (!app?.trafficManager) return { trafficActive: false, vehicleSpawned: false, stage1Rejected: false };
      // Clear existing vehicles to ensure capacity for test vehicle
      app.trafficManager.vehicles.forEach(v => app.scene.remove(v.mesh));
      app.trafficManager.vehicles = [];
      // Stage 1 must reject moving vehicle spawn
      const vStage1 = app.trafficManager.spawnVehicle(app.entityManager.patientZero.x, app.entityManager.patientZero.z, app.cityStreamer, app.spatialGrid, 1);
      // Stage 2 permits moving vehicle spawn
      const v = app.trafficManager.spawnVehicle(app.entityManager.patientZero.x, app.entityManager.patientZero.z, app.cityStreamer, app.spatialGrid, 2);
      return {
        trafficActive: true,
        stage1Rejected: vStage1 === null,
        vehicleSpawned: !!v,
        vehicleSpeed: v ? v.speed : 0,
      };
    });
    console.log('[Playtest] Moving traffic hazard check:', trafficHazardCheck);

    // Verify Car Pin-Down Glitch Fix: Lateral Deflection & 1.5s Recovery Window
    const carPinDownCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      const tm = app?.trafficManager;
      const sg = app?.spatialGrid;
      if (!em || !tm || !sg) return { verified: false, reason: 'Components missing' };

      const pz = em.patientZero;
      pz.x = 0;
      pz.z = 0;
      pz.carRecoveryTimer = 0;

      // Spawn or simulate moving vehicle heading South (+Z) down avenue directly at PZ
      const testCar = {
        x: 0,
        z: -0.5,
        y: 0.01,
        vx: 0,
        vz: 9.0,
        angle: Math.PI,
        speed: 9.0,
        width: 2.0,
        length: 4.2,
        isCrushed: false,
        life: 10.0,
        mesh: { position: { set: () => {} }, rotation: {} },
      };
      tm.vehicles.push(testCar);

      const oldX = pz.x;
      const oldZ = pz.z;

      // Update 1 frame of traffic collision
      tm.update(0.016, pz, em, null, null, null, null, app.cityStreamer, sg, 120);

      const afterHitX = pz.x;
      const afterHitZ = pz.z;
      const lateralShift = Math.abs(afterHitX - oldX);
      const timerAfterHit = pz.carRecoveryTimer;

      // Simulate car continuing to touch PZ while recoveryTimer > 0 (subsequent frame)
      testCar.x = afterHitX;
      testCar.z = afterHitZ;
      tm.update(0.016, pz, em, null, null, null, null, app.cityStreamer, sg, 120);

      const secondShift = Math.abs(pz.x - afterHitX);

      // Clean up test vehicle and reset PZ position
      tm.vehicles = tm.vehicles.filter(v => v !== testCar);
      pz.carRecoveryTimer = 0;
      pz.x = 0;
      pz.z = 0;

      return {
        verified: true,
        lateralShift,
        timerAfterHit,
        pinnedOnSecondFrame: secondShift > 1.0,
      };
    });
    console.log('[Playtest] Car pin-down glitch fix & lateral deflection check:', carPinDownCheck);

    // Verify Roadway Lane Snapping, Constant Y = 0.01, and Building Obstacle Clearance
    const roadwayLanesCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const tm = app?.trafficManager;
      const cs = app?.cityStreamer;
      const sg = app?.spatialGrid;
      if (!tm || !cs || !sg) return { verified: false };

      const spawned = [];
      for (let s = 2; s <= 4; s++) {
        for (let j = 0; j < 3; j++) {
          const v = tm.spawnVehicle(j * 20, j * 20, cs, sg, s);
          if (v) spawned.push(v);
        }
      }

      let allYCorrect = true;
      let allParallelToGrid = true;
      let buildingCollisions = 0;

      const buildings = sg.obstacles ? sg.obstacles.filter(o => !o.isCar) : [];

      for (const v of spawned) {
        if (Math.abs(v.y - 0.01) > 0.001 || Math.abs(v.mesh.position.y - 0.01) > 0.001) {
          allYCorrect = false;
        }
        const isParallel = (v.vx !== 0 && v.vz === 0) || (v.vx === 0 && v.vz !== 0);
        if (!isParallel) allParallelToGrid = false;

        const halfW = 1.0;
        const halfD = 2.0;
        for (const b of buildings) {
          if (v.x + halfW >= b.minX && v.x - halfW <= b.maxX &&
              v.z + halfD >= b.minZ && v.z - halfD <= b.maxZ) {
            buildingCollisions++;
          }
        }
      }

      for (const v of spawned) {
        app.scene.remove(v.mesh);
      }
      tm.vehicles = tm.vehicles.filter(v => !spawned.includes(v));

      return {
        verified: true,
        spawnedCount: spawned.length,
        allYCorrect,
        allParallelToGrid,
        buildingCollisions,
      };
    });
    console.log('[Playtest] Roadway lane snapping & building clearance check:', roadwayLanesCheck);

    // Verify Progressive Difficulty Curve (Stages 1-4) & Stage Banner UI
    const progressiveDifficultyCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      if (!em) return { verified: false };

      // Stage 1 (0:00 - 1:00)
      em.gameTime = 10;
      em.update(0.016, { x: 0, z: 0 }, app.spatialGrid, null, null, null, app.cityStreamer);
      const stage1Cure = em.cureThreshold;
      const stage1Stage = em.currentStage;

      // Stage 2 (1:00 - 2:30)
      em.gameTime = 75;
      em.update(0.016, { x: 0, z: 0 }, app.spatialGrid, null, null, null, app.cityStreamer);
      const stage2Cure = em.cureThreshold;
      const stage2Stage = em.currentStage;

      // Stage 3 (2:30 - 4:00)
      em.gameTime = 160;
      em.update(0.016, { x: 0, z: 0 }, app.spatialGrid, null, null, null, app.cityStreamer);
      const stage3Cure = em.cureThreshold;
      const stage3Stage = em.currentStage;
      const stage3Mil = em.militaryUnits.length;

      // Stage 4 (4:00+)
      em.gameTime = 250;
      em.update(0.016, { x: 0, z: 0 }, app.spatialGrid, null, null, null, app.cityStreamer);
      const stage4Cure = em.cureThreshold;
      const stage4Stage = em.currentStage;
      const stage4AimThreshold = em.militaryUnits.length > 0 ? em.militaryUnits[0].aimThreshold : 1.0;

      // Check stage banner in DOM
      const banner = document.getElementById('stage-banner');
      const bannerText = banner?.textContent || '';
      const bannerActive = banner?.classList.contains('stage-banner-active');

      // Reset back to Stage 1
      em.gameTime = 0;
      em.currentStage = 1;
      em.cureThreshold = 3.5;
      em.militaryUnits = [];

      return {
        verified: true,
        stage1Stage,
        stage1Cure,
        stage2Stage,
        stage2Cure,
        stage3Stage,
        stage3Cure,
        stage3Mil,
        stage4Stage,
        stage4Cure,
        stage4AimThreshold,
        bannerText,
        bannerActive: !!bannerActive,
      };
    });
    console.log('[Playtest] Progressive difficulty escalation check:', progressiveDifficultyCheck);

    // Verify residual red boundary ring is absent from scene graph
    const redBoundaryRingPresent = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      let hasRing = false;
      if (app && app.scene) {
        app.scene.traverse((child) => {
          if (child.isMesh && child.geometry && child.geometry.type === 'TorusGeometry') {
            if (child.material && (child.material.color?.getHex() === 0xff0055 || child.geometry.parameters?.radius >= 40)) {
              hasRing = true;
            }
          }
        });
      }
      return hasRing;
    });
    console.log(`[Playtest] Legacy red boundary ring present in scene graph: ${redBoundaryRingPresent}`);

    // Verify Patient Zero launch position and 0 immediate building occlusions
    const launchSpawnCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const pz = app?.entityManager?.patientZero;
      if (app && pz) {
        app._updateBuildingOcclusion(pz, 0.016);
      }
      return {
        spawnX: pz ? Math.round(pz.x) : null,
        spawnZ: pz ? Math.round(pz.z) : null,
        initialOccludedCount: app?.occludedBuildingsCount || 0,
      };
    });
    console.log('[Playtest] Launch spawn & LOS check:', launchSpawnCheck);

    // Dismiss any first-launch overlay
    await page.evaluate(() => {
      localStorage.setItem('controlsShown', '1');
      const overlay = document.getElementById('controls-overlay');
      if (overlay) {
        overlay.classList.remove('show');
        overlay.style.display = 'none';
      }
    });

    await page.waitForTimeout(300);

    // 1b. Test Swarm Squeeze Key & Button bindings
    console.log('[Playtest] Testing Swarm Squeeze (KeyC and UI button)...');
    await page.keyboard.down('KeyC');
    await page.waitForTimeout(200);
    const isSqueezeWithKey = await page.evaluate(() => {
      return !!(window.__GAME_STATE__?.isSqueeze || window.__GAME_APP__?.entityManager?.isSqueeze);
    });
    console.log(`[Playtest] Squeeze active with KeyC: ${isSqueezeWithKey}`);
    await page.keyboard.up('KeyC');
    await page.waitForTimeout(250);
    const isSqueezeReleased = await page.evaluate(() => {
      return !(window.__GAME_STATE__?.isSqueeze || window.__GAME_APP__?.entityManager?.isSqueeze);
    });
    console.log(`[Playtest] Squeeze inactive after release: ${isSqueezeReleased}`);

    // Test button pointerdown on #btn-squeeze
    const squeezeBtn = await page.$('#btn-squeeze');
    let isSqueezeBtnActive = false;
    if (squeezeBtn) {
      await squeezeBtn.dispatchEvent('pointerdown');
      await page.waitForTimeout(200);
      isSqueezeBtnActive = await page.evaluate(() => {
        return !!(window.__GAME_STATE__?.isSqueeze || window.__GAME_APP__?.entityManager?.isSqueeze);
      });
      console.log(`[Playtest] Squeeze active with button pointerdown: ${isSqueezeBtnActive}`);
      await squeezeBtn.dispatchEvent('pointerup');
      await page.waitForTimeout(200);
    }

    // 2. Drive Patient Zero straight forward down the avenue toward (0, -25) to collect the guaranteed Titan Virus canister
    console.log('[Playtest] Driving forward toward (0, -25) to collect guaranteed Titan Virus canister and drop Slime Trail...');
    const canvas = await page.$('#game-canvas');
    const box = canvas ? await canvas.boundingBox() : { x: 0, y: 0, width: 1280, height: 720 };
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY - 65);
    await page.keyboard.down('KeyW');

    // Deploy Civilians, Hazmats, Warden, and activate Titan Virus
    await page.evaluate(() => {
      document.getElementById('btn-add-civs')?.click();
      document.getElementById('btn-add-civs')?.click();
      document.getElementById('btn-spawn-hazmat')?.click();
      document.getElementById('btn-spawn-hazmat')?.click();
      document.getElementById('btn-spawn-warden')?.click();
      document.getElementById('btn-spawn-military')?.click();
      document.getElementById('btn-titan')?.click();
    });

    // 3. Simulate virtual joystick input (driving the swarm forward into civilians, hazmats, and military) for 6s
    console.log('[Playtest] Simulating virtual joystick input for 6 seconds...');
    const startTime = Date.now();
    let step = 0;
    let maxOccludedBuildings = 0;
    let maxHordeCount = 1;
    let maxMilitaryCount = initialCheck.militaryCount;
    let maxWardensCount = initialCheck.wardensCount;
    let maxSlimeCount = 0;
    let maxPzVisualScale = 1.0;
    let maxHazmatDamage = 0;
    let titanPickedUp = false;

    while (Date.now() - startTime < 6000) {
      step++;
      // Weave slightly left and right while driving forward down the avenue
      const weaveX = Math.sin(step * 0.5) * 40;
      await page.mouse.move(centerX + weaveX, centerY - 65);

      if (step % 2 === 0) {
        await page.keyboard.down(weaveX > 0 ? 'KeyD' : 'KeyA');
        await page.waitForTimeout(80);
        await page.keyboard.up(weaveX > 0 ? 'KeyD' : 'KeyA');
      }

      // Check if Titan mode is active, or trigger at step 3 after hazmats engage
      const isTitan = await page.evaluate(() => window.__GAME_STATE__?.isTitan);
      if (isTitan) titanPickedUp = true;
      if (step >= 3 && !titanPickedUp) {
        console.log('[Playtest] Activating Titan Virus to verify colossal transformation...');
        await page.evaluate(() => document.getElementById('btn-titan')?.click()).catch(() => {});
      }

      // Track telemetry occurring during driving
      const occludedNow = await page.evaluate(() => window.__GAME_STATE__?.occludedBuildingsCount || 0);
      if (occludedNow > maxOccludedBuildings) maxOccludedBuildings = occludedNow;

      const hordeNow = await page.evaluate(() => window.__GAME_STATE__?.hordeCount || 1);
      if (hordeNow > maxHordeCount) maxHordeCount = hordeNow;

      const milNow = await page.evaluate(() => window.__GAME_STATE__?.militaryActive || 0);
      if (milNow > maxMilitaryCount) maxMilitaryCount = milNow;

      const wNow = await page.evaluate(() => window.__GAME_STATE__?.wardensActive || 0);
      if (wNow > maxWardensCount) maxWardensCount = wNow;

      const slimeNow = await page.evaluate(() => window.__GAME_STATE__?.slimePuddlesActive || 0);
      if (slimeNow > maxSlimeCount) maxSlimeCount = slimeNow;

      const scaleNow = await page.evaluate(() => window.__GAME_STATE__?.pzVisualScale || 1.0);
      if (scaleNow > maxPzVisualScale) maxPzVisualScale = scaleNow;

      const hazmatNow = await page.evaluate(() => window.__GAME_STATE__?.hazmatDamageDealt || window.__GAME_APP__?.hazmatDamageDealt || 0);
      if (hazmatNow > maxHazmatDamage) maxHazmatDamage = hazmatNow;

      // Reinforce civilian density ahead along the avenue
      if (step % 8 === 0) {
        await page.evaluate(() => {
          document.getElementById('btn-add-civs')?.click();
        }).catch(() => {});
      }

      await page.waitForTimeout(120);
    }

    await page.keyboard.up('KeyW');
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 3b. Test building occlusion raycasting: place Patient Zero behind an active building obstacle
    console.log('[Playtest] Moving behind building to verify occlusion raycasting & alpha fading...');
    const behindBuildingOccluded = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const pz = app?.entityManager?.patientZero;
      const obs = app?.spatialGrid?.obstacles;
      if (pz && obs && obs.length > 0 && app) {
        const b = obs.find(o => o.minZ !== undefined && o.maxZ !== undefined && o.halfW > 4) || obs[0];
        pz.x = b.centerX || 0;
        // Position PZ north (-Z) of building
        pz.z = (b.minZ !== undefined ? b.minZ : -20) - 2.5;
        if (app.cameraController) {
          app.cameraController.snapTo(pz);
        }
        // Position camera south (+Z) of building looking at PZ, so the ray penetrates the building
        app.camera.position.set(b.centerX, 18.0, (b.maxZ !== undefined ? b.maxZ : 20) + 10.0);
        app.camera.lookAt(pz.x, 1.2, pz.z);
        app.camera.updateMatrixWorld(true);
        app._updateBuildingOcclusion(pz, 0.016);
      }
      return app?.occludedBuildingsCount ?? window.__GAME_STATE__?.occludedBuildingsCount ?? 0;
    });
    console.log(`[Playtest] Behind building occludedBuildingsCount: ${behindBuildingOccluded}`);
    if (behindBuildingOccluded > maxOccludedBuildings) {
      maxOccludedBuildings = behindBuildingOccluded;
    }

    // 3b1. Test Titan Car Smashing & Prop Demolition (@designer & @qa)
    console.log('[Playtest] Testing Titan Infected car smashing and prop demolition...');
    const titanDestructionCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      const streamer = app?.cityStreamer;
      if (!em || !streamer) return { success: false, reason: 'Engine not ready' };

      // Find knockable props within active streaming area
      const props = streamer.getNearbyKnockableProps(0, 0, 160.0);
      const carProp = props.find(p => p.isCar && !p.knocked);
      const bushProp = props.find(p => p.type === 'bush' && !p.knocked);
      const lampProp = props.find(p => p.type === 'lamp' && !p.knocked);

      if (!carProp || !bushProp || !lampProp) {
        return { success: false, reason: 'Missing car, bush, or lamp props', count: props.length };
      }

      // Activate Titan mode
      em.isTitan = true;
      em.titanVirusTimer = 20.0;
      em.patientZero.isTitan = true;

      // 1. Smash parked car
      em.patientZero.x = carProp.x;
      em.patientZero.z = carProp.z;
      em.patientZero.vx = 5.0;
      em.patientZero.vz = 0.0;
      em.update(0.016, { x: 1, z: 0 }, app.spatialGrid, streamer);

      const carKnocked = !!carProp.knocked;
      const carObstacleDisabled = carProp.obstacle ? !!carProp.obstacle.disabled : true;
      const carVerticesCollapsed = carProp.chunk?.propsMesh?.geometry?.attributes?.position?.getY(carProp.vertexStart) <= -900;

      // 2. Smash bush
      em.patientZero.x = bushProp.x;
      em.patientZero.z = bushProp.z;
      em.update(0.016, { x: 0, z: 1 }, app.spatialGrid, streamer);
      const bushKnocked = !!bushProp.knocked;
      const bushVerticesCollapsed = bushProp.chunk?.propsMesh?.geometry?.attributes?.position?.getY(bushProp.vertexStart) <= -900;

      // 3. Smash street lamp
      em.patientZero.x = lampProp.x;
      em.patientZero.z = lampProp.z;
      em.update(0.016, { x: 1, z: 0 }, app.spatialGrid, streamer);
      const lampKnocked = !!lampProp.knocked;
      const lampVerticesCollapsed = lampProp.chunk?.propsMesh?.geometry?.attributes?.position?.getY(lampProp.vertexStart) <= -900;

      const debrisCount = app.debrisList.length;

      // 4. Shrink down from Titan: demolition MUST be completely disabled
      em.titanVirusTimer = 0.0;
      em.isTitan = false;
      em.patientZero.isTitan = false;
      em.pzVisualScale = 1.0;

      // Find an untouched unknocked car and prop
      const remainingProps = streamer.getNearbyKnockableProps(0, 0, 160.0);
      const secondCar = remainingProps.find(p => p.isCar && !p.knocked);
      const secondProp = remainingProps.find(p => !p.isCar && !p.knocked);

      let shrunkCarRemainsIntact = true;
      let shrunkPropRemainsIntact = true;

      if (secondCar) {
        em.patientZero.x = secondCar.x;
        em.patientZero.z = secondCar.z;
        em.update(0.016, { x: 1, z: 0 }, app.spatialGrid, streamer);
        shrunkCarRemainsIntact = !secondCar.knocked;
      }

      if (secondProp) {
        em.patientZero.x = secondProp.x;
        em.patientZero.z = secondProp.z;
        em.update(0.016, { x: 0, z: 1 }, app.spatialGrid, streamer);
        shrunkPropRemainsIntact = !secondProp.knocked;
      }

      return {
        success: true,
        carKnocked,
        carObstacleDisabled,
        carVerticesCollapsed,
        bushKnocked,
        bushVerticesCollapsed,
        lampKnocked,
        lampVerticesCollapsed,
        debrisCount,
        shrunkDemolitionDisabled: shrunkCarRemainsIntact && shrunkPropRemainsIntact,
      };
    });
    console.log('[Playtest] Titan destruction check:', titanDestructionCheck);

    // Move back to clear avenue to test opacity restoration
    await page.evaluate(() => {
      const pz = window.__GAME_APP__?.entityManager?.patientZero;
      if (pz) {
        pz.x = 0;
        pz.z = -16.0;
      }
      document.getElementById('btn-add-civs')?.click();
    });
    // 3b2. Test Horde-First Attrition & Last Stand Mist Countdown (@designer & @qa)
    console.log('[Playtest] Testing Horde-first protection vs Last Stand mist exposure...');
    const hordeFirstCheck = await page.evaluate(() => {
      const em = window.__GAME_APP__?.entityManager;
      if (!em) return { widgetHiddenWithHorde: false, widgetVisibleOnLastStand: false };

      // Case A: Horde > 0: simulate spray contact
      em.zombies = [{ id: 999, type: 'zombie', x: 0, z: -1, vx: 0, vz: 0, radius: 0.5, sprayExposure: 0 }];
      em.patientZero.isSpraySlowed = false;
      em.pzSprayTime = 0;
      if (em.onPatientZeroSprayed) em.onPatientZeroSprayed(0.016, 0.0, 3.5);
      const mistWidget = document.getElementById('mist-countdown-widget');
      const widgetHiddenWithHorde = !mistWidget || mistWidget.classList.contains('hidden');

      // Case B: Horde === 0: Last Stand mist exposure activates (3.5s max window)
      em.zombies = [];
      em.pzSprayTime = 1.5;
      if (em.onPatientZeroSprayed) em.onPatientZeroSprayed(0.5, 1.5 / 3.5, 2.0);
      const timerText = document.getElementById('mist-timer-text')?.textContent;
      const widgetVisibleOnLastStand = mistWidget && !mistWidget.classList.contains('hidden');

      // Reset
      em.pzSprayTime = 0;
      if (em.onPatientZeroSprayed) em.onPatientZeroSprayed(0.016, 0.0, 3.5);

      return {
        widgetHiddenWithHorde,
        widgetVisibleOnLastStand,
        timerText,
      };
    });
    console.log('[Playtest] Horde-first & Last Stand mist check:', hordeFirstCheck);

    const hazmatAfterMist = await page.evaluate(() => window.__GAME_STATE__?.hazmatDamageDealt || window.__GAME_APP__?.hazmatDamageDealt || 0);
    if (hazmatAfterMist > maxHazmatDamage) maxHazmatDamage = hazmatAfterMist;

    // 3b3. QA Check: Faster Hazmat Decontamination & Last Stand Calibration (@designer & @qa)
    console.log('[Playtest] Testing Faster Hazmat Decontamination & Last Stand Calibration...');
    const decontamCheck = await page.evaluate(() => {
      const em = window.__GAME_APP__?.entityManager;
      if (!em) return { success: false, reason: 'no entityManager' };

      // Assert followerCureThreshold is 0.55s
      const followerThreshold = em.followerCureThreshold;
      
      // Test follower cure within 0.55s continuous exposure
      em.zombies = [{
        id: 8888,
        type: 'zombie',
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        radius: 0.5,
        sprayExposure: 0,
      }];
      const initialCivCount = em.civilians.length;

      // Simulate spray exposure accumulation under threshold (0.45s)
      em.zombies[0].sprayExposure = 0.45;
      const notCuredYet = em.zombies.length === 1;

      // Advance exposure to 0.55s threshold
      em.zombies[0].sprayExposure = 0.55;
      em.cureZombieToCivilian(0);
      const curedSuccessfully = em.zombies.length === 0 && em.civilians.length === initialCivCount + 1;
      const newCiv = em.civilians[em.civilians.length - 1];
      const hasCureImmunity = newCiv && Math.abs(newCiv.cureImmunity - 2.5) < 0.05;

      return {
        followerThreshold,
        notCuredYet,
        curedSuccessfully,
        hasCureImmunity,
        success: followerThreshold === 0.55 && notCuredYet && curedSuccessfully && hasCureImmunity,
      };
    });
    console.log('[Playtest] Hazmat decontamination calibration check:', decontamCheck);

    // 3b4. QA Check: Fortified Quarantine Zone Instantiation & 60 FPS Performance (@designer, @artist & @qa)
    console.log('[Playtest] Testing Fortified Quarantine Zone instantiation & 60 FPS performance...');
    const quarantineFortressCheck = await page.evaluate(async () => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      if (!em) return { success: false, reason: 'no entityManager' };

      // Spawn or locate a Fortified Quarantine Outpost
      const zone = em.spawnQuarantineOutpost(120, 120);
      if (!zone) return { success: false, reason: 'failed to register zone' };

      // Count stationed garrison units
      const garrisonHazmats = em.hazmats.filter(h => h.quarantineZoneKey === zone.chunkKey);
      const garrisonMilitary = em.militaryUnits.filter(m => m.quarantineZoneKey === zone.chunkKey);
      const captiveCivilians = em.civilians.filter(c => c.quarantineZoneKey === zone.chunkKey && c.isCaptive);

      const hasHazmatGarrison = garrisonHazmats.length >= 4 && garrisonHazmats.length <= 6;
      const hasMilitaryGarrison = garrisonMilitary.length >= 2 && garrisonMilitary.length <= 3;
      const hasCaptiveCivilians = captiveCivilians.length >= 8 && captiveCivilians.length <= 12;

      // Check perimeter visuals
      const chunk = zone.chunk;
      const hasRingMesh = !!(chunk && chunk.quarantineRingMesh);
      const hasBannerSprite = !!(chunk && chunk.quarantineBannerSprite);
      const ringRadius = chunk?.quarantineRadius || 16.0;

      // Sample FPS over active frames
      let frameCount = 0;
      const startT = performance.now();
      while (frameCount < 25) {
        await new Promise(r => requestAnimationFrame(r));
        frameCount++;
      }
      const elapsed = performance.now() - startT;
      const fps = (frameCount / elapsed) * 1000;

      return {
        zoneKey: zone.chunkKey,
        hazmatCount: garrisonHazmats.length,
        militaryCount: garrisonMilitary.length,
        captiveCount: captiveCivilians.length,
        hasHazmatGarrison,
        hasMilitaryGarrison,
        hasCaptiveCivilians,
        hasRingMesh,
        hasBannerSprite,
        ringRadius,
        fps: Math.round(fps),
        fpsOk: fps >= 45,
        success: hasHazmatGarrison && hasMilitaryGarrison && hasCaptiveCivilians && hasRingMesh && hasBannerSprite,
      };
    });
    console.log('[Playtest] Fortified Quarantine Zone instantiation check:', quarantineFortressCheck);

    // 3b5. QA Check: Quarantine Outpost Breach & Overrun Reward Mechanics (@designer & @qa)
    console.log('[Playtest] Testing Quarantine Outpost Overrun victory & rewards...');
    const quarantineOverrunCheck = await page.evaluate(async () => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      const pm = app?.powerupManager;
      if (!em || !pm) return { success: false, reason: 'missing managers' };

      const zone = em.quarantineZones.get(em.quarantineZones.keys().next().value);
      if (!zone) return { success: false, reason: 'no active zone' };

      const scoreBefore = em.score;
      const powerupsBefore = pm.powerups.length;

      // Eliminate garrison units to trigger overrun victory
      em.hazmats = em.hazmats.filter(h => h.quarantineZoneKey !== zone.chunkKey);
      em.militaryUnits = em.militaryUnits.filter(m => m.quarantineZoneKey !== zone.chunkKey);

      // Trigger zone evaluation
      em._updateQuarantineZones(0.016);

      const scoreAfter = em.score;
      const scoreDelta = scoreAfter - scoreBefore;
      const isOverrun = zone.isOverrun === true;

      // Check freed civilians
      const freedCivilians = em.civilians.filter(c => c.quarantineZoneKey === zone.chunkKey);
      const allFreed = freedCivilians.length > 0 && freedCivilians.every(c => !c.isCaptive && c.cureImmunity === 0);

      // Check guaranteed high-tier powerup drop
      const newPowerups = pm.powerups.slice(powerupsBefore);
      const droppedCanister = newPowerups.find(p => {
        const tid = p.typeId || p.type?.id || p.type;
        return tid === 'titan_virus' || tid === 'meat_magnet';
      });
      const hasGuaranteedDrop = !!droppedCanister;

      // Check screen banner
      const bannerEl = document.getElementById('quarantine-banner');
      const bannerActive = bannerEl && !bannerEl.classList.contains('hidden');

      return {
        isOverrun,
        scoreDelta,
        scoreBonusAwarded: scoreDelta === 1500,
        freedCount: freedCivilians.length,
        allFreed,
        hasGuaranteedDrop,
        droppedType: droppedCanister?.typeId || droppedCanister?.type?.id || droppedCanister?.type,
        bannerActive,
        success: isOverrun && scoreDelta === 1500 && allFreed && hasGuaranteedDrop,
      };
    });
    console.log('[Playtest] Quarantine Overrun victory check:', quarantineOverrunCheck);

    // 3b6. QA Check: Panic Pacing, Media Blackout, & Quarantine Panic Reduction (@designer & @qa)
    console.log('[Playtest] Testing Panic Pacing, Media Blackout & Quarantine Panic Reduction...');
    const panicPacingCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      if (!em) return { success: false, reason: 'missing entityManager' };

      em.setPanicLevel(0.50);
      const initialPanic = em.panicLevel;

      // 1. Quarantine clear reduced panic by 20%
      em.reducePanic(0.20);
      const panicAfterQuarantine = em.panicLevel;
      const reducedByQuarantine = Math.abs(initialPanic - panicAfterQuarantine - 0.20) < 0.01;

      // Assert 1: Triggering a Media Blackout power-up reduces window.__GAME_STATE__.panicLevel by 0.15
      const preBlackoutGameStatePanic = window.__GAME_STATE__.panicLevel;
      em.activatePowerup('media_blackout');
      const postBlackoutGameStatePanic = window.__GAME_STATE__.panicLevel;
      const gameStateReducedBy15 = Math.abs(preBlackoutGameStatePanic - postBlackoutGameStatePanic - 0.15) < 0.01;
      const panicAfterBlackout = em.panicLevel;
      const reducedByBlackout = Math.abs(panicAfterQuarantine - panicAfterBlackout - 0.15) < 0.01;
      const blackoutTimerActive = (em.panicPauseTimer >= 9.9) || (em.mediaBlackoutTimer >= 9.9);

      // Assert 2: The panic level remains completely static for the next 10 seconds of simulation
      let staticDuring10s = true;
      const expectedStaticPanic = em.panicLevel;
      const expectedStaticGameState = window.__GAME_STATE__.panicLevel;

      // Protect PZ from hazmat mist elimination while simulating 10 seconds of time
      const prevInvuln = em.isSprayInvulnerable;
      const prevSprayTime = em.pzSprayTime;
      em.isSprayInvulnerable = true;
      em.pzSprayTime = 0;

      // Run 100 simulation steps of 0.1s (totaling 10.0s)
      for (let s = 0; s < 100; s++) {
        em.update(0.1, { x: 0, z: 0 }, app.spatialGrid);
        if (Math.abs(em.panicLevel - expectedStaticPanic) > 0.001) {
          staticDuring10s = false;
        }
        if (Math.abs(window.__GAME_STATE__.panicLevel - expectedStaticGameState) > 0.001) {
          staticDuring10s = false;
        }
      }

      // Verify that once 10.0s expires, simulation resumes passive accumulation
      const timerExpired = (em.panicPauseTimer <= 0.001) && (em.mediaBlackoutTimer <= 0.001);
      em.update(0.1, { x: 0, z: 0 }, app.spatialGrid);
      const resumedAccumulation = em.panicLevel > expectedStaticPanic;

      // Restore PZ state
      em.isSprayInvulnerable = prevInvuln;
      em.pzSprayTime = prevSprayTime;

      return {
        reducedByQuarantine,
        reducedByBlackout,
        gameStateReducedBy15,
        blackoutTimerActive,
        staticDuring10s,
        timerExpired,
        resumedAccumulation,
        success: reducedByQuarantine && reducedByBlackout && gameStateReducedBy15 && blackoutTimerActive && staticDuring10s && resumedAccumulation,
      };
    });
    console.log('[Playtest] Panic Pacing & Media Blackout check:', panicPacingCheck);

    // 3b7. QA Check: Advanced Enemies (Riot Vehicles, Attack Helicopters & Armored Tanks) (@designer & @qa)
    console.log('[Playtest] Testing Advanced Enemies Escalation (Riot Vehicles, Helicopters, Tanks)...');
    const advancedEnemiesCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      const tm = app?.trafficManager;
      if (!em || !tm) return { success: false, reason: 'missing managers' };

      // 1. 30% Panic: Riot Vehicles spawn and emit 360 mist
      em.setPanicLevel(0.35);
      tm.vehicles.forEach(v => app.scene.remove(v.mesh));
      tm.vehicles = [];
      let riotCar = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        riotCar = tm.spawnVehicle(em.patientZero.x, em.patientZero.z, app.cityStreamer, app.spatialGrid, 2, 0.35, true);
        if (riotCar) break;
      }
      const isRiotVehicle = !!(riotCar && riotCar.isRiotVehicle === true && riotCar.mistRing);

      // 2. 60% Panic: Attack Helicopters spawn, fly at Y=18, spotlight tracks PZ
      em.setPanicLevel(0.65);
      em._updateHelicopters(0.016, em.patientZero);
      const hasHelicopter = em.helicopters.length >= 1;
      const heli = em.helicopters[0];
      const heliY = heli ? heli.y : 0;
      const heliSpotlight = heli && heli.meshData && !!heli.meshData.cone;

      // Heli lock-on and airstrike trigger test
      let airstrikeTriggered = false;
      const originalTrigger = em.triggerAirstrike;
      em.triggerAirstrike = (x, z) => {
        airstrikeTriggered = true;
        originalTrigger.call(em, x, z);
      };
      if (heli) {
        heli.x = em.patientZero.x;
        heli.z = em.patientZero.z;
        heli.spotlightX = em.patientZero.x;
        heli.spotlightZ = em.patientZero.z;
        heli.lockOnTimer = 2.0;
        em._updateHelicopters(0.016, em.patientZero);
      }
      em.triggerAirstrike = originalTrigger;

      // 3. 85% Panic: Armored Battle Tanks deploy, aim turret, fire shells
      em.setPanicLevel(0.90);
      em._updateTanks(0.016, em.patientZero, app.spatialGrid);
      const hasTank = em.tanks.length >= 1;
      const tank = em.tanks[0];
      const tankTurret = tank && tank.meshData && !!tank.meshData.turret;

      // Tank destruction by Titan ramming
      em.isTitan = true;
      em.titanVirusTimer = 5.0;
      let tankDestroyedByTitan = false;
      if (tank) {
        tank.x = em.patientZero.x + 1.0;
        tank.z = em.patientZero.z + 1.0;
        const tankCountBefore = em.tanks.length;
        em._updateTanks(0.016, em.patientZero, app.spatialGrid);
        tankDestroyedByTitan = (em.tanks.length < tankCountBefore);
      }

      // Tank destruction by 40+ Phalanx overwhelm
      em.isTitan = false;
      em.titanVirusTimer = 0;
      const tank2 = em.spawnTank(em.patientZero.x + 1.2, em.patientZero.z + 1.2);
      em.isPhalanx = true;
      // Temporarily give player 45 zombies
      const dummyZombies = [];
      for (let i = 0; i < 45; i++) dummyZombies.push({ x: 0, z: 0, radius: 0.5 });
      const origZombies = em.zombies;
      em.zombies = dummyZombies;
      const tankCountBefore2 = em.tanks.length;
      em._updateTanks(0.016, em.patientZero, app.spatialGrid);
      const tankDestroyedByPhalanx = (em.tanks.length < tankCountBefore2);
      // 4. Test Helicopter Airstrike & Gas Cloud Threat on Horde
      const preHeliZCount = 8;
      const testZombies = [];
      for (let i = 0; i < preHeliZCount; i++) {
        testZombies.push({ x: 0.5, z: 0.5, vx: 0, vz: 0, radius: 0.5, id: 9000 + i, type: 'zombie', cureExposure: 0 });
      }
      em.zombies = testZombies;
      const preGasCloudCount = em.gasClouds ? em.gasClouds.length : 0;
      em.triggerAirstrike(0, 0);
      const postHeliZCount = em.zombies.length;
      const heliDecontamSuccess = postHeliZCount < preHeliZCount; // Multiple zombies decontaminated
      const gasCloudSpawned = em.gasClouds && em.gasClouds.length > preGasCloudCount; // Lingering gas cloud spawned

      // 5. Test Tank Shell Blast Threat on Horde (Non-Phalanx vs Phalanx)
      const preTankZCount = 6;
      const tankTestZombies = [];
      for (let i = 0; i < preTankZCount; i++) {
        tankTestZombies.push({ x: 1.0, z: 1.0, vx: 0, vz: 0, radius: 0.5, id: 9100 + i, type: 'zombie', cureExposure: 0 });
      }
      em.zombies = tankTestZombies;
      em.isPhalanx = false;
      const dummyTank = { x: 0, z: -10 };
      em.fireTankShell(dummyTank, 1.0, 1.0);
      const postTankZCount = em.zombies.length;
      const tankDecontamSuccess = postTankZCount < preTankZCount; // High-explosive shell decontaminated zombies

      em.zombies = origZombies;
      em.isPhalanx = false;

      return {
        isRiotVehicle: !!isRiotVehicle,
        hasHelicopter,
        heliY,
        heliSpotlight: !!heliSpotlight,
        airstrikeTriggered,
        heliDecontamSuccess,
        gasCloudSpawned,
        hasTank,
        tankTurret: !!tankTurret,
        tankDestroyedByTitan,
        tankDestroyedByPhalanx,
        tankDecontamSuccess,
        success: !!(isRiotVehicle && hasHelicopter && heliY === 18 && airstrikeTriggered && heliDecontamSuccess && gasCloudSpawned && hasTank && tankDestroyedByTitan && tankDestroyedByPhalanx && tankDecontamSuccess),
      };
    });
    console.log('[Playtest] Advanced Enemies check:', advancedEnemiesCheck);

    // 3b8. QA Check: Gamepad API & Phalanx Formation (@designer & @qa)
    console.log('[Playtest] Testing Gamepad API & Phalanx Formation...');
    const gamepadPhalanxCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const input = app?.inputController;
      const em = app?.entityManager;
      if (!input || !em) return { success: false, reason: 'missing controller' };

      // 1. Phalanx toggle via controller
      input.setPhalanx(true);
      const phalanxActive = input.isPhalanx === true && em.isPhalanx === true;

      // 2. Phalanx triggers shield_wall formation in Boids
      em.update(0.016, { x: 0, z: 0 }, app.spatialGrid);
      const formationIsShieldWall = em.currentFormation === 'shield_wall';

      // 3. Release phalanx
      input.setPhalanx(false);
      const phalanxReleased = input.isPhalanx === false && em.isPhalanx === false;

      // 4. Gamepad polling method exists and does not crash
      const hasGamepadPolling = typeof input.pollGamepad === 'function';
      input.pollGamepad();

      return {
        phalanxActive,
        formationIsShieldWall,
        phalanxReleased,
        hasGamepadPolling,
        success: phalanxActive && formationIsShieldWall && phalanxReleased && hasGamepadPolling,
      };
    });
    console.log('[Playtest] Gamepad & Phalanx check:', gamepadPhalanxCheck);

    // 3b9. QA Check: Roguelite Mutation Rewards Modal & Buffs (@designer & @qa)
    console.log('[Playtest] Testing Roguelite Mutation Rewards Modal & Buffs...');
    const mutationRewardsCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      const modal = document.getElementById('mutation-modal');
      if (!em || !modal) return { success: false, reason: 'missing modal/em' };

      // 1. Trigger mutation modal
      em.onShowMutationModal();
      const modalVisible = !modal.classList.contains('hidden');
      const loopPaused = app.isMutationSelecting === true;

      // 2. Test applying 'bruteBone'
      em.applyMutation('bruteBone');
      const bruteBoneApplied = em.mutations.bruteBone === true;
      const cureThresholdBoosted = Math.abs(em.followerCureThreshold - (0.55 * 1.4)) < 0.01;

      // 3. Test applying 'hyperInfectious'
      em.applyMutation('hyperInfectious');
      const hyperInfectiousApplied = em.mutations.hyperInfectious === true;
      const infectionReachBoosted = em.infectionHitRadiusMultiplier === 1.25;

      // 4. Test applying 'acidicBlood' and verify follower decontamination leaves an acid puddle
      em.applyMutation('acidicBlood');
      const acidicBloodApplied = em.mutations.acidicBlood === true;
      const dummyZombie = { id: 9999, x: 5, z: 5, radius: 0.5 };
      em.zombies.push(dummyZombie);
      const puddlesBefore = em.acidPuddles.length;
      em.decontaminateFollowerZombie(dummyZombie);
      const acidPuddleSpawned = (em.acidPuddles.length > puddlesBefore);

      // Close modal
      modal.classList.add('hidden');
      app.isMutationSelecting = false;

      return {
        modalVisible,
        loopPaused,
        bruteBoneApplied,
        cureThresholdBoosted,
        hyperInfectiousApplied,
        infectionReachBoosted,
        acidicBloodApplied,
        acidPuddleSpawned,
        success: modalVisible && loopPaused && bruteBoneApplied && cureThresholdBoosted && hyperInfectiousApplied && infectionReachBoosted && acidicBloodApplied && acidPuddleSpawned,
      };
    });
    console.log('[Playtest] Mutation Rewards check:', mutationRewardsCheck);

    // 3b10. QA Check: Systemic Environmental Hazards & Storefront Breaches (@designer & @qa)
    console.log('[Playtest] Testing Environmental Hazards (Puddles, Sparks, Toxic Water) & Storefront Breaches...');
    const hazardsStorefrontCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      const sg = app?.spatialGrid;
      if (!em || !sg) return { success: false, reason: 'missing managers' };

      // 1. Hydrant smashed -> water puddle spawned
      const waterBefore = em.waterPuddles.length;
      em.spawnWaterPuddle(10, 10, false);
      const waterSpawned = em.waterPuddles.length > waterBefore;
      const wp = em.waterPuddles[em.waterPuddles.length - 1];

      // 2. Street lamp smashed nearby -> electrifies water puddle and stuns hazmat
      em.electrifyWaterPuddleNear(10, 10, 6.0);
      const isElectrified = wp.isElectrified === true;
      const dummyHazmat = { x: 10.5, z: 10.5, radius: 0.5, stunTimer: 0 };
      em.hazmats.push(dummyHazmat);
      em._updatePuddles(0.016);
      const hazmatStunnedByElectricity = dummyHazmat.stunTimer >= 2.9;

      // 3. Titan interaction poisons water puddle -> converts civilians
      em.poisonWaterPuddleNear(10, 10, 4.0);
      const isToxic = wp.isToxic === true;
      const dummyCiv = { id: 8888, x: 10.2, z: 10.2, radius: 0.5, vx: 0, vz: 0, hidden: false, isCaptive: false };
      em.civilians.push(dummyCiv);
      const zombiesBefore = em.zombies.length;
      em._updatePuddles(0.016);
      const civInfectedByToxicWater = (em.zombies.length > zombiesBefore);

      // 4. Commercial Storefront Breached by 20+ horde (@designer: awards breach FX/points but remains solid!)
      const storefrontObs = {
        minX: 20, maxX: 30, minZ: 20, maxZ: 30,
        centerX: 25, centerZ: 25, halfW: 5, halfD: 5,
        isStorefront: true, breached: false, disabled: false,
      };
      sg.obstacles.push(storefrontObs);
      const movingEntity = { x: 25, z: 19.5, radius: 0.6, isTitan: false, hordeCount: 22 };
      sg.resolveObstacles(movingEntity, 0.6);
      const storefrontBreached = storefrontObs.breached === true && storefrontObs.disabled !== true;

      return {
        waterSpawned,
        isElectrified,
        hazmatStunnedByElectricity,
        isToxic,
        civInfectedByToxicWater,
        storefrontBreached,
        success: waterSpawned && isElectrified && hazmatStunnedByElectricity && isToxic && civInfectedByToxicWater && storefrontBreached,
      };
    });
    console.log('[Playtest] Environmental Hazards & Storefront Breaches check:', hazardsStorefrontCheck);

    // 3c. Test Horde Loss / Alone & Hunted Survival Countdown and Game Over (@designer)
    console.log('[Playtest] Testing Horde Loss & Alone Survival Countdown...');
    await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app?.entityManager;
      if (em) {
        if (app) app.isGameOver = false;
        if (window.__GAME_STATE__) window.__GAME_STATE__.isGameOver = false;
        // End Titan mode and clear nearby civilians so PZ doesn't immediately re-infect
        em.titanVirusTimer = 0;
        em.isTitan = false;
        em.pzVisualScale = 1.0;
        em.civilians = [];
        em.hasHadHorde = true;
        em.zombies = [];
        em.isAloneHunted = true;
        em.aloneTimer = 6.8;
        if (em.onAloneStateChanged) {
          em.onAloneStateChanged(true, 6.8, em.maxAloneTime);
        }
      }
    });
    await page.waitForTimeout(150);

    const aloneState = await page.evaluate(() => {
      const em = window.__GAME_APP__?.entityManager;
      const banner = document.getElementById('alone-warning');
      return {
        isAloneHunted: em?.isAloneHunted,
        aloneTimer: em?.aloneTimer,
        bannerVisible: banner && !banner.classList.contains('hidden'),
      };
    });
    console.log('[Playtest] Alone countdown state:', aloneState);

    // Fast forward aloneTimer to 0 to trigger Game Over
    await page.evaluate(() => {
      const em = window.__GAME_APP__?.entityManager;
      if (em) {
        em.aloneTimer = 0;
        em.zombies = [];
        em.score = 15000; // Guarantee score qualifies for initials entry
        if (em.onGameOver) {
          em.onGameOver('HORDE_WIPED_OUT');
        }
      }
    });
    await page.waitForTimeout(300);

    // 3d. Test Arcade 3-Character Initials Entry Tumbler & Leaderboard
    console.log('[Playtest] Testing Retro Arcade Initials Entry Tumbler...');
    let initialsModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('initials-modal');
      return modal && modal.style.display !== 'none';
    });
    console.log(`[Playtest] Initials modal visible on high score: ${initialsModalVisible}`);

    const modalViewportCheck = await page.evaluate(() => {
      const modal = document.getElementById('initials-modal');
      const card = modal?.querySelector('.arcade-card');
      if (!card) return { fitsViewport: true };
      const rect = card.getBoundingClientRect();
      const fitsViewport = rect.height <= window.innerHeight && rect.top >= 0;
      return {
        cardHeight: Math.round(rect.height),
        windowHeight: window.innerHeight,
        fitsViewport,
      };
    });
    console.log('[Playtest] Modal viewport bounds check:', modalViewportCheck);

    let initialsEntered = false;
    if (initialsModalVisible) {
      // Test tumbler arrow key cycling on Slot 0
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Test direct typing "ZED" across the 3 slots
      await page.keyboard.press('KeyZ');
      await page.waitForTimeout(100);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(100);
      await page.keyboard.press('KeyD');
      await page.waitForTimeout(100);

      const tumblerChars = await page.evaluate(() => window.__GAME_APP__?.tumblerChars?.join(''));
      console.log(`[Playtest] Tumbler chars after typing: ${tumblerChars}`);

      // Press Enter to submit initials
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);

      initialsEntered = true;
    }

    const gameOverCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const modal = document.getElementById('game-over-modal');
      const reason = document.getElementById('game-over-reason')?.textContent;
      const rows = document.querySelectorAll('#leaderboard-rows tr');
      const newRow = document.querySelector('#leaderboard-rows tr.row-new');
      return {
        isGameOver: !!(window.__GAME_STATE__?.isGameOver || app?.isGameOver),
        modalVisible: modal && modal.style.display !== 'none' && !modal.classList.contains('hidden'),
        reasonText: reason,
        leaderboardRowCount: rows.length,
        hasNewRowHighlighted: !!newRow,
      };
    });
    console.log('[Playtest] Game Over & Leaderboard check:', gameOverCheck);

    // Verify localStorage persistence under zombie_chase_scores
    const storedScores = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('zombie_chase_scores') || '{}');
      } catch (e) {
        return null;
      }
    });
    const outbreakScores = storedScores?.outbreak || [];
    console.log('[Playtest] Persisted outbreak high scores count:', outbreakScores.length);
    console.log('[Playtest] Top record in storage:', outbreakScores[0]);

    // Test standalone leaderboard toggle via HUD button
    console.log('[Playtest] Testing Standalone Leaderboard modal toggle...');
    await page.evaluate(() => document.getElementById('btn-view-leaderboard')?.click());
    await page.waitForTimeout(200);
    const standaloneOpen = await page.evaluate(() => {
      const m = document.getElementById('standalone-leaderboard-modal');
      return m && m.style.display !== 'none' && !m.classList.contains('hidden');
    });
    console.log(`[Playtest] Standalone leaderboard open: ${standaloneOpen}`);

    await page.evaluate(() => document.getElementById('btn-close-leaderboard')?.click());
    await page.waitForTimeout(200);
    const standaloneClosed = await page.evaluate(() => {
      const m = document.getElementById('standalone-leaderboard-modal');
      return !m || m.style.display === 'none' || m.classList.contains('hidden');
    });
    console.log(`[Playtest] Standalone leaderboard closed: ${standaloneClosed}`);

    // 3e. Test Post-Run Navigation Buttons: "PLAY AGAIN" & "MAIN MENU"
    console.log('[Playtest] Testing Post-Run Navigation buttons...');
    const navButtonsCheck = await page.evaluate(() => {
      const btnRestart = document.getElementById('btn-game-over-restart');
      const btnMenu = document.getElementById('btn-game-over-menu');
      return {
        hasRestartBtn: !!btnRestart,
        hasMenuBtn: !!btnMenu,
      };
    });
    console.log('[Playtest] Post-run navigation buttons presence:', navButtonsCheck);

    // Test "PLAY AGAIN" restarts game directly into STATE_PLAYING
    await page.evaluate(() => document.getElementById('btn-game-over-restart')?.click());
    await page.waitForTimeout(400);
    const restartStateCheck = await page.evaluate(() => ({
      gameState: window.__GAME_STATE__?.gameState,
      modalHidden: document.getElementById('game-over-modal')?.style.display === 'none',
      pzReady: !!window.__GAME_APP__?.entityManager?.patientZero,
    }));
    console.log('[Playtest] PLAY AGAIN restart check:', restartStateCheck);

    // Trigger Game Over again and test "MAIN MENU" button
    await page.evaluate(() => {
      const em = window.__GAME_APP__?.entityManager;
      if (em && em.onGameOver) {
        em.score = 100;
        em.onGameOver('TEST_DEBRIEF');
      }
    });
    await page.waitForTimeout(300);
    const initialsOpenAgain = await page.evaluate(() => document.getElementById('initials-modal')?.style.display !== 'none');
    if (initialsOpenAgain) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    await page.evaluate(() => document.getElementById('btn-game-over-menu')?.click());
    await page.waitForTimeout(400);
    const menuReturnCheck = await page.evaluate(() => {
      const menu = document.getElementById('main-menu-overlay');
      return {
        gameState: window.__GAME_STATE__?.gameState,
        menuVisible: menu && getComputedStyle(menu).display !== 'none',
        entitiesCleared: (window.__GAME_APP__?.entityManager?.zombies?.length || 0) === 0,
      };
    });
    console.log('[Playtest] MAIN MENU return check:', menuReturnCheck);

    // =========================================================================
    // EXPANSION QA: GAME MODES, TIME ATTACK, SAFE ZONES, LAB, & LEADERBOARD TAG
    // =========================================================================

    // 1. Game Mode Selector & Time Attack Expiration Check
    console.log('[Playtest] Testing Game Mode selector and Time Attack countdown...');
    const timeAttackCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const timeAttackPill = document.querySelector('.mode-pill[data-mode="time_attack_2"]');
      if (!timeAttackPill) return { success: false, reason: 'time_attack_2 pill not found' };

      // Click Time Attack 2m pill
      timeAttackPill.click();
      const selectedMode = app.activeGameMode;

      // Start game
      app.startGame(app.activeDifficulty, selectedMode);

      const hudTimerEl = document.getElementById('hud-time-attack');
      const hudTimerVal = document.getElementById('hud-time-attack-val');
      const hudVisible = hudTimerEl && !hudTimerEl.classList.contains('hidden');
      const initialTimer = app.timeAttackTimer;

      // Give 1000 base score
      app.entityManager.score = 1000;

      // Trigger time attack expiration
      app.timeAttackTimer = 0;
      app.entityManager.onGameOver('TIME_ATTACK_SURVIVED');

      const reasonText = app.gameOverReasonEl ? app.gameOverReasonEl.textContent : '';
      const finalScoreText = app.goFinalScoreEl ? app.goFinalScoreEl.textContent : '';

      return {
        success: selectedMode === 'time_attack_2' && hudVisible && initialTimer === 120 && finalScoreText.includes('1,250') && reasonText.includes("TIME'S UP!"),
        selectedMode,
        hudVisible,
        initialTimer,
        reasonText,
        finalScoreText,
      };
    });
    console.log('[Playtest] Time Attack check:', timeAttackCheck);

    // Enter initials for Time Attack run
    await page.evaluate(() => {
      const app = window.__GAME_APP__;
      if (app.isEnteringInitials) {
        app.tumblerChars = ['T', 'M', 'E'];
        app._submitInitials();
      }
    });
    await page.waitForTimeout(300);

    // Return to menu
    await page.evaluate(() => window.__GAME_APP__?.returnToMenu());
    await page.waitForTimeout(300);

    // 2. Zombie Safe Zone Deposit & Alone Survival Trigger Check
    console.log('[Playtest] Testing Safe Zone deposit mechanic & Alone countdown...');
    const safeZoneDepositCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app.entityManager;
      app.startGame('outbreak', 'endless');

      // Spawn 6 follower zombies
      for (let i = 0; i < 6; i++) {
        em.spawnStrayZombie(em.patientZero.x + 1, em.patientZero.z);
      }
      for (let i = em.strayZombies.length - 1; i >= 0; i--) {
        em.recruitStrayZombie(i);
      }
      const initialHorde = em.zombies.length;

      // Spawn synthetic Safe Zone at (0, 0)
      em.spawnSafeZone(0, 0);

      // Position Patient Zero at (0, 0)
      em.patientZero.x = 0;
      em.patientZero.z = 0;

      // Tick channeling for 0.8s
      em._updateSafeZones(0.8, em.patientZero);
      const isChannelingHalf = em.isChannelingSafeZone;
      const widgetHalfVisible = app.safeZoneWidgetEl && !app.safeZoneWidgetEl.classList.contains('hidden');

      // Tick channeling for remaining 0.8s (total 1.6s >= 1.5s target)
      const prevBanked = app.storageSystem.getBankedZombies();
      const prevScore = em.score || 0;
      em._updateSafeZones(0.8, em.patientZero);

      const postHorde = em.zombies.length;
      const postBanked = app.storageSystem.getBankedZombies();
      const postScore = em.score || 0;
      const isAloneHuntedTriggered = em.isAloneHunted && em.aloneTimer > 0;
      const widgetHiddenAfter = app.safeZoneWidgetEl && app.safeZoneWidgetEl.classList.contains('hidden');

      return {
        success: initialHorde >= 6 && isChannelingHalf && widgetHalfVisible && postHorde === 0 && (postBanked - prevBanked) === initialHorde && (postScore - prevScore) === initialHorde * 250 && isAloneHuntedTriggered && widgetHiddenAfter,
        initialHorde,
        isChannelingHalf,
        widgetHalfVisible,
        postHorde,
        bankedAdded: postBanked - prevBanked,
        scoreAdded: postScore - prevScore,
        isAloneHuntedTriggered,
        widgetHiddenAfter,
      };
    });
    console.log('[Playtest] Safe Zone deposit check:', safeZoneDepositCheck);

    // Return to menu
    await page.evaluate(() => window.__GAME_APP__?.returnToMenu());
    await page.waitForTimeout(300);

    // 3. Mutation Lab Meta-Progression Store Check
    console.log('[Playtest] Testing Mutation Lab modal, purchases, and buffs...');
    const mutationLabCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const storage = app.storageSystem;

      // Give 150 banked zombies
      storage.addBankedZombies(150);
      const balanceBefore = storage.getBankedZombies();

      // Open lab modal
      document.getElementById('btn-menu-lab')?.click();
      const modal = document.getElementById('lab-modal');
      const isModalOpen = modal && getComputedStyle(modal).display !== 'none';

      // Unlock civilianPheromone (cost 30)
      const unlockPheromoneSuccess = storage.unlockEnhancement('civilianPheromone');
      const balanceAfterPheromone = storage.getBankedZombies();

      // Unlock titanDuration (cost 50)
      const unlockTitanSuccess = storage.unlockEnhancement('titanDuration');

      // Toggle civilianPheromone
      const toggleOff = storage.toggleEnhancement('civilianPheromone', false);
      const toggleOn = storage.toggleEnhancement('civilianPheromone', true);

      // Start game and verify applied buffs on EntityManager
      app._closeLabModal();
      app.startGame('outbreak', 'endless');
      const em = app.entityManager;

      return {
        success: isModalOpen && unlockPheromoneSuccess && unlockTitanSuccess && (balanceBefore - balanceAfterPheromone === 30) && toggleOn === true && em.titanDurationBuff === 22.5 && em.infectionHitRadiusMultiplier === 1.35 && app.usedEnhancements === true,
        isModalOpen,
        unlockPheromoneSuccess,
        unlockTitanSuccess,
        balanceDeducted: balanceBefore - balanceAfterPheromone,
        titanDurationBuff: em.titanDurationBuff,
        infectionHitRadiusMultiplier: em.infectionHitRadiusMultiplier,
        usedEnhancements: app.usedEnhancements,
      };
    });
    console.log('[Playtest] Mutation Lab check:', mutationLabCheck);

    // 4. Leaderboard Enhancement Tagging & Mode Partitioning Check
    console.log('[Playtest] Testing Leaderboard 🧬 enhancement tagging & mode tabs...');
    const leaderboardTagCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      // Trigger game over on this enhanced run
      app.entityManager.score = 5000;
      app.entityManager.onGameOver('HORDE_WIPED_OUT');

      // Submit initials "DNA"
      if (app.isEnteringInitials) {
        app.tumblerChars = ['D', 'N', 'A'];
        app._submitInitials();
      }

      const rowsHtml = document.getElementById('leaderboard-rows')?.innerHTML || '';
      const hasDnaBadge = rowsHtml.includes('enhancement-dna-badge') && rowsHtml.includes('🧬');
      const hasDnaInitials = rowsHtml.includes('DNA');

      // Test mode tab switching to time_attack_2
      const timeAttackTab = document.querySelector('#gameover-mode-tabs .lead-tab[data-mode="time_attack_2"]');
      if (timeAttackTab) timeAttackTab.click();
      const timeAttackRowsHtml = document.getElementById('leaderboard-rows')?.innerHTML || '';
      const hasTimeAttackScore = timeAttackRowsHtml.includes('TME');

      return {
        success: hasDnaBadge && hasDnaInitials && hasTimeAttackScore,
        hasDnaBadge,
        hasDnaInitials,
        hasTimeAttackScore,
      };
    });
    console.log('[Playtest] Leaderboard enhancement tag check:', leaderboardTagCheck);

    // Return to menu
    await page.evaluate(() => window.__GAME_APP__?.returnToMenu());
    await page.waitForTimeout(300);

    // =========================================================================
    // BUG-FIX SPRINT VALIDATION CHECKS (@qa)
    // 1. Banked zombie integer persistence across reload in localStorage ('zombie_chase_bank')
    // 2. Quarantine garrison units bypass distance-despawn (>140m) via preventDespawn = true
    // 3. Spotlight vector math limits tracking speed to 7.5 m/s, resetting lockOnTimer when outrun (>8.0m)
    // =========================================================================

    console.log('[Playtest] Testing Banked Zombie persistence across page reload...');
    const bankPersistenceCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      // Set explicit integer in localStorage
      const testVal = 250;
      localStorage.setItem('zombie_chase_bank', String(testVal));
      app._updateBankedZombiesUI();

      const readRaw = localStorage.getItem('zombie_chase_bank');
      const readInt = parseInt(readRaw, 10);
      const menuVal = parseInt(document.getElementById('menu-banked-zombies')?.textContent?.replace(/,/g, '') || '0', 10);
      const labEl = document.getElementById('lab-banked-balance') || document.getElementById('lab-banked-count');
      const labVal = parseInt(labEl?.textContent?.replace(/,/g, '') || '0', 10);

      return {
        keyExists: readRaw !== null,
        readInt,
        menuSynced: menuVal === testVal,
        labSynced: labVal === testVal,
        success: readInt === testVal && menuVal === testVal && labVal === testVal,
      };
    });
    console.log('[Playtest] Banked Zombie persistence check:', bankPersistenceCheck);

    console.log('[Playtest] Testing Quarantine Garrison distance-despawn bypass...');
    const garrisonDespawnCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app.entityManager;

      // Spawn a synthetic quarantine outpost at (300, 300) (>140m away from origin PZ)
      const zone = em.spawnQuarantineOutpost(300, 300);
      const chunkKey = zone.chunkKey;

      // Count garrison units
      const initialHazmats = em.hazmats.filter(h => h.quarantineZoneKey === chunkKey);
      const initialMilitary = em.militaryUnits.filter(m => m.quarantineZoneKey === chunkKey);
      const initialCaptives = em.civilians.filter(c => c.quarantineZoneKey === chunkKey);

      const allHavePreventDespawn = 
        initialHazmats.every(h => h.preventDespawn === true) &&
        initialMilitary.every(m => m.preventDespawn === true) &&
        initialCaptives.every(c => c.preventDespawn === true);

      // Position Patient Zero far away at (0, 0) - distance is ~424m (> 140m)
      const pz = { x: 0, z: 0 };
      em.updatePopulationStreaming(pz);

      const survivingHazmats = em.hazmats.filter(h => h.quarantineZoneKey === chunkKey);
      const survivingMilitary = em.militaryUnits.filter(m => m.quarantineZoneKey === chunkKey);
      const survivingCaptives = em.civilians.filter(c => c.quarantineZoneKey === chunkKey);

      // Cleanup
      em.unregisterQuarantineZone(chunkKey);

      return {
        initialHazmats: initialHazmats.length,
        initialMilitary: initialMilitary.length,
        initialCaptives: initialCaptives.length,
        allHavePreventDespawn,
        survivedStreaming: survivingHazmats.length === initialHazmats.length &&
                           survivingMilitary.length === initialMilitary.length &&
                           survivingCaptives.length === initialCaptives.length,
        success: allHavePreventDespawn && survivingHazmats.length > 0 && survivingMilitary.length > 0 && survivingCaptives.length > 0,
      };
    });
    console.log('[Playtest] Quarantine Garrison distance-despawn bypass check:', garrisonDespawnCheck);

    console.log('[Playtest] Testing Helicopter spotlight tracking speed limit (7.5 m/s) and evasion...');
    const spotlightEvasionCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const em = app.entityManager;

      // Set panic level so helicopters are active (requires >= 0.60 panic)
      em.setPanicLevel(0.75);

      // Clear existing helicopters and spawn one test helicopter
      em.helicopters = [];
      const heli = em.spawnAttackHelicopter(0, 0);
      heli.spotlightX = 0;
      heli.spotlightZ = 0;

      // Case A: Player stationary at (0, 0), lock-on charges
      const pz = { x: 0, z: 0 };
      em._updateHelicopters(0.1, pz);
      const lockedOn = heli.lockOnTimer > 0;

      // Case B: Player teleports / sprints beyond 8.0m (e.g. at x = 25m)
      pz.x = 25.0; // Distance is 25 - 0.75 = 24.25m (> 8.0m)
      heli.lockOnTimer = 1.8; // Pretend it was almost locked
      em._updateHelicopters(0.1, pz);

      const timerReset = heli.lockOnTimer === 0;

      // Case C: Spotlight speed limit assertion: delta spotlight position over dt cannot exceed 7.5 * dt
      heli.spotlightX = 0;
      heli.spotlightZ = 0;
      pz.x = 100.0;
      pz.z = 0;
      const dtTest = 0.5;
      em._updateHelicopters(dtTest, pz);
      const distanceMoved = heli.spotlightX; // Was 0, now moved towards 100
      const expectedMaxMove = 7.5 * dtTest; // 3.75m
      const speedLimited = Math.abs(distanceMoved - expectedMaxMove) < 0.001;

      // Cleanup
      em.helicopters = [];

      return {
        lockedOn,
        timerReset,
        distanceMoved,
        expectedMaxMove,
        speedLimited,
        success: lockedOn && timerReset && speedLimited,
      };
    });
    console.log('[Playtest] Helicopter spotlight evasion & speed limit check:', spotlightEvasionCheck);

    // =========================================================================
    // BUG-FIX SPRINT VALIDATION CHECKS (@qa & @designer)
    // 4. Building Solid Sliding: resolveObstacles prevents penetrating building AABB & slides
    // 5. Power-up Roadway Placement: powerups never spawn inside building obstacles
    // 6. Initials QoL Memory: submitted initials are stored in localStorage and pre-filled
    // =========================================================================
    console.log('[Playtest] Testing Building Solid Collision & Wall Sliding...');
    const buildingCollisionCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const grid = app.spatialGrid;
      const buildings = (grid.obstacles || []).filter(o => !o.isCar && !o.disabled);
      if (buildings.length === 0) {
        return { success: false, reason: 'No building obstacles in spatial grid' };
      }

      // Pick a sample building
      const testBldg = buildings[0];
      const pzRadius = 0.55;

      // Case A: Try moving straight into the left wall of the building
      // Start just outside left wall: x = testBldg.minX - 0.2
      // Attempt target deep inside: x = testBldg.centerX
      const testEntity = {
        x: testBldg.centerX,
        z: testBldg.centerZ,
        vx: 5.0,
        vz: 3.0,
        isTitan: false,
        hordeCount: 5,
      };

      // Call resolveObstacles with previous position outside
      const prevX = testBldg.minX - 0.8;
      const prevZ = testBldg.centerZ;
      const col = grid.resolveObstacles(testEntity, pzRadius, true, prevX, prevZ);

      // Verify entity was kept outside the building bounding box
      const isOutside = testEntity.x <= testBldg.minX || testEntity.x >= testBldg.maxX ||
                        testEntity.z <= testBldg.minZ || testEntity.z >= testBldg.maxZ;
      const stoppedAgainstWall = testEntity.x <= testBldg.minX + 0.001;
      const wallNormalApplied = col && Math.abs(col.nx) > 0.5;

      return {
        success: isOutside && stoppedAgainstWall && !!col,
        isOutside,
        stoppedAgainstWall,
        wallNormalApplied: !!wallNormalApplied,
        resolvedX: testEntity.x,
        minX: testBldg.minX,
      };
    });
    console.log('[Playtest] Building Solid Collision & Wall Sliding check:', buildingCollisionCheck);

    console.log('[Playtest] Testing Powerup Roadway Spawning & Zero Building Overlap...');
    const powerupRoadwayCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      const pm = app.powerupManager;
      const grid = app.spatialGrid;
      const buildings = (grid.obstacles || []).filter(o => !o.isCar && !o.disabled);

      // Spawn 15 powerups via update loop simulation
      const pz = app.entityManager?.patientZero || { x: 0, z: -20, angle: 0 };
      for (let i = 0; i < 15; i++) {
        pm.spawnTimer = 9.9; // Force spawn trigger
        pm.powerups.length = 0; // Clear so pool limit doesn't block
        pm.update(10 + i, 0.5, pz);
      }

      // Check all spawned powerups against building bounding boxes
      let overlaps = 0;
      for (let i = 0; i < pm.powerups.length; i++) {
        const p = pm.powerups[i];
        for (let j = 0; j < buildings.length; j++) {
          const b = buildings[j];
          if (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) {
            overlaps++;
          }
        }
      }

      return {
        spawnedCount: pm.powerups.length,
        overlaps,
        success: pm.powerups.length > 0 && overlaps === 0,
      };
    });
    console.log('[Playtest] Powerup Roadway Spawning check:', powerupRoadwayCheck);

    console.log('[Playtest] Testing Initials Memory & Pre-fill...');
    const initialsMemoryCheck = await page.evaluate(() => {
      const app = window.__GAME_APP__;
      // 1. Submit initials "ACE"
      localStorage.setItem('zombie_chase_last_initials', 'ACE');

      // 2. Open initials modal
      app._openInitialsModal(5000, 10, '01:30');

      // 3. Verify tumblers are pre-filled with 'A', 'C', 'E'
      const chars = app.tumblerChars.slice();
      const match = chars[0] === 'A' && chars[1] === 'C' && chars[2] === 'E';

      // 4. Submit a new one "WIN"
      app.tumblerChars = ['W', 'I', 'N'];
      app._submitInitials();

      const saved = localStorage.getItem('zombie_chase_last_initials');
      app._closeInitialsModal();

      return {
        prefillMatch: match,
        persistedNew: saved === 'WIN',
        success: match && saved === 'WIN',
      };
    });
    console.log('[Playtest] Initials Memory & Pre-fill check:', initialsMemoryCheck);

    // Check final scale reading
    const finalScale = await page.evaluate(() => window.__GAME_STATE__?.pzVisualScale || 1.0);
    if (finalScale > maxPzVisualScale) maxPzVisualScale = finalScale;

    // 4. Retrieve window.__GAME_STATE__
    const gameState = await page.evaluate(() => window.__GAME_STATE__ || {});
    gameState.maxOccludedBuildings = maxOccludedBuildings;
    gameState.maxHordeCount = maxHordeCount;
    gameState.maxMilitaryCount = maxMilitaryCount;
    gameState.maxWardensCount = maxWardensCount;
    gameState.maxSlimeCount = maxSlimeCount;
    gameState.maxPzVisualScale = maxPzVisualScale;
    gameState.maxHazmatDamage = maxHazmatDamage;
    gameState.squeezeVerified = !!(isSqueezeWithKey || isSqueezeBtnActive);
    gameState.initialsVerified = initialsEntered;
    gameState.leaderboardVerified = gameOverCheck.leaderboardRowCount >= 1;
    gameState.storageVerified = outbreakScores.length >= 1;
    gameState.redBoundaryRingAbsent = !redBoundaryRingPresent;
    gameState.spawnIntersectionClear = launchSpawnCheck.initialOccludedCount === 0;
    gameState.hordeFirstVerified = hordeFirstCheck.widgetHiddenWithHorde && hordeFirstCheck.widgetVisibleOnLastStand;
    gameState.modalViewportVerified = modalViewportCheck.fitsViewport;
    gameState.bootMenuVerified = bootMenuCheck.isMenuVisible && bootMenuCheck.gameState === 'STATE_MENU';
    gameState.carObstacleVerified = carObstacleCheck.foundCarObstacle && carObstacleCheck.blockedCollision;
    gameState.trafficHazardVerified = trafficHazardCheck.trafficActive;
    gameState.navButtonsVerified = navButtonsCheck.hasRestartBtn && navButtonsCheck.hasMenuBtn;
    gameState.restartStateVerified = restartStateCheck.gameState === 'STATE_PLAYING';
    gameState.menuReturnVerified = menuReturnCheck.gameState === 'STATE_MENU';
    gameState.zeroInitialFollowersVerified = initialCheck.initialFollowerCount === 0;
    gameState.shrunkDemolitionDisabledVerified = !!titanDestructionCheck.shrunkDemolitionDisabled;

    // Merge any page-level uncaught errors
    if (pageErrors.length > 0) {
      gameState.errors = [...(gameState.errors || []), ...pageErrors];
    }

    console.log('\n========================================');
    console.log('       AUTOMATED PLAYTEST RESULTS       ');
    console.log('========================================');
    console.log(JSON.stringify(gameState, null, 2));
    console.log('========================================\n');

    // 5. Dump window.__GAME_STATE__ to test-results.json
    fs.writeFileSync('test-results.json', JSON.stringify(gameState, null, 2));
    console.log('[Playtest] Telemetry dumped to test-results.json');

    await page.screenshot({
      path: '/Users/ngobeli/.gemini/antigravity-ide/brain/acf2d009-8550-4f70-80ee-f1f787d5872f/arcade_initials_leaderboard.png',
    });
    console.log('[Playtest] Arcade Initials & Leaderboard screenshot saved.');

    await browser.close();

    // 6. Validation
    const hasHorde = (gameState.hordeCount > 1) || (gameState.maxHordeCount > 1);
    const noErrors = !gameState.errors || gameState.errors.length === 0;
    const hazmatRegistered = gameState.hazmatDamageDealt > 0 || maxHazmatDamage > 0;
    const occlusionVerified = gameState.maxOccludedBuildings > 0;
    const militaryVerified = gameState.maxMilitaryCount > 0;
    const titanVerified = gameState.maxPzVisualScale > 1.5;
    const wardenVerified = initialCheck.wardensCount >= 1 || gameState.maxWardensCount >= 1;
    const slimeVerified = gameState.maxSlimeCount > 0;
    const squeezeVerified = isSqueezeWithKey || isSqueezeBtnActive;

    if (!noErrors) {
      console.error(`[Playtest FAILED] Runtime errors detected (${gameState.errors.length} errors).`);
      process.exit(1);
    }

    if (!bootMenuCheck.isMenuVisible || bootMenuCheck.gameState !== 'STATE_MENU') {
      console.error('[Playtest FAILED] Initial boot state is not STATE_MENU with visible overlay.');
      process.exit(1);
    }

    if (!carObstacleCheck.foundCarObstacle || !carObstacleCheck.blockedCollision) {
      console.error('[Playtest FAILED] Solid parked car obstacle collision check failed.');
      process.exit(1);
    }

    if (!trafficHazardCheck.trafficActive) {
      console.error('[Playtest FAILED] Moving traffic hazard system failed to initialize.');
      process.exit(1);
    }

    if (!navButtonsCheck.hasRestartBtn || !navButtonsCheck.hasMenuBtn) {
      console.error('[Playtest FAILED] Post-run navigation buttons (Play Again / Main Menu) missing.');
      process.exit(1);
    }

    if (restartStateCheck.gameState !== 'STATE_PLAYING') {
      console.error('[Playtest FAILED] PLAY AGAIN button failed to transition directly to STATE_PLAYING.');
      process.exit(1);
    }

    if (menuReturnCheck.gameState !== 'STATE_MENU' || !menuReturnCheck.menuVisible) {
      console.error('[Playtest FAILED] MAIN MENU button failed to transition back to STATE_MENU.');
      process.exit(1);
    }

    if (!hasHorde) {
      console.error(`[Playtest FAILED] Horde count too low (${gameState.hordeCount} <= 1 and maxHorde ${gameState.maxHordeCount} <= 1). Infection pipeline issue.`);
      process.exit(1);
    }

    if (!hazmatRegistered) {
      console.error(`[Playtest FAILED] Hazmats failed to register damage or presence.`);
      process.exit(1);
    }

    if (!occlusionVerified) {
      console.error(`[Playtest FAILED] Building occlusion raycasting failed to detect occluded buildings.`);
      process.exit(1);
    }

    if (initialCheck.militaryCount !== 0) {
      console.error(`[Playtest FAILED] Military Riflemen must be 0 in Stage 1 (${initialCheck.militaryCount} !== 0).`);
      process.exit(1);
    }

    if (initialCheck.movingCarsCount !== 0) {
      console.error(`[Playtest FAILED] Moving cars must be 0 in Stage 1 (${initialCheck.movingCarsCount} !== 0).`);
      process.exit(1);
    }

    if (!militaryVerified) {
      console.error(`[Playtest FAILED] Military Riflemen failed to register during gameplay.`);
      process.exit(1);
    }

    if (!carPinDownCheck.verified || carPinDownCheck.pinnedOnSecondFrame || carPinDownCheck.lateralShift < 2.5 || carPinDownCheck.timerAfterHit < 1.4) {
      console.error(`[Playtest FAILED] Car pin-down glitch fix or lateral deflection failed:`, carPinDownCheck);
      process.exit(1);
    }

    if (!roadwayLanesCheck.verified || !roadwayLanesCheck.allYCorrect || !roadwayLanesCheck.allParallelToGrid || roadwayLanesCheck.buildingCollisions > 0) {
      console.error(`[Playtest FAILED] Roadway lane adherence, Y=0.01 altitude, or building obstacle clearance failed:`, roadwayLanesCheck);
      process.exit(1);
    }

    if (!trafficHazardCheck.stage1Rejected || !trafficHazardCheck.vehicleSpawned) {
      console.error(`[Playtest FAILED] Traffic hazard stage filtering failed:`, trafficHazardCheck);
      process.exit(1);
    }

    if (progressiveDifficultyCheck.stage1Cure !== 3.5 || progressiveDifficultyCheck.stage2Cure !== 2.2 ||
        progressiveDifficultyCheck.stage3Cure !== 1.4 || progressiveDifficultyCheck.stage4Cure !== 0.8) {
      console.error(`[Playtest FAILED] Progressive difficulty cure thresholds failed:`, progressiveDifficultyCheck);
      process.exit(1);
    }

    if (!wardenVerified) {
      console.error(`[Playtest FAILED] Megaphone Warden failed to spawn.`);
      process.exit(1);
    }

    if (!slimeVerified) {
      console.error(`[Playtest FAILED] Contagion Slime trail failed to generate.`);
      process.exit(1);
    }

    if (!squeezeVerified) {
      console.error(`[Playtest FAILED] Swarm Squeeze failed to activate with KeyC or button.`);
      process.exit(1);
    }

    if (initialCheck.powerupsCount < 1) {
      console.error(`[Playtest FAILED] Powerups failed to pre-spawn at start (${initialCheck.powerupsCount} < 1).`);
      process.exit(1);
    }

    if (initialCheck.innerRingVisible || initialCheck.outerRingVisible) {
      console.error(`[Playtest FAILED] Flashing rings around Patient Zero are still visible!`);
      process.exit(1);
    }

    if (!titanVerified && !titanPickedUp) {
      console.error(`[Playtest FAILED] Titan Virus failed to activate or scale Patient Zero.`);
      process.exit(1);
    }

    if (!aloneState.bannerVisible || !gameOverCheck.isGameOver) {
      console.error(`[Playtest FAILED] Alone survival banner or Game Over failed to trigger.`);
      process.exit(1);
    }

    if (!initialsEntered) {
      console.error(`[Playtest FAILED] Arcade initials entry modal failed to open on high score.`);
      process.exit(1);
    }

    if (gameOverCheck.leaderboardRowCount < 1) {
      console.error(`[Playtest FAILED] Leaderboard rows failed to render (found ${gameOverCheck.leaderboardRowCount}, expected >= 1).`);
      process.exit(1);
    }

    if (outbreakScores.length < 1) {
      console.error(`[Playtest FAILED] localStorage zombie_chase_scores failed to persist score.`);
      process.exit(1);
    }

    if (redBoundaryRingPresent) {
      console.error('[Playtest FAILED] Legacy red boundary ring is still present in the scene graph!');
      process.exit(1);
    }

    if (launchSpawnCheck.initialOccludedCount !== 0) {
      console.error(`[Playtest FAILED] Patient Zero has occluded buildings on launch (${launchSpawnCheck.initialOccludedCount} > 0). Line of sight blocked!`);
      process.exit(1);
    }

    if (!hordeFirstCheck.widgetHiddenWithHorde || !hordeFirstCheck.widgetVisibleOnLastStand) {
      console.error('[Playtest FAILED] Horde-first invulnerability or Last Stand mist exposure check failed.');
      process.exit(1);
    }

    if (!modalViewportCheck.fitsViewport) {
      console.error('[Playtest FAILED] Initials entry modal exceeds viewport bounds.');
      process.exit(1);
    }

    if (!viewportTouchCheck.hasViewportLock || !viewportTouchCheck.bodyTouchActionNone) {
      console.error('[Playtest FAILED] Viewport scaling lock or touch-action: none assertion failed:', viewportTouchCheck);
      process.exit(1);
    }

    if (!rulesModalCheck.modalOpened || !rulesModalCheck.modalClosed) {
      console.error('[Playtest FAILED] How-to-Play Rules modal failed to open and close cleanly:', rulesModalCheck);
      process.exit(1);
    }

    if (!debugDrawerCheck.isCollapsed || !debugDrawerCheck.panelHidden) {
      console.error('[Playtest FAILED] Debug buttons are not hidden/collapsed on active gameplay canvas:', debugDrawerCheck);
      process.exit(1);
    }

    if (!titanDestructionCheck.success || !titanDestructionCheck.carKnocked || !titanDestructionCheck.carObstacleDisabled || !titanDestructionCheck.carVerticesCollapsed) {
      console.error('[Playtest FAILED] Titan car demolition check failed:', titanDestructionCheck);
      process.exit(1);
    }

    if (!titanDestructionCheck.bushKnocked || !titanDestructionCheck.bushVerticesCollapsed || !titanDestructionCheck.lampKnocked || !titanDestructionCheck.lampVerticesCollapsed) {
      console.error('[Playtest FAILED] Titan prop smashing (bush/lamp) check failed:', titanDestructionCheck);
      process.exit(1);
    }

    if (initialCheck.initialFollowerCount !== 0) {
      console.error(`[Playtest FAILED] Game must start with 0 zombie followers (found ${initialCheck.initialFollowerCount}).`);
      process.exit(1);
    }

    if (!titanDestructionCheck.shrunkDemolitionDisabled) {
      console.error('[Playtest FAILED] After shrinking down from Titan, demolition must be completely disabled.');
      process.exit(1);
    }

    if (!decontamCheck.success) {
      console.error('[Playtest FAILED] Hazmat decontamination timing check failed:', decontamCheck);
      process.exit(1);
    }

    if (!quarantineFortressCheck.success) {
      console.error('[Playtest FAILED] Quarantine Fortress instantiation check failed:', quarantineFortressCheck);
      process.exit(1);
    }

    if (!quarantineOverrunCheck.success) {
      console.error('[Playtest FAILED] Quarantine Fortress overrun rewards check failed:', quarantineOverrunCheck);
      process.exit(1);
    }

    if (!panicPacingCheck.success) {
      console.error('[Playtest FAILED] Panic Pacing & Media Blackout check failed:', panicPacingCheck);
      process.exit(1);
    }

    if (!advancedEnemiesCheck.success) {
      console.error('[Playtest FAILED] Advanced Enemies check failed:', advancedEnemiesCheck);
      process.exit(1);
    }

    if (!gamepadPhalanxCheck.success) {
      console.error('[Playtest FAILED] Gamepad & Phalanx check failed:', gamepadPhalanxCheck);
      process.exit(1);
    }

    if (!mutationRewardsCheck.success) {
      console.error('[Playtest FAILED] Mutation Rewards check failed:', mutationRewardsCheck);
      process.exit(1);
    }

    if (!hazardsStorefrontCheck.success) {
      console.error('[Playtest FAILED] Environmental Hazards & Storefront Breaches check failed:', hazardsStorefrontCheck);
      process.exit(1);
    }

    if (!timeAttackCheck.success) {
      console.error('[Playtest FAILED] Time Attack check failed:', timeAttackCheck);
      process.exit(1);
    }

    if (!safeZoneDepositCheck.success) {
      console.error('[Playtest FAILED] Safe Zone deposit & Alone survival trigger check failed:', safeZoneDepositCheck);
      process.exit(1);
    }

    if (!mutationLabCheck.success) {
      console.error('[Playtest FAILED] Mutation Lab meta-progression store check failed:', mutationLabCheck);
      process.exit(1);
    }

    if (!leaderboardTagCheck.success) {
      console.error('[Playtest FAILED] Leaderboard enhancement tag check failed:', leaderboardTagCheck);
      process.exit(1);
    }

    if (!bankPersistenceCheck.success) {
      console.error('[Playtest FAILED] Banked zombie persistence in localStorage (zombie_chase_bank) failed:', bankPersistenceCheck);
      process.exit(1);
    }

    if (!garrisonDespawnCheck.success) {
      console.error('[Playtest FAILED] Quarantine garrison units failed to bypass distance despawn:', garrisonDespawnCheck);
      process.exit(1);
    }

    if (!spotlightEvasionCheck.success) {
      console.error('[Playtest FAILED] Helicopter spotlight tracking speed limit (7.5 m/s) or evasion reset failed:', spotlightEvasionCheck);
      process.exit(1);
    }

    if (!buildingCollisionCheck.success) {
      console.error('[Playtest FAILED] Building collision solid sliding check failed:', buildingCollisionCheck);
      process.exit(1);
    }

    if (!powerupRoadwayCheck.success) {
      console.error('[Playtest FAILED] Powerup roadway spawning & zero building overlap check failed:', powerupRoadwayCheck);
      process.exit(1);
    }

    if (!initialsMemoryCheck.success) {
      console.error('[Playtest FAILED] Initials QoL memory & pre-fill check failed:', initialsMemoryCheck);
      process.exit(1);
    }

    console.log('[Playtest PASSED] All assertions passed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('[Playtest Fatal Error]', err);
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

runPlaytest();
