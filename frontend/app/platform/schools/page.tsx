"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch } from '../../../lib/api'

interface School {
  id: string
  name: string
  subdomain: string
  customDomain: string | null
  status: string
  createdAt: string
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  PROVISIONING: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  SUSPENDED: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  DELETION_SCHEDULED: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
}

function SchoolsListContent() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETION_SCHEDULED'>('all')

  useEffect(() => {
    const timer = setTimeout(() => void load(true), 250)
    return () => clearTimeout(timer)
  }, [search, statusFilter])

  async function load(reset = true) {
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (!reset && nextCursor) params.set('cursor', nextCursor)
      const res = await apiFetch(`/api/platform/schools?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const page: { items: School[]; nextCursor: string | null } = await res.json()
      setSchools(current => reset ? page.items : [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      setError('Failed to load schools')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Schools</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{schools.length} school{schools.length === 1 ? '' : 's'} on the platform</p>
          </div>
          <Link href="/platform/schools/new" className="btn-primary text-sm px-4 py-2.5 rounded-xl w-fit">
            + New School
          </Link>
        </div>

        <div className="page-body space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Search by name or subdomain…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1"
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="sm:w-44">
              <option value="all">All statuses</option>
              <option value="PROVISIONING">Provisioning</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DELETION_SCHEDULED">Deletion scheduled</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : schools.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
              {search || statusFilter !== 'all' ? 'No schools match your filters.' : 'No schools yet — create the first one.'}
            </div>
          ) : (
            <div className="grid gap-3">
              {schools.map(s => (
                <Link key={s.id} href={`/platform/schools/${s.id}`}
                  className="card p-4 sm:p-5 flex items-center justify-between gap-4 hover:shadow-md transition-all">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.status] || 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                        {s.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {s.subdomain}.wattaman.app{s.customDomain ? ` · ${s.customDomain}` : ''}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </Link>
              ))}
              {nextCursor && (
                <button type="button" className="btn-outline mx-auto px-5 py-2" disabled={loadingMore} onClick={() => void load(false)}>
                  {loadingMore ? 'Loading…' : 'Load more schools'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SchoolsListPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <SchoolsListContent />
    </AuthGuard>
  )
}
