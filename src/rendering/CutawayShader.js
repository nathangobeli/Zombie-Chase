import * as THREE from 'three';

/**
 * Shared uniforms updated once per frame for Screen-Space Dithered Building Cutaways
 * and HDR Night Window Emissive shaders.
 */
export const BuildingShaderUniforms = {
  uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
  uCameraPos: { value: new THREE.Vector3(0, 35, 30) },
  uNightFactor: { value: 0.75 }, // 0 = bright day, 1 = bio-noir night
  uTime: { value: 0.0 },
};

/**
 * Injects a Screen-Space Ordered Bayer Dither Cutaway + Procedural HDR Night Window Glow
 * into any MeshStandardMaterial or MeshLambertMaterial.
 *
 * Why this is a massive upgrade over v2.14:
 * - In v2.14, occluding buildings had `material.opacity = 0.20, depthWrite = false` toggled on
 *   the entire merged chunk mesh, causing severe alpha-sorting artifacts and ghosting.
 * - Here, buildings remain 100% opaque with proper depth writing and shadows, and ONLY the
 *   pixels inside the camera-to-player occlusion cylinder (above y = 2.4m) cleanly dissolve
 *   via a 4x4 screen-space Bayer dither matrix!
 * - Additionally, when Patient Zero approaches or enters a breachable ground-floor building,
 *   the upper stories automatically slice away so you can see right inside the room!
 */
export function applyBuildingCutawayShader(material, options = {}) {
  const { enableProceduralWindows = true } = options;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayerPos = BuildingShaderUniforms.uPlayerPos;
    shader.uniforms.uCameraPos = BuildingShaderUniforms.uCameraPos;
    shader.uniforms.uNightFactor = BuildingShaderUniforms.uNightFactor;
    shader.uniforms.uTime = BuildingShaderUniforms.uTime;

    shader.vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      ${shader.vertexShader}
    `.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vec4 wp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
      wp = modelMatrix * wp;
      vWorldPosition = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      `
    );

    shader.fragmentShader = `
      uniform vec3 uPlayerPos;
      uniform vec3 uCameraPos;
      uniform float uNightFactor;
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      // 4x4 Ordered Bayer Dither threshold (0.0 .. 1.0)
      float bayerDither4x4(vec2 screenPos) {
        int x = int(mod(screenPos.x, 4.0));
        int y = int(mod(screenPos.y, 4.0));
        int index = x + y * 4;
        float limit = 0.0;
        if (index == 0) limit = 0.0625;
        else if (index == 1) limit = 0.5625;
        else if (index == 2) limit = 0.1875;
        else if (index == 3) limit = 0.6875;
        else if (index == 4) limit = 0.8125;
        else if (index == 5) limit = 0.3125;
        else if (index == 6) limit = 0.9375;
        else if (index == 7) limit = 0.4375;
        else if (index == 8) limit = 0.25;
        else if (index == 9) limit = 0.75;
        else if (index == 10) limit = 0.125;
        else if (index == 11) limit = 0.625;
        else if (index == 12) limit = 1.0;
        else if (index == 13) limit = 0.5;
        else if (index == 14) limit = 0.875;
        else limit = 0.375;
        return limit;
      }

      ${shader.fragmentShader}
    `.replace(
      '#include <dithering_fragment>',
      `
      // 1. Camera-to-Player Line-of-Sight Cylinder Cutaway + Interior Roof Cutaway
      if (vWorldPosition.y > 2.35) {
        vec3 camToPlayer = uPlayerPos - uCameraPos;
        float segLenSq = dot(camToPlayer, camToPlayer);
        float t = clamp(dot(vWorldPosition - uCameraPos, camToPlayer) / max(segLenSq, 0.001), 0.0, 1.0);
        vec3 closestPt = uCameraPos + camToPlayer * t;

        // Distance from fragment to the camera-player sightline ray
        float rayDist = length((vWorldPosition - closestPt) * vec3(1.0, 0.55, 1.0));

        // Also cutaway upper floors directly around the player (radius 11m) so interiors are visible
        float horizDistToPlayer = length(vWorldPosition.xz - uPlayerPos.xz);

        float opacityFactor = 1.0;
        if (t > 0.10 && t < 1.05 && rayDist < 12.0) {
          opacityFactor = min(opacityFactor, smoothstep(6.0, 12.0, rayDist));
        }
        if (horizDistToPlayer < 15.5) {
          opacityFactor = min(opacityFactor, smoothstep(9.8, 15.5, horizDistToPlayer));
        }

        // Keep lower wall stubs slightly more solid than high roofs
        float heightFade = smoothstep(2.35, 3.8, vWorldPosition.y);
        float finalKeep = mix(1.0, opacityFactor, heightFade);

        if (finalKeep < bayerDither4x4(gl_FragCoord.xy)) {
          discard;
        }
      }

      // 2. Procedural HDR Night Window Glow on vertical upper walls
      ${
        enableProceduralWindows
          ? `
      if (vWorldPosition.y > 3.6 && abs(vWorldNormal.y) < 0.25 && uNightFactor > 0.05) {
        // World-space window grid coordinates
        float wx = dot(vWorldPosition.xz, vec2(vWorldNormal.z, -vWorldNormal.x));
        float wy = vWorldPosition.y;
        vec2 cell = floor(vec2(wx * 0.42, wy * 0.34));
        vec2 uvInCell = fract(vec2(wx * 0.42, wy * 0.34));

        // Window pane frame margins
        bool insidePane = uvInCell.x > 0.18 && uvInCell.x < 0.82 && uvInCell.y > 0.22 && uvInCell.y < 0.78;
        if (insidePane) {
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          if (h > 0.52) {
            vec3 warmGlow = vec3(1.55, 1.18, 0.58);
            vec3 cyanGlow = vec3(0.45, 1.25, 1.65);
            vec3 crimsonEmergency = vec3(1.6, 0.25, 0.3) * (0.6 + 0.4 * sin(uTime * 4.0 + h * 10.0));
            vec3 winColor = h > 0.92 ? crimsonEmergency : (h > 0.72 ? warmGlow : cyanGlow);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, winColor, uNightFactor * 0.88);
          }
        }
      }
      `
          : ''
      }

      #include <dithering_fragment>
      `
    );
  };

  material.needsUpdate = true;
  return material;
}
