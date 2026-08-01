'use client'

import { useEffect, useState } from 'react'
import { ActivePreview, keepPreview, loadActivePreview, onPreviewChanged, reapplyActivePreview, revertPreview } from '../../lib/appearance/preview'

/** Mounted globally (see Providers) so a live theme Preview (Phase 21),
 * once started from the Appearance tab, stays visible and in effect while
 * navigating anywhere else in the dashboard — not just on the page it was
 * started from. */
export default function ThemePreviewBanner() {
  const [active, setActive] = useState<ActivePreview | null>(null)

  useEffect(() => {
    const sync = () => setActive(loadActivePreview())
    reapplyActivePreview()
    sync()
    return onPreviewChanged(sync)
  }, [])

  if (!active) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[70] bg-slate-800 text-white text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-lg">
      <span>Previewing <strong>{active.themeName}</strong></span>
      <button onClick={() => keepPreview()} className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 font-semibold text-xs">
        Keep this theme
      </button>
      <button onClick={() => revertPreview()} className="px-3 py-1 rounded-md bg-slate-600 hover:bg-slate-700 font-semibold text-xs">
        Revert
      </button>
    </div>
  )
}
