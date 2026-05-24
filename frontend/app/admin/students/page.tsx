"use client";

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { apiFetch } from '../../../lib/api';
import { useLanguage } from '../../../lib/i18n';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface StudyYear { id: string; year: number; label: string | null; isCurrent: boolean }
interface Grade { id: string; name: string; subject: string; teacher?: { name: string }; studyYearId?: string }
interface Student {
  id: string; userId: string; studentNumber: string; name: string; email: string; phone: string;
  photo: string | null; sex: string | null; dateOfBirth: string | null;
  address: string; generation?: string; parentId?: string | null;
}
interface ParentOption { id: string; name: string; email: string; phone: string | null }

export default function ManageStudentsPage() {
  return <Suspense><ManageStudents /></Suspense>;
}

function ManageStudents() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlClassId = searchParams.get('classId');

  /* ── data ── */
  const [studyYears, setStudyYears] = useState<StudyYear[]>([]);
  const [selectedStudyYearId, setSelectedStudyYearId] = useState('');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<ParentOption[]>([]);

  /* ── loading / error ── */
  const [loadingGrades, setLoadingGrades] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);

  /* ── search ── */
  const [gradeSearch, setGradeSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  /* ── student counts per grade ── */
  const [gradeCounts, setGradeCounts] = useState<Record<string, number>>({});

  /* ── edit ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', sex: '', phone: '', photo: '', dateOfBirth: '', address: '', generation: '', studentNumber: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* ── add new student ── */
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '', sex: '', phone: '', photo: '', dateOfBirth: '', address: '', generation: '', studentNumber: '' });
  const [addingStudent, setAddingStudent] = useState(false);

  /* ── CSV ── */
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ total: number; success: number; errors: number; skipped: number } | null>(null);

  /* ── reset password ── */
  const [resetStudent, setResetStudent] = useState<Student | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetMsg, setResetMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* ─────────────────── fetch helpers ─────────────────── */
  const fetchStudyYears = async () => {
    try {
      const res = await apiFetch('/api/study-years');
      if (res.ok) setStudyYears(await res.json());
    } catch {}
  };

  const fetchGrades = async (studyYearId: string) => {
    setLoadingGrades(true);
    try {
      const q = studyYearId ? `?studyYearId=${studyYearId}` : '';
      const res = await apiFetch(`/api/classes${q}`);
      if (res.ok) {
        const data: Grade[] = await res.json();
        setGrades(data);
        fetchGradeCounts(data);
      }
    } catch {} finally { setLoadingGrades(false); }
  };

  const fetchGradeCounts = async (list: Grade[]) => {
    const counts: Record<string, number> = {};
    await Promise.all(list.map(async g => {
      try {
        const r = await apiFetch(`/api/classes/${g.id}/students`);
        if (r.ok) { const d = await r.json(); counts[g.id] = Array.isArray(d) ? d.length : 0; }
      } catch { counts[g.id] = 0; }
    }));
    setGradeCounts(counts);
  };

  const fetchStudents = async (classId: string) => {
    setLoadingStudents(true);
    setStudents([]);
    try {
      const res = await apiFetch(`/api/classes/${classId}/students`);
      if (res.ok) setStudents(await res.json());
    } catch {} finally { setLoadingStudents(false); }
  };

  const fetchParents = async () => {
    if (parents.length > 0) return;
    try {
      const r = await apiFetch('/api/classes/parents');
      if (r.ok) { const d = await r.json(); setParents(Array.isArray(d) ? d : []); }
    } catch {}
  };

  /* ─────────────────── init ─────────────────── */
  useEffect(() => { fetchStudyYears(); }, []);

  useEffect(() => {
    if (studyYears.length > 0 && !selectedStudyYearId) {
      const cur = studyYears.find(s => s.isCurrent);
      setSelectedStudyYearId(cur?.id ?? studyYears[0]?.id ?? '');
    }
  }, [studyYears]);

  useEffect(() => { fetchGrades(selectedStudyYearId); setSelectedGrade(null); setStudents([]); }, [selectedStudyYearId]);

  /* auto-select from URL param */
  useEffect(() => {
    if (urlClassId && grades.length > 0 && !selectedGrade) {
      const g = grades.find(x => x.id === urlClassId);
      if (g) selectGrade(g);
    }
  }, [urlClassId, grades]);

  /* ─────────────────── actions ─────────────────── */
  const selectGrade = (g: Grade) => {
    setSelectedGrade(g);
    setStudentSearch('');
    setEditingId(null);
    setShowAddForm(false);
    setCsvResult(null);
    fetchStudents(g.id);
    router.replace(`/admin/students?classId=${g.id}`, { scroll: false });
  };

  const handleEdit = (s: Student) => {
    setEditingId(s.id);
    setSaveError(null);
    setEditData({
      name: s.name || '', sex: s.sex || '', phone: s.phone || '', photo: s.photo || '',
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : '',
      address: s.address || '', generation: s.generation || '',
      studentNumber: s.studentNumber || '', parentId: s.parentId || '',
    });
    fetchParents();
  };

  const handleSave = async () => {
    if (!selectedGrade || !editingId) return;
    setSaving(true); setSaveError(null);
    try {
      const res = await apiFetch(`/api/classes/${selectedGrade.id}/students/${editingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editData, parentId: editData.parentId || null }),
      });
      if (res.ok) { setEditingId(null); await fetchStudents(selectedGrade.id); }
      else {
        let msg = `Save failed (${res.status})`;
        try { const j = await res.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message; } catch {}
        setSaveError(msg);
      }
    } catch (e: any) { setSaveError(e?.message || 'Error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (s: Student) => {
    if (!selectedGrade) return;
    const confirmed = window.confirm(
      `Permanently delete "${s.name}" from the database?\n\nThis removes all attendance records, fee records, and their user account. Cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const res = await apiFetch(`/api/classes/${selectedGrade.id}/students/${s.id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchStudents(selectedGrade.id);
        setGradeCounts(prev => ({ ...prev, [selectedGrade.id]: Math.max(0, (prev[selectedGrade.id] ?? 1) - 1) }));
      } else {
        const b = await res.json().catch(() => ({}));
        alert(`Delete failed: ${b?.message ?? res.statusText}`);
      }
    } catch (e) { console.error(e); }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrade) return;
    setAddingStudent(true);
    try {
      const pwd = newForm.password.trim() || `student${newForm.email.split('@')[0]}`;
      const reg = await apiFetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, password: pwd, role: 'STUDENT' }),
      });
      if (!reg.ok) { const d = await reg.json(); alert(d.message || 'Registration failed'); return; }
      const newUser = await reg.json();
      const add = await apiFetch(`/api/classes/${selectedGrade.id}/students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: newUser.user.id }),
      });
      if (!add.ok) { const d = await add.json(); alert(d.message || 'Failed to add to class'); return; }
      const added = await add.json();
      const fields = ['sex', 'photo', 'dateOfBirth', 'address', 'generation', 'studentNumber'] as const;
      if (fields.some(f => newForm[f])) {
        const sid = added.id || added.student?.id;
        if (sid) await apiFetch(`/api/classes/${selectedGrade.id}/students/${sid}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(fields.filter(f => newForm[f]).map(f => [f, newForm[f]]))),
        });
      }
      setNewForm({ name: '', email: '', password: '', sex: '', phone: '', photo: '', dateOfBirth: '', address: '', generation: '', studentNumber: '' });
      setShowAddForm(false);
      await fetchStudents(selectedGrade.id);
      setGradeCounts(prev => ({ ...prev, [selectedGrade.id]: (prev[selectedGrade.id] ?? 0) + 1 }));
    } finally { setAddingStudent(false); }
  };

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetStudent) return;
    if (resetPwd.length < 6) { setResetMsg({ text: 'Password must be at least 6 characters', ok: false }); return; }
    try {
      const res = await apiFetch(`/api/auth/users/${resetStudent.userId}/password`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPwd }),
      });
      if (res.ok) {
        setResetMsg({ text: `Password reset for ${resetStudent.name}`, ok: true });
        setTimeout(() => { setResetStudent(null); setResetPwd(''); setResetMsg(null); }, 1500);
      } else {
        const d = await res.json().catch(() => ({}));
        setResetMsg({ text: d.message || 'Failed to reset password', ok: false });
      }
    } catch { setResetMsg({ text: 'Network error', ok: false }); }
  };

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGrade) return;
    setCsvUploading(true); setCsvResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await apiFetch(`/api/classes/${selectedGrade.id}/students/bulk-csv`, { method: 'POST', body: fd });
      if (res.ok) {
        const r = await res.json(); setCsvResult(r);
        await fetchStudents(selectedGrade.id);
        setGradeCounts(prev => ({ ...prev, [selectedGrade.id]: students.length + (r.success ?? 0) }));
      } else { const d = await res.json(); alert(d.message || 'CSV upload failed'); }
    } finally { setCsvUploading(false); e.target.value = ''; }
  };

  /* ─────────────────── derived ─────────────────── */
  const filteredGrades = useMemo(() => {
    const q = gradeSearch.trim().toLowerCase();
    return q ? grades.filter(g => g.name.toLowerCase().includes(q) || g.subject?.toLowerCase().includes(q)) : grades;
  }, [grades, gradeSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return q ? students.filter(s => s.name.toLowerCase().includes(q) || (s.studentNumber || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)) : students;
  }, [students, studentSearch]);

  /* ─────────────────── render ─────────────────── */
  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎓</span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Students by Grade</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Select a class on the left to manage its students</p>
            </div>
          </div>
        </div>

        <div className="page-body">
          <div className="flex gap-4 h-[calc(100vh-12rem)]">

            {/* ── Left Panel: Grade List ── */}
            <div className="w-72 shrink-0 flex flex-col gap-3">
              {/* Study Year filter */}
              <select
                value={selectedStudyYearId}
                onChange={e => setSelectedStudyYearId(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white w-full"
              >
                <option value="">All Study Years</option>
                {studyYears.map(sy => (
                  <option key={sy.id} value={sy.id}>{sy.label || sy.year}{sy.isCurrent ? ' ✓ Current' : ''}</option>
                ))}
              </select>

              {/* Grade search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" /></svg>
                <input type="text" value={gradeSearch} onChange={e => setGradeSearch(e.target.value)} placeholder="Search grade…" className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>

              {/* Grade list */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {loadingGrades ? (
                  <div className="py-10 text-center text-slate-400 text-sm">Loading grades…</div>
                ) : filteredGrades.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">No grades found</div>
                ) : filteredGrades.map(g => (
                  <button
                    key={g.id}
                    onClick={() => selectGrade(g)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-indigo-50 ${selectedGrade?.id === g.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm font-medium leading-tight ${selectedGrade?.id === g.id ? 'text-indigo-700' : 'text-slate-800'}`}>{g.name}</span>
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${selectedGrade?.id === g.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                        {gradeCounts[g.id] ?? '…'}
                      </span>
                    </div>
                    {g.teacher && <p className="text-xs text-slate-400 mt-0.5 truncate">{g.teacher.name}</p>}
                  </button>
                ))}
              </div>

              {/* Total summary */}
              <div className="text-xs text-slate-500 text-center">
                {filteredGrades.length} grade{filteredGrades.length !== 1 ? 's' : ''} · {Object.values(gradeCounts).reduce((a, b) => a + b, 0)} students
              </div>
            </div>

            {/* ── Right Panel: Student Roster ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">
              {!selectedGrade ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <span className="text-5xl">👈</span>
                  <p className="text-sm font-medium">Select a grade to view its students</p>
                </div>
              ) : (
                <>
                  {/* Roster header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-800">{selectedGrade.name}</h2>
                      <p className="text-xs text-slate-500">{selectedGrade.subject}{selectedGrade.teacher ? ` · ${selectedGrade.teacher.name}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Student search */}
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" /></svg>
                        <input type="text" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search students…" className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 w-48" />
                      </div>

                      {/* CSV upload */}
                      <label className={`btn-secondary btn-sm cursor-pointer ${csvUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {csvUploading ? 'Uploading…' : '📂 Import CSV'}
                        <input type="file" accept=".csv" className="hidden" onChange={handleCsv} />
                      </label>

                      {/* Add button */}
                      <button
                        onClick={() => { setShowAddForm(f => !f); setEditingId(null); }}
                        className="btn-primary btn-sm inline-flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add Student
                      </button>
                    </div>
                  </div>

                  {/* CSV result banner */}
                  {csvResult && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-800 flex items-center justify-between">
                      <span>CSV imported: <b>{csvResult.success}</b> added, {csvResult.skipped} skipped, {csvResult.errors} errors (total {csvResult.total})</span>
                      <button onClick={() => setCsvResult(null)} className="text-emerald-500 hover:text-emerald-700 text-lg leading-none ml-3">×</button>
                    </div>
                  )}

                  {/* Add student form */}
                  {showAddForm && (
                    <form onSubmit={handleAddStudent} className="card p-4 border-indigo-200 bg-indigo-50 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-indigo-800">New Student</h4>
                        <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="form-label text-xs">Full Name *</label>
                          <input type="text" required value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} placeholder="ឈ្មោះ" />
                        </div>
                        <div>
                          <label className="form-label text-xs">Email *</label>
                          <input type="email" required value={newForm.email} onChange={e => setNewForm({ ...newForm, email: e.target.value })} placeholder="student@school.edu" />
                        </div>
                        <div>
                          <label className="form-label text-xs">Password <span className="text-slate-400">(auto if blank)</span></label>
                          <input type="text" value={newForm.password} onChange={e => setNewForm({ ...newForm, password: e.target.value })} placeholder="auto-generated" />
                        </div>
                        <div>
                          <label className="form-label text-xs">Student ID</label>
                          <input type="text" value={newForm.studentNumber} onChange={e => setNewForm({ ...newForm, studentNumber: e.target.value })} placeholder="0001" className="font-mono" />
                        </div>
                        <div>
                          <label className="form-label text-xs">Sex</label>
                          <select value={newForm.sex} onChange={e => setNewForm({ ...newForm, sex: e.target.value })}>
                            <option value="">Select…</option>
                            <option value="MALE">ប្រុស (Male)</option>
                            <option value="FEMALE">ស្រី (Female)</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label text-xs">Phone</label>
                          <input type="text" value={newForm.phone} onChange={e => setNewForm({ ...newForm, phone: e.target.value })} placeholder="012 345 678" />
                        </div>
                        <div>
                          <label className="form-label text-xs">Date of Birth</label>
                          <input type="date" value={newForm.dateOfBirth} onChange={e => setNewForm({ ...newForm, dateOfBirth: e.target.value })} />
                        </div>
                        <div>
                          <label className="form-label text-xs">Generation (ជំនាន់ទី)</label>
                          <input type="number" min="1" value={newForm.generation} onChange={e => setNewForm({ ...newForm, generation: e.target.value })} placeholder="1" />
                        </div>
                        <div>
                          <label className="form-label text-xs">Address</label>
                          <input type="text" value={newForm.address} onChange={e => setNewForm({ ...newForm, address: e.target.value })} placeholder="Province/City" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" disabled={addingStudent} className="btn-primary btn-sm">{addingStudent ? 'Adding…' : 'Add Student'}</button>
                      </div>
                    </form>
                  )}

                  {/* Student table */}
                  <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
                    {loadingStudents ? (
                      <div className="py-16 text-center text-slate-400 text-sm">Loading students…</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">#ID</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Photo</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Sex</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">DOB</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Generation</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredStudents.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-slate-400">{studentSearch ? 'No matches' : 'No students in this grade yet'}</td></tr>
                          ) : filteredStudents.map((s, idx) => (
                            <>
                              <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${editingId === s.id ? 'bg-amber-50' : ''}`}>
                                <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.studentNumber || String(idx + 1).padStart(4, '0')}</td>
                                <td className="px-3 py-2.5">
                                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {s.photo ? <img src={s.photo} alt={s.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : s.name.charAt(0).toUpperCase()}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-slate-800">{s.name}</p>
                                  <p className="text-xs text-slate-400">{s.email}</p>
                                </td>
                                <td className="px-3 py-2.5">
                                  {s.sex ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.sex === 'MALE' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                                      {s.sex === 'MALE' ? '♂ ប្រុស' : '♀ ស្រី'}
                                    </span>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-slate-500 text-xs">{s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString() : <span className="text-slate-300">—</span>}</td>
                                <td className="px-3 py-2.5 text-slate-500 text-xs">{s.phone || <span className="text-slate-300">—</span>}</td>
                                <td className="px-3 py-2.5 text-slate-500 text-xs">{s.generation ? `G${s.generation}` : <span className="text-slate-300">—</span>}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button onClick={() => editingId === s.id ? setEditingId(null) : handleEdit(s)} className="btn-warning btn-sm">
                                      {editingId === s.id ? 'Cancel' : 'Edit'}
                                    </button>
                                    <button onClick={() => { setResetStudent(s); setResetPwd(''); setResetMsg(null); }} className="btn-secondary btn-sm">Reset PW</button>
                                    <button onClick={() => handleDelete(s)} className="btn-danger btn-sm">Delete</button>
                                  </div>
                                </td>
                              </tr>

                              {/* Inline edit row */}
                              {editingId === s.id && (
                                <tr key={`${s.id}-edit`}>
                                  <td colSpan={8} className="px-4 pb-4 bg-amber-50 border-b border-amber-200">
                                    {saving && (
                                      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                                        <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-white border border-amber-200 shadow-2xl">
                                          <svg className="w-10 h-10 text-amber-500 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                                          <p className="text-sm font-semibold text-slate-800">Saving…</p>
                                        </div>
                                      </div>
                                    )}
                                    {saveError && <p className="text-xs text-red-600 mb-2 mt-3">{saveError}</p>}
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                                      <div>
                                        <label className="form-label text-xs">Student ID</label>
                                        <input type="text" value={editData.studentNumber} onChange={e => setEditData({ ...editData, studentNumber: e.target.value })} className="font-mono" />
                                      </div>
                                      <div>
                                        <label className="form-label text-xs">Name</label>
                                        <input type="text" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
                                      </div>
                                      <div>
                                        <label className="form-label text-xs">Sex</label>
                                        <select value={editData.sex} onChange={e => setEditData({ ...editData, sex: e.target.value })}>
                                          <option value="">Select…</option>
                                          <option value="MALE">ប្រុស (Male)</option>
                                          <option value="FEMALE">ស្រី (Female)</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="form-label text-xs">Phone</label>
                                        <input type="text" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} />
                                      </div>
                                      <div>
                                        <label className="form-label text-xs">Date of Birth</label>
                                        <input type="date" value={editData.dateOfBirth} onChange={e => setEditData({ ...editData, dateOfBirth: e.target.value })} />
                                      </div>
                                      <div>
                                        <label className="form-label text-xs">Generation (ជំនាន់ទី)</label>
                                        <input type="number" min="1" value={editData.generation} onChange={e => setEditData({ ...editData, generation: e.target.value })} />
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="form-label text-xs">Address</label>
                                        <input type="text" value={editData.address} onChange={e => setEditData({ ...editData, address: e.target.value })} />
                                      </div>
                                      <div className="sm:col-span-2 lg:col-span-4">
                                        <label className="form-label text-xs">Parent (ឪពុកម្តាយ)</label>
                                        <select value={editData.parentId} onChange={e => setEditData({ ...editData, parentId: e.target.value })}>
                                          <option value="">— None / Unlink —</option>
                                          {parents.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.email}){p.phone ? ` · ${p.phone}` : ''}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="sm:col-span-2 lg:col-span-4">
                                        <label className="form-label text-xs">Photo URL</label>
                                        <input type="text" value={editData.photo} onChange={e => setEditData({ ...editData, photo: e.target.value })} placeholder="https://…" />
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-3">
                                      <button type="button" onClick={() => setEditingId(null)} className="btn-secondary btn-sm">Cancel</button>
                                      <button type="button" onClick={handleSave} disabled={saving} className="btn-primary btn-sm">Save Changes</button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Footer count */}
                  <div className="text-xs text-slate-500 text-right">
                    {filteredStudents.length} of {students.length} students
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Reset Password Modal ── */}
      {resetStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setResetStudent(null); setResetMsg(null); }}>
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Reset Password</h3>
            <p className="text-sm text-slate-500">
              Set a new password for <strong className="text-slate-800">{resetStudent.name}</strong> ({resetStudent.email}).
              Existing sessions will be revoked.
            </p>
            <form onSubmit={handleResetPwd} className="space-y-3">
              <div>
                <label className="form-label">New password</label>
                <input
                  type="text"
                  value={resetPwd}
                  onChange={e => { setResetPwd(e.target.value); setResetMsg(null); }}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  autoFocus
                />
              </div>
              {resetMsg && (
                <p className={`text-sm font-medium ${resetMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{resetMsg.text}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setResetStudent(null); setResetMsg(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Reset Password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

