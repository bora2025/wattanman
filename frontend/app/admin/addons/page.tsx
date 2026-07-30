"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

interface DirectoryAddon {
  addonKey: string
  kind: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  price: number | null
  priceNote: string | null
  enabled: boolean
  requested: boolean
}

function priceLabel(a: DirectoryAddon): string {
  if (a.price == null) return 'Contact us for pricing'
  return `$${a.price}${a.priceNote ? ` ${a.priceNote}` : ''}`
}

function ModuleCard({ addon, onChanged }: { addon: DirectoryAddon; onChanged: (a: DirectoryAddon) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/school-addons/${addon.addonKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !addon.enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged({ ...addon, enabled: !addon.enabled })
    } catch (e: any) {
      setError(e.message || 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xl shrink-0">{addon.icon || '🧩'}</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{addon.name}</span>
              {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{addon.category}</span>}
            </div>
            {addon.description && <p className="text-xs text-slate-500 mt-1">{addon.description}</p>}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${addon.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          aria-label={addon.enabled ? `Disable ${addon.name}` : `Enable ${addon.name}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${addon.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  )
}

function PaidAddonCard({ addon, onChanged }: { addon: DirectoryAddon; onChanged: (a: DirectoryAddon) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function request() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/school-addons/${addon.addonKey}/request`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged({ ...addon, requested: true })
    } catch (e: any) {
      setError(e.message || 'Failed to request')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/school-addons/${addon.addonKey}/request`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged({ ...addon, requested: false })
    } catch (e: any) {
      setError(e.message || 'Failed to cancel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">{addon.icon || '🧩'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{addon.name}</span>
            {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{addon.category}</span>}
          </div>
          {addon.description && <p className="text-xs text-slate-500 mt-1">{addon.description}</p>}
        </div>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-sm font-medium text-slate-700">{priceLabel(addon)}</span>
        {addon.enabled ? (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">✓ Enabled</span>
        ) : addon.requested ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Requested — pending approval</span>
            <button onClick={cancel} disabled={busy} className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">
              {busy ? '…' : 'Cancel'}
            </button>
          </div>
        ) : (
          <button onClick={request} disabled={busy} className="btn-primary btn-sm disabled:opacity-50">
            {busy ? 'Requesting…' : 'Request this add-on'}
          </button>
        )}
      </div>
    </div>
  )
}

function AddonsContent() {
  const [addons, setAddons] = useState<DirectoryAddon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/school-addons/directory')
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setAddons(await res.json())
      })
      .catch(() => setError('Failed to load add-ons'))
      .finally(() => setLoading(false))
  }, [])

  function handleChanged(updated: DirectoryAddon) {
    setAddons(prev => prev.map(a => a.addonKey === updated.addonKey ? updated : a))
  }

  const modules = addons.filter(a => a.kind === 'MODULE')
  const paidAddons = addons.filter(a => a.kind === 'ADDON')

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">Modules &amp; Add-ons</h1>
          <p className="text-sm text-slate-500 mt-1">Turn free modules on or off yourself. Paid add-ons need a quick approval — request one and we'll follow up to enable it once billing is sorted.</p>
        </div>

        <div className="page-body space-y-6">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : addons.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm">No modules or add-ons available yet — check back later.</div>
          ) : (
            <>
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Modules</h2>
                {modules.length === 0 ? (
                  <p className="text-xs text-slate-400">No modules in the catalog yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {modules.map(a => <ModuleCard key={a.addonKey} addon={a} onChanged={handleChanged} />)}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Paid Add-ons</h2>
                {paidAddons.length === 0 ? (
                  <p className="text-xs text-slate-400">No paid add-ons available yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {paidAddons.map(a => <PaidAddonCard key={a.addonKey} addon={a} onChanged={handleChanged} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SchoolAddonsPage() {
  return (
    <AuthGuard requiredRole="ADMIN">
      <AddonsContent />
    </AuthGuard>
  )
}
