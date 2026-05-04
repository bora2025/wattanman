'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../../../../components/Sidebar'
import { adminNav } from '../../../../lib/admin-nav'
import { apiFetch } from '../../../../lib/api'
import { useLanguage } from '../../../../lib/i18n'

const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'PERMISSION', 'DAY_OFF']

interface SessionRecord {
  session: number
  attendanceId: string | null
  status: string | null
  permissionType?: string | null
  permissionStartDate?: string | null
  permissionEndDate?: string | null
  checkInTime: string | null
  checkOutTime: string | null
}

interface StudentRow {
  studentId: string
  studentNumber: string
  studentName: string
  sessions: SessionRecord[]
}

interface ClassItem {
  id: string
  name: string
  subject: string | null
}

const permissionScopeLabel = (type: string) => {
  if (type === 'HALF_DAY_MORNING') return 'Morning sessions (1-2)'
  if (type === 'HALF_DAY_AFTERNOON') return 'Afternoon sessions (3-4)'
  if (type === 'MULTI_DAY') return 'All sessions (1-4) across selected date range'
  return 'All sessions (1-4)'
}

export default function EditAttendance() {
  const { t } = useLanguage()
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [permissionTypes, setPermissionTypes] = useState<Record<string, string>>({})


  useEffect(() => { fetchClasses() }, [])

  useEffect(() => {
    if (selectedClassId && selectedDate) fetchRecords()
  }, [selectedClassId, selectedDate])

  const fetchClasses = async () => {
    try {
      const res = await apiFetch('/api/classes')
      if (res.ok) {
        const data = await res.json()
        setClasses(data)
        if (data.length > 0) setSelectedClassId(data[0].id)
      }
    } catch (e) { console.error('Error fetching classes:', e) }
  }

  const fetchRecords = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/attendance/records?classId=${selectedClassId}&date=${selectedDate}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data)
        // Initialize per-row permissionType from server data — infer scope from actual PERMISSION sessions
        const init: Record<string, string> = {}
        data.forEach((row: StudentRow) => {
          const amPerm = row.sessions.some((s: SessionRecord) => (s.session === 1 || s.session === 2) && s.status === 'PERMISSION')
          const pmPerm = row.sessions.some((s: SessionRecord) => (s.session === 3 || s.session === 4) && s.status === 'PERMISSION')
          if (amPerm && pmPerm) {
            const stored = row.sessions.find((s: SessionRecord) => s.permissionType === 'MULTI_DAY')
            init[row.studentId] = stored ? 'MULTI_DAY' : 'FULL_DAY'
          } else if (amPerm) {
            init[row.studentId] = 'HALF_DAY_MORNING'
          } else if (pmPerm) {
            init[row.studentId] = 'HALF_DAY_AFTERNOON'
          }
        })
        setPermissionTypes(init)
      } else setError('Failed to load attendance records.')
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to connect to server.')
    } finally { setLoading(false) }
  }

  const handleStatusChange = async (studentRow: StudentRow, session: number, newStatus: string) => {
    const sessionRec = studentRow.sessions.find(s => s.session === session)
    if (!sessionRec) return

    // "Not Set" selected: delete the existing record if one exists
    if (newStatus === '') {
      if (!sessionRec.attendanceId) return
      setSaving(`${studentRow.studentId}-${session}`)
      setError('')
      setSuccess('')
      try {
        const res = await apiFetch('/api/attendance/record', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendanceId: sessionRec.attendanceId }),
        })
        if (!res.ok) throw new Error('Failed to delete')
        setSuccess(`Cleared ${studentRow.studentName} session ${session}`)
        setTimeout(() => setSuccess(''), 3000)
        await fetchRecords()
      } catch {
        setError('Failed to clear record. Please try again.')
      } finally { setSaving(null) }
      return
    }

    setSaving(`${studentRow.studentId}-${session}`)
    setError('')
    setSuccess('')

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      if (sessionRec.attendanceId) {
        // Update existing record
        const res = await apiFetch('/api/attendance/update', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            attendanceId: sessionRec.attendanceId,
            status: newStatus,
            ...(newStatus === 'PERMISSION' ? {
              permissionType: permissionTypes[studentRow.studentId] || (session <= 2 ? 'HALF_DAY_MORNING' : 'HALF_DAY_AFTERNOON'),
              permissionStartDate: selectedDate,
              permissionEndDate: selectedDate,
            } : {}),
          }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } else {
        // Create new record
        const res = await apiFetch('/api/attendance/create-record', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            studentId: studentRow.studentId,
            classId: selectedClassId,
            session,
            status: newStatus,
            date: selectedDate,
            ...(newStatus === 'PERMISSION' ? {
              permissionType: permissionTypes[studentRow.studentId] || (session <= 2 ? 'HALF_DAY_MORNING' : 'HALF_DAY_AFTERNOON'),
              permissionStartDate: selectedDate,
              permissionEndDate: selectedDate,
            } : {}),
          }),
        })
        if (!res.ok) throw new Error('Failed to create')
      }

      setSuccess(`Updated ${studentRow.studentName} session ${session} to ${newStatus}`)
      setTimeout(() => setSuccess(''), 3000)
      await fetchRecords()
    } catch {
      setError('Failed to save change. Please try again.')
    } finally { setSaving(null) }
  }

  const handlePermissionTypeChange = async (studentRow: StudentRow, newType: string) => {
    setPermissionTypes(prev => ({ ...prev, [studentRow.studentId]: newType }))

    const hasPermissionSession = studentRow.sessions.some(s => s.status === 'PERMISSION')
    if (!hasPermissionSession) return

    setSaving(`${studentRow.studentId}-perm`)
    setError('')
    setSuccess('')

    try {
      const res = await apiFetch('/api/attendance/edit-permission-type', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentRow.studentId,
          classId: selectedClassId,
          date: selectedDate,
          permissionType: newType,
        }),
      })
      if (!res.ok) throw new Error('Failed to update permission type')
      setSuccess(`Updated ${studentRow.studentName}: ${permissionScopeLabel(newType)}`)
      setTimeout(() => setSuccess(''), 3000)
      await fetchRecords()
    } catch {
      setError('Failed to update permission type. Please try again.')
    } finally {
      setSaving(null)
    }
  }

  const goDay = (offset: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + offset)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const dayLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || ''

  const statusColor = (s: string | null) => {
    switch (s) {
      case 'PRESENT': return 'bg-emerald-100 text-emerald-800 border-emerald-300'
      case 'LATE': return 'bg-amber-100 text-amber-800 border-amber-300'
      case 'ABSENT': return 'bg-red-100 text-red-800 border-red-300'
      case 'PERMISSION': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'DAY_OFF': return 'bg-purple-100 text-purple-800 border-purple-300'
      default: return 'bg-slate-100 text-slate-500 border-slate-300'
    }
  }

  const sessionLabel = (n: number) => {
    switch (n) {
      case 1: return t('editAttendance.morning1')
      case 2: return t('editAttendance.morning2')
      case 3: return t('editAttendance.afternoon1')
      case 4: return t('editAttendance.afternoon2')
      default: return `Session ${n}`
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'PRESENT': return t('common.present')
      case 'LATE': return t('common.late')
      case 'ABSENT': return t('common.absent')
      case 'PERMISSION': return t('common.permission')
      case 'DAY_OFF': return t('common.dayOff')
      default: return s
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">{t('editAttendance.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('editAttendance.updateStudentDesc')}</p>
        </div>
        <div className="page-body space-y-6">
          {/* Controls */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Class</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name} — {cls.subject || 'N/A'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => goDay(-1)} className="px-2 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm">◀</button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <button onClick={() => goDay(1)} className="px-2 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm">▶</button>
                </div>
              </div>
              <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} className="btn-ghost btn-sm">
                📅 Today
              </button>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-700">{dayLabel} — {selectedClassName}</p>
          </div>

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
              <span>✅</span> {success}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
          )}

          {loading ? (
            <div className="card p-12">
              <div className="empty-state">
                <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-slate-500 mt-3">Loading…</p>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="card p-12">
              <div className="empty-state">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-semibold text-slate-600">{t('editAttendance.noStudentsFound')}</p>
                <p className="text-sm text-slate-400 mt-1">{t('editAttendance.selectClassToEdit')}</p>
              </div>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-3 font-semibold">ID</th>
                      <th className="px-3 py-3 font-semibold">{t('editAttendance.studentName')}</th>
                      {[1, 2, 3, 4].map(s => (
                        <th key={s} className="px-3 py-3 font-semibold text-center">
                          <div>{sessionLabel(s)}</div>
                        </th>
                      ))}
                      <th className="px-3 py-3 font-semibold text-center">Permission Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.studentId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-600 font-mono text-xs">{row.studentNumber}</td>
                        <td className="px-3 py-2.5 text-slate-800 font-medium">{row.studentName}</td>
                        {row.sessions.map(sess => (
                          <td key={sess.session} className="px-3 py-2.5 text-center">
                            <select
                              value={sess.status || ''}
                              onChange={(e) => handleStatusChange(row, sess.session, e.target.value)}
                              disabled={saving === `${row.studentId}-${sess.session}`}
                              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none cursor-pointer transition-colors ${statusColor(sess.status)} ${
                                saving === `${row.studentId}-${sess.session}` ? 'opacity-50' : ''
                              }`}
                            >
                              <option value="">{t('editAttendance.notSet')}</option>
                              {STATUSES.map(st => (
                                <option key={st} value={st}>{statusLabel(st)}</option>
                              ))}
                            </select>
                          </td>
                        ))}
                         <td className="px-3 py-2.5 text-center">
                           {row.sessions.some(s => s.status === 'PERMISSION') ? (
                             <select
                               value={permissionTypes[row.studentId] || 'FULL_DAY'}
                               onChange={(e) => handlePermissionTypeChange(row, e.target.value)}
                               disabled={saving !== null}
                               className="rounded-lg border border-blue-200 bg-blue-50 text-blue-800 px-2 py-1.5 text-xs font-semibold outline-none cursor-pointer disabled:opacity-50"
                             >
                               <option value="HALF_DAY_MORNING">🌅 Half Day (AM)</option>
                               <option value="HALF_DAY_AFTERNOON">🌤️ Half Day (PM)</option>
                               <option value="FULL_DAY">☀️ Full Day</option>
                               <option value="MULTI_DAY">📅 Many Days</option>
                             </select>
                           ) : (
                             <span className="text-xs text-slate-300">—</span>
                           )}
                         </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
