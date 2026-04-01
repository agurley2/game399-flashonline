/**
 * PSO-inspired procedural audio (original synthesis — not Sega assets).
 * Pioneer 2: airy minor 7th pads + ship sub-bass; Forest: darker pads + wind bed.
 */
import type { MusicZone, SfxKey } from './audioTypes'

function midiToHz(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

function getAudioContext(): AudioContext {
  const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new AC()
}

/** Hub: hopeful minor / major 7 spread — lobby “ship city” */
const HUB_CHORDS: number[][] = [
  [220, 261.63, 329.63, 392], // Am7 colors
  [174.61, 220, 261.63, 329.63], // Fmaj7
  [164.81, 196, 246.94, 293.66], // Dm7
  [196, 233.08, 293.66, 349.23], // Gm7
]

/** Forest: lower, minor — field tension */
const FOREST_CHORDS: number[][] = [
  [146.83, 174.61, 220, 261.63],
  [130.81, 155.56, 196, 233.08],
  [164.81, 196, 246.94, 293.66],
  [110, 130.81, 164.81, 196],
]

export class PsoSynthEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null

  private padOscs: OscillatorNode[] = []
  private subOsc: OscillatorNode | null = null
  private arpOsc: OscillatorNode | null = null
  private arpGain: GainNode | null = null
  private padMaster: GainNode | null = null
  private subGain: GainNode | null = null
  private noiseSource: AudioBufferSourceNode | null = null
  private noiseGain: GainNode | null = null

  private chordTimer: ReturnType<typeof setInterval> | null = null
  private arpTimer: ReturnType<typeof setInterval> | null = null
  private windTimer: ReturnType<typeof setInterval> | null = null

  private chordIndex = 0

  master = 1
  music = 0.75
  sfx = 0.9
  muted = false

  private ensureGraph() {
    if (this.ctx && this.masterGain) return
    this.ctx = getAudioContext()
    const ctx = this.ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 12
    comp.ratio.value = 3
    comp.attack.value = 0.003
    comp.release.value = 0.25

    this.masterGain = ctx.createGain()
    this.musicGain = ctx.createGain()
    this.sfxGain = ctx.createGain()

    this.musicGain.connect(this.masterGain)
    this.sfxGain.connect(this.masterGain)
    this.masterGain.connect(comp)
    comp.connect(ctx.destination)
    this.applyMix()
  }

  private applyMix() {
    if (!this.masterGain || !this.musicGain || !this.sfxGain) return
    const m = this.muted ? 0 : this.master
    this.masterGain.gain.value = m
    this.musicGain.gain.value = this.music * 0.42
    this.sfxGain.gain.value = this.sfx * 0.85
  }

  setMix(opts: { master?: number; music?: number; sfx?: number; muted?: boolean }) {
    if (typeof opts.master === 'number') this.master = Math.max(0, Math.min(1, opts.master))
    if (typeof opts.music === 'number') this.music = Math.max(0, Math.min(1, opts.music))
    if (typeof opts.sfx === 'number') this.sfx = Math.max(0, Math.min(1, opts.sfx))
    if (typeof opts.muted === 'boolean') this.muted = opts.muted
    this.applyMix()
  }

  async unlock() {
    this.ensureGraph()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
    this.applyMix()
  }

  stopMusic() {
    if (this.chordTimer) {
      clearInterval(this.chordTimer)
      this.chordTimer = null
    }
    if (this.arpTimer) {
      clearInterval(this.arpTimer)
      this.arpTimer = null
    }
    if (this.windTimer) {
      clearInterval(this.windTimer)
      this.windTimer = null
    }

    for (const o of this.padOscs) {
      try {
        o.stop()
        o.disconnect()
      } catch {
        /* already stopped */
      }
    }
    this.padOscs = []

    if (this.subOsc) {
      try {
        this.subOsc.stop()
        this.subOsc.disconnect()
      } catch {
        /* */
      }
      this.subOsc = null
    }
    if (this.subGain) {
      try {
        this.subGain.disconnect()
      } catch {
        /* */
      }
      this.subGain = null
    }
    if (this.padMaster) {
      try {
        this.padMaster.disconnect()
      } catch {
        /* */
      }
      this.padMaster = null
    }

    if (this.arpOsc) {
      try {
        this.arpOsc.stop()
        this.arpOsc.disconnect()
      } catch {
        /* */
      }
      this.arpOsc = null
    }
    if (this.arpGain) {
      try {
        this.arpGain.disconnect()
      } catch {
        /* */
      }
      this.arpGain = null
    }

    if (this.noiseSource) {
      try {
        this.noiseSource.stop()
        this.noiseSource.disconnect()
      } catch {
        /* */
      }
      this.noiseSource = null
    }
    if (this.noiseGain) {
      try {
        this.noiseGain.disconnect()
      } catch {
        /* */
      }
      this.noiseGain = null
    }
  }

  setZoneMusic(zone: MusicZone) {
    this.ensureGraph()
    const ctx = this.ctx!
    this.stopMusic()

    const chords = zone === 'hub' ? HUB_CHORDS : FOREST_CHORDS
    const chordMs = zone === 'hub' ? 5500 : 6500
    const subHz = zone === 'hub' ? 55 : 41.2

    const padMaster = ctx.createGain()
    this.padMaster = padMaster
    padMaster.gain.value = zone === 'hub' ? 0.14 : 0.11
    padMaster.connect(this.musicGain!)

    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.connect(padMaster)
      o.start()
      this.padOscs.push(o)
    }

    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = subHz
    const subG = ctx.createGain()
    this.subGain = subG
    subG.gain.value = zone === 'hub' ? 0.06 : 0.09
    sub.connect(subG)
    subG.connect(this.musicGain!)
    sub.start()
    this.subOsc = sub

    const applyChord = (idx: number) => {
      const freqs = chords[idx % chords.length]
      const t = ctx.currentTime
      for (let i = 0; i < this.padOscs.length; i++) {
        const f = freqs[i] ?? freqs[0]
        this.padOscs[i].frequency.cancelScheduledValues(t)
        this.padOscs[i].frequency.setValueAtTime(this.padOscs[i].frequency.value, t)
        this.padOscs[i].frequency.exponentialRampToValueAtTime(Math.max(30, f), t + 1.4)
      }
    }

    this.chordIndex = 0
    applyChord(0)
    this.chordTimer = setInterval(() => {
      this.chordIndex++
      applyChord(this.chordIndex)
    }, chordMs)

    // Soft digital arp (PSO field/hub crystalline lead)
    const arpGain = ctx.createGain()
    arpGain.gain.value = zone === 'hub' ? 0.045 : 0.032
    arpGain.connect(this.musicGain!)
    const arp = ctx.createOscillator()
    arp.type = 'triangle'
    arp.connect(arpGain)
    arp.start()
    this.arpOsc = arp
    this.arpGain = arpGain

    const arpPattern = zone === 'hub' ? [0, 7, 12, 7, 4, 12] : [0, 3, 7, 12, 7, 5]
    let arpStep = 0
    const arpRootMidi = zone === 'hub' ? 64 : 55
    const arpMs = zone === 'hub' ? 165 : 210
    this.arpTimer = setInterval(() => {
      const semi = arpPattern[arpStep % arpPattern.length]
      arpStep++
      const base = midiToHz(arpRootMidi + semi)
      const t = ctx.currentTime
      arp.frequency.cancelScheduledValues(t)
      arp.frequency.setValueAtTime(arp.frequency.value, t)
      arp.frequency.exponentialRampToValueAtTime(Math.max(80, base), t + 0.04)
    }, arpMs)

    if (zone === 'forest1') {
      const bufLen = ctx.sampleRate * 2
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1

      const ns = ctx.createBufferSource()
      ns.buffer = buf
      ns.loop = true
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 520
      bp.Q.value = 0.45
      const ng = ctx.createGain()
      ng.gain.value = 0.055
      ns.connect(bp)
      bp.connect(ng)
      ng.connect(this.musicGain!)
      ns.start()
      this.noiseSource = ns
      this.noiseGain = ng

      let wobble = 0
      this.windTimer = setInterval(() => {
        wobble += 0.07
        const f = 320 + Math.sin(wobble) * 220 + Math.sin(wobble * 1.7) * 90
        const t = ctx.currentTime
        bp.frequency.setTargetAtTime(f, t, 0.35)
      }, 120)
    }
  }

  playSfx(key: SfxKey, rate = 1) {
    if (this.muted || !this.ctx || !this.sfxGain) return
    const ctx = this.ctx
    const out = this.sfxGain
    const t = ctx.currentTime
    const r = Math.max(0.5, Math.min(1.4, rate))

    const noiseBurst = (dur: number, gain: number, filterHz: number) => {
      const len = Math.ceil(ctx.sampleRate * dur)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src = ctx.createBufferSource()
      src.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = filterHz * r
      bp.Q.value = 1.2
      const g = ctx.createGain()
      g.gain.setValueAtTime(gain, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      src.connect(bp)
      bp.connect(g)
      g.connect(out)
      src.start(t)
      src.stop(t + dur + 0.02)
    }

    switch (key) {
      case 'ui_click': {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = 3200 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.12, t + 0.004)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
        o.connect(g)
        g.connect(out)
        o.start(t)
        o.stop(t + 0.06)
        break
      }
      case 'teleport': {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(120 * r, t)
        o.frequency.exponentialRampToValueAtTime(2400 * r, t + 0.55)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.22, t + 0.04)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.65)
        o.connect(g)
        g.connect(out)
        noiseBurst(0.35, 0.08, 800)
        o.start(t)
        o.stop(t + 0.7)
        break
      }
      case 'lock_on': {
        const beep = (hz: number, start: number) => {
          const o = ctx.createOscillator()
          o.type = 'square'
          o.frequency.value = hz * r
          const g = ctx.createGain()
          const gt = t + start
          g.gain.setValueAtTime(0, gt)
          g.gain.linearRampToValueAtTime(0.06, gt + 0.003)
          g.gain.exponentialRampToValueAtTime(0.001, gt + 0.07)
          const f = ctx.createBiquadFilter()
          f.type = 'lowpass'
          f.frequency.value = 2800
          o.connect(f)
          f.connect(g)
          g.connect(out)
          o.start(gt)
          o.stop(gt + 0.09)
        }
        beep(880, 0)
        beep(1180, 0.09)
        break
      }
      case 'melee_combo_a': {
        noiseBurst(0.07, 0.14, 420)
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = 180 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.08, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = 1200
        o.connect(f)
        f.connect(g)
        g.connect(out)
        o.start(t)
        o.stop(t + 0.1)
        break
      }
      case 'melee_combo_b': {
        noiseBurst(0.06, 0.12, 520)
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = 240 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.07, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
        o.connect(g)
        g.connect(out)
        o.start(t)
        o.stop(t + 0.09)
        break
      }
      case 'melee_impact': {
        noiseBurst(0.05, 0.18, 380)
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = 90 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.2, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
        o.connect(g)
        g.connect(out)
        o.start(t)
        o.stop(t + 0.13)
        break
      }
      case 'melee_heavy': {
        noiseBurst(0.12, 0.16, 200)
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = 55 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.16, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.setValueAtTime(400, t)
        f.frequency.exponentialRampToValueAtTime(80, t + 0.2)
        o.connect(f)
        f.connect(g)
        g.connect(out)
        o.start(t)
        o.stop(t + 0.25)
        break
      }
      case 'tech_cast': {
        const car = ctx.createOscillator()
        const mod = ctx.createOscillator()
        car.type = 'sine'
        mod.type = 'sine'
        mod.frequency.value = 6
        const modGain = ctx.createGain()
        modGain.gain.value = 80 * r
        mod.connect(modGain)
        modGain.connect(car.frequency)
        car.frequency.value = 400 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.14, t + 0.05)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        car.connect(g)
        g.connect(out)
        mod.start(t)
        car.start(t)
        mod.stop(t + 0.4)
        car.stop(t + 0.4)
        break
      }
      case 'tech_heal': {
        const notes = [523.25, 659.25, 783.99, 1046.5]
        notes.forEach((hz, i) => {
          const o = ctx.createOscillator()
          o.type = 'sine'
          o.frequency.value = hz * r * 0.5
          const g = ctx.createGain()
          const st = t + i * 0.055
          g.gain.setValueAtTime(0, st)
          g.gain.linearRampToValueAtTime(0.09, st + 0.02)
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.35)
          o.connect(g)
          g.connect(out)
          o.start(st)
          o.stop(st + 0.4)
        })
        break
      }
      case 'wave_complete': {
        const scale = [392, 493.88, 523.25, 659.25, 783.99]
        scale.forEach((hz, i) => {
          const o = ctx.createOscillator()
          o.type = 'triangle'
          o.frequency.value = hz * r
          const g = ctx.createGain()
          const st = t + i * 0.045
          g.gain.setValueAtTime(0, st)
          g.gain.linearRampToValueAtTime(0.07, st + 0.02)
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.28)
          o.connect(g)
          g.connect(out)
          o.start(st)
          o.stop(st + 0.32)
        })
        break
      }
      case 'enemy_death': {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(400 * r, t)
        o.frequency.exponentialRampToValueAtTime(60 * r, t + 0.28)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.1, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
        o.connect(g)
        g.connect(out)
        noiseBurst(0.2, 0.1, 600)
        o.start(t)
        o.stop(t + 0.32)
        break
      }
      case 'player_hurt': {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = 145 * r
        const o2 = ctx.createOscillator()
        o2.type = 'square'
        o2.frequency.value = 123 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.1, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
        o.connect(g)
        o2.connect(g)
        g.connect(out)
        o.start(t)
        o2.start(t)
        o.stop(t + 0.16)
        o2.stop(t + 0.16)
        noiseBurst(0.04, 0.08, 700)
        break
      }
      case 'footstep_a':
      case 'footstep_b':
      case 'footstep_c': {
        const seed = key === 'footstep_a' ? 0 : key === 'footstep_b' ? 1 : 2
        const hp = 180 + seed * 35
        noiseBurst(0.038, 0.045 + seed * 0.008, hp)
        break
      }
      default:
        break
    }
  }

  playFootstepVariant(step: number) {
    const v = ((step % 3) + 3) % 3
    const key: SfxKey = v === 0 ? 'footstep_a' : v === 1 ? 'footstep_b' : 'footstep_c'
    this.playSfx(key, 1.05)
  }

  dispose() {
    this.stopMusic()
    this.ctx?.close()
    this.ctx = null
    this.masterGain = null
    this.musicGain = null
    this.sfxGain = null
  }
}

export const psoSynth = new PsoSynthEngine()
