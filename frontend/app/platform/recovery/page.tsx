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

export default function RecoveryPage() {
  const [items, setItems] = useState<RestoreRequest[]>([])
  const [message, setMessage] = useState('')

  async function load() {
    const response = await apiFetch('/api/platform/backup-restores')
    if (response.ok) setItems(await response.json())
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

  return <div className="page-shell">
    <Sidebar title="Platform Admin" subtitle="Wattanman" navItems={platformNav} />
    <main className="page-content">
      <div className="h-14 lg:hidden" />
      <header className="page-header"><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recovery control</h1><p className="mt-1 text-sm text-slate-500">Review isolated verification evidence and enforce independent approval.</p></header>
      <div className="page-body space-y-4">
        {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
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
