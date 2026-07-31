"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch, getCurrentUser } from '../../../lib/api'

interface PlatformAdmin {
  id: string
  name: string
  email: string
  mfaEnabled: boolean
  createdAt: string
}

function PlatformAdminsContent() {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selfId, setSelfId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ email: string; temporaryPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    load()
    getCurrentUser().then(u => setSelfId(u?.userId ?? null))
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/platform/admins')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAdmins(await res.json())
    } catch {
      setError('Failed to load platform admins')
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setInviting(true)
    setError('')
    try {
      const res = await apiFetch('/api/platform/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      setInviteResult({ email: data.admin.email, temporaryPassword: data.temporaryPassword })
      setName('')
      setEmail('')
      load()
    } catch (e: any) {
      setError(e.message || 'Failed to invite admin')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this platform admin? This cannot be undone.')) return
    setRemovingId(id)
    try {
      const res = await apiFetch(`/api/platform/admins/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `HTTP ${res.status}`)
      }
      setAdmins(prev => prev.filter(a => a.id !== id))
    } catch (e: any) {
      setError(e.message || 'Failed to remove admin')
    } finally {
      setRemovingId(null)
    }
  }

  function copyPassword() {
    if (!inviteResult) return
    navigator.clipboard?.writeText(inviteResult.temporaryPassword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Platform Admins</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Wattaman staff with cross-school access. Keep this list small.</p>
        </div>

        <div className="page-body space-y-6">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>}

          <div className="card p-6 max-w-lg">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Invite a platform admin</h2>
            {inviteResult ? (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Temporary password — shown once</p>
                <div className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-500 dark:text-slate-400">Email:</span> {inviteResult.email}</div>
                <div className="flex items-center gap-2">
                  <code className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded px-2 py-1 text-sm font-mono">{inviteResult.temporaryPassword}</code>
                  <button onClick={copyPassword} className="btn-outline btn-sm">{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <button onClick={() => setInviteResult(null)} className="text-xs text-amber-700 dark:text-amber-300 underline mt-1">Invite another</button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full" />
                </div>
                <button type="submit" disabled={inviting} className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                  {inviting ? 'Inviting…' : 'Invite'}
                </button>
              </form>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid gap-2">
              {admins.map(a => (
                <div key={a.id} className="card p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{a.name}</span>
                      {a.id === selfId && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">You</span>}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${a.mfaEnabled ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900' : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900'}`}>
                        {a.mfaEnabled ? 'MFA enabled' : 'MFA not set up'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{a.email}</div>
                  </div>
                  {a.id !== selfId && (
                    <button onClick={() => handleRemove(a.id)} disabled={removingId === a.id}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 whitespace-nowrap disabled:opacity-50">
                      {removingId === a.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlatformAdminsPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <PlatformAdminsContent />
    </AuthGuard>
  )
}
