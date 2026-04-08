import {
  AnimationClip,
  Box3,
  Color,
  Group,
  Material,
  Mesh,
  Object3D,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { clone as cloneSkinnedMesh } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { publicAssetUrl } from './assetUrls'

export type RiggedTemplate = {
  scene: Group
  clips: AnimationClip[]
}

export type GameAssets = {
  player: RiggedTemplate
  npc: RiggedTemplate
  enemy: RiggedTemplate
  npcRifle: Group
  treeNames: string[]
  cloneTree: (seed: number) => Group
  portal: Group
  shell: Group
  pillar: Group
  arrow: Group
}

function loadObj(dirUrl: string, baseName: string): Promise<Group> {
  return new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader()
    mtlLoader.setPath(dirUrl)
    mtlLoader.load(
      `${baseName}.mtl`,
      (materials) => {
        materials.preload()
        const objLoader = new OBJLoader()
        objLoader.setMaterials(materials)
        objLoader.setPath(dirUrl)
        objLoader.load(
          `${baseName}.obj`,
          (obj) => {
            obj.traverse((c) => {
              const m = (c as Mesh).material
              if (!m) return
              const mats = Array.isArray(m) ? m : [m]
              for (const mat of mats) {
                const mm = mat as Material & { roughness?: number; metalness?: number }
                if (typeof mm.roughness === 'number') mm.roughness = 0.55
                if (typeof mm.metalness === 'number') mm.metalness = 0.08
              }
            })
            resolve(obj as Group)
          },
          undefined,
          reject,
        )
      },
      undefined,
      reject,
    )
  })
}

function loadGltf(url: string): Promise<RiggedTemplate> {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene as Group
        resolve({ scene, clips: gltf.animations })
      },
      undefined,
      reject,
    )
  })
}

function rand01(seed: number) {
  const s = Math.sin(seed * 127.1) * 43758.5453123
  return s - Math.floor(s)
}

/** Scale to height and sit on origin plane (feet ~ y=0). */
function fitHeightOnGround(root: Object3D, targetH: number) {
  const box = new Box3().setFromObject(root)
  const size = new Vector3()
  box.getSize(size)
  const h = Math.max(size.y, 0.001)
  root.scale.multiplyScalar(targetH / h)
  const box2 = new Box3().setFromObject(root)
  root.position.y -= box2.min.y
}

function colorize(root: Object3D, mult: Color) {
  root.traverse((o) => {
    const m = (o as Mesh).material
    if (!m) return
    const mats = Array.isArray(m) ? m : [m]
    for (const mat of mats) {
      if ('color' in mat && (mat as { color: Color }).color) {
        ;(mat as { color: Color }).color.multiply(mult)
      }
    }
  })
}

export async function loadGameAssets(): Promise<GameAssets> {
  const natureDir = publicAssetUrl('models/kenney_nature-kit/Models/OBJ format') + '/'
  const spaceDir = publicAssetUrl('models/kenney_space-kit/Models/OBJ format') + '/'

  const treeNames = [
    'tree_pineTallA',
    'tree_pineRoundC',
    'tree_small',
    'tree_tall',
    'tree_thin',
    'tree_detailed',
  ]

  const loaded = await Promise.all([
    loadGltf(publicAssetUrl('models/Xbot.glb')),
    loadGltf(publicAssetUrl('models/Soldier.glb')),
    loadGltf(publicAssetUrl('models/Fox.glb')),
    loadObj(spaceDir, 'gate_complex'),
    loadObj(spaceDir, 'pipe_ring'),
    loadObj(spaceDir, 'pipe_ringHigh'),
    loadObj(spaceDir, 'pipe_straight'),
    loadObj(spaceDir, 'weapon_rifle'),
    loadObj(spaceDir, 'rocks_smallA'),
    loadObj(natureDir, 'stone_tallA'),
    loadObj(spaceDir, 'rocket_topA'),
    ...treeNames.map((name) => loadObj(natureDir, name)),
  ])

  const player = loaded[0] as RiggedTemplate
  const npc = loaded[1] as RiggedTemplate
  const enemy = loaded[2] as RiggedTemplate
  const gate = loaded[3] as Group
  const ring = loaded[4] as Group
  const ringHi = loaded[5] as Group
  const pipeStr = loaded[6] as Group
  const rifle = loaded[7] as Group
  const rock = loaded[8] as Group
  const stoneTall = loaded[9] as Group
  const rocket = loaded[10] as Group
  const trees = loaded.slice(11) as Group[]

  fitHeightOnGround(player.scene, 1.65)
  player.scene.rotation.y = Math.PI

  fitHeightOnGround(npc.scene, 1.45)
  npc.scene.rotation.y = Math.PI * 0.12

  fitHeightOnGround(enemy.scene, 0.88)
  colorize(enemy.scene, new Color(1.12, 0.7, 0.52))

  const portal = new Group()
  gate.scale.setScalar(1.12)
  portal.add(gate)

  ring.position.set(0, 1.35, 0)
  ring.scale.setScalar(1.02)
  portal.add(ring)

  ringHi.position.set(0, 2.1, 0)
  ringHi.scale.setScalar(0.94)
  portal.add(ringHi)

  pipeStr.position.set(0, 2.75, 0)
  pipeStr.scale.set(0.52, 1.15, 0.52)
  portal.add(pipeStr)

  const shell = rock.clone() as Group
  shell.scale.multiplyScalar(1.35)
  colorize(shell, new Color(0.5, 0.92, 1.02))

  const pillar = stoneTall.clone() as Group
  pillar.scale.multiplyScalar(1.05)

  const arrow = rocket.clone() as Group
  arrow.scale.multiplyScalar(0.42)
  arrow.rotation.x = Math.PI * 0.5

  const treeCache = new Map<string, Group>()
  treeNames.forEach((name, i) => {
    treeCache.set(name, trees[i])
  })

  const cloneTree = (seed: number) => {
    const name = treeNames[Math.floor(rand01(seed + 1) * treeNames.length) % treeNames.length]
    const src = treeCache.get(name)!
    const t = src.clone(true) as Group
    t.rotation.y = rand01(seed) * Math.PI * 2
    t.scale.setScalar(0.82 + rand01(seed + 2) * 0.38)
    return t
  }

  return {
    player,
    npc,
    enemy,
    npcRifle: rifle,
    treeNames,
    cloneTree,
    portal,
    shell,
    pillar,
    arrow,
  }
}

export function cloneSkinnedRig(template: RiggedTemplate) {
  return cloneSkinnedMesh(template.scene) as Group
}
