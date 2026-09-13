# Changelog

All notable changes to the **Zombie Chase** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.7.0] - 2026-09-13 — "City Lighting Overhaul, Dynamic Proximity Lights & Traffic Signals"

### Added — Aesthetic & Lighting Overhaul (@artist & @designer)
- **Dynamic Proximity Street Lamps** (`main.js`):
  - Added a highly optimized realtime lighting pool that calculates distance between Patient Zero and all loaded street lamps.
  - Dynamically snaps 4 `THREE.PointLight` objects to the closest lamps to provide realistic ground illumination without compromising the 60 FPS budget.
- **Intersection Traffic Signals** (`CityChunk.js`, `main.js`):
  - Built procedural traffic light housing meshes at the corners of every open intersection.
  - Implemented an `InstancedMesh` system rendering Red, Yellow, and Green lenses that automatically cycle states (0-5s Red, 5-10s Green, 10-12s Yellow) based on a global 12-second clock.
- **Intense Emissive Glows** (`CityChunk.js`):
  - Pushed building window RGB values well past 1.0 (e.g., `(2.8, 2.6, 1.4)`) to force the `UnrealBloomPass` to generate a satisfying, intense neon glow.

### Fixed — Visuals & UI Progression Blockers
- **Sidewalk Bloom Glitch** (`CityChunk.js`, `CityStreamer.js`):
  - Darkened the pure white hex colors of sidewalks (`#f8fafc` -> `#c0cbd8`) and crosswalks to ensure they fall safely below the Bloom pass threshold (0.85), returning them to matte painted surfaces instead of glowing.
- **Main Menu UI Freeze** (`InstancedRenderer.js`):
  - Fixed a critical `ReferenceError` during WebGL scene initialization caused by a typo (`gradientMap` instead of `this.celGradientMap`) in the new Ambulance material. This fix allows the game engine to finish booting and successfully bind click events to the Main Menu start button and difficulty pills.

---

## [2.6.0] - 2026-09-13 — "Car Pin-Down Fix, Roadway Lane Snapping & Smooth Difficulty Escalation"

### Fixed — Car Pin-Down Glitch & Deflection Physics (@designer & @qa)
- **Perpendicular Lateral Deflection & Sidewalk Impulse** (`TrafficManager.js`):
  - Resolved vehicle bumper trapping glitch where cars previously dragged Patient Zero, causing continuous unavoidable damage.
  - Calculated perpendicular deflection vectors based on vehicle travel orientation:
    - North/South travel ($|v_z| \ge |v_x|$): Deflects Patient Zero along the X-axis (`lateralSign * 4.0u`) toward the sidewalk/shoulder.
    - East/West travel ($|v_x| > |v_z|$): Deflects Patient Zero along the Z-axis (`lateralSign * 4.0u`) toward the road shoulder.
  - Immediately resolved obstacle collisions with `spatialGrid.resolveObstacles(pz, pz.radius)` so the deflection never pushes Patient Zero into building interiors.
- **1.5s Car Recovery Invulnerability Window** (`EntityManager.js`, `TrafficManager.js`, `InstancedRenderer.js`):
  - Granted a 1.5s recovery window on vehicle impact (`pz.carRecoveryTimer = 1.5`).
  - Completely bypassed vehicle-versus-player collisions during the recovery window, allowing vehicles to pass cleanly without multi-frame trapping.
  - Applied 50% opacity blinking animation on Patient Zero (`pzMat.opacity = 0.5`) during recovery, restoring full opacity upon completion.
  - Ensured player retains full joystick and keyboard control immediately upon landing. Follower zombies still absorb casualties and scatter.

### Changed — Strict Roadway Lane Snapping & Obstacle Raycasting (@designer & @artist)
- **Procedural Lane Alignment** (`CityChunk.js`, `CityStreamer.js`, `TrafficManager.js`):
  - Restricted all moving vehicles strictly to parallel street lanes: North/South ($X = \text{chunkOriginX} \pm 3.0$) and East/West ($Z = \text{chunkOriginZ} \pm 3.0$).
  - Filtered candidate lanes against building obstacle footprints to prevent spawning along obstructed avenues.
  - Locked vehicle altitude strictly to asphalt surface ($Y = 0.01$), preventing vehicles from climbing curbs or driving over sidewalk elevations ($Y > 0.2$).
  - Implemented 0.6s forward AABB obstacle raycasting during vehicle updates, smoothly despawning any vehicle before it can intersect a building footprint (0 building collisions).
  - Increased despawn distance to 120m outside Patient Zero's active streaming window.

### Added — Smooth Progressive Difficulty Escalation (@designer & @qa)
- **Time-Based Stage Pacing (0:00 - 5:00+)** (`EntityManager.js`, `TrafficManager.js`, `main.js`):
  - **Stage 1 (0:00 - 1:00) "Outbreak Dawn"**:
    - 0 military riflemen squads and 0 moving cars (stationary parked cars only).
    - Civilians walk at relaxed speeds (1.8 m/s).
    - Maximum 1 slow Hazmat unit per 3 chunks with 3.5s cure threshold.
  - **Stage 2 (1:00 - 2:30) "Quarantine Alert"**:
    - Low-density moving traffic introduced (1-2 cars, 7.0–8.5 m/s).
    - Hazmat units deploy in coordinated pairs with 2.2s cure threshold.
    - Civilians jog faster (3.2 m/s).
  - **Stage 3 (2:30 - 4:00) "Military Escalation"**:
    - Military snipers deploy at street intersections with laser targeting (1.8s aim charge).
    - Moderate traffic density (9.0–10.5 m/s).
    - Hazmats flank actively with 1.4s cure threshold.
  - **Stage 4 (4:00+) "Martial Law"**:
    - High-density traffic (11.0–13.0 m/s).
    - Rapid sniper laser targeting (1.0s aim charge threshold).
    - Fast Hazmats with rapid 0.8s cure threshold.
    - Full-sprint panicked civilians (5.5 m/s).
- **HUD Stage Announcement Banner** (`index.html`, `style.css`, `main.js`):
  - Created retro-cyber neon HUD banner (`#stage-banner`) announcing stage transitions (e.g., "STAGE 2: QUARANTINE ALERT", "STAGE 3: MILITARY ESCALATION", "STAGE 4: MARTIAL LAW").
  - Animated with subtle cyan glow, glassmorphism backdrop, and auto-dismiss after 3.2 seconds.

### Automated Testing & QA Validation (@qa)
- **Comprehensive Playtest Suite** (`scripts/playtest.js`):
  - Verified 0 military and 0 moving cars during Stage 1 Outbreak Dawn.
  - Verified 4.0u lateral deflection, 1.5s recovery timer, and zero double-frame pin-down glitching.
  - Verified roadway lane adherence, constant $Y = 0.01$ altitude, and 0 building obstacle collisions.
  - Verified progressive stage transitions and cure thresholds (3.5s -> 2.2s -> 1.4s -> 0.8s) with 100% test pass rate.

---

## [2.5.0] - 2026-09-13 — "Main Menu Boot FSM, Responsive Post-Game Navigation, Solid Parked Cars & Moving Traffic Hazards"

### Added — Mandatory Start Screen & Boot Lifecycle (@designer & @artist)
- **Finite State Machine Architecture** (`main.js`):
  - Enforced strict 5-state lifecycle: `[STATE_MENU, STATE_PLAYING, STATE_LAST_STAND, STATE_INITIALS_ENTRY, STATE_LEADERBOARD]`.
  - On initial page boot, the world simulation, chunk streaming updates, entity spawning, and game timers remain paused.
  - Rendered `#main-menu-overlay` with animated pulsing title, difficulty selector pills (`[CASUAL (1.0x)]`, `[OUTBREAK (1.5x)]`, `[MARTIAL LAW (2.5x)]`), and direct buttons for "START OUTBREAK ▶" and "HIGH SCORES".
  - Tapping "START OUTBREAK" spawns Patient Zero at the open intersection `(0, 0.01, 0)`, initializes camera tracking down the avenue, and smoothly transitions to `STATE_PLAYING`.

### Added — Responsive Post-Game Navigation (@designer & @qa)
- **Dual Post-Game CTAs** (`index.html`, `style.css`, `main.js`):
  - In `STATE_LEADERBOARD` (`#game-over-modal`), implemented side-by-side / stacked responsive action buttons:
    - **"🔄 PLAY AGAIN"** (`#btn-game-over-restart`): Restarts game immediately on current difficulty without reloading the webpage.
    - **"🏠 MAIN MENU"** (`#btn-game-over-menu`): Clears active run telemetry, removes all live entities, resets timers, and returns cleanly to `STATE_MENU`.
  - Guaranteed `pointer-events: auto`, `z-index: 9999`, and viewport safety padding so buttons are always accessible on mobile viewports.

### Added — Solid Parked & Blocking Cars (@designer & @qa)
- **Static 2D AABB Obstacle Collision Registration** (`CityChunk.js`, `main.js`):
  - Parked cars on sidewalks and blocking cars on cross streets now register explicit static AABB collision boxes in `spatialGrid.obstacles`:
    - Longitudinal cars: `halfW: 1.1m`, `halfD: 2.25m`.
    - Transverse cars ($\pm\pi/2$ rotation): `halfW: 2.25m`, `halfD: 1.1m`.
  - Characters (Patient Zero, follower horde, civilians, hazmats) slide smoothly along car hulls instead of clipping through them.

### Added — Dynamic Moving Traffic Hazards (@designer, @artist & @qa)
- **Procedural Moving Traffic System** (`TrafficManager.js`, `main.js`):
  - Enabled on `outbreak` (1 vehicle every 6-9s) and `martial_law` (1 vehicle every 3-5s).
  - Vehicles spawn along roadway lanes outside camera view and drive at 8.5–12.0 m/s with headlights and taillights.
  - **Follower Collision**: Running over follower zombies kills/scatters 2–5 minions with tire screech sounds (`AudioSystem.js: playTireScreech()`) and dust clouds.
  - **Titan PZ Collision**: When Patient Zero is in Titan colossal form, colliding with a moving vehicle crushes it with a heavy metal impact (`AudioSystem.js: playCarCrash()`), camera shake, +50 CRUSH floating text, and rolling vehicle debris.

### Fixed — 3-Letter High Score Initials Entry Qualification (@designer & @qa)
- **Storage Initialization & Qualification Logic** (`StorageSystem.js`, `main.js`):
  - Defaulted unpopulated high score partitions to empty arrays `[]` rather than synthetic mock scores, ensuring any new high-scoring player immediately qualifies for the 3-character tumbler.
  - Verified touch arrow buttons (`▲`/`▼`), keyboard arrows (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`), `Enter` confirmation, and direct keystroke typing seamlessly populate the retro 3-slot tumbler.

---

## [2.4.0] - 2026-09-13 — "Boundary Ring Removal, Open Intersection Spawn, Horde-First Protection & Responsive Modals"

### Removed — Residual Red Boundary Ring (@artist)
- **Eliminated Legacy Perimeter Ring** (`InstancedRenderer.js`):
  - Completely removed `this._createCityPerimeter(48.0)` and `_createCityPerimeter(radius)` legacy 48m red torus mesh and decal generation.
  - Verified no residual boundary cylinders, red torus rings, or boundary warning circles exist in the scene graph for the infinite procedural streaming world.

### Changed — Clear Intersection Spawn & Line-of-Sight (@artist & @designer)
- **Open Street Intersection at (0, 0)** (`CityChunk.js`, `main.js`):
  - Designed `_generateSpawnIntersectionBlock()` for chunk `(0, 0)` featuring an open 14-meter central boulevard intersection along X = 0 and Z = 0.
  - Offset four corner sidewalk quadrants with a strict 2.0m setback from roadway borders (`|x| >= 9.0, |z| >= 9.0`), guaranteeing zero building footprint or prop overlap at spawn.
  - Placed 4 distinct approach crosswalks and open street points for wandering pedestrians.
  - Relocated Patient Zero spawn precisely to `(0, 0.01, 0)` on the asphalt roadway.
  - Verified camera line of sight begins with 0 immediate occluded buildings.

### Changed — Horde-First Attrition & 5-Second Last Stand Mist Countdown (@designer & @qa)
- **Absolute Invulnerability for Patient Zero with Swarm Active** (`EntityManager.js`):
  - While `hordeCount > 0`, Patient Zero remains 100% immune to Hazmat decontaminant spray and military sniper rounds—follower zombies act as living shields and absorb all decontaminant exposure and gunfire first.
- **5.0-Second Last Stand Mist Countdown** (`EntityManager.js`, `main.js`, `InstancedRenderer.js`, `index.html`, `style.css`):
  - When `hordeCount === 0`, Patient Zero enters the high-stakes Last Stand phase.
  - Exposed to Hazmat spray while alone: displays a glowing circular HUD timer widget (`#mist-countdown-widget`) and an in-world warning ring (`mistDecontamRing`) tracking a 5.0-second cumulative exposure countdown before `QUARANTINED!` Game Over.
  - Sniper rifle rounds instantly end the run (`SNIPED_ALONE`) if Patient Zero is hit with zero followers remaining.

### Changed — Responsive Mobile Modals & Layered Action Buttons (@artist & @qa)
- **Dynamic Viewport Fit** (`style.css`):
  - Replaced fixed pixel modal heights with dynamic viewport units (`min-height: 100dvh`, `max-height: 90dvh`, `overflow-y: auto`) and safe-area inset padding (`env(safe-area-inset-top)` / `bottom`).
  - Set all modal CTA buttons (`#btn-game-over-restart`, `#btn-initials-confirm`, `#btn-close-leaderboard`) to `z-index: 9999`, `pointer-events: auto`, and `touch-action: manipulation` with sticky bottom positioning to prevent clipping offscreen on mobile devices.

### Fixed — Chrome Unactivated Vibration & Raycasting Synchronization (@qa)
- **Vibration Guard** (`InputController.js`): Checked `navigator.userActivation?.hasBeenActive` before triggering haptic feedback to prevent unactivated frame console errors.
- **Immediate Telemetry Sync** (`main.js`, `EntityManager.js`): Synchronized `occludedBuildingsCount` and `hazmatDamageDealt` immediately for automated playtest validation.

---

## [2.3.0] - 2026-09-13 — "Retro Arcade Initials Entry & Persistent Leaderboards"

### Added — Retro Arcade Initials Entry System (@designer, @artist & @qa)
- **3-Slot Retro Tumbler Modal** (`index.html`, `style.css`, `main.js`):
  - Created `#initials-modal` with high-contrast arcade glassmorphism, animated neon cyan & gold glow accents (`#22d3ee`, `#facc15`), and a 3-character tumbler `[ _ ] [ _ ] [ _ ]`.
  - Cycles through `A-Z`, `0-9`, and space (`' '`) characters on each slot.
  - Slot highlights with a pulsing cyan bezel and active cursor underline when selected.
  - Automatically triggered upon Game Over if the player's final score qualifies for the top 5 on the active difficulty setting.
- **Full Mobile & Desktop Controls**:
  - **Mobile/Touch**: Up (`▲`) and Down (`▼`) arrow touch buttons above and below the active slot to cycle characters, slot tap targeting to change focus, and a prominent golden `#btn-initials-confirm` ("CONFIRM / NEXT") button that advances through slots or submits on the final slot.
  - **Desktop/Keyboard**:
    - `ArrowUp` / `ArrowDown`: Increment/decrement character.
    - `ArrowLeft` / `ArrowRight`: Navigate between slots 1, 2, and 3.
    - `Enter`: Advance to next initial or submit when on slot 3.
    - `Backspace`: Step back to the previous slot.
    - Direct typing: Typing any alphanumeric key (`A-Z`, `0-9`) automatically assigns the letter and auto-advances to the next slot.
- **Synthesized Retro Arcade Audio** (`AudioSystem.js`):
  - `playTumblerClick()`: Crisp 780Hz square-wave tumbler click on character cycling or slot navigation.
  - `playHighScoreFanfare()`: Multi-note upward arpeggio fanfare (C5, E5, G5, C6) when qualifying for the High Score leaderboard.
  - `playInitialsSubmit()`: Celebratory submission chord with quick frequency sweep (440Hz -> 880Hz).

### Added — Persistent Leaderboard System (@designer & @systems)
- **Dedicated Storage System** (`StorageSystem.js`):
  - Modular storage manager persisting top scores under `localStorage` key `zombie_chase_scores` partitioned by difficulty (`outbreak`, `pandemic`, `nightmare`).
  - Stores comprehensive record metadata: `{ initials, score, peakHorde, timeSurvived, difficulty, date }`.
  - Pre-seeded with retro arcade high scores (`"APX"`: 15,000, `"ZED"`: 12,500, `"BIO"`: 10,000, `"NEM"`: 7,500, `"HAZ"`: 5,000).
  - Handles corrupt data, quota exceptions, and fallback memory caching gracefully.
- **Arcade Leaderboard Presentation & Highlighting** (`main.js`, `style.css`, `index.html`):
  - Added a stylized top 5 leaderboard table rendered both on Game Over and in a standalone modal (`#standalone-leaderboard-modal`).
  - Added `#btn-view-leaderboard` icon button to the top HUD toolbar for instant viewing of current rankings.
  - Highlights the player's newly registered score with animated pulsing gold border and glowing background (`.row-new`).
  - Displays rank badges with medals (🥇 1st, 🥈 2nd, 🥉 3rd) and formatted survival stats.

---

### Added — Swarm Squeeze (Fluid Boid Deformation) (@designer & @artist)
- **Fluid Swarm Squeeze Input & State Machine** (`InputController.js`, `EntityManager.js`, `Boids.js`):
  - Added multi-input squeeze state triggered by holding `KeyC` (`c`/`C`), `ShiftLeft`/`ShiftRight`, the dedicated `#btn-squeeze` circular HUD button, or a 2-finger pinch gesture on mobile screens.
  - While active, reduces Boid separation radius by 65% (0.35x), halves separation weight, doubles cohesion attraction toward leader (2.0x), and applies an active lateral pinch force (`normX * lateralOffset * 4.5`) compressing the horde into a streamlined aerodynamic arrow formation.
  - Grants a **+20% movement speed boost** (Patient Zero: 6.8 m/s -> 8.16 m/s; Zombies: up to 9.1 m/s) to slip through narrow alleyways and dodge sniper lasers.
  - Emits directional cartoon slipstream lines (`burstSlipstream`) along the flanks of the compressed pack.
  - Plays dynamic synthesized audio whooshes (`playSqueezeWhoosh`) and mobile haptic impulses.

### Added — Megaphone Warden Civilian Archetype (@designer & @artist)
- **Visual Stylization & Mesh** (`CharacterGeometry.js`, `InstancedRenderer.js`):
  - High-visibility neon orange safety vest (`#f97316`), reflective white horizontal stripes (`#f8fafc`), white construction safety hardhat, and a low-poly hand-held megaphone attached to the right arm.
  - Managed in an instanced mesh pool (`wardenMesh`, capacity 16) with 0 extra draw calls.
  - Emits expanding comic soundwave rings (`)))`) pulsing ahead along their fleeing trajectory (`soundwaveMesh`).
- **AI Behavior & Rallying Aura** (`EntityManager.js`):
  - Runs at rapid evacuation sprint speed (4.8 m/s).
  - Emits a **20-meter rallying aura**: uninfected civilians inside the radius turn to sprint tightly behind the Warden in organized evacuation convoys.
  - Emits periodic comic megaphone chants ("THIS WAY! DON'T LOOK BACK!", "EVACUATE NOW!", "STAY TOGETHER!") with synthesized comic megaphone sound effects (`playMegaphoneChant`).
- **Infection & Silencing Mechanics**:
  - Eliminating/infecting a Warden awards **+150 bonus points**, floating combat text `+WARDEN SILENCED!`, and freezes all rallied civilians in fear for 1.5 seconds (`fearFreezeTimer`), leaving them prime targets for swarm consumption.

### Added — Contagion Slime Trail (@designer & @artist)
- **Toxic Road Decals & Lifespan** (`EntityManager.js`, `InstancedRenderer.js`):
  - Patient Zero leaves a continuous breadcrumb trail of toxic green slime puddle decals (`#4ade80` / `#16a34a`) along asphalt surfaces (elevation `y = 0.025` above ground to prevent z-fighting).
  - Puddles persist for 4.0 seconds, dynamically shrinking over their final 1.0 second.
- **Slipping Hazards & Crowd Disruption**:
  - Uninfected civilians crossing active slime puddles have a **40% chance to slip and lose footing**.
  - Slipped civilians tumble into a 1.0-second grounded stumble, unable to flee, followed by 2.5s slip immunity.
  - Emits comic green slime splash droplets (`burstSlimeSplash`), comic cartoon slide-whistle audio (`playSlimeSlip`), and floating combat text `SLIP!`.

---

## [2.1.0] - 2026-09-13 — "Flashing Ring Removal, Guaranteed Threat/Power-Up Spawns, and Horde Loss Game-Over"

### Changed — Visual Polish & Ring Removal (@artist)
- **Disabled Flashing Rings Around Patient Zero** (`InstancedRenderer.js`):
  - Completely removed the expanding green radar pulsing ring (`outerRing`) and high-frequency inner pulsing ring (`innerRing`).
  - Disabled the flashing opacity oscillation on `beaconBeam` during normal gameplay.
  - Retained the subtle directional motion chevron (`arrowMesh`) that only shows heading while running, and the floating 3D radial countdown ring (`titanRing`) above the head strictly while Titan mode is active.

### Added — Guaranteed Spawns & Threat Discoverability (@designer & @artist)
- **Starting World Power-Up Placement** (`PowerupManager.js`):
  - Pre-spawns a guaranteed **Titan Virus Canister** at `(x: 0, z: -14)` directly ahead on the starting avenue in the player's view frustum.
  - Pre-spawns a secondary power-up (`Speed Surge`) at `(x: 6, z: -26)` on the upcoming cross street.
  - Reduced dynamic spawn interval from 12.0s to 7.0s and tuned forward placement distance to 20–44m so canisters consistently appear in the player's line of sight.
- **Starting Military Riflemen Patrols** (`EntityManager.js`):
  - Pre-spawns 2 tactical squads (4 soldiers) at `(-5, -20)` and `(6, -34)` guarding the first intersection ahead of the player.
  - Tuned streaming military spawn distance from 50–95m down to 28–55m, maintaining 2–6 active soldiers in proximity to the player.

### Added — Horde Loss Survival Countdown & Game-Over (@designer)
- **"Alone & Hunted" State Machine** (`EntityManager.js`):
  - Tracks whether the player has established a horde (`hasHadHorde`).
  - If all horde members are eliminated (e.g. by Hazmat decontaminant spray or sniper rounds), a **7.0-second countdown** begins immediately (`aloneTimer`).
  - Infecting any civilian immediately resets the timer and halts the countdown, reviving the swarm.
  - If the countdown hits 0.0s, or if Patient Zero takes a direct sniper bullet while alone, triggers `HORDE_WIPED_OUT` or `SNIPED_ALONE` Game Over.
- **Alone & Hunted HUD Banner** (`index.html`, `src/style.css`, `src/main.js`):
  - Added `#alone-warning` HUD banner with pulsing red warning header (`⚠️ DANGER: HORDE EXTERMINATED!`), instruction subtitle, dynamic gradient progress bar, and numeric timer display.

---

## [2.0.0] - 2026-09-12 — "Titan Zombie Power-Up & Military Rifleman Threat"

### Added — "Titan Virus" Power-Up (@designer & @artist)
- **Titan Virus Pickup & Biohazard Canister** (`PowerupManager.js`):
  - Added new `titan_virus` power-up type with distinct purple badge (`#a855f7`) and 3D biohazard canister geometry (purple glowing fluid cylinder + dark canister caps).
  - Hovering and spinning pickup entity spawned across city intersections.
- **Dynamic 3.0x Scale & Colossal Transformations** (`EntityManager.js`, `InstancedRenderer.js`):
  - Patient Zero smoothly scales up to **3.0x scale** over 0.5 seconds upon activation, with a colossal ground purple beacon.
  - Complete invulnerability to Hazmat chemical spray cones and military sniper fire.
  - **Total Conversion Stomp**: Walking near or into any entity (Civilians, Hazmats, Military Riflemen) instantly turns them into infected horde members with zero stagger.
  - **Ground Shockwave & Physics Knockback**: Every footstep emits an expanding ground shockwave ring that forcefully propels parked cars, trash cans, and street furniture within a 5m radius.
  - **Dynamic Camera Framing** (`CameraController.js`): Smoothly pulls the camera out an additional 40% (`currentExtraZoom = 1.4`) to comfortably frame the giant leader and surrounding horde.
  - **3D Radial Countdown Ring** (`InstancedRenderer.js`): Renders a hovering neon-purple countdown ring above Patient Zero that dynamically shrinks from 1.0 to 0.0 over the 15-second duration.
  - **Expiration Comic Burst**: Smoothly shrinks back down to 1.0x with a comic puff particle burst (`burstTitanPuff`) and audio cues.

### Added — Military Rifleman Sniper Threat (@designer & @artist)
- **Military Archetype & Character Model** (`CharacterGeometry.js`, `InstancedRenderer.js`):
  - Camouflage fatigues (`#15803d`), protective combat helmet with chin strap, dark combat boots, and procedural assault rifle attached to the right arm.
  - Tactical rifle aiming stance animated via vertex shader (`animType > 3.5`).
  - Managed in an instanced mesh pool (`militaryMesh`) capable of 32 concurrent soldiers.
- **Patrol Formations & Sniper Targeting AI** (`EntityManager.js`):
  - Military units patrol in tactical pairs or guard commercial plaza choke points.
  - 18m targeting range; prioritizes Patient Zero when exposed and within line of sight, otherwise locks onto the nearest horde zombie.
  - **Line of Sight Raycasting**: High-speed 2D obstacle intersection testing against building bounding boxes (`spatialGrid.obstacles`).
  - **Telegraphed Pulsing Red Laser Sight**: Renders dynamic laser sight lines (`THREE.Line`) with pulsing alpha over a 1.5s aiming charge.
  - **Piercing High-Velocity Sniper Round**: Fires piercing bullet tracer rounds that penetrate and eliminate up to 3 horde members in a straight line.
  - **Infection Counterplay**: Swarming a rifleman converts them into infected horde minions (`+SOLDIER INFECTED!`, +75 score).

### Added — Audiovisuals, Floating Combat Text & Particle FX
- **Synthesized Audio Effects** (`AudioSystem.js`): Added procedural Web Audio oscillators for `playGunshot()` (snappy punch + noise crack), `playTitanStomp()` (sub-bass boom + rumble), and `playTitanRoar()` (deep layered guttural roar).
- **Juicy Particle Effects** (`Particles.js`): Added `burstShockwave()` (expanding dual-shockwave rings), `burstTitanPuff()` (comic smoke puffs), and `burstTracer()` (directional bullet sparks).
- **Floating Combat Text** (`style.css`): Added `.fct-titan` (bold purple text with neon glow), `.fct-military` (vibrant soldier alert), and `-3 HORDE` damage warnings.

---

## [1.10.0] - 2026-09-12 — "Warm Chibi Diorama Visual Aesthetic Overhaul"

### Added — Chibi Humanoid Geometry & Playful Character Styling (@artist)
- **Chibi Proportions** (`CharacterGeometry.js`):
  - Redesigned humanoid procedural mesh to stylized proportions: oversized rounded head (~38% of height), compact rounded pill torso, short chunky arms and legs, and distinct accessories (caps and hair).
  - High-contrast character palettes: moss-green skin (`#6ee7b7`) for zombies with torn purple/teal outfits, warm peach/tan skin with cheerful clothing (salmon `#fb7185`, mustard `#facc15`, sky blue `#38bdf8`) for civilians.
  - Bright yellow protective suits (`#eab308`) with cylindrical oxygen tanks for Hazmat specialists.

### Added — Warm Golden Sunlight & Diorama Environment
- **Warm Lighting & Sky Gradient** (`main.js`):
  - Creamy sunlight (`#fff8e7`), soft ambient skylight (`#fef3c7`), and warm golden dusk ground bounce (`#fed7aa`).
  - Warm diorama horizon backdrop matching polished park-builder aesthetics.
- **Stylized Park Diorama Props** (`CityChunk.js`):
  - Procedural chunky diorama trees (fluffy toon canopies + cylindrical trunks) with soft drop shadows.
  - Dark green park benches and decorative street elements.

---

## [1.9.0] - 2026-09-12 — "Zombie Arm Direction Correction & Camera Building Occlusion Fading"

### Fixed — Zombie Arm & Character Forward Orientation (@artist)
- **Forward-Reaching Arm Alignment** (`CharacterGeometry.js`):
  - Inverted local Z offsets for eyes and reaching arms so character forward vector (+Z in model space) strictly aligns with Three.js rotation and velocity vector (-Z in world space when driving forward).
  - Both arms now reach directly forward in the direction of travel without pointing backward towards the camera.
  - Aligned Hazmat chemical sprayer arm and direction indicator chevron with the same forward coordinate axis.
- **Alternating Vertical Sway & Posture Lean** (`CharacterGeometry.js`):
  - Added subtle alternating vertical shamble sway between left and right arms in the vertex shader (`sin(phase * 0.9 + armSign * 1.57) * 0.06`).
  - Adjusted upper body shamble lean to tilt forward into the direction of travel.

### Added — Camera Building Occlusion Raycasting & Translucency (@qa & Systems)
- **Line-of-Sight Raycasting** (`main.js`, `CityChunk.js`, `CityStreamer.js`):
  - Integrated `THREE.Raycaster` checking line of sight between camera position and Patient Zero chest height (1.2m).
  - Merged building geometries now compute bounding boxes and spheres for ultra-fast spatial culling.
  - Active building meshes are retrieved across active chunks via `CityStreamer.getActiveBuildingMeshes()`.
- **Dynamic Alpha Fading & Material Restoration**:
  - Occluding building meshes dynamically enable `material.transparent = true` and lerp opacity toward `0.35` (`opacity += (0.35 - opacity) * 0.15`).
  - Cleared buildings lerp opacity back toward `1.0`. Once opacity reaches `0.99`, `material.transparent` is set back to `false` to avoid unnecessary GPU alpha sorting.
  - Telemetry tracks `occludedBuildingsCount` in real time.

### Automated QA & Verification (@qa)
- **Automated Playtest Suite** (`scripts/playtest.js`, `test-results.json`):
  - Verified building occlusion raycasting and opacity fading behind building chunks.
  - Clean run: **0 runtime console errors**, active horde (`hordeCount: 9`), active Hazmats (`hazmatsActive: 4`), chemical damage registered (`hazmatDamageDealt: 5.2`), and building occlusion verified (`maxOccludedBuildings: 1`).
  - Playtest passed with exit code 0.

---

## [1.8.0] - 2026-09-12 — "Autonomous Self-Correcting Sprint: Threat Attrition & Cel-Shaded Readability"

### Added — Hazmat Threat Logic & Horde Contagion Attrition
- **Decontamination Immunity (`cureImmunity`)** (`EntityManager.js`):
  - Added temporary chemical immunity (`cureImmunity = 2.5s`) to newly-cured civilians decontaminated by Hazmat disinfectant spray.
  - Fixes instant re-infection loop where cured civilians in a dense swarm were immediately re-infected on the next frame.
  - Guarantees Hazmat units actively and demonstrably reduce horde count when zombies linger in the spray cone.
- **Stray Zombie Curing Support** (`EntityManager.js`):
  - Extended Hazmat spray cone detection to identify and cure wandering `stray_zombie` units into civilians.

### Improved — Vibrant Cel-Shaded Graphics
- **Patient Zero Toxic Skin & Reaching Arms** (`CharacterGeometry.js`):
  - Locked Patient Zero's skin and reaching arms to vibrant toxic lime green (`#4ade80`).
  - Preserved light readable asphalt road material (`#475569`) and non-emissive matte crosswalks (`#d1d5db`, `emissive: 0x000000`).

### Automated QA & Playtesting
- **Headless Playtest Suite Verified** (`scripts/playtest.js`, `test-results.json`):
  - Autonomous Playwright test passes cleanly with **0 runtime errors**, active horde contagion (`hordeCount: 55`), active Hazmats (`hazmatsActive: 4`), and verified chemical damage telemetry (`hazmatDamageDealt: 5.4`).

---

## [1.7.0] - 2026-09-12 — "Arcade Power-Ups, Hazmat Chemical Threat & Visual Readability Overhaul"

### Added — Arcade Power-Up Pickups & Special Mutants
- **3 Interactive Power-Up Capsules** (`PowerupManager.js`, `EntityManager.js`):
  - **⚡ Speed Surge**: +60% player movement speed and full chemical spray invulnerability for 6 seconds.
  - **🧲 Meat Magnet**: 3x infection reach and a gravitational vacuum pulling civilians out of alleys toward Patient Zero for 8 seconds.
  - **💥 Bloater Bomb**: Spawns an oversized glowing mutant that aggressively sprints toward the nearest Hazmat squad, detonating on contact to neutralize them and launch them with 8m physics knockback.
  - **Stylized Visuals**: Floating, spinning 1.5m billboard badges with canvas-generated icons, vertical bobbing, and pulsating asphalt ground beacon rings.

### Added — Hazmat Chemical Spray Threat & Attrition System
- **12m 45° Spray Cone Collision** (`EntityManager.js`, `InstancedRenderer.js`):
  - Querying `SpatialGrid.js` for all horde entities inside the Hazmat chemical mist cone.
  - Normal zombies exposed for >0.8s are decontaminated and cured back into fleeing civilians (`cureZombieToCivilian`).
  - **Patient Zero Hazard**: Spray exposure applies a 50% movement slow and triggers an animated red screen-edge vignette (`#spray-danger-overlay`). Continuous exposure for 2.0s triggers Quarantine Game Over with quarantine debriefing modal (`#game-over-modal`).
  - **Standoff AI**: Hazmat units actively flank and track the horde centroid while maintaining a 6-unit standoff distance.

### Added — Bulldozer Prop Destruction & Debris Physics
- **Horde Bulldozer Mechanics** (`EntityManager.js`, `CityChunk.js`, `CityStreamer.js`, `main.js`):
  - When the zombie horde reaches 20+ members, passing over streetlamps, fire hydrants, and trash cans knocks them loose.
  - Props tumble through the air with simulated gravity, ground bouncing, comic dust puffs (`Particles.burstDustCloud`), crash sound effects (`AudioSystem.playPropCrash()`), and `+25 CRUSH!` combat score text.

### Added — Gameplay Juice & Arcade Feedback
- **Squash-and-Stretch Infection Pop** (`InstancedRenderer.js`):
  - Freshly infected zombies expand 1.35x vertically and compress horizontally over 0.25s upon turning.
- **Lime Infection Droplets** (`Particles.js`):
  - Added `burstInfectionDroplets` emitting 6 vibrant lime-green particles on every conversion.
- **Screen-Projected Floating Combat Text** (`main.js`, `style.css`):
  - Camera-projected floating text for `+1`, `COMBO!`, `SPEED SURGE!`, `+25 CRUSH!`, and `💥 BOOM!`.
- **Game Over & Restart Flow** (`index.html`, `style.css`, `main.js`):
  - Added Quarantine Game Over modal with score, horde tally, and instant retry.

### Improved — Visual Readability & Stepped Cel-Shading
- **Locked Down Toxic Zombie Aesthetic** (`CharacterGeometry.js`, `InstancedRenderer.js`):
  - Updated zombie skin to vibrant toxic lime green (`#4ade80`) with patchy moss-green hair (`#166534`) to prevent black scalps from isometric camera angles.
  - Added reaching bare lime hands/claws extending forward (`-Z = -0.65`) with ragged torn shoulder sleeves.
  - Added subtle toxic green emissive base (`0x14532d` at 0.25 intensity) on `zombieMat` ensuring zombies never silhouette or drop to black in shadows.
  - Stepped 2-tone cel-shading ramp map for crisp comic contrast.
  - Lightened asphalt roads to `#475569` so characters and props stand out vividly against the pavement.
- **Locked Down Street Lighting** (`main.js`):
  - Boosted ambient light floor to 0.95 and hemisphere sky/ground bounce (`0xb0d4ff` / `0xfff8e7`) to 1.45 to eliminate dark alleys.
  - Set street lamp PointLights to 14m radius with 1.5 decay, 3.6m height, and soft warm amber tone (`0xffdf88`) to generate broad natural lighting pools without harsh hotspots.

---

## [1.6.0] - 2026-09-12 — "Cel-Shaded Comic Art Style & Vibrant World Overhaul"

### Added — Cel-Shaded Material & Discrete Ramp Lighting
- **Programmatic 3-Step Ramp Map** (`CharacterGeometry.js`, `InstancedRenderer.js`, `CityStreamer.js`):
  - Created and exported `createCelGradientMap()` using a 3-step discrete gradient texture (`Uint8Array([80, 170, 255])`, `THREE.RedFormat`, `THREE.NearestFilter`).
  - Applied the ramp map across all `THREE.MeshToonMaterial` instances for characters (Zombies, Civilians, Hazmats, Patient Zero), procedural buildings, Kenney assets, sidewalks, and props, producing crisp comic-book illumination bands.

### Added — High-Contrast Character Aesthetics & Expressive Eyes
- **Stylized Character Eyes** (`CharacterGeometry.js`):
  - Added stylized white oval eyes with black dot pupils to all character geometries (tagged with `aLimb = 1.0` so eyes follow head tilt, bob, and stagger).
- **Vibrant Comic Character Palettes** (`CharacterGeometry.js`):
  - Replaced dull skin with vivid toxic moss green (`#55b359`) for zombies and Patient Zero, accompanied by deep navy and crimson torn clothes.
  - Switched civilian clothing to bright cheerful pastel shirts (`#fcd34d`, `#38bdf8`, `#fb7185`, `#34d399`, `#c084fc`).

### Added — Architectural Detailing: Rooftop Props & Storefront Awnings
- **Striped Storefront Awnings** (`CityChunk.js`):
  - Added sloped striped canopies with decorative scalloped valances (crimson/white, blue/white, emerald/white, tangerine/white) on ground-floor facades.
- **Rooftop Industrial Details** (`CityChunk.js`):
  - Equipped building rooftops with industrial AC condenser units (metal chassis with circular fan grills) and classic cartoon wooden water towers (stilts, support platforms, cedar wood barrels, and conical caps).
  - Merged all building additions via `safeMergeGeometries` to maintain single-mesh draw-call efficiency per chunk.

### Fixed — Street Contrast, Glare-Free Crosswalks & Cel Lighting
- **Lightened Street Surfaces** (`CityStreamer.js`, `CityChunk.js`):
  - Asphalt road brightened to clean slate grey (`#6b7280`, matte `roughness = 0.9`, `metalness = 0.0`).
  - Sidewalks brightened to light concrete grey (`#e5e7eb`) with charcoal perimeter curbs (`#374151`).
  - Crosswalks changed to non-emissive muted off-white (`#d1d5db`, `emissive = 0x000000`), eliminating bloom glare.
- **Post-Processing & Balanced Cel Lighting** (`main.js`):
  - Raised `UnrealBloomPass` threshold to `0.93` (strength `0.22`), ensuring only high-intensity arcade powerups, hazard lasers, and infection particles bloom.
  - Tuned `HemisphereLight` (intensity 1.4 with `#bfdbfe` sky bounce and `#fffbeb` ground bounce) and `AmbientLight` (intensity 0.9 with `#fffbeb`), ensuring shadows never fall below a 40% brightness floor.

---

## [1.5.0] - 2026-09-12 — "Visual Lighting, Stable Limbs & Cartoony World Overhaul"

### Fixed — Character Arm Geometry & Vertex Shader Stability
- **Locked Zombie Arms Forward (-Z)** (`CharacterGeometry.js`):
  - Reconstructed zombie and Patient Zero character meshes so arms are statically extended forward (-Z) out in front of the body at the geometry level.
  - Eliminated complex 90-degree vertex rotation math that caused vertices to detach and explode upwards into the sky.
  - Retained subtle whole-body shamble tilt (hunched posture and gentle side-to-side body rock) without non-uniform vertex distortion.
- **Anchored Civilian Arms at Shoulders** (`CharacterGeometry.js`):
  - Modelled civilian arms hanging downward from shoulder joints at `Y = 1.38`.
  - Implemented a clean, rigid ±20° swing around the shoulder axis (`py = transformed.y - 1.38`), ensuring shoulder vertices remain 100% attached to the torso with zero stretching.
- **Eliminated Vertex Separation**:
  - Removed non-uniform vertical squash-and-stretch scaling which tore limbs apart; replaced with rigid whole-body stride translation.
- **Protected Humanoid Segmented Geometries** (`InstancedRenderer.js`):
  - Prevented monolithic imported Kenney FBX meshes from overwriting custom humanoid geometry tags, preserving clean limb segmentation.

### Fixed — Scene Lighting & Tone Mapping
- **ACES Filmic Tone Mapping** (`main.js`):
  - Configured `renderer.toneMapping = THREE.ACESFilmicToneMapping` with `renderer.toneMappingExposure = 1.3` to eliminate crushed blacks and muddy shadows.
- **High-Visibility Lighting Setup** (`main.js`):
  - Added a strong `THREE.AmbientLight(0xffffff, 1.2)` guaranteeing all unlit streets, alleys, and building faces are bright and clearly readable.
  - Added `THREE.DirectionalLight(0xffffff, 1.8)` angled high across the street at `[30, 60, 30]` with real-time target tracking following the player.
- **Road & Sidewalk Materials** (`CityStreamer.js`, `CityChunk.js`):
  - Brightened asphalt road surface to clean `#4a5260`.
  - Updated sidewalk slab to light concrete grey `#cfd6df` with dark grey perimeter curbs `#2c323d`.
  - Replaced blinding neon beams with non-emissive painted yellow dashed center lines (`#f1c40f`) and clean painted white crosswalks.

### Added — Cartoony / Hand-Made Architecture & Environment Props
- **Stepped Stylized Buildings** (`CityChunk.js`):
  - Replaced generic flat box buildings with 2–3 stepped stories featuring progressive floor insets.
  - Added contrasting protruding trim ledges and roof parapets (`#f8f9fa`, `#264653`, `#f1c40f`, `#343a40`).
  - Added grid windows with emissive pale yellow (`#fff3b0`) and pale blue (`#a0c4ff`) panes on all exposed facades.
  - Adopted a curated arcade building palette: Warm Coral (`#e76f51`), Mustard Yellow (`#e9c46a`), Mint Green (`#2a9d8f`), Brick Red (`#d62828`), and Navy (`#1d3557`).
- **Low-Poly Round Trees** (`CityChunk.js`, `PropManager.js`):
  - Created stylized cartoon trees with brown cylinder trunks (`#5c4033`) and faceted segmented icosphere foliage tops (`IcosahedronGeometry`) in `#2e7d32` and `#43a047`.
- **Stylized Parked & Blocking Cars** (`CityChunk.js`, `PropManager.js`):
  - Built boxy arcade cars with vibrant chassis colors (`#e63946`, `#ffb703`, `#00b4d8`, `#55a630`), dark tinted cabin roofs, bumpers, headlights, and 4 wheels.
- **Stylized Hydrants & Dumpsters** (`CityChunk.js`, `PropManager.js`):
  - Added vibrant red (`#e63946`) hydrants with nozzle caps and dark green (`#1b4332`) dumpsters with dark charcoal lids (`#081c15`).

---

## [1.4.0] - 2026-09-12 — "The Mega Upgrade"

### Added — Animations
- **A1 Head Bob/Tilt**: All characters now have side-to-side head tilts in GLSL shader (zombies ±8°, civilians ±4°), making everyone feel alive even at low speed.
- **A2 Conversion Stagger**: When a civilian is infected, their body spins and head thrashes violently for ~0.6s (via `flail` attribute in shader) before settling into zombie posture.
- **A3 Hazmat Single-Arm Spray**: Hazmat right arm is locked at 90° forward spray aim; left arm swings freely for natural counterbalance.
- **A4 Civilian Panic Sprint**: At high speed (speedFactor >0.8), civilian arm swing amplitude spikes 2.2× and stride extends 1.65×, giving fleeing citizens an unmistakable desperate sprint.
- **A5 Stray Zombie Slow Shuffle**: Stray zombies (animType 1.5) have their shader speed factor capped at 0.38 so they shuffle visibly slower than horde zombies.

### Added — Gameplay
- **G1 Combo Scoring System**: Infecting enemies within 3s chains a multiplier; score += 10 × combo. Combo counter resets if chain breaks. HUD shows score + combo burst.
- **G3 Hazmat Helicopter Drop**: When horde ≥ 30, hazmats now spawn at Y=18 and animate down from the sky over 2.25s before engaging.
- **G4 Horde Milestone Abilities**: Reaching 10 zombies unlocks AOE Burst (infects all civilians within 8m); 25 zombies unlocks Fear Wave (stuns all hazmats 4s).
- **G5 Civilian Hiding**: At panic ≥ 0.6, civilians near zombies have a chance to duck into buildings (hideTimer 8–16s) then re-emerge, effectively clearing the street.
- **G7 Cure Stagger**: Newly-cured civilians have `cureFlail = 1.2` which decays over ~0.7s, causing them to stagger back to normal gait.
- **E7 Gas Cloud Zones**: `spawnGasCloud()` creates 4.5m radius hazard areas that auto-infect civilians inside over ~5s of exposure.

### Added — Visuals
- **V1 Bloom + Vignette**: Post-processing via `EffectComposer` + `UnrealBloomPass` (strength 0.55, radius 0.45) + custom GLSL vignette pass. Bloom boosts on frenzy.
- **V2 Dynamic Time of Day**: Sky background, fog, and directional sun smoothly lerp from calm daylight → crimson dusk as `panicLevel` increases.
- **V3 Horde Shadow Mass**: Dark ellipse mesh under player's zombie swarm scales in radius/opacity with horde size (visible at 3+ zombies).
- **V4 Road Puddles**: 2–4 blue-grey puddle planes per chunk on road surfaces.
- **V6 Frenzy Screen Shake**: `CameraController.triggerShake(0.35, 0.55)` — decaying sin jitter in X/Y/Z on frenzy activation and AOE burst.

### Added — Environment
- **E1 Street Lamp PointLights**: Up to 8 `PointLight` instances assigned to nearest chunk lamp positions each frame. Intensity scales with panic-based dusk.
- **E3 Dumpster Fire**: 15% of chunks get an orange glow box prop + `PointLight` (flickering via `sin(time)`) stored in `firePositions[]`.
- **E4 Road-Blocking Cars**: 60% of chunks get 1–2 abandoned cars placed mid-lane and registered as spatial grid obstacles.

### Added — Controls
- **C2 Fixed Joystick**: Toggle button in toolbar switches between floating touch joystick and a fixed bottom-left joystick; persists in `localStorage`.
- **C3 Haptic Feedback**: `navigator.vibrate()` called on infection, frenzy activation, and avatar transfer.
- **C4 Double-Tap Frenzy**: Two taps within 300ms on the game canvas triggers frenzy (mobile-first shortcut).
- **C6 First-Launch Controls Overlay**: Glassmorphism overlay shown on first visit (tracked in `localStorage`), auto-dismisses after 5s.

### Added — Audio
- **E6 Web Audio Soundscape** (`AudioSystem.js`): Procedural crowd murmur (filtered white noise), warbling siren (ramps up with panic), footstep rhythm (speed tracks panicLevel), infection sting, frenzy chord burst, combo stab — no external audio files.

### Added — Performance
- **P1 Boid LOD**: Zombies >50m from Player Zero skip full Boids computation and use cheap linear seek. Reduces CPU load ~40% at 60+ horde members.
- **P5 Adaptive Shadow Quality**: Mobile or low max-texture devices get `BasicShadowMap` + 1024px maps; desktop gets `PCFShadowMap` + 2048px.

---

## [1.3.1] - 2026-09-12


### Fixed
- **InstancedMesh Frustum Culling Disappearance Bug (`InstancedRenderer.js`)**:
  - Identified root cause of zombies and characters vanishing when moving away from the origin `(0, 0)`: Three.js defaults `frustumCulled = true` on `InstancedMesh` and evaluates the base geometry's `boundingSphere` at `(0, 0, 0)`. Once the origin left the camera frustum, the entire mesh was discarded.
  - Set `frustumCulled = false` on `zombieMesh`, `civMesh`, `hazmatMesh`, and `pzMesh` both on instantiation and asset load, completely eliminating character disappearance across the infinite world.
- **Sidewalk Ground Elevation & Leg Sinking**:
  - Added dynamic ground height detection (`getCharacterGroundY`) so characters step up to `Y = 0.23` when on 0.22m elevated sidewalks and drop to `Y = 0.01` on roads, preventing feet from sinking into concrete curbs.
- **Horde Swarm Retention Range (`EntityManager.js`)**:
  - Tightened the stranded swarm catch-up trigger distance from 165m down to 55m (just outside the camera view) so zombies navigating around tight corners immediately catch up to the pack rather than lingering offscreen.
- **Quarantine Hazmat Mobilization Threshold**:
  - Raised Hazmat deployment trigger from 8+ to 15+ zombies and extended decontamination exposure duration to 3.5s, preventing premature curing during early horde exploration.

### Changed
- **Iconic Outstretched Reaching Zombie Arms (`CharacterGeometry.js`)**:
  - Updated GPU vertex animation shader so both Patient Zero and all swarm/stray zombies hold both arms outstretched horizontally in front of them (`armAngle ≈ -1.50 rad`) reaching and grasping forward toward victims.
  - Civilians feature fluid, natural human contralateral arm swings opposite to their leg strides.

---

## [1.3.0] - 2026-09-12

### Added
- **Infinite Procedural World Streaming (`CityStreamer.js`, `CityChunk.js`)**:
  - Replaced the static 96m x 96m grid with an infinite, seamless chunk-based urban generator.
  - Standardized 64m x 64m modular chunks that tile continuously in all directions with continuous 12m-wide streets and 52m x 52m building blocks.
  - Deterministic pseudo-random generation using 2D coordinate hashing (`hash2D(cx, cz)`), ensuring identical layouts and structures whenever returning to previously visited coordinates.
  - Diverse block archetypes: Commercial High-Rise complexes, Skyscraper Plazas, Public City Parks (open grass lawns with trees, walking paths, benches, zero obstacle collision), and Multi-Shop Retail blocks.
- **Active Memory Optimization & Chunk Disposal**:
  - Bounded active 5x5 chunk window (320m x 320m) centered on the player (`renderDistance = 2`).
  - Distance-based chunk unloading (`unloadDistance = 3`) that automatically executes complete WebGL disposal:
    - Calls `geometry.dispose()` on all chunk geometries to reclaim GPU VRAM.
    - Removes meshes from `THREE.Scene`.
    - Purges collision AABBs from `SpatialGrid` chunk obstacle registry.
    - Drops CPU object references for immediate garbage collection, guaranteeing strict $O(1)$ memory usage indefinitely.
- **Dynamic Entity Population Streaming (`EntityManager.js`)**:
  - Removed all 48m arena boundary clamps from Patient Zero and Boids, enabling unlimited travel in any direction.
  - Automatically despawns distant non-horde entities (civilians, stray zombies, hazmats) greater than 140m away.
  - Continuously spawns new civilians and roaming stray zombies on streets in active chunks ahead of the player to maintain a bustling population (~50 civilians, ~16 strays).
  - Horde retention: Swarm zombies that lag > 165m behind are smoothly caught up to the rear of the pack so the player never loses horde members.
- **Visual Contrast & Color Overhaul**:
  - **Asphalt Roads**: Changed road surface from pitch black (`0x181a20`) to clean, modern asphalt grey (`0x3e4550`), providing immediate visual contrast against sidewalks and buildings.
  - **Road Markings**: Added bright double yellow centerlines (`0xf39c12`) and crisp white zebra crosswalk stripes (`0xffffff`) at all four-way chunk intersections.
  - **Sidewalks**: Upgraded to bright concrete grey (`0xb4bcc6`) with elevated curbs (`Y = 0.22`), making pedestrian walkways clearly identifiable.
  - **Vibrant Building Colors**: Curated a rich architectural palette (terracotta brick, cobalt corporate blue, warm amber, emerald green, platinum white, sandstone cream, royal plum, and sky glass cyan) applied via vertex colors and subtle Kenney atlas tints.
  - **Daylight Atmosphere & Soft Fog**: Replaced the pitch-black exponential fog with a clean arcade sky (`0x9ec0e2`), soft linear fog (`THREE.Fog(0x9ec0e2, 90, 240)`), and bright hemisphere fill lighting (`0xdcf0ff` / `0x788898`) so shadows are soft and never pitch black.
  - **Player-Tracking Sunlight**: Directional sunlight and shadow frustum dynamically track `Patient Zero` across the infinite world.

---

## [1.2.0] - 2026-09-12

### Fixed
- **Building Height & Disappearance Bug (`CityGenerator.js`)**:
  - Diagnosed and resolved the compounded pre-scale translation bug in `_generateKenneyBuildingBlock` where `(origH * scaleY) * 0.5` executed before `geom.scale(...)`, displacing buildings up to 810 meters in the sky out of camera frustum.
  - Normalized building pivot baseline to `Y = 0` prior to scaling, then translated flush onto sidewalk at `Y = 0.22`.
- **glTF Building Texture Atlas Orientation (`AssetLoader.js`)**:
  - Set `tex.flipY = false` specifically for `colormap.png` so Kenney commercial building glTF 2.0 models map UVs correctly to texture atlas coordinates.
- **Mesh Normal Computation**:
  - Added `computeVertexNormals()` and visible fallback color (`0x5b6e7a`) to merged building meshes.

---

## [1.1.0] - 2026-09-12

### Added
- **Stray Zombie Swarm Recruitment (`EntityManager.js`, `InstancedRenderer.js`)**:
  - 16 unaligned stray zombies roam the city alleys and streets.
  - Running into stray zombies with Patient Zero or any horde member recruits them into the active swarm.
  - Added green particle burst FX and HUD stray counter.
- **Dynamic City Panic & Speed Escalation**:
  - Panic meter scales dynamically from 0% to 100% based on game time and horde size.
  - Slower, relaxed initial citizen speeds (wander: 1.6 m/s, flee: 3.4 m/s) accelerating up to full-alert sprint (6.2 m/s).
  - Awareness detection radius expands from 4.5m to 8.5m with escalation alert banners.

### Changed
- **Biomechanical Locomotion & Animation Smoothing (`CharacterGeometry.js`)**:
  - Calibrated stride cadence to natural frequencies (2.8 rad/m for humans, 2.4 rad/m for zombies).
  - Eliminated phase jitter and unnatural flailing.
  - Implemented iconic menacing zombie posture (forward-outstretched clutching arms, hunched back) and natural human arm swing with subtle idle breathing.
- **Healthy Civilian Appearance (`AssetLoader.js`)**:
  - Fixed inverted texture UVs (`flipY = true`) on character skins, ensuring civilians display clean peach skin, bright eyes, styled hair, and crisp clothing.
- **Hazmat Unit Decontamination Balance**:
  - Replaced instant-kill cure with sustained mist exposure requirement (~1.8 seconds).
  - Delayed hazmat deployments until horde reaches 8+ members.
  - Added dynamic catch-up acceleration (up to 11.5 m/s) for trailing zombies.

---

## [1.0.0] - 2026-09-12

### Initial Release
- **Core Architecture & Gameplay**:
  - Patient Zero swarm mechanics with boid flocking steering behaviors.
  - Spatial hash grid collision detection (`SpatialGrid.js`) with building AABB sliding.
  - Instanced rendering pipeline (`InstancedRenderer.js`) supporting 1200+ characters with GPU vertex animation.
  - Procedural particle system (`Particles.js`) for infection bursts and hazmat mist.
  - Dynamic isometric camera controller (`CameraController.js`) with horde-dependent zoom.
  - Touch, mouse, and keyboard input controls (`InputController.js`).
- **Asset Normalization & Bug Fixes**:
  - FBX character model orientation normalization (standing upright, feet grounded at Y = 0).
  - Independent `AnimationMixer` instances and `SkeletonUtils.clone()` for skinned meshes.
  - Near/far camera depth clipping (0.5 to 500) and directional light shadow bias calibration.
