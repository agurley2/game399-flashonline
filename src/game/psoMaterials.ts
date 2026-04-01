import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
} from 'three'

/** Shared 4-step toon ramp (cel shading) */
let gradientMap: DataTexture | null = null

export function getToonGradientMap(): DataTexture {
  if (gradientMap) return gradientMap
  const w = 4
  const h = 1
  const data = new Uint8Array(w * h * 4)
  const bands: [number, number, number][] = [
    [255, 255, 255],
    [210, 215, 230],
    [130, 138, 165],
    [55, 62, 85],
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

/** Glowing tech / energy (still reads “remaster” with bloom) */
export function psoGlow(color: number, emissive: number, intensity = 0.9) {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.15,
  })
}

export function psoSkyBasic() {
  return new MeshBasicMaterial({
    color: 0x3d6a9c,
  })
}
