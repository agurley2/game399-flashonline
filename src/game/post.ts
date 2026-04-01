import { Vector2, WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export type PostFX = {
  composer: EffectComposer
  bloom: UnrealBloomPass
  setSize: (w: number, h: number) => void
}

export function createPostFX(opts: {
  renderer: WebGLRenderer
  scene: any
  camera: any
  width: number
  height: number
}): PostFX {
  const composer = new EffectComposer(opts.renderer)
  composer.setSize(opts.width, opts.height)
  composer.addPass(new RenderPass(opts.scene, opts.camera))

  const bloom = new UnrealBloomPass(new Vector2(opts.width, opts.height), 0.42, 0.38, 0.94)
  composer.addPass(bloom)

  return {
    composer,
    bloom,
    setSize: (w, h) => {
      composer.setSize(w, h)
      bloom.setSize(w, h)
    },
  }
}

