import JSZip from 'jszip'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

/** Matches a CSS `url(...)` reference, capturing the inner path (optionally
 * quoted). Skips anything that's already a data: URI or an absolute
 * http(s)/protocol-relative URL — those are left untouched. */
const URL_REF_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi

function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot + 1).toLowerCase()
}

/** Resolves a CSS-relative reference (e.g. `../img/bg.png`) against the
 * directory the referencing style.css lives in, inside the zip. */
function resolveRelative(baseDir: string, ref: string): string {
  const parts = [...baseDir.split('/'), ...ref.split('/')].filter((p) => p && p !== '.')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}

/** Parses an uploaded theme package .zip entirely client-side: finds
 * style.css (required — anywhere in the archive, so a zip with a single
 * wrapping folder like WordPress themes commonly have still works), and
 * inlines every local asset it references as a base64 data URI, producing
 * one fully self-contained CSS string. No network calls, no backend
 * involvement — the backend (theme-packages module) only ever sees the
 * final text. */
export async function parseThemePackageZip(file: File): Promise<{ css: string }> {
  const zip = await JSZip.loadAsync(file)

  const styleEntry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.toLowerCase().split('/').pop() === 'style.css',
  )
  if (!styleEntry) {
    throw new Error('No style.css found in this package — a theme package must include one at its root.')
  }

  let css = await styleEntry.async('text')
  const baseDir = styleEntry.name.includes('/') ? styleEntry.name.slice(0, styleEntry.name.lastIndexOf('/')) : ''

  const refs = new Set<string>()
  let match: RegExpExecArray | null
  URL_REF_PATTERN.lastIndex = 0
  while ((match = URL_REF_PATTERN.exec(css))) {
    const ref = match[2].trim()
    if (!ref || ref.startsWith('data:') || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) continue
    refs.add(ref)
  }

  for (const ref of refs) {
    const resolvedPath = resolveRelative(baseDir, ref)
    const assetEntry = zip.file(resolvedPath) || zip.file(resolvedPath.replace(/^\//, ''))
    if (!assetEntry) continue // asset missing from the archive — leave the original url() as-is rather than failing the whole upload
    const ext = extOf(resolvedPath)
    const mime = MIME_BY_EXT[ext]
    if (!mime) continue // unrecognized asset type — skip inlining it, leave the reference untouched
    const base64 = await assetEntry.async('base64')
    const dataUri = `data:${mime};base64,${base64}`
    // Replace every occurrence of this exact reference (quoted or not).
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    css = css.replace(new RegExp(`url\\(\\s*(['"]?)${escaped}\\1\\s*\\)`, 'g'), `url(${dataUri})`)
  }

  return { css }
}
