'use client'

import { FormEvent, useEffect, useState } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { apiFetch } from '../../../lib/api'
import { buildThemePreviewDocument } from '../../../lib/themePreviewDocument'
import { platformNav } from '../../../lib/platform-nav'

interface ValidationReport {
  id: string
  status: string
  errors: Array<{ code: string; path?: string; message: string }> | null
  warnings: Array<{ code: string; path?: string; message: string }> | null
  startedAt: string
  completedAt?: string | null
}

interface ExtensionVersion {
  id: string
  version: string
  lifecycleStatus: string
  packageChecksum?: string | null
  packageSize?: number | null
  reviewNotes?: string | null
  createdAt: string
  compatibilityRange?: string | null
  releaseNotes?: string | null
}

interface ReviewSummary {
  compatibilityRange?: string | null
  previousVersion?: string | null
  permissions: { requested: string[]; added: string[]; removed: string[] }
  warnings: string[]
}

interface ReviewEvent {
  id: string
  action: string
  notes?: string | null
  actorRole?: string | null
  createdAt: string
}

interface ExtensionRecord {
  id: string
  key: string
  name: string
  runtimeType: string
  commercialType: string
  visibility: 'LISTED' | 'UNLISTED' | 'PRIVATE'
  versions: ExtensionVersion[]
}

interface InstallationRecord {
  id: string
  enabled: boolean
  requestedAt?: string | null
  approvedAt?: string | null
  installedAt?: string | null
  uninstalledAt?: string | null
  purgeAfter?: string | null
  configuration?: { rollbackVersionId?: string } | null
  school: { id: string; name: string; subdomain: string }
  extension: { id: string; key: string; name: string; versions: Array<{ id: string; version: string }> }
  installedVersion: { id: string; version: string; lifecycleStatus: string }
  pilotFeedback?: Array<{ source: string; outcome: string; rating: number; comments?: string | null }>
}

interface PublisherRecord {
  id: string
  key: string
  name: string
  status: string
  internal: boolean
  _count: { extensions: number }
  signingKeys: Array<{ id: string; keyId: string; algorithm: string; status: string; createdAt: string }>
}

interface ExtensionAlert {
  id: string
  type: string
  severity: string
  status: string
  message: string
  occurrences: number
  lastSeenAt: string
}

async function responseJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

function VersionPanel({ extension, version, reload }: { extension: ExtensionRecord; version: ExtensionVersion; reload: () => Promise<void> }) {
  const [reports, setReports] = useState<ValidationReport[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ manifest: any; css: string; compatibilityRange?: string | null; platformVersion: string; platformCompatible: boolean; warnings: Array<{ code: string; message: string }> } | null>(null)
  const [review, setReview] = useState<ReviewSummary | null>(null)
  const [reviewHistory, setReviewHistory] = useState<ReviewEvent[]>([])

  useEffect(() => {
    apiFetch(`/api/platform/extensions/versions/${version.id}/validations`)
      .then(responseJson)
      .then(setReports)
      .catch(() => setReports([]))
  }, [version.id, version.lifecycleStatus])

  useEffect(() => {
    apiFetch(`/api/platform/extensions/versions/${version.id}/reviews`)
      .then(responseJson)
      .then(setReviewHistory)
      .catch(() => setReviewHistory([]))
  }, [version.id, version.lifecycleStatus])

  useEffect(() => {
    if (!['AWAITING_REVIEW', 'APPROVED'].includes(version.lifecycleStatus)) {
      setReview(null)
      return
    }
    apiFetch(`/api/platform/extensions/versions/${version.id}/review`)
      .then(responseJson)
      .then(setReview)
      .catch(() => setReview(null))
  }, [version.id, version.lifecycleStatus])

  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      await responseJson(await apiFetch(`/api/platform/extensions/versions/${version.id}/package`, { method: 'POST', body }))
      await reload()
    } catch (uploadError: any) {
      setError(uploadError.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function transition(status: string) {
    const needsNotes = status === 'APPROVED' || status === 'REJECTED'
    const reviewNotes = needsNotes ? window.prompt(`${status === 'APPROVED' ? 'Approval' : 'Rejection'} notes`) : undefined
    if (needsNotes && !reviewNotes) return
    setBusy(true)
    setError('')
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/versions/${version.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewNotes }),
      }))
      await reload()
    } catch (transitionError: any) {
      setError(transitionError.message || 'Transition failed')
    } finally {
      setBusy(false)
    }
  }

  async function openPreview() {
    setBusy(true)
    setError('')
    try {
      setPreview(await responseJson(await apiFetch(`/api/platform/extensions/versions/${version.id}/preview`)))
    } catch (previewError: any) {
      setError(previewError.message || 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  async function appeal() {
    const notes = window.prompt('Explain what changed and why this version should be reviewed again')
    if (!notes) return
    setBusy(true)
    setError('')
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/versions/${version.id}/appeal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
      }))
      await reload()
    } catch (appealError: any) {
      setError(appealError.message || 'Appeal failed')
    } finally {
      setBusy(false)
    }
  }

  const nextActions: Record<string, Array<{ status: string; label: string }>> = {
    VALIDATED: [{ status: 'AWAITING_REVIEW', label: 'Send to review' }],
    AWAITING_REVIEW: [{ status: 'APPROVED', label: 'Approve' }, { status: 'REJECTED', label: 'Reject' }],
    APPROVED: [{ status: 'PUBLISHED', label: 'Publish' }],
    PUBLISHED: [{ status: 'DEPRECATED', label: 'Deprecate' }, { status: 'BLOCKED', label: 'Emergency block' }],
    DEPRECATED: [{ status: 'BLOCKED', label: 'Block' }, { status: 'RETIRED', label: 'Retire' }],
    BLOCKED: [{ status: 'DEPRECATED', label: 'Unblock as deprecated' }, { status: 'RETIRED', label: 'Retire' }],
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="font-semibold text-slate-800 dark:text-slate-100">v{version.version}</span>
          <span className="ml-2 text-[11px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">{version.lifecycleStatus}</span>
          {version.packageChecksum && <p className="text-[10px] text-slate-400 mt-1 font-mono">SHA-256 {version.packageChecksum}</p>}
          <p className="text-[11px] text-slate-500 mt-1">Platform {version.compatibilityRange || 'compatibility not set'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {version.lifecycleStatus === 'UPLOADED' && (
            <label className="btn-primary btn-sm cursor-pointer">
              {busy ? 'Uploading…' : 'Upload ZIP'}
              <input type="file" accept=".zip" className="hidden" disabled={busy} onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) upload(file)
                event.target.value = ''
              }} />
            </label>
          )}
          {(nextActions[version.lifecycleStatus] || []).map(action => (
            <button key={action.status} disabled={busy} onClick={() => transition(action.status)} className="btn-outline btn-sm">
              {action.label}
            </button>
          ))}
          {version.lifecycleStatus === 'REJECTED' && <button disabled={busy} onClick={appeal} className="btn-outline btn-sm">Appeal</button>}
          {extension.runtimeType === 'THEME' && ['VALIDATED', 'AWAITING_REVIEW', 'APPROVED', 'PUBLISHED', 'DEPRECATED'].includes(version.lifecycleStatus) && <button disabled={busy} onClick={openPreview} className="btn-outline btn-sm">Preview</button>}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {version.releaseNotes && <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-xs"><p className="font-semibold">Release notes</p><p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{version.releaseNotes}</p></div>}
      {review && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 space-y-1">
        <p className="font-semibold">Permission and compatibility review</p>
        <p>Compatibility: {review.compatibilityRange || 'Not declared'} · Previous: {review.previousVersion ? `v${review.previousVersion}` : 'First release'}</p>
        <p>Requested: {review.permissions.requested.join(', ') || 'None'}</p>
        {review.permissions.added.length > 0 && <p className="text-amber-700 dark:text-amber-300">New permissions: {review.permissions.added.join(', ')}</p>}
        {review.permissions.removed.length > 0 && <p>Removed permissions: {review.permissions.removed.join(', ')}</p>}
        {review.warnings.map(warning => <p key={warning} className="text-amber-700 dark:text-amber-300">Warning: {warning}</p>)}
      </div>}
      {reviewHistory.length > 0 && <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-2"><p className="font-semibold">Review history</p>{reviewHistory.map(event => <div key={event.id} className="flex justify-between gap-3"><span>{event.action}{event.notes ? ` · ${event.notes}` : ''}</span><span className="text-slate-400 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</span></div>)}</div>}
      {reports.map(report => (
        <div key={report.id} className={`rounded-lg p-3 text-xs border ${report.status === 'PASSED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300' : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300'}`}>
          <p className="font-semibold">Validation {report.status}</p>
          {(report.errors || []).map((validationError, index) => <p key={`${validationError.code}-${index}`}>{validationError.code}{validationError.path ? ` · ${validationError.path}` : ''}: {validationError.message}</p>)}
          {(report.warnings || []).map((warning, index) => <p key={`${warning.code}-${index}`}>Warning {warning.code}: {warning.message}</p>)}
        </div>
      ))}
      {preview && <ThemePreview preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function ThemePreview({ preview, onClose }: { preview: { manifest: any; css: string; compatibilityRange?: string | null; platformVersion: string; platformCompatible: boolean; warnings: Array<{ code: string; message: string }> }; onClose: () => void }) {
  const { manifest, css } = preview
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>(manifest.mode === 'dark' ? 'dark' : 'light')
  const [surface, setSurface] = useState<'dashboard' | 'public'>('dashboard')
  const documentHtml = buildThemePreviewDocument(manifest, css, previewMode, surface)
  return <div className="fixed inset-0 z-[100] bg-black/60 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700"><div><h3 className="font-bold text-slate-800 dark:text-slate-100">Isolated theme preview</h3><p className="text-xs text-slate-500">Sandboxed iframe; package CSS cannot affect Platform UI.</p><p className={`text-xs ${preview.platformCompatible ? 'text-emerald-600' : 'text-red-600'}`}>Platform {preview.platformVersion} · {preview.compatibilityRange || 'No range'} · {preview.platformCompatible ? 'Compatible' : 'Not compatible'}</p>{preview.warnings?.map(warning => <p key={warning.code} className="text-xs text-amber-600">{warning.code}: {warning.message}</p>)}</div><div className="flex gap-2 flex-wrap"><button onClick={() => setSurface('dashboard')} className="btn-outline btn-sm">Dashboard</button><button onClick={() => setSurface('public')} className="btn-outline btn-sm">Public site</button><button onClick={() => setPreviewMode('light')} className="btn-outline btn-sm">Light</button><button onClick={() => setPreviewMode('dark')} className="btn-outline btn-sm">Dark</button><button onClick={onClose} className="btn-outline btn-sm">Close</button></div></div>
      <iframe title="Theme preview" sandbox="" srcDoc={documentHtml} className="w-full h-[70vh] border-0" />
    </div>
  </div>
}

function ExtensionCard({ extension, reload }: { extension: ExtensionRecord; reload: () => Promise<void> }) {
  const [version, setVersion] = useState('1.0.0')
  const [compatibilityRange, setCompatibilityRange] = useState('>=1.0.0 <2.0.0')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function addVersion(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/${extension.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version,
          manifest: { schemaVersion: 1, key: extension.key, name: extension.name, version, runtimeType: extension.runtimeType },
          compatibilityRange,
          releaseNotes,
        }),
      }))
      await reload()
    } catch (versionError: any) {
      setError(versionError.message || 'Could not create version')
    } finally {
      setBusy(false)
    }
  }

  async function setVisibility(visibility: string) {
    setBusy(true)
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/${extension.id}/visibility`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility }),
      }))
      await reload()
    } catch (visibilityError: any) {
      setError(visibilityError.message || 'Could not update visibility')
    } finally {
      setBusy(false)
    }
  }

  async function grantPrivateSchool() {
    const schoolId = window.prompt('School ID to grant private access')
    if (!schoolId) return
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/${extension.id}/private-schools/${schoolId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ granted: true }),
      }))
      await reload()
    } catch (grantError: any) {
      setError(grantError.message || 'Could not grant private access')
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{extension.name}</h2>
          <code className="text-[10px] text-slate-400">{extension.key}</code>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{extension.runtimeType} · {extension.commercialType} · {extension.visibility}</p>
        <div className="flex gap-2 mt-2"><select className="input py-1 text-xs" value={extension.visibility} disabled={busy} onChange={event => setVisibility(event.target.value)}><option value="LISTED">Listed</option><option value="UNLISTED">Unlisted</option><option value="PRIVATE">Private</option></select>{extension.visibility === 'PRIVATE' && <button type="button" className="btn-outline btn-sm" onClick={grantPrivateSchool}>Grant school</button>}</div>
      </div>
      <form onSubmit={addVersion} className="flex gap-2 items-end flex-wrap">
        <label className="text-xs text-slate-600 dark:text-slate-300">New version
          <input value={version} onChange={event => setVersion(event.target.value)} className="input mt-1 w-32" required />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">Platform range<input value={compatibilityRange} onChange={event => setCompatibilityRange(event.target.value)} className="input mt-1 w-44" required /></label>
        <label className="text-xs text-slate-600 dark:text-slate-300 flex-1 min-w-56">Release notes<input value={releaseNotes} onChange={event => setReleaseNotes(event.target.value)} className="input mt-1 w-full" required /></label>
        <button className="btn-outline btn-sm" disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button>
      </form>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="space-y-3">
        {extension.versions.length ? extension.versions.map(item => <VersionPanel key={item.id} extension={extension} version={item} reload={reload} />) : <p className="text-xs text-slate-400">No versions yet.</p>}
      </div>
    </div>
  )
}

function InstallationCard({ installation, reload }: { installation: InstallationRecord; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const newestVersion = installation.extension.versions[0]

  async function action(path: string, options: RequestInit = { method: 'POST' }) {
    setBusy(true)
    setError('')
    try {
      await responseJson(await apiFetch(`/api/platform/extension-installations/${installation.id}/${path}`, options))
      await reload()
    } catch (actionError: any) {
      setError(actionError.message || 'Installation action failed')
    } finally {
      setBusy(false)
    }
  }

  async function upgrade() {
    if (!newestVersion) return
    setBusy(true)
    setError('')
    try {
      if (!await confirmDependencies(newestVersion.id)) return
      const review = await responseJson(await apiFetch(`/api/platform/extension-installations/${installation.id}/upgrades/${newestVersion.id}/review`))
      const added = review.permissions?.added || []
      const message = added.length
        ? `This upgrade requests new permissions:\n\n${added.join('\n')}\n\nApprove these permissions and continue?`
        : `Upgrade ${installation.extension.name} from v${review.fromVersion} to v${review.toVersion}?`
      if (!window.confirm(message)) return
      await responseJson(await apiFetch(`/api/platform/extension-installations/${installation.id}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: newestVersion.id, acknowledgePermissions: added.length > 0 }),
      }))
      await reload()
    } catch (upgradeError: any) {
      setError(upgradeError.message || 'Upgrade failed')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDependencies(versionId: string) {
    const review = await responseJson(await apiFetch(`/api/platform/extension-installations/${installation.id}/dependencies/${versionId}/review`))
    const requiredBlockers = (review.dependencies || []).filter((dependency: any) => !dependency.optional && dependency.status !== 'SATISFIED')
    if (requiredBlockers.length || review.conflicts?.length) {
      setError([
        ...requiredBlockers.map((dependency: any) => `${dependency.key}: ${dependency.status}`),
        ...(review.conflicts || []).map((key: string) => `${key}: CONFLICT`),
      ].join(' · '))
      return false
    }
    const optional = (review.dependencies || []).filter((dependency: any) => dependency.optional && dependency.status !== 'SATISFIED')
    return !optional.length || window.confirm(`Optional dependencies are unavailable: ${optional.map((dependency: any) => dependency.key).join(', ')}. Continue?`)
  }

  async function install() {
    try {
      if (!await confirmDependencies(installation.installedVersion.id)) return
      await action('install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: installation.installedVersion.id }) })
    } catch (installError: any) {
      setError(installError.message || 'Dependency review failed')
    }
  }

  async function submitPilotFeedback() {
    setBusy(true)
    setError('')
    try {
      const criteria: Array<{ key: string; label: string }> = await responseJson(await apiFetch('/api/platform/extension-installations/pilot-criteria'))
      const checklist = Object.fromEntries(criteria.map(criterion => [criterion.key, window.confirm(`Operator pilot check:\n\n${criterion.label}\n\nDid this criterion pass?`)]))
      const accepted = criteria.every(criterion => checklist[criterion.key])
      const rating = Number(window.prompt('Rate operator confidence from 1 to 5:', accepted ? '5' : '3'))
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Pilot rating must be an integer from 1 to 5.')
      const comments = window.prompt(accepted ? 'Optional operator comments:' : 'Describe the operational blocker:') || ''
      if (!accepted && !comments.trim()) throw new Error('Comments are required when criteria need work.')
      await responseJson(await apiFetch(`/api/platform/extension-installations/${installation.id}/pilot-feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: accepted ? 'ACCEPTED' : 'NEEDS_WORK', rating, checklist, comments }),
      }))
      await reload()
    } catch (feedbackError: any) {
      setError(feedbackError.message || 'Could not submit operator pilot feedback')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p className="font-semibold text-slate-800 dark:text-slate-100">{installation.extension.name} <span className="text-slate-400 font-normal">for</span> {installation.school.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{installation.school.subdomain} · v{installation.installedVersion.version} · {installation.enabled ? 'ACTIVE' : installation.uninstalledAt ? 'UNINSTALLED' : installation.installedAt ? 'INSTALLED' : installation.approvedAt ? 'APPROVED' : 'REQUESTED'}</p>
        {installation.purgeAfter && <p className="text-[11px] text-amber-600 dark:text-amber-400">Data purge scheduled {new Date(installation.purgeAfter).toLocaleString()}</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex gap-2 flex-wrap">
        {!installation.approvedAt && <button disabled={busy} className="btn-outline btn-sm" onClick={() => action('approve')}>Approve</button>}
        {installation.approvedAt && !installation.installedAt && <button disabled={busy} className="btn-outline btn-sm" onClick={install}>Install</button>}
        {installation.installedAt && !installation.enabled && !installation.uninstalledAt && <button disabled={busy} className="btn-primary btn-sm" onClick={() => action('activation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) })}>Activate</button>}
        {installation.enabled && <button disabled={busy} className="btn-outline btn-sm" onClick={() => action('activation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) })}>Deactivate</button>}
        {installation.installedAt && newestVersion && newestVersion.id !== installation.installedVersion.id && <button disabled={busy} className="btn-outline btn-sm" onClick={upgrade}>Upgrade to v{newestVersion.version}</button>}
        {installation.configuration?.rollbackVersionId && <button disabled={busy} className="btn-outline btn-sm" onClick={() => action('rollback')}>Roll back</button>}
        {installation.installedAt && <button disabled={busy} className="btn-outline btn-sm" onClick={submitPilotFeedback}>{installation.pilotFeedback?.some(feedback => feedback.source === 'OPERATOR') ? 'Update operator feedback' : 'Operator feedback'}</button>}
        {!installation.uninstalledAt && <button disabled={busy} className="btn-outline btn-sm" onClick={() => action('uninstall')}>Uninstall</button>}
      </div>
      {!!installation.pilotFeedback?.length && <div className="basis-full flex gap-2 flex-wrap">{installation.pilotFeedback.map(feedback => <span key={feedback.source} className="text-[11px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">{feedback.source}: {feedback.outcome} · {feedback.rating}/5</span>)}</div>}
    </div>
  )
}

function ExtensionsContent() {
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([])
  const [installations, setInstallations] = useState<InstallationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ key: '', name: '', runtimeType: 'THEME', commercialType: 'THEME' })
  const [health, setHealth] = useState<any>(null)
  const [publishers, setPublishers] = useState<PublisherRecord[]>([])
  const [alerts, setAlerts] = useState<ExtensionAlert[]>([])
  const [apiMetrics, setApiMetrics] = useState<any>(null)

  async function load() {
    setLoading(true)
    try {
      const [extensionData, installationData, healthData, publisherData, alertData, metricData] = await Promise.all([
        responseJson(await apiFetch('/api/platform/extensions')),
        responseJson(await apiFetch('/api/platform/extension-installations')),
        responseJson(await apiFetch('/api/platform/extensions/health')),
        responseJson(await apiFetch('/api/platform/extensions/publishers')),
        responseJson(await apiFetch('/api/platform/extensions/alerts')),
        responseJson(await apiFetch('/api/platform/extensions/api-metrics')),
      ])
      setExtensions(extensionData)
      setInstallations(installationData)
      setHealth(healthData)
      setPublishers(publisherData)
      setAlerts(alertData)
      setApiMetrics(metricData)
      setError('')
    } catch (loadError: any) {
      setError(loadError.message || 'Failed to load extensions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function setPublisherStatus(publisherId: string, status: string) {
    if (status !== 'ACTIVE' && !window.confirm('Suspending or revoking a publisher immediately unlists its extensions and disables active installations. Continue?')) return
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/publishers/${publisherId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }))
      await load()
    } catch (publisherError: any) {
      setError(publisherError.message || 'Could not update publisher')
    }
  }

  async function registerSigningKey(publisherId: string) {
    const keyId = window.prompt('Signing key ID (for example wattaman-2026-01)')
    if (!keyId) return
    const publicKeyPem = window.prompt('Paste the Ed25519 public key PEM. Never paste the private key.')
    if (!publicKeyPem) return
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/publishers/${publisherId}/signing-keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyId, publicKeyPem }),
      }))
      await load()
    } catch (keyError: any) {
      setError(keyError.message || 'Could not register signing key')
    }
  }

  async function setSigningKeyStatus(keyId: string, status: string) {
    if (status === 'REVOKED' && !window.confirm('Revoking a signing key is irreversible and immediately blocks every version signed by it. Continue?')) return
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/signing-keys/${keyId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      }))
      await load()
    } catch (keyError: any) {
      setError(keyError.message || 'Could not update signing key')
    }
  }

  async function createExtension(event: FormEvent) {
    event.preventDefault()
    try {
      await responseJson(await apiFetch('/api/platform/extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }))
      setForm({ key: '', name: '', runtimeType: 'THEME', commercialType: 'THEME' })
      await load()
    } catch (createError: any) {
      setError(createError.message || 'Could not create extension')
    }
  }

  async function setAlertStatus(alertId: string, status: 'ACKNOWLEDGED' | 'RESOLVED') {
    try {
      await responseJson(await apiFetch(`/api/platform/extensions/alerts/${alertId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      }))
      await load()
    } catch (alertError: any) {
      setError(alertError.message || 'Could not update alert')
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Extensions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Internal package quarantine, validation, review, and publication control plane.</p>
        </div>
        <div className="page-body space-y-5">
          {health && <div className="card p-5 space-y-4">
            <div><h2 className="font-bold text-slate-800 dark:text-slate-100">Extension health</h2><p className="text-xs text-slate-500">Generated {new Date(health.generatedAt).toLocaleString()}</p></div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <div><p className="text-slate-400">Extensions</p><p className="font-bold">{health.totals.extensions}</p></div>
              <div><p className="text-slate-400">Versions</p><p className="font-bold">{health.totals.versions}</p></div>
              <div><p className="text-slate-400">Active installs</p><p className="font-bold">{health.totals.activeInstallations}</p></div>
              <div><p className="text-slate-400">Stored</p><p className="font-bold">{Math.ceil(health.totals.storageBytes / 1024)} KB</p></div>
              <div><p className="text-slate-400">Record data</p><p className="font-bold">{Math.ceil(health.totals.recordBytes / 1024)} KB</p></div>
              <div><p className="text-slate-400">Failed validations</p><p className="font-bold">{health.totals.failedValidations}</p></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-400"><th className="py-2">Version</th><th>Status</th><th>Publisher</th><th>Adoption</th><th>Affected schools</th></tr></thead><tbody>{health.versions.map((item: any) => <tr key={item.versionId} className="border-t border-slate-100 dark:border-slate-800"><td className="py-2">{item.extension.name} v{item.version}</td><td>{item.lifecycleStatus}</td><td>{item.publisher.key} · {item.publisher.status}</td><td>{item.adoption.active}/{item.adoption.installations} active</td><td>{item.adoption.schools.map((school: any) => school.name).join(', ') || 'None'}</td></tr>)}</tbody></table></div>
            {health.schoolUsage?.length > 0 && <div className="text-xs space-y-1"><p className="font-semibold">School record quota</p>{health.schoolUsage.map((usage: any) => <p key={usage.school.id}>{usage.school.name}: {Math.ceil(usage.recordBytes / 1024)} KB / {Math.round(usage.quotaBytes / 1024 / 1024)} MB ({usage.percentUsed}%)</p>)}</div>}
          </div>}
          <div className="card p-5 space-y-3">
            <div><h2 className="font-bold text-slate-800 dark:text-slate-100">Operational alerts</h2><p className="text-xs text-slate-500">Repeated package failures and suspicious denied capabilities.</p></div>
            {alerts.length ? alerts.map(alert => <div key={alert.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-start justify-between gap-3 flex-wrap">
              <div><p className="text-sm font-semibold">{alert.severity} · {alert.type}</p><p className="text-xs text-slate-600 dark:text-slate-300">{alert.message}</p><p className="text-[11px] text-slate-400">{alert.status} · {alert.occurrences} occurrences · {new Date(alert.lastSeenAt).toLocaleString()}</p></div>
              {alert.status !== 'RESOLVED' && <div className="flex gap-2">{alert.status === 'OPEN' && <button className="btn-outline btn-sm" onClick={() => setAlertStatus(alert.id, 'ACKNOWLEDGED')}>Acknowledge</button>}<button className="btn-outline btn-sm" onClick={() => setAlertStatus(alert.id, 'RESOLVED')}>Resolve</button></div>}
            </div>) : <p className="text-sm text-slate-400">No operational alerts.</p>}
          </div>
          {apiMetrics && <div className="card p-5 space-y-3"><div><h2 className="font-bold text-slate-800 dark:text-slate-100">Extension API telemetry</h2><p className="text-xs text-slate-500">Rolling 24-hour request health.</p></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm"><div><p className="text-slate-400">Requests</p><p className="font-bold">{apiMetrics.requests}</p></div><div><p className="text-slate-400">Errors</p><p className="font-bold">{apiMetrics.errors}</p></div><div><p className="text-slate-400">Error rate</p><p className="font-bold">{apiMetrics.errorRate}%</p></div><div><p className="text-slate-400">Average</p><p className="font-bold">{apiMetrics.averageDurationMs} ms</p></div><div><p className="text-slate-400">Maximum</p><p className="font-bold">{apiMetrics.maxDurationMs} ms</p></div></div></div>}
          <div className="card p-5 space-y-3">
            <div><h2 className="font-bold text-slate-800 dark:text-slate-100">Publishers</h2><p className="text-xs text-slate-500">Initial release accepts Wattaman-internal packages only.</p></div>
            {publishers.map(publisher => <div key={publisher.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-sm">{publisher.name} <span className="text-xs text-slate-400">{publisher.key}</span></p><p className="text-xs text-slate-500">{publisher.status} · {publisher._count.extensions} extensions · {publisher.internal ? 'Internal' : 'External'}</p></div>
              <div className="flex gap-2">{publisher.status !== 'ACTIVE' && <button className="btn-outline btn-sm" onClick={() => setPublisherStatus(publisher.id, 'ACTIVE')}>Reactivate</button>}{publisher.status === 'ACTIVE' && <button className="btn-outline btn-sm" onClick={() => setPublisherStatus(publisher.id, 'SUSPENDED')}>Suspend</button>}{publisher.status !== 'REVOKED' && <button className="btn-outline btn-sm" onClick={() => setPublisherStatus(publisher.id, 'REVOKED')}>Revoke</button>}</div></div>
              <div className="text-xs space-y-2"><div className="flex items-center justify-between"><p className="font-semibold">Ed25519 signing keys</p><button className="btn-outline btn-sm" onClick={() => registerSigningKey(publisher.id)}>Register public key</button></div>{publisher.signingKeys?.map(key => <div key={key.id} className="flex justify-between gap-3"><span><code>{key.keyId}</code> · {key.status}</span><span className="flex gap-2">{key.status === 'ACTIVE' && <button onClick={() => setSigningKeyStatus(key.id, 'RETIRED')} className="text-amber-600">Retire</button>}{key.status !== 'REVOKED' && <button onClick={() => setSigningKeyStatus(key.id, 'REVOKED')} className="text-red-600">Revoke</button>}</span></div>)}{!publisher.signingKeys?.length && <p className="text-slate-400">No signing key registered. Publication is blocked until one matches the configured secret key ID.</p>}</div>
            </div>)}
          </div>
          <form onSubmit={createExtension} className="card p-5 grid md:grid-cols-5 gap-3 items-end">
            <label className="text-xs text-slate-600 dark:text-slate-300">Key<input className="input mt-1" value={form.key} onChange={event => setForm({ ...form, key: event.target.value.toUpperCase() })} placeholder="AURORA_THEME" required /></label>
            <label className="text-xs text-slate-600 dark:text-slate-300">Name<input className="input mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
            <label className="text-xs text-slate-600 dark:text-slate-300">Runtime<select className="input mt-1" value={form.runtimeType} onChange={event => setForm({ ...form, runtimeType: event.target.value })}><option value="THEME">Theme</option><option value="DECLARATIVE_MODULE">Declarative module</option><option value="INTEGRATION">Integration</option></select></label>
            <label className="text-xs text-slate-600 dark:text-slate-300">Commercial type<select className="input mt-1" value={form.commercialType} onChange={event => setForm({ ...form, commercialType: event.target.value })}><option value="THEME">Theme</option><option value="MODULE">Module</option><option value="ADDON">Add-on</option></select></label>
            <button className="btn-primary">Create extension</button>
          </form>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          {loading ? <p className="text-sm text-slate-400">Loading extensions…</p> : extensions.map(extension => <ExtensionCard key={extension.id} extension={extension} reload={load} />)}
          <div className="pt-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">School installation requests</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-3">Approval, installation, activation, and uninstall are deliberately separate audited actions.</p>
            <div className="card p-4 space-y-3">
              {installations.length ? installations.map(installation => <InstallationCard key={installation.id} installation={installation} reload={load} />) : <p className="text-sm text-slate-400">No extension installation requests.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExtensionsPage() {
  return <AuthGuard requiredRole="PLATFORM_ADMIN"><ExtensionsContent /></AuthGuard>
}
