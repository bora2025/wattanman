'use client'

import { useEffect, useState } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

interface DirectoryExtension {
  id: string
  key: string
  name: string
  description?: string | null
  runtimeType: string
  commercialType: string
  price?: number | null
  priceNote?: string | null
  versions: Array<{ id: string; version: string }>
}

interface Installation {
  id: string
  extensionId: string
  enabled: boolean
  billingStatus: string
  requestedAt?: string | null
  approvedAt?: string | null
  installedAt?: string | null
  uninstalledAt?: string | null
  updatePolicy: 'MANUAL' | 'NOTIFY' | 'AUTO_APPROVED'
  availableVersionId?: string | null
  installedVersion?: { id: string; version: string }
  extension?: DirectoryExtension
  pilotFeedback?: Array<{ source: string; outcome: string; rating: number }>
}

interface PilotCriterion { key: string; label: string }

async function json(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

function AdminExtensionsContent() {
  const [directory, setDirectory] = useState<DirectoryExtension[]>([])
  const [installations, setInstallations] = useState<Installation[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [criteria, setCriteria] = useState<PilotCriterion[]>([])

  async function load() {
    try {
      const [available, installed, pilotCriteria] = await Promise.all([
        json(await apiFetch('/api/extensions/directory')),
        json(await apiFetch('/api/extensions/installations')),
        json(await apiFetch('/api/extensions/pilot-criteria')),
      ])
      setDirectory(available)
      setInstallations(installed)
      setCriteria(pilotCriteria)
      setError('')
    } catch (loadError: any) {
      setError(loadError.message || 'Failed to load extension directory')
    }
  }

  async function submitFeedback(installation: Installation) {
    const checklist = Object.fromEntries(criteria.map(criterion => [criterion.key, window.confirm(`Pilot acceptance:\n\n${criterion.label}\n\nDid this criterion pass?`)]))
    const accepted = criteria.every(criterion => checklist[criterion.key])
    const rating = Number(window.prompt('Rate this pilot from 1 to 5:', accepted ? '5' : '3'))
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return setError('Pilot rating must be an integer from 1 to 5.')
    const comments = window.prompt(accepted ? 'Optional pilot comments:' : 'Describe what needs work:') || ''
    if (!accepted && !comments.trim()) return setError('Comments are required when criteria need work.')
    setBusy(installation.id)
    try {
      await json(await apiFetch(`/api/extensions/installations/${installation.id}/pilot-feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: accepted ? 'ACCEPTED' : 'NEEDS_WORK', rating, checklist, comments }),
      }))
      await load()
    } catch (feedbackError: any) {
      setError(feedbackError.message || 'Could not submit pilot feedback')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => { load() }, [])

  async function request(extensionId: string) {
    setBusy(extensionId)
    try {
      await json(await apiFetch(`/api/extensions/${extensionId}/request`, { method: 'POST' }))
      await load()
    } catch (requestError: any) {
      setError(requestError.message || 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  async function updatePolicy(installationId: string, policy: string) {
    setBusy(installationId)
    try {
      await json(await apiFetch(`/api/extensions/installations/${installationId}/update-policy`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }),
      }))
      await load()
    } catch (policyError: any) {
      setError(policyError.message || 'Could not update policy')
    } finally {
      setBusy(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredDirectory = directory.filter(extension =>
    !normalizedSearch ||
    `${extension.name} ${extension.key} ${extension.description || ''} ${extension.runtimeType} ${extension.commercialType}`
      .toLowerCase()
      .includes(normalizedSearch)
  )
  const installedExtensions = filteredDirectory.filter(extension =>
    installations.some(item => item.extensionId === extension.id)
  )
  const availableExtensions = filteredDirectory.filter(extension =>
    !installations.some(item => item.extensionId === extension.id)
  )

  function extensionState(installation?: Installation) {
    if (!installation) return null
    if (installation.enabled) return 'Active'
    if (installation.uninstalledAt) return 'Removed'
    if (installation.installedAt) return 'Installed'
    if (installation.approvedAt) return 'Approved'
    return 'Requested'
  }

  function ExtensionRow({ extension }: { extension: DirectoryExtension }) {
    const installation = installations.find(item => item.extensionId === extension.id)
    const state = extensionState(installation)
    const isPaid = extension.price != null && extension.price > 0
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-violet-700">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 text-lg font-bold text-white shadow-sm">
              {extension.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-slate-800 dark:text-slate-100">{extension.name}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">{extension.runtimeType.replaceAll('_', ' ')}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isPaid ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
                  {isPaid ? `$${extension.price}${extension.priceNote ? ` ${extension.priceNote}` : ''}` : 'Free'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{extension.description || 'No description provided.'}</p>
              <p className="mt-2 text-[11px] text-slate-400"><code>{extension.key}</code> · Latest v{extension.versions[0]?.version}</p>
              {isPaid && installation && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Billing: {installation.billingStatus.toLowerCase()} · Managed by platform admin</p>}
            </div>
          </div>
          {installation ? (
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">{state}</span>
              <span title="Activation is managed by the platform admin" className={`relative h-7 w-12 rounded-full transition ${installation.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${installation.enabled ? 'left-6' : 'left-1'}`} />
              </span>
            </div>
          ) : (
            <button disabled={busy === extension.id} className="btn-primary btn-sm shrink-0" onClick={() => request(extension.id)}>{busy === extension.id ? 'Requesting…' : isPaid ? 'Request purchase' : 'Request extension'}</button>
          )}
        </div>
        {installation?.installedAt && <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><label className="text-xs text-slate-500">Updates<select disabled={busy === installation.id} value={installation.updatePolicy} onChange={event => updatePolicy(installation.id, event.target.value)} className="input ml-2 py-1 text-xs"><option value="MANUAL">Manual</option><option value="NOTIFY">Notify admins</option><option value="AUTO_APPROVED">Automatic, no new permissions</option></select></label><button disabled={busy === installation.id} className="btn-outline btn-sm" onClick={() => submitFeedback(installation)}>{installation.pilotFeedback?.some(feedback => feedback.source === 'SCHOOL_ADMIN') ? 'Update feedback' : 'Pilot feedback'}</button>{installation.availableVersionId && <span className="text-xs font-medium text-amber-600">Update available</span>}</div>}
      </article>
    )
  }

  return (
    <div className="page-shell">
      <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Extension Directory</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Request Wattaman-reviewed modules and themes for this school.</p>
        </div>
        <div className="page-body space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <div className="card p-4">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Search extensions
              <input
                type="search"
                className="input mt-1 w-full"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search name, key, type, or description"
                aria-label="Search extensions"
              />
            </label>
          </div>
          {directory.length === 0 ? <div className="card p-10 text-center text-sm text-slate-400">No published extensions are available.</div> : filteredDirectory.length === 0 ? <div className="card p-10 text-center text-sm text-slate-400">No extensions match your search.</div> : <>
            {installedExtensions.length > 0 && <section className="space-y-3"><div><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Installed extensions</h2><p className="text-xs text-slate-500">Activation and paid billing are controlled by the platform administrator.</p></div>{installedExtensions.map(extension => <ExtensionRow key={extension.id} extension={extension} />)}</section>}
            {availableExtensions.length > 0 && <section className="space-y-3"><div><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Available extensions</h2><p className="text-xs text-slate-500">Request reviewed modules and themes for your school.</p></div>{availableExtensions.map(extension => <ExtensionRow key={extension.id} extension={extension} />)}</section>}
          </>}
        </div>
      </div>
    </div>
  )
}

export default function AdminExtensionsPage() {
  return <AuthGuard requiredRole="ADMIN"><AdminExtensionsContent /></AuthGuard>
}
