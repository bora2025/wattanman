"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch, getCurrentUser } from '../../../lib/api'

function MfaSetupContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [alreadyEnabled, setAlreadyEnabled] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      // /auth/mfa/setup always (re)generates a secret, so only call it if the
      // account isn't already enrolled — otherwise re-visiting this page would
      // invalidate a working authenticator entry for no reason.
      const user = await getCurrentUser()
      if (user?.mfaEnabled) {
        setAlreadyEnabled(true)
        setLoading(false)
        return
      }
      try {
        const res = await apiFetch('/api/auth/mfa/setup', { method: 'POST' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setSecret(data.secret)
        setQrDataUrl(await QRCode.toDataURL(data.otpauthUrl, { width: 240, margin: 1 }))
      } catch {
        setError('Failed to start MFA setup')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setVerifying(true)
    setError('')
    try {
      const res = await apiFetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Invalid code')
      setDone(true)
      setTimeout(() => router.push('/platform'), 1800)
    } catch (e: any) {
      setError(e.message || 'Invalid code — try again')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">Two-Factor Authentication</h1>
          <p className="text-sm text-slate-500 mt-1">Required for every Platform Admin account — it can reach every school.</p>
        </div>

        <div className="page-body">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : alreadyEnabled ? (
            <div className="card p-6 max-w-md text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-medium text-slate-700">MFA is already enabled on your account.</p>
            </div>
          ) : done ? (
            <div className="card p-6 max-w-md text-center border-2 border-emerald-100">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-medium text-emerald-700">MFA enabled. Redirecting…</p>
            </div>
          ) : (
            <div className="card p-6 max-w-md space-y-4">
              {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}
              <div className="text-center">
                {qrDataUrl && <img src={qrDataUrl} alt="MFA QR code" className="mx-auto rounded-lg border border-slate-200" />}
                <p className="text-xs text-slate-500 mt-3">Scan with Google Authenticator, Authy, or any TOTP app.</p>
                {secret && (
                  <p className="text-xs text-slate-400 mt-1 font-mono break-all">Manual entry: {secret}</p>
                )}
              </div>
              <form onSubmit={handleVerify} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Enter the 6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-center text-lg tracking-[0.3em] font-mono"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={code.length !== 6 || verifying} className="btn-primary w-full py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {verifying ? 'Verifying…' : 'Enable MFA'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MfaSetupPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <MfaSetupContent />
    </AuthGuard>
  )
}
