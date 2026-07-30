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

function ModuleToggle({ addon, onChanged, size = 'md' }: { addon: DirectoryAddon; onChanged: (a: DirectoryAddon) => void; size?: 'md' | 'lg' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
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

  const track = size === 'lg' ? 'w-14 h-7 p-0.5' : 'w-11 h-6 p-0.5'
  const knob = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
  const slide = size === 'lg' ? 'translate-x-7' : 'translate-x-5'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={busy}
        className={`${track} inline-flex items-center rounded-full transition-colors shrink-0 disabled:opacity-60 ${addon.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        aria-label={addon.enabled ? `Disable ${addon.name}` : `Enable ${addon.name}`}
      >
        <span className={`${knob} inline-block rounded-full bg-white shadow transform transition-transform ${addon.enabled ? slide : 'translate-x-0'}`} />
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const isModule = kind === 'MODULE'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${isModule ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
      {isModule ? 'Module' : 'Paid add-on'}
    </span>
  )
}

function PaidAddonAction({ addon, onChanged, size = 'md' }: { addon: DirectoryAddon; onChanged: (a: DirectoryAddon) => void; size?: 'md' | 'lg' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function request(e: React.MouseEvent) {
    e.stopPropagation()
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

  async function cancel(e: React.MouseEvent) {
    e.stopPropagation()
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

  const btnClass = size === 'lg' ? 'btn-primary px-4 py-2' : 'btn-primary btn-sm'

  return (
    <div className="flex flex-col items-end gap-1">
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
        <button onClick={request} disabled={busy} className={`${btnClass} disabled:opacity-50`}>
          {busy ? 'Requesting…' : 'Request this add-on'}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  )
}

function AddonCard({ addon, onChanged, onOpen }: { addon: DirectoryAddon; onChanged: (a: DirectoryAddon) => void; onOpen: () => void }) {
  const isModule = addon.kind === 'MODULE'
  return (
    <div
      onClick={onOpen}
      className="card p-5 space-y-2 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${isModule ? 'bg-emerald-50' : 'bg-amber-50'}`}>{addon.icon || '🧩'}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{addon.name}</span>
              {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{addon.category}</span>}
            </div>
            {addon.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{addon.description}</p>}
          </div>
        </div>
        {isModule ? <ModuleToggle addon={addon} onChanged={onChanged} /> : null}
      </div>
      {!isModule && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-sm font-medium text-slate-700">{priceLabel(addon)}</span>
          <PaidAddonAction addon={addon} onChanged={onChanged} />
        </div>
      )}
    </div>
  )
}

function AddonDetailModal({ addon, onClose, onChanged }: { addon: DirectoryAddon; onClose: () => void; onChanged: (a: DirectoryAddon) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
          aria-label="Close"
        >✕</button>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${addon.kind === 'MODULE' ? 'bg-emerald-50' : 'bg-amber-50'}`}>{addon.icon || '🧩'}</div>
            <div className="min-w-0 pt-1">
              <h2 className="text-xl font-bold text-slate-800">{addon.name}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <KindBadge kind={addon.kind} />
                {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{addon.category}</span>}
              </div>
            </div>
          </div>

          {addon.description && <p className="text-sm text-slate-600 leading-relaxed">{addon.description}</p>}

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {addon.kind === 'ADDON' && <span className="text-base font-semibold text-slate-800">{priceLabel(addon)}</span>}
            <div className={addon.kind === 'MODULE' ? 'w-full flex justify-end' : ''}>
              {addon.kind === 'MODULE'
                ? <ModuleToggle addon={addon} onChanged={onChanged} size="lg" />
                : <PaidAddonAction addon={addon} onChanged={onChanged} size="lg" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddonsContent() {
  const [addons, setAddons] = useState<DirectoryAddon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

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
  const openAddon = addons.find(a => a.addonKey === openKey) ?? null

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">Modules &amp; Add-ons</h1>
          <p className="text-sm text-slate-500 mt-1">Turn free modules on or off yourself. Paid add-ons need a quick approval — request one and we'll follow up to enable it once billing is sorted. Click any card for details.</p>
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
                    {modules.map(a => <AddonCard key={a.addonKey} addon={a} onChanged={handleChanged} onOpen={() => setOpenKey(a.addonKey)} />)}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Paid Add-ons</h2>
                {paidAddons.length === 0 ? (
                  <p className="text-xs text-slate-400">No paid add-ons available yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {paidAddons.map(a => <AddonCard key={a.addonKey} addon={a} onChanged={handleChanged} onOpen={() => setOpenKey(a.addonKey)} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {openAddon && <AddonDetailModal addon={openAddon} onClose={() => setOpenKey(null)} onChanged={handleChanged} />}
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
