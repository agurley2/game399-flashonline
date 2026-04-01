import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'

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

export function makeTree(seed: number) {
  const g = new Group()
  const trunkH = 2.4 + rand01(seed + 1) * 1.2
  const trunkR = 0.18 + rand01(seed + 2) * 0.08
  const trunkGeo = new CylinderGeometry(trunkR * 0.9, trunkR * 1.2, trunkH, 10, 8)
  displaceGeometry(trunkGeo, 0.03, 2.1, seed + 10)
  const trunk = new Mesh(
    trunkGeo,
    new MeshStandardMaterial({ color: new Color().setHSL(0.06, 0.45, 0.25), roughness: 0.95 }),
  )
  trunk.position.y = trunkH / 2
  g.add(trunk)

  const crownSize = 0.85 + rand01(seed + 3) * 0.55
  const crownGeo = new IcosahedronGeometry(crownSize, 1)
  displaceGeometry(crownGeo, 0.12, 1.6, seed + 20)
  const crownHue = 0.30 + (rand01(seed + 4) - 0.5) * 0.06
  const crown = new Mesh(
    crownGeo,
    new MeshStandardMaterial({ color: new Color().setHSL(crownHue, 0.55, 0.35), roughness: 0.9 }),
  )
  crown.position.y = trunkH * (0.72 + rand01(seed + 5) * 0.12)
  g.add(crown)
  g.rotation.y = rand01(seed + 7) * Math.PI * 2
  return g
}

export function makePortal() {
  const g = new Group()
  const ring = new Mesh(
    new TorusGeometry(1.2, 0.18, 14, 40),
    new MeshStandardMaterial({
      color: 0xa78bfa,
      roughness: 0.35,
      metalness: 0.25,
      emissive: 0x3b0764,
      emissiveIntensity: 0.8,
    }),
  )
  ring.rotation.x = MathUtils.degToRad(90)
  ring.position.y = 1.2
  g.add(ring)

  const core = new Mesh(
    new IcosahedronGeometry(0.65, 1),
    new MeshStandardMaterial({
      color: 0x60a5fa,
      roughness: 0.15,
      metalness: 0.05,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.65,
    }),
  )
  displaceGeometry(core.geometry as BufferGeometry, 0.08, 1.3, 123.4)
  core.position.y = 1.2
  g.add(core)

  const base = new Mesh(
    new CylinderGeometry(0.9, 1.05, 0.35, 18),
    new MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }),
  )
  base.position.y = 0.175
  g.add(base)
  return g
}

export function makeShell(seed: number) {
  const points: Vector2[] = []
  const turns = 18
  for (let i = 0; i <= turns; i++) {
    const t = i / turns
    const r = 0.02 + t * (0.18 + 0.02 * rand01(seed))
    const y = (t - 0.5) * 0.35
    points.push(new Vector2(r, y))
  }
  const geo = new LatheGeometry(points, 18)
  displaceGeometry(geo, 0.01, 5.0, seed)
  const hue = 0.92 + (rand01(seed + 1) - 0.5) * 0.05
  const mat = new MeshStandardMaterial({
    color: new Color().setHSL(hue, 0.65, 0.62),
    roughness: 0.35,
    metalness: 0.05,
  })
  const m = new Mesh(geo, mat)
  m.rotation.x = MathUtils.degToRad(-90)
  m.rotation.z = rand01(seed + 2) * Math.PI * 2
  return m
}

export function makeNpcGuide() {
  const g = new Group()
  const body = new Mesh(
    new CapsuleGeometry(0.34, 0.55, 6, 12),
    new MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
  )
  body.position.y = 0.65
  g.add(body)

  const head = new Mesh(
    new SphereGeometry(0.25, 18, 18),
    new MeshStandardMaterial({ color: 0xffedd5, roughness: 0.9 }),
  )
  head.position.y = 1.25
  g.add(head)

  const hat = new Mesh(
    new ConeGeometry(0.34, 0.55, 12),
    new MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }),
  )
  hat.position.y = 1.6
  g.add(hat)
  return g
}

export function makeHedgePillar(seed: number) {
  const geo = new IcosahedronGeometry(0.85, 0)
  displaceGeometry(geo, 0.14, 1.8, seed)
  const mat = new MeshStandardMaterial({ color: 0x166534, roughness: 0.95 })
  const m = new Mesh(geo, mat)
  m.scale.set(0.9, 2.2, 0.9)
  m.position.y = 1.1
  return m
}

export function makeHedgeEnemy(seed: number) {
  const g = new Group()
  const bodyGeo = new IcosahedronGeometry(0.75, 1)
  displaceGeometry(bodyGeo, 0.18, 1.9, seed + 50)
  const body = new Mesh(bodyGeo, new MeshStandardMaterial({ color: 0x16a34a, roughness: 0.95 }))
  body.position.y = 0.9
  g.add(body)

  const eyeMat = new MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.6,
    emissive: 0x854d0e,
    emissiveIntensity: 0.4,
  })
  const eyeGeo = new SphereGeometry(0.06, 10, 10)
  const e1 = new Mesh(eyeGeo, eyeMat)
  const e2 = new Mesh(eyeGeo, eyeMat)
  e1.position.set(0.05, 1.02, 0.7)
  e2.position.set(0.18, 0.98, 0.7)
  g.add(e1, e2)

  const spikeGeo = new ConeGeometry(0.06, 0.22, 8)
  const spikeMat = new MeshStandardMaterial({ color: 0x14532d, roughness: 0.95 })
  for (let i = 0; i < 8; i++) {
    const s = new Mesh(spikeGeo, spikeMat)
    const ang = (i / 8) * Math.PI * 2
    s.position.set(Math.cos(ang) * 0.48, 1.25, Math.sin(ang) * 0.48)
    s.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ang))
    g.add(s)
  }
  g.rotation.y = rand01(seed + 99) * Math.PI * 2
  return g
}

export function makeArrowMesh(color: number) {
  const g = new Group()
  const shaft = new Mesh(
    new CylinderGeometry(0.03, 0.03, 0.95, 8),
    new MeshStandardMaterial({ color: 0x9a3412, roughness: 0.85 }),
  )
  shaft.rotation.z = MathUtils.degToRad(90)
  g.add(shaft)

  const tip = new Mesh(
    new ConeGeometry(0.06, 0.18, 10),
    new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }),
  )
  tip.position.x = 0.52
  tip.rotation.z = MathUtils.degToRad(90)
  g.add(tip)

  const fletch = new Mesh(
    new BoxGeometry(0.02, 0.16, 0.12),
    new MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9 }),
  )
  fletch.position.x = -0.48
  g.add(fletch)
  return g
}

