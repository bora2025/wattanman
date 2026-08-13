"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch } from '../../../lib/api'

interface RestoreRequest {
  id: string
  schoolId: string
  exportId: string
  status: string
  requestedBy?: string
  requestedAt: string
  verificationReport?: { checksum: string; byteSize: number; modelCount: number; rowCount: number; isolation: string }
  errorMessage?: string
  approvedBy?: string
  approvedAt?: string
  approvalReason?: string
}

interface LegalHold { id: string; schoolId: string; category: string; resourceId: string; caseReference: string; reason: string; active: boolean; createdAt: string }
interface DeletionRequest { id: string; deletedSchoolId: string; schoolName: string; schoolSubdomain: string; status: string; reason: string; requestedBy: string; approvedBy?: string; errorMessage?: string; reportChecksum?: string }

export default function RecoveryPage() {
  const [items, setItems] = useState<RestoreRequest[]>([])
  const [message, setMessage] = useState('')
  const [holds, setHolds] = useState<LegalHold[]>([])
  const [deletions, setDeletions] = useState<DeletionRequest[]>([])

  async function load() {
    const [response, holdResponse, deletionResponse] = await Promise.all([apiFetch('/api/platform/backup-restores'), apiFetch('/api/platform/backup-restores/legal-holds/list?active=true'), apiFetch('/api/platform/schools/deletion-requests')])
    if (response.ok) setItems(await response.json())
    if (holdResponse.ok) setHolds(await holdResponse.json())
    if (deletionResponse.ok) setDeletions(await deletionResponse.json())
  }

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer) }, [])

  async function approve(item: RestoreRequest) {
    const reason = window.prompt('Record the recovery approval reason (minimum 10 characters).')
    if (!reason) return
    const response = await apiFetch(`/api/platform/backup-restores/${item.id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? 'Restore approved. Execution remains locked until the recovery executor is enabled.' : payload.message || 'Approval failed.')
    await load()
  }

  async function execute(item: RestoreRequest) {
    const confirmSchoolId = window.prompt(`Type the target school ID to confirm:\n${item.schoolId}`)
    if (!confirmSchoolId) return
    const changeTicket = window.prompt('Enter the approved change or incident ticket (minimum 10 characters).')
    if (!changeTicket) return
    const response = await apiFetch(`/api/platform/backup-restores/${item.id}/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmSchoolId, changeTicket }),
    })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? 'Restore execution queued. A safety export will be created before mutation.' : payload.message || 'Execution failed.')
    await load()
  }

  async function createHold() {
    const schoolId = window.prompt('School ID for the legal hold')
    const category = window.prompt('Category: AUDIT_LOG, BACKUP_EXPORT, RESTORE_HISTORY, TELEMETRY, METRICS, PAYMENT_EVIDENCE, or EXTENSION_RECORD')
    const caseReference = window.prompt('Case reference')
    const reason = window.prompt('Legal hold reason (minimum 10 characters)')
    if (!schoolId || !category || !caseReference || !reason) return
    const response = await apiFetch('/api/platform/backup-restores/legal-holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, category, caseReference, reason }) })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? 'Legal hold activated.' : payload.message || 'Legal hold failed.')
    await load()
  }

  async function releaseHold(item: LegalHold) {
    const reason = window.prompt('Release reason (minimum 10 characters)')
    if (!reason) return
    const response = await apiFetch(`/api/platform/backup-restores/legal-holds/${item.id}/release`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? 'Legal hold released; cleanup remains asynchronous.' : payload.message || 'Release failed.')
    await load()
  }

  async function approveDeletion(item: DeletionRequest) {
    const reason = window.prompt('Independent deletion approval reason')
    if (!reason) return
    const response = await apiFetch(`/api/platform/schools/deletion-requests/${item.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? 'School deletion approved; a different operator must execute it.' : payload.message || 'Approval failed.')
    await load()
  }

  async function executeDeletion(item: DeletionRequest) {
    const confirmSchoolId = window.prompt(`Type the school ID exactly:\n${item.deletedSchoolId}`)
    const changeTicket = window.prompt('Approved change ticket')
    if (!confirmSchoolId || !changeTicket) return
    const response = await apiFetch(`/api/platform/schools/deletion-requests/${item.id}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmSchoolId, changeTicket }) })
    const payload = await response.json().catch(() => ({}))
    setMessage(response.ok ? 'Verified school deletion queued.' : payload.message || 'Execution failed.')
    await load()
  }

  async function downloadDeletionReport(item: DeletionRequest) {
    const response = await apiFetch(`/api/platform/schools/deletion-requests/${item.id}/report-url`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return setMessage(payload.message || 'Report unavailable.')
    window.location.assign(payload.download.url)
  }

  return <div className="page-shell">
    <Sidebar title="Platform Admin" subtitle="Wattanman" navItems={platformNav} />
    <main className="page-content">
      <div className="h-14 lg:hidden" />
      <header className="page-header"><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recovery control</h1><p className="mt-1 text-sm text-slate-500">Review isolated verification evidence and enforce independent approval.</p></header>
      <div className="page-body space-y-4">
        {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
        <section className="card p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Active legal holds</h2><p className="text-sm text-slate-500">Holds override automated and manual retention without granting data access.</p></div><button className="btn-outline" onClick={() => void createHold()}>Create hold</button></div><div className="mt-4 space-y-2">{holds.map(hold => <div key={hold.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><div><strong>{hold.category}</strong> · School {hold.schoolId}<div className="text-xs text-slate-500">{hold.caseReference} · {hold.reason}</div></div><button className="btn-outline" onClick={() => void releaseHold(hold)}>Release</button></div>)}{holds.length === 0 && <p className="text-sm text-slate-500">No active legal holds.</p>}</div></section>
        <section className="card p-5"><h2 className="font-semibold text-slate-900 dark:text-white">School deletion control</h2><p className="text-sm text-slate-500">Three-person approval, verified database/R2 purge, and signed evidence.</p><div className="mt-4 space-y-3">{deletions.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><div><strong>{item.schoolName}</strong> · {item.deletedSchoolId}<div className="text-xs text-slate-500">{item.status} · {item.reason}</div>{item.errorMessage && <div className="text-xs text-red-600">{item.errorMessage}</div>}</div><div className="flex gap-2">{item.status === 'PENDING_APPROVAL' && <button className="btn-outline" onClick={() => void approveDeletion(item)}>Approve</button>}{item.status === 'APPROVED' && <button className="rounded-lg bg-red-600 px-3 py-2 text-white" onClick={() => void executeDeletion(item)}>Execute</button>}{item.status === 'COMPLETED' && <button className="btn-outline" onClick={() => void downloadDeletionReport(item)}>Signed report</button>}</div></div>)}{deletions.length === 0 && <p className="text-sm text-slate-500">No school deletion requests.</p>}</div></section>
        {items.map(item => <article key={item.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-semibold text-slate-900 dark:text-white">School {item.schoolId}</h2><p className="text-sm text-slate-500">Restore {item.id} · Export {item.exportId}</p><span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{item.status}</span></div>
            <div className="flex gap-2">{item.status === 'VERIFIED' && <button className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white" onClick={() => void approve(item)}>Approve</button>}{item.status === 'APPROVED' && <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={() => void execute(item)}>Execute restore</button>}</div>
          </div>
          {item.verificationReport && <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-5 dark:border-slate-700"><div><dt className="text-slate-500">Rows</dt><dd>{item.verificationReport.rowCount.toLocaleString()}</dd></div><div><dt className="text-slate-500">Models</dt><dd>{item.verificationReport.modelCount}</dd></div><div><dt className="text-slate-500">Size</dt><dd>{(item.verificationReport.byteSize / 1024).toFixed(1)} KB</dd></div><div><dt className="text-slate-500">Isolation</dt><dd>{item.verificationReport.isolation}</dd></div><div><dt className="text-slate-500">Checksum</dt><dd className="font-mono text-xs">{item.verificationReport.checksum.slice(0, 16)}…</dd></div></dl>}
          {item.errorMessage && <p className="mt-3 text-sm text-red-700">{item.errorMessage}</p>}
          {item.approvalReason && <p className="mt-3 text-sm text-emerald-700">Approved: {item.approvalReason}</p>}
        </article>)}
        {items.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No restore requests.</div>}
      </div>
    </main>
  </div>
}
