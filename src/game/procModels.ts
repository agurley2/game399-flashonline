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

/** Forest — layered cel pines (PSO field silhouette) */
export function makeTree(seed: number) {
  const g = new Group()
  const segs = 6
  const trunkH = 2.0 + rand01(seed + 1) * 0.85
  const trunkR = 0.2 + rand01(seed + 2) * 0.07
  const bark = psoToon(new Color().setHSL(0.07, 0.38, 0.2))
  const barkDark = psoToon(new Color().setHSL(0.06, 0.3, 0.14))
  const leaf = psoToon(new Color().setHSL(0.29 + rand01(seed + 3) * 0.05, 0.64, 0.36))
  const leafDeep = psoToon(new Color().setHSL(0.27, 0.55, 0.26))

  const trunkLo = new Mesh(new CylinderGeometry(trunkR * 0.9, trunkR * 1.2, trunkH * 0.55, segs, 1), bark)
  trunkLo.position.y = trunkH * 0.28
  g.add(trunkLo)
  const trunkHi = new Mesh(new CylinderGeometry(trunkR * 1.0, trunkR * 0.85, trunkH * 0.5, segs, 1), barkDark)
  trunkHi.position.y = trunkH * 0.68
  g.add(trunkHi)

  let y = trunkH * 0.52
  const layers = 4
  for (let l = 0; l < layers; l++) {
    const t = l / layers
    const r = 1.25 - t * 0.42 + rand01(seed + 10 + l) * 0.1
    const h = 1.05 + rand01(seed + 20 + l) * 0.22
    const mat = l % 2 === 0 ? leaf : leafDeep
    const cone = new Mesh(new ConeGeometry(r, h, segs, 1), mat)
    cone.position.y = y + h / 2
    y += h * 0.48
    g.add(cone)
  }

  g.rotation.y = rand01(seed + 7) * Math.PI * 2
  g.rotation.z = (rand01(seed + 8) - 0.5) * 0.06
  return g
}

/** Telepipe — hex frame + stacked rings + energy column (PSO gate read) */
export function makePortal() {
  const g = new Group()
  const metal = psoToon(0x152030)
  const metalHi = psoToon(0x243648)
  const ringMat = psoGlow(0x00e8ff, 0x006878, 1.05)
  const beamMat = psoGlow(0x88ffff, 0x00b8d8, 0.92)

  const base = new Mesh(new CylinderGeometry(1.55, 1.75, 0.55, 6), metal)
  base.position.y = 0.28
  g.add(base)

  const plinth = new Mesh(new CylinderGeometry(1.28, 1.52, 0.42, 6), metalHi)
  plinth.position.y = 0.68
  g.add(plinth)

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2
    const fin = new Mesh(new BoxGeometry(0.22, 2.1, 0.14), metalHi)
    fin.position.set(Math.cos(ang) * 1.42, 1.15, Math.sin(ang) * 1.42)
    fin.lookAt(Math.cos(ang) * 3, 1.15, Math.sin(ang) * 3)
    g.add(fin)
  }

  for (let i = 0; i < 6; i++) {
    const ring = new Mesh(new TorusGeometry(1.08 - i * 0.065, 0.05, 10, 48), ringMat)
    ring.rotation.x = MathUtils.degToRad(90)
    ring.position.y = 0.92 + i * 0.26
    g.add(ring)
  }

  const beamGeo = new CylinderGeometry(0.38, 0.62, 3.35, 14, 1, true)
  const beamM = beamMat.clone()
  beamM.transparent = true
  beamM.opacity = 0.42
  beamM.side = DoubleSide
  const beam = new Mesh(beamGeo, beamM)
  beam.position.y = 1.75
  g.add(beam)

  const core = new Mesh(new SphereGeometry(0.48, 20, 16), psoGlow(0xd0ffff, 0x00ddff, 0.88))
  ;(core.material as any).transparent = true
  ;(core.material as any).opacity = 0.68
  core.position.y = 1.68
  g.add(core)

  const cap = new Mesh(new TorusGeometry(1.42, 0.04, 8, 48), psoGlow(0x00ffff, 0x00ffff, 0.8))
  cap.rotation.x = MathUtils.degToRad(90)
  cap.position.y = 0.74
  g.add(cap)

  const outer = new Mesh(new TorusGeometry(1.85, 0.06, 6, 36), psoToon(0x1a3048, { emissive: 0x002030, emissiveIntensity: 0.2 }))
  outer.rotation.x = MathUtils.degToRad(90)
  outer.position.y = 0.32
  g.add(outer)

  return g
}

/** Hunter — cel-shaded HUmar-style blockout */
export function makePlayerHunter() {
  const g = new Group()
  const suit = psoToon(0x284a72)
  const dark = psoToon(0x0e1624)
  const trim = psoToon(0x00d8f8, { emissive: 0x004060, emissiveIntensity: 0.42 })
  const visor = psoGlow(0x9fffff, 0x00ccff, 0.62)

  const pelvis = new Mesh(new BoxGeometry(0.46, 0.22, 0.34), suit)
  pelvis.position.y = 0.5
  g.add(pelvis)

  const torso = new Mesh(new BoxGeometry(0.54, 0.5, 0.38), suit)
  torso.position.y = 0.86
  g.add(torso)

  const chest = new Mesh(new BoxGeometry(0.58, 0.22, 0.4), dark)
  chest.position.set(0, 0.96, 0.1)
  g.add(chest)

  const ridge = new Mesh(new BoxGeometry(0.2, 0.08, 0.42), trim)
  ridge.position.set(0, 1.12, 0)
  g.add(ridge)

  const head = new Mesh(new BoxGeometry(0.4, 0.34, 0.38), dark)
  head.position.y = 1.32
  g.add(head)

  const helm = new Mesh(new BoxGeometry(0.44, 0.16, 0.42), suit)
  helm.position.y = 1.48
  g.add(helm)

  const vis = new Mesh(new BoxGeometry(0.42, 0.1, 0.24), visor)
  vis.position.set(0, 1.32, 0.16)
  g.add(vis)

  for (const sx of [-1, 1]) {
    const pauldron = new Mesh(new BoxGeometry(0.32, 0.24, 0.3), trim)
    pauldron.position.set(sx * 0.42, 1.1, 0)
    g.add(pauldron)
  }

  const pack = new Mesh(new BoxGeometry(0.36, 0.38, 0.22), dark)
  pack.position.set(0, 0.88, -0.28)
  g.add(pack)

  for (const sx of [-1, 1]) {
    const leg = new Mesh(new CapsuleGeometry(0.15, 0.32, 4, 8), suit)
    leg.position.set(sx * 0.17, 0.28, 0)
    g.add(leg)
    const boot = new Mesh(new BoxGeometry(0.2, 0.12, 0.28), dark)
    boot.position.set(sx * 0.17, 0.06, 0.04)
    g.add(boot)
  }

  const gunBody = new Mesh(new BoxGeometry(0.16, 0.18, 0.78), dark)
  gunBody.position.set(0.18, 0.9, -0.44)
  g.add(gunBody)
  const gunBarrel = new Mesh(new CylinderGeometry(0.055, 0.065, 0.5, 8), psoToon(0x354a60))
  gunBarrel.rotation.x = MathUtils.degToRad(90)
  gunBarrel.position.set(0.18, 0.9, -0.82)
  g.add(gunBarrel)
  const gunMag = new Mesh(new BoxGeometry(0.08, 0.2, 0.12), trim)
  gunMag.position.set(0.12, 0.78, -0.5)
  g.add(gunMag)

  return g
}

export function makeShell(seed: number) {
  const g = new Group()
  const hue = 0.52 + rand01(seed) * 0.08
  const body = new Mesh(
    new OctahedronGeometry(0.24 + rand01(seed + 1) * 0.06, 0),
    psoGlow(
      new Color().setHSL(hue, 0.48, 0.52).getHex(),
      new Color().setHSL(hue, 0.95, 0.42).getHex(),
      0.72,
    ),
  )
  body.rotation.y = rand01(seed + 2) * Math.PI * 2
  g.add(body)

  const inner = new Mesh(new IcosahedronGeometry(0.13, 0), psoGlow(0xffffff, 0xaaccff, 0.45))
  g.add(inner)

  g.rotation.y = rand01(seed + 3) * Math.PI * 2
  return g
}

/** Guild counter — desk + clerk block + holo */
export function makeNpcGuide() {
  const g = new Group()
  const body = psoToon(0x3e4e60)
  const accent = psoToon(0x00c8e8, { emissive: 0x003850, emissiveIntensity: 0.45 })
  const desk = psoToon(0x2a3848)

  const counter = new Mesh(new BoxGeometry(1.4, 0.2, 0.75), desk)
  counter.position.set(0, 0.1, 0.32)
  g.add(counter)

  const base = new Mesh(new BoxGeometry(0.76, 0.95, 0.52), body)
  base.position.y = 0.675
  g.add(base)

  const head = new Mesh(new BoxGeometry(0.56, 0.44, 0.5), body)
  head.position.y = 1.175
  g.add(head)

  const face = new Mesh(new BoxGeometry(0.48, 0.24, 0.1), psoGlow(0x00fff8, 0x0090b0, 0.75))
  face.position.set(0, 1.14, 0.28)
  g.add(face)

  const crest = new Mesh(new BoxGeometry(0.52, 0.14, 0.38), accent)
  crest.position.y = 1.48
  g.add(crest)

  const ant = new Mesh(new CylinderGeometry(0.04, 0.04, 0.38, 6), accent)
  ant.position.y = 1.78
  g.add(ant)

  const holo = new Mesh(new TorusGeometry(0.22, 0.02, 8, 32), psoGlow(0x66ffff, 0x00aacc, 0.9))
  holo.rotation.x = MathUtils.degToRad(70)
  holo.position.set(0.45, 0.48, 0.42)
  g.add(holo)

  return g
}

/** Ruin pillar — hex stonework + moss + crystal */
export function makeHedgePillar(seed: number) {
  const g = new Group()
  const stone = psoToon(0x4e5e58)
  const moss = psoToon(0x286840)
  const crys = psoGlow(0x88ffcc, 0x228866, 0.55)

  const col = new Mesh(new CylinderGeometry(0.52, 0.6, 2.35, 6, 1), stone)
  displaceGeometry(col.geometry as BufferGeometry, 0.045, 2.4, seed)
  col.position.y = 1.18
  g.add(col)

  const cap = new Mesh(new CylinderGeometry(0.65, 0.52, 0.38, 6, 1), stone)
  cap.position.y = 2.42
  g.add(cap)

  const mossLump = new Mesh(new ConeGeometry(0.5, 0.36, 6, 1), moss)
  mossLump.position.y = 2.72
  g.add(mossLump)

  const shard = new Mesh(new OctahedronGeometry(0.28, 0), crys)
  shard.position.y = 3.05
  shard.rotation.y = rand01(seed) * Math.PI * 2
  g.add(shard)

  return g
}

/** Booma-style beast — round body, stripe, tail, ears */
export function makeHedgeEnemy(seed: number) {
  const g = new Group()
  const furHue = 0.09 + rand01(seed) * 0.05
  const fur = psoToon(new Color().setHSL(furHue, 0.52, 0.4))
  const dark = psoToon(new Color().setHSL(furHue, 0.48, 0.2))
  const stripe = psoToon(new Color().setHSL(furHue + 0.05, 0.38, 0.48))

  const body = new Mesh(new SphereGeometry(0.7, 16, 14), fur)
  body.scale.set(1.12, 0.9, 1.18)
  body.position.y = 0.78
  g.add(body)

  const belly = new Mesh(new SphereGeometry(0.46, 12, 10), psoToon(new Color().setHSL(furHue, 0.22, 0.56)))
  belly.scale.set(1, 0.68, 0.88)
  belly.position.set(0, 0.54, 0.38)
  g.add(belly)

  const stripeM = new Mesh(new BoxGeometry(0.28, 0.14, 0.88), stripe)
  stripeM.position.set(0, 0.98, 0)
  g.add(stripeM)

  const snout = new Mesh(new SphereGeometry(0.34, 10, 10), fur)
  snout.position.set(0, 0.62, 0.66)
  g.add(snout)

  const eyeMat = psoGlow(0xffee55, 0xff9900, 0.82)
  const e1 = new Mesh(new SphereGeometry(0.13, 10, 10), eyeMat)
  const e2 = new Mesh(new SphereGeometry(0.13, 10, 10), eyeMat)
  e1.position.set(-0.26, 0.94, 0.64)
  e2.position.set(0.26, 0.94, 0.64)
  g.add(e1, e2)

  const earL = new Mesh(new ConeGeometry(0.22, 0.48, 6), dark)
  const earR = new Mesh(new ConeGeometry(0.22, 0.48, 6), dark)
  earL.position.set(-0.6, 1.15, 0.06)
  earR.position.set(0.6, 1.15, 0.06)
  earL.rotation.z = MathUtils.degToRad(32)
  earR.rotation.z = MathUtils.degToRad(-32)
  g.add(earL, earR)

  const tail = new Mesh(new CapsuleGeometry(0.12, 0.35, 4, 8), dark)
  tail.position.set(0, 0.55, -0.72)
  tail.rotation.x = MathUtils.degToRad(-40)
  g.add(tail)

  for (let i = 0; i < 3; i++) {
    const spike = new Mesh(new ConeGeometry(0.08, 0.22, 4), dark)
    spike.position.set((i - 1) * 0.15, 1.05, -0.42)
    spike.rotation.x = MathUtils.degToRad(-55)
    g.add(spike)
  }

  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + rand01(seed + i) * 0.3
    const foot = new Mesh(new SphereGeometry(0.2, 8, 8), dark)
    foot.position.set(Math.cos(ang) * 0.5, 0.16, Math.sin(ang) * 0.5)
    g.add(foot)
  }

  g.rotation.y = rand01(seed + 99) * Math.PI * 2
  return g
}

export function makeArrowMesh(color: number) {
  const g = new Group()
  const core = psoGlow(color, color, 0.95)
  const shaft = new Mesh(new CylinderGeometry(0.055, 0.075, 0.78, 8), core)
  shaft.rotation.z = MathUtils.degToRad(90)
  g.add(shaft)

  const tip = new Mesh(new ConeGeometry(0.13, 0.3, 10, 1), psoGlow(0xffffff, color, 1.05))
  tip.position.x = 0.5
  tip.rotation.z = MathUtils.degToRad(90)
  g.add(tip)

  const trail = new Mesh(new SphereGeometry(0.1, 8, 8), psoGlow(color, color, 0.65))
  trail.position.x = -0.44
  ;(trail.material as any).transparent = true
  ;(trail.material as any).opacity = 0.55
  g.add(trail)

  const fin1 = new Mesh(new BoxGeometry(0.02, 0.18, 0.35), psoGlow(color, color, 0.5))
  fin1.position.set(0.1, 0, 0)
  fin1.rotation.z = MathUtils.degToRad(90)
  g.add(fin1)
  const fin2 = fin1.clone()
  fin2.rotation.y = Math.PI
  g.add(fin2)

  return g
}
