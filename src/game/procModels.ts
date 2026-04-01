import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Mesh,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { psoGlow, psoToon } from './psoMaterials'

function rand01(seed: number) {
  const s = Math.sin(seed * 127.1) * 43758.5453123
  return s - Math.floor(s)
}

function smoothstep01(t: number) {
  return t * t * (3 - 2 * t)
}

function valueNoise3(x: number, y: number, z: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const z1 = z0 + 1
  const tx = smoothstep01(x - x0)
  const ty = smoothstep01(y - y0)
  const tz = smoothstep01(z - z0)
  const h = (ix: number, iy: number, iz: number) => rand01(ix * 73856093 + iy * 19349663 + iz * 83492791)
  const c000 = h(x0, y0, z0)
  const c100 = h(x1, y0, z0)
  const c010 = h(x0, y1, z0)
  const c110 = h(x1, y1, z0)
  const c001 = h(x0, y0, z1)
  const c101 = h(x1, y0, z1)
  const c011 = h(x0, y1, z1)
  const c111 = h(x1, y1, z1)
  const ix00 = c000 + (c100 - c000) * tx
  const ix10 = c010 + (c110 - c010) * tx
  const ix01 = c001 + (c101 - c001) * tx
  const ix11 = c011 + (c111 - c011) * tx
  const iy0 = ix00 + (ix10 - ix00) * ty
  const iy1 = ix01 + (ix11 - ix01) * ty
  return iy0 + (iy1 - iy0) * tz
}

function displaceGeometry(geo: BufferGeometry, strength: number, freq: number, seed: number) {
  const pos = geo.attributes.position as BufferAttribute
  geo.computeVertexNormals()
  const normals = geo.attributes.normal as BufferAttribute
  const n = new Vector3()
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(normals, i).normalize()
    const d = (valueNoise3(v.x * freq + seed, v.y * freq + seed * 2, v.z * freq + seed * 3) - 0.5) * 2
    v.addScaledVector(n, d * strength)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** Stylized pine — stacked cones + chunky trunk (PSO forest read) */
export function makeTree(seed: number) {
  const g = new Group()
  const trunkH = 2.1 + rand01(seed + 1) * 0.9
  const trunkR = 0.22 + rand01(seed + 2) * 0.06
  const bark = psoToon(new Color().setHSL(0.07, 0.35, 0.22))
  const leaf = psoToon(new Color().setHSL(0.28 + rand01(seed + 3) * 0.06, 0.62, 0.34))

  const trunk = new Mesh(new CylinderGeometry(trunkR * 0.85, trunkR * 1.15, trunkH, 8, 1), bark)
  trunk.position.y = trunkH / 2
  g.add(trunk)

  let y = trunkH * 0.55
  const layers = 3
  for (let l = 0; l < layers; l++) {
    const t = l / layers
    const r = 1.15 - t * 0.35 + rand01(seed + 10 + l) * 0.08
    const h = 1.15 + rand01(seed + 20 + l) * 0.25
    const cone = new Mesh(new ConeGeometry(r, h, 8, 1), leaf)
    cone.position.y = y + h / 2
    y += h * 0.55
    g.add(cone)
  }

  g.rotation.y = rand01(seed + 7) * Math.PI * 2
  return g
}

/** Telepipe — tall hex tech + cyan energy (PSO gate) */
export function makePortal() {
  const g = new Group()
  const metal = psoToon(0x1a2838)
  const ringMat = psoGlow(0x00d4ff, 0x006080, 1.0)
  const beamMat = psoGlow(0x66eeff, 0x00aacc, 0.95)

  const base = new Mesh(new CylinderGeometry(1.45, 1.65, 0.5, 6), metal)
  base.position.y = 0.25
  g.add(base)

  const plinth = new Mesh(new CylinderGeometry(1.2, 1.45, 0.35, 6), psoToon(0x243044))
  plinth.position.y = 0.65
  g.add(plinth)

  for (let i = 0; i < 5; i++) {
    const ring = new Mesh(new TorusGeometry(1.05 - i * 0.06, 0.055, 10, 40), ringMat)
    ring.rotation.x = MathUtils.degToRad(90)
    ring.position.y = 0.95 + i * 0.28
    g.add(ring)
  }

  const beamGeo = new CylinderGeometry(0.4, 0.65, 3.2, 12, 1, true)
  const beamM = beamMat.clone()
  beamM.transparent = true
  beamM.opacity = 0.38
  beamM.side = DoubleSide
  const beam = new Mesh(beamGeo, beamM)
  beam.position.y = 1.7
  g.add(beam)

  const core = new Mesh(new SphereGeometry(0.5, 16, 14), psoGlow(0xb8f0ff, 0x00ccff, 0.85))
  ;(core.material as any).transparent = true
  ;(core.material as any).opacity = 0.65
  core.position.y = 1.65
  g.add(core)

  const cap = new Mesh(new TorusGeometry(1.35, 0.045, 8, 40), psoGlow(0x00ffff, 0x00ffff, 0.75))
  cap.rotation.x = MathUtils.degToRad(90)
  cap.position.y = 0.72
  g.add(cap)

  return g
}

/** Hunter — blocky remaster silhouette, rifle, teal trim */
export function makePlayerHunter() {
  const g = new Group()
  const suit = psoToon(0x2d4a68)
  const dark = psoToon(0x121a28)
  const trim = psoToon(0x00c8e8, { emissive: 0x004455, emissiveIntensity: 0.35 })
  const visor = psoGlow(0x7fffff, 0x00ddff, 0.55)

  const pelvis = new Mesh(new BoxGeometry(0.44, 0.22, 0.32), suit)
  pelvis.position.y = 0.5
  g.add(pelvis)

  const torso = new Mesh(new BoxGeometry(0.52, 0.48, 0.36), suit)
  torso.position.y = 0.85
  g.add(torso)

  const chest = new Mesh(new BoxGeometry(0.56, 0.2, 0.38), dark)
  chest.position.set(0, 0.95, 0.08)
  g.add(chest)

  const head = new Mesh(new BoxGeometry(0.38, 0.32, 0.36), dark)
  head.position.y = 1.28
  g.add(head)

  const helm = new Mesh(new BoxGeometry(0.42, 0.14, 0.4), suit)
  helm.position.y = 1.42
  g.add(helm)

  const vis = new Mesh(new BoxGeometry(0.4, 0.1, 0.22), visor)
  vis.position.set(0, 1.28, 0.14)
  g.add(vis)

  for (const sx of [-1, 1]) {
    const pauldron = new Mesh(new BoxGeometry(0.28, 0.2, 0.28), trim)
    pauldron.position.set(sx * 0.38, 1.08, 0)
    g.add(pauldron)
  }

  for (const sx of [-1, 1]) {
    const leg = new Mesh(new CapsuleGeometry(0.14, 0.35, 4, 8), suit)
    leg.position.set(sx * 0.16, 0.28, 0)
    g.add(leg)
  }

  const gunBody = new Mesh(new BoxGeometry(0.14, 0.16, 0.72), dark)
  gunBody.position.set(0.15, 0.88, -0.42)
  g.add(gunBody)
  const gunBarrel = new Mesh(new CylinderGeometry(0.05, 0.06, 0.45, 8), psoToon(0x3a4a5c))
  gunBarrel.rotation.x = MathUtils.degToRad(90)
  gunBarrel.position.set(0.15, 0.88, -0.78)
  g.add(gunBarrel)

  return g
}

/** Meseta crystal pickup */
export function makeShell(seed: number) {
  const g = new Group()
  const hue = 0.52 + rand01(seed) * 0.08
  const body = new Mesh(
    new OctahedronGeometry(0.22 + rand01(seed + 1) * 0.06, 0),
    psoGlow(
      new Color().setHSL(hue, 0.45, 0.55).getHex(),
      new Color().setHSL(hue, 0.9, 0.45).getHex(),
      0.65,
    ),
  )
  body.rotation.y = rand01(seed + 2) * Math.PI * 2
  g.add(body)

  const inner = new Mesh(new IcosahedronGeometry(0.12, 0), psoGlow(0xffffff, 0xaaccff, 0.4))
  g.add(inner)

  g.rotation.y = rand01(seed + 3) * Math.PI * 2
  return g
}

/** Guild counter droid — block body + visor “face” */
export function makeNpcGuide() {
  const g = new Group()
  const body = psoToon(0x4a5a68)
  const accent = psoToon(0x00b8d4, { emissive: 0x003344, emissiveIntensity: 0.4 })

  const base = new Mesh(new BoxGeometry(0.72, 0.95, 0.5), body)
  base.position.y = 0.48
  g.add(base)

  const head = new Mesh(new BoxGeometry(0.55, 0.42, 0.48), body)
  head.position.y = 1.15
  g.add(head)

  const face = new Mesh(new BoxGeometry(0.46, 0.22, 0.08), psoGlow(0x00fff4, 0x0088aa, 0.7))
  face.position.set(0, 1.12, 0.26)
  g.add(face)

  const crest = new Mesh(new BoxGeometry(0.5, 0.12, 0.35), accent)
  crest.position.y = 1.42
  g.add(crest)

  const ant = new Mesh(new CylinderGeometry(0.04, 0.04, 0.35, 6), accent)
  ant.position.y = 1.72
  g.add(ant)

  return g
}

/** Ruin pillar — stone column + moss cap */
export function makeHedgePillar(seed: number) {
  const g = new Group()
  const stone = psoToon(0x5a6a58)
  const moss = psoToon(0x2d6a38)

  const col = new Mesh(new CylinderGeometry(0.55, 0.62, 2.4, 8, 1), stone)
  displaceGeometry(col.geometry as BufferGeometry, 0.04, 2.2, seed)
  col.position.y = 1.2
  g.add(col)

  const cap = new Mesh(new CylinderGeometry(0.68, 0.55, 0.35, 8, 1), stone)
  cap.position.y = 2.45
  g.add(cap)

  const mossLump = new Mesh(new ConeGeometry(0.55, 0.4, 8, 1), moss)
  mossLump.position.y = 2.75
  g.add(mossLump)

  return g
}

/** Booma — mascot beast, big eyes, soft silhouette */
export function makeHedgeEnemy(seed: number) {
  const g = new Group()
  const furHue = 0.1 + rand01(seed) * 0.05
  const fur = psoToon(new Color().setHSL(furHue, 0.5, 0.42))
  const dark = psoToon(new Color().setHSL(furHue, 0.45, 0.22))
  const stripe = psoToon(new Color().setHSL(furHue + 0.06, 0.35, 0.5))

  const body = new Mesh(new SphereGeometry(0.68, 14, 12), fur)
  body.scale.set(1.1, 0.88, 1.15)
  body.position.y = 0.78
  g.add(body)

  const belly = new Mesh(new SphereGeometry(0.45, 12, 10), psoToon(new Color().setHSL(furHue, 0.25, 0.55)))
  belly.scale.set(1, 0.7, 0.85)
  belly.position.set(0, 0.55, 0.35)
  g.add(belly)

  const stripeM = new Mesh(new BoxGeometry(0.25, 0.12, 0.85), stripe)
  stripeM.position.set(0, 0.95, 0)
  g.add(stripeM)

  const snout = new Mesh(new SphereGeometry(0.32, 10, 10), fur)
  snout.position.set(0, 0.62, 0.62)
  g.add(snout)

  const eyeMat = psoGlow(0xffee44, 0xff8800, 0.75)
  const e1 = new Mesh(new SphereGeometry(0.12, 10, 10), eyeMat)
  const e2 = new Mesh(new SphereGeometry(0.12, 10, 10), eyeMat)
  e1.position.set(-0.24, 0.92, 0.62)
  e2.position.set(0.24, 0.92, 0.62)
  g.add(e1, e2)

  const earL = new Mesh(new ConeGeometry(0.2, 0.45, 8), dark)
  const earR = new Mesh(new ConeGeometry(0.2, 0.45, 8), dark)
  earL.position.set(-0.58, 1.12, 0.05)
  earR.position.set(0.58, 1.12, 0.05)
  earL.rotation.z = MathUtils.degToRad(30)
  earR.rotation.z = MathUtils.degToRad(-30)
  g.add(earL, earR)

  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + rand01(seed + i) * 0.3
    const foot = new Mesh(new SphereGeometry(0.2, 8, 8), dark)
    foot.position.set(Math.cos(ang) * 0.48, 0.18, Math.sin(ang) * 0.48)
    g.add(foot)
  }

  g.rotation.y = rand01(seed + 99) * Math.PI * 2
  return g
}

/** Energy bolt — tech projectile */
export function makeArrowMesh(color: number) {
  const g = new Group()
  const core = psoGlow(color, color, 0.9)
  const shaft = new Mesh(new CylinderGeometry(0.06, 0.08, 0.75, 8), core)
  shaft.rotation.z = MathUtils.degToRad(90)
  g.add(shaft)

  const tip = new Mesh(new ConeGeometry(0.12, 0.28, 10, 1), psoGlow(0xffffff, color, 1.0))
  tip.position.x = 0.48
  tip.rotation.z = MathUtils.degToRad(90)
  g.add(tip)

  const trail = new Mesh(new SphereGeometry(0.1, 8, 8), psoGlow(color, color, 0.6))
  trail.position.x = -0.42
  ;(trail.material as any).transparent = true
  ;(trail.material as any).opacity = 0.55
  g.add(trail)

  return g
}
