"use client"

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Landing point for the Platform tier's "view as school X" impersonation flow.
 * The platform admin's browser is sent here — on the TARGET school's own
 * subdomain — with a short-lived impersonation token in the URL, since a
 * cookie set on the platform host can never be read on a different origin
 * (host-only cookies are a deliberate security boundary, not an oversight —
 * see the multi-tenant conversion plan's Phase 2a). This page's only job is
 * to hand that token to /auth/session/consume (via the same-origin proxy, so
 * the resulting cookie is scoped to THIS school's host) and then move on.
 */
function SessionBridgeContent() {
  const params = useSearchParams()
  const [status, setStatus] = useState<'working' | 'error'>('working')
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('Missing session token.')
      return
    }
    fetch('/api/auth/session/consume', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.message || `HTTP ${res.status}`)
        }
        window.location.replace('/admin')
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.message || 'This impersonation link is invalid or has expired.')
      })
  }, [params])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm px-6">
        {status === 'working' ? (
          <>
            <div className="w-10 h-10 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500 mt-3">{message}</p>
          </>
        ) : (
          <>
            <div className="text-3xl mb-2">⚠️</div>
            <p className="text-sm font-medium text-red-700">{message}</p>
            <a href="/login" className="text-xs text-slate-500 underline mt-3 inline-block">Go to login</a>
          </>
        )}
      </div>
    </div>
  )
}

export default function SessionBridgePage() {
  return (
    <Suspense fallback={null}>
      <SessionBridgeContent />
    </Suspense>
  )
}
