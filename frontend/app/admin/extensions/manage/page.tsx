'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AuthGuard from '../../../../components/AuthGuard'
import Sidebar from '../../../../components/Sidebar'
import { adminNav } from '../../../../lib/admin-nav'
import { apiCursorItems, apiFetch, waitForLifecycleJob } from '../../../../lib/api'

interface Installation {
  id: string
  enabled: boolean
  billingStatus: string
  lifecycleState?: 'REQUESTED' | 'PAYMENT_REVIEW' | 'APPROVED' | 'INSTALLED' | 'ACTIVE' | 'UNINSTALLED'
  updatePolicy: string
  requestedAt?: string | null
  approvedAt?: string | null
  installedAt?: string | null
  uninstalledAt?: string | null
  availableVersionId?: string | null
  requestPricingModel?: 'FREE' | 'ONE_TIME' | 'SUBSCRIPTION' | 'PRIVATE_CONTRACT' | null
  requestPriceMinor?: number | null
  requestCurrency?: string | null
  requestBillingInterval?: 'MONTHLY' | 'YEARLY' | null
  requestContractReference?: string | null
  requestPriceNote?: string | null
  extension: {
    key: string
    name: string
    description?: string | null
    runtimeType: string
    price?: number | null
    priceNote?: string | null
  }
  installedVersion: { version: string }
}
interface PilotCriterion { key: string; label: string }

function requestPricingLabel(item: Installation) {
  if (!item.requestPricingModel || item.requestPricingModel === 'FREE') return null
  if (item.requestPricingModel === 'PRIVATE_CONTRACT') {
    return `Private contract${item.requestContractReference ? ` · ${item.requestContractReference}` : ''}`
  }
  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: item.requestCurrency || 'USD',
  }).format((item.requestPriceMinor || 0) / 100)
  return item.requestPricingModel === 'SUBSCRIPTION'
    ? `${amount} / ${item.requestBillingInterval?.toLowerCase() || 'billing period'}`
    : `${amount} one-time`
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
  const [criteria, setCriteria] = useState<PilotCriterion[]>([])

  async function load() {
    try {
      const [items, pilotCriteria] = await Promise.all([
        apiCursorItems<Installation>('/api/extensions/installations'),
        json(await apiFetch('/api/extensions/pilot-criteria')),
      ])
      setInstallations(items)
      setCriteria(pilotCriteria)
      setError('')
    } catch (loadError: any) {
      setError(loadError.message || 'Could not load extensions')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function updatePolicy(id: string, policy: string) {
    setBusy(id)
    try {
      await json(await apiFetch(`/api/extensions/installations/${id}/update-policy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      }))
      await load()
    } catch (updateError: any) {
      setError(updateError.message || 'Could not update policy')
    } finally {
      setBusy('')
    }
  }

  async function removeExtension(item: Installation) {
    const confirmed = window.confirm(
      `Permanently remove ${item.extension.name} from this school's extension history? Any remaining extension data will be deleted.`,
    )
    if (!confirmed) return

    setBusy(item.id)
    try {
      const job = await json(await apiFetch(`/api/extensions/installations/${item.id}`, { method: 'DELETE' }))
      if (job?.id && job?.command && job?.status) await waitForLifecycleJob(`/api/extensions/jobs/${job.id}`)
      await load()
    } catch (removeError: any) {
      setError(removeError.message || 'Could not remove extension')
    } finally {
      setBusy('')
    }
  }

  async function submitFeedback(item: Installation) {
    const checklist = Object.fromEntries(criteria.map(criterion => [criterion.key, window.confirm(`Pilot acceptance:\n\n${criterion.label}\n\nDid this criterion pass?`)]))
    const accepted = criteria.every(criterion => checklist[criterion.key])
    const rating = Number(window.prompt('Rate this pilot from 1 to 5:', accepted ? '5' : '3'))
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return setError('Pilot rating must be an integer from 1 to 5.')
    const comments = window.prompt(accepted ? 'Optional pilot comments:' : 'Describe what needs work:') || ''
    if (!accepted && !comments.trim()) return setError('Comments are required when criteria need work.')
    setBusy(item.id)
    try {
      await json(await apiFetch(`/api/extensions/installations/${item.id}/pilot-feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: accepted ? 'ACCEPTED' : 'NEEDS_WORK', rating, checklist, comments }),
      }))
      await load()
    } catch (feedbackError: any) {
      setError(feedbackError.message || 'Could not submit pilot feedback')
    } finally {
      setBusy('')
    }
  }

  const query = search.trim().toLowerCase()
  const visible = installations.filter(item =>
    !query || `${item.extension.name} ${item.extension.key} ${item.extension.runtimeType}`.toLowerCase().includes(query),
  )
  const state = (item: Installation) => {
    const lifecycleState = item.lifecycleState || (item.uninstalledAt ? 'UNINSTALLED' : item.enabled ? 'ACTIVE' : item.installedAt ? 'INSTALLED' : item.approvedAt ? 'APPROVED' : 'REQUESTED')
    return lifecycleState === 'PAYMENT_REVIEW'
    ? 'Payment review'
    : lifecycleState === 'UNINSTALLED'
      ? 'Removed'
      : lifecycleState.charAt(0) + lifecycleState.slice(1).toLowerCase()
  }

  return (
    <div className="page-shell">
      <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" />
      <main className="page-content">
        <div className="h-14 lg:hidden" />
        <header className="page-header flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Extensions</h1>
            <p className="mt-1 text-sm text-slate-500">Track requests, installations, billing, and update preferences.</p>
          </div>
          <Link href="/admin/extensions" className="btn-primary">Get extensions</Link>
        </header>

        <div className="page-body space-y-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <input
            type="search"
            className="input w-full"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search managed extensions"
          />

          {visible.length === 0 ? (
            <div className="card p-10 text-center text-sm text-slate-500">
              No managed extensions found.{' '}
              <Link href="/admin/extensions" className="font-semibold text-blue-600">Browse marketplace</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map(item => (
                <article key={item.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 font-bold text-white">
                        {item.extension.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-bold text-slate-900 dark:text-white">{item.extension.name}</h2>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {state(item)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{item.extension.description || item.extension.key}</p>
                        <p className="mt-2 text-xs text-slate-400">
                          v{item.installedVersion.version} · {item.extension.runtimeType.replaceAll('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <span className={`relative h-7 w-12 rounded-full ${item.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} title="Activation is managed by platform admin">
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${item.enabled ? 'left-6' : 'left-1'}`} />
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <label className="text-xs text-slate-500">
                      Update policy
                      <select
                        className="input ml-2 py-1 text-xs"
                        value={item.updatePolicy}
                        disabled={busy === item.id || !item.installedAt || Boolean(item.uninstalledAt)}
                        onChange={event => updatePolicy(item.id, event.target.value)}
                      >
                        <option value="MANUAL">Manual</option>
                        <option value="NOTIFY">Notify admins</option>
                        <option value="AUTO_APPROVED">Automatic</option>
                      </select>
                    </label>
                    {requestPricingLabel(item) && (
                      <span className="text-xs text-amber-600">
                        {requestPricingLabel(item)}{item.requestPriceNote ? ` · ${item.requestPriceNote}` : ''} · Billing {item.billingStatus.toLowerCase()}
                      </span>
                    )}
                    {item.availableVersionId && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Update available</span>
                    )}
                    {item.installedAt && !item.uninstalledAt && <button type="button" className="btn-outline btn-sm" disabled={busy === item.id} onClick={() => submitFeedback(item)}>Pilot feedback</button>}
                    {item.uninstalledAt ? (
                      <button
                        type="button"
                        className="ml-auto rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        disabled={busy === item.id}
                        onClick={() => removeExtension(item)}
                      >
                        {busy === item.id ? 'Removing…' : 'Remove permanently'}
                      </button>
                    ) : (
                      <span className="ml-auto text-xs text-slate-400">Activation and billing controlled by platform admin</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ManageExtensionsPage() {
  return <AuthGuard requiredRole="ADMIN"><ManageExtensionsContent /></AuthGuard>
}
