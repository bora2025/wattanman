"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import AuthGuard from '../../components/AuthGuard'
import { platformNav } from '../../lib/platform-nav'
import { apiFetch } from '../../lib/api'

interface PlatformStats {
  totalSchools: number
  activeSchools: number
  suspendedSchools: number
  trialSchools: number
  totalStudents: number
  totalStaff: number
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  )
}

function DashboardContent() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/platform/schools/stats')
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setStats(await res.json())
      })
      .catch(() => setError('Failed to load platform stats'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Platform Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cross-school metrics for the Wattaman platform tier.</p>
        </div>

        <div className="page-body space-y-6">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : stats && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Total Schools" value={stats.totalSchools} color="#334155" />
                <StatCard label="Active" value={stats.activeSchools} color="#059669" />
                <StatCard label="Suspended" value={stats.suspendedSchools} color="#DC2626" />
                <StatCard label="Trial" value={stats.trialSchools} color="#D97706" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Students (all schools)" value={stats.totalStudents} color="#4F46E5" />
                <StatCard label="Total Staff (all schools)" value={stats.totalStaff} color="#0891B2" />
              </div>
            </>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Link href="/platform/schools/new" className="card p-5 hover:shadow-lg transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">🏫</div>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">Onboard a new school</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Create a school + its first admin account</div>
                </div>
              </div>
            </Link>
            <Link href="/platform/schools" className="card p-5 hover:shadow-lg transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">📋</div>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">Manage schools</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Suspend, reactivate, impersonate, or delete</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlatformDashboardPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <DashboardContent />
    </AuthGuard>
  )
}
