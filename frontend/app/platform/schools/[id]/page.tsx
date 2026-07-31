"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../../../components/Sidebar'
import AuthGuard from '../../../../components/AuthGuard'
import { platformNav } from '../../../../lib/platform-nav'
import { apiFetch } from '../../../../lib/api'

interface SchoolDetail {
  id: string
  name: string
  subdomain: string
  customDomain: string | null
  status: string
  createdAt: string
  counts: { students: number; staff: number; classes: number }
}

const SCHOOL_ROOT_DOMAIN = process.env.NEXT_PUBLIC_SCHOOL_ROOT_DOMAIN || 'wattaman.app'

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-red-50 text-red-700 border-red-200',
  TRIAL: 'bg-amber-50 text-amber-700 border-amber-200',
}

function SchoolDetailContent() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'danger'>('overview')

  const [statusBusy, setStatusBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const [reason, setReason] = useState('')
  const [impersonating, setImpersonating] = useState(false)
  const [impersonateError, setImpersonateError] = useState('')

  const [resetReason, setResetReason] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetResult, setResetResult] = useState<{ email: string; temporaryPassword: string } | null>(null)
  const [resetCopied, setResetCopied] = useState(false)

  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/platform/schools/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSchool(await res.json())
    } catch {
      setError('Failed to load school')
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(newStatus: 'ACTIVE' | 'SUSPENDED') {
    if (!school) return
    setStatusBusy(true)
    setStatusMsg('')
    try {
      const res = await apiFetch(`/api/platform/schools/${school.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `HTTP ${res.status}`)
      }
      setSchool(await res.json())
      setStatusMsg(newStatus === 'SUSPENDED' ? 'School suspended — access is now blocked immediately.' : 'School reactivated.')
    } catch (e: any) {
      setStatusMsg(e.message || 'Failed to update status')
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleImpersonate() {
    if (!school || !reason.trim()) return
    setImpersonating(true)
    setImpersonateError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${school.id}/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      const bridgeUrl = `${window.location.protocol}//${school.subdomain}.${SCHOOL_ROOT_DOMAIN}/session-bridge?token=${encodeURIComponent(data.access_token)}`
      window.open(bridgeUrl, '_blank', 'noopener,noreferrer')
      setReason('')
    } catch (e: any) {
      setImpersonateError(e.message || 'Failed to start impersonation session')
    } finally {
      setImpersonating(false)
    }
  }

  async function handleResetPassword() {
    if (!school || !resetReason.trim()) return
    setResetting(true)
    setResetError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${school.id}/reset-admin-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: resetReason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      setResetResult({ email: data.email, temporaryPassword: data.temporaryPassword })
      setResetReason('')
    } catch (e: any) {
      setResetError(e.message || 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  function copyResetPassword() {
    if (!resetResult) return
    navigator.clipboard?.writeText(resetResult.temporaryPassword).then(() => {
      setResetCopied(true)
      setTimeout(() => setResetCopied(false), 2000)
    })
  }

  async function handleDelete() {
    if (!school || confirmName !== school.name) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${school.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `HTTP ${res.status}`)
      }
      router.push('/platform/schools')
    } catch (e: any) {
      setDeleteError(e.message || 'Failed to delete school')
      setDeleting(false)
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <Link href="/platform/schools" className="text-xs text-slate-500 hover:text-slate-700 mb-2 inline-flex items-center gap-1">← Back to Schools</Link>
          {school && (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">{school.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[school.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                {school.status}
              </span>
            </div>
          )}
        </div>

        <div className="page-body space-y-4">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : school && (
            <>
              <div className="flex gap-1 border-b border-slate-200">
                {(['overview', 'danger'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-slate-700 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    {t === 'overview' ? 'Overview' : 'Danger Zone'}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="stat-card">
                      <div className="stat-label">Students</div>
                      <div className="stat-value">{school.counts.students}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Staff</div>
                      <div className="stat-value">{school.counts.staff}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Classes</div>
                      <div className="stat-value">{school.counts.classes}</div>
                    </div>
                  </div>
                  <div className="card p-5 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Subdomain</span><span className="font-medium text-slate-800">{school.subdomain}.{SCHOOL_ROOT_DOMAIN}</span></div>
                    {school.customDomain && (
                      <div className="flex justify-between"><span className="text-slate-500">Custom domain</span><span className="font-medium text-slate-800">{school.customDomain}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="font-medium text-slate-800">{new Date(school.createdAt).toLocaleString()}</span></div>
                  </div>

                  <Link href={`/platform/schools/${school.id}/addons`} className="card p-5 flex items-center justify-between gap-3 hover:shadow-md transition-all">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Modules & Add-ons</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Manage free modules (Attendance, Fees, etc.) and billing-gated paid features.</p>
                    </div>
                    <span className="text-slate-400">→</span>
                  </Link>

                  <Link href={`/platform/schools/${school.id}/usage`} className="card p-5 flex items-center justify-between gap-3 hover:shadow-md transition-all">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Usage &amp; Speed</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Daily activity and average request latency, to tell "busy" apart from "actually slow."</p>
                    </div>
                    <span className="text-slate-400">→</span>
                  </Link>

                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1">View as this school</h3>
                    <p className="text-xs text-slate-500 mb-3">Opens a new tab signed in as this school's admin. Every session is audit-logged with the reason you provide, and expires after 30 minutes.</p>
                    {impersonateError && <div className="text-xs text-red-600 mb-2">{impersonateError}</div>}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                        placeholder="Reason (required — e.g. support ticket #1234)" className="flex-1" />
                      <button onClick={handleImpersonate} disabled={!reason.trim() || impersonating || school.status === 'SUSPENDED'}
                        className="btn-outline text-sm px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-50">
                        {impersonating ? 'Opening…' : '👁 View as School'}
                      </button>
                    </div>
                    {school.status === 'SUSPENDED' && <p className="text-xs text-amber-600 mt-2">Reactivate the school before impersonating — a suspended school blocks all access, including this.</p>}
                  </div>

                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1">Reset admin password</h3>
                    <p className="text-xs text-slate-500 mb-3">Generates a new temporary password for this school's admin account (the same one used for impersonation) and shows it once. Audit-logged with the reason you provide.</p>
                    {resetError && <div className="text-xs text-red-600 mb-2">{resetError}</div>}
                    {resetResult ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Temporary password — shown once</p>
                        <div className="text-sm text-slate-700"><span className="text-slate-500">Email:</span> {resetResult.email}</div>
                        <div className="flex items-center gap-2">
                          <code className="bg-white border border-amber-200 rounded px-2 py-1 text-sm font-mono">{resetResult.temporaryPassword}</code>
                          <button onClick={copyResetPassword} className="btn-outline btn-sm">{resetCopied ? 'Copied!' : 'Copy'}</button>
                        </div>
                        <button onClick={() => setResetResult(null)} className="text-xs text-amber-700 underline mt-1">Reset again</button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input type="text" value={resetReason} onChange={e => setResetReason(e.target.value)}
                          placeholder="Reason (required — e.g. admin lost their password)" className="flex-1" />
                        <button onClick={handleResetPassword} disabled={!resetReason.trim() || resetting}
                          className="btn-outline text-sm px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-50">
                          {resetting ? 'Resetting…' : '🔑 Reset Password'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'danger' && (
                <div className="space-y-4">
                  <div className="card p-5 border-2 border-amber-100">
                    <h3 className="text-sm font-semibold text-amber-800 mb-1">
                      {school.status === 'SUSPENDED' ? 'Reactivate school' : 'Suspend school'}
                    </h3>
                    <p className="text-xs text-slate-500 mb-3">
                      {school.status === 'SUSPENDED'
                        ? 'Restores access immediately for every user at this school.'
                        : 'Blocks all access for this school immediately, including already-logged-in users. Use for non-payment or policy violations.'}
                    </p>
                    {statusMsg && <div className="text-xs text-slate-600 mb-2">{statusMsg}</div>}
                    <button
                      onClick={() => toggleStatus(school.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')}
                      disabled={statusBusy}
                      className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${school.status === 'SUSPENDED' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}>
                      {statusBusy ? 'Working…' : school.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                    </button>
                  </div>

                  <div className="card p-5 border-2 border-red-100">
                    <h3 className="text-sm font-semibold text-red-700 mb-1">Delete school</h3>
                    <p className="text-xs text-slate-600 mb-3">
                      <strong className="text-red-700">Irreversible.</strong> Permanently deletes {school.name} and every record it owns —
                      students, staff, attendance, fees, everything. Type the school's exact name to confirm.
                    </p>
                    {deleteError && <div className="text-xs text-red-600 mb-2">{deleteError}</div>}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)}
                        placeholder={school.name} className="flex-1" />
                      <button onClick={handleDelete} disabled={confirmName !== school.name || deleting}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                        {deleting ? 'Deleting…' : 'Delete School'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SchoolDetailPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <SchoolDetailContent />
    </AuthGuard>
  )
}
