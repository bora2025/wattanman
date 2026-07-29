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
}

function NewSchoolContent() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPhone, setAdminPhone] = useState('')

  const [checking, setChecking] = useState(false)
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreateResult | null>(null)
  const [copied, setCopied] = useState(false)

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
        body: JSON.stringify({ name: name.trim(), subdomain: subdomain.trim(), adminName: adminName.trim(), adminEmail: adminEmail.trim(), adminPhone: adminPhone.trim() || undefined }),
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
          <Link href="/platform/schools" className="text-xs text-slate-500 hover:text-slate-700 mb-2 inline-flex items-center gap-1">← Back to Schools</Link>
          <h1 className="text-2xl font-bold text-slate-800">Onboard a New School</h1>
          <p className="text-sm text-slate-500 mt-1">Creates the school and its first admin account in one step.</p>
        </div>

        <div className="page-body">
          {result ? (
            <div className="card p-6 max-w-xl border-2 border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-700 mb-3">
                <span className="text-2xl">✅</span>
                <h2 className="text-lg font-semibold">School created</h2>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                <strong>{result.school.name}</strong> is live at{' '}
                <code className="bg-slate-50 px-1.5 py-0.5 rounded text-xs">{result.school.subdomain}.wattaman.app</code>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Temporary admin credentials — shown once</p>
                <div className="text-sm text-slate-700"><span className="text-slate-500">Email:</span> {result.admin.email}</div>
                <div className="flex items-center gap-2">
                  <code className="bg-white border border-amber-200 rounded px-2 py-1 text-sm font-mono">{result.temporaryPassword}</code>
                  <button onClick={copyPassword} className="btn-outline btn-sm">{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <p className="text-xs text-amber-700">Share this securely with the school's admin — it will not be shown again.</p>
              </div>
              <div className="flex gap-2 mt-5">
                <Link href={`/platform/schools/${result.school.id}`} className="btn-primary text-sm px-4 py-2 rounded-lg">View School</Link>
                <Link href="/platform/schools" className="btn-outline text-sm px-4 py-2 rounded-lg">Back to List</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5">
              {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">School name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Greenhill International School" required className="w-full" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subdomain</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={e => { setSubdomain(slugify(e.target.value)); setSubdomainTouched(true) }}
                    placeholder="greenhill"
                    required
                    className="flex-1"
                  />
                  <span className="text-sm text-slate-400 whitespace-nowrap">.wattaman.app</span>
                </div>
                <div className="mt-1.5 text-xs">
                  {checking && <span className="text-slate-400">Checking availability…</span>}
                  {!checking && availability && (
                    availability.available
                      ? <span className="text-emerald-600 font-medium">✓ Available</span>
                      : <span className="text-red-600 font-medium">✗ {availability.reason || 'Unavailable'}</span>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">First admin account</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admin name</label>
                    <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Doe" required className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admin email</label>
                    <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@greenhill.example" required className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admin phone <span className="text-slate-400 font-normal">(optional)</span></label>
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
