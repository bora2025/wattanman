'use client'

import { useState, useEffect, useCallback } from 'react'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useLanguage } from '../../../lib/i18n'

interface StudentProfile {
  id: string
  studentNumber: string | null
  sex: string | null
  photo: string | null
  dateOfBirth: string | null
  address: string | null
  class: { id: string; name: string } | null
}

interface SearchResult {
  id: string
  email: string
  name: string
  phone: string | null
  photo: string | null
  role: string
  createdAt: string
  department: { id: string; name: string } | null
  studentProfile: StudentProfile | null
}

interface AttendanceRecord {
  date: string
  session: number
  status: string
  checkInTime: string | null
  permissionType: string | null
}

interface FeePayment {
  id: string
  amount: number
  note: string | null
  createdAt: string
}

interface FeeRecord {
  id: string
  totalAmount: number
  paidAmount: number
  dueDate: string
  term: string | null
  notes: string | null
  createdAt: string
  payments: FeePayment[]
}

interface ScoreEntryData {
  score: number | null
  subject: { name: string; maxScore: number; color: string }
  examTab: { id: string; label: string; type: string; order: number; scoreSheet: { id: string; name: string } }
}

interface ScheduleEntry {
  day: number
  period: number
  subject: { name: string; short: string; color: string | null }
  teacher: { firstName: string; lastName: string; short: string; color: string | null }
  classroom: { name: string; short: string } | null
}

interface ScheduleData {
  id: string
  name: string
  short: string
  timetable: {
    id: string; name: string; academicYear: string
    periodsPerDay: number; numberOfDays: number
    periodTimes: string | null; weekend: string[]
  }
  entries: ScheduleEntry[]
}

interface FullProfile {
  id: string
  email: string
  name: string
  phone: string | null
  photo: string | null
  role: string
  createdAt: string
  department: { id: string; name: string; nameKh: string | null } | null
  staffAttendances: AttendanceRecord[]
  scoreEntries: ScoreEntryData[]
  rankingMap: Record<string, { rank: number; total: number }>
  studentProfile: {
    id: string
    studentNumber: string | null
    sex: string | null
    photo: string | null
    dateOfBirth: string | null
    address: string | null
    class: { id: string; name: string } | null
    feeRecords: FeeRecord[]
    attendances: AttendanceRecord[]
  } | null
}

const roleBadge: Record<string, string> = {
  ADMIN: 'badge-blue',
  TEACHER: 'badge-green',
  STUDENT: 'badge-yellow',
  PARENT: 'badge-gray',
}


const statusColors: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  LATE: 'bg-amber-100 text-amber-700',
  ABSENT: 'bg-red-100 text-red-700',
  PERMISSION: 'bg-blue-100 text-blue-700',
  DAY_OFF: 'bg-slate-100 text-slate-500',
}

const statusKeys: Record<string, string> = {
  PRESENT: 'status.present',
  LATE: 'status.late',
  ABSENT: 'status.absent',
  PERMISSION: 'status.permission',
  DAY_OFF: 'status.dayOff',
}

const roleKeyMap: Record<string, string> = {
  ADMIN: 'role.admin',
  TEACHER: 'role.teacher',
  STUDENT: 'role.student',
  PARENT: 'role.parent',
}

/** Convert Google Drive sharing URLs to direct image URLs */
function normalizePhotoUrl(url: string): string {
  if (!url) return url
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}`
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}`
  const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/)
  if (m3) return `https://lh3.googleusercontent.com/d/${m3[1]}`
  return url
}

export default function SearchPage() {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [fullProfile, setFullProfile] = useState<FullProfile | null>(null)
  const [fullProfileLoading, setFullProfileLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'attendance' | 'fees' | 'scores' | 'schedule'>('profile')
  const [scheduleData, setScheduleData] = useState<ScheduleData | null | undefined>(undefined)
  const [scheduleLoading, setScheduleLoading] = useState(false)

  const doSearch = useCallback(async (q: string, role: string) => {
    setLoading(true)
    setHasSearched(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (role !== 'ALL') params.set('role', role)
      const res = await apiFetch(`/api/auth/users/search?${params}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search on query/filter change
  useEffect(() => {
    const timeout = setTimeout(() => {
      doSearch(query, roleFilter)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, roleFilter, doSearch])

  const handleSelectUser = async (user: SearchResult) => {
    setSelected(user)
    setFullProfile(null)
    setScheduleData(undefined)
    setActiveTab('profile')
    setFullProfileLoading(true)
    try {
      const res = await apiFetch(`/api/auth/users/${user.id}/full-profile`)
      if (res.ok) setFullProfile(await res.json())
    } catch {
      // ignore
    } finally {
      setFullProfileLoading(false)
    }
  }

  const handleTabChange = async (tab: typeof activeTab) => {
    setActiveTab(tab)
    if (tab === 'schedule' && selected && scheduleData === undefined) {
      setScheduleLoading(true)
      try {
        const res = await apiFetch(`/api/auth/users/${selected.id}/schedule`)
        setScheduleData(res.ok ? await res.json() : null)
      } catch {
        setScheduleData(null)
      } finally {
        setScheduleLoading(false)
      }
    }
  }

  const InfoBox = ({ label, value }: { label: string; value: string }) => (
    <div className="p-3 rounded-xl bg-slate-50">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-700 break-all">{value}</p>
    </div>
  )

  const roleFilters = ['ALL', 'STUDENT', 'TEACHER', 'ADMIN', 'PARENT'] as const

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">{t('search.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('search.subtitle')}</p>
        </div>

        <div className="page-body space-y-5">
          {/* Search Bar */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-lg flex-shrink-0">🔍</span>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                className="flex-1 py-2.5 bg-transparent border-0 outline-none focus:ring-0 text-sm text-slate-800 placeholder:text-slate-400"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-600 text-sm flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Role Filter Tabs */}
          <div className="flex gap-1 flex-wrap">
            {roleFilters.map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  roleFilter === r
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r === 'ALL' ? `${t('common.all')} (${results.length})` : `${t(roleKeyMap[r] || '')} (${results.filter(u => u.role === r).length})`}
              </button>
            ))}
          </div>

          {/* Results */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <div className="inline-block w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-2" />
              <p className="text-sm">{t('search.searching')}</p>
            </div>
          ) : hasSearched && results.length === 0 ? (
            <div className="empty-state">
              <p className="text-lg">{t('search.noResults')}</p>
              <p className="text-sm text-slate-400 mt-1">{t('search.noResultsHint')}</p>
            </div>
          ) : results.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('search.user')}</th>
                    <th>{t('common.email')}</th>
                    <th>{t('common.phone')}</th>
                    <th>{t('common.role')}</th>
                    <th>{t('search.classDept')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(user => (
                    <tr key={user.id} className="cursor-pointer hover:bg-indigo-50/50" onClick={() => handleSelectUser(user)}>
                      <td>
                        <div className="flex items-center gap-3">
                          {user.photo || user.studentProfile?.photo ? (
                            <img
                              src={normalizePhotoUrl(user.photo || user.studentProfile?.photo || '')}
                              alt={user.name}
                              className="w-9 h-9 rounded-full object-cover border-2 border-slate-200"
                              onError={e => {
                                e.currentTarget.style.display = 'none'
                                const el = e.currentTarget.nextElementSibling as HTMLElement | null
                                if (el) el.style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div
                            className="avatar avatar-sm"
                            style={{ display: (user.photo || user.studentProfile?.photo) ? 'none' : 'flex' }}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">{user.name}</span>
                            {user.studentProfile?.studentNumber && (
                              <p className="text-xs text-slate-400">#{user.studentProfile.studentNumber}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-slate-500 text-sm">{user.email}</td>
                      <td className="text-slate-500 text-sm" onClick={e => e.stopPropagation()}>
                        {user.phone
                          ? <a href={`tel:${user.phone}`} className="text-indigo-600 hover:underline font-medium">{user.phone}</a>
                          : '—'}
                      </td>
                      <td><span className={roleBadge[user.role] || 'badge-gray'}>{t(roleKeyMap[user.role] || '')}</span></td>
                      <td className="text-slate-500 text-sm">{user.studentProfile?.class?.name || user.department?.name || '—'}</td>
                      <td>
                        <button
                          onClick={e => { e.stopPropagation(); handleSelectUser(user) }}
                          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                          {t('common.view')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                {t('common.showing')} {results.length} {results.length !== 1 ? t('common.results') : t('common.result')}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-3 pt-8 overflow-y-auto"
          onClick={() => { setSelected(null); setFullProfile(null) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mb-8" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-4">
                {(selected.photo || selected.studentProfile?.photo) ? (
                  <img
                    src={normalizePhotoUrl(selected.photo || selected.studentProfile?.photo || '')}
                    alt={selected.name}
                    className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200 flex-shrink-0"
                    onError={e => {
                      e.currentTarget.style.display = 'none'
                      const el = e.currentTarget.nextElementSibling as HTMLElement | null
                      if (el) el.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  className="w-16 h-16 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold flex-shrink-0"
                  style={{ display: (selected.photo || selected.studentProfile?.photo) ? 'none' : 'flex' }}
                >
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 text-xl leading-tight">{selected.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`${roleBadge[selected.role] || 'badge-gray'} text-xs`}>{t(roleKeyMap[selected.role] || '')}</span>
                        {selected.studentProfile?.class && <span className="text-xs text-slate-500">📖 {selected.studentProfile.class.name}</span>}
                        {!selected.studentProfile && selected.department && <span className="text-xs text-slate-500">🏢 {selected.department.name}</span>}
                        {selected.studentProfile?.studentNumber && <span className="text-xs text-slate-400">#{selected.studentProfile.studentNumber}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelected(null); setFullProfile(null) }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs + Content */}
            {(() => {
              const isStudent = !!selected.studentProfile
              const tabs: { id: 'profile' | 'attendance' | 'fees' | 'scores' | 'schedule'; label: string }[] = [
                { id: 'profile', label: 'Profile' },
                { id: 'attendance', label: 'Attendance (30d)' },
                ...(isStudent ? [{ id: 'schedule' as const, label: 'Schedule' }] : []),
                ...(isStudent ? [{ id: 'fees' as const, label: 'Fees' }] : []),
                ...(isStudent ? [{ id: 'scores' as const, label: 'Scores' }] : []),
              ]
              return (
                <>
                  <div className="border-b border-slate-100 px-5">
                    <div className="flex">
                      {tabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 max-h-[55vh] overflow-y-auto">
                    {fullProfileLoading ? (
                      <div className="text-center py-10">
                        <div className="inline-block w-7 h-7 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-sm text-slate-400 mt-2">Loading…</p>
                      </div>
                    ) : fullProfile ? (
                      <>
                        {/* ── Profile Tab ── */}
                        {activeTab === 'profile' && (
                          <div className="grid grid-cols-2 gap-3">
                            <InfoBox label={t('common.email')} value={fullProfile.email} />
                            <div className="p-3 rounded-xl bg-slate-50">
                              <p className="text-xs text-slate-400 mb-1">{t('common.phone')}</p>
                              {fullProfile.phone
                                ? <a href={`tel:${fullProfile.phone}`} className="text-sm font-medium text-indigo-600 hover:underline">📞 {fullProfile.phone}</a>
                                : <p className="text-sm font-medium text-slate-700">—</p>}
                            </div>
                            {fullProfile.studentProfile ? (
                              <>
                                <InfoBox label={t('search.studentId')} value={`#${fullProfile.studentProfile.studentNumber || '—'}`} />
                                <InfoBox label={t('common.sex')} value={
                                  fullProfile.studentProfile.sex === 'MALE' ? `♂ ${t('common.male')}` :
                                  fullProfile.studentProfile.sex === 'FEMALE' ? `♀ ${t('common.female')}` : '—'
                                } />
                                <InfoBox label={t('common.dateOfBirth')} value={
                                  fullProfile.studentProfile.dateOfBirth
                                    ? new Date(fullProfile.studentProfile.dateOfBirth).toLocaleDateString()
                                    : '—'
                                } />
                                <InfoBox label={t('common.class')} value={fullProfile.studentProfile.class?.name || t('search.unassigned')} />
                                <div className="col-span-2">
                                  <InfoBox label={t('common.address')} value={fullProfile.studentProfile.address || '—'} />
                                </div>
                              </>
                            ) : (
                              <>
                                <InfoBox label={t('common.position')} value={t(roleKeyMap[fullProfile.role] || '')} />
                                <InfoBox label={t('common.department')} value={fullProfile.department?.name || '—'} />
                                <InfoBox label={t('common.joined')} value={new Date(fullProfile.createdAt).toLocaleDateString()} />
                              </>
                            )}
                          </div>
                        )}

                        {/* ── Attendance Tab ── */}
                        {activeTab === 'attendance' && (() => {
                          const records = fullProfile.studentProfile
                            ? fullProfile.studentProfile.attendances
                            : fullProfile.staffAttendances
                          const byDate: Record<string, typeof records> = {}
                          records.forEach(r => {
                            const day = (r.date as string).slice(0, 10)
                            if (!byDate[day]) byDate[day] = []
                            byDate[day].push(r)
                          })
                          const days = Object.keys(byDate).sort().reverse()
                          const counts = {
                            PRESENT: records.filter(r => r.status === 'PRESENT').length,
                            LATE: records.filter(r => r.status === 'LATE').length,
                            ABSENT: records.filter(r => r.status === 'ABSENT').length,
                            PERMISSION: records.filter(r => r.status === 'PERMISSION').length,
                          }
                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-4 gap-2">
                                {(Object.entries(counts) as [string, number][]).map(([st, cnt]) => (
                                  <div key={st} className={`rounded-xl p-3 text-center ${statusColors[st] || 'bg-slate-50 text-slate-500'}`}>
                                    <p className="text-xl font-bold">{cnt}</p>
                                    <p className="text-xs font-medium mt-0.5">{t(statusKeys[st] || '') || st}</p>
                                  </div>
                                ))}
                              </div>
                              {days.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-4">{t('search.noAttendanceData')}</p>
                              ) : (
                                <div className="space-y-1">
                                  {days.map(day => (
                                    <div key={day} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                                      <span className="text-xs text-slate-500 w-28 flex-shrink-0">
                                        {new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}
                                      </span>
                                      <div className="flex gap-1 flex-wrap">
                                        {[1, 2, 3, 4].map(s => {
                                          const rec = byDate[day]?.find(r => r.session === s)
                                          return rec ? (
                                            <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusColors[rec.status] || 'bg-slate-100 text-slate-500'}`}>
                                              S{s} {t(statusKeys[rec.status] || '') || rec.status}
                                            </span>
                                          ) : null
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* ── Fees Tab ── */}
                        {activeTab === 'fees' && fullProfile.studentProfile && (() => {
                          const records = fullProfile.studentProfile.feeRecords
                          const totalBilled = records.reduce((s, r) => s + r.totalAmount, 0)
                          const totalPaid = records.reduce((s, r) => s + r.paidAmount, 0)
                          const getFeeStatus = (r: FeeRecord) => {
                            if (r.paidAmount >= r.totalAmount) return 'PAID'
                            if (r.paidAmount > 0) return 'PARTIAL'
                            if (new Date(r.dueDate) < new Date()) return 'OVERDUE'
                            return 'UNPAID'
                          }
                          const feeStatusColor: Record<string, string> = {
                            PAID: 'bg-emerald-100 text-emerald-700',
                            PARTIAL: 'bg-amber-100 text-amber-700',
                            OVERDUE: 'bg-red-100 text-red-700',
                            UNPAID: 'bg-slate-100 text-slate-500',
                          }
                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-3">
                                <div className="bg-slate-50 rounded-xl p-3 text-center">
                                  <p className="text-xl font-bold text-slate-700">{records.length}</p>
                                  <p className="text-xs text-slate-400">Records</p>
                                </div>
                                <div className="bg-blue-50 rounded-xl p-3 text-center">
                                  <p className="text-xl font-bold text-blue-700">${totalBilled.toFixed(0)}</p>
                                  <p className="text-xs text-blue-400">Billed</p>
                                </div>
                                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                  <p className="text-xl font-bold text-emerald-700">${totalPaid.toFixed(0)}</p>
                                  <p className="text-xs text-emerald-400">Paid</p>
                                </div>
                              </div>
                              {records.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-4">No fee records</p>
                              ) : (
                                <div className="space-y-2">
                                  {records.map(r => {
                                    const st = getFeeStatus(r)
                                    const pct = r.totalAmount > 0 ? Math.min(100, Math.round((r.paidAmount / r.totalAmount) * 100)) : 0
                                    return (
                                      <div key={r.id} className="border border-slate-200 rounded-xl p-3">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div>
                                            <p className="text-sm font-semibold text-slate-700">{r.term || 'General'}</p>
                                            <p className="text-xs text-slate-400">Due: {new Date(r.dueDate).toLocaleDateString()}</p>
                                          </div>
                                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${feeStatusColor[st]}`}>{st}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="text-xs text-slate-500 flex-shrink-0">${r.paidAmount.toFixed(0)} / ${r.totalAmount.toFixed(0)}</span>
                                        </div>
                                        {r.payments.length > 0 && (
                                          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                            {r.payments.map(p => (
                                              <div key={p.id} className="flex items-center justify-between text-xs text-slate-500">
                                                <span>{new Date(p.createdAt).toLocaleDateString()}{p.note ? ` — ${p.note}` : ''}</span>
                                                <span className="text-emerald-600 font-medium">+${p.amount.toFixed(0)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* ── Scores Tab ── */}
                        {activeTab === 'scores' && fullProfile.studentProfile && (() => {
                          const entries = fullProfile.scoreEntries
                          if (entries.length === 0) {
                            return <p className="text-center text-sm text-slate-400 py-4">No score data</p>
                          }
                          type SheetMap = Record<string, { sheetName: string; tabs: Record<string, { tabLabel: string; tabId: string; order: number; entries: ScoreEntryData[] }> }>
                          const bySheet: SheetMap = {}
                          entries.forEach(e => {
                            const sid = e.examTab.scoreSheet.id
                            if (!bySheet[sid]) bySheet[sid] = { sheetName: e.examTab.scoreSheet.name, tabs: {} }
                            const tid = e.examTab.id
                            if (!bySheet[sid].tabs[tid]) bySheet[sid].tabs[tid] = { tabLabel: e.examTab.label, tabId: tid, order: e.examTab.order, entries: [] }
                            bySheet[sid].tabs[tid].entries.push(e)
                          })
                          return (
                            <div className="space-y-5">
                              {Object.values(bySheet).map(sheet => (
                                <div key={sheet.sheetName}>
                                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{sheet.sheetName}</p>
                                  <div className="space-y-3">
                                    {Object.values(sheet.tabs).sort((a, b) => a.order - b.order).map(tab => {
                                      const ranking = fullProfile.rankingMap[tab.tabId]
                                      const totalScore = tab.entries.reduce((s, e) => s + (e.score ?? 0), 0)
                                      const maxTotal = tab.entries.reduce((s, e) => s + e.subject.maxScore, 0)
                                      return (
                                        <div key={tab.tabId} className="border border-slate-200 rounded-xl p-3">
                                          <div className="flex items-center justify-between mb-3">
                                            <p className="text-sm font-semibold text-slate-700">{tab.tabLabel}</p>
                                            <div className="flex items-center gap-2">
                                              {ranking && ranking.rank > 0 && (
                                                <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                                                  🏆 #{ranking.rank}/{ranking.total}
                                                </span>
                                              )}
                                              <span className="text-sm font-bold text-slate-700">{totalScore.toFixed(1)}/{maxTotal}</span>
                                            </div>
                                          </div>
                                          <div className="space-y-1.5">
                                            {tab.entries.map((e, i) => {
                                              const pct = e.subject.maxScore > 0 ? Math.min(100, (e.score ?? 0) / e.subject.maxScore * 100) : 0
                                              return (
                                                <div key={i} className="flex items-center gap-2">
                                                  <span className="text-xs text-slate-600 w-28 truncate flex-shrink-0">{e.subject.name}</span>
                                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: e.subject.color || '#6366f1' }} />
                                                  </div>
                                                  <span className="text-xs text-slate-700 font-medium w-14 text-right flex-shrink-0">
                                                    {e.score !== null ? e.score : '—'}/{e.subject.maxScore}
                                                  </span>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                        {/* ── Schedule Tab ── */}
                        {activeTab === 'schedule' && fullProfile.studentProfile && (() => {
                          if (scheduleLoading) return (
                            <div className="text-center py-10">
                              <div className="inline-block w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                              <p className="text-sm text-slate-400 mt-2">Loading schedule…</p>
                            </div>
                          )
                          if (!scheduleData) return (
                            <p className="text-center text-sm text-slate-400 py-6">No published timetable found for this student's class.</p>
                          )
                          const tt = scheduleData.timetable
                          const periodTimes: string[] = tt.periodTimes ? JSON.parse(tt.periodTimes) : []
                          const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                          const dayNums = Array.from({ length: tt.numberOfDays }, (_, i) => i + 1)
                          const periods = Array.from({ length: tt.periodsPerDay }, (_, i) => i + 1)
                          const entryMap: Record<string, ScheduleEntry> = {}
                          scheduleData.entries.forEach(e => { entryMap[`${e.day}_${e.period}`] = e })
                          return (
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs text-slate-500">{tt.name} · {tt.academicYear}</p>
                                <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Published</span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr>
                                      <th className="px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-400 font-medium w-10 text-center">#</th>
                                      {dayNums.map(d => (
                                        <th key={d} className="px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 font-semibold text-center">{allDays[d - 1]}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {periods.map(p => (
                                      <tr key={p}>
                                        <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-400 font-medium bg-slate-50">
                                          <div>{p}</div>
                                          {periodTimes[p - 1] && <div className="text-[9px] text-slate-300">{periodTimes[p - 1]}</div>}
                                        </td>
                                        {dayNums.map(d => {
                                          const entry = entryMap[`${d}_${p}`]
                                          if (!entry) return (
                                            <td key={d} className="px-1 py-1 border border-slate-100 bg-white" />
                                          )
                                          const bg = entry.subject.color ? `${entry.subject.color}22` : '#f1f5f9'
                                          const fg = entry.subject.color || '#475569'
                                          return (
                                            <td key={d} className="px-1 py-1 border border-slate-100" style={{ backgroundColor: bg }}>
                                              <div className="font-semibold truncate" style={{ color: fg }}>{entry.subject.short}</div>
                                              <div className="text-slate-500 truncate">{[entry.teacher.firstName, entry.teacher.lastName].filter(Boolean).join(' ')}</div>
                                              {entry.classroom && <div className="text-slate-400 truncate">{entry.classroom.short}</div>}
                                            </td>
                                          )
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )
                        })()}
                      </>
                    ) : (
                      <p className="text-center text-sm text-slate-400 py-6">Could not load profile data.</p>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
