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
  versions: Array<{ id: string; version: string }>
}

interface Installation {
  id: string
  extensionId: string
  enabled: boolean
  requestedAt?: string | null
  approvedAt?: string | null
  installedAt?: string | null
  uninstalledAt?: string | null
  updatePolicy: 'MANUAL' | 'NOTIFY' | 'AUTO_APPROVED'
  availableVersionId?: string | null
  installedVersion?: { id: string; version: string }
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
          {directory.length === 0 ? <div className="card p-10 text-center text-sm text-slate-400">No published extensions are available.</div> : directory.map(extension => {
            const installation = installations.find(item => item.extensionId === extension.id)
            const state = installation?.enabled ? 'Active' : installation?.installedAt ? 'Installed' : installation?.approvedAt ? 'Approved' : installation?.requestedAt ? 'Requested' : null
            return (
              <div key={extension.id} className="card p-5 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <h2 className="font-bold text-slate-800 dark:text-slate-100">{extension.name}</h2>
                    <code className="text-[10px] text-slate-400">{extension.key}</code>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{extension.description || 'No description provided.'}</p>
                  <p className="text-[11px] text-slate-400 mt-2">{extension.runtimeType} · Latest v{extension.versions[0]?.version}</p>
                </div>
                {state && installation ? <div className="flex items-center gap-2 flex-wrap"><span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{state}</span>{installation.installedAt && <label className="text-xs text-slate-500">Updates<select disabled={busy === installation.id} value={installation.updatePolicy} onChange={event => updatePolicy(installation.id, event.target.value)} className="input ml-2 py-1 text-xs"><option value="MANUAL">Manual</option><option value="NOTIFY">Notify admins</option><option value="AUTO_APPROVED">Automatic, no new permissions</option></select></label>}{installation.installedAt && <button disabled={busy === installation.id} className="btn-outline btn-sm" onClick={() => submitFeedback(installation)}>{installation.pilotFeedback?.some(feedback => feedback.source === 'SCHOOL_ADMIN') ? 'Update pilot feedback' : 'Pilot feedback'}</button>}{installation.pilotFeedback?.filter(feedback => feedback.source === 'SCHOOL_ADMIN').map(feedback => <span key={feedback.source} className="text-xs text-emerald-600">{feedback.outcome} · {feedback.rating}/5</span>)}{installation.availableVersionId && <span className="text-xs text-amber-600">Update available</span>}</div> : <button disabled={busy === extension.id} className="btn-primary btn-sm" onClick={() => request(extension.id)}>{busy === extension.id ? 'Requesting…' : 'Request extension'}</button>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function AdminExtensionsPage() {
  return <AuthGuard requiredRole="ADMIN"><AdminExtensionsContent /></AuthGuard>
}
