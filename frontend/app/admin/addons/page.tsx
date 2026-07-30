"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

interface DirectoryAddon {
  addonKey: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  price: number | null
  priceNote: string | null
  enabled: boolean
}

function priceLabel(a: DirectoryAddon): string {
  if (a.price == null) return 'Contact us for pricing'
  return `$${a.price}${a.priceNote ? ` ${a.priceNote}` : ''}`
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

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">Add-ons</h1>
          <p className="text-sm text-slate-500 mt-1">Optional paid features for your school. Billing is handled directly with Wattaman — contact us to enable one.</p>
        </div>

        <div className="page-body space-y-3">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : addons.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm">No add-ons available yet — check back later.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {addons.map(a => (
                <div key={a.addonKey} className="card p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0">{a.icon || '🧩'}</div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{a.name}</span>
                          {a.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{a.category}</span>}
                        </div>
                        {a.description && <p className="text-xs text-slate-500 mt-1">{a.description}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-sm font-medium text-slate-700">{priceLabel(a)}</span>
                    {a.enabled ? (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">✓ Enabled</span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-slate-50 text-slate-500 border-slate-200">Not enabled</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
