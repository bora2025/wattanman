"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../../../components/Sidebar'
import AuthGuard from '../../../../components/AuthGuard'
import { platformNav } from '../../../../lib/platform-nav'
import { apiFetch } from '../../../../lib/api'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
}

interface CreateResult {
  school: { id: string; name: string; subdomain: string }
  admin: { id: string; name: string; email: string }
  temporaryPassword: string
  domain: string | null
  domainProvisioned: boolean
  domainError: string | null
}

interface ModuleListing {
  id: string
  key: string
  kind: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  isActive: boolean
}

function NewSchoolContent() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPhone, setAdminPhone] = useState('')
  const [modules, setModules] = useState<ModuleListing[]>([])
  const [selectedModules, setSelectedModules] = useState<string[]>([])

  const [checking, setChecking] = useState(false)
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreateResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiFetch('/api/platform/addon-directory')
      .then(res => res.ok ? res.json() : [])
      .then((data: ModuleListing[]) => setModules((data || []).filter(a => a.kind === 'MODULE' && a.isActive)))
      .catch(() => setModules([]))
  }, [])

  function toggleModule(key: string) {
    setSelectedModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  // Auto-derive subdomain from name until the user edits it directly.
  useEffect(() => {
    if (!subdomainTouched) setSubdomain(slugify(name))
  }, [name, subdomainTouched])

  useEffect(() => {
    if (!subdomain) { setAvailability(null); return }
    setChecking(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/platform/schools/check-subdomain?slug=${encodeURIComponent(subdomain)}`)
        if (res.ok) setAvailability(await res.json())
        else setAvailability(null)
      } catch {
        setAvailability(null)
      } finally {
        setChecking(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [subdomain])

  const canSubmit = name.trim() && subdomain.trim() && adminName.trim() && adminEmail.trim() && availability?.available && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await apiFetch('/api/platform/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), subdomain: subdomain.trim(), adminName: adminName.trim(), adminEmail: adminEmail.trim(), adminPhone: adminPhone.trim() || undefined, moduleKeys: selectedModules }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || `Failed (${res.status})`)
        return
      }
      setResult(data)
    } catch (e) {
      setError('Network error creating school')
    } finally {
      setSubmitting(false)
    }
  }

  function copyPassword() {
    if (!result) return
    navigator.clipboard?.writeText(result.temporaryPassword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <Link href="/platform/schools" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-2 inline-flex items-center gap-1">← Back to Schools</Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Onboard a New School</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Creates the school and its first admin account in one step.</p>
        </div>

        <div className="page-body">
          {result ? (
            <div className="card p-6 max-w-xl border-2 border-emerald-100 dark:border-emerald-900">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 mb-3">
                <span className="text-2xl">✅</span>
                <h2 className="text-lg font-semibold">School created</h2>
              </div>
              {result.domainProvisioned && result.domain ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  <strong>{result.school.name}</strong> is live at{' '}
                  <a href={`https://${result.domain}`} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline">{result.domain}</a>.
                </p>
              ) : (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                  <p className="font-medium"><strong>{result.school.name}</strong> was created, but its web address couldn't be set up automatically.</p>
                  {result.domainError && <p className="mt-1 text-xs opacity-90">{result.domainError}</p>}
                  <p className="mt-1 text-xs">You can retry this from the school's page.</p>
                </div>
              )}
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Temporary admin credentials — shown once</p>
                <div className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-500 dark:text-slate-400">Email:</span> {result.admin.email}</div>
                <div className="flex items-center gap-2">
                  <code className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded px-2 py-1 text-sm font-mono">{result.temporaryPassword}</code>
                  <button onClick={copyPassword} className="btn-outline btn-sm">{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300">Share this securely with the school's admin — it will not be shown again.</p>
              </div>
              <div className="flex gap-2 mt-5">
                <Link href={`/platform/schools/${result.school.id}`} className="btn-primary text-sm px-4 py-2 rounded-lg">View School</Link>
                <Link href="/platform/schools" className="btn-outline text-sm px-4 py-2 rounded-lg">Back to List</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5">
              {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">School name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Greenhill International School" required className="w-full" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Subdomain</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={e => { setSubdomain(slugify(e.target.value)); setSubdomainTouched(true) }}
                    placeholder="greenhill"
                    required
                    className="flex-1"
                  />
                  <span className="text-sm text-slate-400 dark:text-slate-500 whitespace-nowrap">.wattaman.app</span>
                </div>
                <div className="mt-1.5 text-xs">
                  {checking && <span className="text-slate-400 dark:text-slate-500">Checking availability…</span>}
                  {!checking && availability && (
                    availability.available
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Available</span>
                      : <span className="text-red-600 dark:text-red-400 font-medium">✗ {availability.reason || 'Unavailable'}</span>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Modules</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Pick what this school actually needs. Nothing is selected by default — unpicked modules stay hidden and their APIs stay locked; more can be enabled later from the school's page.</p>
                {modules.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No modules in the catalog yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {modules.map(m => (
                      <label key={m.key} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${selectedModules.includes(m.key) ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                        <input type="checkbox" checked={selectedModules.includes(m.key)} onChange={() => toggleModule(m.key)} className="mt-0.5" />
                        <span>
                          <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1">{m.icon && <span>{m.icon}</span>}{m.name}</span>
                          {m.description && <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">{m.description}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">First admin account</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Admin name</label>
                    <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Doe" required className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Admin email</label>
                    <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@greenhill.example" required className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Admin phone <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span></label>
                    <input type="tel" value={adminPhone} onChange={e => setAdminPhone(e.target.value)} placeholder="+855…" className="w-full" />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-2.5 rounded-xl text-sm disabled:opacity-50">
                {submitting ? 'Creating…' : 'Create School'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NewSchoolPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <NewSchoolContent />
    </AuthGuard>
  )
}
