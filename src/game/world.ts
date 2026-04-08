import {
  AmbientLight,
  AnimationMixer,
  BufferAttribute,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { pickAnimationClip } from './animUtils'
import type { GameAssets } from './loadGameAssets'
import { cloneSkinnedRig } from './loadGameAssets'
import { psoToon, psoToonVertex } from './psoMaterials'

export type World = {
  root: Group
  spawnPoint: Vector3
  npcs: { id: string; name: string; object: Object3D }[]
  portals: { id: string; name: string; object: Object3D }[]
  collectibles: { id: string; type: 'shell'; object: Object3D }[]
  heightAt: (x: number, z: number) => number
  setZoneAtmosphere: (zone: 'hub' | 'forest1') => void
  npcMixer: AnimationMixer | null
}

function makeSkyGradientTexture(top: Color, mid: Color, horizon: Color) {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, `#${top.getHexString()}`)
  g.addColorStop(0.38, `#${mid.getHexString()}`)
  g.addColorStop(1, `#${horizon.getHexString()}`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, 256)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = 'srgb'
  tex.needsUpdate = true
  return tex
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

export function createWorld(scene: Scene, assets: GameAssets): World {
  const hubSkyTex = makeSkyGradientTexture(
    new Color(0xa8d8ff),
    new Color(0x6a9ec8),
    new Color(0x4a6a88),
  )
  const forestSkyTex = makeSkyGradientTexture(
    new Color(0x0a1a12),
    new Color(0x1a3d2a),
    new Color(0x2d5a48),
  )

  scene.background = new Color(0x6a9ec4)
  scene.fog = new Fog(0x7eb8dc, 26, 132)

  const root = new Group()
  scene.add(root)

  const ambient = new AmbientLight(0x88a0c8, 0.22)
  scene.add(ambient)

  const hemi = new HemisphereLight(0xc8e8ff, 0x1a2535, 0.72)
  scene.add(hemi)

  const sun = new DirectionalLight(0xfff2dd, 1.22)
  sun.position.set(18, 26, 12)
  scene.add(sun)

  const fill = new DirectionalLight(0x88c8ff, 0.42)
  fill.position.set(-22, 14, -10)
  scene.add(fill)

  const portalLight = new PointLight(0x44eeff, 1.25, 38, 1.8)
  portalLight.position.set(-13, 4.2, 8)
  scene.add(portalLight)

  const plazaAccent = new PointLight(0xaaccff, 0.45, 28, 2)
  plazaAccent.position.set(-8, 3.5, 6)
  scene.add(plazaAccent)

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
    const grass = new Color().setHSL(0.31, 0.58, 0.3)
    const dirt = new Color().setHSL(0.09, 0.5, 0.24)
    const stone = new Color().setHSL(0.58, 0.1, 0.44)
    const plazaTile = new Color().setHSL(0.56, 0.14, 0.42)
    c.copy(grass).lerp(dirt, nearCreek * 0.55)
    c.lerp(stone, Math.pow(hNorm, 2.2) * 0.35)
    const pd = Math.hypot(v.x + 8, v.z - 6)
    if (pd < 14) c.lerp(plazaTile, (1 - pd / 14) * 0.62)
    colors.push(c.r, c.g, c.b)
  }
  groundGeo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  groundGeo.computeVertexNormals()
  const ground = new Mesh(groundGeo, psoToonVertex())
  root.add(ground)

  const plazaRing = new Mesh(
    new TorusGeometry(15.5, 0.12, 8, 64),
    psoToon(0x3a4a62, { emissive: 0x102030, emissiveIntensity: 0.12 }),
  )
  plazaRing.rotation.x = MathUtils.degToRad(90)
  plazaRing.position.set(-8, heightAt(-8, 6) + 0.04, 6)
  root.add(plazaRing)

  const skyGeo = new SphereGeometry(260, 48, 24)
  skyGeo.scale(-1, 1, 1)
  const skyMat = new MeshBasicMaterial({ map: hubSkyTex, fog: false })
  const sky = new Mesh(skyGeo, skyMat)
  sky.position.y = 40
  sky.name = 'pso-sky'
  root.add(sky)

  for (let i = 0; i < 180; i++) {
    const x = (Math.random() - 0.5) * 150
    const z = (Math.random() - 0.5) * 150
    if (Math.hypot(x + 8, z - 6) < 24) continue
    const t = assets.cloneTree(i * 13.37)
    const tint = z > 50 ? 0.88 : 1
    t.traverse((o) => {
      const mat = (o as Mesh).material
      if (!mat) return
      const mats = Array.isArray(mat) ? mat : [mat]
      for (const m of mats) {
        if (m instanceof MeshPhongMaterial || m instanceof MeshToonMaterial || m instanceof MeshStandardMaterial) {
          m.color.multiplyScalar(tint)
        }
      }
    })
    t.position.set(x, heightAt(x, z), z)
    root.add(t)
  }

  const npc = cloneSkinnedRig(assets.npc)
  const rifle = assets.npcRifle.clone(true)
  rifle.position.set(0.08, 0.95, -0.28)
  rifle.rotation.y = Math.PI * 0.48
  rifle.scale.setScalar(0.9)
  npc.add(rifle)
  npc.position.set(-4.5, heightAt(-4.5, 5.4), 5.4)
  root.add(npc)

  const idleClip = pickAnimationClip(assets.npc.clips, 'idle', 'stand', 'survey')
  let npcMixer: AnimationMixer | null = null
  if (idleClip) {
    npcMixer = new AnimationMixer(npc)
    npcMixer.clipAction(idleClip).play()
  }

  const portal = assets.portal.clone(true)
  portal.position.set(-13, heightAt(-13, 8), 8)
  root.add(portal)

  const collectibles: { id: string; type: 'shell'; object: Object3D }[] = []
  ;[
    [-9.8, 4.6],
    [-5.6, 11.1],
    [-1.9, 7.2],
    [-13.5, 2.5],
    [-6.2, 0.6],
  ].forEach(([x, z], i) => {
    const shell = assets.shell.clone(true)
    shell.position.set(x, heightAt(x, z) + 0.12, z)
    root.add(shell)
    collectibles.push({ id: `shell:${i}`, type: 'shell', object: shell })
  })

  const mz = 86
  for (let i = -5; i <= 5; i++) {
    const x = i * 2.3
    const zFront = mz + 11
    const zBack = mz - 11
    const h1 = assets.pillar.clone(true)
    h1.position.set(x, heightAt(x, zFront) + 0.2, zFront)
    const h2 = assets.pillar.clone(true)
    h2.position.set(x, heightAt(x, zBack) + 0.2, zBack)
    root.add(h1, h2)
  }

  const setZoneAtmosphere = (zone: 'hub' | 'forest1') => {
    if (zone === 'hub') {
      scene.background = new Color(0x6a9ec4)
      scene.fog = new Fog(0x7eb8dc, 26, 132)
      skyMat.map = hubSkyTex
      skyMat.needsUpdate = true
      ambient.color.setHex(0x88a0c8)
      ambient.intensity = 0.22
      hemi.color.setHex(0xc8e8ff)
      hemi.groundColor.setHex(0x1a2535)
      hemi.intensity = 0.72
      sun.color.setHex(0xfff2dd)
      sun.intensity = 1.22
      fill.color.setHex(0x88c8ff)
      fill.intensity = 0.42
      portalLight.color.setHex(0x44eeff)
      portalLight.intensity = 1.25
      plazaAccent.intensity = 0.45
    } else {
      scene.background = new Color(0x0d1f18)
      scene.fog = new Fog(0x1a3328, 12, 78)
      skyMat.map = forestSkyTex
      skyMat.needsUpdate = true
      ambient.color.setHex(0x2a4038)
      ambient.intensity = 0.18
      hemi.color.setHex(0x4a6a58)
      hemi.groundColor.setHex(0x080c0a)
      hemi.intensity = 0.55
      sun.color.setHex(0xc8e8d8)
      sun.intensity = 0.95
      fill.color.setHex(0x448866)
      fill.intensity = 0.28
      portalLight.color.setHex(0x66ffcc)
      portalLight.intensity = 0.35
      plazaAccent.intensity = 0.08
    }
  }

  setZoneAtmosphere('hub')

  return {
    root,
    spawnPoint: new Vector3(-7, heightAt(-7, 6), 6),
    npcs: [{ id: 'guild-clerk', name: 'Guild Clerk', object: npc }],
    portals: [{ id: 'forest1-telepipe', name: 'Telepipe: Forest 1', object: portal }],
    collectibles,
    heightAt,
    setZoneAtmosphere,
    npcMixer,
  }
}
