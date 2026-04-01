import { useMemo } from 'react'
import type { GameState } from '../game/types'

export function Hud(props: {
  game: GameState | null
  hint: string
  mission: { active: boolean; title: string; objective: string; job: string } | null
  combatHud:
    | {
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
      }
    | null
}) {
  const { hint, mission, combatHud, game } = props

  const title = mission?.active ? mission.title : 'Pioneer 2'
  const objective = mission?.active ? mission.objective : hint
  const job = combatHud?.job ?? mission?.job ?? game?.className ?? 'HUmar'
  const hp = combatHud?.hp ?? game?.hp ?? 100
  const maxHp = combatHud?.maxHp ?? game?.maxHp ?? 100
  const tp = combatHud?.tp ?? game?.tp ?? 35
  const maxTp = combatHud?.maxTp ?? game?.maxTp ?? 35
  const enemies = combatHud?.enemiesRemaining ?? 0
  const cdHeavy = combatHud?.cdHeavy ?? 0
  const cdTech = combatHud?.cdTech ?? 0

  const xp = game?.xp ?? 0
  const level = game?.level ?? 1
  const meseta = game?.meseta ?? 0
  const next = level * 100
  const xpPct = useMemo(() => Math.max(0, Math.min(1, xp / next)), [xp, next])
  const hpPct = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)))
  const tpPct = Math.max(0, Math.min(1, tp / Math.max(1, maxTp)))

  return (
    <div className="ui">
      <div className="topbar">
        <div className="brandplate">
          <div className="brandplate-title">Flash Online Episode I</div>
          <div className="brandplate-sub">{title}</div>
        </div>

        <div className="topbar-center">
          <div className="tipchip" role="status" aria-live="polite">
            {objective}
          </div>
          {mission?.active ? (
            <div className="questchip">Wave {combatHud?.wave ?? 1} - Enemies remaining: {enemies}</div>
          ) : (
            <div className="questchip">Lobby prep - Press E at telepipe</div>
          )}
        </div>

        <div className="minimap" aria-label="Minimap (placeholder)">
          <div className="minimap-face">
            <div className="minimap-title">{mission?.active ? 'FOREST 1' : 'PIONEER 2'}</div>
            <div className="minimap-sub">{combatHud?.lockOn ? 'LOCKED TARGET' : 'FREE CAMERA'}</div>
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
              <div className="fill" style={{ width: `${hpPct * 100}%` }} />
            </div>
            <div className="bar tp" aria-label="Technique points">
              <div className="fill" style={{ width: `${tpPct * 100}%` }} />
            </div>
            <div className="xpbar" aria-label="Experience">
              <div className="fill" style={{ width: `${xpPct * 100}%` }} />
              <div className="label">
                LV {level} • HP {Math.ceil(hp)}/{maxHp} • TP {Math.ceil(tp)}/{maxTp} • M {meseta}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="actionbar" aria-label="Action bar">
        <div className="slots">
          <div className="slot">
            <span className="key">1</span>
            <span className="charges">N</span>
          </div>
          <div className="slot">
            <span className="key">2</span>
            <span className="charges">H</span>
            {cdHeavy > 0 ? <span className="cooldown">{cdHeavy.toFixed(1)}</span> : null}
          </div>
          <div className="slot">
            <span className="key">3</span>
            <span className="charges">Tech</span>
            {cdTech > 0 ? <span className="cooldown">{cdTech.toFixed(1)}</span> : null}
          </div>
        </div>
        <div className="palette-note">
          Combo step: {combatHud?.comboStep ?? 0} • {combatHud?.lockOn ? 'Target lock active' : 'No target lock'}
        </div>
      </div>
    </div>
  )
}

