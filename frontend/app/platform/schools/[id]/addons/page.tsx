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
  label: string
  description: string
  billingStatus: 'PENDING' | 'ACTIVE' | 'OVERDUE' | 'CANCELLED'
  enabled: boolean
  activatedAt: string | null
  activatedBy: string | null
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
  const [billingStatus, setBillingStatus] = useState(addon.billingStatus)
  const [enabled, setEnabled] = useState(addon.enabled)
  const [notes, setNotes] = useState(addon.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = billingStatus !== addon.billingStatus || enabled !== addon.enabled || notes !== (addon.notes ?? '')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/schools/${schoolId}/addons/${addon.addonKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingStatus, enabled, notes: notes || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onSaved({ ...addon, billingStatus, enabled, notes: notes || null, activatedAt: data.activatedAt ?? addon.activatedAt, activatedBy: data.activatedBy ?? addon.activatedBy })
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{addon.label}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[addon.billingStatus]}`}>{addon.billingStatus}</span>
            {addon.enabled && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">Feature ON</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1">{addon.description}</p>
          {addon.activatedAt && (
            <p className="text-[11px] text-slate-400 mt-1">Last activated {new Date(addon.activatedAt).toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          aria-label={enabled ? `Disable ${addon.label}` : `Enable ${addon.label}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

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
          <h1 className="text-2xl font-bold text-slate-800">Paid Add-ons</h1>
          <p className="text-sm text-slate-500 mt-1">Billing is manual — invoice the school outside this system, then flip it on here once paid.</p>
        </div>

        <div className="page-body space-y-3">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : (
            addons.map(a => (
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
