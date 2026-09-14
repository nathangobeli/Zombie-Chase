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
  if (await probePort(5173)) return 'http://localhost:5173';
  if (await probePort(5174)) return 'http://localhost:5174';
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
        militaryCount: app?.entityManager?.militaryUnits?.length || 0,
        movingCarsCount: app?.trafficManager?.vehicles?.length || 0,
        stage: window.__GAME_STATE__?.stage || 1,
        stageName: window.__GAME_STATE__?.stageName || '',
        cureThreshold: app?.entityManager?.cureThreshold || 3.5,
        wardensCount: app?.entityManager?.wardens?.length || 0,
        powerupsCount: app?.powerupManager?.powerups?.length || 0,
        innerRingVisible: !!renderer?.innerRing?.visible,
        outerRingVisible: !!renderer?.outerRing?.visible,
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
      if (em.onPatientZeroSprayed) em.onPatientZeroSprayed(0.016, 0.0, 5.0);
      const mistWidget = document.getElementById('mist-countdown-widget');
      const widgetHiddenWithHorde = !mistWidget || mistWidget.classList.contains('hidden');

      // Case B: Horde === 0: Last Stand mist exposure activates
      em.zombies = [];
      em.pzSprayTime = 2.5;
      if (em.onPatientZeroSprayed) em.onPatientZeroSprayed(0.5, 2.5 / 5.0, 2.5);
      const timerText = document.getElementById('mist-timer-text')?.textContent;
      const widgetVisibleOnLastStand = mistWidget && !mistWidget.classList.contains('hidden');

      // Reset
      em.pzSprayTime = 0;
      if (em.onPatientZeroSprayed) em.onPatientZeroSprayed(0.016, 0.0, 5.0);

      return {
        widgetHiddenWithHorde,
        widgetVisibleOnLastStand,
        timerText,
      };
    });
    console.log('[Playtest] Horde-first & Last Stand mist check:', hordeFirstCheck);

    const hazmatAfterMist = await page.evaluate(() => window.__GAME_STATE__?.hazmatDamageDealt || window.__GAME_APP__?.hazmatDamageDealt || 0);
    if (hazmatAfterMist > maxHazmatDamage) maxHazmatDamage = hazmatAfterMist;

    // 3c. Test Horde Loss / Alone & Hunted Survival Countdown and Game Over (@designer)
    console.log('[Playtest] Testing Horde Loss & Alone Survival Countdown...');
    await page.evaluate(() => {
      const em = window.__GAME_APP__?.entityManager;
      if (em) {
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

    if (titanDestructionCheck.debrisCount < 3) {
      console.error('[Playtest FAILED] Debris pieces not spawned for demolished car and props:', titanDestructionCheck);
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
