"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch } from '../../../lib/api'

interface AddonRequest {
  schoolId: string
  schoolName: string
  schoolSubdomain: string
  addonKey: string
  addonName: string
  icon: string | null
  price: number | null
  priceNote: string | null
  requestedAt: string
  requestedBy: { id: string; name: string; email: string } | null
}

function priceLabel(r: AddonRequest): string {
  if (r.price == null) return 'Contact for pricing'
  return `$${r.price}${r.priceNote ? ` ${r.priceNote}` : ''}`
}

function RequestRow({ request, onDismissed }: { request: AddonRequest; onDismissed: () => void }) {
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState('')

  async function dismiss() {
    if (!confirm(`Dismiss ${request.schoolName}'s request for "${request.addonName}"? They can request it again later.`)) return
    setDismissing(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${request.schoolId}/addons/${request.addonKey}/dismiss-request`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `HTTP ${res.status}`)
      }
      onDismissed()
    } catch (e: any) {
      setError(e.message || 'Failed to dismiss')
      setDismissing(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-xl shrink-0">{request.icon || '🧩'}</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{request.addonName}</span>
              <span className="text-slate-400 dark:text-slate-500">for</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{request.schoolName}</span>
              <code className="text-[10px] text-slate-400 dark:text-slate-500">{request.schoolSubdomain}</code>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{priceLabel(request)}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Requested {new Date(request.requestedAt).toLocaleString()}
              {request.requestedBy && <> by {request.requestedBy.name} ({request.requestedBy.email})</>}
            </p>
            {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/platform/schools/${request.schoolId}/addons`} className="btn-primary btn-sm">Review &amp; approve</Link>
          <button onClick={dismiss} disabled={dismissing} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50">
            {dismissing ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddonRequestsContent() {
  const [requests, setRequests] = useState<AddonRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/platform/addon-requests')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRequests(await res.json())
    } catch {
      setError('Failed to load add-on requests')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Add-on Requests</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Schools asking for a paid add-on, oldest first. Approve from the school's own page once billing is sorted, or dismiss if it's a no.</p>
        </div>

        <div className="page-body space-y-3">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No pending requests right now.</div>
          ) : (
            requests.map(r => (
              <RequestRow
                key={`${r.schoolId}-${r.addonKey}`}
                request={r}
                onDismissed={() => setRequests(prev => prev.filter(x => !(x.schoolId === r.schoolId && x.addonKey === r.addonKey)))}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function AddonRequestsPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <AddonRequestsContent />
    </AuthGuard>
  )
}
