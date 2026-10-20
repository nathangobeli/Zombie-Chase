import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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

const LIGHTING_PRESETS = [
  {
    name: 'BIO-NOIR NIGHT',
    skyHex: 0x0b1120,
    fogHex: 0x0f172a,
    hemiSky: 0x60a5fa,
    hemiGround: 0x1e293b,
    hemiIntensity: 1.35,
    dirHex: 0xbae6fd,
    dirIntensity: 2.25,
    lampIntensity: 4.8,
    nightFactor: 0.88,
    bloomStrength: 0.58,
  },
  {
    name: 'OUTBREAK DUSK',
    skyHex: 0x1e1b2e,
    fogHex: 0x261c30,
    hemiSky: 0xfb923c,
    hemiGround: 0x312e81,
    hemiIntensity: 1.55,
    dirHex: 0xfed7aa,
    dirIntensity: 2.65,
    lampIntensity: 3.2,
    nightFactor: 0.48,
    bloomStrength: 0.45,
  },
  {
    name: 'TACTICAL DAY',
    skyHex: 0x38bdf8,
    fogHex: 0x64748b,
    hemiSky: 0xf0f9ff,
    hemiGround: 0x475569,
    hemiIntensity: 1.85,
    dirHex: 0xffffff,
    dirIntensity: 2.9,
    lampIntensity: 0.0,
    nightFactor: 0.05,
    bloomStrength: 0.26,
  },
];

/**
 * Custom Post-Processing ShaderPass:
 *  - Sobel Luma Micro-Edge Definition & Contact Cavity Shading (SSAO-style edge accent)
 *  - S-Curve Filmic Micro-Contrast
 *  - Dynamic Frenzy Overdrive Crimson Pulse Vignette
 */
const StylizedGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uFrenzyIntensity: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uFrenzyIntensity;
    varying vec2 vUv;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 texelSize = 1.0 / max(uResolution, vec2(1.0));
      vec4 center = texture2D(tDiffuse, vUv);
      vec3 col = center.rgb;

      // 4-tap Sobel Luma Edge & Cavity Accent for crisp stylized silhouettes
      float lL = getLuma(texture2D(tDiffuse, vUv + vec2(-texelSize.x, 0.0)).rgb);
      float lR = getLuma(texture2D(tDiffuse, vUv + vec2( texelSize.x, 0.0)).rgb);
      float lU = getLuma(texture2D(tDiffuse, vUv + vec2(0.0,  texelSize.y)).rgb);
      float lD = getLuma(texture2D(tDiffuse, vUv + vec2(0.0, -texelSize.y)).rgb);
      float edge = clamp((abs(lL - lR) + abs(lU - lD)) * 1.45, 0.0, 0.38);

      col *= (1.0 - edge * 0.45);

      // Subtle S-curve contrast boost
      col = mix(col, smoothstep(0.0, 1.0, col), 0.12);

      // Edge vignette (tints crimson during Frenzy Overdrive)
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered);
      vec3 vigColor = mix(vec3(0.02, 0.03, 0.06), vec3(0.45, 0.04, 0.12), uFrenzyIntensity);
      col = mix(col, vigColor, smoothstep(0.22, 0.72, distSq) * (0.30 + uFrenzyIntensity * 0.22));

      gl_FragColor = vec4(col, center.a);
    }
  `,
};

export class OutbreakGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.presetIdx = 0;

    this._initRendererAndScene();
    this._initLighting();
    this._initPostProcessing();

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
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.0055);

    this.camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      1.0,
      240
    );
    this.camera.position.set(0, 34, 28);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer?.setSize(w, h);
      if (this.gradePass) {
        this.gradePass.uniforms.uResolution.value.set(w, h);
      }
    });
  }

  _initLighting() {
    this.hemiLight = new THREE.HemisphereLight(0x60a5fa, 0x1e293b, 1.35);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xbae6fd, 2.25);
    this.dirLight.position.set(28, 48, 24);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    const d = 44;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 130;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Single unified pool of 6 nearest streetlamp PointLights (fixes v2.14 duplicate pools!)
    this.streetLights = [];
    for (let i = 0; i < 6; i++) {
      const sl = new THREE.PointLight(0xfef08a, 4.8, 22, 1.6);
      sl.position.set(0, 5.0, 0);
      this.scene.add(sl);
      this.streetLights.push(sl);
    }
  }

  _updateStreetLampPool(playerX, playerZ) {
    const lamps = this.world.lampPositions;
    const preset = LIGHTING_PRESETS[this.presetIdx];
    if (!lamps.length || preset.lampIntensity <= 0) {
      for (const sl of this.streetLights) sl.intensity = 0;
      return;
    }

    // Sort lamps by squared distance to Patient Zero
    lamps.sort(
      (a, b) =>
        (a.x - playerX) ** 2 + (a.z - playerZ) ** 2 - ((b.x - playerX) ** 2 + (b.z - playerZ) ** 2)
    );

    for (let i = 0; i < this.streetLights.length; i++) {
      const sl = this.streetLights[i];
      if (i < lamps.length) {
        sl.position.set(lamps[i].x, lamps[i].y, lamps[i].z);
        sl.intensity = preset.lampIntensity;
      } else {
        sl.intensity = 0;
      }
    }
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.58,
      0.42,
      0.78
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(StylizedGradeShader);
    this.composer.addPass(this.gradePass);
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
    if (this.bloomPass) {
      this.bloomPass.strength = p.bloomStrength;
    }

    const btn = document.getElementById('btn-light-mode');
    if (btn) btn.textContent = `[N] ${p.name}`;
  }

  _bindActions() {
    this.input.onFrenzy = () => this.sim.triggerFrenzy();
    this.input.onSurge = (wx, wz) => this.sim.triggerSurge(wx, wz);
    this.input.onFormation = () => this.sim.cycleFormation();
    this.input.onEvolve = (type) => this.sim.evolveGenome(type);
    this.input.onLightingMode = () => this.applyLightingPreset(this.presetIdx + 1);
    this.input.onSummonBoss = () =>
      this.bossAndChopper.spawnBoss(this.sim.patientZero.x, this.sim.patientZero.z, this.sim);
    this.input.onToggleLab = () => this.hud.toggleLabModal();
  }

  _handleUIAction(action, arg) {
    if (action === 'frenzy') {
      this.sim.triggerFrenzy();
    } else if (action === 'surge') {
      this.sim.triggerSurge(this.input.cursorWorld.x, this.input.cursorWorld.z);
    } else if (action === 'formation') {
      this.sim.cycleFormation();
    } else if (action === 'evolve') {
      this.sim.evolveGenome(arg);
    } else if (action === 'lightMode') {
      this.applyLightingPreset(this.presetIdx + 1);
    } else if (action === 'summonBoss') {
      this.bossAndChopper.spawnBoss(this.sim.patientZero.x, this.sim.patientZero.z, this.sim);
    }
  }

  _updateCamera(dt) {
    const pz = this.sim.patientZero;

    const hordeBonus = Math.min(10, this.sim.zombies.length * 0.045);
    const frenzyKick = pz.frenzyTimer > 0 ? -2.5 : 0;
    const targetHeight = 31 + hordeBonus + frenzyKick;
    const targetDist = 25 + hordeBonus * 0.75;

    const leadX = pz.x + pz.vx * 0.32;
    const leadZ = pz.z + pz.vz * 0.32;

    this.camera.position.x += (leadX - this.camera.position.x) * Math.min(1, dt * 6.5);
    this.camera.position.y += (targetHeight - this.camera.position.y) * Math.min(1, dt * 4.5);
    this.camera.position.z += (leadZ + targetDist - this.camera.position.z) * Math.min(1, dt * 6.5);

    this.camera.lookAt(pz.x, 0.8, pz.z);

    this.dirLight.position.set(pz.x + 28, 48, pz.z + 24);
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
    this._updateStreetLampPool(pz.x, pz.z);
    this.vehicles.update(dt, this.sim, this.world.chunkSize, this.audio);
    this.bossAndChopper.update(dt, this.sim, this.sim.time);
    this.hordeRenderer.update(this.sim, this.sim.time);
    this.vfx.update(dt, this.camera);
    this.hud.update();

    if (this.gradePass) {
      const targetFrenzy = pz.frenzyTimer > 0 ? 1.0 : 0.0;
      const cur = this.gradePass.uniforms.uFrenzyIntensity.value;
      this.gradePass.uniforms.uFrenzyIntensity.value = cur + (targetFrenzy - cur) * dt * 6.0;
    }

    this.composer.render();
    requestAnimationFrame((t) => this._loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new OutbreakGame();
});
