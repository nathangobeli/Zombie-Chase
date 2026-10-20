import * as THREE from 'three';

/**
 * Unified Input Manager for Keyboard, Mouse World-Raycasting, and Touch Controls.
 * Supports Active Horde Command (Right-Click / Q Surge, E Formation, Space Frenzy, 1-4 Evolution, B Boss, M Lab).
 */
export class InputManager {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.keys = new Set();
    this.moveX = 0;
    this.moveZ = 0;

    this.cursorWorld = new THREE.Vector3(0, 0, 0);
    this.cursorNDC = new THREE.Vector2(0, 0);
    this.hasCursorWorld = false;

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Action callbacks
    this.onFrenzy = null;       // Spacebar
    this.onSurge = null;        // Right-Click or Q
    this.onFormation = null;    // E key
    this.onEvolve = null;       // 1, 2, 3, 4 keys
    this.onLightingMode = null; // N key
    this.onSummonBoss = null;   // B key
    this.onToggleLab = null;    // M key

    // Virtual joystick / pointer drag support
    this.touchActive = false;
    this.touchOrigin = { x: 0, y: 0 };
    this.touchDelta = { x: 0, y: 0 };

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      this.keys.add(code);

      if (code === 'Space') {
        e.preventDefault();
        if (this.onFrenzy) this.onFrenzy();
      } else if (code === 'KeyQ') {
        e.preventDefault();
        if (this.onSurge) this.onSurge(this.cursorWorld.x, this.cursorWorld.z, true);
      } else if (code === 'KeyE') {
        e.preventDefault();
        if (this.onFormation) this.onFormation();
      } else if (code === 'Digit1') {
        if (this.onEvolve) this.onEvolve('leaper');
      } else if (code === 'Digit2') {
        if (this.onEvolve) this.onEvolve('brute');
      } else if (code === 'Digit3') {
        if (this.onEvolve) this.onEvolve('spitter');
      } else if (code === 'Digit4') {
        if (this.onEvolve) this.onEvolve('alpha');
      } else if (code === 'KeyN') {
        if (this.onLightingMode) this.onLightingMode();
      } else if (code === 'KeyB') {
        if (this.onSummonBoss) this.onSummonBoss();
      } else if (code === 'KeyM') {
        if (this.onToggleLab) this.onToggleLab();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchActive = false;
    });

    this.domElement.addEventListener('pointermove', (e) => {
      const rect = this.domElement.getBoundingClientRect();
      this.cursorNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.cursorNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._updateWorldCursor();

      if (this.touchActive) {
        const dx = e.clientX - this.touchOrigin.x;
        const dy = e.clientY - this.touchOrigin.y;
        const maxR = 48;
        this.touchDelta.x = Math.max(-1, Math.min(1, dx / maxR));
        this.touchDelta.y = Math.max(-1, Math.min(1, dy / maxR));
      }
    });

    this.domElement.addEventListener('pointerdown', (e) => {
      const rect = this.domElement.getBoundingClientRect();
      this.cursorNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.cursorNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._updateWorldCursor();

      if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        if (this.onSurge) {
          this.onSurge(this.cursorWorld.x, this.cursorWorld.z, true);
        }
      } else if (e.pointerType === 'touch' || e.button === 0) {
        this.touchActive = true;
        this.touchOrigin.x = e.clientX;
        this.touchOrigin.y = e.clientY;
        this.touchDelta.x = 0;
        this.touchDelta.y = 0;
      }
    });

    window.addEventListener('pointerup', () => {
      this.touchActive = false;
      this.touchDelta.x = 0;
      this.touchDelta.y = 0;
    });

    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _updateWorldCursor() {
    if (!this.camera) return;
    this._raycaster.setFromCamera(this.cursorNDC, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this.cursorWorld);
    this.hasCursorWorld = Boolean(hit);
  }

  update() {
    this._updateWorldCursor();

    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;

    if (this.touchActive && (Math.abs(this.touchDelta.x) > 0.08 || Math.abs(this.touchDelta.y) > 0.08)) {
      mx += this.touchDelta.x;
      mz += this.touchDelta.y;
    }

    const len = Math.hypot(mx, mz);
    if (len > 1e-4) {
      this.moveX = mx / Math.max(1, len);
      this.moveZ = mz / Math.max(1, len);
    } else {
      this.moveX = 0;
      this.moveZ = 0;
    }
  }
}
