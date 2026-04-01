import {
  ACESFilmicToneMapping,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { Input } from './input'
import { createWorld } from './world'
import type { GameState } from './types'
import { createSphereBody, initPhysicsWorld, removeBody, type PhysicsWorld } from '../physics'
import { makeArrowMesh, makeHedgeEnemy } from './procModels'
import { createPostFX, type PostFX } from './post'

export type EngineEvents = {
  onHint?: (text: string) => void
  onGameState?: (state: GameState) => void
  onNearbyNpc?: (npcName: string | null) => void
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

  private world = createWorld(new Scene())
  private player = new Group()
  private playerVel = new Vector3()
  private playerYaw = 0
  private camYaw = MathUtils.degToRad(180)
  private camPitch = MathUtils.degToRad(12)
  private camDistance = 5.0
  private tmp = new Vector3()
  private tmp2 = new Vector3()

  private physics: PhysicsWorld | null = null
  private mode: 'hub' | 'mission' = 'hub'
  private missionOrigin = new Vector3(0, 0, 80)
  private missionEnemies: { id: string; hp: number; obj: Group }[] = []
  private arrows: { body: any; mesh: Object3D; damage: number; ttl: number }[] = []
  private playerHp = 100
  private pickupCharges = 0
  private cd2 = 0
  private lastHudT = 0

  private events: EngineEvents
  private game: GameState = {
    xp: 0,
    level: 1,
    inventory: [],
    activeQuestId: null,
    completedQuestIds: [],
    questProgress: {},
  }

  constructor(host: HTMLElement, events: EngineEvents = {}) {
    this.host = host
    this.events = events

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2))
    this.renderer.outputColorSpace = 'srgb'
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.host.appendChild(this.renderer.domElement)

    this.scene = this.world.root.parent as Scene
    this.camera = new PerspectiveCamera(55, 1, 0.1, 500)
    this.camera.position.set(0, 3.2, 6)

    this.setupPlayer()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.host)
    this.resize()

    this.detachInput = this.input.attach(this.renderer.domElement)
    this.events.onHint?.('WASD move • Shift sprint • Space jump • RMB drag camera • E interact')
    this.events.onGameState?.(this.game)
    this.events.onMission?.({ active: false, title: 'Sanctuary', objective: 'Explore the hub.', job: 'Explorer' })

    this.missionOrigin.set(0, this.world.heightAt(0, this.missionOrigin.z), this.missionOrigin.z)

    void initPhysicsWorld({ x: this.world.spawnPoint.x, y: this.world.spawnPoint.y, z: this.world.spawnPoint.z }).then(
      (pw) => (this.physics = pw),
    )
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
    const body = new Mesh(
      new SphereGeometry(0.32, 16, 16),
      new MeshStandardMaterial({ color: new Color(0x60a5fa), roughness: 0.4, metalness: 0.05 }),
    )
    body.position.y = 0.32
    this.player.add(body)
    this.world.root.add(this.player)
    this.playerYaw = Math.PI
    this.camYaw = this.playerYaw + Math.PI
  }

  private consumeAnyPressed(codes: Array<'Digit1' | 'Digit2' | 'Digit3' | 'Numpad1' | 'Numpad2' | 'Numpad3'>) {
    for (const c of codes) if (this.input.consumePressed(c)) return true
    return false
  }

  private step(dt: number) {
    const md = this.input.consumeMouseDelta()
    if (md.dragging) {
      const s = 0.0022
      this.camYaw -= md.dx * s
      this.camPitch -= md.dy * s
      this.camPitch = MathUtils.clamp(this.camPitch, MathUtils.degToRad(6), MathUtils.degToRad(40))
    }

    const ix = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0)
    const iz = (this.input.isDown('KeyS') ? 1 : 0) - (this.input.isDown('KeyW') ? 1 : 0)
    const hasMove = Math.hypot(ix, iz) > 0.001
    const camForward = new Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)).normalize()
    const camRight = new Vector3(camForward.z, 0, -camForward.x).normalize()
    const move = new Vector3().addScaledVector(camRight, ix).addScaledVector(camForward, iz)
    if (move.lengthSq() > 0) move.normalize()

    const speed = this.input.isDown('ShiftLeft') ? 6.0 : 3.6

    // portal enter
    if (this.mode === 'hub' && this.input.consumePressed('KeyE')) {
      const p = this.world.portals[0]
      if (p) {
        const d = this.tmp.copy(p.object.position).sub(this.player.position)
        d.y = 0
        if (d.length() < 2.6) this.enterMission()
      }
    }

    // (Temporary) allow returning to hub with E at mission start area
    if (this.mode === 'mission' && this.input.consumePressed('KeyE')) {
      const d = this.tmp.copy(this.player.position).sub(new Vector3(this.missionOrigin.x, this.player.position.y, this.missionOrigin.z - 6))
      d.y = 0
      if (d.length() < 2.5 && this.missionEnemies.length === 0) {
        this.mode = 'hub'
        this.player.position.copy(this.world.spawnPoint)
        this.events.onMission?.({ active: false, title: 'Sanctuary', objective: 'Explore the hub.', job: 'Explorer' })
        // hub mood
        this.scene.background = new Color('#86d8ff')
        this.scene.fog?.color.set(0x86d8ff)
      }
    }

    // mission abilities
    this.cd2 = Math.max(0, this.cd2 - dt)
    if (this.mode === 'mission') {
      if (this.consumeAnyPressed(['Digit1', 'Numpad1'])) this.fireArrow({ damage: 10, speed: 18, color: 0xfbbf24 })
      if (this.consumeAnyPressed(['Digit2', 'Numpad2']) && this.cd2 <= 0) {
        this.cd2 = 2.5
        this.fireArrow({ damage: 24, speed: 23, color: 0xfb7185 })
      }
      if (this.consumeAnyPressed(['Digit3', 'Numpad3']) && this.pickupCharges > 0) {
        this.pickupCharges -= 1
        if (this.playerHp < 70) this.playerHp = Math.min(100, this.playerHp + 35)
        else this.fireArrow({ damage: 16, speed: 20, color: 0x34d399 })
      }
    }

    // vertical grounding
    const groundY = this.world.heightAt(this.player.position.x, this.player.position.z)
    const onGround = this.player.position.y <= groundY + 0.001
    if (onGround) {
      this.player.position.y = groundY
      this.playerVel.y = Math.max(0, this.playerVel.y)
      if (this.input.consumePressed('Space')) this.playerVel.y = 5
    } else {
      this.playerVel.y -= 14 * dt
    }

    // face
    if (hasMove) {
      const desired = Math.atan2(move.x, move.z)
      const t = 1 - Math.exp(-14 * dt)
      this.playerYaw = lerpAngle(this.playerYaw, desired, t)
      this.player.rotation.y = this.playerYaw
    }
    if (hasMove && !md.dragging) {
      const desired = this.playerYaw + Math.PI
      const t = 1 - Math.exp(-3.5 * dt)
      this.camYaw = lerpAngle(this.camYaw, desired, t)
    }

    this.playerVel.x = move.x * speed
    this.playerVel.z = move.z * speed
    this.player.position.addScaledVector(this.playerVel, dt)

    if (this.mode === 'mission') {
      const minX = this.missionOrigin.x - 18
      const maxX = this.missionOrigin.x + 18
      const minZ = this.missionOrigin.z - 18
      const maxZ = this.missionOrigin.z + 18
      this.player.position.x = Math.max(minX, Math.min(maxX, this.player.position.x))
      this.player.position.z = Math.max(minZ, Math.min(maxZ, this.player.position.z))
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
          e.hp -= a.damage
          this.cleanupArrow(a)
          if (e.hp <= 0) {
            this.world.root.remove(e.obj)
            this.missionEnemies = this.missionEnemies.filter((x) => x.id !== e.id)
          }
          break
        }
      }
    }

    // camera
    const desiredTarget = this.tmp2.copy(this.player.position).add(new Vector3(0, 1.1, 0))
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
      this.events.onCombatHud?.({
        job: this.mode === 'mission' ? 'Archer' : 'Explorer',
        hp: this.playerHp,
        charges3: this.pickupCharges,
        cd2: this.cd2,
        enemiesRemaining: this.mode === 'mission' ? this.missionEnemies.length : 0,
        physicsReady: !!this.physics,
      })
    }
  }

  private enterMission() {
    this.mode = 'mission'
    const startZ = this.missionOrigin.z - 6
    const startY = this.world.heightAt(this.missionOrigin.x, startZ)
    this.player.position.set(this.missionOrigin.x, startY, startZ)
    this.playerVel.set(0, 0, 0)
    this.playerHp = 100
    this.pickupCharges = 1
    this.cd2 = 0
    this.spawnMissionArena()
    this.events.onMission?.({
      active: true,
      title: 'Hedge Mission',
      objective: 'Defeat all hedge creatures.',
      job: 'Archer',
    })
    this.events.onHint?.('Mission: Use 1/2/3 to shoot • RMB drag camera')

    // Zone mood shift (cooler, darker, heavier fog)
    this.scene.fog?.color.set(0x2dd4bf)
    this.scene.background = new Color(0x0b1020)
  }

  private spawnMissionArena() {
    for (const e of this.missionEnemies) this.world.root.remove(e.obj)
    this.missionEnemies = []
    for (let i = 0; i < 6; i++) {
      const ex = this.missionOrigin.x + (Math.random() - 0.5) * 10
      const ez = this.missionOrigin.z + (Math.random() - 0.5) * 6
      const ey = this.world.heightAt(ex, ez)
      const g = makeHedgeEnemy(100 + i * 9.13)
      g.position.set(ex, ey, ez)
      this.world.root.add(g)
      this.missionEnemies.push({ id: `e${i}`, hp: 35, obj: g })
    }
  }

  private fireArrow(opts: { damage: number; speed: number; color: number }) {
    const dir = new Vector3()
    this.camera.getWorldDirection(dir)
    dir.y *= 0.35
    dir.normalize()
    const start = this.tmp.copy(this.player.position).add(new Vector3(0, 1.2, 0)).addScaledVector(dir, 1.0)
    const v = dir.multiplyScalar(opts.speed)

    const mesh = makeArrowMesh(opts.color)
    ;(mesh as any).position.copy(start)
    ;(mesh as any).lookAt(start.clone().add(v))
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

