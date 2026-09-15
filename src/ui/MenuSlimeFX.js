/**
 * MenuSlimeFX.js - Dynamic Animated Dripping Green Slime & Toxic Atmospheric FX
 * 
 * Renders viscous, organic dripping toxic slime stalactites, elongating gooey droplets
 * that detach and splash, plus floating bioluminescent radioactive spores for the Main Menu.
 * Pauses automatically during gameplay to preserve 60 FPS.
 */

export class MenuSlimeFX {
  constructor(overlayEl, cardEl) {
    this.overlayEl = overlayEl;
    this.cardEl = cardEl;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'menu-slime-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1';

    if (this.overlayEl) {
      this.overlayEl.style.position = 'fixed';
      this.overlayEl.insertBefore(this.canvas, this.overlayEl.firstChild);
    }

    this.ctx = this.canvas.getContext('2d');
    this.isRunning = false;
    this.animId = null;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Stalactite drip nodes across the top of the menu card or viewport
    this.drips = [];
    this.fallingDrops = [];
    this.splashes = [];
    this.spores = [];

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this.resize();
    this._initDrips();
    this._initSpores();
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this._initDrips();
  }

  _initDrips() {
    this.drips = [];
    // Anchor drips along the top border of the menu card if present, else top of screen
    const cardRect = this.cardEl ? this.cardEl.getBoundingClientRect() : null;
    const startX = cardRect ? Math.max(10, cardRect.left + 12) : 20;
    const endX = cardRect ? Math.min(this.width - 10, cardRect.right - 12) : this.width - 20;
    const anchorY = cardRect ? cardRect.top + 6 : 0;
    const count = Math.max(6, Math.floor((endX - startX) / 36));

    for (let i = 0; i < count; i++) {
      const x = startX + (i + 0.5) * ((endX - startX) / count) + (Math.random() - 0.5) * 12;
      this.drips.push({
        x,
        anchorY,
        baseLength: 12 + Math.random() * 22,
        currentLength: 12 + Math.random() * 22,
        maxLength: 35 + Math.random() * 45,
        thickness: 5 + Math.random() * 6,
        growthSpeed: 0.18 + Math.random() * 0.32,
        state: 'swelling', // swelling, dripping, retracting
        dropletRadius: 3.5 + Math.random() * 3.0,
        dropletY: anchorY,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _initSpores() {
    this.spores = [];
    const count = 32;
    for (let i = 0; i < count; i++) {
      this.spores.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: 1.2 + Math.random() * 2.6,
        vy: -0.3 - Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 0.4,
        alpha: 0.2 + Math.random() * 0.6,
        pulseSpeed: 1.5 + Math.random() * 2.0,
        pulseOffset: Math.random() * Math.PI * 2,
      });
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.resize();
    const loop = (now) => {
      if (!this.isRunning) return;
      const dt = Math.min((now - this.lastTimestamp) / 1000, 0.1);
      this.lastTimestamp = now;
      this.update(dt, now * 0.001);
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  update(dt, time) {
    const cardRect = this.cardEl ? this.cardEl.getBoundingClientRect() : null;
    const anchorY = cardRect ? cardRect.top + 4 : 0;
    const floorY = cardRect ? cardRect.bottom + 80 : this.height;

    // 1. Update Stalactites & Drips
    for (let i = 0; i < this.drips.length; i++) {
      const d = this.drips[i];
      d.anchorY = anchorY;
      d.wobblePhase += dt * 2.0;

      if (d.state === 'swelling') {
        d.currentLength += d.growthSpeed * 28.0 * dt;
        if (d.currentLength >= d.maxLength) {
          // Detach falling droplet
          d.state = 'retracting';
          this.fallingDrops.push({
            x: d.x,
            y: d.anchorY + d.currentLength,
            radius: d.dropletRadius,
            vy: 20.0,
            gravity: 420.0,
            tailLength: 10.0,
            floorY: floorY,
          });
        }
      } else if (d.state === 'retracting') {
        d.currentLength -= 45.0 * dt;
        if (d.currentLength <= d.baseLength) {
          d.currentLength = d.baseLength;
          d.state = 'swelling';
          d.maxLength = 32 + Math.random() * 46;
          d.growthSpeed = 0.18 + Math.random() * 0.35;
        }
      }
    }

    // 2. Update Falling Drops
    for (let i = this.fallingDrops.length - 1; i >= 0; i--) {
      const drop = this.fallingDrops[i];
      drop.vy += drop.gravity * dt;
      drop.y += drop.vy * dt;
      drop.tailLength = Math.min(26.0, drop.vy * 0.05);

      if (drop.y >= drop.floorY || drop.y >= this.height - 10) {
        // Splash impact
        this._spawnSplash(drop.x, Math.min(drop.y, this.height - 8));
        this.fallingDrops.splice(i, 1);
      }
    }

    // 3. Update Splash Ripples
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const sp = this.splashes[i];
      sp.radius += 45.0 * dt;
      sp.alpha -= 1.8 * dt;

      for (let p = 0; p < sp.particles.length; p++) {
        const part = sp.particles[p];
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.vy += 280.0 * dt;
      }

      if (sp.alpha <= 0) {
        this.splashes.splice(i, 1);
      }
    }

    // 4. Update Atmospheric Toxic Spores
    for (let i = 0; i < this.spores.length; i++) {
      const s = this.spores[i];
      s.y += s.vy * 60.0 * dt;
      s.x += Math.sin(time * 2.0 + s.pulseOffset) * 0.4;

      if (s.y < -10) {
        s.y = this.height + 10;
        s.x = Math.random() * this.width;
      }
    }
  }

  _spawnSplash(x, y) {
    const splashParticles = [];
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
      const spd = 40.0 + Math.random() * 70.0;
      splashParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * spd * 1.5,
        vy: -Math.sin(angle) * spd,
        radius: 1.2 + Math.random() * 1.5,
      });
    }
    this.splashes.push({
      x,
      y,
      radius: 3.0,
      alpha: 0.9,
      particles: splashParticles,
    });
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Render Atmospheric Toxic Spores (Background Layer)
    for (let i = 0; i < this.spores.length; i++) {
      const s = this.spores[i];
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(74, 222, 128, ${s.alpha * 0.7})`;
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    }

    // 2. Render Sticky Slime Stalactites across Card Top
    for (let i = 0; i < this.drips.length; i++) {
      const d = this.drips[i];
      const tipY = d.anchorY + d.currentLength;
      const sway = Math.sin(d.wobblePhase) * 1.5;

      ctx.save();
      // Outer toxic lime glow
      ctx.shadowColor = 'rgba(74, 222, 128, 0.85)';
      ctx.shadowBlur = 12;

      // Base Stalactite Body (organic tapered teardrop)
      ctx.beginPath();
      ctx.moveTo(d.x - d.thickness * 1.6, d.anchorY);
      ctx.quadraticCurveTo(d.x - d.thickness * 0.7, d.anchorY + d.currentLength * 0.4, d.x - d.thickness * 0.35 + sway, tipY - d.dropletRadius * 1.2);
      ctx.arc(d.x + sway, tipY - d.dropletRadius, d.dropletRadius, Math.PI * 0.9, Math.PI * 0.1, true);
      ctx.quadraticCurveTo(d.x + d.thickness * 0.7, d.anchorY + d.currentLength * 0.4, d.x + d.thickness * 1.6, d.anchorY);
      ctx.closePath();

      // Slime Gradient (Deep Emerald -> Neon Lime)
      const grad = ctx.createLinearGradient(d.x, d.anchorY, d.x, tipY);
      grad.addColorStop(0, '#15803d');
      grad.addColorStop(0.65, '#22c55e');
      grad.addColorStop(1, '#4ade80');
      ctx.fillStyle = grad;
      ctx.fill();

      // Glossy specular highlight
      ctx.beginPath();
      ctx.arc(d.x + sway - d.dropletRadius * 0.35, tipY - d.dropletRadius * 1.1, d.dropletRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();

      ctx.restore();
    }

    // 3. Render Detached Falling Slime Droplets
    for (let i = 0; i < this.fallingDrops.length; i++) {
      const drop = this.fallingDrops[i];
      ctx.save();
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 14;

      // Teardrop shape trailing upward
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y - drop.tailLength);
      ctx.quadraticCurveTo(drop.x - drop.radius, drop.y - drop.tailLength * 0.2, drop.x - drop.radius, drop.y);
      ctx.arc(drop.x, drop.y, drop.radius, Math.PI, 0, true);
      ctx.quadraticCurveTo(drop.x + drop.radius, drop.y - drop.tailLength * 0.2, drop.x, drop.y - drop.tailLength);
      ctx.closePath();

      const dropGrad = ctx.createLinearGradient(drop.x, drop.y - drop.tailLength, drop.x, drop.y + drop.radius);
      dropGrad.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
      dropGrad.addColorStop(0.5, '#22c55e');
      dropGrad.addColorStop(1, '#86efac');
      ctx.fillStyle = dropGrad;
      ctx.fill();

      // Gleam highlight
      ctx.beginPath();
      ctx.arc(drop.x - drop.radius * 0.3, drop.y - drop.radius * 0.2, drop.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();

      ctx.restore();
    }

    // 4. Render Splash Rings & Droplets
    for (let i = 0; i < this.splashes.length; i++) {
      const sp = this.splashes[i];
      ctx.save();
      ctx.strokeStyle = `rgba(74, 222, 128, ${sp.alpha})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.radius * 1.6, sp.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Splashing micro-droplets
      for (let p = 0; p < sp.particles.length; p++) {
        const part = sp.particles[p];
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(134, 239, 172, ${sp.alpha})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
