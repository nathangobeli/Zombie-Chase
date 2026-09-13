import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { PowerupManager } from './entities/PowerupManager.js';
import { SpatialGrid } from './core/SpatialGrid.js';
import { EntityManager } from './entities/EntityManager.js';
import { InstancedRenderer } from './rendering/InstancedRenderer.js';
import { ParticleSystem } from './fx/Particles.js';
import { CameraController } from './camera/CameraController.js';
import { InputController } from './controls/InputController.js';
import { CityStreamer } from './world/CityStreamer.js';
import { AssetLoader } from './world/AssetLoader.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { StorageSystem } from './systems/StorageSystem.js';
import { TrafficManager } from './world/TrafficManager.js';

// V2: Day/night color transitions keyed to panicLevel
const SKY_CALM = new THREE.Color(0x93c5fd); // Sky blue (#93c5fd)
const SKY_PANIC = new THREE.Color(0xff6b8b); // Vibrant stylized comic sunset pink
const SUN_CALM = new THREE.Color(0xfff7ed); // Warm buttery cream (#fff7ed)
const SUN_PANIC = new THREE.Color(0xffaa00);
const HEMI_SKY_CALM = new THREE.Color(0x93c5fd); // Sky blue (#93c5fd)
const HEMI_SKY_PANIC = new THREE.Color(0xfbcfe8);
const HEMI_GROUND_CALM = new THREE.Color(0xbbf7d0); // Warm lawn green (#bbf7d0)

// V1: Custom vignette shader pass
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset:   { value: 0.95 },
    darkness: { value: 0.85 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vignette = smoothstep(offset, offset - 0.35, length(uv));
      texel.rgb = mix(texel.rgb * darkness, texel.rgb, vignette);
      gl_FragColor = texel;
    }
  `,
};

// Runtime error tracking for automated playtests & telemetry
const runtimeErrors = [];
window.addEventListener('error', (e) => {
  runtimeErrors.push(e.message || String(e));
});
window.addEventListener('unhandledrejection', (e) => {
  runtimeErrors.push(e.reason?.message || String(e.reason));
});

window.__GAME_STATE__ = {
  gameState: 'STATE_MENU',
  stage: 1,
  stageName: 'STAGE 1: OUTBREAK DAWN',
  carRecoveryTimer: 0,
  hordeCount: 0,
  hazmatsActive: 0,
  militaryActive: 0,
  wardensActive: 0,
  wardensSilenced: 0,
  civiliansSlipped: 0,
  slimePuddlesActive: 0,
  isSqueeze: false,
  fps: 60,
  hazmatDamageDealt: 0,
  occludedBuildingsCount: 0,
  score: 0,
  trafficActive: 0,
  errors: runtimeErrors,
};

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.container = document.getElementById('game-container');

    // UI Elements
    this.hordeCountEl = document.getElementById('horde-count');
    this.hordeBarFill = document.getElementById('horde-bar-fill');
    this.civCountEl = document.getElementById('civ-count');
    this.strayCountEl = document.getElementById('stray-count');
    this.panicValEl = document.getElementById('panic-val');
    this.fpsEl = document.getElementById('fps-val');
    this.drawCallsEl = document.getElementById('draw-calls');
    this.toastEl = document.getElementById('toast-banner');
    this.stageBannerEl = document.getElementById('stage-banner');
    this.currentStage = 1;
    this.stageName = 'STAGE 1: OUTBREAK DAWN';
    this._stageBannerTimer = null;
    this.frenzyBtn = document.getElementById('btn-frenzy');
    this.cooldownCircle = document.getElementById('cooldown-circle');
    this.cooldownCircumference = 2 * Math.PI * 44; // ~276.46
    this.scoreEl = document.getElementById('score-val');
    this.comboEl = document.getElementById('combo-display');
    this.abilityBtn = document.getElementById('btn-ability');
    this.joystickToggleBtn = document.getElementById('btn-joystick-mode');

    // New Arcade & Hazard UI Elements
    this.sprayDangerOverlayEl = document.getElementById('spray-danger-overlay');
    this.gameOverModalEl = document.getElementById('game-over-modal');
    this.gameOverReasonEl = document.getElementById('game-over-reason');
    this.goFinalScoreEl = document.getElementById('game-over-score');
    this.goFinalHordeEl = document.getElementById('game-over-horde');
    this.goFinalTimeEl = document.getElementById('game-over-time');
    this.btnGameOverRestart = document.getElementById('btn-game-over-restart');

    // Finite State Machine: [STATE_MENU, STATE_PLAYING, STATE_LAST_STAND, STATE_INITIALS_ENTRY, STATE_LEADERBOARD]
    this.gameState = 'STATE_MENU';

    // Main Menu UI Elements
    this.mainMenuOverlayEl = document.getElementById('main-menu-overlay');
    this.btnStartGame = document.getElementById('btn-start-game');
    this.btnMenuLeaderboard = document.getElementById('btn-menu-leaderboard');
    this.diffPills = document.querySelectorAll('.diff-pill');
    this.btnGameOverMenu = document.getElementById('btn-game-over-menu');

    // Storage & Leaderboard System (@designer & @qa)
    this.storageSystem = new StorageSystem();
    this.activeDifficulty = 'outbreak';
    this.gameTime = 0;
    this.peakHorde = 1;

    // Retro Arcade Initials Tumbler State (@artist & @designer)
    this.tumblerModalEl = document.getElementById('initials-modal');
    this.initialsScorePreviewEl = document.getElementById('initials-final-score');
    this.initialsRankEl = document.getElementById('initials-rank');
    this.btnInitialsPrev = document.getElementById('btn-initials-prev');
    this.btnInitialsConfirm = document.getElementById('btn-initials-confirm');
    this.tumblerSlots = [
      document.querySelector('.tumbler-slot[data-slot="0"]'),
      document.querySelector('.tumbler-slot[data-slot="1"]'),
      document.querySelector('.tumbler-slot[data-slot="2"]')
    ];
    this.tumblerCharEls = [
      document.getElementById('tumbler-char-0'),
      document.getElementById('tumbler-char-1'),
      document.getElementById('tumbler-char-2')
    ];
    this.tumblerChars = ['A', 'A', 'A'];
    this.activeTumblerSlot = 0;
    this.tumblerAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
    this.isEnteringInitials = false;
    this._pendingHighScoreData = null;

    // Leaderboard UI Elements
    this.standaloneLeaderboardModalEl = document.getElementById('standalone-leaderboard-modal');
    this.btnViewLeaderboard = document.getElementById('btn-view-leaderboard');
    this.btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
    this.leaderboardRowsEl = document.getElementById('leaderboard-rows');
    this.standaloneLeaderboardRowsEl = document.getElementById('standalone-leaderboard-rows');

    // Alone & Hunted Survival Countdown Banner (@designer)
    this.aloneWarningEl = document.getElementById('alone-warning');
    this.aloneBarFillEl = document.getElementById('alone-bar-fill');
    this.aloneCountdownTextEl = document.getElementById('alone-countdown-text');

    // Last Stand Hazmat Mist Circular Countdown Widget (@designer & @artist)
    this.mistWidgetEl = document.getElementById('mist-countdown-widget');
    this.mistRingFillEl = document.getElementById('mist-ring-fill');
    this.mistTimerTextEl = document.getElementById('mist-timer-text');

    this.isGameOver = false;
    this.debrisList = [];
    this.hazmatDamageDealt = 0;
    this._currentFps = 60;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1a); // Dark night sky
    this.scene.fog = new THREE.Fog(0x0a0f1a, 60, 200);

    // Dynamic Street Lamps (4 closest)
    this.dynamicLamps = [];
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(0xfff5d6, 1.5, 25.0); // Warm bright bulb
      pl.castShadow = false; // Disable shadows for performance
      pl.position.set(0, -100, 0); // Hide initially
      this.scene.add(pl);
      this.dynamicLamps.push(pl);
    }

    // Dynamic Stop Lights
    this.stopLightGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    this.stopLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.stopLightMesh = new THREE.InstancedMesh(this.stopLightGeo, this.stopLightMat, 400); // 400 max bulbs
    this.stopLightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.stopLightMesh);
    
    // We preallocate a dummy matrix to hide unused lights
    this._hiddenMatrix = new THREE.Matrix4().makeScale(0,0,0);
    this._stopLightColors = {
      red: new THREE.Color(3.0, 0.1, 0.1),    // Intense Bloom Red
      yellow: new THREE.Color(2.5, 1.8, 0.1), // Intense Bloom Yellow
      green: new THREE.Color(0.1, 3.0, 0.3),  // Intense Bloom Green
      off: new THREE.Color(0.05, 0.05, 0.05)
    };

    // Camera (Narrow FOV 36 for isometric feel with depth)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.5, 500);
    this.cameraController = new CameraController(this.camera, {
      baseHeight: 18.0,
      k: 1.35,
    });

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    // Context Loss Handling
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.gameState === 'STATE_PLAYING') {
        this.gameState = 'STATE_MENU'; // Pause game logic
      }
      this._showToast('⚠️ WEBGL CONTEXT LOST - PAUSED');
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this._setupPostProcessing(); // Re-init composer
      this._showToast('✅ GRAPHICS RECOVERED');
    });

    // P5: Adaptive shadow quality — downgrade on low-end / mobile
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const maxTex = this.renderer.capabilities.maxTextureSize;
    if (isMobile || maxTex < 4096) {
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this._shadowMapSize = 1024;
    } else {
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this._shadowMapSize = 2048;
    }

    // Use ACESFilmicToneMapping with exposure 1.3 for bright, readable, vibrant scene
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    // V1: Post-Processing Composer (Bloom + Vignette)
    this._setupPostProcessing();

    // Lighting & Atmosphere
    this._setupLighting();

    // E1/E3: Street lamp and fire PointLight pools (budget: 12 lights max)
    this._lampLights = [];
    this._fireLights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffdf88, 0, 14, 1.5);
      l.castShadow = false;
      this._lampLights.push(l);
      this.scene.add(l);
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff4400, 0, 8);
      l.castShadow = false;
      this._fireLights.push(l);
      this.scene.add(l);
    }

    // 1. Spatial Hash Grid for Obstacles & Entity Queries
    this.spatialGrid = new SpatialGrid(4.0);

    // 2. Infinite Procedural City Streamer (5x5 chunk window = 320x320m active area)
    this.cityStreamer = new CityStreamer(this.scene, { renderDistance: 2 });
    this.cityStreamer.init(0, 0, this.spatialGrid);

    // 3. Particles, Character Instanced Renderer, Entity Manager, and Powerup Manager
    this.particles = new ParticleSystem(this.scene, 700);
    this.renderer3D = new InstancedRenderer(this.scene, 1200);
    this.entityManager = new EntityManager(Infinity);
    this.entityManager.cityStreamer = this.cityStreamer;
    this.entityManager.scene = this.scene;
    this.entityManager.particles = this.particles;
    this.powerupManager = new PowerupManager(this.scene);

    // 4. Audio System (E6)
    this.audioSystem = new AudioSystem();

    // 5. Input Controller with Squeeze Support
    this.squeezeBtn = document.getElementById('btn-squeeze');
    this.wardensSilencedCount = 0;
    this.civiliansSlippedCount = 0;
    this.inputController = new InputController(
      this.container,
      this.frenzyBtn,
      (dirX, dirZ) => this._onAvatarTransferRequest(dirX, dirZ),
      () => this._onFrenzyRequest(),
      (active) => this._onSqueezeChange(active),
      this.squeezeBtn
    );

    // 6. Camera building occlusion raycasting & transparency state
    this.occlusionRaycaster = new THREE.Raycaster();
    this.rayTarget = new THREE.Vector3();
    this.rayDir = new THREE.Vector3();
    this.fadedBuildings = new Set();
    this.occludedBuildingsCount = 0;

    // FPS & Timing
    this.lastTime = performance.now();
    this.fpsTimer = 0;
    this.frameCount = 0;
    this._vignetteFlashTime = 0;

    // G4: Milestone ability state
    this._currentAbility = null;  // 'aoe_burst' | 'fear_wave'
    this._abilityCooldown = 0;

    // Dynamic Moving Traffic Hazard System
    this.trafficManager = new TrafficManager(this.scene);
    this.trafficManager.setDifficulty(this.activeDifficulty);

    // Bind Entity Callbacks
    this._setupEntityEvents();

    // Bind Main Menu, Toolbar, and Leaderboard Events
    this._setupMainMenu();
    this._setupToolbar();
    this._bindLeaderboardAndTumblerEvents();

    // Handle Resize
    window.addEventListener('resize', () => this._onResize());

    // Initialize world geometry for title screen backdrop, but keep simulation in STATE_MENU
    this.cityStreamer.init(0, 0, this.spatialGrid);
    this.returnToMenu();

    // Start Audio on first interaction
    const startAudio = () => {
      this.audioSystem.start();
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });

    // Start Animation Loop
    requestAnimationFrame((t) => this._loop(t));

    // 6. Asynchronously Load Kenney Assets
    this._loadExternalKenneyAssets();
  }

  _setupPostProcessing() {
    // V1: EffectComposer with Bloom + Vignette
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,   // strength — balanced
      0.5,    // radius
      0.85    // threshold — to catch particles and UI
    );
    this.composer.addPass(this.bloomPass);

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms.darkness.value = 0.85; // Light vignette
    this.composer.addPass(vignettePass);
  }

  _updateDynamicLights() {
    const px = this.entityManager.patientZero.x;
    const pz = this.entityManager.patientZero.z;

    // 1. Update Dynamic Street Lamps (4 Closest)
    const allLamps = this.cityStreamer.getAllLampPositions();
    
    // Sort lamps by distance to player
    allLamps.sort((a, b) => {
      const distA = (a.x - px)**2 + (a.z - pz)**2;
      const distB = (b.x - px)**2 + (b.z - pz)**2;
      return distA - distB;
    });

    for (let i = 0; i < 4; i++) {
      if (i < allLamps.length) {
        // Place light just below the lamp head
        this.dynamicLamps[i].position.set(allLamps[i].x, 3.6, allLamps[i].z);
      } else {
        this.dynamicLamps[i].position.set(0, -100, 0); // Hide
      }
    }

    // 2. Update Intersection Stop Lights Cycle
    const allStopLights = this.cityStreamer.getAllStopLightPositions();
    const cycleTime = (Date.now() / 1000) % 12.0; // 12 second full cycle
    
    // Logic: Red (0-5s), Green (5-10s), Yellow (10-12s)
    let activeColor = 'red';
    let activeOffset = 0.28; // Red is top bulb
    
    if (cycleTime >= 5.0 && cycleTime < 10.0) {
      activeColor = 'green';
      activeOffset = -0.28; // Green is bottom bulb
    } else if (cycleTime >= 10.0) {
      activeColor = 'yellow';
      activeOffset = 0.0; // Yellow is middle bulb
    }

    let instanceIdx = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < allStopLights.length; i++) {
      if (instanceIdx >= 397) break; // Keep under max 400
      
      const sl = allStopLights[i];
      q.setFromAxisAngle(new THREE.Vector3(0,1,0), sl.rotY);
      
      // Draw 3 bulbs per pole (Red, Yellow, Green)
      const offsets = [0.28, 0.0, -0.28];
      const colors = ['red', 'yellow', 'green'];
      
      for (let j = 0; j < 3; j++) {
        m4.compose(new THREE.Vector3(sl.x, sl.y + offsets[j], sl.z), q, s);
        this.stopLightMesh.setMatrixAt(instanceIdx, m4);
        
        // Emissive bloom color if active, dull grey if off
        if (colors[j] === activeColor) {
          this.stopLightMesh.setColorAt(instanceIdx, this._stopLightColors[activeColor]);
        } else {
          this.stopLightMesh.setColorAt(instanceIdx, this._stopLightColors.off);
        }
        
        instanceIdx++;
      }
    }

    this.stopLightMesh.count = instanceIdx;
    this.stopLightMesh.instanceMatrix.needsUpdate = true;
    if (this.stopLightMesh.instanceColor) {
      this.stopLightMesh.instanceColor.needsUpdate = true;
    }
  }

  async _loadExternalKenneyAssets() {
    const assetLoader = new AssetLoader();
    const loaded = await assetLoader.loadAll();

    if (loaded.buildingModels && loaded.buildingModels.length > 0) {
      // P7: In-place apply Kenney buildings without full re-stream
      this.cityStreamer.applyKenneyAssets(
        loaded.buildingModels,
        loaded.textures?.colormap,
        this.spatialGrid
      );
    }

    if (loaded.characterGeometry || loaded.textures) {
      this.renderer3D.applyKenneyAssets(loaded.characterGeometry, loaded.textures);
      this._showToast('KENNEY CITY & CHARACTERS LOADED!');
    }
  }

  _setupLighting() {
    // 1. AmbientLight: warm buttery cream (#fff7ed) fill to eliminate pitch-black shadows
    this.ambientLight = new THREE.AmbientLight(0xfff7ed, 0.7);
    this.scene.add(this.ambientLight);

    // 2. HemisphereLight: Sky blue (#93c5fd) ground bounce warm lawn green (#bbf7d0) at intensity 1.2
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0xbbf7d0, 1.2);
    this.scene.add(this.hemiLight);

    // 3. Directional sun light: Warm buttery cream (#fff7ed) at intensity 1.8, angled at 45 degrees
    // Global illumination (reduced for nighttime vibe)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xa5b4fc, 0.35); // Cool moonlight
    this.dirLight.position.set(40, 70, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = this._shadowMapSize || 2048;
    this.dirLight.shadow.mapSize.height = this._shadowMapSize || 2048;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 180;
    this.dirLight.shadow.camera.left = -55;
    this.dirLight.shadow.camera.right = 55;
    this.dirLight.shadow.camera.top = 55;
    this.dirLight.shadow.camera.bottom = -55;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
  }

  _setupEntityEvents() {
    // Powerup Events
    this.powerupManager.entityManager = this.entityManager;
    this.powerupManager.cityStreamer = this.cityStreamer;
    this.powerupManager.onPowerupCollected = (powerup) => {
      this.audioSystem.playPowerupCollect();
      this._triggerVignetteFlash();
      this.inputController.vibrate(60);
      const name = powerup?.type?.name || 'POWER-UP';
      this._showToast(`⚡ ${name.toUpperCase()} ACTIVATED!`);
      if (powerup) {
        this._showFloatingText(name.toUpperCase(), powerup.x, powerup.z, 'fct-powerup');
      }
    };

    this.entityManager.onInfection = (x, z, totalZombies) => {
      this.particles.burstInfection(x, z);
      this.particles.burstInfectionDroplets(x, z, 6);
      this._bumpHordeUI();
      this._showToast('⚠️ HUMAN INFECTED!');
      this.audioSystem.playInfectionSting(1);
      // C3: Haptic via inputController
      this.inputController.vibrate(25);
      this._showFloatingText('+1', x, z, 'fct-infection');
    };

    this.entityManager.onComboInfection = (combo, score, x, z) => {
      // G1: Combo feedback
      this.audioSystem.playComboStab(combo);
      this._showCombo(combo, score);
      if (combo > 1) {
        this._showFloatingText(`${combo}x COMBO!`, x, z, 'fct-combo');
      }
    };

    this.entityManager.onZombieRecruited = (x, z, totalZombies) => {
      this.particles.burstInfection(x, z);
      this.particles.burstInfectionDroplets(x, z, 6);
      this._bumpHordeUI();
      this._showToast('🧟 STRAY ZOMBIE JOINED THE HORDE!');
      this._showFloatingText('+1 RECRUIT', x, z, 'fct-infection');
    };

    this.entityManager.onPanicEscalation = (msg) => {
      this._showToast(msg);
    };

    this.entityManager.onCured = (x, z) => {
      this.hazmatDamageDealt++;
      this.particles.burstCure(x, z);
      this._showToast('⚠️ ZOMBIE DECONTAMINATED!');
      this._showFloatingText('CURED -1', x, z, 'fct-cured');
    };

    this.entityManager.onAvatarTransfer = (oldPos, newPos) => {
      this.particles.burstTransfer(oldPos, newPos);
      this._showToast('HOST TRANSFERRED!');
    };

    this.entityManager.onHazmatDestroyed = (x, z) => {
      for (let i = 0; i < 3; i++) {
        this.particles.burstInfection(x, z);
      }
      this.particles.burstInfectionDroplets(x, z, 10);
      this.audioSystem.playExplosion();
      this.cameraController.triggerShake(0.25, 0.4);
      this._showFloatingText('+50 HAZMAT DOWN!', x, z, 'fct-powerup');
    };

    this.entityManager.onAmbulanceDetonated = (x, z) => {
      this.audioSystem.playExplosion();
      this._showToast('💥 AMBULANCE LOOTED!');
      this._showFloatingText('MICRO-OBJECTIVE +250', x, z, 'fct-powerup');
      
      // Spawn powerup at location
      if (this.powerupManager) {
        // Drop a random powerup when an ambulance is detonated
        this.powerupManager.spawnPowerup(x, z);
      }
    };

    // Prop knocked by bulldozer horde
    this.entityManager.onPropKnocked = (prop, hitDirX, hitDirZ) => {
      this.audioSystem.playPropCrash();
      this.particles.burstDustCloud(prop.x, prop.z, 8);
      this._spawnDebris(prop, hitDirX, hitDirZ);
      this.cameraController.triggerShake(0.12, 0.25);
      this._showFloatingText('+25 CRUSH!', prop.x, prop.z, 'fct-combo');
    };

    // Explosion (Bloater Bomb)
    this.entityManager.onExplosion = (x, z) => {
      this.audioSystem.playExplosion();
      this.cameraController.triggerShake(0.4, 0.7);
      this.particles.burstDustCloud(x, z, 16);
      this._showFloatingText('💥 BOOM!', x, z, 'fct-powerup');
    };

    // Horde decontamination spray tracking
    this.entityManager.onHazmatDamageDealt = (dt) => {
      this.hazmatDamageDealt += dt;
    };

    // Patient Zero sprayed feedback (@designer & @qa)
    this.entityManager.onPatientZeroSprayed = (dt, progress, timeLeft) => {
      if (progress > 0) {
        this.hazmatDamageDealt += dt;
      }
      if (this.sprayDangerOverlayEl) {
        this.sprayDangerOverlayEl.style.opacity = Math.min(1.0, progress * 1.2);
      }
      if (this.mistWidgetEl && this.mistRingFillEl && this.mistTimerTextEl) {
        if (progress > 0 && this.entityManager.zombies.length === 0 && !this.isGameOver) {
          this.mistWidgetEl.classList.remove('hidden');
          const circumference = 163.36; // 2 * Math.PI * 26
          const offset = circumference * (1.0 - progress);
          this.mistRingFillEl.style.strokeDashoffset = offset;
          this.mistTimerTextEl.textContent = (timeLeft !== undefined ? timeLeft : 5.0).toFixed(1) + 's';
        } else {
          this.mistWidgetEl.classList.add('hidden');
        }
      }
    };

    // Game Over
    this.entityManager.onGameOver = (reason) => {
      if (this.isGameOver) return;
      this.isGameOver = true;
      if (window.__GAME_STATE__) {
        window.__GAME_STATE__.isGameOver = true;
      }
      this.audioSystem.playGameOver();
      this.cameraController.triggerShake(0.5, 0.8);
      if (this.aloneWarningEl) {
        this.aloneWarningEl.classList.add('hidden');
      }
      if (this.mistWidgetEl) {
        this.mistWidgetEl.classList.add('hidden');
      }

      const finalScore = this.entityManager.score || 0;
      const finalHorde = Math.max(this.peakHorde, this.entityManager.zombies.length + (this.entityManager.patientZero ? 1 : 0));
      const finalTimeStr = this.storageSystem.formatTime(this.gameTime);

      if (this.gameOverReasonEl) {
        if (reason === 'QUARANTINED!') {
          this.gameOverReasonEl.textContent = 'QUARANTINED BY HAZMAT CHEMICAL SPRAY!';
        } else if (reason === 'SNIPED_ALONE') {
          this.gameOverReasonEl.textContent = 'SNIPED WHILE ALONE! The lone carrier was eliminated!';
        } else if (reason === 'HORDE_WIPED_OUT') {
          this.gameOverReasonEl.textContent = 'HORDE EXTERMINATED! You were cornered and hunted down!';
        } else {
          this.gameOverReasonEl.textContent = 'ALL HORDE MEMBERS WERE ELIMINATED!';
        }
      }
      if (this.goFinalScoreEl) {
        this.goFinalScoreEl.textContent = finalScore.toLocaleString();
      }
      if (this.goFinalHordeEl) {
        this.goFinalHordeEl.textContent = finalHorde;
      }
      if (this.goFinalTimeEl) {
        this.goFinalTimeEl.textContent = finalTimeStr;
      }

      // Check if player qualifies for Top 5 High Score
      if (this.storageSystem.isHighScore(finalScore, this.activeDifficulty)) {
        this.gameState = 'STATE_INITIALS_ENTRY';
        this._openInitialsModal(finalScore, finalHorde, finalTimeStr);
      } else {
        this.gameState = 'STATE_LEADERBOARD';
        this._showGameOverModal(null);
      }
    };

    // Alone & Hunted Survival Countdown (@designer)
    this.entityManager.onAloneStateChanged = (isActive, remainingTime, maxTime) => {
      if (!this.aloneWarningEl) return;
      if (isActive && !this.isGameOver) {
        this.gameState = 'STATE_LAST_STAND';
        this.aloneWarningEl.classList.remove('hidden');
        if (this.aloneBarFillEl) {
          const pct = Math.max(0, Math.min(100, (remainingTime / maxTime) * 100));
          this.aloneBarFillEl.style.width = pct + '%';
        }
        if (this.aloneCountdownTextEl) {
          this.aloneCountdownTextEl.textContent = remainingTime.toFixed(1) + 's';
        }
      } else {
        if (!this.isGameOver && this.gameState === 'STATE_LAST_STAND') {
          this.gameState = 'STATE_PLAYING';
        }
        this.aloneWarningEl.classList.add('hidden');
      }
    };

    // G4: Milestone ability unlocks
    this.entityManager.onMilestoneUnlock = (milestone) => {
      if (milestone === 10) {
        this._currentAbility = 'aoe_burst';
        this._showToast('🧟 HORDE MILESTONE: AOE BURST UNLOCKED!');
      } else if (milestone === 25) {
        this._currentAbility = 'fear_wave';
        this._showToast('🧟 HORDE MILESTONE: FEAR WAVE UNLOCKED!');
      } else if (milestone === 50) {
        this._showToast('💀 MAX HORDE: UNSTOPPABLE!');
      }
      this._updateAbilityButton();
    };

    // Titan Virus Callbacks
    this.entityManager.onTitanActivated = () => {
      this.audioSystem.playTitanRoar();
      this.cameraController.triggerShake(0.45, 0.6);
      if (this.entityManager.patientZero) {
        this._showFloatingText('☣️ TITAN VIRUS!', this.entityManager.patientZero.x, this.entityManager.patientZero.z, 'fct-titan');
      }
      this._showToast('☣️ TITAN VIRUS: 3X SCALE & UNSTOPPABLE STOMP!');
    };

    this.entityManager.onTitanExpired = () => {
      this.cameraController.triggerShake(0.25, 0.3);
      this._showToast('TITAN MODE EXPIRED');
    };

    this.entityManager.onTitanFootstep = (x, z) => {
      this.audioSystem.playTitanStomp();
    };

    // Military Rifleman Callbacks
    this.entityManager.onMilitarySnipe = (x, z) => {
      this.audioSystem.playGunshot();
      this.cameraController.triggerShake(0.28, 0.3);
    };

    this.entityManager.onMilitaryInfected = (x, z) => {
      this.audioSystem.playInfectionSting(2);
      this.cameraController.triggerShake(0.2, 0.25);
      this._showFloatingText('+SOLDIER INFECTED!', x, z, 'fct-military');
      this._showToast('🎖️ SOLDIER INFECTED!');
    };

    this.entityManager.onMilitaryCasualty = (x, z, count) => {
      this._showFloatingText(`-${count} HORDE!`, x, z, 'fct-damage');
      this.cameraController.triggerShake(0.32, 0.35);
    };

    this.entityManager.onWardenSilenced = (x, z) => {
      this.wardensSilencedCount = (this.wardensSilencedCount || 0) + 1;
      this.audioSystem.playExplosion();
      this.cameraController.triggerShake(0.3, 0.45);
      this._showToast('📢 WARDEN SILENCED! FOLLOWERS FROZEN IN FEAR!');
      this._showFloatingText('+150 WARDEN SILENCED!', x, z, 'fct-warden');
      this.inputController.vibrate([40, 20, 40]);
    };

    this.entityManager.onCivilianSlipped = (x, z) => {
      this.civiliansSlippedCount = (this.civiliansSlippedCount || 0) + 1;
      this.audioSystem.playSlimeSlip();
      this._showFloatingText('SLIP!', x, z, 'fct-slip');
    };

    this.entityManager.onMegaphoneChant = (x, z) => {
      this.audioSystem.playMegaphoneChant();
    };

    this.entityManager.onCameraShake = (intensity, duration) => {
      this.cameraController.triggerShake(intensity, duration);
    };

    // Progressive Difficulty Curve Stage Changes
    this.entityManager.onStageChanged = (stage, stageName) => {
      this.currentStage = stage;
      this.stageName = stageName;
      this._showStageBanner(stageName);
    };
  }

  _showStageBanner(text) {
    if (!this.stageBannerEl) return;
    this.stageBannerEl.textContent = text;
    this.stageBannerEl.classList.remove('hidden');
    this.stageBannerEl.classList.add('stage-banner-active');
    if (this._stageBannerTimer) clearTimeout(this._stageBannerTimer);
    this._stageBannerTimer = setTimeout(() => {
      if (this.stageBannerEl) {
        this.stageBannerEl.classList.remove('stage-banner-active');
        this.stageBannerEl.classList.add('hidden');
      }
    }, 3200);
  }

  _showFloatingText(text, worldX, worldZ, colorClass = '') {
    if (!this.container || !this.camera) return;
    const tempVec = new THREE.Vector3(worldX, 1.6, worldZ);
    tempVec.project(this.camera);
    if (tempVec.z > 1) return;

    const screenX = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = `floating-combat-text ${colorClass}`.trim();
    el.textContent = text;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.container.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 900);
  }

  _spawnDebris(prop, hitDirX, hitDirZ) {
    let geom;
    let matColor = 0x94a3b8;
    if (prop.type === 'lamp') {
      geom = new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6);
      matColor = 0x475569;
    } else if (prop.type === 'hydrant') {
      geom = new THREE.CylinderGeometry(0.24, 0.28, 0.7, 8);
      matColor = 0xef4444;
    } else {
      geom = new THREE.CylinderGeometry(0.3, 0.26, 0.75, 8);
      matColor = 0x64748b;
    }
    const mat = new THREE.MeshToonMaterial({
      color: matColor,
      gradientMap: this.renderer3D.gradientMap
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.position.set(prop.x, 0.5, prop.z);
    this.scene.add(mesh);

    const speed = 11 + Math.random() * 8;
    const vx = hitDirX * speed + (Math.random() - 0.5) * 4;
    const vy = 6 + Math.random() * 5;
    const vz = hitDirZ * speed + (Math.random() - 0.5) * 4;

    this.debrisList.push({
      mesh,
      x: prop.x,
      y: 0.5,
      z: prop.z,
      vx, vy, vz,
      rx: (Math.random() - 0.5) * 16,
      ry: (Math.random() - 0.5) * 16,
      rz: (Math.random() - 0.5) * 16,
      life: 2.2,
      bounces: 0
    });
  }

  _restartGame() {
    this.gameState = 'STATE_PLAYING';
    this.isGameOver = false;
    this.gameTime = 0;
    this.peakHorde = 1;
    this._closeInitialsModal();
    if (this.mainMenuOverlayEl) {
      this.mainMenuOverlayEl.style.display = 'none';
      this.mainMenuOverlayEl.classList.add('hidden');
    }
    if (this.standaloneLeaderboardModalEl) {
      this.standaloneLeaderboardModalEl.style.display = 'none';
      this.standaloneLeaderboardModalEl.classList.add('hidden');
    }
    if (this.gameOverModalEl) {
      this.gameOverModalEl.style.display = 'none';
      this.gameOverModalEl.classList.add('hidden');
    }
    if (this.sprayDangerOverlayEl) {
      this.sprayDangerOverlayEl.style.opacity = '0';
    }

    for (const d of this.debrisList) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
    }
    this.debrisList = [];

    this.cityStreamer.init(0, 0, this.spatialGrid);
    this.entityManager.init(50);
    this.entityManager.score = 0;
    this.entityManager.speedSurgeTimer = 0;
    this.entityManager.meatMagnetTimer = 0;
    this.entityManager.isSprayInvulnerable = false;
    this.entityManager.pzSprayTime = 0;
    this.hazmatDamageDealt = 0;
    this.wardensSilencedCount = 0;
    this.civiliansSlippedCount = 0;
    this.currentStage = 1;
    this.stageName = 'STAGE 1: OUTBREAK DAWN';
    this._showStageBanner('STAGE 1: OUTBREAK DAWN');
    if (this.trafficManager) {
      this.trafficManager.setDifficulty(this.activeDifficulty);
      this.trafficManager.reset();
    }
    if (this.fadedBuildings) {
      for (const mesh of this.fadedBuildings) {
        if (mesh && mesh.material) {
          mesh.material.opacity = 1.0;
          mesh.material.transparent = false;
        }
      }
      this.fadedBuildings.clear();
    }
    if (this.aloneWarningEl) {
      this.aloneWarningEl.classList.add('hidden');
    }
    if (this.mistWidgetEl) {
      this.mistWidgetEl.classList.add('hidden');
    }
    if (this.powerupManager) {
      this.powerupManager.reset();
    }
    this.occludedBuildingsCount = 0;
    this.cameraController.snapTo(this.entityManager.patientZero);
    this._showToast('SIMULATION RESET');
  }

  startGame(difficulty = this.activeDifficulty) {
    this.activeDifficulty = difficulty;
    if (this.storageSystem) {
      this.storageSystem.activeDifficulty = difficulty;
    }
    if (this.trafficManager) {
      this.trafficManager.setDifficulty(difficulty);
    }
    this._restartGame();
    this.audioSystem.start();
  }

  returnToMenu() {
    this.gameState = 'STATE_MENU';
    if (window.__GAME_STATE__) {
      window.__GAME_STATE__.gameState = 'STATE_MENU';
    }
    this.isGameOver = false;
    this.gameTime = 0;
    this.peakHorde = 1;
    this.currentStage = 1;
    this.stageName = 'STAGE 1: OUTBREAK DAWN';
    this._closeInitialsModal();
    if (this.stageBannerEl) {
      this.stageBannerEl.classList.remove('stage-banner-active');
      this.stageBannerEl.classList.add('hidden');
    }
    if (this.standaloneLeaderboardModalEl) {
      this.standaloneLeaderboardModalEl.style.display = 'none';
      this.standaloneLeaderboardModalEl.classList.add('hidden');
    }
    if (this.gameOverModalEl) {
      this.gameOverModalEl.style.display = 'none';
      this.gameOverModalEl.classList.add('hidden');
    }
    if (this.aloneWarningEl) {
      this.aloneWarningEl.classList.add('hidden');
    }
    if (this.mistWidgetEl) {
      this.mistWidgetEl.classList.add('hidden');
    }
    if (this.sprayDangerOverlayEl) {
      this.sprayDangerOverlayEl.style.opacity = '0';
    }
    if (this.trafficManager) {
      this.trafficManager.reset();
    }
    for (const d of this.debrisList) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
    }
    this.debrisList = [];

    // Clear active entities in STATE_MENU
    this.entityManager.zombies = [];
    this.entityManager.strayZombies = [];
    this.entityManager.civilians = [];
    this.entityManager.hazmats = [];
    this.entityManager.militaryUnits = [];
    this.entityManager.wardens = [];
    this.entityManager.patientZero = null;

    if (this.mainMenuOverlayEl) {
      this.mainMenuOverlayEl.style.display = 'flex';
      this.mainMenuOverlayEl.classList.remove('hidden');
    }
    this._updateHUD(0);
  }

  _setupMainMenu() {
    if (this.diffPills) {
      this.diffPills.forEach(pill => {
        pill.addEventListener('click', () => {
          this.diffPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const diff = pill.dataset.diff || 'outbreak';
          this.activeDifficulty = diff;
          if (this.btnStartGame) {
            const label = diff === 'martial_law' ? 'MARTIAL LAW' : diff.toUpperCase();
            this.btnStartGame.textContent = `START ${label} ▶`;
          }
        });
      });
    }

    if (this.btnStartGame) {
      this.btnStartGame.addEventListener('click', () => {
        this.startGame(this.activeDifficulty);
      });
    }

    if (this.btnMenuLeaderboard) {
      this.btnMenuLeaderboard.addEventListener('click', () => {
        this._openStandaloneLeaderboard();
      });
    }

    if (this.btnGameOverMenu) {
      this.btnGameOverMenu.addEventListener('click', () => {
        this.returnToMenu();
      });
    }
  }

  _setupToolbar() {
    document.getElementById('btn-add-civs').addEventListener('click', () => {
      const pz = this.entityManager.patientZero;
      const px = pz ? pz.x : 0;
      const pzZ = pz ? pz.z : 0;
      for (let i = 0; i < 50; i++) {
        // Distribute civilians along the forward avenue path for direct horde contact
        const forwardDist = 0.5 + (i * 0.25);
        const lateralSpread = (Math.random() - 0.5) * 3.5;
        this.entityManager.spawnCivilian(px + lateralSpread, pzZ - forwardDist);
      }
      this._showToast('+50 CIVILIANS SPAWNED');
    });

    document.getElementById('btn-spawn-hazmat').addEventListener('click', () => {
      const pz = this.entityManager.patientZero;
      const px = pz ? pz.x : 0;
      const pzZ = pz ? pz.z : 0;
      this.entityManager.spawnHazmat(px + (Math.random() - 0.5) * 3, pzZ - (5 + Math.random() * 5));
      this._showToast('⚠️ HAZMAT UNIT DEPLOYED');
    });

    const btnMilitary = document.getElementById('btn-spawn-military');
    if (btnMilitary) {
      btnMilitary.addEventListener('click', () => {
        const pz = this.entityManager.patientZero;
        const px = pz ? pz.x : 0;
        const pzZ = pz ? pz.z : 0;
        this.entityManager.spawnMilitary(px + (Math.random() - 0.5) * 4, pzZ - (8 + Math.random() * 5));
        this._showToast('🎖️ MILITARY SQUAD DEPLOYED');
      });
    }

    const btnWarden = document.getElementById('btn-spawn-warden');
    if (btnWarden) {
      btnWarden.addEventListener('click', () => {
        const pz = this.entityManager.patientZero;
        const px = pz ? pz.x : 0;
        const pzZ = pz ? pz.z : 0;
        this.entityManager.spawnWarden(px + (Math.random() - 0.5) * 4, pzZ - (10 + Math.random() * 5));
        this._showToast('📢 MEGAPHONE WARDEN DEPLOYED');
      });
    }

    const btnTitan = document.getElementById('btn-titan');
    if (btnTitan) {
      btnTitan.addEventListener('click', () => {
        this.entityManager.activatePowerup('titan_virus');
      });
    }

    document.getElementById('btn-reset').addEventListener('click', () => {
      this._restartGame();
    });

    if (this.btnGameOverRestart) {
      this.btnGameOverRestart.addEventListener('click', () => {
        this._restartGame();
      });
    }

    // G4: Milestone ability button
    if (this.abilityBtn) {
      this.abilityBtn.addEventListener('click', () => this._useAbility());
    }

    // C2: Fixed joystick toggle
    if (this.joystickToggleBtn) {
      this.joystickToggleBtn.addEventListener('click', () => {
        const isFixed = this.inputController.toggleJoystickMode();
        this.joystickToggleBtn.textContent = isFixed ? '📌 FIXED' : '🕹️ FLOAT';
        this._showToast(isFixed ? 'FIXED JOYSTICK ON' : 'FLOATING JOYSTICK ON');
      });
    }
  }

  // G4: Execute the currently unlocked ability
  _useAbility() {
    if (!this._currentAbility || this._abilityCooldown > 0) return;
    const pz = this.entityManager.patientZero;
    if (!pz) return;

    if (this._currentAbility === 'aoe_burst') {
      // Infect all civilians within 8m
      for (let i = this.entityManager.civilians.length - 1; i >= 0; i--) {
        const c = this.entityManager.civilians[i];
        if (c.hidden) continue;
        const d = Math.hypot(c.x - pz.x, c.z - pz.z);
        if (d < 8.0) {
          this.entityManager.convertCivilianToZombie(i);
        }
      }
      this.particles.burstInfection(pz.x, pz.z);
      this.particles.burstInfection(pz.x + 2, pz.z - 2);
      this._showToast('💥 AOE INFECTION BURST!');
      this.audioSystem.playFrenzyBurst();
      this.cameraController.triggerShake(0.5, 0.4);
      this._abilityCooldown = 12.0;
    } else if (this._currentAbility === 'fear_wave') {
      // Stun all hazmats for 4 seconds
      for (const h of this.entityManager.hazmats) {
        h.stunTimer = 4.0;
      }
      this._showToast('😱 FEAR WAVE — HAZMATS STUNNED!');
      this.audioSystem.playFrenzyBurst();
      this._abilityCooldown = 15.0;
    }
  }

  _updateAbilityButton() {
    if (!this.abilityBtn) return;
    if (this._currentAbility === 'aoe_burst') {
      this.abilityBtn.style.display = 'inline-flex';
      this.abilityBtn.querySelector('.btn-icon').textContent = '💥';
      this.abilityBtn.querySelector('.btn-text').textContent = 'BURST';
    } else if (this._currentAbility === 'fear_wave') {
      this.abilityBtn.style.display = 'inline-flex';
      this.abilityBtn.querySelector('.btn-icon').textContent = '😱';
      this.abilityBtn.querySelector('.btn-text').textContent = 'FEAR';
    }
  }

  _onAvatarTransferRequest(dirX, dirZ) {
    const success = this.entityManager.transferAvatar(dirX, dirZ);
    if (!success && this.entityManager.zombies.length === 0) {
      this._showToast('NEED HORDE MEMBERS TO TRANSFER!');
    }
  }

  _onFrenzyRequest() {
    const success = this.entityManager.triggerFrenzy();
    if (success) {
      this._showToast('⚡ FRENZY ACTIVE!');
      // V6: Trigger screen shake on frenzy
      this.cameraController.triggerShake(0.35, 0.55);
      this.audioSystem.playFrenzyBurst();
      // Boost bloom briefly
      if (this.bloomPass) {
        this.bloomPass.strength = 1.2;
        setTimeout(() => { if (this.bloomPass) this.bloomPass.strength = 0.55; }, 600);
      }
    }
  }

  _onSqueezeChange(active) {
    if (!this.entityManager) return;
    this.entityManager.setSqueeze(active);
    if (window.__GAME_STATE__) {
      window.__GAME_STATE__.isSqueeze = !!active;
    }
    if (active) {
      this.audioSystem.playSqueezeWhoosh();
      this.inputController.vibrate([15, 10, 15]);
      this._showToast('🏹 SWARM SQUEEZED!');
    }
  }

  _triggerVignetteFlash() {
    this._vignetteFlashTime = 0.5; // Flash for 0.5 seconds
  }

  _bumpHordeUI() {
    if (!this.hordeCountEl) return;
    this.hordeCountEl.classList.add('bump');
    setTimeout(() => {
      if (this.hordeCountEl) this.hordeCountEl.classList.remove('bump');
    }, 150);
  }

  // G1: Show combo multiplier burst
  _showCombo(combo, score) {
    if (!this.comboEl) return;
    this.comboEl.textContent = combo > 1 ? `${combo}x COMBO!` : '';
    this.comboEl.className = 'combo-display' + (combo >= 5 ? ' combo-mega' : combo >= 3 ? ' combo-big' : '');
    if (this.scoreEl) this.scoreEl.textContent = score;
  }

  _showToast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      if (this.toastEl) this.toastEl.classList.remove('show');
    }, 1500);
  }

  // =========================================================
  // RETRO ARCADE INITIALS TUMBLER & LEADERBOARD (@artist & @designer)
  // =========================================================

  _bindLeaderboardAndTumblerEvents() {
    // 1. Keyboard event listener for arcade initials entry
    window.addEventListener('keydown', (e) => {
      if (!this.isEnteringInitials) return;

      if (e.code === 'ArrowUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        this._cycleTumblerChar(this.activeTumblerSlot, -1);
      } else if (e.code === 'ArrowDown' || e.key === 'ArrowDown') {
        e.preventDefault();
        this._cycleTumblerChar(this.activeTumblerSlot, 1);
      } else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        e.preventDefault();
        this._prevTumblerSlot();
      } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.activeTumblerSlot < 2) {
          this._setTumblerSlot(this.activeTumblerSlot + 1);
        }
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this._advanceTumblerSlot();
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        this.tumblerChars[this.activeTumblerSlot] = 'A';
        this._updateTumblerSlotChar(this.activeTumblerSlot);
        this._prevTumblerSlot();
      } else if (e.key && e.key.length === 1) {
        // Direct alphanumeric typing
        const char = e.key.toUpperCase();
        if (this.tumblerAlphabet.includes(char)) {
          e.preventDefault();
          this.tumblerChars[this.activeTumblerSlot] = char;
          this._updateTumblerSlotChar(this.activeTumblerSlot);
          this.audioSystem.playTumblerClick();
          this._advanceTumblerSlot();
        }
      }
    });

    // 2. Touch/Pointer events on arrows and slots
    document.querySelectorAll('.tumbler-arrow').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const slot = parseInt(btn.getAttribute('data-slot') || '0', 10);
        const dir = parseInt(btn.getAttribute('data-dir') || '1', 10);
        this._setTumblerSlot(slot);
        this._cycleTumblerChar(slot, dir);
      });
    });

    this.tumblerSlots.forEach((slotEl, idx) => {
      if (slotEl) {
        slotEl.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.tumbler-arrow')) return;
          e.stopPropagation();
          e.preventDefault();
          this._setTumblerSlot(idx);
        });
      }
    });

    if (this.btnInitialsPrev) {
      this.btnInitialsPrev.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._prevTumblerSlot();
      });
    }

    if (this.btnInitialsConfirm) {
      this.btnInitialsConfirm.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._advanceTumblerSlot();
      });
    }

    // 3. Toolbar and modal buttons for Leaderboard
    if (this.btnViewLeaderboard) {
      this.btnViewLeaderboard.addEventListener('click', () => {
        this._openStandaloneLeaderboard();
      });
    }

    if (this.btnCloseLeaderboard) {
      this.btnCloseLeaderboard.addEventListener('click', () => {
        this._closeStandaloneLeaderboard();
      });
    }
  }

  _openInitialsModal(score, peakHorde, timeSurvived) {
    this._pendingHighScoreData = { score, peakHorde, timeSurvived, difficulty: this.activeDifficulty };
    this.isEnteringInitials = true;
    this.tumblerChars = ['A', 'A', 'A'];
    this.activeTumblerSlot = 0;
    this._updateAllTumblerSlots();
    this._setTumblerSlot(0);

    if (this.initialsScorePreviewEl) {
      this.initialsScorePreviewEl.textContent = score.toLocaleString();
    }
    const currentScores = this.storageSystem.getScores(this.activeDifficulty);
    let previewRank = 1;
    for (let i = 0; i < currentScores.length; i++) {
      if (score <= currentScores[i].score) {
        previewRank = i + 2;
      }
    }
    if (previewRank > 5) previewRank = 5;
    if (this.initialsRankEl) {
      this.initialsRankEl.textContent = `#${previewRank}`;
    }

    if (this.tumblerModalEl) {
      this.tumblerModalEl.style.display = 'flex';
    }
    this.audioSystem.playHighScoreFanfare();
  }

  _closeInitialsModal() {
    this.isEnteringInitials = false;
    this._pendingHighScoreData = null;
    if (this.tumblerModalEl) {
      this.tumblerModalEl.style.display = 'none';
    }
  }

  _cycleTumblerChar(slotIndex, delta) {
    const curChar = this.tumblerChars[slotIndex] || 'A';
    let idx = this.tumblerAlphabet.indexOf(curChar);
    if (idx === -1) idx = 0;
    const len = this.tumblerAlphabet.length;
    idx = (idx + delta + len) % len;
    this.tumblerChars[slotIndex] = this.tumblerAlphabet[idx];
    this._updateTumblerSlotChar(slotIndex);
    this.audioSystem.playTumblerClick();
  }

  _updateTumblerSlotChar(slotIndex) {
    const charEl = this.tumblerCharEls[slotIndex];
    if (charEl) {
      charEl.textContent = this.tumblerChars[slotIndex];
    }
  }

  _updateAllTumblerSlots() {
    for (let i = 0; i < 3; i++) {
      this._updateTumblerSlotChar(i);
    }
  }

  _setTumblerSlot(slotIndex) {
    this.activeTumblerSlot = Math.max(0, Math.min(2, slotIndex));
    this.tumblerSlots.forEach((slot, idx) => {
      if (slot) {
        slot.classList.toggle('active', idx === this.activeTumblerSlot);
      }
    });
    if (this.btnInitialsConfirm) {
      this.btnInitialsConfirm.textContent = this.activeTumblerSlot === 2 ? 'SUBMIT ✓' : 'CONFIRM ▶';
    }
  }

  _advanceTumblerSlot() {
    if (this.activeTumblerSlot < 2) {
      this._setTumblerSlot(this.activeTumblerSlot + 1);
    } else {
      this._submitInitials();
    }
  }

  _prevTumblerSlot() {
    if (this.activeTumblerSlot > 0) {
      this._setTumblerSlot(this.activeTumblerSlot - 1);
    }
  }

  _submitInitials() {
    if (!this._pendingHighScoreData) return;
    const initials = this.tumblerChars.join('').trim() || 'PZ0';
    const result = this.storageSystem.addScore({
      initials,
      score: this._pendingHighScoreData.score,
      peakHorde: this._pendingHighScoreData.peakHorde,
      timeSurvived: this._pendingHighScoreData.timeSurvived,
      difficulty: this._pendingHighScoreData.difficulty,
    });
    this.audioSystem.playInitialsSubmit();
    this._closeInitialsModal();
    this._showGameOverModal(result ? result.rank : null);
  }

  _showGameOverModal(highlightRank = null) {
    if (this.gameOverModalEl) {
      this.gameOverModalEl.style.display = 'flex';
      this.gameOverModalEl.classList.remove('hidden');
    }
    this._renderLeaderboard(this.leaderboardRowsEl, highlightRank);
  }

  _openStandaloneLeaderboard() {
    if (this.standaloneLeaderboardModalEl) {
      this.standaloneLeaderboardModalEl.style.display = 'flex';
      this.standaloneLeaderboardModalEl.classList.remove('hidden');
      this._renderLeaderboard(this.standaloneLeaderboardRowsEl, null);
    }
  }

  _closeStandaloneLeaderboard() {
    if (this.standaloneLeaderboardModalEl) {
      this.standaloneLeaderboardModalEl.style.display = 'none';
      this.standaloneLeaderboardModalEl.classList.add('hidden');
    }
  }

  _renderLeaderboard(targetTbody, highlightRank = null) {
    if (!targetTbody) return;
    const scores = this.storageSystem.getScores(this.activeDifficulty);
    const medals = ['🥇 1', '🥈 2', '🥉 3', '4', '5'];
    targetTbody.innerHTML = scores.map((item, idx) => {
      const rank = idx + 1;
      const isNew = highlightRank === rank;
      const medalStr = medals[idx] || `${rank}`;
      return `
        <tr class="${isNew ? 'row-new' : ''}">
          <td class="rank-cell rank-${rank}">${medalStr}</td>
          <td class="tag-cell">${item.initials}</td>
          <td class="score-cell">${item.score.toLocaleString()}</td>
          <td>${item.peakHorde}</td>
          <td>${item.timeSurvived}</td>
          <td>${item.date}</td>
        </tr>
      `;
    }).join('');
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    
    // Responsive FOV: Widen FOV on portrait screens to prevent horizontal clipping
    this.camera.fov = aspect < 1.0 ? 50 : 36;
    
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) this.composer.setSize(width, height);
    if (this.bloomPass) this.bloomPass.resolution.set(width, height);
  }

  _loop(currentTime) {
    requestAnimationFrame((t) => this._loop(t));

    const dt = Math.max(0.001, Math.min((currentTime - this.lastTime) / 1000, 0.1));
    this.lastTime = currentTime;
    const timeSec = currentTime / 1000;

    // In STATE_MENU: Simulation paused, render idle world backdrop, update telemetry
    if (this.gameState === 'STATE_MENU') {
      if (window.__GAME_STATE__) {
        window.__GAME_STATE__.gameState = 'STATE_MENU';
      }
      this._updateHUD(0);
      this.renderer.info.reset();
      this.composer.render();
      return;
    }

    // Track active gameplay time and peak horde size
    if (!this.isGameOver) {
      this.gameTime += dt;
      const curHorde = this.entityManager.zombies.length + 1;
      if (curHorde > this.peakHorde) {
        this.peakHorde = curHorde;
      }
    }

    // 1. Input
    const inputVector = this.inputController.getInput();

    // Animate Vignette Flash
    if (this._vignetteFlashTime > 0) {
      this._vignetteFlashTime -= dt;
      // Flash to bright white, then fade back to 0.75 darkness
      const flash = Math.max(0, this._vignetteFlashTime / 0.5);
      if (this.composer && this.composer.passes[2]) {
        this.composer.passes[2].uniforms.darkness.value = 0.75 - (flash * 0.55);
      }
    } else if (this.composer && this.composer.passes[2]) {
      this.composer.passes[2].uniforms.darkness.value = 0.75;
    }

    // 2. Simulation & Population Streaming
    this.entityManager.update(dt, inputVector, this.spatialGrid, this.cityStreamer);

    // G4: Ability cooldown
    if (this._abilityCooldown > 0) {
      this._abilityCooldown = Math.max(0, this._abilityCooldown - dt);
      if (this.abilityBtn) {
        this.abilityBtn.style.opacity = this._abilityCooldown > 0 ? '0.4' : '1.0';
      }
    }

    // 3. Hazmat spray mist
    const hazmats = this.entityManager.hazmats;
    for (let i = 0; i < hazmats.length; i++) {
      const h = hazmats[i];
      if (h.sprayActive && !h.isDropping) {
        this.particles.sprayMist(h.x, h.z, h.angle, h.coneLength);
      }
      // G4: Hazmat stun decay
      if (h.stunTimer > 0) {
        h.stunTimer = Math.max(0, h.stunTimer - dt);
      }
    }

    // 4. Update Infinite City Chunks around Player & Camera
    if (this.entityManager.patientZero) {
      const pz = this.entityManager.patientZero;
      this.spatialGrid.clear();
      this.cityStreamer.update(pz.x, pz.z, this.spatialGrid);
      this.powerupManager.update(timeSec, dt, pz);

      // Dynamic Sunlight follows Patient Zero at 45 degree angle
      this.dirLight.position.set(pz.x + 40, 56.57, pz.z + 40);
      this.dirLight.target.position.set(pz.x, 0, pz.z);
      this.dirLight.target.updateMatrixWorld();

      // Comic run dust puff particles at feet when sprinting
      if (this.particles && this.particles.burstRunDust) {
        const pzSpeed = Math.hypot(pz.vx, pz.vz);
        if (pzSpeed > 2.8) {
          if (!this._lastDustPz || timeSec - this._lastDustPz > 0.09) {
            this._lastDustPz = timeSec;
            this.particles.burstRunDust(pz.x, pz.z);
          }
        }
        // Sprinting horde members
        if (this.entityManager.zombies.length > 0) {
          if (!this._lastDustHorde || timeSec - this._lastDustHorde > 0.12) {
            this._lastDustHorde = timeSec;
            const sampleCount = Math.min(2, this.entityManager.zombies.length);
            for (let k = 0; k < sampleCount; k++) {
              const rz = this.entityManager.zombies[Math.floor(Math.random() * this.entityManager.zombies.length)];
              if (rz && (rz.vx * rz.vx + rz.vz * rz.vz > 6.0)) {
                this.particles.burstRunDust(rz.x, rz.z);
              }
            }
          }
        }
      }

      // V2: Dynamic time of day — sky/sun shift from calm to dusk only at HIGH panic
      const panic = this.entityManager.panicLevel;
      // Square the panic so the scene stays bright until panic is genuinely high
      const panicSq = panic * panic;
      this.scene.background.lerpColors(SKY_CALM, SKY_PANIC, panicSq * 0.6);
      this.scene.fog.color.lerpColors(SKY_CALM, SKY_PANIC, panicSq * 0.6);
      // Sun only tints orange at very high panic
      this.dirLight.color.lerpColors(SUN_CALM, SUN_PANIC, Math.max(0, panic - 0.7) / 0.3);
      // Hemi light stays mostly bright sky color
      this.hemiLight.color.lerpColors(HEMI_SKY_CALM, HEMI_SKY_PANIC, panicSq * 0.3);

      // V1: Only boost bloom in genuine frenzy / late panic
      if (this.bloomPass) {
        this.bloomPass.strength = 0.22 + Math.max(0, panic - 0.5) * 0.3;
      }

      // E1/E3: Update street lamp + fire PointLights from active chunks
      this._updateEnvironmentLights(pz.x, pz.z, timeSec);

      // E6: Update audio panic level
      this.audioSystem.update(panic);
    }

    // 5. Dynamic camera zoom (with +40% dynamic zoom out for Titan Zombie)
    const totalSwarm = this.entityManager.zombies.length + 1;
    this.cameraController.update(this.entityManager.patientZero, totalSwarm, dt, this.entityManager.isTitan);

    // 6. Camera building occlusion raycasting & transparency fading
    if (this.entityManager.patientZero) {
      this._updateBuildingOcclusion(this.entityManager.patientZero, dt);
    }

    // 7. Update Dynamic Moving Traffic Hazard System
    if (this.trafficManager && this.entityManager.patientZero) {
      this.trafficManager.update(
        dt,
        this.entityManager.patientZero,
        this.entityManager,
        this.audioSystem,
        this.cameraController,
        this.particles,
        (txt, x, z, cls) => this._showFloatingText(txt, x, z, cls),
        this.cityStreamer,
        this.spatialGrid,
        this.gameTime
      );
    }

    // 5. Update Flying Debris Physics (Knocked props)
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const d = this.debrisList[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.debrisList.splice(i, 1);
        continue;
      }
      d.vy -= 22 * dt; // gravity
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;

      if (d.y <= 0.3) {
        d.y = 0.3;
        if (d.bounces < 2) {
          d.vy = -d.vy * 0.45;
          d.vx *= 0.6;
          d.vz *= 0.6;
          d.bounces++;
          if (this.particles) this.particles.burstDustCloud(d.x, d.z, 3);
        } else {
          d.vy = 0;
          d.vx = 0;
          d.vz = 0;
        }
      }
      d.mesh.position.set(d.x, d.y, d.z);
    }

    // 6. Update FX & Meshes
    this.particles.update(dt);
    this.renderer3D.render(this.entityManager, timeSec, dt);

    this._updateDynamicLights();

    // 7. Render via composer (V1: Bloom + Vignette)
    this.composer.render();

    // 7. HUD Telemetry
    this._updateHUD(dt);
  }

  /** E1/E3: Assign PointLights from lamp and fire positions in nearby chunks */
  _updateEnvironmentLights(px, pz, time) {
    const lampArr = [];
    const fireArr = [];

    for (const [, chunk] of this.cityStreamer.activeChunks) {
      const cdx = chunk.worldX - px;
      const cdz = chunk.worldZ - pz;
      if (Math.abs(cdx) > 100 || Math.abs(cdz) > 100) continue;
      for (const lp of chunk.lampPositions) lampArr.push(lp);
      for (const fp of chunk.firePositions) fireArr.push(fp);
    }

    const panicLevel = this.entityManager.panicLevel;
    // Street lamps: natural, gentle warm golden glow softly bathing the sidewalk and street
    const lampIntensity = 0.55 + panicLevel * 0.25;

    for (let i = 0; i < this._lampLights.length; i++) {
      const l = this._lampLights[i];
      if (i < lampArr.length) {
        l.position.set(lampArr[i].x, 3.6, lampArr[i].z);
        l.intensity = lampIntensity;
        l.distance = 14;
        l.decay = 1.5;
      } else {
        l.intensity = 0;
      }
    }

    for (let i = 0; i < this._fireLights.length; i++) {
      const l = this._fireLights[i];
      if (i < fireArr.length) {
        l.position.set(fireArr[i].x, 1.5, fireArr[i].z);
        // E3: Flickering fire light
        l.intensity = (1.8 + Math.sin(time * 8.3 + i) * 0.5) * (0.4 + panicLevel * 0.6);
        l.distance = 8;
      } else {
        l.intensity = 0;
      }
    }
  }

  /**
   * Casts ray from camera to Patient Zero and fades occluding building meshes to translucent
   */
  _updateBuildingOcclusion(pz, dt) {
    if (!pz || !this.camera || !this.cityStreamer) return;

    // Line of sight ray: from camera toward Patient Zero chest level (1.2m)
    this.rayTarget.set(pz.x, 1.2, pz.z);
    this.rayDir.subVectors(this.rayTarget, this.camera.position);
    const distToPz = this.rayDir.length();
    if (distToPz < 0.2) return;

    this.rayDir.normalize();
    this.occlusionRaycaster.set(this.camera.position, this.rayDir);
    this.occlusionRaycaster.near = 0.5;
    this.occlusionRaycaster.far = Math.max(0.5, distToPz - 0.2);

    const buildingMeshes = this.cityStreamer.getActiveBuildingMeshes();
    const intersects = this.occlusionRaycaster.intersectObjects(buildingMeshes, false);

    const currentOccluders = new Set();
    for (let i = 0; i < intersects.length; i++) {
      const obj = intersects[i].object;
      if (obj && obj.material) {
        currentOccluders.add(obj);
      }
    }

    this.occludedBuildingsCount = currentOccluders.size;
    if (window.__GAME_STATE__) {
      window.__GAME_STATE__.occludedBuildingsCount = this.occludedBuildingsCount;
    }

    // 1. Fade occluding buildings smoothly toward 0.35 opacity
    for (const mesh of currentOccluders) {
      const mat = mesh.material;
      if (!mat.transparent) {
        mat.transparent = true;
        mat.needsUpdate = true;
      }
      mat.opacity += (0.35 - mat.opacity) * 0.15;
      this.fadedBuildings.add(mesh);
    }

    // 2. Smoothly restore previously faded buildings back to 1.0 opacity
    for (const mesh of this.fadedBuildings) {
      if (!currentOccluders.has(mesh)) {
        const mat = mesh.material;
        mat.opacity += (1.0 - mat.opacity) * 0.15;
        if (mat.opacity >= 0.99) {
          mat.opacity = 1.0;
          mat.transparent = false;
          mat.needsUpdate = true;
          this.fadedBuildings.delete(mesh);
        }
      }
    }
  }

  _updateHUD(dt) {
    const pz = this.entityManager.patientZero;
    const hordeSize = pz ? this.entityManager.zombies.length + 1 : 0;
    const civCount = this.entityManager.civilians ? this.entityManager.civilians.filter(c => !c.hidden).length : 0;
    const totalUnits = hordeSize + civCount;

    if (this.hordeCountEl) {
      this.hordeCountEl.textContent = hordeSize;
    }
    if (this.civCountEl) {
      this.civCountEl.textContent = civCount;
    }
    if (this.strayCountEl) {
      this.strayCountEl.textContent = this.entityManager.strayZombies ? this.entityManager.strayZombies.length : 0;
    }
    if (this.panicValEl) {
      this.panicValEl.textContent = `${Math.round((this.entityManager.panicLevel || 0) * 100)}%`;
    }
    if (this.hordeBarFill) {
      const pct = Math.min(100, (hordeSize / Math.max(1, totalUnits)) * 100);
      this.hordeBarFill.style.width = `${pct}%`;
    }
    if (this.scoreEl) {
      this.scoreEl.textContent = this.entityManager.score || 0;
    }

    // FPS & Draw Calls
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.4) {
      const fps = Math.round(this.frameCount / this.fpsTimer);
      this._currentFps = fps;
      if (this.fpsEl) this.fpsEl.textContent = fps;
      if (this.drawCallsEl && this.renderer) {
        this.drawCallsEl.textContent = this.renderer.info.render.calls;
      }
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Frenzy Cooldown Ring
    if (pz && this.cooldownCircle && this.frenzyBtn) {
      const maxCd = 4.5;
      const curCd = Math.max(0, pz.frenzyCooldown);
      const ratio = curCd / maxCd;
      const offset = this.cooldownCircumference * (1 - ratio);
      this.cooldownCircle.style.strokeDashoffset = offset;

      if (pz.isFrenzy) {
        this.frenzyBtn.classList.add('frenzy-active');
      } else {
        this.frenzyBtn.classList.remove('frenzy-active');
      }
    }

    // Update window.__GAME_STATE__ telemetry for automated playtests & QA
    if (window.__GAME_STATE__) {
      window.__GAME_STATE__.gameState = this.gameState;
      window.__GAME_STATE__.stage = this.entityManager.currentStage || this.currentStage || 1;
      window.__GAME_STATE__.stageName = this.stageName || 'STAGE 1: OUTBREAK DAWN';
      window.__GAME_STATE__.hordeCount = hordeSize;
      window.__GAME_STATE__.hazmatsActive = this.entityManager.hazmats ? this.entityManager.hazmats.length : 0;
      window.__GAME_STATE__.militaryActive = this.entityManager.militaryUnits ? this.entityManager.militaryUnits.length : 0;
      window.__GAME_STATE__.wardensActive = this.entityManager.wardens ? this.entityManager.wardens.length : 0;
      window.__GAME_STATE__.trafficActive = this.trafficManager ? this.trafficManager.vehicles.length : 0;
      window.__GAME_STATE__.wardensSilenced = this.wardensSilencedCount || 0;
      window.__GAME_STATE__.civiliansSlipped = this.civiliansSlippedCount || 0;
      window.__GAME_STATE__.slimePuddlesActive = this.entityManager.slimeTrail ? this.entityManager.slimeTrail.length : 0;
      window.__GAME_STATE__.isSqueeze = !!this.entityManager.isSqueeze;
      window.__GAME_STATE__.isTitan = !!this.entityManager.isTitan;
      window.__GAME_STATE__.titanVirusTimer = Math.round((this.entityManager.titanVirusTimer || 0) * 10) / 10;
      window.__GAME_STATE__.pzVisualScale = Math.round((this.entityManager.pzVisualScale || 1.0) * 100) / 100;
      window.__GAME_STATE__.fps = this._currentFps || 60;
      window.__GAME_STATE__.hazmatDamageDealt = Math.round(this.hazmatDamageDealt * 100) / 100;
      window.__GAME_STATE__.occludedBuildingsCount = this.occludedBuildingsCount || 0;
      window.__GAME_STATE__.score = this.entityManager.score;
      window.__GAME_STATE__.isGameOver = !!this.isGameOver;
      window.__GAME_STATE__.gameTime = Math.round(this.gameTime * 10) / 10;
      window.__GAME_STATE__.peakHorde = this.peakHorde;
      window.__GAME_STATE__.isEnteringInitials = !!this.isEnteringInitials;
      window.__GAME_STATE__.tumblerInitials = this.tumblerChars.join('');
      window.__GAME_STATE__.activeDifficulty = this.activeDifficulty;
      window.__GAME_STATE__.isAloneHunted = !!(this.entityManager && this.entityManager.isAloneHunted);
      window.__GAME_STATE__.aloneTimer = this.entityManager ? Math.round(this.entityManager.aloneTimer * 10) / 10 : 0;
      window.__GAME_STATE__.powerupsActive = this.powerupManager ? this.powerupManager.powerups.length : 0;
      window.__GAME_STATE__.errors = runtimeErrors;
      const pz = this.entityManager.patientZero;
      if (pz) {
        window.__GAME_STATE__.playerPos = { x: Math.round(pz.x * 10) / 10, z: Math.round(pz.z * 10) / 10 };
        window.__GAME_STATE__.carRecoveryTimer = Math.round((pz.carRecoveryTimer || 0) * 10) / 10;
      } else {
        window.__GAME_STATE__.carRecoveryTimer = 0;
      }
    }
  }
}

// Boot application when DOM is ready (or immediately if already parsed)
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.__GAME_APP__ = new GameApp();
  });
} else {
  window.__GAME_APP__ = new GameApp();
}
