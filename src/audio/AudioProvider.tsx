import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { gameAudio } from './gameAudio'

export type GameAudioContextValue = {
  unlocked: boolean
  unlock: () => void
}

const GameAudioContext = createContext<GameAudioContextValue | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    gameAudio.setMix({})
  }, [])

  const unlock = useCallback(() => {
    gameAudio.unlock()
    setUnlocked(true)
  }, [])

  const value = useMemo(() => ({ unlocked, unlock }), [unlocked, unlock])

  return <GameAudioContext.Provider value={value}>{children}</GameAudioContext.Provider>
}

export function useGameAudio() {
  const ctx = useContext(GameAudioContext)
  if (!ctx) throw new Error('useGameAudio must be used within <AudioProvider>')
  return ctx
}
