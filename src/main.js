import * as THREE from 'three';

import { InputManager } from './core/InputManager.js';
import { ProceduralTextures } from './rendering/ProceduralTextures.js';
import { BuildingShaderUniforms } from './rendering/CutawayShader.js';
import { HordeInstancer } from './rendering/HordeInstancer.js';
import { VFXManager } from './fx/VFXManager.js';
import { CityWorld } from './world/CityWorld.js';
import { VehicleManager } from './world/VehicleManager.js';
import { BossAndChopperSystem } from './world/BossAndChopperSystem.js';
import { Simulation } from './gameplay/Simulation.js';
import { SynthAudio } from './audio/SynthAudio.js';
import { TacticalHUD } from './ui/TacticalHUD.js';

/**
 * Bright, Vibrant Mobile-First Lighting Presets.
 * Preset 0 (Default) is Bright Sunny Daylight so everything is 100% clear on mobile phones!
 */
const LIGHTING_PRESETS = [
  {
    name: 'BRIGHT DAY',
    icon: '☀️',
    skyHex: 0x7dd3fc,
    fogHex: 0xbae6fd,
    hemiSky: 0xffffff,
    hemiGround: 0x94a3b8,
    hemiIntensity: 2.2,
    dirHex: 0xfffbeb,
    dirIntensity: 3.1,
    nightFactor: 0.0,
  },
  {
    name: 'GOLDEN SUNSET',
    icon: '🌅',
    skyHex: 0xfb923c,
    fogHex: 0xfdba74,
    hemiSky: 0xfef08a,
    hemiGround: 0x64748b,
    hemiIntensity: 1.95,
    dirHex: 0xffedd5,
    dirIntensity: 2.8,
    nightFactor: 0.35,
  },
  {
    name: 'CLEAR NIGHT',
    icon: '🌙',
    skyHex: 0x1e293b,
    fogHex: 0x334155,
    hemiSky: 0x93c5fd,
    hemiGround: 0x475569,
    hemiIntensity: 1.75,
    dirHex: 0xe0f2fe,
    dirIntensity: 2.4,
    nightFactor: 0.75,
  },
];

export class OutbreakGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.presetIdx = 0;

    this._initRendererAndScene();
    this._initLighting();

    this.textures = ProceduralTextures.createAll();
    this.audio = new SynthAudio();
    this.vfx = new VFXManager(this.scene, this.textures);
    this.world = new CityWorld(this.scene, this.textures, this.vfx);
    this.sim = new Simulation(this.scene, this.world, this.vfx, this.audio);
    this.vehicles = new VehicleManager(this.scene, this.vfx);
    this.bossAndChopper = new BossAndChopperSystem(this.scene, this.vfx);
    this.hordeRenderer = new HordeInstancer(this.scene);

    this.input = new InputManager(this.camera, this.canvas);
    this._bindActions();

    this.hud = new TacticalHUD(this.sim, this.bossAndChopper, (action, arg) =>
      this._handleUIAction(action, arg)
    );

    // Default to Bright Sunny Daylight (Preset 0)
    this.applyLightingPreset(0);

    // Initial world chunk stream
    this.world.updateStreaming(0, 0, this.camera.position, 0);

    this.lastTime = performance.now();
    window.__game = this;
    requestAnimationFrame((t) => this._loop(t));
  }

  _initRendererAndScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7dd3fc);
    this.scene.fog = new THREE.FogExp2(0xbae6fd, 0.0035);

    this.camera = new THREE.PerspectiveCamera(
      44,
      window.innerWidth / window.innerHeight,
      1.0,
      220
    );
    this.camera.position.set(0, 24, 19);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  _initLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.2);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 3.1);
    this.dirLight.position.set(24, 45, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    const d = 38;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 120;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
  }

  applyLightingPreset(index) {
    this.presetIdx = index % LIGHTING_PRESETS.length;
    const p = LIGHTING_PRESETS[this.presetIdx];

    this.scene.background.setHex(p.skyHex);
    this.scene.fog.color.setHex(p.fogHex);
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;
    this.dirLight.color.setHex(p.dirHex);
    this.dirLight.intensity = p.dirIntensity;

    BuildingShaderUniforms.uNightFactor.value = p.nightFactor;

    const btn = document.getElementById('btn-light-mode');
    if (btn) btn.textContent = p.icon;
  }

  _bindActions() {
    this.input.onFrenzy = () => this.sim.triggerFrenzy();
    this.input.onSurge = (wx, wz, useForward) => this.sim.triggerSurge(wx, wz, useForward);
    this.input.onFormation = () => this.sim.cycleFormation();
    this.input.onLightingMode = () => this.applyLightingPreset(this.presetIdx + 1);
  }

  _handleUIAction(action) {
    if (action === 'frenzy') {
      this.sim.triggerFrenzy();
    } else if (action === 'surge') {
      // On mobile button tap, surge forward in the direction Patient Zero is facing!
      this.sim.triggerSurge(0, 0, true);
    } else if (action === 'lightMode') {
      this.applyLightingPreset(this.presetIdx + 1);
    }
  }

  _updateCamera(dt) {
    const pz = this.sim.patientZero;

    // Portrait mobile screens need slightly wider framing so the street stays visible
    const isPortrait = window.innerHeight > window.innerWidth;
    const baseH = isPortrait ? 27 : 23;
    const baseDist = isPortrait ? 22 : 18;

    const hordeBonus = Math.min(7, this.sim.zombies.length * 0.035);
    const frenzyKick = pz.frenzyTimer > 0 ? -1.8 : 0;
    const targetHeight = baseH + hordeBonus + frenzyKick;
    const targetDist = baseDist + hordeBonus * 0.65;

    const leadX = pz.x + pz.vx * 0.25;
    const leadZ = pz.z + pz.vz * 0.25;

    this.camera.position.x += (leadX - this.camera.position.x) * Math.min(1, dt * 7.0);
    this.camera.position.y += (targetHeight - this.camera.position.y) * Math.min(1, dt * 5.0);
    this.camera.position.z += (leadZ + targetDist - this.camera.position.z) * Math.min(1, dt * 7.0);

    this.camera.lookAt(pz.x, 0.8, pz.z);

    this.dirLight.position.set(pz.x + 24, 45, pz.z + 20);
    this.dirLight.target.position.set(pz.x, 0, pz.z);
    this.dirLight.target.updateMatrixWorld();
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.input.update();
    this.sim.update(dt, this.input);
    this._updateCamera(dt);

    const pz = this.sim.patientZero;
    this.world.updateStreaming(pz.x, pz.z, this.camera.position, this.sim.time);
    this.vehicles.update(dt, this.sim, this.world.chunkSize, this.audio);
    this.bossAndChopper.update(dt, this.sim);
    this.hordeRenderer.update(this.sim, this.sim.time);
    this.vfx.update(dt, this.camera);
    this.hud.update();

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this._loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new OutbreakGame();
});
