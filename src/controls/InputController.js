export class InputController {
  constructor(containerElement, actionButtonElement, onAvatarTransfer, onFrenzy, onSqueezeChange, squeezeBtnElement) {
    this.container = containerElement;
    this.actionBtn = actionButtonElement;
    // Frenzy & Squeeze callbacks
    this.onAvatarTransfer = onAvatarTransfer;
    this.onFrenzy = onFrenzy;
    this.onSqueezeChange = onSqueezeChange;
    this.squeezeBtn = squeezeBtnElement;
    this.isSqueeze = false;

    // Movement vector output: { x, z } in range [-1, 1]
    this.inputVector = { x: 0, z: 0 };

    // Keyboard state
    this.keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      ArrowUp: false,
      ArrowLeft: false,
      ArrowDown: false,
      ArrowRight: false,
      KeyC: false,
      ShiftLeft: false,
      ShiftRight: false,
    };

    // Virtual Joystick UI Elements
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickThumb = document.getElementById('joystick-thumb');
    this.maxRadius = 55; // Pixels

    // C2: Fixed joystick support
    this._useFixedJoystick = localStorage.getItem('fixedJoystick') === 'true';
    this._applyJoystickMode();

    // Touch tracking
    this.activeTouchId = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.isJoystickActive = false;
    this._initialPinchDist = null;

    // Mouse tracking fallback
    this.isMouseDown = false;
    this.mouseStartX = 0;
    this.mouseStartY = 0;
    this.mouseStartTime = 0;

    // C4: Double-tap frenzy detection
    this._lastTapTime = 0;

    this._bindEvents();
    if (this.squeezeBtn) {
      this.bindSqueezeButton(this.squeezeBtn);
    }

    // C6: First-launch controls overlay
    this._showFirstLaunchOverlay();
  }

  setSqueeze(active) {
    if (this.isSqueeze === active) return;
    this.isSqueeze = active;
    if (this.squeezeBtn) {
      this.squeezeBtn.classList.toggle('active', active);
    }
    if (this.onSqueezeChange) {
      this.onSqueezeChange(active);
    }
  }

  bindSqueezeButton(element) {
    this.squeezeBtn = element;
    if (!element) return;
    const onStart = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.setSqueeze(true);
      this.vibrate(15);
    };
    const onEnd = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.setSqueeze(false);
    };
    element.addEventListener('pointerdown', onStart);
    element.addEventListener('pointerup', onEnd);
    element.addEventListener('pointercancel', onEnd);
    element.addEventListener('pointerleave', onEnd);
    element.addEventListener('mousedown', onStart);
    element.addEventListener('mouseup', onEnd);
    element.addEventListener('touchstart', onStart, { passive: false });
    element.addEventListener('touchend', onEnd, { passive: false });
  }

  // C3: Haptic feedback helper (safe: no-op if not supported or frame not activated)
  vibrate(pattern) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
          return;
        }
        navigator.vibrate(pattern);
      }
    } catch (_) {}
  }

  // C2: Apply floating or fixed joystick mode
  _applyJoystickMode() {
    if (!this.joystickBase) return;
    if (this._useFixedJoystick) {
      this.joystickBase.style.display = 'block';
      this.joystickBase.style.position = 'fixed';
      this.joystickBase.style.left = '70px';
      this.joystickBase.style.bottom = '80px';
      this.joystickBase.style.top = 'auto';
      this.joystickBase.style.marginLeft = '0';
      this.joystickBase.style.marginTop = '0';
    } else {
      this.joystickBase.style.display = 'none';
      this.joystickBase.style.position = 'absolute';
    }
  }

  // C2: Toggle between floating and fixed joystick
  toggleJoystickMode() {
    this._useFixedJoystick = !this._useFixedJoystick;
    localStorage.setItem('fixedJoystick', String(this._useFixedJoystick));
    this._applyJoystickMode();
    return this._useFixedJoystick;
  }

  // C6: First-launch overlay
  _showFirstLaunchOverlay() {
    if (localStorage.getItem('controlsShown')) return;
    localStorage.setItem('controlsShown', '1');
    const overlay = document.getElementById('controls-overlay');
    if (overlay) {
      overlay.classList.add('show');
      setTimeout(() => overlay.classList.remove('show'), 5000);
    }
  }

  _bindEvents() {
    // 1. Keyboard listeners
    window.addEventListener('keydown', (e) => {
      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = true;
      }
      if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.setSqueeze(true);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        // C3: Haptic on frenzy
        this.vibrate([20, 10, 20]);
        if (this.onFrenzy) this.onFrenzy();
      }
      // Quick avatar transfer test key (E key transfers forward)
      if (e.code === 'KeyE') {
        if (this.onAvatarTransfer) {
          const dirX = this.inputVector.x || 0;
          const dirZ = this.inputVector.z || -1;
          this.onAvatarTransfer(dirX, dirZ);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = false;
      }
      if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.setSqueeze(false);
      }
    });

    // 2. Frenzy Button Listener
    if (this.actionBtn) {
      const triggerAction = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.onFrenzy) this.onFrenzy();
      };
      this.actionBtn.addEventListener('pointerdown', triggerAction);
    }

    // 3. Touch event handlers for floating joystick & rapid swipe
    this.container.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
    this.container.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
    this.container.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });
    this.container.addEventListener('touchcancel', (e) => this._handleTouchEnd(e), { passive: false });

    // 4. Mouse event handlers for desktop testing
    this.container.addEventListener('mousedown', (e) => this._handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this._handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this._handleMouseUp(e));
  }

  _handleTouchStart(e) {
    e.preventDefault();

    // Two-finger pinch tracking
    if (e.touches.length === 2) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      this._initialPinchDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
    }

    // C4: Double-tap frenzy detection
    const now = performance.now();
    const touch0 = e.changedTouches[0];
    if (touch0 && !touch0.target?.closest('.interactive-hud')) {
      if (now - this._lastTapTime < 300) {
        this.vibrate([20, 10, 20]);
        if (this.onFrenzy) this.onFrenzy();
        this._lastTapTime = 0;
        return;
      }
      this._lastTapTime = now;
    }

    if (this.activeTouchId !== null) return;

    // Use first non-consumed touch
    const touch = e.changedTouches[0];
    // Check if touch is on HUD interactive buttons
    if (touch.target && touch.target.closest('.interactive-hud')) return;

    this.activeTouchId = touch.identifier;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = performance.now();
    this.isJoystickActive = true;

    if (!this._useFixedJoystick) {
      this._showJoystick(this.touchStartX, this.touchStartY);
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();

    // Pinch detection
    if (e.touches.length === 2 && this._initialPinchDist !== null) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      if (currentDist < this._initialPinchDist * 0.8) {
        this.setSqueeze(true);
      } else if (currentDist > this._initialPinchDist * 0.95 && !this.keys.KeyC && !this.keys.ShiftLeft) {
        this.setSqueeze(false);
      }
    }

    if (this.activeTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.activeTouchId) {
        this._updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  _handleTouchEnd(e) {
    if (e.touches.length < 2) {
      this._initialPinchDist = null;
      if (!this.keys.KeyC && !this.keys.ShiftLeft && !this.keys.ShiftRight && (!this.squeezeBtn || !this.squeezeBtn.classList.contains('active'))) {
        this.setSqueeze(false);
      }
    }
    if (this.activeTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.activeTouchId) {
        const duration = performance.now() - this.touchStartTime;
        const dx = touch.clientX - this.touchStartX;
        const dy = touch.clientY - this.touchStartY;
        const distance = Math.hypot(dx, dy);

        // Check for Rapid Swipe Gesture:
        // Rapid (<300ms) with significant displacement (>40px)
        if (duration < 300 && distance > 40) {
          // C3: Haptic on avatar transfer
          this.vibrate(30);
          if (this.onAvatarTransfer) {
            this.onAvatarTransfer(dx, dy);
          }
        }

        this.activeTouchId = null;
        this.isJoystickActive = false;
        if (!this._useFixedJoystick) this._hideJoystick();
        break;
      }
    }
  }

  _handleMouseDown(e) {
    if (e.target && e.target.closest('.interactive-hud')) return;
    this.isMouseDown = true;
    this.mouseStartX = e.clientX;
    this.mouseStartY = e.clientY;
    this.mouseStartTime = performance.now();

    this._showJoystick(e.clientX, e.clientY);
  }

  _handleMouseMove(e) {
    if (!this.isMouseDown) return;
    this._updateJoystick(e.clientX, e.clientY);
  }

  _handleMouseUp(e) {
    if (!this.isMouseDown) return;

    const duration = performance.now() - this.mouseStartTime;
    const dx = e.clientX - this.mouseStartX;
    const dy = e.clientY - this.mouseStartY;
    const distance = Math.hypot(dx, dy);

    // Rapid swipe detection for desktop mouse flick
    if (duration < 280 && distance > 45) {
      if (this.onAvatarTransfer) {
        this.onAvatarTransfer(dx, dy);
      }
    }

    this.isMouseDown = false;
    this._hideJoystick();
  }

  _showJoystick(screenX, screenY) {
    if (!this.joystickBase) return;
    this.joystickBase.style.display = 'block';
    this.joystickBase.style.left = `${screenX}px`;
    this.joystickBase.style.top = `${screenY}px`;
    if (this.joystickThumb) {
      this.joystickThumb.style.transform = `translate(0px, 0px)`;
    }
  }

  _updateJoystick(screenX, screenY) {
    const startX = this.activeTouchId !== null ? this.touchStartX : this.mouseStartX;
    const startY = this.activeTouchId !== null ? this.touchStartY : this.mouseStartY;

    const dx = screenX - startX;
    const dy = screenY - startY;
    const dist = Math.hypot(dx, dy);

    let clampedDist = dist;
    let normX = 0;
    let normY = 0;

    if (dist > 0.001) {
      normX = dx / dist;
      normY = dy / dist;
      clampedDist = Math.min(dist, this.maxRadius);
    }

    // Move visual thumb
    if (this.joystickThumb) {
      this.joystickThumb.style.transform = `translate(${normX * clampedDist}px, ${normY * clampedDist}px)`;
    }

    // Deadzone check
    const deadzone = 8;
    if (dist < deadzone) {
      this.inputVector.x = 0;
      this.inputVector.z = 0;
    } else {
      const strength = (clampedDist - deadzone) / (this.maxRadius - deadzone);
      this.inputVector.x = normX * strength;
      this.inputVector.z = normY * strength;
    }
  }

  _hideJoystick() {
    if (this.joystickBase) {
      this.joystickBase.style.display = 'none';
    }
    this.inputVector.x = 0;
    this.inputVector.z = 0;
  }

  getInput() {
    // If keyboard is being used, override touch joystick
    let kx = 0;
    let kz = 0;

    if (this.keys.KeyA || this.keys.ArrowLeft) kx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) kx += 1;
    if (this.keys.KeyW || this.keys.ArrowUp) kz -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) kz += 1;

    if (kx !== 0 || kz !== 0) {
      const len = Math.hypot(kx, kz);
      return { x: kx / len, z: kz / len };
    }

    return this.inputVector;
  }
}
