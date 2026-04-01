import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
} from 'three'

/** Shared cel ramp — cool highlights, blue-mid, deep violet shadow (PSO remaster read) */
let gradientMap: DataTexture | null = null

export function getToonGradientMap(): DataTexture {
  if (gradientMap) return gradientMap
  const w = 6
  const h = 1
  const data = new Uint8Array(w * h * 4)
  const bands: [number, number, number][] = [
    [255, 252, 248],
    [220, 228, 245],
    [170, 182, 215],
    [110, 118, 155],
    [55, 58, 82],
    [28, 26, 42],
  ]
  for (let i = 0; i < w; i++) {
    const [r, g, b] = bands[i]
    data[i * 4 + 0] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  const tex = new DataTexture(data, w, h, RGBAFormat)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.needsUpdate = true
  gradientMap = tex
  return gradientMap
}

export function psoToon(color: number | Color, opts?: { emissive?: number; emissiveIntensity?: number }) {
  const c = typeof color === 'number' ? new Color(color) : color
  return new MeshToonMaterial({
    color: c,
    gradientMap: getToonGradientMap(),
    emissive: new Color(opts?.emissive ?? 0x000000),
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
  })
}

export function psoToonVertex() {
  return new MeshToonMaterial({
    vertexColors: true,
    gradientMap: getToonGradientMap(),
  })
}

/** Tech / energy — tuned for bloom, slightly glossy */
export function psoGlow(color: number, emissive: number, intensity = 0.9) {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.28,
    metalness: 0.22,
  })
}
