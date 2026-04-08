/** Vite public/ base URL with safe path segments (spaces in Kenney paths). */
export function publicAssetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const parts = relative.replace(/^\//, '').split('/')
  return `${normalizedBase}${parts.map(encodeURIComponent).join('/')}`
}
