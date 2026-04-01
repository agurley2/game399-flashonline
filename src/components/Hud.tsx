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

  const zone = mission?.active ? 'mission' : 'hub'
  const title = mission?.active ? mission.title : 'PIONEER 2'
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

  const mapLabel = mission?.active ? 'FOREST 1' : 'PIONEER 2'
  const lockLabel = combatHud?.lockOn ? 'TARGET LOCK' : 'MANUAL AIM'

  return (
    <div className="ui" data-zone={zone}>
      {/* Center reticle — PSO-style brackets when locked */}
      <div className={`hud-reticle ${combatHud?.lockOn ? 'is-locked' : ''}`} aria-hidden="true">
        <div className="hud-reticle-inner" />
      </div>

      <header className="hud-top">
        <div className="hud-brand">
          <div className="hud-brand-ep">EPISODE I</div>
          <div className="hud-brand-title">FLASH ONLINE</div>
        </div>
        <div className="hud-mission">
          <div className="hud-mission-zone">{title}</div>
          <div className="hud-mission-obj">{objective}</div>
        </div>
        <div className="hud-radar" aria-label="Area map">
          <div className="hud-radar-ring" />
          <div className="hud-radar-grid" />
          <div className="hud-radar-label">{mapLabel}</div>
          <div className="hud-radar-sub">{lockLabel}</div>
          <div className="hud-radar-blip" title="You" />
        </div>
      </header>

      <aside className="hud-status" aria-label="Player status">
        <div className="hud-status-frame">
          <div className="hud-portrait">
            <div className="hud-portrait-silhouette" />
          </div>
          <div className="hud-status-main">
            <div className="hud-job-row">
              <span className="hud-job">{job}</span>
              <span className="hud-lv">LV {level}</span>
              {combatHud && !combatHud.physicsReady ? <span className="hud-warn">PHY…</span> : null}
            </div>

            <div className="hud-stat">
              <span className="hud-stat-label">HP</span>
              <div className="hud-bar hud-bar-hp" role="progressbar" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp}>
                <div className="hud-bar-fill" style={{ width: `${hpPct * 100}%` }} />
                <div className="hud-bar-segments" />
              </div>
              <span className="hud-stat-num">
                {Math.ceil(hp)} / {maxHp}
              </span>
            </div>

            <div className="hud-stat">
              <span className="hud-stat-label">TP</span>
              <div className="hud-bar hud-bar-tp" role="progressbar" aria-valuenow={tp} aria-valuemin={0} aria-valuemax={maxTp}>
                <div className="hud-bar-fill" style={{ width: `${tpPct * 100}%` }} />
                <div className="hud-bar-segments" />
              </div>
              <span className="hud-stat-num">
                {Math.ceil(tp)} / {maxTp}
              </span>
            </div>

            <div className="hud-xp">
              <span className="hud-xp-label">NEXT</span>
              <div className="hud-bar hud-bar-xp">
                <div className="hud-bar-fill" style={{ width: `${xpPct * 100}%` }} />
              </div>
              <span className="hud-meseta">
                <abbr title="Meseta">MST</abbr> {meseta}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {mission?.active ? (
        <div className="hud-wave" role="status">
          WAVE {combatHud?.wave ?? 1} — REMAINING {enemies}
        </div>
      ) : (
        <div className="hud-wave hud-wave-hub" role="status">
          HUNTERS GUILD — TELEPIPE READY
        </div>
      )}

      <nav className="hud-palette" aria-label="Action palette">
        <div className="hud-palette-label">PALETTE</div>
        <div className="hud-slots">
          <div className="hud-slot">
            <span className="hud-slot-key">1</span>
            <span className="hud-slot-name">NORMAL</span>
            <span className="hud-slot-hint">Combo</span>
          </div>
          <div className={`hud-slot ${cdHeavy > 0 ? 'is-cd' : ''}`}>
            <span className="hud-slot-key">2</span>
            <span className="hud-slot-name">HEAVY</span>
            {cdHeavy > 0 ? <span className="hud-slot-cd">{cdHeavy.toFixed(1)}</span> : <span className="hud-slot-hint">Slash</span>}
          </div>
          <div className={`hud-slot ${cdTech > 0 ? 'is-cd' : ''}`}>
            <span className="hud-slot-key">3</span>
            <span className="hud-slot-name">TECH</span>
            {cdTech > 0 ? <span className="hud-slot-cd">{cdTech.toFixed(1)}</span> : <span className="hud-slot-hint">Cast</span>}
          </div>
        </div>
        <div className="hud-palette-meta">
          COMBO {combatHud?.comboStep ?? 0}/3 · {combatHud?.lockOn ? 'LOCK-ON' : 'E TO LOCK'}
        </div>
      </nav>
    </div>
  )
}
