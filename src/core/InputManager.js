import * as THREE from 'three';

/**
 * Mobile-First Input Manager with Visual Touch Joystick + Keyboard/Mouse support.
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
    this.onFrenzy = null;
    this.onSurge = null;
    this.onFormation = null;
    this.onLightingMode = null;

    // Touch / drag virtual joystick state
    this.touchActive = false;
    this.touchPointerId = null;
    this.touchOrigin = { x: 0, y: 0 };
    this.touchDelta = { x: 0, y: 0 };

    this.joyBaseEl = document.getElementById('touch-joystick-base');
    this.joyKnobEl = document.getElementById('touch-joystick-knob');

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
        if (this.onSurge) this.onSurge(0, 0, true);
      } else if (code === 'KeyE') {
        e.preventDefault();
        if (this.onFormation) this.onFormation();
      } else if (code === 'KeyN') {
        if (this.onLightingMode) this.onLightingMode();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this._endTouch();
    });

    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        e.preventDefault();
        const rect = this.domElement.getBoundingClientRect();
        this.cursorNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.cursorNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this._updateWorldCursor();
        if (this.onSurge) this.onSurge(this.cursorWorld.x, this.cursorWorld.z, false);
        return;
      }

      this.touchActive = true;
      this.touchPointerId = e.pointerId;
      this.touchOrigin.x = e.clientX;
      this.touchOrigin.y = e.clientY;
      this.touchDelta.x = 0;
      this.touchDelta.y = 0;

      if (this.joyBaseEl && this.joyKnobEl) {
        this.joyBaseEl.style.left = `${e.clientX}px`;
        this.joyBaseEl.style.top = `${e.clientY}px`;
        this.joyKnobEl.style.transform = `translate(0px, 0px)`;
        this.joyBaseEl.classList.remove('hidden');
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.touchActive || e.pointerId !== this.touchPointerId) return;
      const dx = e.clientX - this.touchOrigin.x;
      const dy = e.clientY - this.touchOrigin.y;
      const maxR = 42;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(maxR, dist);
      const angle = Math.atan2(dy, dx);

      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      this.touchDelta.x = kx / maxR;
      this.touchDelta.y = ky / maxR;

      if (this.joyKnobEl) {
        this.joyKnobEl.style.transform = `translate(${kx}px, ${ky}px)`;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.touchPointerId) {
        this._endTouch();
      }
    });

    window.addEventListener('pointercancel', () => {
      this._endTouch();
    });

    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _endTouch() {
    this.touchActive = false;
    this.touchPointerId = null;
    this.touchDelta.x = 0;
    this.touchDelta.y = 0;
    if (this.joyBaseEl) {
      this.joyBaseEl.classList.add('hidden');
    }
  }

  _updateWorldCursor() {
    if (!this.camera) return;
    this._raycaster.setFromCamera(this.cursorNDC, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this.cursorWorld);
    this.hasCursorWorld = Boolean(hit);
  }

  update() {
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;

    if (this.touchActive && Math.hypot(this.touchDelta.x, this.touchDelta.y) > 0.08) {
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
