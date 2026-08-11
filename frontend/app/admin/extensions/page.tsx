'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiCursorItems, apiFetch } from '../../../lib/api'

interface DirectoryExtension {
  id: string
  key: string
  name: string
  description?: string | null
  runtimeType: string
  commercialType: string
  category: string
  tags: string[]
  locales: string[]
  supportUrl?: string | null
  privacyPolicyUrl?: string | null
  dataUse: {
    collectsPersonalData: boolean
    dataCategories: string[]
    purposes: string[]
    sharesWithThirdParties: boolean
    retentionDays: number | null
  }
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
  const [activeTab, setActiveTab] = useState<'DISCOVER' | 'MODULE' | 'THEME'>('DISCOVER')
  const [selectedExtension, setSelectedExtension] = useState<DirectoryExtension | null>(null)
  const [paymentExtension, setPaymentExtension] = useState<DirectoryExtension | null>(null)
  const [requestContext, setRequestContext] = useState<{ school: { name: string; subdomain: string }; admin: { name: string; email?: string | null; phone?: string | null }; payment: { bankName?: string | null; accountName?: string | null; accountNumber?: string | null; currency: string; instructions?: string | null; hasQr: boolean; updatedAt?: string } } | null>(null)
  const [invoice, setInvoice] = useState<File | null>(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  async function load() {
    try {
      const [available, installed, pilotCriteria, context] = await Promise.all([
        apiCursorItems<DirectoryExtension>('/api/extensions/directory'),
        apiCursorItems<Installation>('/api/extensions/installations'),
        json(await apiFetch('/api/extensions/pilot-criteria')),
        json(await apiFetch('/api/extensions/request-context')),
      ])
      setDirectory(available)
      setInstallations(installed)
      setCriteria(pilotCriteria)
      setRequestContext(context)
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
    const extension = directory.find(item => item.id === extensionId)
    if (extension?.price != null && extension.price > 0) {
      setSelectedExtension(null)
      setPaymentExtension(extension)
      return
    }
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

  async function submitPaymentRequest(event: FormEvent) {
    event.preventDefault()
    if (!paymentExtension || !invoice) return setError('Payment invoice is required.')
    setBusy(paymentExtension.id)
    try {
      const formData = new FormData()
      formData.append('invoice', invoice)
      formData.append('paymentReference', paymentReference)
      formData.append('paymentNotes', paymentNotes)
      await json(await apiFetch(`/api/extensions/${paymentExtension.id}/request-payment`, { method: 'POST', body: formData }))
      setPaymentExtension(null)
      setInvoice(null)
      setPaymentReference('')
      setPaymentNotes('')
      await load()
    } catch (paymentError: any) {
      setError(paymentError.message || 'Could not submit payment request')
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
  const filteredDirectory = directory.filter(extension => {
    const matchesSearch = !normalizedSearch || `${extension.name} ${extension.key} ${extension.description || ''} ${extension.runtimeType} ${extension.commercialType}`.toLowerCase().includes(normalizedSearch)
    const matchesTab = activeTab === 'DISCOVER' || extension.commercialType === activeTab || extension.runtimeType.includes(activeTab)
    return matchesSearch && matchesTab
  })
  const installedExtensions = filteredDirectory.filter(extension =>
    installations.some(item => item.extensionId === extension.id)
  )
  const availableExtensions = filteredDirectory.filter(extension =>
    !installations.some(item => item.extensionId === extension.id)
  )
  const featuredExtension = availableExtensions[0] || installedExtensions[0]

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
      <>
      <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-blue-700">
        <button type="button" className="block h-36 w-full bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-700 p-5 text-left" onClick={() => setSelectedExtension(extension)}>
          <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/95 text-2xl font-black text-indigo-700 shadow-xl">{extension.name.slice(0, 2).toUpperCase()}</div>
          </div>
        </button>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="truncate font-bold text-slate-800 dark:text-slate-100">{extension.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isPaid ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
                  {isPaid ? `$${extension.price}${extension.priceNote ? ` ${extension.priceNote}` : ''}` : 'Free'}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500 dark:text-slate-400">{extension.description || 'A reviewed Wattaman extension for your school.'}</p>
            </div>
            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{extension.commercialType}</span>
          </div>
          <div className="mt-3 flex items-center text-xs text-amber-500"><span>★★★★★</span><span className="ml-2 text-slate-400">Wattaman reviewed</span></div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <button type="button" className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setSelectedExtension(extension)}>Details</button>
            {installation ? <div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-500">{state}</span><span title="Managed by platform admin" className={`relative h-6 w-10 rounded-full ${installation.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${installation.enabled ? 'left-5' : 'left-1'}`} /></span></div> : <button disabled={busy === extension.id} className="btn-primary btn-sm" onClick={() => request(extension.id)}>{busy === extension.id ? 'Requesting…' : 'Get'}</button>}
          </div>
        </div>
      </article>
      {paymentExtension?.id === extension.id && requestContext?.payment.hasQr && <aside className="fixed left-4 top-1/2 z-[60] hidden w-56 -translate-y-1/2 rounded-2xl bg-white p-4 text-center shadow-2xl dark:bg-slate-900 lg:block"><p className="text-sm font-bold text-slate-900 dark:text-white">Scan to pay</p><img src={`/api/extensions/payment-qr?v=${requestContext.payment.updatedAt || '1'}`} alt="Bank payment QR" className="mx-auto mt-3 h-44 w-44 rounded-xl object-contain" /><p className="mt-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300">{requestContext.payment.currency || 'USD'} {extension.price}</p>{requestContext.payment.bankName && <p className="mt-1 text-xs text-slate-500">{requestContext.payment.bankName}</p>}{requestContext.payment.accountName && <p className="text-xs text-slate-500">{requestContext.payment.accountName}</p>}{requestContext.payment.accountNumber && <p className="text-xs text-slate-500">{requestContext.payment.accountNumber}</p>}{requestContext.payment.instructions && <p className="mt-2 text-xs text-slate-400">{requestContext.payment.instructions}</p>}</aside>}
      {paymentExtension?.id === extension.id && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><form onSubmit={submitPaymentRequest} className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900"><div className="bg-gradient-to-r from-indigo-700 to-blue-600 p-6 text-white"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Paid extension request</p><h2 className="mt-1 text-2xl font-bold">{extension.name}</h2><p className="mt-1 text-blue-100">${extension.price}{extension.priceNote ? ` ${extension.priceNote}` : ''}</p></div><button type="button" className="text-2xl text-white/70 hover:text-white" onClick={() => setPaymentExtension(null)}>×</button></div></div><div className="space-y-4 p-6"><div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800 sm:grid-cols-2"><div><span className="block text-xs text-slate-400">School</span><strong className="text-slate-800 dark:text-white">{requestContext?.school.name || 'Current school'}</strong><p className="text-xs text-slate-500">{requestContext?.school.subdomain}</p></div><div><span className="block text-xs text-slate-400">School administrator</span><strong className="text-slate-800 dark:text-white">{requestContext?.admin.name || 'Signed-in administrator'}</strong><p className="text-xs text-slate-500">{requestContext?.admin.email || requestContext?.admin.phone}</p></div></div><p className="text-xs text-slate-500">School and administrator information is securely filled from your account.</p><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Payment reference<input className="input mt-1 w-full" value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder="Bank transfer or invoice reference" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Payment invoice or receipt <span className="text-red-500">*</span><input type="file" required accept="application/pdf,image/jpeg,image/png" className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700" onChange={event => setInvoice(event.target.files?.[0] || null)} /><span className="mt-1 block text-xs font-normal text-slate-400">PDF, JPG, or PNG, maximum 5 MB.</span></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Notes<textarea className="input mt-1 min-h-20 w-full" value={paymentNotes} onChange={event => setPaymentNotes(event.target.value)} placeholder="Optional payment details" /></label><div className="flex justify-end gap-3"><button type="button" className="btn-outline" onClick={() => setPaymentExtension(null)}>Cancel</button><button className="btn-primary" disabled={busy === extension.id}>{busy === extension.id ? 'Submitting…' : 'Submit payment request'}</button></div></div></form></div>}
      </>
    )
  }

  return (
    <div className="page-shell">
      <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="border-b border-slate-200 bg-white px-5 pt-5 dark:border-slate-800 dark:bg-slate-950 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="shrink-0"><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Wattaman Extensions</h1><p className="text-sm text-slate-500">Enhance your school with reviewed modules and themes.</p></div>
            <label className="relative block flex-1 xl:ml-8"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400">⌕</span><input type="search" className="input w-full py-3 pl-11" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search extensions, themes, and more" aria-label="Search extensions" /></label>
          </div>
          <nav className="mt-5 flex gap-7 overflow-x-auto" aria-label="Extension categories">
            {([['DISCOVER', 'Discover'], ['MODULE', 'Extensions'], ['THEME', 'Themes']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setActiveTab(value)} className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${activeTab === value ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{label}</button>)}
            <Link href="/admin/extensions/manage" className="ml-auto border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-slate-500 hover:text-blue-600">Manage extensions ({installations.length})</Link>
          </nav>
        </div>
        <div className="page-body space-y-8">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          {activeTab === 'DISCOVER' && featuredExtension && <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-700 p-7 text-white shadow-xl md:p-10"><div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" /><div className="relative grid items-center gap-8 md:grid-cols-[1.2fr_.8fr]"><div><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">FEATURED EXTENSION</span><h2 className="mt-5 max-w-2xl text-3xl font-bold md:text-4xl">{featuredExtension.name}</h2><p className="mt-3 max-w-xl text-blue-100">{featuredExtension.description || 'Add powerful new capabilities to your Wattaman school workspace.'}</p><div className="mt-6 flex gap-3"><button type="button" className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-900 hover:bg-blue-50" onClick={() => installations.some(item => item.extensionId === featuredExtension.id) ? setSelectedExtension(featuredExtension) : request(featuredExtension.id)}>{installations.some(item => item.extensionId === featuredExtension.id) ? 'View details' : 'Get extension'}</button><button type="button" className="rounded-lg border border-white/30 px-6 py-2.5 font-semibold hover:bg-white/10" onClick={() => setSelectedExtension(featuredExtension)}>Learn more</button></div></div><div className="flex items-center justify-center"><div className="flex h-40 w-40 rotate-3 items-center justify-center rounded-[2rem] bg-white text-5xl font-black text-indigo-700 shadow-2xl">{featuredExtension.name.slice(0, 2).toUpperCase()}</div></div></div></section>}
          {activeTab === 'DISCOVER' && <section className="grid gap-4 md:grid-cols-3"><button type="button" onClick={() => setActiveTab('MODULE')} className="card flex items-center gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"><span className="text-3xl">⚡</span><span><strong className="block text-slate-900 dark:text-white">Productivity</strong><small className="text-slate-500">Tools for daily school work</small></span></button><button type="button" onClick={() => setActiveTab('THEME')} className="card flex items-center gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"><span className="text-3xl">🎨</span><span><strong className="block text-slate-900 dark:text-white">Themes</strong><small className="text-slate-500">Personalize your school</small></span></button><Link href="/admin/extensions/manage" className="card flex items-center gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"><span className="text-3xl">✓</span><span><strong className="block text-slate-900 dark:text-white">Manage extensions</strong><small className="text-slate-500">Requests, installs, and updates</small></span></Link></section>}
          {directory.length === 0 ? <div className="card p-10 text-center text-sm text-slate-400">No published extensions are available.</div> : filteredDirectory.length === 0 ? <div className="card p-10 text-center text-sm text-slate-400">No extensions match your search.</div> : <>
            {availableExtensions.length > 0 && <section className="space-y-4"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white">{activeTab === 'DISCOVER' ? 'Recommended for your school' : activeTab === 'THEME' ? 'School themes' : 'School extensions'}</h2><p className="text-sm text-slate-500">Reviewed and published by Wattaman platform administrators.</p></div><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{availableExtensions.map(extension => <ExtensionRow key={extension.id} extension={extension} />)}</div></section>}
          </>}
        </div>
        {selectedExtension && (() => { const installation = installations.find(item => item.extensionId === selectedExtension.id); return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-slate-900"><div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-700 p-8 text-white"><div className="flex items-start justify-between"><div className="flex gap-5"><div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-2xl font-black text-indigo-700">{selectedExtension.name.slice(0, 2).toUpperCase()}</div><div><p className="text-xs font-semibold text-blue-200">{selectedExtension.runtimeType.replaceAll('_', ' ')}</p><h2 className="mt-1 text-2xl font-bold">{selectedExtension.name}</h2><p className="mt-1 text-sm text-blue-100">Version {selectedExtension.versions[0]?.version} · Wattaman reviewed</p></div></div><button type="button" onClick={() => setSelectedExtension(null)} className="text-2xl text-white/70 hover:text-white" aria-label="Close">×</button></div></div><div className="space-y-5 p-7"><p className="text-slate-600 dark:text-slate-300">{selectedExtension.description || 'A reviewed Wattaman extension designed to add capabilities to your school workspace.'}</p><div className="flex flex-wrap gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{selectedExtension.category?.replaceAll('_', ' ')}</span>{selectedExtension.tags?.map(tag => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>)}</div><div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><strong className="block text-slate-900 dark:text-white">★★★★★</strong><small className="text-slate-500">Reviewed</small></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><strong className="block text-slate-900 dark:text-white">{selectedExtension.price ? `$${selectedExtension.price}` : 'Free'}</strong><small className="text-slate-500">Price</small></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><strong className="block text-slate-900 dark:text-white">{extensionState(installation) || 'Available'}</strong><small className="text-slate-500">Status</small></div></div><section className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-white">Privacy and support</h3><dl className="mt-3 grid gap-2 text-slate-600 dark:text-slate-300"><div><dt className="inline font-medium">Languages: </dt><dd className="inline">{selectedExtension.locales?.join(', ') || 'en'}</dd></div><div><dt className="inline font-medium">Personal data: </dt><dd className="inline">{selectedExtension.dataUse?.collectsPersonalData ? `${selectedExtension.dataUse.dataCategories.join(', ')} for ${selectedExtension.dataUse.purposes.join(', ')}` : 'Not collected'}</dd></div>{selectedExtension.dataUse?.retentionDays && <div><dt className="inline font-medium">Retention: </dt><dd className="inline">{selectedExtension.dataUse.retentionDays} days</dd></div>}</dl><div className="mt-3 flex gap-4">{selectedExtension.supportUrl && <a href={selectedExtension.supportUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Support</a>}{selectedExtension.privacyPolicyUrl && <a href={selectedExtension.privacyPolicyUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Privacy policy</a>}</div></section>{installation?.installedAt && <div className="flex flex-wrap items-center gap-3"><label className="text-xs text-slate-500">Updates<select disabled={busy === installation.id} value={installation.updatePolicy} onChange={event => updatePolicy(installation.id, event.target.value)} className="input ml-2 py-1 text-xs"><option value="MANUAL">Manual</option><option value="NOTIFY">Notify admins</option><option value="AUTO_APPROVED">Automatic</option></select></label><button type="button" className="btn-outline btn-sm" onClick={() => submitFeedback(installation)}>Pilot feedback</button></div>}<div className="flex justify-end gap-3"><button type="button" className="btn-outline" onClick={() => setSelectedExtension(null)}>Close</button>{!installation && <button type="button" className="btn-primary" disabled={busy === selectedExtension.id} onClick={() => request(selectedExtension.id)}>{selectedExtension.price ? 'Request purchase' : 'Get extension'}</button>}</div></div></div></div> })()}
      </div>
    </div>
  )
}

export default function AdminExtensionsPage() {
  return <AuthGuard requiredRole="ADMIN"><AdminExtensionsContent /></AuthGuard>
}
