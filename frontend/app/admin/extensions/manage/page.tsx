'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AuthGuard from '../../../../components/AuthGuard'
import Sidebar from '../../../../components/Sidebar'
import { adminNav } from '../../../../lib/admin-nav'
import { apiFetch } from '../../../../lib/api'

interface Installation {
  id: string
  enabled: boolean
  billingStatus: string
  updatePolicy: string
  requestedAt?: string | null
  approvedAt?: string | null
  installedAt?: string | null
  uninstalledAt?: string | null
  availableVersionId?: string | null
  extension: { key: string; name: string; description?: string | null; runtimeType: string; price?: number | null; priceNote?: string | null }
  installedVersion: { version: string }
}

async function json(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`)
  return data
}

function ManageExtensionsContent() {
  const [installations, setInstallations] = useState<Installation[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try { setInstallations(await json(await apiFetch('/api/extensions/installations'))); setError('') }
    catch (loadError: any) { setError(loadError.message || 'Could not load extensions') }
  }

  useEffect(() => { load() }, [])

  async function updatePolicy(id: string, policy: string) {
    setBusy(id)
    try { await json(await apiFetch(`/api/extensions/installations/${id}/update-policy`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }) })); await load() }
    catch (updateError: any) { setError(updateError.message || 'Could not update policy') }
    finally { setBusy('') }
  }

  const query = search.trim().toLowerCase()
  const visible = installations.filter(item => !query || `${item.extension.name} ${item.extension.key} ${item.extension.runtimeType}`.toLowerCase().includes(query))
  const state = (item: Installation) => item.enabled ? 'Active' : item.uninstalledAt ? 'Removed' : item.installedAt ? 'Installed' : item.approvedAt ? 'Approved' : 'Requested'

  return <div className="page-shell"><Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" /><main className="page-content"><div className="h-14 lg:hidden" /><header className="page-header flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Extensions</h1><p className="mt-1 text-sm text-slate-500">Track requests, installations, billing, and update preferences.</p></div><Link href="/admin/extensions" className="btn-primary">Get extensions</Link></header><div className="page-body space-y-5">{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<input type="search" className="input w-full" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search managed extensions" />{visible.length === 0 ? <div className="card p-10 text-center text-sm text-slate-500">No managed extensions found. <Link href="/admin/extensions" className="font-semibold text-blue-600">Browse marketplace</Link></div> : <div className="space-y-4">{visible.map(item => <article key={item.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 font-bold text-white">{item.extension.name.slice(0, 2).toUpperCase()}</div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900 dark:text-white">{item.extension.name}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{state(item)}</span></div><p className="mt-1 text-sm text-slate-500">{item.extension.description || item.extension.key}</p><p className="mt-2 text-xs text-slate-400">v{item.installedVersion.version} · {item.extension.runtimeType.replaceAll('_', ' ')}</p></div></div><span className={`relative h-7 w-12 rounded-full ${item.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} title="Activation is managed by platform admin"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${item.enabled ? 'left-6' : 'left-1'}`} /></span></div><div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 dark:border-slate-800"><label className="text-xs text-slate-500">Update policy<select className="input ml-2 py-1 text-xs" value={item.updatePolicy} disabled={busy === item.id || !item.installedAt} onChange={event => updatePolicy(item.id, event.target.value)}><option value="MANUAL">Manual</option><option value="NOTIFY">Notify admins</option><option value="AUTO_APPROVED">Automatic</option></select></label>{item.extension.price != null && item.extension.price > 0 && <span className="text-xs text-amber-600">${item.extension.price}{item.extension.priceNote ? ` ${item.extension.priceNote}` : ''} · Billing {item.billingStatus.toLowerCase()}</span>}{item.availableVersionId && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Update available</span>}<span className="ml-auto text-xs text-slate-400">Activation and billing controlled by platform admin</span></div></article>)}</div>}</div></main></div>
}

export default function ManageExtensionsPage() { return <AuthGuard requiredRole="ADMIN"><ManageExtensionsContent /></AuthGuard> }
