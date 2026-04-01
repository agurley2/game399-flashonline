import {
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three'
import { makeHedgePillar, makeNpcGuide, makePortal, makeShell, makeTree } from './procModels'

export type World = {
  root: Group
  spawnPoint: Vector3
  npcs: { id: string; name: string; object: Object3D }[]
  portals: { id: string; name: string; object: Object3D }[]
  collectibles: { id: string; type: 'shell'; object: Object3D }[]
  heightAt: (x: number, z: number) => number
}

function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return s - Math.floor(s)
}
function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}
function valueNoise2(x: number, z: number) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const x1 = x0 + 1
  const z1 = z0 + 1
  const sx = smoothstep(x - x0)
  const sz = smoothstep(z - z0)
  const n00 = hash2(x0, z0)
  const n10 = hash2(x1, z0)
  const n01 = hash2(x0, z1)
  const n11 = hash2(x1, z1)
  const ix0 = n00 + (n10 - n00) * sx
  const ix1 = n01 + (n11 - n01) * sx
  return ix0 + (ix1 - ix0) * sz
}
function fbm(x: number, z: number) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < 4; i++) {
    sum += valueNoise2(x * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.0
  }
  return sum / norm
}

export function createWorld(scene: Scene): World {
  scene.background = new Color('#88bde6')
  scene.fog = new Fog('#88bde6', 24, 115)

  const root = new Group()
  scene.add(root)

  scene.add(new HemisphereLight(0xffffff, 0x4b5563, 0.75))
  const sun = new DirectionalLight(0xffffff, 1.05)
  sun.position.set(12, 16, 8)
  scene.add(sun)

  const heightAt = (x: number, z: number) => {
    const n = fbm((x + 1000) * 0.04, (z + 1000) * 0.04)
    let h = (n - 0.5) * 3.4
    const creekZ = -20 + Math.sin((x + 10) * 0.06) * 5
    const creekDist = Math.abs(z - creekZ)
    const valley = MathUtils.smoothstep(creekDist, 0, 10)
    h -= valley * 1.8
    const lobbyX = -8
    const lobbyZ = 6
    const d = Math.hypot(x - lobbyX, z - lobbyZ)
    const plazaRadius = 13
    const t = MathUtils.clamp((d - (plazaRadius - 2)) / 4, 0, 1)
    const flatten = 1 - (t * t * (3 - 2 * t))
    h = h * (1 - flatten) + 0.25 * flatten
    if (z > 50) {
      const forestSlope = MathUtils.clamp((z - 50) / 50, 0, 1)
      h += forestSlope * 2.2
    }
    return h
  }

  const size = 180
  const segments = 180
  const groundGeo = new PlaneGeometry(size, size, segments, segments)
  groundGeo.rotateX(-MathUtils.DEG2RAD * 90)
  const pos = groundGeo.attributes.position
  const v = new Vector3()
  const colors: number[] = []
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const y = heightAt(v.x, v.z)
    pos.setY(i, y)

    const creekZ = -20 + Math.sin((v.x + 10) * 0.06) * 5
    const creekDist = Math.abs(v.z - creekZ)
    const nearCreek = MathUtils.clamp(1 - creekDist / 6, 0, 1)
    const hNorm = MathUtils.clamp((y + 2.5) / 6, 0, 1)
    const grass = new Color().setHSL(0.32, 0.55, 0.28)
    const dirt = new Color().setHSL(0.08, 0.55, 0.22)
    const stone = new Color().setHSL(0.60, 0.08, 0.42)
    c.copy(grass).lerp(dirt, nearCreek * 0.55)
    c.lerp(stone, Math.pow(hNorm, 2.2) * 0.35)
    colors.push(c.r, c.g, c.b)
  }
  groundGeo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  groundGeo.computeVertexNormals()
  const ground = new Mesh(
    groundGeo,
    new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  )
  root.add(ground)

  // Procedural sky dome
  const skyGeo = new SphereGeometry(260, 32, 18)
  skyGeo.scale(-1, 1, 1)
  const skyMat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    emissive: 0x7bb2df,
    emissiveIntensity: 0.8,
  })
  const sky = new Mesh(skyGeo, skyMat)
  sky.position.y = 40
  root.add(sky)

  // Lobby and forest trees
  for (let i = 0; i < 180; i++) {
    const x = (Math.random() - 0.5) * 150
    const z = (Math.random() - 0.5) * 150
    if (Math.hypot(x + 8, z - 6) < 24) continue
    const t = makeTree(i * 13.37)
    const tint = z > 50 ? 0.9 : 1
    t.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined
      if (m?.color) m.color.multiplyScalar(tint)
    })
    t.position.set(x, heightAt(x, z), z)
    root.add(t)
  }

  // Hunter's Guild clerk
  const npc = makeNpcGuide()
  npc.position.set(-4.5, heightAt(-4.5, 5.4), 5.4)
  root.add(npc)

  // Telepipe to Forest 1
  const portal = makePortal()
  portal.position.set(-13, heightAt(-13, 8), 8)
  root.add(portal)

  // Shells
  const collectibles: { id: string; type: 'shell'; object: Object3D }[] = []
  ;[
    [-9.8, 4.6],
    [-5.6, 11.1],
    [-1.9, 7.2],
    [-13.5, 2.5],
    [-6.2, 0.6],
  ].forEach(([x, z], i) => {
    const shell = makeShell(200 + i * 31.7)
    shell.position.set(x, heightAt(x, z) + 0.18, z)
    root.add(shell)
    collectibles.push({ id: `shell:${i}`, type: 'shell', object: shell })
  })

  // Forest 1 entry gate
  const mz = 86
  for (let i = -5; i <= 5; i++) {
    const x = i * 2.3
    const zFront = mz + 11
    const zBack = mz - 11
    const h1 = makeHedgePillar(500 + i)
    h1.position.set(x, heightAt(x, zFront) + 0.4, zFront)
    const h2 = makeHedgePillar(700 + i)
    h2.position.set(x, heightAt(x, zBack) + 0.4, zBack)
    root.add(h1, h2)
  }

  return {
    root,
    spawnPoint: new Vector3(-7, heightAt(-7, 6), 6),
    npcs: [{ id: 'guild-clerk', name: 'Guild Clerk', object: npc }],
    portals: [{ id: 'forest1-telepipe', name: 'Telepipe: Forest 1', object: portal }],
    collectibles,
    heightAt,
  }
}

