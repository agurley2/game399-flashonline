import type { AnimationClip } from 'three'

export function pickAnimationClip(clips: AnimationClip[], ...nameHints: string[]) {
  if (!clips.length) return null
  const hints = nameHints.map((h) => h.toLowerCase())
  for (const c of clips) {
    const n = c.name.toLowerCase()
    for (const h of hints) {
      if (n.includes(h)) return c
    }
  }
  return clips[0]
}
