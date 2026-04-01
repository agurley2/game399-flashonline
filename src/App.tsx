import { useState } from 'react'
import './App.css'
import { AudioProvider } from './audio/AudioProvider'
import { AudioUnlockGate } from './audio/AudioUnlockGate'
import { Hud } from './components/Hud'
import { ThreeViewport } from './components/ThreeViewport'
import type { GameState } from './game/types'

function App() {
  const [hint, setHint] = useState('Loading…')
  const [game, setGame] = useState<GameState | null>(null)
  const [mission, setMission] = useState<{ active: boolean; title: string; objective: string; job: string } | null>(
    null,
  )
  const [combatHud, setCombatHud] = useState<{
    job: string
    hp: number
    maxHp: number
    tp: number
    maxTp: number
    comboStep: number
    lockOn: boolean
    cdHeavy: number
    cdTech: number
    enemiesRemaining: number
    wave: number
    physicsReady: boolean
  } | null>(null)

  return (
    <AudioProvider>
      <div className="app">
        <main className="viewport-wrap">
          <ThreeViewport
            className="viewport"
            onHint={setHint}
            onGameState={setGame}
            onMission={setMission}
            onCombatHud={setCombatHud}
          />
          <Hud game={game} hint={hint} mission={mission} combatHud={combatHud} />
        </main>
        <AudioUnlockGate />
      </div>
    </AudioProvider>
  )
}

export default App
