'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../lib/i18n'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
    },
  }))

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Defer registration until after first paint so we never block hydration.
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    // If this tab was already controlled by a service worker and a NEW one
    // takes over control (i.e. a redeploy happened while the tab was open),
    // the JS bundle already loaded in memory is now stale — its build id /
    // Server Action manifest no longer matches the server. Reload once so
    // the tab picks up the current deployment instead of failing later with
    // "Failed to find Server Action ... older or newer deployment" errors.
    // We only do this if the tab was already controlled (not a first visit),
    // so brand-new visitors never get an unexpected reload.
    const hadController = !!navigator.serviceWorker.controller
    let reloaded = false
    const onControllerChange = () => {
      if (!hadController || reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      window.removeEventListener('load', onLoad)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  )
}

