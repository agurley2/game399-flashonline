import { useGameAudio } from './AudioProvider'

export function AudioUnlockGate() {
  const { unlocked, unlock } = useGameAudio()

  if (unlocked) return null

  return (
    <button
      type="button"
      className="audio-gate"
      onPointerDown={() => {
        unlock()
      }}
    >
      <div className="audio-gate-panel">
        <div className="audio-gate-title">Enable audio</div>
        <div className="audio-gate-sub">Click anywhere to unlock music and sound (browser requirement).</div>
      </div>
    </button>
  )
}
