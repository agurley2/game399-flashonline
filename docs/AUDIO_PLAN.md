# Flash Online — Audio plan

This document describes how music, SFX, and foley are intended to support the **PSO-style hub + Forest 1 mission** slice, where audio is implemented with **Howler.js** (runtime/game) and **use-sound** (React unlock + UI cues).

## Stack

| Piece | Role |
|--------|------|
| **Howler.js** | Looped zone BGM, one-shot SFX, global volume, Web Audio unlock (`Howler.ctx.resume()`). |
| **use-sound** | React hook layer for the first-interaction unlock UI (browser autoplay policy). |
| **`src/audio/gameAudio.ts`** | Singleton `gameAudio`: zone music, SFX keys, mix helpers. Used from `Engine` (no React). |
| **`src/audio/AudioProvider.tsx` + `useGameAudio()`** | React context for unlock state; optional future: mute + sliders. |
| **`src/audio/AudioUnlockGate.tsx`** | Full-screen “click to enable audio” gate. |

## Global / UX

- **Audio unlock**: Browsers block playback until a user gesture. The gate calls `gameAudio.unlock()` then plays a short UI click via `use-sound`.
- **Master routing**: `Howler.volume` / mute; per-zone music Howls and cached SFX Howls respect the same mix (see `gameAudio.setMix`).

## Pioneer 2 (hub)

| Audio | Purpose | Trigger / code |
|--------|---------|----------------|
| **Hub ambient (drone)** | Ship/computer bed; calm lobby | `gameAudio.setZoneMusic('hub')` when returning from mission or after unlock if current zone is hub. |
| **Footsteps** | Grounded movement foley | While grounded + WASD, throttled; rotates `footstep_00` / `04` / `08`. |

## Forest 1 (mission)

| Audio | Purpose | Trigger / code |
|--------|---------|----------------|
| **Forest ambience** | Zone BGM | `gameAudio.setZoneMusic('forest1')` on telepipe entry (`enterMission`). |
| **Teleport / transition** | Instance warp feel | `teleport` on enter mission and on return to hub at telepipe. |
| **Normal combo (slot 1)** | 3-step melee read | `melee_combo_a` → `melee_combo_b` → `melee_impact` (plays on press for feedback even on whiff). |
| **Heavy (slot 2)** | Wide swing | `melee_heavy` on successful heavy press (not on cooldown). |
| **Technique (slot 3)** | Cast vs heal | `tech_heal` on heal route; `tech_cast` + projectile on attack route. |
| **Lock-on (E)** | Target acquisition | `lock_on` when a target is acquired (not when clearing lock). |
| **Projectile hit** | Connect feedback | `melee_impact` on arrow hit. |
| **Enemy death** | Kill confirmation | `enemy_death` when HP reaches 0. |
| **Wave clear** | Pacing / objective | `wave_complete` when a wave is fully cleared (wave 1→2 and final clear). |
| **Player hurt** | Damage feedback | `player_hurt` when an enemy melee connects. |
| **Footsteps** | Same as hub | While moving on ground in mission. |

## File layout (shipped assets)

- `public/audio/music/` — looped BGM (`forest_ambience.mp3`, `hub_drone.wav`).
- `public/audio/sfx/` — renamed Kenney OGG cues + shared impacts/UI.
- `public/audio/LICENSE.txt` — credits and licenses for third-party audio.

## Future extensions (not implemented yet)

- **Mix UI**: master / music / SFX sliders bound to `gameAudio.setMix`.
- **3D positional audio**: Three.js `PositionalAudio` for telepipe hum, enemies, or projectiles.
- **Combat stingers**: short layered loops or one-shots on boss phases or low HP.
- **Dynamic music**: crossfade or stem layers (exploration vs combat).

## References

- Implementation: `src/audio/gameAudio.ts`, `src/game/engine.ts`, `src/audio/AudioUnlockGate.tsx`.
- Credits: `public/audio/LICENSE.txt`.
