/**
 * Lightweight Reynolds Boids Steering System tailored for swarm gameplay.
 * Computes Separation, Alignment, Cohesion, and Anchor-Seek towards Patient Zero.
 */
export class BoidController {
  constructor(params = {}) {
    this.separationRadius = params.separationRadius ?? 1.5;
    this.neighborRadius = params.neighborRadius ?? 4.0;
    
    // Weight factors
    this.weightSeparation = params.weightSeparation ?? 4.4;
    this.weightAlignment = params.weightAlignment ?? 1.2;
    this.weightCohesion = params.weightCohesion ?? 0.9;
    this.weightAnchor = params.weightAnchor ?? 2.8;
    this.weightBoundary = params.weightBoundary ?? 4.0;

    // Movement parameters
    this.maxSpeed = params.maxSpeed ?? 6.0;
    this.maxForce = params.maxForce ?? 14.0;
    this.arenaRadius = params.arenaRadius ?? 48.0;
  }

  /**
   * Computes steering force for a zombie boid given nearby neighbors and Patient Zero.
   * Formations: 'swarm' (default), 'spearhead' (arrow), 'shield_wall' (dense defensive ring)
   */
  computeSteering(boid, spatialGrid, patientZero, dt, isFrenzy = false, formation = 'swarm') {
    const isSqueeze = formation === 'spearhead';
    const isShieldWall = formation === 'shield_wall';

    let sepX = 0, sepZ = 0, sepCount = 0;
    let alignX = 0, alignZ = 0, alignCount = 0;
    let cohX = 0, cohZ = 0, cohCount = 0;

    const boidX = boid.x;
    const boidZ = boid.z;
    
    // Shield Wall: dense protective shell wrapping Patient Zero, Spearhead: reduced separation
    const effectiveSepRadius = isSqueeze ? this.separationRadius * 0.35 : (isShieldWall ? this.separationRadius * 0.45 : this.separationRadius);
    const sepDistSq = effectiveSepRadius * effectiveSepRadius;

    // Query spatial grid for flockmates
    spatialGrid.forEachNearby(boidX, boidZ, this.neighborRadius, (neighbor, distSq) => {
      if (neighbor === boid || neighbor.type !== 'zombie') return false;

      const dist = Math.sqrt(distSq);
      if (dist < 0.0001) return false;

      // 1. Separation (strong repulsive force when close)
      if (distSq < sepDistSq) {
        const factor = 1.0 / (dist * dist);
        sepX += (boidX - neighbor.x) * factor;
        sepZ += (boidZ - neighbor.z) * factor;
        sepCount++;
      }

      // 2. Alignment
      alignX += neighbor.vx;
      alignZ += neighbor.vz;
      alignCount++;

      // 3. Cohesion
      cohX += neighbor.x;
      cohZ += neighbor.z;
      cohCount++;

      return false;
    });

    let steerX = 0;
    let steerZ = 0;

    // Apply Separation
    if (sepCount > 0) {
      sepX /= sepCount;
      sepZ /= sepCount;
      const sepLen = Math.hypot(sepX, sepZ) || 1.0;
      let sepWeight = this.weightSeparation;
      if (isSqueeze) sepWeight *= 0.5;
      if (isShieldWall) sepWeight *= 1.8;
      steerX += (sepX / sepLen) * sepWeight;
      steerZ += (sepZ / sepLen) * sepWeight;
    }

    // Apply Alignment (reduce alignment in shield wall to prevent orbiting forever)
    if (alignCount > 0 && !isShieldWall) {
      alignX /= alignCount;
      alignZ /= alignCount;
      const alignLen = Math.hypot(alignX, alignZ) || 1.0;
      steerX += (alignX / alignLen) * this.weightAlignment;
      steerZ += (alignZ / alignLen) * this.weightAlignment;
    }

    // Apply Cohesion (stronger cohesion in shield wall and spearhead)
    if (cohCount > 0) {
      cohX /= cohCount;
      cohZ /= cohCount;
      const toCenterX = cohX - boidX;
      const toCenterZ = cohZ - boidZ;
      const cohLen = Math.hypot(toCenterX, toCenterZ) || 1.0;
      let cohWeight = this.weightCohesion;
      if (isSqueeze) cohWeight *= 2.0;
      if (isShieldWall) cohWeight *= 2.5;
      steerX += (toCenterX / cohLen) * cohWeight;
      steerZ += (toCenterZ / cohLen) * cohWeight;
    }

    // 4. Anchor Seek (Follow Patient Zero's position & predict trajectory)
    if (patientZero) {
      // Offset slightly behind or around Patient Zero
      const leadDist = isFrenzy ? 1.5 : (isSqueeze ? 0.4 : (isShieldWall ? 0.0 : 0.8));
      const anchorTargetX = patientZero.x + (isShieldWall ? 0 : patientZero.vx * (dt * leadDist));
      const anchorTargetZ = patientZero.z + (isShieldWall ? 0 : patientZero.vz * (dt * leadDist));

      const toAnchorX = anchorTargetX - boidX;
      const toAnchorZ = anchorTargetZ - boidZ;
      const anchorDist = Math.hypot(toAnchorX, toAnchorZ);

      if (anchorDist > 0.1) {
        // Higher pull when far, smooth damping when close
        let anchorWeight = this.weightAnchor * (isFrenzy ? 1.8 : 1.0);
        if (isSqueeze) anchorWeight *= 2.0;
        if (isShieldWall) {
          // Invert boid forces into a dense protective meat-shield ring wrapped directly around Patient Zero
          const targetRingRadius = 2.2;
          const radialDelta = anchorDist - targetRingRadius;
          const radialForce = Math.min(10.0, Math.max(-6.0, radialDelta * 4.5));
          steerX += (toAnchorX / (anchorDist || 1)) * radialForce;
          steerZ += (toAnchorZ / (anchorDist || 1)) * radialForce;
        } else {
          steerX += (toAnchorX / anchorDist) * anchorWeight;
          steerZ += (toAnchorZ / anchorDist) * anchorWeight;
        }
      }

      // Aerodynamic Arrow Pinch: compress boids laterally toward the leader's line of velocity
      if (isSqueeze) {
        const pzSpeed = Math.hypot(patientZero.vx, patientZero.vz);
        if (pzSpeed > 0.5) {
          const fwdX = patientZero.vx / pzSpeed;
          const fwdZ = patientZero.vz / pzSpeed;
          const normX = -fwdZ;
          const normZ = fwdX;

          const dx = boidX - patientZero.x;
          const dz = boidZ - patientZero.z;
          const lateralOffset = dx * normX + dz * normZ;

          steerX -= normX * lateralOffset * 4.5;
          steerZ -= normZ * lateralOffset * 4.5;
        }
      }
      
      // Shield Wall Rotation: slow rotation around leader
      if (isShieldWall && anchorDist < 6.0) {
        const normX = -toAnchorZ / anchorDist;
        const normZ = toAnchorX / anchorDist;
        steerX += normX * 1.5;
        steerZ += normZ * 1.5;
      }
    }

    // 5. Arena Boundary Soft Containment (Only if bounded arena is specified)
    if (isFinite(this.arenaRadius) && this.arenaRadius > 0) {
      const distFromOrigin = Math.hypot(boidX, boidZ);
      if (distFromOrigin > this.arenaRadius - 4.0) {
        const push = (distFromOrigin - (this.arenaRadius - 4.0)) / 4.0;
        steerX -= (boidX / distFromOrigin) * push * this.weightBoundary;
        steerZ -= (boidZ / distFromOrigin) * push * this.weightBoundary;
      }
    }

    // Limit steering force
    const steerMag = Math.hypot(steerX, steerZ);
    if (steerMag > this.maxForce) {
      steerX = (steerX / steerMag) * this.maxForce;
      steerZ = (steerZ / steerMag) * this.maxForce;
    }

    return { steerX, steerZ };
  }
}
