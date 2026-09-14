# 🧟 Zombie Chase — Infinite 3D Swarm Arcade (v2.9.0)

[![Version](https://img.shields.io/badge/version-2.9.0-brightgreen.svg)](CHANGELOG.md)
[![Three.js](https://img.shields.io/badge/Three.js-r186-black.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-v8.3.0-646CFF.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An isometric 3D arcade survival and swarm-simulation game built with **Three.js** and **Vite**. Take control of **Patient Zero**, rampage through an infinitely expanding procedural city, infect fleeing citizens, recruit roaming stray zombies, smash through parked and moving cars as a colossal **Titan Infected**, and command a massive, unstoppable horde while outmaneuvering tactical Hazmat quarantine squads and military blockades.

---

## 🎮 Game Overview

In **Zombie Chase**, you lead the viral apocalypse from the ground up:
- **Patient Zero**: You are the swarm vanguard. Your movement directs the flocking behavior of the entire horde.
- **Infection Mechanics**: Run down uninfected civilians to immediately turn them into loyal swarm members.
- **Stray Recruitment**: Discover and touch roaming wild zombies scattered across city alleys to recruit them into your active pack.
- **Titan Infected & Demolition**: Evolve into or trigger Titan Infected mode to smash clean through parked and moving traffic with multi-piece explosive debris physics and demolish street lamps, bushes, and benches!
- **City Panic Escalation**: As your horde grows and time elapses, city-wide panic rises from 0% to 100%. Citizens transition from relaxed strolls to desperate high-speed sprints.
- **Quarantine & Military Threat**: Specialized Hazmat response units and armored military blockades mobilize to decontaminate and neutralize your zombies with pressurized disinfectant spray. Overwhelm them with sheer swarm numbers!
- **Avatar Transfer**: If your current leader is cornered, instantly transfer consciousness to any living member of your pack.
- **Retro Arcade Leaderboard**: Enter your 3-character initials upon game over and immortalize your highest swarm record on the local arcade leaderboard.

---

## ✨ Latest Features (v2.9.0)

### 💥 Titan Car Explosive Demolition & Prop Smashing
- **Vehicle Demolition Physics**: Rampage through parked and moving street traffic as a Titan Infected. Smashed vehicles detonate with directional blast shockwaves, smoke plumes, fireballs, and multi-part tumbling debris:
  - 4 spinning rubber tires bouncing with restitution
  - Front and rear bumpers
  - Painted sheet-metal body panels
  - Heavy cast-iron engine blocks
- **Zero-Draw-Call Prop Smashing**: Demolish street lamps, park bushes, wooden benches, and fire hydrants. Props instantly collapse their mesh geometry without adding any additional GPU draw calls, emitting custom particle bursts (sparks, wood splinters, foliage leaves, and water geysers).

### 💡 Night City Illumination & Dynamic Atmosphere
- **Glow-Casting Street Lamps**: Overhead street fixtures cast warm, atmospheric light onto avenues and sidewalks.
- **Functional Traffic Stoplights**: Realistic 3-color stoplights illuminate intersections with vivid ambient signals.
- **Lit Architectural Windows**: High-rise residential and commercial towers illuminate with warm interior lights across nighttime city blocks.

### 📱 Mobile Optimization & Responsive Viewport
- **Pinch-Zoom Lock**: Native iOS/Android pinch-to-zoom and double-tap gestures locked with `touch-action: none;` and viewport meta controls.
- **Virtual Arcade Touch Joystick**: Smooth, high-precision floating thumbstick with haptic-styled retro responsiveness.
- **Widened Camera Framing**: 25% wider situational isometric camera framing tailored for all mobile screens and aspect ratios.
- **PWA Biohazard App**: Installable progressive web app with high-res biohazard icons (`192x192`, `512x512`, and Apple Touch Icon).

---

## 🕹️ Controls

| Action | Keyboard / Mouse | Touch / Mobile |
| :--- | :--- | :--- |
| **Move / Steer** | `W` `A` `S` `D` / Arrow Keys / Click & Drag | Virtual Touch Joystick (drag anywhere) |
| **Frenzy Dash** | `Spacebar` / `Frenzy` Button | Tap `⚡ FRENZY` button (bottom right) |
| **Avatar Transfer** | Double tap directional keys toward a swarm member | Swipe in direction of target swarm member |
| **Titan Demolition** | Collide with cars and street props as Titan Infected | Collide with cars and street props as Titan Infected |
| **Reset Game** | Click `RESET` on top-left toolbar | Tap `RESET` on toolbar |

---

## 📁 Project Structure

```
Zombie Chase/
├── index.html                   # Game UI, HUD telemetry overlay, arcade modals & canvas entry
├── package.json                 # Project scripts & dependencies (Three.js, Vite)
├── vite.config.js               # Vite development, base relative path & build configuration
├── CHANGELOG.md                 # Detailed chronological version changelog
├── README.md                    # Project documentation
├── .github/
│   └── workflows/
│       └── deploy.yml           # Automated GitHub Pages CI/CD deployment
├── public/
│   ├── manifest.json            # PWA Web App Manifest
│   ├── icon-192.png             # Biohazard home screen icon (192x192)
│   ├── icon-512.png             # Biohazard splash icon (512x512)
│   ├── apple-touch-icon.png     # iOS bookmark icon
│   └── assets/
│       ├── buildings/           # Kenney 3D commercial GLB models & colormap
│       └── characters/          # 3D character models, skins, and animations
└── src/
    ├── main.js                  # Application orchestrator, game loop, debris physics & scene setup
    ├── ai/
    │   └── Boids.js             # Reynolds flocking algorithms with dynamic spacing
    ├── audio/
    │   └── AudioSystem.js       # Synthesized Web Audio sound effects & ambient tracks
    ├── camera/
    │   └── CameraController.js  # Dynamic isometric follow camera with horde-scaling zoom
    ├── controls/
    │   └── InputController.js   # Unified keyboard, mouse drag, and virtual touch joystick
    ├── core/
    │   └── SpatialGrid.js       # 2D spatial hash grid for fast proximity & AABB sliding
    ├── entities/
    │   ├── EntityManager.js     # State management, infection rules, panic escalation & streaming
    │   └── PowerupManager.js    # In-game powerups and mutating viral strains
    ├── fx/
    │   └── Particles.js         # Instanced GPU particle system (explosions, mist, sparks, water)
    ├── rendering/
    │   ├── CharacterGeometry.js # Low-poly humanoid geometry & vertex shader animation injection
    │   └── InstancedRenderer.js # Batch instanced mesh renderer supporting 1200+ characters
    ├── systems/
    │   └── StorageSystem.js     # LocalStorage high-score and arcade leaderboard persistence
    └── world/
        ├── AssetLoader.js       # Asynchronous FBX, glTF, and texture asset loader
        ├── CityChunk.js         # 64m modular urban chunk with static vertex collapsing
        ├── CityGenerator.js     # Static city generator fallback
        ├── CityStreamer.js      # Infinite procedural chunk streamer & memory manager
        ├── PropManager.js       # Street furniture and prop instancing manager
        └── TrafficManager.js    # Procedural street traffic with vehicle demolition support
```

---

## 🛠️ Technology Stack

- **Core Engine**: [Three.js](https://threejs.org/) (WebGL 3D Rendering)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)
- **Language**: Modern JavaScript (ES2022+ Modules)
- **Audio**: Web Audio API (zero-latency procedural sound design)
- **Styling**: Vanilla CSS3 (Glassmorphism HUD, responsive layout)
- **3D Assets**: Kenney Commercial Buildings & Character Models ([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/))

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
Open your browser and navigate to `http://localhost:5173/`.

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

## 📄 License

This project is licensed under the MIT License. 3D models and textures courtesy of Kenney ([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)).
