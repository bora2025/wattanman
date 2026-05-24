'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { apiFetch } from '../../../lib/api';
import { formatDOB } from '../../../lib/dateUtils';
import { useLanguage } from '../../../lib/i18n';
import {
  CardDesign,
  BLANK_CERTIFICATE_STUDENT,
  BLANK_CERTIFICATE_STAFF,
  DESIGN_STORAGE_KEY,
  loadSavedDesign,
  apiGetActiveDesign,
  saveDesign,
} from '../../../components/card-designer/types';
import { renderDesignToCanvas } from '../../../components/card-designer/renderDesignToCanvas';
import { downloadSingleCardPDF, downloadA4CardsPDF } from '../../../components/card-designer/generateCardPDF';

// ── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  studentNumber: string;
  name: string;
  photo: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  address: string;
  email: string;
  phone: string;
}

interface StudyYear {
  id: string;
  year: number;
  label: string | null;
  isCurrent: boolean;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string | null;
  teacher: { name: string } | null;
}

interface ClassWithStudents extends ClassItem {
  students: Student[];
}

interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  photo: string | null;
  department?: { id: string; name: string; nameKh?: string } | null;
}

type ActiveTab = 'student' | 'staff';

// ── Scoring interfaces ────────────────────────────────────────────────────────

interface ScoringEntry { studentId: string; subjectId: string; score: number | null }
interface ScoringSubject { id: string; maxScore: number }
interface ScoringExamTab { id: string }
interface ScoringSheetClass { classId: string }
interface ScoringSheet {
  id: string;
  classes: ScoringSheetClass[];
  subjects: ScoringSubject[];
  examTabs: ScoringExamTab[];
}
interface StudentScoreStats {
  total: number;
  maxTotal: number;
  averagePct: number;
  gpa: number;
  grade: string;
  ranking: number;
}

const CERT_GRADE_MAP = [
  { min: 90, letter: 'A', point: 4.00 },
  { min: 75, letter: 'B', point: 3.00 },
  { min: 60, letter: 'C', point: 2.00 },
  { min: 50, letter: 'D', point: 1.00 },
  { min: 40, letter: 'E', point: 0.50 },
  { min: 0,  letter: 'F', point: 0.00 },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CertificatePage() {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<ActiveTab>('student');

  // ── Student certificate state ──
  const [studyYears, setStudyYears] = useState<StudyYear[]>([]);
  const [selectedStudyYear, setSelectedStudyYear] = useState<string>('');
  const [classes, setClasses] = useState<ClassWithStudents[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 12;
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [topRankFilter, setTopRankFilter] = useState<number | 'all'>('all');

  const [studentDesign, setStudentDesign] = useState<CardDesign>(BLANK_CERTIFICATE_STUDENT);
  const [studentDesignLoading, setStudentDesignLoading] = useState(true);
  const [showStudentEditor, setShowStudentEditor] = useState(false);

  // ── Staff certificate state ──
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffPage, setStaffPage] = useState(1);
  const staffPageSize = 12;
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>('ALL');
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());

  const [staffDesign, setStaffDesign] = useState<CardDesign>(BLANK_CERTIFICATE_STAFF);
  const [staffDesignLoading, setStaffDesignLoading] = useState(true);
  const [showStaffEditor, setShowStaffEditor] = useState(false);

  // ── Score data for student certificates ──
  const [scoresByStudentId, setScoresByStudentId] = useState<Record<string, StudentScoreStats>>({});
  const [loadingScores, setLoadingScores] = useState(false);

  // ── Shared ──
  const [exporting, setExporting] = useState(false);
  const certificateDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Design loaders ────────────────────────────────────────────────────────

  const reloadStudentDesign = useCallback(() => {
    setStudentDesignLoading(true);
    apiGetActiveDesign('certificate-student').then((d) => {
      if (d) { saveDesign(d); setStudentDesign(d); }
      else setStudentDesign(loadSavedDesign('certificate-student') ?? BLANK_CERTIFICATE_STUDENT);
    }).finally(() => setStudentDesignLoading(false));
  }, []);

  const reloadStaffDesign = useCallback(() => {
    setStaffDesignLoading(true);
    apiGetActiveDesign('certificate-staff').then((d) => {
      if (d) { saveDesign(d); setStaffDesign(d); }
      else setStaffDesign(loadSavedDesign('certificate-staff') ?? BLANK_CERTIFICATE_STAFF);
    }).finally(() => setStaffDesignLoading(false));
  }, []);

  useEffect(() => { reloadStudentDesign(); reloadStaffDesign(); }, [reloadStudentDesign, reloadStaffDesign]);
  useEffect(() => { if (!showStudentEditor) reloadStudentDesign(); }, [reloadStudentDesign, showStudentEditor]);
  useEffect(() => { if (!showStaffEditor) reloadStaffDesign(); }, [reloadStaffDesign, showStaffEditor]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === DESIGN_STORAGE_KEY) { reloadStudentDesign(); reloadStaffDesign(); } };
    window.addEventListener('storage', onStorage);
    const onVisibility = () => { if (document.visibilityState === 'visible') { reloadStudentDesign(); reloadStaffDesign(); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisibility); };
  }, [reloadStudentDesign, reloadStaffDesign]);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  useEffect(() => { fetchStudyYears(); fetchStaff(); }, []);

  const fetchStudyYears = async () => {
    try {
      const res = await apiFetch('/api/study-years');
      if (res.ok) {
        const years: StudyYear[] = await res.json();
        setStudyYears(years);
        const current = years.find((y) => y.isCurrent);
        if (current) { setSelectedStudyYear(current.id); await fetchClasses(current.id); }
      }
    } catch { console.error('Failed to fetch study years'); }
    finally { setLoadingYears(false); }
  };

  const fetchClasses = async (studyYearId: string) => {
    setLoadingClasses(true);
    setSelectedClassId(null);
    setSelectedStudentIds(new Set());
    try {
      const res = await apiFetch(`/api/classes?studyYearId=${studyYearId}`);
      if (!res.ok) { setClasses([]); return; }
      const list: ClassItem[] = await res.json();
      const withStudents: ClassWithStudents[] = await Promise.all(
        list.map(async (cls) => {
          try {
            const r = await apiFetch(`/api/classes/${cls.id}/students`);
            return { ...cls, students: r.ok ? await r.json() : [] };
          } catch { return { ...cls, students: [] }; }
        })
      );
      setClasses(withStudents);
    } catch { console.error('Failed to fetch classes'); }
    finally { setLoadingClasses(false); }
  };

  const fetchStaff = async () => {
    try {
      const res = await apiFetch('/api/auth/users');
      if (res.ok) {
        const all: StaffUser[] = await res.json();
        setStaffUsers(all.filter((u) => !['STUDENT', 'PARENT'].includes(u.role)));
      }
    } catch { console.error('Failed to fetch staff'); }
    finally { setLoadingStaff(false); }
  };

  const fetchClassScores = async (classId: string) => {
    setLoadingScores(true);
    setScoresByStudentId({});
    try {
      const sheetsRes = await apiFetch('/api/scoring/sheets');
      if (!sheetsRes.ok) return;
      const allSheets: ScoringSheet[] = await sheetsRes.json();
      const classSheets = allSheets.filter((s) => s.classes.some((c) => c.classId === classId));
      if (classSheets.length === 0) return;

      // Build subject maxScore map and collect all entries for this class
      const subjectMaxMap: Record<string, number> = {};
      const allEntries: ScoringEntry[] = [];

      for (const sheet of classSheets) {
        for (const subj of sheet.subjects) {
          subjectMaxMap[subj.id] = subj.maxScore > 0 ? subj.maxScore : 100;
        }
        for (const tab of sheet.examTabs) {
          try {
            const tabRes = await apiFetch(`/api/scoring/exam-tabs/${tab.id}/scores?classIds=${classId}`);
            if (!tabRes.ok) continue;
            const { entries } = await tabRes.json() as { entries: ScoringEntry[]; students: unknown[] };
            allEntries.push(...entries);
          } catch { /* skip failed tab */ }
        }
      }

      // Group entries by studentId
      const entryByStudent: Record<string, ScoringEntry[]> = {};
      for (const entry of allEntries) {
        if (entry.score === null) continue;
        if (!entryByStudent[entry.studentId]) entryByStudent[entry.studentId] = [];
        entryByStudent[entry.studentId].push(entry);
      }

      // Compute raw totals
      const raw: Record<string, { total: number; maxTotal: number }> = {};
      for (const [sid, entries] of Object.entries(entryByStudent)) {
        let total = 0, maxTotal = 0;
        for (const e of entries) {
          total += e.score as number;
          maxTotal += subjectMaxMap[e.subjectId] ?? 100;
        }
        raw[sid] = { total, maxTotal };
      }

      // Sort by total desc for ranking
      const sorted = Object.entries(raw).sort(([, a], [, b]) => b.total - a.total);

      const finalStats: Record<string, StudentScoreStats> = {};
      sorted.forEach(([sid, { total, maxTotal }], idx) => {
        const averagePct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
        const gradeEntry = CERT_GRADE_MAP.find((g) => averagePct >= g.min) ?? CERT_GRADE_MAP[CERT_GRADE_MAP.length - 1];
        finalStats[sid] = {
          total,
          maxTotal,
          averagePct,
          gpa: gradeEntry.point,
          grade: gradeEntry.letter,
          ranking: idx + 1,
        };
      });
      setScoresByStudentId(finalStats);
    } catch (err) {
      console.error('Failed to fetch class scores', err);
    } finally {
      setLoadingScores(false);
    }
  };

  // Fetch scores when a class is selected; reset rank filter on class change
  useEffect(() => {
    setTopRankFilter('all');
    setSelectedStudentIds(new Set());
    if (selectedClassId) fetchClassScores(selectedClassId);
    else setScoresByStudentId({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  // ── Field value builders ──────────────────────────────────────────────────

  const buildStudentFields = (student: Student, className: string, studyYearLabel: string): Record<string, string> => {
    const stats = scoresByStudentId[student.id];
    return {
      '{{name}}': student.name,
      '{{studentNumber}}': student.studentNumber || '',
      '{{class}}': className,
      '{{studyYear}}': studyYearLabel,
      '{{dateOfBirth}}': formatDOB(student.dateOfBirth, lang),
      '{{sex}}': student.sex === 'MALE' ? 'ប្រុស' : student.sex === 'FEMALE' ? 'ស្រី' : '',
      '{{certificateDate}}': certificateDate,
      '{{schoolName}}': 'Wattanman Academy',
      '{{total}}': stats ? stats.total.toFixed(0) : '-',
      '{{average}}': stats ? stats.averagePct.toFixed(1) + '%' : '-',
      '{{gpa}}': stats ? stats.gpa.toFixed(2) : '-',
      '{{grade}}': stats ? stats.grade : '-',
      '{{ranking}}': stats ? String(stats.ranking) : '-',
      'Student Name': student.name,
      'Student ID': student.studentNumber || '',
      'Class Name': className,
      'Study Year': studyYearLabel,
    };
  };

  const buildStaffFields = (staff: StaffUser): Record<string, string> => ({
    '{{name}}': staff.name,
    '{{role}}': staff.role,
    '{{department}}': staff.department?.name || '',
    '{{email}}': staff.email,
    '{{certificateDate}}': certificateDate,
    '{{schoolName}}': 'Wattanman Academy',
    'Staff Name': staff.name,
    'Position': staff.role,
    'Emp ID': staff.id.slice(0, 8),
  });

  // ── Export helpers ────────────────────────────────────────────────────────

  const exportStudentPDF = async (student: Student, className: string, studyYearLabel: string) => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadSingleCardPDF(studentDesign, { name: student.name, fieldValues: buildStudentFields(student, className, studyYearLabel) });
    } catch (e) { console.error(e); alert('Export failed.'); }
    finally { setExporting(false); }
  };

  const exportStudentPNG = async (student: Student, className: string, studyYearLabel: string) => {
    if (exporting) return;
    setExporting(true);
    try {
      const canvas = await renderDesignToCanvas(studentDesign, { fieldValues: buildStudentFields(student, className, studyYearLabel) });
      const a = document.createElement('a');
      a.download = `${student.name.replace(/[^a-zA-Z0-9]/g, '-')}-certificate.png`;
      a.href = canvas.toDataURL(); a.click();
    } catch (e) { console.error(e); alert('Export failed.'); }
    finally { setExporting(false); }
  };

  const exportAllStudentsPDF = async (title: string, studyYearLabel: string, students: Student[], className?: string) => {
    if (exporting || students.length === 0) return;
    setExporting(true);
    try {
      await downloadA4CardsPDF(
        studentDesign,
        students.map((s) => ({ name: s.name, fieldValues: buildStudentFields(s, className || title, studyYearLabel) })),
        title,
      );
    } catch (e) { console.error(e); alert('Export failed.'); }
    finally { setExporting(false); }
  };

  const exportStaffPDF = async (staff: StaffUser) => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadSingleCardPDF(staffDesign, { name: staff.name, fieldValues: buildStaffFields(staff) });
    } catch (e) { console.error(e); alert('Export failed.'); }
    finally { setExporting(false); }
  };

  const exportStaffPNG = async (staff: StaffUser) => {
    if (exporting) return;
    setExporting(true);
    try {
      const canvas = await renderDesignToCanvas(staffDesign, { fieldValues: buildStaffFields(staff) });
      const a = document.createElement('a');
      a.download = `${staff.name.replace(/[^a-zA-Z0-9]/g, '-')}-certificate.png`;
      a.href = canvas.toDataURL(); a.click();
    } catch (e) { console.error(e); alert('Export failed.'); }
    finally { setExporting(false); }
  };

  const exportAllStaffPDF = async (staffList: StaffUser[]) => {
    if (exporting || staffList.length === 0) return;
    setExporting(true);
    try {
      await downloadA4CardsPDF(
        staffDesign,
        staffList.map((s) => ({ name: s.name, fieldValues: buildStaffFields(s) })),
        'Staff Certificates',
      );
    } catch (e) { console.error(e); alert('Export failed.'); }
    finally { setExporting(false); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedYearObj = studyYears.find((y) => y.id === selectedStudyYear);
  const studyYearLabel = selectedYearObj?.label || selectedYearObj?.year?.toString() || '';
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const totalStudents = classes.reduce((s, c) => s + c.students.length, 0);

  const hasScores = Object.keys(scoresByStudentId).length > 0;
  const filteredStudents = (() => {
    if (!selectedClass) return [];
    let list = selectedClass.students.filter((s) =>
      !studentSearch ||
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.studentNumber && s.studentNumber.toLowerCase().includes(studentSearch.toLowerCase()))
    );
    // Sort by ranking when scores are loaded
    if (hasScores) {
      list = [...list].sort(
        (a, b) => (scoresByStudentId[a.id]?.ranking ?? 99999) - (scoresByStudentId[b.id]?.ranking ?? 99999)
      );
    }
    // Apply top-N filter
    if (topRankFilter !== 'all' && hasScores) {
      list = list.filter((s) => {
        const rank = scoresByStudentId[s.id]?.ranking;
        return rank !== undefined && rank <= (topRankFilter as number);
      });
    }
    return list;
  })();
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / studentPageSize));
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const pagedStudents = filteredStudents.slice((safeStudentPage - 1) * studentPageSize, safeStudentPage * studentPageSize);

  const filteredStaff = staffUsers.filter((u) => {
    const matchRole = staffRoleFilter === 'ALL' || u.role === staffRoleFilter;
    const matchSearch = !staffSearch || u.name.toLowerCase().includes(staffSearch.toLowerCase()) || u.email.toLowerCase().includes(staffSearch.toLowerCase());
    return matchRole && matchSearch;
  });
  const totalStaffPages = Math.max(1, Math.ceil(filteredStaff.length / staffPageSize));
  const safeStaffPage = Math.min(staffPage, totalStaffPages);
  const pagedStaff = filteredStaff.slice((safeStaffPage - 1) * staffPageSize, safeStaffPage * staffPageSize);
  const staffRoles = ['ALL', ...Array.from(new Set(staffUsers.map((u) => u.role))).sort()];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-shell">
      {exporting && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-lg px-8 py-6 flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
            <p className="text-sm font-medium text-slate-700">Generating certificate…</p>
          </div>
        </div>
      )}

      <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />

      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* Header */}
        <div className="page-header">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl shrink-0">🏆</div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Certificate Dashboard</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {activeTab === 'student'
                    ? selectedYearObj
                      ? `${studyYearLabel} · ${classes.length} classes · ${totalStudents} students`
                      : 'Select a study year to begin'
                    : `${filteredStaff.length} staff member${filteredStaff.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            {activeTab === 'student' && (
              <select
                value={selectedStudyYear}
                onChange={(e) => { setSelectedStudyYear(e.target.value); if (e.target.value) fetchClasses(e.target.value); else setClasses([]); }}
                className="!w-auto text-sm"
              >
                <option value="">Select Study Year…</option>
                {studyYears.map((sy) => (
                  <option key={sy.id} value={sy.id}>{sy.label || sy.year}{sy.isCurrent ? ' (Current)' : ''}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="page-body space-y-5">

          {/* Tab Bar */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            <TabBtn active={activeTab === 'student'} onClick={() => setActiveTab('student')} icon="🎓" label="Student Certificates" />
            <TabBtn active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} icon="👔" label="Staff Certificates" />
          </div>

          {/* ── STUDENT TAB ── */}
          {activeTab === 'student' && (
            <div className="space-y-5">
              <DesignToolbar
                designLoading={studentDesignLoading}
                showEditor={showStudentEditor}
                onRefresh={reloadStudentDesign}
                onToggleEditor={() => setShowStudentEditor((v) => !v)}
                designerHref="/admin/card-designer"
              />

              {showStudentEditor && (
                <InlineEditor
                  cardType="certificate-student"
                  onSave={reloadStudentDesign}
                  onClose={() => { reloadStudentDesign(); setShowStudentEditor(false); }}
                />
              )}

              {!selectedStudyYear && !loadingYears && (
                <EmptyState icon="📅" title="Select a Study Year" desc="Choose a study year to browse classes and generate certificates." />
              )}

              {selectedStudyYear && loadingClasses && (
                <div className="card p-12 text-center">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-slate-500 mt-3">Loading classes…</p>
                </div>
              )}

              {selectedStudyYear && !loadingClasses && !selectedClassId && (
                <div>
                  {classes.length === 0 ? (
                    <EmptyState icon="📭" title="No classes found" desc="Create classes and add students first." />
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-semibold text-slate-700">Select a class</h2>
                        {totalStudents > 0 && (
                          <button
                            onClick={() => exportAllStudentsPDF(studyYearLabel, studyYearLabel, classes.flatMap((c) => c.students))}
                            className="btn-primary btn-sm text-xs"
                          >
                            📄 All Certificates ({totalStudents})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {classes.map((cls) => (
                          <button
                            key={cls.id}
                            onClick={() => { setSelectedClassId(cls.id); setStudentSearch(''); setStudentPage(1); setSelectedStudentIds(new Set()); }}
                            className="card p-0 overflow-hidden text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group cursor-pointer"
                          >
                            <div className="bg-gradient-to-br from-amber-400 to-orange-500 px-5 py-4">
                              <div className="flex items-center justify-between">
                                <span className="text-2xl">🏆</span>
                                <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                  {cls.students.length} student{cls.students.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <h3 className="text-white font-bold text-lg mt-3 leading-tight">{cls.name}</h3>
                              {cls.subject && <p className="text-white/75 text-xs mt-0.5">{cls.subject}</p>}
                            </div>
                            <div className="px-5 py-3 flex items-center justify-between bg-white">
                              <span className="text-xs text-slate-500 truncate">{cls.teacher ? `👤 ${cls.teacher.name}` : 'No teacher assigned'}</span>
                              <span className="text-amber-400 group-hover:text-amber-600 text-sm transition-colors">Open →</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {selectedStudyYear && !loadingClasses && selectedClass && (
                <div className="space-y-4">

                  {/* ── Generate for bar (above the controls card) ── */}
                  {hasScores && (
                    <div className="card px-4 py-3 flex items-center gap-3 flex-wrap border-l-4 border-l-amber-400">
                      <span className="text-xs font-semibold text-slate-600 shrink-0">🏆 Generate for:</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(['all', 3, 4, 5] as const).map((opt) => (
                          <button
                            key={String(opt)}
                            onClick={() => { setTopRankFilter(opt); setStudentPage(1); setSelectedStudentIds(new Set()); }}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                              topRankFilter === opt
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'border-slate-200 text-slate-600 hover:bg-amber-50 hover:border-amber-200'
                            }`}
                          >
                            {opt === 'all' ? '🎓 All Students' : `🏆 Top ${opt}`}
                          </button>
                        ))}
                      </div>
                      {topRankFilter !== 'all' && (
                        <span className="ml-auto text-xs text-amber-600 font-medium shrink-0">
                          {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} shown
                        </span>
                      )}
                    </div>
                  )}

                  <div className="card p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        onClick={() => { setSelectedClassId(null); setSelectedStudentIds(new Set()); }}
                        className="flex items-center gap-1.5 text-amber-600 hover:text-amber-800 font-medium text-sm transition-colors shrink-0"
                      >
                        ← Back to Classes
                      </button>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">🏆</div>
                        <div>
                          <h2 className="font-bold text-slate-800 text-base leading-tight">{selectedClass.name}</h2>
                          <p className="text-xs text-slate-500">
                            {selectedClass.teacher && `${selectedClass.teacher.name} · `}
                            {studyYearLabel && `${studyYearLabel} · `}
                            {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
                            {loadingScores && <span className="ml-2 inline-flex items-center gap-1 text-amber-500"><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />Loading scores…</span>}
                            {!loadingScores && Object.keys(scoresByStudentId).length > 0 && <span className="ml-2 text-green-600">· 📊 Scores loaded</span>}
                          </p>
                        </div>
                      </div>
                      <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                          <input
                            type="text" placeholder="Search students…" value={studentSearch}
                            onChange={(e) => { setStudentSearch(e.target.value); setStudentPage(1); }}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                          />
                        </div>
                        <button onClick={() => setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)))} className="px-3 py-2 text-xs rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 font-medium transition-colors">☑ All</button>
                        <button onClick={() => setSelectedStudentIds(new Set())} className="px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium transition-colors">☐ None</button>
                        {filteredStudents.length > 0 && (
                          <button
                            onClick={() => {
                              const toExport = selectedStudentIds.size > 0
                                ? filteredStudents.filter((s) => selectedStudentIds.has(s.id))
                                : filteredStudents;
                              exportAllStudentsPDF(selectedClass.name, studyYearLabel, toExport, selectedClass.name);
                            }}
                            className="px-3 py-2 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                          >
                            📄 {selectedStudentIds.size > 0
                              ? `PDF (${selectedStudentIds.size})`
                              : topRankFilter !== 'all'
                                ? `PDF Top ${topRankFilter} (${filteredStudents.length})`
                                : `PDF All (${filteredStudents.length})`}
                          </button>
                        )}
                      </div>
                    </div>
                    {selectedStudentIds.size > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
                          ✅ {selectedStudentIds.size} selected for export
                        </span>
                      </div>
                    )}
                  </div>

                  {pagedStudents.length === 0 ? (
                    <div className="card p-8 text-center">
                      <p className="text-slate-400 text-sm">{studentSearch ? `No students matching "${studentSearch}"` : 'No students in this class'}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {pagedStudents.map((student) => (
                        <CertPreview
                          key={student.id}
                          name={student.name}
                          subtitle={`${selectedClass.name}${studyYearLabel ? ' · ' + studyYearLabel : ''}`}
                          design={studentDesign}
                          fieldValues={buildStudentFields(student, selectedClass.name, studyYearLabel)}
                          isSelected={selectedStudentIds.has(student.id)}
                          ranking={scoresByStudentId[student.id]?.ranking}
                          onToggleSelect={() => setSelectedStudentIds((prev) => {
                            const next = new Set(prev);
                            next.has(student.id) ? next.delete(student.id) : next.add(student.id);
                            return next;
                          })}
                          onDownloadPDF={() => exportStudentPDF(student, selectedClass.name, studyYearLabel)}
                          onDownloadPNG={() => exportStudentPNG(student, selectedClass.name, studyYearLabel)}
                        />
                      ))}
                    </div>
                  )}

                  {totalStudentPages > 1 && (
                    <PaginationBar
                      page={safeStudentPage} total={totalStudentPages} onPage={setStudentPage}
                      from={(safeStudentPage - 1) * studentPageSize + 1}
                      to={Math.min(safeStudentPage * studentPageSize, filteredStudents.length)}
                      count={filteredStudents.length} accentClass="bg-amber-500 text-white border-amber-500"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STAFF TAB ── */}
          {activeTab === 'staff' && (
            <div className="space-y-5">
              <DesignToolbar
                designLoading={staffDesignLoading}
                showEditor={showStaffEditor}
                onRefresh={reloadStaffDesign}
                onToggleEditor={() => setShowStaffEditor((v) => !v)}
                designerHref="/admin/card-designer"
              />

              {showStaffEditor && (
                <InlineEditor
                  cardType="certificate-staff"
                  onSave={reloadStaffDesign}
                  onClose={() => { reloadStaffDesign(); setShowStaffEditor(false); }}
                />
              )}

              <div className="card p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                      <input
                        type="text" placeholder="Search staff…" value={staffSearch}
                        onChange={(e) => { setStaffSearch(e.target.value); setStaffPage(1); }}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                      />
                    </div>
                    <select
                      value={staffRoleFilter}
                      onChange={(e) => { setStaffRoleFilter(e.target.value); setStaffPage(1); setSelectedStaffIds(new Set()); }}
                      className="!w-auto text-sm"
                    >
                      {staffRoles.map((r) => <option key={r} value={r}>{r === 'ALL' ? 'All Roles' : r}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSelectedStaffIds(new Set(filteredStaff.map((s) => s.id)))} className="px-3 py-2 text-xs rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-medium transition-colors">☑ All</button>
                    <button onClick={() => setSelectedStaffIds(new Set())} className="px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium transition-colors">☐ None</button>
                    {filteredStaff.length > 0 && (
                      <button
                        onClick={() => exportAllStaffPDF(selectedStaffIds.size > 0 ? filteredStaff.filter((s) => selectedStaffIds.has(s.id)) : filteredStaff)}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                      >
                        📄 {selectedStaffIds.size > 0 ? `PDF (${selectedStaffIds.size})` : `PDF All (${filteredStaff.length})`}
                      </button>
                    )}
                  </div>
                </div>
                {selectedStaffIds.size > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                      ✅ {selectedStaffIds.size} selected for export
                    </span>
                  </div>
                )}
              </div>

              {loadingStaff ? (
                <div className="card p-12 text-center">
                  <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-slate-500 mt-3">Loading staff…</p>
                </div>
              ) : pagedStaff.length === 0 ? (
                <EmptyState icon="👤" title="No staff found" desc={staffSearch ? `No staff matching "${staffSearch}"` : 'No staff members for this filter.'} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {pagedStaff.map((staff) => (
                    <CertPreview
                      key={staff.id}
                      name={staff.name}
                      subtitle={`${staff.role}${staff.department ? ' · ' + staff.department.name : ''}`}
                      photo={staff.photo}
                      design={staffDesign}
                      fieldValues={buildStaffFields(staff)}
                      isSelected={selectedStaffIds.has(staff.id)}
                      onToggleSelect={() => setSelectedStaffIds((prev) => {
                        const next = new Set(prev);
                        next.has(staff.id) ? next.delete(staff.id) : next.add(staff.id);
                        return next;
                      })}
                      onDownloadPDF={() => exportStaffPDF(staff)}
                      onDownloadPNG={() => exportStaffPNG(staff)}
                    />
                  ))}
                </div>
              )}

              {!loadingStaff && totalStaffPages > 1 && (
                <PaginationBar
                  page={safeStaffPage} total={totalStaffPages} onPage={setStaffPage}
                  from={(safeStaffPage - 1) * staffPageSize + 1}
                  to={Math.min(safeStaffPage * staffPageSize, filteredStaff.length)}
                  count={filteredStaff.length} accentClass="bg-emerald-600 text-white border-emerald-600"
                />
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${active ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DesignToolbar({
  designLoading, showEditor, onRefresh, onToggleEditor, designerHref,
}: {
  designLoading: boolean;
  showEditor: boolean;
  onRefresh: () => void;
  onToggleEditor: () => void;
  designerHref: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {designLoading ? (
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
          Loading template…
        </span>
      ) : (
        <button onClick={onRefresh} className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
          🔄 Refresh Template
        </button>
      )}
      <button
        onClick={onToggleEditor}
        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${showEditor ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
      >
        {showEditor ? '✕ Close Editor' : '✏️ Edit Design'}
      </button>
      <Link href={designerHref} className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
        🎨 Full Designer
      </Link>
    </div>
  );
}

function InlineEditor({
  cardType, onSave, onClose,
}: {
  cardType: 'certificate-student' | 'certificate-staff';
  onSave: () => void;
  onClose: () => void;
}) {
  const CardEditor = dynamic(() => import('../../../components/card-designer/CardEditor'), { ssr: false });
  const label = cardType === 'certificate-student' ? 'Student Certificate' : 'Staff Certificate';
  return (
    <div className="card overflow-hidden border-2 border-amber-200">
      <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200">
        <div>
          <h3 className="font-semibold text-slate-800">✏️ Editing {label} Design</h3>
          <p className="text-xs text-slate-500 mt-0.5">Save to apply changes to all certificates below</p>
        </div>
        <button onClick={onClose} className="btn-ghost btn-sm">✕ Close</button>
      </div>
      <div className="p-2">
        <CardEditor initialCardType={cardType} onSave={onSave} />
      </div>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card p-14">
      <div className="empty-state">
        <div className="text-4xl mb-3">{icon}</div>
        <p className="font-semibold text-slate-600">{title}</p>
        <p className="text-sm text-slate-400 mt-1">{desc}</p>
      </div>
    </div>
  );
}

function PaginationBar({
  page, total, onPage, from, to, count, accentClass,
}: {
  page: number; total: number; onPage: (p: number) => void;
  from: number; to: number; count: number; accentClass: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Showing {from}–{to} of {count}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Prev</button>
          {Array.from({ length: total }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === total || Math.abs(p - page) <= 1)
            .reduce<(number | string)[]>((acc, p, i, arr) => {
              if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              typeof p === 'string'
                ? <span key={`d${i}`} className="px-1 text-xs text-slate-400">…</span>
                : <button key={p} onClick={() => onPage(p)} className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${p === page ? accentClass : 'border-slate-200 hover:bg-slate-50'}`}>{p}</button>
            )}
          <button onClick={() => onPage(Math.min(total, page + 1))} disabled={page >= total} className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next →</button>
        </div>
      </div>
    </div>
  );
}

function CertPreview({
  name, subtitle, photo, design, fieldValues, isSelected, onToggleSelect, onDownloadPDF, onDownloadPNG, ranking,
}: {
  name: string;
  subtitle: string;
  photo?: string | null;
  design: CardDesign;
  fieldValues: Record<string, string>;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDownloadPDF: () => void;
  onDownloadPNG: () => void;
  ranking?: number;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    renderDesignToCanvas(design, { fieldValues, photoUrl: photo }).then((canvas) => {
      if (!cancelled) { setImgSrc(canvas.toDataURL()); setRendering(false); }
    }).catch(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [design, fieldValues, photo]);

  return (
    <div className={`group flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-200 ${isSelected ? 'border-amber-400 shadow-amber-100 shadow-lg' : 'border-slate-200 shadow-sm hover:shadow-md'}`}>
      {/* Canvas preview — clickable to toggle selection */}
      <div
        className="relative cursor-pointer bg-slate-100"
        style={{ aspectRatio: `${design.width} / ${design.height}` }}
        onClick={onToggleSelect}
        title="Click to select"
      >
        {rendering || !imgSrc ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <img src={imgSrc} alt={`${name} certificate`} className="w-full h-full object-contain" />
        )}
        <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-amber-500/10' : 'hover:bg-black/5'}`} />
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow">
            <span className="text-white text-xs font-bold leading-none">✓</span>
          </div>
        )}
        {ranking !== undefined && ranking <= 3 && (
          <div className="absolute top-2 left-2 text-2xl leading-none drop-shadow-md select-none pointer-events-none">
            {ranking === 1 ? '🥇' : ranking === 2 ? '🥈' : '🥉'}
          </div>
        )}
        {ranking !== undefined && ranking > 3 && (
          <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow leading-none pointer-events-none">
            #{ranking}
          </div>
        )}
      </div>
      {/* Info + actions */}
      <div className="bg-white px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
          <p className="text-xs text-slate-400 truncate">{subtitle}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onDownloadPNG}
            disabled={!imgSrc}
            className="text-[11px] px-2 py-1.5 rounded-lg font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40"
            title="Download PNG"
          >PNG</button>
          <button
            onClick={onDownloadPDF}
            disabled={!imgSrc}
            className="text-[11px] px-2 py-1.5 rounded-lg font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
            title="Download PDF"
          >PDF</button>
        </div>
      </div>
    </div>
  );
}
