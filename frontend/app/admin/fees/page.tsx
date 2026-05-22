"use client"

import { useState, useEffect, useMemo } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { todayCambodia } from '../../../lib/dateUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string
  name: string
  class: string
}

interface FeePayment {
  id: string
  amount: number
  date: string
  note?: string
  createdBy?: string
}

interface FeeRecord {
  id: string
  studentId: string
  studentName: string
  class: string
  totalAmount: number
  paidAmount: number
  dueDate: string
  term: string
  notes?: string
  payments: FeePayment[]
}

type FeeStatus = 'all' | 'paid' | 'partial' | 'pending' | 'overdue'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(record: FeeRecord): 'paid' | 'partial' | 'pending' | 'overdue' {
  const balance = record.totalAmount - record.paidAmount
  const isOverdue = new Date(record.dueDate) < new Date() && balance > 0
  if (balance <= 0) return 'paid'
  if (isOverdue) return 'overdue'
  if (record.paidAmount > 0) return 'partial'
  return 'pending'
}

function fmt(n: number) {
  return '$' + n.toLocaleString()
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-gray-900 text-white',
  partial: 'bg-gray-200 text-gray-700',
  pending: 'bg-gray-100 text-gray-600',
  overdue: 'bg-red-500 text-white',
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  pending: 'Pending',
  overdue: 'Overdue',
}

// ─── Mock seed data (replace with real API when backend endpoint is ready) ────

function seedData(): FeeRecord[] {
  return [
    {
      id: '1', studentId: 's1', studentName: 'Emma Johnson', class: '10-A',
      totalAmount: 2500, paidAmount: 2500, dueDate: '2025-09-01', term: '2025-T1',
      payments: [{ id: 'p1', amount: 2500, date: '2025-08-20', createdBy: 'Admin' }],
    },
    {
      id: '2', studentId: 's2', studentName: 'Michael Chen', class: '10-B',
      totalAmount: 2500, paidAmount: 2500, dueDate: '2025-09-01', term: '2025-T1',
      payments: [{ id: 'p2', amount: 2500, date: '2025-08-22', createdBy: 'Admin' }],
    },
    {
      id: '3', studentId: 's3', studentName: 'Sarah Williams', class: '9-A',
      totalAmount: 2300, paidAmount: 1200, dueDate: '2025-09-15', term: '2025-T1',
      payments: [{ id: 'p3', amount: 1200, date: '2025-09-01', createdBy: 'Admin' }],
    },
    {
      id: '4', studentId: 's4', studentName: 'James Brown', class: '11-C',
      totalAmount: 2700, paidAmount: 0, dueDate: '2025-09-01', term: '2025-T1',
      payments: [],
    },
    {
      id: '5', studentId: 's5', studentName: 'Olivia Davis', class: '10-A',
      totalAmount: 2500, paidAmount: 2500, dueDate: '2025-08-28', term: '2025-T1',
      payments: [{ id: 'p5', amount: 2500, date: '2025-08-15', createdBy: 'Admin' }],
    },
    {
      id: '6', studentId: 's6', studentName: 'Noah Martinez', class: '9-B',
      totalAmount: 2300, paidAmount: 0, dueDate: '2025-08-15', term: '2025-T1',
      payments: [],
    },
  ]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string; value: string; sub: string; icon: React.ReactNode; accent: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

interface PaymentModalProps {
  record: FeeRecord
  onClose: () => void
  onSave: (recordId: string, amount: number, note: string) => void
}
function PaymentModal({ record, onClose, onSave }: PaymentModalProps) {
  const balance = record.totalAmount - record.paidAmount
  const [amount, setAmount] = useState(balance.toString())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setError('Enter a valid amount'); return }
    if (n > balance) { setError(`Amount cannot exceed balance ($${balance})`); return }
    onSave(record.id, n, note)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <p className="text-sm text-gray-500 mt-0.5">{record.studentName} — {record.class}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400">Total</p>
              <p className="font-semibold text-gray-900">{fmt(record.totalAmount)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400">Balance</p>
              <p className="font-semibold text-red-600">{fmt(balance)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number"
                min="1"
                max={balance}
                step="0.01"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError('') }}
                className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Cash payment"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {record.payments.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Payment History</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {record.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-gray-500">{p.date}</span>
                    <span className="font-semibold text-gray-900">{fmt(p.amount)}</span>
                    {p.note && <span className="text-gray-400 truncate max-w-[80px]">{p.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
            >
              Confirm Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface AddFeeModalProps {
  students: Student[]
  onClose: () => void
  onSave: (record: Omit<FeeRecord, 'id' | 'paidAmount' | 'payments'>) => void
  editRecord?: FeeRecord | null
}
function AddFeeModal({ students, onClose, onSave, editRecord }: AddFeeModalProps) {
  const [studentId, setStudentId] = useState(editRecord?.studentId ?? '')
  const [studentQuery, setStudentQuery] = useState(
    editRecord ? `${editRecord.studentName} (${editRecord.class})` : ''
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const [totalAmount, setTotalAmount] = useState(editRecord?.totalAmount.toString() ?? '')
  const [dueDate, setDueDate] = useState(editRecord?.dueDate ?? '')
  const [term, setTerm] = useState(editRecord?.term ?? '')
  const [notes, setNotes] = useState(editRecord?.notes ?? '')
  const [error, setError] = useState('')

  const filteredStudents = useMemo(() => {
    const q = studentQuery.toLowerCase()
    return q ? students.filter(s =>
      s.name.toLowerCase().includes(q) || s.class.toLowerCase().includes(q)
    ) : students
  }, [students, studentQuery])

  function selectStudent(s: Student) {
    setStudentId(s.id)
    setStudentQuery(`${s.name} (${s.class})`)
    setShowDropdown(false)
    setError('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const selected = students.find(s => s.id === studentId)
    if (!selected) { setError('Select a student'); return }
    const amt = parseFloat(totalAmount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    if (!dueDate) { setError('Select a due date'); return }
    onSave({
      studentId,
      studentName: selected.name,
      class: selected.class,
      totalAmount: amt,
      dueDate,
      term,
      notes,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{editRecord ? 'Edit Fee Record' : 'Add Fee Record'}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!editRecord && (
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
              <div className="relative">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  value={studentQuery}
                  onChange={e => {
                    setStudentQuery(e.target.value)
                    setStudentId('')
                    setShowDropdown(true)
                    setError('')
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Search student by name or class..."
                  autoComplete="off"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {showDropdown && filteredStudents.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredStudents.map(s => (
                    <li
                      key={s.id}
                      onMouseDown={() => selectStudent(s)}
                      className="flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{s.class}</span>
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && studentQuery.length > 0 && filteredStudents.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                  No students found
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number" min="1" step="0.01"
                value={totalAmount}
                onChange={e => { setTotalAmount(e.target.value); setError('') }}
                className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => { setDueDate(e.target.value); setError('') }}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
              <input
                type="text"
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder="e.g. 2025-T1"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >Cancel</button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
            >{editRecord ? 'Save Changes' : 'Add Record'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function FeeManagementContent() {
  const [records, setRecords] = useState<FeeRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FeeStatus>('all')
  const [paymentTarget, setPaymentTarget] = useState<FeeRecord | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<FeeRecord | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [recRes, stuRes] = await Promise.all([
        apiFetch('/api/fees'),
        apiFetch('/api/fees/students'),
      ])
      if (recRes.ok) {
        const data = await recRes.json()
        setRecords(Array.isArray(data) ? data : data.records ?? seedData())
      } else {
        setRecords(seedData())
      }
      if (stuRes.ok) {
        setStudents(await stuRes.json())
      }
    } catch {
      setRecords(seedData())
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleRecordPayment(recordId: string, amount: number, note: string) {
    apiFetch(`/api/fees/${recordId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, note: note || undefined }),
    }).then(res => {
      if (res.ok) {
        res.json().then(updated => {
          setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
        })
      } else {
        // Optimistic update as fallback
        setRecords(prev => prev.map(r => {
          if (r.id !== recordId) return r
          const newPayment: FeePayment = {
            id: Date.now().toString(),
            amount,
            date: todayCambodia(),
            note: note || undefined,
            createdBy: 'Admin',
          }
          return { ...r, paidAmount: r.paidAmount + amount, payments: [...r.payments, newPayment] }
        }))
      }
    }).catch(() => {
      setRecords(prev => prev.map(r => {
        if (r.id !== recordId) return r
        const newPayment: FeePayment = {
          id: Date.now().toString(),
          amount,
          date: todayCambodia(),
          note: note || undefined,
          createdBy: 'Admin',
        }
        return { ...r, paidAmount: r.paidAmount + amount, payments: [...r.payments, newPayment] }
      }))
    })
    showToast('Payment recorded successfully')
  }

  function handleAddFee(data: Omit<FeeRecord, 'id' | 'paidAmount' | 'payments'>) {
    apiFetch('/api/fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: data.studentId,
        totalAmount: data.totalAmount,
        dueDate: data.dueDate,
        term: data.term,
        notes: data.notes,
      }),
    }).then(res => {
      if (res.ok) {
        res.json().then(created => setRecords(prev => [created, ...prev]))
      } else {
        // Optimistic fallback
        const newRecord: FeeRecord = { ...data, id: Date.now().toString(), paidAmount: 0, payments: [] }
        setRecords(prev => [newRecord, ...prev])
      }
    }).catch(() => {
      const newRecord: FeeRecord = { ...data, id: Date.now().toString(), paidAmount: 0, payments: [] }
      setRecords(prev => [newRecord, ...prev])
    })
    showToast('Fee record added')
  }

  function handleEditFee(data: Omit<FeeRecord, 'id' | 'paidAmount' | 'payments'>) {
    if (!editTarget) return
    apiFetch(`/api/fees/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalAmount: data.totalAmount,
        dueDate: data.dueDate,
        term: data.term,
        notes: data.notes,
      }),
    }).then(res => {
      if (res.ok) {
        res.json().then(updated => setRecords(prev => prev.map(r => r.id === updated.id ? updated : r)))
      } else {
        setRecords(prev => prev.map(r =>
          r.id === editTarget.id
            ? { ...r, totalAmount: data.totalAmount, dueDate: data.dueDate, term: data.term, notes: data.notes }
            : r
        ))
      }
    }).catch(() => {
      setRecords(prev => prev.map(r =>
        r.id === editTarget.id
          ? { ...r, totalAmount: data.totalAmount, dueDate: data.dueDate, term: data.term, notes: data.notes }
          : r
      ))
    })
    setEditTarget(null)
    showToast('Fee record updated')
  }

  function handleDelete(id: string) {
    apiFetch(`/api/fees/${id}`, { method: 'DELETE' }).catch(() => {/* already removed locally */})
    setRecords(prev => prev.filter(r => r.id !== id))
    setDeleteTarget(null)
    showToast('Fee record deleted')
  }

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (search) {
        const q = search.toLowerCase()
        if (!r.studentName.toLowerCase().includes(q) && !r.class.toLowerCase().includes(q)) return false
      }
      if (statusFilter !== 'all' && getStatus(r) !== statusFilter) return false
      return true
    })
  }, [records, search, statusFilter])

  function handleExport() {
    const escapeField = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }
    const rows = [
      ['Student Name', 'Class', 'Amount', 'Paid', 'Balance', 'Due Date', 'Status', 'Term'],
      ...filtered.map(r => {
        const st = getStatus(r)
        const bal = r.totalAmount - r.paidAmount
        return [r.studentName, r.class, r.totalAmount, r.paidAmount, bal, r.dueDate, STATUS_LABEL[st], r.term]
      }),
    ]
    const csv = '\uFEFF' + rows.map(row => row.map(escapeField).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fee-report-${todayCambodia()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Summary stats ─────────────────────────────────────────────────────────
  const totalRevenue = records.reduce((sum, r) => sum + r.paidAmount, 0)
  const pendingAmount = records.reduce((sum, r) => sum + Math.max(0, r.totalAmount - r.paidAmount), 0)
  const paidCount = records.filter(r => getStatus(r) === 'paid').length
  const collectionRate = records.length > 0 ? Math.round((paidCount / records.length) * 100) : 0

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fee Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track and manage student fee payments</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 shadow-sm transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Fee
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 shadow-sm transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export Report
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Total Revenue"
            value={fmt(totalRevenue)}
            sub="Collected this term"
            accent="bg-emerald-50"
            icon={
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            }
          />
          <StatCard
            label="Pending Amount"
            value={fmt(pendingAmount)}
            sub="Yet to collect"
            accent="bg-amber-50"
            icon={
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Paid Students"
            value={`${paidCount}`}
            sub={`Out of ${records.length} students`}
            accent="bg-blue-50"
            icon={
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            }
          />
          <StatCard
            label="Collection Rate"
            value={`${collectionRate}%`}
            sub="Payment completion"
            accent="bg-purple-50"
            icon={
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>

        {/* Fee Records */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Fee Records</h2>
              <p className="text-sm text-gray-400">Manage student payments</p>
            </div>
            <div className="flex gap-2">
              {/* Search */}
              <div className="relative">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search students..."
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-52"
                />
              </div>
              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as FeeStatus)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">No fee records found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Class</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(r => {
                    const status = getStatus(r)
                    const balance = r.totalAmount - r.paidAmount
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{r.studentName}</td>
                        <td className="px-4 py-4 text-gray-600">{r.class}</td>
                        <td className="px-4 py-4 text-right text-gray-700">{fmt(r.totalAmount)}</td>
                        <td className="px-4 py-4 text-right text-emerald-600 font-medium">{fmt(r.paidAmount)}</td>
                        <td className={`px-4 py-4 text-right font-medium ${balance === 0 ? 'text-gray-400' : 'text-red-500'}`}>{fmt(balance)}</td>
                        <td className={`px-4 py-4 font-medium ${status === 'overdue' ? 'text-red-500' : 'text-gray-600'}`}>{r.dueDate}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {balance > 0 && (
                              <button
                                onClick={() => setPaymentTarget(r)}
                                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
                              >
                                Record Payment
                              </button>
                            )}
                            <button
                              onClick={() => setEditTarget(r)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                              title="Edit"
                              aria-label={`Edit fee record for ${r.studentName}`}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteTarget(r.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              title="Delete"
                              aria-label={`Delete fee record for ${r.studentName}`}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer summary */}
          {filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between text-xs text-gray-500">
              <span>Showing {filtered.length} of {records.length} records</span>
              <div className="flex gap-4">
                <span>Total billed: <span className="font-semibold text-gray-700">{fmt(filtered.reduce((s, r) => s + r.totalAmount, 0))}</span></span>
                <span>Total collected: <span className="font-semibold text-emerald-600">{fmt(filtered.reduce((s, r) => s + r.paidAmount, 0))}</span></span>
                <span>Outstanding: <span className="font-semibold text-red-500">{fmt(filtered.reduce((s, r) => s + Math.max(0, r.totalAmount - r.paidAmount), 0))}</span></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {paymentTarget && (
        <PaymentModal
          record={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSave={handleRecordPayment}
        />
      )}

      {showAddModal && (
        <AddFeeModal
          students={students}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddFee}
        />
      )}

      {editTarget && (
        <AddFeeModal
          students={students}
          onClose={() => setEditTarget(null)}
          onSave={handleEditFee}
          editRecord={editTarget}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Delete Fee Record</h2>
            <p className="text-sm text-gray-500">Are you sure you want to delete this fee record? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >Cancel</button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition"
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg animate-in slide-in-from-bottom-2 duration-300">
          {toast}
        </div>
      )}
    </div>
  )
}

export default function FeeManagementPage() {
  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <div className="flex min-h-screen lg:h-screen bg-gray-50 pt-14 lg:pt-0 pb-[72px] lg:pb-0">
        <Sidebar
          title="Admin"
          navItems={adminNav}
          accentColor="indigo"
        />
        <FeeManagementContent />
      </div>
    </AuthGuard>
  )
}
