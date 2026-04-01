import useSound from 'use-sound'
import { useGameAudio } from './AudioProvider'

export function AudioUnlockGate() {
  const { unlocked, unlock } = useGameAudio()
  const [playClick] = useSound('/audio/sfx/ui_click.ogg', { volume: 0.45, interrupt: true })

  if (unlocked) return null

  return (
    <button
      type="button"
      className="audio-gate"
      onPointerDown={() => {
        unlock()
        playClick()
      }}
    >
      <div className="audio-gate-panel">
        <div className="audio-gate-title">Enable audio</div>
        <div className="audio-gate-sub">Click anywhere to unlock music and sound (browser requirement).</div>
      </div>
    </button>
  )
}
