import * as THREE from 'three';

export class CameraController {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.baseHeight = options.baseHeight ?? 18.0;
    this.k = options.k ?? 1.35; // Height scaling factor for sqrt(HordeCount)
    this.minHeight = 16.0;
    this.maxHeight = 52.0;

    // Camera pitch offset ratio (z-offset relative to height)
    this.pitchOffsetRatio = 0.42;

    // Smoothed state
    this.currentLookAt = new THREE.Vector3(0, 0, 0);
    this.currentHeight = this.baseHeight;

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

  update(patientZero, hordeCount, dt, isTitan = false) {
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

    // 2. Target LookAt position (Patient Zero)
    const targetLookAtX = patientZero.x;
    const targetLookAtZ = patientZero.z;

    // Smoothly interpolate lookAt
    const followAlpha = THREE.MathUtils.clamp(1.0 - Math.exp(-this.followSharpness * safeDt), 0.0, 1.0);
    this.currentLookAt.x += (targetLookAtX - this.currentLookAt.x) * followAlpha;
    this.currentLookAt.z += (targetLookAtZ - this.currentLookAt.z) * followAlpha;

    // 3. Compute Camera Position
    const zOffset = this.currentHeight * this.pitchOffsetRatio;
    this.camera.position.x = this.currentLookAt.x;
    this.camera.position.y = this.currentHeight;
    this.camera.position.z = this.currentLookAt.z + zOffset;

    // V6: Apply decaying screen shake offset
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
