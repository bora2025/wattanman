"use client"

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import AuthGuard from '../../components/AuthGuard'
import { apiFetch } from '../../lib/api'

interface Child { id: string; userId: string; user: { name: string; photo: string | null }; class: { name: string; subject: string } | null }

const parentNav = [
  { label: 'Dashboard', href: '/parent', icon: '🏠' },
  { label: 'Attendance', href: '/parent/attendance', icon: '📅' },
  { label: 'Grades', href: '/parent/grades', icon: '📊' },
  { label: 'Messages', href: '/parent/messages', icon: '💬' },
  { label: 'Fees', href: '/parent/fees', icon: '💰' },
  { label: 'Bus Tracker', href: '/parent/bus', icon: '🚌' },
]

export default function ParentDashboard() {
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)

  const { data: children = [] as Child[], isLoading, isError, refetch } = useQuery<Child[]>({
    queryKey: ['parent-children'],
    queryFn: async () => { const r = await apiFetch('/api/parent/children'); if (!r.ok) throw new Error(); return r.json() },
  })

  // Set initial child once data loads
  if (!selectedChild && children.length) {
    setSelectedChild(children[0])
  }

  return (
    <AuthGuard allowedRoles={['PARENT', 'ADMIN']}>
      <div className="flex min-h-screen bg-slate-50">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-slate-200 flex flex-col p-4">
          <p className="text-sm font-bold text-slate-600 mb-4 uppercase tracking-wide">Parent Portal</p>
          <nav className="space-y-1 flex-1">
            {parentNav.map(item => (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800">
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-800 mb-6">Parent Dashboard</h1>

          {/* Child Selector */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">My Children</h2>
            {isLoading ? (
              <div className="flex gap-3">{[1,2].map(i => <div key={i} className="w-24 h-24 bg-slate-200 rounded-2xl animate-pulse" />)}</div>
            ) : isError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-600 text-sm mb-1">Failed to load children</p>
                <button onClick={() => refetch()} className="text-xs text-red-500 underline">Retry</button>
              </div>
            ) : children.length === 0 ? (
              <p className="text-slate-400 text-sm">No students linked to your account. Contact admin.</p>
            ) : (
              <div className="flex gap-3 flex-wrap">
                {children.map(child => (
                  <button key={child.id} onClick={() => setSelectedChild(child)}
                    className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all ${selectedChild?.id === child.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center mb-2">
                      {child.user.photo ? <img src={child.user.photo} alt={child.user.name} className="w-full h-full object-cover" /> : <span className="text-2xl">👤</span>}
                    </div>
                    <p className="text-xs font-semibold text-slate-700 text-center max-w-[80px] truncate">{child.user.name}</p>
                    <p className="text-xs text-slate-400 text-center">{child.class?.name ?? '—'}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Quick links */}
          {selectedChild && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Access — {selectedChild.user.name}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Attendance', href: '/parent/attendance', icon: '📅', color: 'bg-sky-50 text-sky-700 border-sky-200' },
                  { label: 'Grades', href: '/parent/grades', icon: '📊', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                  { label: 'Messages', href: '/parent/messages', icon: '💬', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { label: 'Fees', href: '/parent/fees', icon: '💰', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                  { label: 'Bus Tracker', href: '/parent/bus', icon: '🚌', color: 'bg-rose-50 text-rose-700 border-rose-200' },
                ].map(item => (
                  <Link key={item.href} href={item.href}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border ${item.color} font-medium text-sm hover:opacity-80 transition-opacity`}>
                    <span className="text-2xl mb-1">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </AuthGuard>
  )
}
