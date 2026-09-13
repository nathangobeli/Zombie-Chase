# 🧟 Zombie Chase — Infinite 3D Swarm Arcade

An isometric 3D arcade survival and swarm-simulation game built with **Three.js** and **Vite**. Take control of **Patient Zero**, rampage through an infinitely expanding procedural city, infect fleeing citizens, recruit roaming stray zombies, and command a massive, unstoppable horde while outmaneuvering tactical Hazmat quarantine squads.

---

## 🎮 Game Overview

In **Zombie Chase**, you lead the viral apocalypse from the ground up:
- **Patient Zero**: You are the swarm vanguard. Your movement directs the flocking behavior of the entire horde.
- **Infection Mechanics**: Run down uninfected civilians to immediately turn them into loyal swarm members.
- **Stray Recruitment**: Discover and touch roaming wild zombies scattered across city alleys to recruit them into your active pack.
- **City Panic Escalation**: As your horde grows and time elapses, city-wide panic rises from 0% to 100%. Citizens transition from relaxed strolls to desperate high-speed sprints.
- **Quarantine Threat**: Specialized Hazmat response units mobilize to decontaminate and cure your zombies with pressurized disinfectant spray. Overwhelm them with sheer swarm numbers!
- **Avatar Transfer**: If your current leader is cornered, instantly transfer consciousness to any living member of your pack.

---

## ✨ Key Features

### 1. 🏙️ Infinite Procedural City Generation
- **Seamless 64m Modular Chunks**: The urban world generates infinitely in all directions as you run, with uninterrupted two-lane avenues (12m width) and pedestrian sidewalks.
- **Deterministic 2D Seeding**: Uses coordinate hashing (`hash2D(cx, cz)`) so returning to previously visited locations recreates identical city blocks, buildings, and parks.
- **Diverse Block Archetypes**:
  - **Commercial High-Rise**: Dual commercial buildings with service alleys and dumpsters.
  - **Skyscraper Plaza**: Modern corporate towers with decorative paved plazas and benches.
  - **Public City Parks**: Lush grass lawns (`#2e7d32`), stone paths, shade trees, and zero building obstacles for fast swarm sprints.
  - **Multi-Shop Retail**: Quadrant retail blocks with varied building heights and alleyways.

### 2. ⚡ Memory-Optimized Chunk Streaming ($O(1)$ RAM / VRAM)
- **Active 5×5 Chunk Window**: Keeps only 25 chunks (320m × 320m) in active memory around the player (`renderDistance = 2`).
- **Complete WebGL Buffer Disposal**:
  - Chunks crossing the unload boundary (`unloadDistance = 3`) are immediately stripped of meshes and their geometries are freed from GPU memory via `geometry.dispose()`.
  - Collision AABBs are purged from the spatial grid.
  - Object references are dropped for immediate garbage collection, guaranteeing constant, bounded memory usage regardless of how far you travel.

### 3. 👥 Dynamic Population Streaming & Swarm Retention
- **Living Infinite City**: Non-horde entities (civilians, stray zombies, hazmats) are dynamically spawned on streets ahead of the player and despawned once beyond 140m, maintaining a consistent density of ~50 civilians and ~16 strays.
- **Horde Lag Retention**: If horde members lag behind (>165m) while navigating around corners, they are smoothly repositioned to the rear of your pack so you never lose your hard-earned swarm.

### 4. 🎨 High-Contrast Visual Aesthetics & Dynamic Lighting
- **Asphalt Grey Roads**: Roads are styled in clean asphalt grey (`#3e4550`) with bright double yellow centerlines and white pedestrian crosswalks.
- **Elevated Concrete Sidewalks**: Bright concrete sidewalks (`#b4bcc6`) with elevated curbs (`Y = 0.22`) provide sharp contrast against streets and buildings.
- **Vibrant Architectural Palettes**: Buildings feature curated modern palettes (terracotta brick, cobalt corporate blue, warm amber, emerald green, platinum white, sandstone cream, royal plum, and glass cyan).
- **Daylight Atmosphere & Tracking Sun**: Crisp arcade sky (`#9ec0e2`), soft linear distance fog, bright ambient hemisphere bounce light, and dynamic directional sunlight that follows Patient Zero.

### 5. 🏃 Biomechanical Locomotion & Menacing Postures
- **Realistic Strides**: Synchronized leg stride cadences (2.8 rad/m for humans, 2.4 rad/m for zombies) with natural arm swing and subtle idle breathing.
- **Terrifying Zombie Form**: Zombies feature forward-outstretched clutching arms, hunched backs, and an asymmetrical lumbering shamble.
- **Healthy Civilian Appearance**: High-resolution face and clothing textures with clean peach skin, bright eyes, and styled apparel.

### 6. 🚀 GPU-Accelerated Instanced Rendering
- **High Entity Capacity**: Custom vertex animation shader injected into `THREE.MeshStandardMaterial` allows rendering 1200+ animated characters at 60 FPS in a single draw call.
- **Spatial Hash Grid**: Zero-allocation 2D spatial hash grid (`SpatialGrid.js`) handles $O(1)$ proximity queries and smooth wall-sliding collision resolution.

---

## 🕹️ Controls

| Action | Keyboard / Mouse | Touch / Mobile |
| :--- | :--- | :--- |
| **Move / Steer** | `W` `A` `S` `D` / Arrow Keys / Click & Drag | Virtual Touch Joystick (drag anywhere) |
| **Frenzy Dash** | `Spacebar` / `Frenzy` Button | Tap `⚡ FRENZY` button (bottom right) |
| **Avatar Transfer** | Double tap directional keys toward a swarm member | Swipe in direction of target swarm member |
| **Reset Game** | Click `RESET` on top-left toolbar | Tap `RESET` on toolbar |

---

## 📁 Project Structure

```
Zombie Chase/
├── index.html                   # Game UI, HUD telemetry overlay & canvas entry
├── package.json                 # Project scripts & dependencies (Three.js, Vite)
├── vite.config.js               # Vite development & build configuration
├── CHANGELOG.md                 # Detailed chronological version changelog
├── README.md                    # Project documentation
├── public/
│   └── assets/
│       ├── buildings/           # Kenney 3D commercial GLB models & colormap
│       └── characters/          # 3D character models, skins, and animations
└── src/
    ├── main.js                  # Application orchestrator, game loop & scene setup
    ├── ai/
    │   └── Boids.js             # Reynolds flocking algorithms (separation, alignment, cohesion)
    ├── camera/
    │   └── CameraController.js  # Dynamic isometric follow camera with horde-scaling zoom
    ├── controls/
    │   └── InputController.js   # Unified keyboard, mouse drag, and virtual touch joystick
    ├── core/
    │   └── SpatialGrid.js       # 2D spatial hash grid for fast proximity & AABB sliding
    ├── entities/
    │   └── EntityManager.js     # State management, infection rules, panic escalation & streaming
    ├── fx/
    │   └── Particles.js         # Instanced GPU particle system for infection & spray mist
    ├── rendering/
    │   ├── CharacterGeometry.js # Low-poly humanoid geometry & vertex shader animation injection
    │   └── InstancedRenderer.js # Batch instanced mesh renderer supporting 1200+ characters
    └── world/
        ├── AssetLoader.js       # Asynchronous FBX, glTF, and texture asset loader
        ├── CityChunk.js         # 64m modular urban chunk with roads, sidewalks, buildings & props
        ├── CityGenerator.js     # Legacy static city generator (fallback)
        ├── CityStreamer.js      # Infinite procedural chunk streamer & memory manager
        └── PropManager.js       # Street furniture and prop instancing manager
```

---

## 🛠️ Technology Stack

- **Core Engine**: [Three.js](https://threejs.org/) (WebGL 3D Rendering)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)
- **Language**: Modern JavaScript (ES2022+ Modules)
- **Styling**: Vanilla CSS3 (Glassmorphism HUD, responsive layout)
- **3D Assets**: Kenney Commercial Buildings & Character Models

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18+ recommended)
- `npm` (comes bundled with Node.js)

### Installation
1. Clone or navigate to the repository directory:
   ```bash
   cd "Zombie Chase"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
Launch the local development server with hot-module reloading:
```bash
npm run dev
```
Open your browser and navigate to the local URL (typically `http://localhost:5173/` or `http://localhost:5174/`).

### Production Build
Compile and bundle the game for production deployment:
```bash
npm run build
```
Preview the production build locally:
```bash
npm run preview
```

---

## 📊 HUD & Telemetry Metrics

- **HORDE**: Total active swarm members currently under your command.
- **CIVILIANS**: Count of living citizens remaining within active proximity.
- **STRAYS**: Number of unaligned wild zombies roaming the nearby streets ready for recruitment.
- **PANIC**: City-wide alert level (0% to 100%), dynamically driving civilian sprint speeds.
- **FPS**: Real-time rendering frame rate.
- **DRAWS**: Number of GPU draw calls executed per frame.

---

## 📄 License

This project is licensed under the MIT License. 3D models and textures courtesy of Kenney ([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)).
