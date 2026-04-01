import type { MusicZone, SfxKey } from './audioTypes'
import { psoSynth } from './psoSynth'

export type { MusicZone, SfxKey } from './audioTypes'

class GameAudio {
  isUnlocked() {
    return this._unlocked
  }

  private _unlocked = false

  setMix(opts: { master?: number; music?: number; sfx?: number; muted?: boolean }) {
    psoSynth.setMix(opts)
  }

  async unlock() {
    if (this._unlocked) return
    this._unlocked = true
    await psoSynth.unlock()
    psoSynth.setZoneMusic(this.currentZone ?? 'hub')
  }

  /** Call when the game first boots so music routing matches the active scene. */
  prime(zone: MusicZone) {
    this.currentZone = zone
  }

  private currentZone: MusicZone | null = null

  setZoneMusic(zone: MusicZone) {
    this.currentZone = zone
    if (!this._unlocked) return
    psoSynth.setZoneMusic(zone)
  }

  playSfx(key: SfxKey, rate = 1) {
    if (!this._unlocked) return
    psoSynth.playSfx(key, rate)
  }

  playFootstepVariant(step: number) {
    if (!this._unlocked) return
    psoSynth.playFootstepVariant(step)
  }
}

export const gameAudio = new GameAudio()
