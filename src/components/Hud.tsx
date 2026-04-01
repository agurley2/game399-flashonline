import { useMemo } from 'react'
import type { GameState } from '../game/types'

export function Hud(props: {
  game: GameState | null
  hint: string
  mission: { active: boolean; title: string; objective: string; job: string } | null
  combatHud:
    | { job: string; hp: number; charges3: number; cd2: number; enemiesRemaining: number; physicsReady: boolean }
    | null
}) {
  const { hint, mission, combatHud } = props

  const title = mission?.active ? mission.title : 'Sanctuary'
  const objective = mission?.active ? mission.objective : hint
  const job = combatHud?.job ?? mission?.job ?? 'Explorer'
  const hp = combatHud?.hp ?? 100
  const enemies = combatHud?.enemiesRemaining ?? 0
  const cd2 = combatHud?.cd2 ?? 0
  const c3 = combatHud?.charges3 ?? 0

  const xp = props.game?.xp ?? 0
  const level = props.game?.level ?? 1
  const next = level * 100
  const xpPct = useMemo(() => Math.max(0, Math.min(1, xp / next)), [xp, next])

  return (
    <div className="ui">
      <div className="topbar">
        <div className="brandplate">
          <div className="brandplate-title">Flash Online</div>
          <div className="brandplate-sub">{title}</div>
        </div>

        <div className="topbar-center">
          <div className="tipchip" role="status" aria-live="polite">
            {objective}
          </div>
          {mission?.active ? <div className="questchip">Enemies remaining: {enemies}</div> : null}
        </div>

        <div className="minimap" aria-label="Minimap (placeholder)">
          <div className="minimap-face">
            <div className="minimap-title">{mission?.active ? 'HEDGES' : 'SANCTUARY'}</div>
            <div className="minimap-sub">Zone</div>
            <div className="minimap-dot" title="You" />
          </div>
        </div>
      </div>

      <div className="playerframe" aria-label="Player status">
        <div className="pf-portrait" />
        <div className="pf-main">
          <div className="pf-name">
            {job}
            {combatHud && !combatHud.physicsReady ? <span className="pf-note"> • loading physics…</span> : null}
          </div>
          <div className="bars">
            <div className="bar hp" aria-label="Health">
              <div className="fill" style={{ width: `${hp}%` }} />
            </div>
            <div className="xpbar" aria-label="Experience">
              <div className="fill" style={{ width: `${xpPct * 100}%` }} />
              <div className="label">
                LV {level} • {xp}/{next} XP
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="actionbar" aria-label="Action bar">
        <div className="slots">
          <div className="slot">
            <span className="key">1</span>
          </div>
          <div className="slot">
            <span className="key">2</span>
            {cd2 > 0 ? <span className="cooldown">{cd2.toFixed(1)}</span> : null}
          </div>
          <div className="slot">
            <span className="key">3</span>
            <span className="charges">x{c3}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

