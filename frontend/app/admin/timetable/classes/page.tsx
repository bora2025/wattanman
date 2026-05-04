'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../../components/Sidebar'
import AuthGuard from '../../../../components/AuthGuard'
import { adminNav } from '../../../../lib/admin-nav'
import { apiFetch } from '../../../../lib/api'

interface TimetableListItem { id: string; name: string; academicYear: string }
interface TClass {
  id: string; name: string; short: string
  color: string | null; printSubjectPicture: boolean
  classTeacher?: { lastName: string; firstName: string } | null
}

const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6',
  '#06b6d4','#3b82f6','#6366f1','#8b5cf6','#ec4899','#64748b',
]

export default function ClassesPage() {
  const router = useRouter()
  const [timetables, setTimetables] = useState<TimetableListItem[]>([])
  const [selectedTT, setSelectedTT] = useState('')
  const [classes, setClasses] = useState<TClass[]>([])
  const [loading, setLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<TClass | null>(null)
  const [fName, setFName] = useState('')
  const [fShort, setFShort] = useState('')
  const [fColor, setFColor] = useState('#3b82f6')
  const [fPrint, setFPrint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchTimetables = useCallback(async () => {
    const res = await apiFetch('/api/timetable')
    if (res.ok) {
      const list = await res.json()
      setTimetables(list)
      if (list.length > 0 && !selectedTT) setSelectedTT(list[0].id)
    }
  }, [selectedTT])

  const fetchClasses = useCallback(async () => {
    if (!selectedTT) return
    setLoading(true)
    const res = await apiFetch(`/api/timetable/${selectedTT}`)
    if (res.ok) { const tt = await res.json(); setClasses(tt.classes ?? []) }
    setLoading(false)
  }, [selectedTT])

  useEffect(() => { fetchTimetables() }, [fetchTimetables])
  useEffect(() => { fetchClasses() }, [fetchClasses])

  function openModal(item?: TClass) {
    setEditing(item ?? null)
    setFName(item?.name ?? ''); setFShort(item?.short ?? '')
    setFColor(item?.color ?? '#3b82f6'); setFPrint(item?.printSubjectPicture ?? false)
    setShowModal(true)
  }

  async function handleSave() {
    if (!selectedTT || !fName || !fShort) return
    setSaving(true)
    const url = editing ? `/api/timetable/classes/${editing.id}` : `/api/timetable/${selectedTT}/classes`
    await apiFetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fName, short: fShort, color: fColor, printSubjectPicture: fPrint }),
    })
    await fetchClasses(); setShowModal(false); setSaving(false)
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/timetable/classes/${id}`, { method: 'DELETE' })
    await fetchClasses(); setDeleteId(null)
  }

  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <div className="flex h-screen bg-gray-100">
        <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <button onClick={() => router.push('/admin/timetable')} className="text-indigo-600 text-sm hover:underline mb-1">← Back to Timetable</button>
              <h1 className="text-xl font-bold text-gray-800">Classes</h1>
              <p className="text-sm text-gray-500">Manage classes for your timetable</p>
            </div>
            <button onClick={() => openModal()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700">+ New Class</button>
          </div>
          <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3">
            <label className="text-sm text-gray-600 font-medium">Timetable:</label>
            <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedTT} onChange={e => setSelectedTT(e.target.value)}>
              {timetables.map(tt => <option key={tt.id} value={tt.id}>{tt.name} · {tt.academicYear}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {loading ? <div className="text-gray-400 text-center py-20">Loading…</div>
              : classes.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <p className="text-lg mb-2">No classes yet</p>
                  <p className="text-sm">Click "+ New Class" to add the first class.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Short</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Color</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Print Pic</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Class Teacher</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                    </tr></thead>
                    <tbody>
                      {classes.map(c => (
                        <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold text-white"
                              style={{ backgroundColor: c.color ?? '#3b82f6' }}>{c.short}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: c.color ?? '#3b82f6' }} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.printSubjectPicture ? '✓' : '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {c.classTeacher ? `${c.classTeacher.lastName} ${c.classTeacher.firstName}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => openModal(c)} className="text-blue-600 hover:underline text-sm mr-3">Edit</button>
                            <button onClick={() => setDeleteId(c.id)} className="text-red-500 hover:underline text-sm">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editing ? 'Edit Class' : 'New Class'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Class Name</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Grade 1A" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Short Name</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={fShort} onChange={e => setFShort(e.target.value)} maxLength={8} placeholder="e.g. G1A" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Color / Picture</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {COLOR_PALETTE.map(c => (
                    <button key={c} type="button" onClick={() => setFColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${fColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={fColor} onChange={e => setFColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={fPrint} onChange={e => setFPrint(e.target.checked)} className="rounded" />
                Print subject picture on timetable
              </label>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving || !fName || !fShort}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
                {saving ? 'Saving…' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-gray-800 font-semibold mb-4">Remove this class?</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Remove</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  )
}
