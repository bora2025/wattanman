import JSZip from 'jszip'

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Parses an uploaded catalog package .zip entirely client-side — a
 * screenshot image (any file literally named "screenshot.*") and/or a
 * README (readme.md or readme.txt), anywhere in the archive. Deliberately
 * metadata-only, unlike versioned theme packages: this never
 * looks for or extracts a stylesheet, and the result only ever populates
 * AddonDefinition.screenshotUrl/detailDescription — nothing that changes
 * what a listing *does*, only what's shown about it in the catalog. */
export async function parseAddonPackageZip(file: File): Promise<{ screenshotUrl?: string; detailDescription?: string }> {
  const zip = await JSZip.loadAsync(file)
  const entries = Object.values(zip.files).filter((f) => !f.dir)

  const screenshotEntry = entries.find((f) => {
    const base = f.name.toLowerCase().split('/').pop() || ''
    return base.startsWith('screenshot.') && IMAGE_MIME_BY_EXT[extOf(base)]
  })
  const readmeEntry = entries.find((f) => {
    const base = f.name.toLowerCase().split('/').pop() || ''
    return base === 'readme.md' || base === 'readme.txt'
  })

  if (!screenshotEntry && !readmeEntry) {
    throw new Error('No screenshot.* or README.md found in this package.')
  }

  const result: { screenshotUrl?: string; detailDescription?: string } = {}
  if (screenshotEntry) {
    const mime = IMAGE_MIME_BY_EXT[extOf(screenshotEntry.name)]
    const base64 = await screenshotEntry.async('base64')
    result.screenshotUrl = `data:${mime};base64,${base64}`
  }
  if (readmeEntry) {
    result.detailDescription = (await readmeEntry.async('text')).trim()
  }
  return result
}
