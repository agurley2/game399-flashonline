import { Howl, Howler } from 'howler'

export type MusicZone = 'hub' | 'forest1'

type SfxKey =
  | 'melee_combo_a'
  | 'melee_combo_b'
  | 'melee_impact'
  | 'melee_heavy'
  | 'tech_cast'
  | 'tech_heal'
  | 'lock_on'
  | 'wave_complete'
  | 'enemy_death'
  | 'player_hurt'
  | 'teleport'
  | 'ui_click'
  | 'footstep_a'
  | 'footstep_b'
  | 'footstep_c'

const sfxFiles: Record<SfxKey, string> = {
  melee_combo_a: 'audio/sfx/melee_combo_a.ogg',
  melee_combo_b: 'audio/sfx/melee_combo_b.ogg',
  melee_impact: 'audio/sfx/melee_impact.ogg',
  melee_heavy: 'audio/sfx/melee_heavy.ogg',
  tech_cast: 'audio/sfx/tech_cast.ogg',
  tech_heal: 'audio/sfx/tech_heal.ogg',
  lock_on: 'audio/sfx/lock_on.ogg',
  wave_complete: 'audio/sfx/wave_complete.ogg',
  enemy_death: 'audio/sfx/enemy_death.ogg',
  player_hurt: 'audio/sfx/player_hurt.ogg',
  teleport: 'audio/sfx/teleport.ogg',
  ui_click: 'audio/sfx/ui_click.ogg',
  footstep_a: 'audio/sfx/footstep_00.ogg',
  footstep_b: 'audio/sfx/footstep_04.ogg',
  footstep_c: 'audio/sfx/footstep_08.ogg',
}

function publicUrl(relative: string): string {
  const base = import.meta.env.BASE_URL
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${relative.replace(/^\//, '')}`
}

class GameAudio {
  private unlocked = false
  private currentZone: MusicZone | null = null

  private hubMusic: Howl | null = null
  private forestMusic: Howl | null = null

  private sfxHowls = new Map<SfxKey, Howl>()

  master = 1
  music = 0.75
  sfx = 0.9
  muted = false

  isUnlocked() {
    return this.unlocked
  }

  setMix(opts: { master?: number; music?: number; sfx?: number; muted?: boolean }) {
    if (typeof opts.master === 'number') this.master = Math.max(0, Math.min(1, opts.master))
    if (typeof opts.music === 'number') this.music = Math.max(0, Math.min(1, opts.music))
    if (typeof opts.sfx === 'number') this.sfx = Math.max(0, Math.min(1, opts.sfx))
    if (typeof opts.muted === 'boolean') this.muted = opts.muted

    Howler.mute(this.muted)
    Howler.volume(this.master)

    this.hubMusic?.volume(this.effectiveMusicVolume() * 0.55)
    this.forestMusic?.volume(this.effectiveMusicVolume() * 0.65)
    for (const h of this.sfxHowls.values()) h.volume(this.effectiveSfxVolume())
  }

  private effectiveMusicVolume() {
    return this.master * this.music
  }

  private effectiveSfxVolume() {
    return this.master * this.sfx
  }

  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    void Howler.ctx.resume()
    this.setZoneMusic(this.currentZone ?? 'hub')
  }

  /** Call when the game first boots so music routing matches the active scene. */
  prime(zone: MusicZone) {
    this.currentZone = zone
  }

  setZoneMusic(zone: MusicZone) {
    this.currentZone = zone
    if (!this.unlocked) return

    if (!this.hubMusic) {
      this.hubMusic = new Howl({
        src: [publicUrl('audio/music/hub_drone.wav')],
        loop: true,
        volume: this.effectiveMusicVolume() * 0.55,
      })
    }
    if (!this.forestMusic) {
      this.forestMusic = new Howl({
        src: [publicUrl('audio/music/forest_ambience.mp3')],
        loop: true,
        volume: this.effectiveMusicVolume() * 0.65,
      })
    }

    if (zone === 'hub') {
      this.forestMusic.stop()
      this.hubMusic.play()
    } else {
      this.hubMusic.stop()
      this.forestMusic.play()
    }
  }

  playSfx(key: SfxKey, rate = 1) {
    if (!this.unlocked || this.muted) return
    let h = this.sfxHowls.get(key)
    if (!h) {
      h = new Howl({
        src: [publicUrl(sfxFiles[key])],
        volume: this.effectiveSfxVolume(),
      })
      this.sfxHowls.set(key, h)
    }
    h.rate(Math.max(0.5, Math.min(1.4, rate)))
    h.volume(this.effectiveSfxVolume())
    h.play()
  }

  playFootstepVariant(step: number) {
    const v = ((step % 3) + 3) % 3
    const key: SfxKey = v === 0 ? 'footstep_a' : v === 1 ? 'footstep_b' : 'footstep_c'
    this.playSfx(key, 1.05)
  }
}

export const gameAudio = new GameAudio()
