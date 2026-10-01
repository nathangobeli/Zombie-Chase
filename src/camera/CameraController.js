import * as THREE from 'three';

export class CameraController {
  constructor(camera, options = {}) {
    this.camera = camera;
    // Set near-plane to 0.1 to avoid geometry clipping into black voids
    this.camera.near = 0.1;
    this.camera.updateProjectionMatrix();

    // Height parameters (ensuring camera stays above building rooftops ~23.5m)
    this.baseHeight = options.baseHeight ?? 27.5;
    this.k = options.k ?? 1.35; // Height scaling factor for sqrt(HordeCount)
    this.minHeight = 24.5;
    this.maxHeight = 65.0;

    // Camera pitch offset ratio (z-offset relative to height)
    // 0.30 produces a balanced, slightly steeper top-down perspective that minimizes building occlusion
    this.pitchOffsetRatio = 0.30;

    // Smoothed state
    this.currentLookAt = new THREE.Vector3(0, 0, 0);
    this.currentHeight = this.baseHeight;

    // Camera Mode: 'fixed' (North-Up, steady orientation) vs 'follow' (follows movement)
    // Defaults to 'fixed' to avoid disorienting camera rotation during frantic swarming
    this.mode = (typeof localStorage !== 'undefined' && localStorage.getItem('zombie_chase_camera_mode')) || 'fixed';
    this.currentYaw = 0;
    this.targetYaw = 0;
    this.yawSharpness = 2.5;

    // Lerp follow speed
    this.followSharpness = 8.0;
    this.zoomSharpness = 4.0;

    // Dynamic Titan Zoom State (+40% dynamic zoom out)
    this.currentExtraZoom = 1.0;

    // V6: Screen shake state
    this._shakeIntensity = 0;
    this._shakeTimer = 0;
    this._shakeDuration = 0.5;
  }

  get cameraMode() {
    return this.mode;
  }

  /**
   * Toggles camera mode between 'fixed' (North-Up) and 'follow' (Follow-Rotation).
   * Persists user preference to localStorage.
   * @returns {string} The active camera mode ('fixed' | 'follow')
   */
  toggleCameraMode() {
    this.mode = this.mode === 'fixed' ? 'follow' : 'fixed';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zombie_chase_camera_mode', this.mode);
      }
    } catch (_) {}
    return this.mode;
  }

  setCameraMode(mode) {
    if (mode === 'fixed' || mode === 'follow') {
      this.mode = mode;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('zombie_chase_camera_mode', this.mode);
        }
      } catch (_) {}
    }
  }

  /**
   * V6: Trigger a camera screen shake burst.
   * @param {number} intensity  Max displacement in world units (e.g. 0.35)
   * @param {number} duration   Shake duration in seconds (default 0.5)
   */
  triggerShake(intensity = 0.35, duration = 0.5) {
    this._shakeIntensity = intensity;
    this._shakeTimer = duration;
    this._shakeDuration = duration;
  }

  update(patientZero, hordeCount, dt, isTitan = false, spatialGrid = null) {
    if (!patientZero) return;

    const safeDt = Math.max(0.0001, Math.min(dt || 0.016, 0.1));
    const zoomAlpha = THREE.MathUtils.clamp(1.0 - Math.exp(-this.zoomSharpness * safeDt), 0.0, 1.0);

    // 1. Dynamic Titan Zoom Factor (lerp to 1.4 for Titan, 1.0 for normal)
    const targetExtraZoom = isTitan ? 1.4 : 1.0;
    this.currentExtraZoom += (targetExtraZoom - this.currentExtraZoom) * zoomAlpha;

    // 2. Calculate Target Height via formula: BaseHeight + (k * sqrt(HordeCount)) * currentExtraZoom
    const targetHeight = THREE.MathUtils.clamp(
      (this.baseHeight + this.k * Math.sqrt(Math.max(1, hordeCount))) * this.currentExtraZoom,
      this.minHeight,
      this.maxHeight * 1.5
    );

    // Smoothly interpolate height
    this.currentHeight += (targetHeight - this.currentHeight) * zoomAlpha;
    this.currentHeight = THREE.MathUtils.clamp(this.currentHeight, this.minHeight, this.maxHeight * 1.5);

    // 3. Target LookAt position (Patient Zero)
    const targetLookAtX = patientZero.x;
    const targetLookAtZ = patientZero.z;

    // Smoothly interpolate lookAt
    const followAlpha = THREE.MathUtils.clamp(1.0 - Math.exp(-this.followSharpness * safeDt), 0.0, 1.0);
    this.currentLookAt.x += (targetLookAtX - this.currentLookAt.x) * followAlpha;
    this.currentLookAt.z += (targetLookAtZ - this.currentLookAt.z) * followAlpha;

    // 4. Compute Camera Orientation / Offset
    const zOffset = this.currentHeight * this.pitchOffsetRatio;
    let camX = this.currentLookAt.x;
    let camY = this.currentHeight;
    let camZ = this.currentLookAt.z + zOffset;

    if (this.mode === 'follow') {
      const pzSpeed = Math.hypot(patientZero.vx || 0, patientZero.vz || 0);
      if (pzSpeed > 0.8) {
        // Subtle follow rotation behind movement direction
        const moveAngle = Math.atan2(patientZero.vx, patientZero.vz);
        let diff = moveAngle - this.currentYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.currentYaw += diff * Math.min(1.0, this.yawSharpness * safeDt);
      }
      const sinYaw = Math.sin(this.currentYaw);
      const cosYaw = Math.cos(this.currentYaw);
      camX = this.currentLookAt.x - sinYaw * zOffset;
      camZ = this.currentLookAt.z - cosYaw * zOffset;
    } else {
      // Fixed North-Up: strictly align camera looking North (+Z to -Z)
      this.currentYaw = 0;
      camX = this.currentLookAt.x;
      camZ = this.currentLookAt.z + zOffset;
    }

    // 5. Building Collision & Near-Plane Clipping Prevention
    // Check if camera position intersects any static building obstacle
    if (spatialGrid && spatialGrid.obstacles) {
      const obs = spatialGrid.obstacles;
      for (let i = 0; i < obs.length; i++) {
        const b = obs[i];
        if (b.disabled || b.isCar) continue;
        const bMinX = b.minX - 1.2;
        const bMaxX = b.maxX + 1.2;
        const bMinZ = b.minZ - 1.2;
        const bMaxZ = b.maxZ + 1.2;

        if (camX >= bMinX && camX <= bMaxX && camZ >= bMinZ && camZ <= bMaxZ) {
          // Camera is horizontally over/inside building footprint: elevate above roof
          const buildingRoofY = (b.height || 23.5) + 3.0;
          if (camY < buildingRoofY) {
            camY = Math.max(camY, buildingRoofY);
          }
        }
      }
    }

    this.camera.position.set(camX, camY, camZ);

    // 6. V6: Apply decaying screen shake offset
    if (this._shakeTimer > 0) {
      this._shakeTimer = Math.max(0, this._shakeTimer - dt);
      const decay = this._shakeTimer / this._shakeDuration;
      const t = this._shakeTimer;
      this.camera.position.x += Math.sin(t * 65.0) * this._shakeIntensity * decay;
      this.camera.position.z += Math.cos(t * 55.0) * this._shakeIntensity * decay;
      this.camera.position.y += Math.sin(t * 80.0) * this._shakeIntensity * 0.4 * decay;
    }

    // Aim camera at smoothed Patient Zero position on the ground
    this.camera.lookAt(this.currentLookAt.x, 0, this.currentLookAt.z);
  }

  snapTo(patientZero) {
    if (!patientZero) return;
    this.currentLookAt.set(patientZero.x, 0, patientZero.z);
    const zOffset = this.currentHeight * this.pitchOffsetRatio;
    this.camera.position.set(patientZero.x, this.currentHeight, patientZero.z + zOffset);
    this.camera.lookAt(this.currentLookAt.x, 0, this.currentLookAt.z);
  }
}
