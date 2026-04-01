import { useEffect, useRef } from 'react'
import { Engine } from '../game/engine'

type ThreeViewportProps = {
  className?: string
  onHint?: (text: string) => void
  onGameState?: (state: import('../game/types').GameState) => void
  onEngineApi?: (api: { chooseAction: (actionId: string) => void } | null) => void
  onMission?: (m: { active: boolean; title: string; objective: string; job: string }) => void
  onCombatHud?: (s: {
    job: string
    hp: number
    charges3: number
    cd2: number
    enemiesRemaining: number
    physicsReady: boolean
  }) => void
}

export function ThreeViewport({
  className,
  onHint,
  onGameState,
  onEngineApi,
  onMission,
  onCombatHud,
}: ThreeViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const eventsRef = useRef({
    onHint,
    onGameState,
    onMission,
    onCombatHud,
  })

  eventsRef.current = {
    onHint,
    onGameState,
    onMission,
    onCombatHud,
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const engine = new Engine(host, {
      onHint: (t: string) => eventsRef.current.onHint?.(t),
      onGameState: (s) => eventsRef.current.onGameState?.(s),
      onMission: (m) => eventsRef.current.onMission?.(m),
      onCombatHud: (s) => eventsRef.current.onCombatHud?.(s),
    })
    onEngineApi?.({ chooseAction: (id) => engine.chooseAction(id) })
    engine.start()

    return () => {
      onEngineApi?.(null)
      engine.stop()
    }
  }, [onEngineApi])

  return <div ref={hostRef} className={className} />
}

