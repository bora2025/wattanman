"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../../../../components/Sidebar'
import AuthGuard from '../../../../../components/AuthGuard'
import { platformNav } from '../../../../../lib/platform-nav'
import { apiFetch } from '../../../../../lib/api'

interface Addon {
  addonKey: string
  kind: string
  label: string
  description: string | null
  category: string | null
  icon: string | null
  price: number | null
  priceNote: string | null
  retired: boolean
  billingStatus: 'PENDING' | 'ACTIVE' | 'OVERDUE' | 'CANCELLED'
  enabled: boolean
  activatedAt: string | null
  activatedBy: string | null
  requestedAt: string | null
  requestedBy: string | null
  notes: string | null
}

const BILLING_STATUSES = ['PENDING', 'ACTIVE', 'OVERDUE', 'CANCELLED'] as const

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-slate-50 text-slate-600 border-slate-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-slate-100 text-slate-400 border-slate-200',
}

function AddonCard({ addon, schoolId, onSaved }: { addon: Addon; schoolId: string; onSaved: (a: Addon) => void }) {
  const isModule = addon.kind === 'MODULE'
  const [billingStatus, setBillingStatus] = useState(addon.billingStatus)
  const [notes, setNotes] = useState(addon.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState('')

  const dirty = billingStatus !== addon.billingStatus || notes !== (addon.notes ?? '')
  const requested = !isModule && !addon.enabled && !!addon.requestedAt

  async function dismissRequest() {
    setDismissing(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${schoolId}/addons/${addon.addonKey}/dismiss-request`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onSaved({ ...addon, requestedAt: null, requestedBy: null })
    } catch (e: any) {
      setError(e.message || 'Failed to dismiss')
    } finally {
      setDismissing(false)
    }
  }

  // The switch is a toggle, not a form field — it saves the instant you click
  // it, same as a light switch. Requiring a separate "Save" click after it
  // looked like the button was broken (it visually flipped but nothing
  // actually changed on the school until Save was pressed too).
  async function toggleEnabled() {
    setToggling(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${schoolId}/addons/${addon.addonKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !addon.enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onSaved({ ...addon, enabled: !addon.enabled, activatedAt: data.activatedAt ?? addon.activatedAt, activatedBy: data.activatedBy ?? addon.activatedBy })
    } catch (e: any) {
      setError(e.message || 'Failed to update')
    } finally {
      setToggling(false)
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${schoolId}/addons/${addon.addonKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingStatus, notes: notes || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onSaved({ ...addon, billingStatus, notes: notes || null })
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-lg shrink-0">{addon.icon || '🧩'}</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{addon.label}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${isModule ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                {isModule ? 'Module' : 'Paid add-on'}
              </span>
              {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{addon.category}</span>}
              {!isModule && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[addon.billingStatus]}`}>{addon.billingStatus}</span>}
              {addon.enabled && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">Feature ON</span>}
              {requested && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Requested by school</span>}
              {addon.retired && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Retired from directory</span>}
            </div>
            {addon.description && <p className="text-xs text-slate-500 mt-1">{addon.description}</p>}
            {addon.price != null && <p className="text-xs font-medium text-slate-600 mt-1">${addon.price}{addon.priceNote ? ` ${addon.priceNote}` : ''}</p>}
            {addon.activatedAt && (
              <p className="text-[11px] text-slate-400 mt-1">Last activated {new Date(addon.activatedAt).toLocaleString()}</p>
            )}
            {requested && addon.requestedAt && (
              <p className="text-[11px] text-amber-600 mt-1">
                Requested {new Date(addon.requestedAt).toLocaleString()} —{' '}
                <button onClick={dismissRequest} disabled={dismissing} className="underline hover:text-amber-800 disabled:opacity-50">
                  {dismissing ? 'Dismissing…' : 'Dismiss request'}
                </button>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={toggling}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${addon.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          aria-label={addon.enabled ? `Disable ${addon.label}` : `Enable ${addon.label}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${addon.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {!isModule && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Billing status</label>
              <select value={billingStatus} onChange={e => setBillingStatus(e.target.value as Addon['billingStatus'])} className="w-full text-sm">
                {BILLING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes (invoice ref, etc.)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Invoice #4521, paid 2026-07-15" className="w-full text-sm" />
            </div>
          </div>

          <button onClick={save} disabled={!dirty || saving} className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </div>
  )
}

function AddonsContent() {
  const { id } = useParams<{ id: string }>()
  const [schoolName, setSchoolName] = useState('')
  const [addons, setAddons] = useState<Addon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [schoolRes, addonsRes] = await Promise.all([
        apiFetch(`/api/platform/schools/${id}`),
        apiFetch(`/api/platform/schools/${id}/addons`),
      ])
      if (schoolRes.ok) setSchoolName((await schoolRes.json()).name)
      if (!addonsRes.ok) throw new Error(`HTTP ${addonsRes.status}`)
      setAddons(await addonsRes.json())
    } catch {
      setError('Failed to load add-ons')
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
          <Link href={`/platform/schools/${id}`} className="text-xs text-slate-500 hover:text-slate-700 mb-2 inline-flex items-center gap-1">← Back to {schoolName || 'School'}</Link>
          <h1 className="text-2xl font-bold text-slate-800">Modules &amp; Add-ons</h1>
          <p className="text-sm text-slate-500 mt-1">Toggle a module on or off, or manage a paid add-on's billing. Billing is manual — invoice the school outside this system, then flip it on here once paid.</p>
        </div>

        <div className="page-body space-y-3">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : (
            [...addons]
              .sort((a, b) => Number(!!b.requestedAt && !b.enabled) - Number(!!a.requestedAt && !a.enabled))
              .map(a => (
                <AddonCard key={a.addonKey} addon={a} schoolId={id} onSaved={updated => setAddons(prev => prev.map(x => x.addonKey === updated.addonKey ? updated : x))} />
              ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function SchoolAddonsPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <AddonsContent />
    </AuthGuard>
  )
}
