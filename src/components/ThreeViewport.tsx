import { useEffect, useRef } from 'react'
import { Engine } from '../game/engine'
import { loadGameAssets } from '../game/loadGameAssets'

type ThreeViewportProps = {
  className?: string
  onHint?: (text: string) => void
  onGameState?: (state: import('../game/types').GameState) => void
  onEngineApi?: (api: { chooseAction: (actionId: string) => void } | null) => void
  onMission?: (m: { active: boolean; title: string; objective: string; job: string }) => void
  onCombatHud?: (s: {
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
    missionPhase: 'hub' | 'field_deploy' | 'field_combat' | 'field_clear'
    missionTimeSec: number
    interactPrompt: string | null
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

    let engine: Engine | null = null
    let cancelled = false

    void loadGameAssets()
      .then((assets) => {
        if (cancelled || !hostRef.current) return
        engine = new Engine(
          host,
          {
            onHint: (t: string) => eventsRef.current.onHint?.(t),
            onGameState: (s) => eventsRef.current.onGameState?.(s),
            onMission: (m) => eventsRef.current.onMission?.(m),
            onCombatHud: (s) => eventsRef.current.onCombatHud?.(s),
          },
          assets,
        )
        onEngineApi?.({ chooseAction: (id) => engine!.chooseAction(id) })
        engine.start()
      })
      .catch((err) => {
        console.error('Failed to load 3D assets', err)
        eventsRef.current.onHint?.('Failed to load 3D assets. Check console / network.')
      })

    return () => {
      cancelled = true
      onEngineApi?.(null)
      engine?.stop()
    }
  }, [onEngineApi])

  return <div ref={hostRef} className={className} />
}
