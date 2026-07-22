"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { adminNav, classAdminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

interface ClassRegistrationItem {
  id: string
  nameKh: string
  nameEn: string
  email: string
  phone: string
  photo: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectReason: string | null
  createdAt: string
  resolvedAt: string | null
  class: { id: string; name: string } | null
}

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

export default function AdminClassRegistrationsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('PENDING')
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})
  const isClassAdmin = typeof window !== 'undefined' && localStorage.getItem('role') === 'CLASS_ADMIN'

  const { data, isLoading } = useQuery<ClassRegistrationItem[]>({
    queryKey: ['admin-class-registrations', tab],
    queryFn: async () => {
      const qs = tab === 'ALL' ? '' : `?status=${tab}`
      const r = await apiFetch(`/api/class-registrations${qs}`)
      if (!r.ok) throw new Error('Failed to load registrations')
      return r.json()
    },
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action, rejectReason }: { id: string; action: 'APPROVE' | 'REJECT'; rejectReason?: string }) => {
      const r = await apiFetch(`/api/class-registrations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejectReason }),
      })
      if (!r.ok) {
        let msg = `Failed (${r.status})`
        try { const j = await r.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message } catch {}
        throw new Error(msg)
      }
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-class-registrations'] })
    },
    onError: (e: any, vars) => setErrorMap(m => ({ ...m, [vars.id]: e?.message ?? 'Failed' })),
  })

  const approve = (id: string) => {
    setErrorMap(m => ({ ...m, [id]: '' }))
    resolveMutation.mutate({ id, action: 'APPROVE' })
  }
  const reject = (id: string) => {
    const reason = window.prompt('Reason for rejecting (optional):') ?? undefined
    setErrorMap(m => ({ ...m, [id]: '' }))
    resolveMutation.mutate({ id, action: 'REJECT', rejectReason: reason })
  }

  return (
    <AuthGuard requiredRole="CLASS_ADMIN">
      <div className="flex min-h-screen bg-slate-50 pt-14 lg:pt-0 pb-[72px] lg:pb-0">
        <Sidebar title="Admin" subtitle="Portal" navItems={isClassAdmin ? classAdminNav : adminNav} accentColor="indigo" />
        <main className="flex-1 p-6">
          <div className="mb-4">
            <Link href="/admin" className="text-xs text-indigo-600 hover:underline">← Dashboard</Link>
            <h1 className="text-2xl font-bold text-slate-800 mt-2">Class Registrations</h1>
            <p className="text-sm text-slate-500 mt-1">Approve or reject student self-registration requests submitted from the public registration page.</p>
          </div>

          <div className="flex gap-2 mb-4">
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs rounded-lg border ${tab === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-slate-500 text-sm">Loading…</div>
          ) : !data?.length ? (
            <div className="bg-white border border-slate-100 rounded-xl p-6 text-sm text-slate-500">No registrations.</div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2">Photo</th>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Class</th>
                    <th className="text-left px-4 py-2">Email</th>
                    <th className="text-left px-4 py-2">Phone</th>
                    <th className="text-left px-4 py-2">Submitted</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <div className="w-9 h-9 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center text-xs font-bold text-slate-500">
                          {r.photo ? <img src={r.photo} alt={r.nameEn} className="w-full h-full object-cover" /> : r.nameEn.charAt(0).toUpperCase()}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{r.nameEn}</div>
                        <div className="text-xs text-slate-500">{r.nameKh}</div>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{r.class?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-700">{r.email}</td>
                      <td className="px-4 py-2 text-slate-600">{r.phone}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {r.status}
                        </span>
                        {r.status === 'REJECTED' && r.rejectReason && (
                          <div className="text-xs text-red-600 mt-1">{r.rejectReason}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => approve(r.id)}
                              disabled={resolveMutation.isPending}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => reject(r.id)}
                              disabled={resolveMutation.isPending}
                              className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        {errorMap[r.id] && <div className="text-xs text-red-600 mt-1">{errorMap[r.id]}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  )
}
