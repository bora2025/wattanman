"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { IconSun, IconMoon } from '../../../components/Icons'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useTheme } from '../../../lib/theme'

interface DirectoryAddon {
  addonKey: string
  kind: string
  name: string
  description: string | null
  detailDescription: string | null
  screenshotUrl: string | null
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
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
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
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">✓ Enabled</span>
      ) : addon.requested ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">Requested — pending approval</span>
          <button onClick={cancel} disabled={busy} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50">
            {busy ? '…' : 'Cancel'}
          </button>
        </div>
      ) : (
        <button onClick={request} disabled={busy} className={`${btnClass} disabled:opacity-50`}>
          {busy ? 'Requesting…' : 'Request this add-on'}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
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
              <span className="font-semibold text-slate-800 dark:text-slate-100">{addon.name}</span>
              {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900">{addon.category}</span>}
            </div>
            {addon.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{addon.description}</p>}
          </div>
        </div>
        {isModule ? <ModuleToggle addon={addon} onChanged={onChanged} /> : null}
      </div>
      {!isModule && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{priceLabel(addon)}</span>
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
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400"
          aria-label="Close"
        >✕</button>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${addon.kind === 'MODULE' ? 'bg-emerald-50' : 'bg-amber-50'}`}>{addon.icon || '🧩'}</div>
            <div className="min-w-0 pt-1">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{addon.name}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <KindBadge kind={addon.kind} />
                {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900">{addon.category}</span>}
              </div>
            </div>
          </div>

          {addon.screenshotUrl && (
            <img
              src={addon.screenshotUrl}
              alt={`${addon.name} screenshot`}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 object-contain max-h-64 bg-slate-50 dark:bg-slate-800"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}

          {(addon.detailDescription || addon.description) && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{addon.detailDescription || addon.description}</p>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            {addon.kind === 'ADDON' && <span className="text-base font-semibold text-slate-800 dark:text-slate-100">{priceLabel(addon)}</span>}
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

function AppearanceTab() {
  const { theme, setTheme } = useTheme()

  const options: { id: 'light' | 'dark'; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <IconSun size={22} /> },
    { id: 'dark', label: 'Dark', icon: <IconMoon size={22} /> },
  ]

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Dashboard theme</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          This only changes how your own dashboard looks on this device — other staff at your school pick their own,
          and it's separate from your school's public website branding (under Appearance in the sidebar).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => setTheme(o.id)}
            className={`card p-5 flex flex-col items-center gap-2 transition-all ${
              theme === o.id
                ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40'
                : 'hover:border-indigo-200 dark:hover:border-slate-600'
            }`}
          >
            <span className="text-slate-700 dark:text-slate-200">{o.icon}</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</span>
            {theme === o.id && <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Active</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

type PageTab = 'addons' | 'appearance'

function AddonsContent() {
  const [addons, setAddons] = useState<DirectoryAddon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<PageTab>('addons')

  const tabs: { id: PageTab; label: string }[] = [
    { id: 'addons', label: 'Modules & Add-ons' },
    { id: 'appearance', label: 'Appearance' },
  ]

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
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Modules &amp; Add-ons</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Turn free modules on or off yourself. Paid add-ons need a quick approval — request one and we'll follow up to enable it once billing is sorted. Click any card for details.</p>

          <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit mt-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="page-body space-y-6">
          {activeTab === 'appearance' ? (
            <AppearanceTab />
          ) : (
          <>
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-indigo-100 dark:border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : addons.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No modules or add-ons available yet — check back later.</div>
          ) : (
            <>
              <div>
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Modules</h2>
                {modules.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No modules in the catalog yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {modules.map(a => <AddonCard key={a.addonKey} addon={a} onChanged={handleChanged} onOpen={() => setOpenKey(a.addonKey)} />)}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Paid Add-ons</h2>
                {paidAddons.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No paid add-ons available yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {paidAddons.map(a => <AddonCard key={a.addonKey} addon={a} onChanged={handleChanged} onOpen={() => setOpenKey(a.addonKey)} />)}
                  </div>
                )}
              </div>
            </>
          )}
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
