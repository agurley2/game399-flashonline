import {
  ACESFilmicToneMapping,
  AnimationAction,
  AnimationMixer,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { pickAnimationClip } from './animUtils'
import { Input } from './input'
import { cloneSkinnedRig, type GameAssets } from './loadGameAssets'
import { createPostFX, type PostFX } from './post'
import { createSphereBody, initPhysicsWorld, removeBody, type PhysicsWorld } from '../physics'
import type { GameState } from './types'
import { createWorld } from './world'
import { gameAudio } from '../audio/gameAudio'

export type EngineEvents = {
  onHint?: (text: string) => void
  onGameState?: (state: GameState) => void
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
    /** hub | field_deploy | field_combat | field_clear */
    missionPhase: 'hub' | 'field_deploy' | 'field_combat' | 'field_clear'
    missionTimeSec: number
    interactPrompt: string | null
  }) => void
}

type MissionEnemy = {
  id: string
  hp: number
  atkCd: number
  obj: Group
  mixer: AnimationMixer
  run?: AnimationAction
  idle?: AnimationAction
  moveChasing?: boolean
}

export class Engine {
  private host: HTMLElement
  private renderer: WebGLRenderer
  private post: PostFX | null = null
  private scene: Scene
  private camera: PerspectiveCamera
  private raf = 0
  private ro: ResizeObserver
  private detachInput: (() => void) | null = null
  private input = new Input()
  private lastT = 0

  private assets: GameAssets
  private world: ReturnType<typeof createWorld>
  private player = new Group()
  private playerMixer: AnimationMixer | null = null
  private playerIdleAction: AnimationAction | null = null
  private playerRunAction: AnimationAction | null = null
  private playerAnimMoving = false
  private playerVel = new Vector3()
  private playerYaw = 0
  private camYaw = MathUtils.degToRad(180)
  private camPitch = MathUtils.degToRad(12)
  private camDistance = 4.45
  /** After manual orbit, delay before auto camera catches up (PSO-style). */
  private manualCamTimer = 0
  private tmp = new Vector3()
  private tmp2 = new Vector3()
  private tmp3 = new Vector3()

  private physics: PhysicsWorld | null = null
  private mode: 'hub' | 'forest1' = 'hub'
  private missionOrigin = new Vector3(0, 0, 88)
  /** Deployment drop — ahead of the return telepipe (PSO: you land in the field, not on the pipe). */
  private missionSpawnZOfs = 5.25
  private missionExitZOfs = -6.5
  private missionEnemies: MissionEnemy[] = []
  private arrows: { body: any; mesh: Object3D; damage: number; ttl: number }[] = []
  private targetEnemyId: string | null = null
  private missionWave = 0
  private playerHp = 120
  private maxHp = 120
  private playerTp = 36
  private maxTp = 36
  private comboStep = 0
  private comboTimer = 0
  private cdHeavy = 0
  private cdTech = 0
  private meseta = 240
  private lastHudT = 0
  private lastStateT = 0
  private footstepT = 0
  private footstepIdx = 0
  /** Brief warp-in: no control (PSO telepipe deploy). */
  private missionDeployTimer = 0
  private missionElapsed = 0

  private events: EngineEvents
  private game: GameState = {
    xp: 0,
    level: 1,
    meseta: 240,
    className: 'HUmar',
    hp: 120,
    maxHp: 120,
    tp: 36,
    maxTp: 36,
    zone: 'Pioneer 2',
    inventory: [],
    activeQuestId: null,
    completedQuestIds: [],
    questProgress: {},
  }

  constructor(host: HTMLElement, events: EngineEvents = {}, assets: GameAssets) {
    this.host = host
    this.events = events
    this.assets = assets
    this.scene = new Scene()
    this.world = createWorld(this.scene, assets)

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2))
    this.renderer.outputColorSpace = 'srgb'
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.host.appendChild(this.renderer.domElement)

    this.camera = new PerspectiveCamera(50, 1, 0.1, 500)
    this.camera.position.set(0, 3.2, 6)

    this.setupPlayer()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.host)
    this.resize()

    this.detachInput = this.input.attach(this.renderer.domElement)
    this.events.onHint?.(
      'WASD move · Shift run · Space jump · RMB / ←→ orbit cam · Wheel zoom · E interact · Lock-on: E in field · 1/LMB attack · 2 heavy · 3 tech',
    )
    this.events.onGameState?.(this.game)
    this.events.onMission?.({
      active: false,
      title: 'Pioneer 2 - Hunter\'s Guild',
      objective: 'Press E at the telepipe to start Forest 1.',
      job: 'HUmar',
    })

    this.missionOrigin.set(0, this.world.heightAt(0, this.missionOrigin.z), this.missionOrigin.z)

    void initPhysicsWorld({ x: this.world.spawnPoint.x, y: this.world.spawnPoint.y, z: this.world.spawnPoint.z }).then(
      (pw) => (this.physics = pw),
    )

    gameAudio.prime('hub')
  }

  chooseAction(_actionId: string) {
    // placeholder for dialogue actions
  }

  start() {
    this.lastT = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(1 / 30, Math.max(0, (now - this.lastT) / 1000))
      this.lastT = now
      this.step(dt)
      if (this.post) this.post.composer.render()
      else this.renderer.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.detachInput?.()
    this.detachInput = null
    this.host.removeChild(this.renderer.domElement)
    this.renderer.dispose()
  }

  private resize() {
    const { width, height } = this.host.getBoundingClientRect()
    const w = Math.max(1, Math.floor(width))
    const h = Math.max(1, Math.floor(height))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (!this.post) {
      this.post = createPostFX({ renderer: this.renderer, scene: this.scene, camera: this.camera, width: w, height: h })
    } else {
      this.post.setSize(w, h)
    }
  }

  private setupPlayer() {
    this.player.position.copy(this.world.spawnPoint)
    const rig = cloneSkinnedRig(this.assets.player)
    this.player.add(rig)
    this.world.root.add(this.player)
    this.playerYaw = Math.PI
    this.camYaw = this.playerYaw + Math.PI

    this.playerMixer = new AnimationMixer(rig)
    const idleClip = pickAnimationClip(this.assets.player.clips, 'idle', 'samba', 'stand', 'survey')
    const runClip = pickAnimationClip(this.assets.player.clips, 'run', 'walk', 'jog')
    this.playerIdleAction = idleClip ? this.playerMixer.clipAction(idleClip) : null
    this.playerRunAction =
      runClip && idleClip && runClip.name !== idleClip.name ? this.playerMixer.clipAction(runClip) : this.playerIdleAction
    this.playerIdleAction?.play()
  }

  private consumeAnyPressed(codes: Array<'Digit1' | 'Digit2' | 'Digit3' | 'Numpad1' | 'Numpad2' | 'Numpad3'>) {
    for (const c of codes) if (this.input.consumePressed(c)) return true
    return false
  }

  private updateGameState() {
    this.game.hp = Math.round(this.playerHp)
    this.game.maxHp = this.maxHp
    this.game.tp = Math.round(this.playerTp)
    this.game.maxTp = this.maxTp
    this.game.meseta = this.meseta
    this.game.zone = this.mode === 'forest1' ? 'Forest 1' : 'Pioneer 2'
    this.events.onGameState?.({ ...this.game })
  }

  private nearestEnemy(maxDistance = 14) {
    let best: { id: string; dist: number } | null = null
    for (const e of this.missionEnemies) {
      const d = this.tmp.copy(e.obj.position).sub(this.player.position)
      d.y = 0
      const dist = d.length()
      if (dist > maxDistance) continue
      if (!best || dist < best.dist) best = { id: e.id, dist }
    }
    return best
  }

  private getTargetEnemy() {
    if (!this.targetEnemyId) return null
    return this.missionEnemies.find((e) => e.id === this.targetEnemyId) ?? null
  }

  private applyEnemyDamage(enemyId: string, damage: number) {
    const enemy = this.missionEnemies.find((e) => e.id === enemyId)
    if (!enemy) return
    enemy.hp -= damage
    if (enemy.hp > 0) return
    gameAudio.playSfx('enemy_death')
    this.world.root.remove(enemy.obj)
    this.missionEnemies = this.missionEnemies.filter((e) => e.id !== enemy.id)
    if (this.targetEnemyId === enemy.id) this.targetEnemyId = null
    this.game.xp += 18
    this.meseta += 9

    if (this.missionEnemies.length === 0) {
      if (this.missionWave === 1) {
        gameAudio.playSfx('wave_complete')
        this.missionWave = 2
        this.spawnMissionWave(2)
        this.events.onMission?.({
          active: true,
          title: 'Forest 1',
          objective: 'Wave 2: Eliminate all Booma variants.',
          job: 'HUmar',
        })
      } else {
        gameAudio.playSfx('wave_complete')
        this.events.onMission?.({
          active: true,
          title: 'Forest 1',
          objective: 'Area clear. Return to telepipe (E).',
          job: 'HUmar',
        })
        this.events.onHint?.('Forest 1 clear. Move to telepipe and press E to return.')
      }
    }
  }

  private normalAttack() {
    this.comboStep = (this.comboStep % 3) + 1
    this.comboTimer = 0.8
    gameAudio.playSfx(this.comboStep === 1 ? 'melee_combo_a' : this.comboStep === 2 ? 'melee_combo_b' : 'melee_impact')
    const nearest = this.nearestEnemy(3.55)
    const enemyId = this.targetEnemyId ?? nearest?.id
    if (!enemyId) return
    const enemy = this.missionEnemies.find((e) => e.id === enemyId)
    if (!enemy) return
    const d = this.tmp.copy(enemy.obj.position).sub(this.player.position)
    d.y = 0
    if (d.length() > 3.55) return
    const damage = [18, 22, 28][this.comboStep - 1]
    this.applyEnemyDamage(enemy.id, damage)
  }

  private heavyAttack() {
    if (this.cdHeavy > 0) return
    gameAudio.playSfx('melee_heavy')
    this.cdHeavy = 2.2
    const forward = new Vector3(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw)).normalize()
    for (const e of this.missionEnemies) {
      const d = this.tmp.copy(e.obj.position).sub(this.player.position)
      d.y = 0
      const dist = d.length()
      if (dist > 4.2) continue
      const facing = d.normalize().dot(forward)
      if (facing > 0.2) this.applyEnemyDamage(e.id, 36)
    }
  }

  private castTechnique() {
    if (this.cdTech > 0 || this.playerTp < 8) return
    this.playerTp -= 8
    this.cdTech = 3
    if (this.playerHp < this.maxHp * 0.65) {
      gameAudio.playSfx('tech_heal')
      this.playerHp = Math.min(this.maxHp, this.playerHp + 30)
      return
    }
    gameAudio.playSfx('tech_cast')
    this.fireArrow({ damage: 28, speed: 20, color: 0x38bdf8 })
  }

  private step(dt: number) {
    this.comboTimer = Math.max(0, this.comboTimer - dt)
    if (this.comboTimer <= 0) this.comboStep = 0
    this.cdHeavy = Math.max(0, this.cdHeavy - dt)
    this.cdTech = Math.max(0, this.cdTech - dt)
    this.playerTp = Math.min(this.maxTp, this.playerTp + dt * 1.4)

    const deployBefore = this.missionDeployTimer
    const deploying = this.mode === 'forest1' && deployBefore > 0
    if (deploying) this.missionDeployTimer = Math.max(0, this.missionDeployTimer - dt)
    if (this.mode === 'forest1' && !deploying) this.missionElapsed += dt

    if (this.mode === 'forest1' && deployBefore > 0 && this.missionDeployTimer <= 0) {
      this.events.onMission?.({
        active: true,
        title: 'Forest 1 — VR Field',
        objective: `Wave ${this.missionWave}: Eliminate hostiles (lock-on: E).`,
        job: 'HUmar',
      })
    }

    this.manualCamTimer = Math.max(0, this.manualCamTimer - dt)

    const md = this.input.consumeMouseDelta()
    const wheel = this.input.consumeWheel()
    this.camDistance = MathUtils.clamp(this.camDistance + wheel * 0.0065, 2.15, 7.85)

    if (md.dragging) {
      this.manualCamTimer = 2.8
      const s = 0.0024
      this.camYaw -= md.dx * s
      this.camPitch -= md.dy * s
      this.camPitch = MathUtils.clamp(this.camPitch, MathUtils.degToRad(5), MathUtils.degToRad(44))
    }

    if (this.input.isDown('ArrowLeft')) {
      this.manualCamTimer = 2.8
      this.camYaw -= 1.85 * dt
    }
    if (this.input.isDown('ArrowRight')) {
      this.manualCamTimer = 2.8
      this.camYaw += 1.85 * dt
    }

    const ix = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0)
    const iz = (this.input.isDown('KeyS') ? 1 : 0) - (this.input.isDown('KeyW') ? 1 : 0)
    const hasMoveIntent = Math.hypot(ix, iz) > 0.001
    const camForward = new Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)).normalize()
    const camRight = new Vector3(camForward.z, 0, -camForward.x).normalize()
    const move = new Vector3().addScaledVector(camRight, ix).addScaledVector(camForward, iz)
    if (move.lengthSq() > 0) move.normalize()

    const speed = this.input.isDown('ShiftLeft') ? 6.6 : 4.1
    const lockedTarget = this.getTargetEnemy()
    const hasMove = !deploying && hasMoveIntent

    // Hub: telepipe + guild clerk prompts
    let interactPrompt: string | null = null
    if (this.mode === 'hub') {
      const portal = this.world.portals[0]
      if (portal) {
        const pd = this.tmp.copy(portal.object.position).sub(this.player.position)
        pd.y = 0
        if (pd.length() < 3.2) interactPrompt = 'E — Forest 1 (Telepipe)'
      }
      if (!interactPrompt && this.world.npcs[0]) {
        const nd = this.tmp.copy(this.world.npcs[0].object.position).sub(this.player.position)
        nd.y = 0
        if (nd.length() < 2.8) interactPrompt = 'E — Hunter\'s Guild'
      }
    }

    const exitPipe = new Vector3(this.missionOrigin.x, this.player.position.y, this.missionOrigin.z + this.missionExitZOfs)
    const distExit = this.tmp.copy(this.player.position).sub(exitPipe)
    distExit.y = 0
    const exitDist = distExit.length()
    const nearExit = this.mode === 'forest1' && exitDist < 2.75

    // portal enter (hub) — telepipe takes priority over NPC if both in range
    if (this.mode === 'hub' && !deploying && this.input.consumePressed('KeyE')) {
      const p = this.world.portals[0]
      let used = false
      if (p) {
        const d = this.tmp.copy(p.object.position).sub(this.player.position)
        d.y = 0
        if (d.length() < 2.6) {
          this.enterMission()
          used = true
        }
      }
      if (!used && this.world.npcs[0]) {
        const d = this.tmp.copy(this.world.npcs[0].object.position).sub(this.player.position)
        d.y = 0
        if (d.length() < 2.4) {
          this.events.onHint?.('Guild Clerk: “Forest 1 is live. Use the telepipe when you are ready, hunter.”')
        }
      }
    }

    // Forest: E = exit telepipe when clear, else lock-on toggle
    if (this.mode === 'forest1' && !deploying && this.input.consumePressed('KeyE')) {
      if (nearExit && this.missionEnemies.length === 0) {
        gameAudio.playSfx('teleport')
        gameAudio.setZoneMusic('hub')
        this.mode = 'hub'
        this.missionWave = 0
        this.missionElapsed = 0
        this.targetEnemyId = null
        this.player.position.copy(this.world.spawnPoint)
        this.playerHp = this.maxHp
        this.playerTp = this.maxTp
        this.events.onMission?.({
          active: false,
          title: 'Pioneer 2 — Hunter\'s Guild',
          objective: 'Quest complete. Board the telepipe again for another Forest 1 run.',
          job: 'HUmar',
        })
        this.events.onHint?.('Returned to Pioneer 2. Meseta and XP were saved to your character.')
        this.world.setZoneAtmosphere('hub')
      } else {
        const prev = this.targetEnemyId
        const next = prev ? null : (this.nearestEnemy(14)?.id ?? null)
        if (!prev && next) gameAudio.playSfx('lock_on')
        this.targetEnemyId = next
      }
    }

    if (nearExit && this.missionEnemies.length === 0) {
      interactPrompt = 'E — Return to Pioneer 2'
    } else if (nearExit && this.missionEnemies.length > 0) {
      interactPrompt = 'Extract locked — defeat remaining hostiles'
    } else if (this.mode === 'forest1' && !deploying && !nearExit) {
      interactPrompt = 'E — Lock-on / clear lock'
    }

    // PSO palette: keys + LMB primary
    if (this.mode === 'forest1' && !deploying) {
      if (this.consumeAnyPressed(['Digit1', 'Numpad1']) || this.input.consumeMouseButtonPressed(0)) this.normalAttack()
      if (this.consumeAnyPressed(['Digit2', 'Numpad2'])) this.heavyAttack()
      if (this.consumeAnyPressed(['Digit3', 'Numpad3'])) this.castTechnique()
    }

    // vertical grounding
    const groundY = this.world.heightAt(this.player.position.x, this.player.position.z)
    const onGround = this.player.position.y <= groundY + 0.001
    if (onGround) {
      this.player.position.y = groundY
      this.playerVel.y = Math.max(0, this.playerVel.y)
      if (!deploying && this.input.consumePressed('Space')) this.playerVel.y = 5
      if (hasMove) {
        this.footstepT -= dt
        if (this.footstepT <= 0) {
          this.footstepT = this.input.isDown('ShiftLeft') ? 0.26 : 0.32
          gameAudio.playFootstepVariant(this.footstepIdx++)
        }
      } else {
        this.footstepT = 0
      }
    } else {
      this.playerVel.y -= 14 * dt
    }

    // Character facing: lock-on faces target (PSO); else face move dir
    if (lockedTarget) {
      const dx = lockedTarget.obj.position.x - this.player.position.x
      const dz = lockedTarget.obj.position.z - this.player.position.z
      const yawTo = Math.atan2(dx, dz)
      const t = 1 - Math.exp(-16 * dt)
      this.playerYaw = lerpAngle(this.playerYaw, yawTo, t)
      this.player.rotation.y = this.playerYaw
    } else if (hasMove) {
      const desired = Math.atan2(move.x, move.z)
      const t = 1 - Math.exp(-14 * dt)
      this.playerYaw = lerpAngle(this.playerYaw, desired, t)
      this.player.rotation.y = this.playerYaw
    }

    // Camera orbits behind character when not manually steering (PSO chase cam)
    const autoCamOk = this.manualCamTimer <= 0 && !md.dragging
    const wantCamBehind = (hasMove || !!lockedTarget) && autoCamOk
    if (wantCamBehind) {
      const desired = this.playerYaw + Math.PI
      const t = 1 - Math.exp(-(lockedTarget ? 2.85 : 3.6) * dt)
      this.camYaw = lerpAngle(this.camYaw, desired, t)
    }

    this.playerVel.x = hasMove ? move.x * speed : 0
    this.playerVel.z = hasMove ? move.z * speed : 0
    this.player.position.addScaledVector(this.playerVel, dt)

    this.playerMixer?.update(dt)
    this.world.npcMixer?.update(dt)

    if (
      this.playerIdleAction &&
      this.playerRunAction &&
      this.playerIdleAction !== this.playerRunAction &&
      hasMove !== this.playerAnimMoving
    ) {
      this.playerAnimMoving = hasMove
      if (hasMove) {
        this.playerIdleAction.fadeOut(0.14)
        this.playerRunAction.reset().fadeIn(0.14).play()
      } else {
        this.playerRunAction.fadeOut(0.14)
        this.playerIdleAction.reset().fadeIn(0.14).play()
      }
    }

    if (this.mode === 'forest1') {
      const minX = this.missionOrigin.x - 18
      const maxX = this.missionOrigin.x + 18
      const minZ = this.missionOrigin.z - 18
      const maxZ = this.missionOrigin.z + 18
      this.player.position.x = Math.max(minX, Math.min(maxX, this.player.position.x))
      this.player.position.z = Math.max(minZ, Math.min(maxZ, this.player.position.z))
    }

    if (this.mode === 'forest1') {
      const freezeAi = deploying
      for (const e of this.missionEnemies) {
        e.atkCd = Math.max(0, e.atkCd - dt)
        const toPlayer = this.tmp.copy(this.player.position).sub(e.obj.position)
        toPlayer.y = 0
        const dist = toPlayer.length()
        const speedEnemy = this.missionWave === 2 ? 2.2 : 1.8
        const chasing = !freezeAi && dist > 1.35
        const dualFox = e.run && e.idle && e.run.getClip().uuid !== e.idle.getClip().uuid
        if (dualFox && chasing !== e.moveChasing) {
          e.moveChasing = chasing
          if (chasing) {
            e.idle!.fadeOut(0.12)
            e.run!.reset().fadeIn(0.12).play()
          } else {
            e.run!.fadeOut(0.12)
            e.idle!.reset().fadeIn(0.12).play()
          }
        }
        e.mixer.update(dt)
        if (!freezeAi) {
          if (dist > 0.001) {
            toPlayer.normalize()
            if (dist > 1.3) e.obj.position.addScaledVector(toPlayer, speedEnemy * dt)
            e.obj.lookAt(this.player.position.x, e.obj.position.y, this.player.position.z)
          }
          e.obj.position.y = this.world.heightAt(e.obj.position.x, e.obj.position.z)
          if (dist < 1.35 && e.atkCd <= 0) {
            e.atkCd = 1.15
            this.playerHp = Math.max(0, this.playerHp - (this.missionWave === 2 ? 11 : 8))
            gameAudio.playSfx('player_hurt')
          }
        } else {
          e.obj.position.y = this.world.heightAt(e.obj.position.x, e.obj.position.z)
        }
      }
      if (this.playerHp <= 0) {
        this.playerHp = this.maxHp
        this.playerTp = this.maxTp
        this.player.position.set(
          this.missionOrigin.x,
          this.world.heightAt(this.missionOrigin.x, this.missionOrigin.z + this.missionSpawnZOfs),
          this.missionOrigin.z + this.missionSpawnZOfs,
        )
        this.events.onHint?.('You were incapacitated and revived at the Forest 1 drop point.')
      }
    }

    // arrows
    for (const a of [...this.arrows]) {
      a.ttl -= dt
      if (a.ttl <= 0) {
        this.cleanupArrow(a)
        continue
      }
      if (this.physics && a.body?.getWorldTransform) {
        const trans = a.body.getWorldTransform()
        const o = trans.getOrigin()
        ;(a.mesh as any).position.set(o.x(), o.y(), o.z())
      } else if (a.body && '_vx' in a.body) {
        a.body._x += a.body._vx * dt
        a.body._y += a.body._vy * dt
        a.body._z += a.body._vz * dt
        ;(a.mesh as any).position.set(a.body._x, a.body._y, a.body._z)
      }
      for (const e of this.missionEnemies) {
        const d = this.tmp.copy(e.obj.position).sub((a.mesh as any).position)
        if (d.length() < 0.9) {
          gameAudio.playSfx('melee_impact')
          this.cleanupArrow(a)
          this.applyEnemyDamage(e.id, a.damage)
          break
        }
      }
    }

    // camera — chase + slight bias toward lock target (PSO framing)
    const desiredTarget = this.tmp2.copy(this.player.position).add(new Vector3(0, 1.02, 0))
    const lock = this.getTargetEnemy()
    if (lock) {
      this.tmp3.copy(lock.obj.position).add(new Vector3(0, 0.75, 0))
      desiredTarget.lerp(this.tmp3, 0.42)
    }
    const offset = new Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    ).multiplyScalar(this.camDistance)
    const desiredPos = this.tmp.copy(desiredTarget).add(offset)
    this.camera.position.copy(desiredPos)
    this.camera.lookAt(desiredTarget)

    this.lastHudT += dt
    if (this.lastHudT > 0.1) {
      this.lastHudT = 0
      const missionPhase =
        this.mode === 'hub'
          ? 'hub'
          : deploying
            ? 'field_deploy'
            : this.missionEnemies.length === 0
              ? 'field_clear'
              : 'field_combat'

      this.events.onCombatHud?.({
        job: 'HUmar',
        hp: this.playerHp,
        maxHp: this.maxHp,
        tp: this.playerTp,
        maxTp: this.maxTp,
        comboStep: this.comboStep,
        lockOn: !!this.targetEnemyId,
        cdHeavy: this.cdHeavy,
        cdTech: this.cdTech,
        enemiesRemaining: this.mode === 'forest1' ? this.missionEnemies.length : 0,
        wave: this.mode === 'forest1' ? Math.max(1, this.missionWave) : 0,
        physicsReady: !!this.physics,
        missionPhase,
        missionTimeSec: this.mode === 'forest1' ? this.missionElapsed : 0,
        interactPrompt,
      })
    }

    this.lastStateT += dt
    if (this.lastStateT > 0.2) {
      this.lastStateT = 0
      this.updateGameState()
    }
  }

  private enterMission() {
    gameAudio.playSfx('teleport')
    gameAudio.setZoneMusic('forest1')
    this.mode = 'forest1'
    this.missionWave = 1
    this.missionElapsed = 0
    this.missionDeployTimer = 0.9
    this.targetEnemyId = null
    const startZ = this.missionOrigin.z + this.missionSpawnZOfs
    const startY = this.world.heightAt(this.missionOrigin.x, startZ)
    this.player.position.set(this.missionOrigin.x, startY, startZ)
    this.playerVel.set(0, 0, 0)
    this.playerHp = this.maxHp
    this.playerTp = this.maxTp
    this.comboStep = 0
    this.cdHeavy = 0
    this.cdTech = 0
    this.camYaw = this.playerYaw + Math.PI
    this.spawnMissionWave(1)
    this.events.onMission?.({
      active: true,
      title: 'Forest 1 — VR Field',
      objective: 'Deploying… Clear all waves, then use the return telepipe.',
      job: 'HUmar',
    })
    this.events.onHint?.(
      'PSO controls: camera-relative WASD, RMB or ←→ orbit, wheel zoom, E lock-on, 1/LMB combo, 2 heavy, 3 tech.',
    )

    this.world.setZoneAtmosphere('forest1')
  }

  private spawnMissionWave(wave: 1 | 2) {
    for (const e of this.missionEnemies) this.world.root.remove(e.obj)
    this.missionEnemies = []
    const count = wave === 1 ? 5 : 7
    const hp = wave === 1 ? 48 : 64
    for (let i = 0; i < count; i++) {
      const ex = this.missionOrigin.x + (Math.random() - 0.5) * 13
      const ez = this.missionOrigin.z + (Math.random() - 0.5) * 10 + 1.5
      const ey = this.world.heightAt(ex, ez)
      const g = cloneSkinnedRig(this.assets.enemy)
      g.position.set(ex, ey, ez)
      const mixer = new AnimationMixer(g)
      const rc = pickAnimationClip(this.assets.enemy.clips, 'run', 'walk')
      const ic = pickAnimationClip(this.assets.enemy.clips, 'survey', 'idle')
      const run = rc ? mixer.clipAction(rc) : undefined
      const idle = ic ? mixer.clipAction(ic) : undefined
      idle?.play()
      this.world.root.add(g)
      this.missionEnemies.push({
        id: `e${wave}-${i}`,
        hp,
        atkCd: 0,
        obj: g,
        mixer,
        run,
        idle,
        moveChasing: false,
      })
    }
  }

  private fireArrow(opts: { damage: number; speed: number; color: number }) {
    const dir = new Vector3()
    const target = this.getTargetEnemy()
    if (target) {
      dir.copy(target.obj.position).add(new Vector3(0, 0.6, 0)).sub(this.player.position).normalize()
    } else {
      this.camera.getWorldDirection(dir)
      dir.y *= 0.35
      dir.normalize()
    }
    const start = this.tmp.copy(this.player.position).add(new Vector3(0, 1.2, 0)).addScaledVector(dir, 1.0)
    const v = dir.multiplyScalar(opts.speed)

    const mesh = this.assets.arrow.clone(true) as Group
    const c = new Color(opts.color)
    mesh.traverse((o) => {
      const m = (o as Mesh).material
      if (!m) return
      const mats = Array.isArray(m) ? m : [m]
      for (const mat of mats) {
        if ('color' in mat) (mat as MeshStandardMaterial).color.copy(c)
        if ('emissive' in mat) {
          ;(mat as MeshStandardMaterial).emissive.copy(c)
          ;(mat as MeshStandardMaterial).emissiveIntensity = 0.85
        }
      }
    })
    mesh.position.copy(start)
    mesh.lookAt(start.clone().add(v))
    this.world.root.add(mesh)

    if (this.physics) {
      const body = createSphereBody(this.physics, {
        radius: 0.14,
        mass: 0.1,
        x: start.x,
        y: start.y,
        z: start.z,
        vx: v.x,
        vy: v.y,
        vz: v.z,
      })
      this.arrows.push({ body, mesh, damage: opts.damage, ttl: 2.2 })
    } else {
      const fakeBody = { _vx: v.x, _vy: v.y, _vz: v.z, _x: start.x, _y: start.y, _z: start.z }
      this.arrows.push({ body: fakeBody as any, mesh, damage: opts.damage, ttl: 1.2 })
    }
  }

  private cleanupArrow(a: { body: any; mesh: Object3D; damage: number; ttl: number }) {
    if (this.physics && a.body?.getWorldTransform) removeBody(this.physics, a.body)
    this.world.root.remove(a.mesh)
    this.arrows = this.arrows.filter((x) => x !== a)
  }
}

function lerpAngle(a: number, b: number, t: number) {
  const twoPi = Math.PI * 2
  let d = (b - a) % twoPi
  if (d > Math.PI) d -= twoPi
  if (d < -Math.PI) d += twoPi
  return a + d * t
}

