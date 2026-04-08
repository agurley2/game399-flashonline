# Migration Plan: Flash Online (React + Three.js) → Godot 4

This document proposes a **multi-phase, low-risk migration** of the current browser game (React + TypeScript + Three.js + ammo.js + WebAudio) into a **Godot 4** project.

The guiding idea is: **port behavior first, fidelity later**. Each phase ends with a playable, testable milestone.

## Executive summary

- **Phase 0 (Prep)**: lock down scope, inventory systems/assets, create a Godot repo layout, and define “done” for the vertical slice.
- **Phase 1 (Core loop)**: get the **hub → telepipe → field → waves → return** loop running in Godot with placeholder art.
- **Phase 2 (Player + camera + input)**: implement PSO-ish camera, lock-on facing, palette actions (LMB/1/2/3), and HUD.
- **Phase 3 (World + assets)**: import your current GLB/OBJ assets, build a world scene, basic lighting/post.
- **Phase 4 (Combat + enemies)**: AI, damage, projectile, wave manager, drops/collectibles.
- **Phase 5 (Audio)**: rebuild audio with Godot’s audio buses + procedural synth (optional) or samples.
- **Phase 6 (Polish + tooling)**: performance, save data, content authoring workflows, builds.

---

## Current implementation (source of truth)

### Runtime architecture (today)

- **Entry point**: React UI hosts `ThreeViewport`, which loads assets then constructs `Engine`.
- **Main loop**: `Engine.step(dt)` updates player, mission state, physics, animation mixers, and renders.
- **Systems present** (non-exhaustive):
  - **Input**: keyboard + mouse buttons + wheel; camera orbit/zoom; palette actions.
  - **Camera**: chase + orbit delay; pitch/yaw; zoom.
  - **Mission flow**: hub → deploy timer → combat waves → clear → return prompt.
  - **Assets**: `loadGameAssets` loads GLBs + Kenney kit objects; `cloneSkinnedRig` clones rigs; `pickAnimationClip` chooses clips.
  - **Physics**: `ammo.js` world (async init); projectile bodies; collisions.
  - **Audio**: game-level audio singleton (`gameAudio`) + zone music concept.

### Migration scope (recommended)

**In scope for first Godot slice**
- Hub + one field zone (Forest 1)
- Player controller + camera + lock-on
- 3 palette actions (normal/heavy/tech) + one projectile
- Wave spawner + simple enemy chase/attack + death
- HUD showing mission phase, timers, prompts

**Explicitly out of scope until later**
- Networking, matchmaking, accounts
- Full PSO content parity (items, MAG, shops, quests, instanced dungeons)
- Complex animation retargeting/IK

---

## Phase 0 — Setup & mapping (1–2 sessions)

### Goals
- Establish the Godot project as the new “home” without breaking the existing web build.
- Decide what is **ported**, what is **re-authored**, and what is **discarded**.

### Tasks
- Create/choose a Godot project (recommended: `testproj` or a new `godot/` folder in this repo).
- Decide rendering target:
  - **Godot 4 desktop** first (fast iteration), then optionally **Web export** later.
- Create a **system mapping table** (Three.js → Godot), e.g.:
  - Scene graph → Node tree
  - `Engine.step(dt)` → `_process(delta)` / `_physics_process(delta)`
  - AnimationMixer → `AnimationPlayer` or `AnimationTree`
  - ammo.js → Godot built-in 3D physics
- Define acceptance tests for every phase (see “Definition of done” below).

### Deliverables
- Godot project opens and runs an empty main scene.
- A `scenes/` and `scripts/` folder layout and naming conventions.
- A “golden path” run instruction in README (Godot version pinned).

### Definition of done
- Anyone can open the Godot project in Godot 4.6.x and press Play to see a boot scene.

---

## Phase 1 — Boot + scene architecture (1–2 sessions)

### Goals
Create the Godot equivalent of the current runtime skeleton: a single authoritative “game” node with scenes for hub/field.

### Proposed Godot structure
- `scenes/Main.tscn`
  - `Game` (Node)
    - `UI` (CanvasLayer)
    - `WorldRoot` (Node3D)
    - `Audio` (Node)
    - `State` script (game state, mission state)

### Tasks
- Create a `Game.gd` (or C#) script:
  - State machine for `hub → field_deploy → field_combat → field_clear`
  - Timers for deploy + mission elapsed
- Implement scene switching:
  - Hub scene loaded under `WorldRoot`
  - Field scene loaded under `WorldRoot`

### Definition of done
- Press Play → you spawn in hub → interact to enter field → return to hub (even with placeholders).

---

## Phase 2 — Player, camera, input, HUD (2–4 sessions)

### Goals
Match the feel of the current controller and camera enough to validate the migration direction.

### Tasks
- **Input map** in Project Settings:
  - Move (WASD), Run (Shift), Jump (Space)
  - Interact (E), Lock-on (E or separate key if you prefer)
  - Palette: Normal (LMB/1), Heavy (2), Tech (3)
  - Camera orbit (RMB / arrow keys), zoom (wheel)
- Implement `Player.tscn` (CharacterBody3D recommended):
  - Ground movement + run modifier
  - Facing control + lock-on facing
- Implement PSO-ish camera:
  - Follow target offset
  - Manual orbit overrides with “catch-up delay”
  - Zoom clamped distance
- Implement minimal HUD:
  - missionPhase, timer, wave/enemies remaining, interact prompt

### Risks / notes
- If animation is not ready yet, keep movement purely kinematic and add animation later.

### Definition of done
- You can move, orbit/zoom the camera, lock-on, and see HUD values update in real time.

---

## Phase 3 — World + asset import (2–5 sessions)

### Goals
Bring in your current art direction and scenes.

### Tasks
- Import GLBs (`Xbot.glb`, `Soldier.glb`, `Fox.glb`) and environment meshes.
- Decide animation system:
  - For “good enough”: use `AnimationPlayer` on imported rigs
  - For blending: add `AnimationTree` (idle/run transitions)
- Build:
  - `Hub.tscn`: telepipe area, NPC, lighting/fog
  - `Forest1.tscn`: spawn area, boundaries, telepipe return marker
- Materials:
  - Start with standard PBR materials.
  - Later: add toon shading via shader (optional) to match `psoMaterials` vibe.

### Definition of done
- Hub and Forest load with imported meshes; player and NPC/enemy rigs appear at correct scale.

---

## Phase 4 — Combat, enemies, waves, drops (3–6 sessions)

### Goals
Port the “gameplay loop” systems that make the slice fun.

### Tasks
- Enemy scene (`Enemy.tscn`):
  - Simple chase AI
  - Attack cooldown and contact damage
  - Death + despawn
- Wave manager:
  - Spawn N enemies with difficulty scaling per wave
  - Track remaining, emit “wave complete”
- Player actions:
  - Normal combo (can be simplified to single attack at first)
  - Heavy attack (cooldown)
  - Tech (heal or projectile)
- Projectile:
  - Use `RigidBody3D` or simple raycast projectile to start
- Collectibles:
  - Shell pickups, simple counter

### Definition of done
- You can clear at least two waves and trigger “field_clear” → return to hub.

---

## Phase 5 — Audio migration (1–3 sessions)

### Goals
Recreate the core audio experience in Godot.

### Options
- **Option A (fast)**: use sample-based SFX and looped music using `AudioStreamPlayer` + buses.
- **Option B (closer to current)**: reimplement synthy SFX as procedural audio (Godot audio generator / custom AudioStream).

### Tasks
- Create audio buses:
  - `Master`, `Music`, `SFX`, `UI`
- Zone music switching (hub/forest):
  - crossfade or quick fade
- Hook key SFX:
  - lock-on, attacks, hits, death, teleport, wave complete

### Definition of done
- Audio works without a “browser unlock gate”, and the mix is adjustable via buses.

---

## Phase 6 — Save data, tooling, performance, shipping (ongoing)

### Goals
Make it practical to build content and ship.

### Tasks
- Save/load:
  - Godot `ConfigFile` or JSON in `user://`
- Content authoring:
  - Use scenes + resources for enemy templates, wave definitions, quest data
- Performance:
  - Profiling, batching, LODs, occlusion, animation compression
- Build targets:
  - Desktop first; Web export later (validate limitations early if Web is required)

### Definition of done
- Repeatable build pipeline and stable framerate on your target hardware.

---

## System mapping cheat sheet (Three.js → Godot)

- **Scene** (`THREE.Scene`) → `Node3D` root scene
- **Game loop** (`requestAnimationFrame`) → `_process(delta)` (render) and `_physics_process(delta)` (physics)
- **Transforms** (`Object3D.position/rotation`) → `Node3D.global_position / global_transform`
- **AnimationMixer** → `AnimationPlayer` / `AnimationTree`
- **Raycasts** → `RayCast3D` / `PhysicsDirectSpaceState3D` queries
- **ammo.js** → Godot 4 built-in physics (prefer CharacterBody3D for player)
- **UI (React)** → Godot `Control` nodes (CanvasLayer)

---

## Migration strategy recommendations

### Keep vs rewrite
- **Rewrite**: rendering loop, UI layer, physics integration, input handling (Godot-native).
- **Keep/port**: game rules/state machine, mission/wave logic, clip selection heuristics, content tables.
- **Import**: meshes, textures, animations; do scale/axis normalization once.

### Risk management
- Don’t chase perfect toon shading early; validate gameplay loop first.
- Lock a single Godot version (4.6.x) for the migration.
- Maintain the existing web version as a behavioral reference until Phase 4 is stable.

---

## Proposed next step (concrete)

1. Pick the target Godot project folder (recommend using `C:\\Users\\bobya\\Documents\\testproj` as the initial scratch project, then later move into-repo).
2. Create `Main.tscn` + `Game.gd` and implement Phase 1 hub/field state machine using primitives.
3. Port player + camera controls (Phase 2) before importing any complex assets.

