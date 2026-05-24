'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { apiFetch } from '../../../lib/api';
import { formatDOB } from '../../../lib/dateUtils';
import { useLanguage } from '../../../lib/i18n';

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

interface CertConfig {
  title: string;
  subtitle: string;
  body: string;
  footerNote: string;
  signatoryName: string;
  signatoryTitle: string;
  date: string;
  schoolName: string;
}

const DEFAULT_CONFIG: CertConfig = {
  title: 'Certificate of Achievement',
  subtitle: 'This is to certify that',
  body: 'has successfully completed all requirements and demonstrated outstanding dedication to academic excellence.',
  footerNote: 'Awarded with recognition and honor.',
  signatoryName: 'Principal',
  signatoryTitle: 'School Principal',
  date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  schoolName: 'Wattanaman School',
};

export default function CertificatePage() {
  const { t, lang } = useLanguage();
  const [studyYears, setStudyYears] = useState<StudyYear[]>([]);
  const [selectedStudyYear, setSelectedStudyYear] = useState<string>('');
  const [classes, setClasses] = useState<ClassWithStudents[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [previewStudent, setPreviewStudent] = useState<{ student: Student; className: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<CertConfig>(DEFAULT_CONFIG);
  const [printing, setPrinting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchStudyYears(); }, []);

  const fetchStudyYears = async () => {
    try {
      const res = await apiFetch('/api/study-years');
      if (res.ok) {
        const years: StudyYear[] = await res.json();
        setStudyYears(years);
        const current = years.find((y) => y.isCurrent);
        if (current) {
          setSelectedStudyYear(current.id);
          await fetchClasses(current.id);
        }
      }
    } catch {
      console.error('Failed to fetch study years');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async (studyYearId: string) => {
    setLoadingClasses(true);
    setSelectedClassId(null);
    setSelectedStudents(new Set());
    try {
      const res = await apiFetch(`/api/classes?studyYearId=${studyYearId}`);
      if (!res.ok) { setClasses([]); return; }
      const classList: ClassItem[] = await res.json();

      const withStudents: ClassWithStudents[] = await Promise.all(
        classList.map(async (cls) => {
          try {
            const r = await apiFetch(`/api/classes/${cls.id}/students`);
            const students = r.ok ? await r.json() : [];
            return { ...cls, students };
          } catch {
            return { ...cls, students: [] };
          }
        })
      );
      setClasses(withStudents);
    } catch {
      console.error('Failed to fetch classes');
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleStudyYearChange = (id: string) => {
    setSelectedStudyYear(id);
    if (id) fetchClasses(id);
    else setClasses([]);
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const selectedYearObj = studyYears.find((y) => y.id === selectedStudyYear);
  const studyYearLabel = selectedYearObj?.label || selectedYearObj?.year?.toString() || '';

  const filteredStudents = selectedClass
    ? selectedClass.students.filter((s) =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.studentNumber && s.studentNumber.toLowerCase().includes(search.toLowerCase()))
      )
    : [];
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedStudents(new Set(filteredStudents.map((s) => s.id)));
  };

  const clearAll = () => setSelectedStudents(new Set());

  const handlePrint = useCallback((student: Student, className: string) => {
    setPreviewStudent({ student, className });
  }, []);

  const handlePrintSelected = useCallback(() => {
    if (!selectedClass) return;
    const students = selectedClass.students.filter((s) => selectedStudents.has(s.id));
    if (students.length === 0) return;
    setPreviewStudent({ student: students[0], className: selectedClass.name });
    setPrinting(true);
  }, [selectedClass, selectedStudents]);

  const doPrint = () => {
    window.print();
  };

  const totalStudents = classes.reduce((sum, c) => sum + c.students.length, 0);
  const totalClasses = classes.length;

  if (loading) {
    return (
      <div className="page-shell">
        <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
        <div className="page-content">
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-500 mt-3">Loading…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print-only certificate styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #cert-print-area { display: block !important; }
          #cert-print-area .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 0; }
        }
        #cert-print-area { display: none; }
      `}</style>

      {/* Print Area — hidden on screen, visible when printing */}
      {previewStudent && (
        <div id="cert-print-area">
          {printing && selectedClass
            ? selectedClass.students
                .filter((s) => selectedStudents.has(s.id))
                .map((s) => (
                  <CertificateSheet
                    key={s.id}
                    student={s}
                    className={selectedClass.name}
                    studyYear={studyYearLabel}
                    config={config}
                    lang={lang}
                  />
                ))
            : (
              <CertificateSheet
                student={previewStudent.student}
                className={previewStudent.className}
                studyYear={studyYearLabel}
                config={config}
                lang={lang}
              />
            )}
        </div>
      )}

      <div className="page-shell">
        <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
        <div className="page-content">
          <div className="h-14 lg:hidden" />

          {/* Header */}
          <div className="page-header">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="text-xl">🏆</span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-800">Certificate Dashboard</h1>
                </div>
                <p className="text-sm text-slate-500 ml-13">
                  {selectedYearObj
                    ? `${studyYearLabel} · ${totalClasses} class${totalClasses !== 1 ? 'es' : ''} · ${totalStudents} student${totalStudents !== 1 ? 's' : ''}`
                    : 'Generate and print achievement certificates for students'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedStudyYear}
                  onChange={(e) => handleStudyYearChange(e.target.value)}
                  className="!w-auto text-sm"
                >
                  <option value="">Select Study Year…</option>
                  {studyYears.map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.label || sy.year}{sy.isCurrent ? ' (Current)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showSettings ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  ⚙️ Certificate Settings
                </button>
              </div>
            </div>
          </div>

          <div className="page-body space-y-5">
            {/* Stats bar */}
            {selectedStudyYear && !loadingClasses && classes.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon="📚" label="Classes" value={totalClasses} color="blue" />
                <StatCard icon="🎓" label="Students" value={totalStudents} color="indigo" />
                <StatCard icon="✅" label="Selected" value={selectedStudents.size} color="green" />
                <StatCard icon="📄" label="Certificates" value={selectedStudents.size} color="amber" />
              </div>
            )}

            {/* Certificate Settings Panel */}
            {showSettings && (
              <div className="card overflow-hidden border-2 border-amber-200">
                <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200">
                  <div>
                    <h3 className="font-semibold text-slate-800">⚙️ Certificate Template Settings</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Customize the text and details on the certificate</p>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 transition-colors text-lg font-light">✕</button>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ConfigField label="School Name" value={config.schoolName} onChange={(v) => setConfig((c) => ({ ...c, schoolName: v }))} />
                  <ConfigField label="Certificate Title" value={config.title} onChange={(v) => setConfig((c) => ({ ...c, title: v }))} />
                  <ConfigField label="Subtitle (before name)" value={config.subtitle} onChange={(v) => setConfig((c) => ({ ...c, subtitle: v }))} />
                  <ConfigField label="Body Text" value={config.body} onChange={(v) => setConfig((c) => ({ ...c, body: v }))} textarea />
                  <ConfigField label="Footer Note" value={config.footerNote} onChange={(v) => setConfig((c) => ({ ...c, footerNote: v }))} />
                  <ConfigField label="Date" value={config.date} onChange={(v) => setConfig((c) => ({ ...c, date: v }))} />
                  <ConfigField label="Signatory Name" value={config.signatoryName} onChange={(v) => setConfig((c) => ({ ...c, signatoryName: v }))} />
                  <ConfigField label="Signatory Title" value={config.signatoryTitle} onChange={(v) => setConfig((c) => ({ ...c, signatoryTitle: v }))} />
                  <div className="flex items-end">
                    <button
                      onClick={() => setConfig(DEFAULT_CONFIG)}
                      className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      ↺ Reset to Default
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* No study year */}
            {!selectedStudyYear && (
              <div className="card p-16">
                <div className="empty-state">
                  <div className="text-5xl mb-4">🏅</div>
                  <p className="font-semibold text-slate-600 text-lg">Select a Study Year</p>
                  <p className="text-sm text-slate-400 mt-2">Choose a study year to browse classes and generate certificates.</p>
                </div>
              </div>
            )}

            {/* Loading */}
            {selectedStudyYear && loadingClasses && (
              <div className="card p-12 text-center">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-500 mt-3">Loading classes…</p>
              </div>
            )}

            {/* Main content: Class grid or Student list */}
            {selectedStudyYear && !loadingClasses && (
              <>
                {classes.length === 0 ? (
                  <div className="card p-12">
                    <div className="empty-state">
                      <div className="text-4xl mb-3">📭</div>
                      <p className="font-semibold text-slate-600">No classes found</p>
                      <p className="text-sm text-slate-400 mt-1">Create classes and add students first.</p>
                    </div>
                  </div>
                ) : !selectedClassId ? (
                  /* ── Class Grid ── */
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-slate-700">
                        Select a class to manage certificates
                      </h2>
                      <span className="text-xs text-slate-400">{totalClasses} classes</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {classes.map((cls) => (
                        <button
                          key={cls.id}
                          onClick={() => { setSelectedClassId(cls.id); setSearch(''); setPage(1); setSelectedStudents(new Set()); }}
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
                            {cls.subject && (
                              <p className="text-white/75 text-xs mt-0.5">{cls.subject}</p>
                            )}
                          </div>
                          <div className="px-5 py-3 flex items-center justify-between bg-white">
                            <div className="text-xs text-slate-500 truncate">
                              {cls.teacher ? `👤 ${cls.teacher.name}` : 'No teacher assigned'}
                            </div>
                            <span className="text-amber-400 group-hover:text-amber-600 text-sm transition-colors">Open →</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : selectedClass ? (
                  /* ── Student List ── */
                  <div className="space-y-4">
                    {/* Class header bar */}
                    <div className="card p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                          onClick={() => { setSelectedClassId(null); setSelectedStudents(new Set()); }}
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
                              {selectedClass.students.length} student{selectedClass.students.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
                          {/* Search */}
                          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                            <input
                              type="text"
                              placeholder="Search students…"
                              value={search}
                              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                            />
                          </div>

                          {/* Select / Clear */}
                          <button onClick={selectAll} className="px-3 py-2 text-xs rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 font-medium transition-colors">
                            ☑ Select All
                          </button>
                          <button onClick={clearAll} className="px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium transition-colors">
                            ☐ Clear
                          </button>

                          {/* Print selected */}
                          {selectedStudents.size > 0 && (
                            <button
                              onClick={() => { setPrinting(true); setPreviewStudent({ student: selectedClass.students[0], className: selectedClass.name }); setTimeout(doPrint, 300); }}
                              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5"
                            >
                              🖨️ Print Selected ({selectedStudents.size})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Selection info */}
                    {selectedStudents.size > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                          ✅ {selectedStudents.size} student{selectedStudents.size !== 1 ? 's' : ''} selected for certificate
                        </span>
                      </div>
                    )}

                    {/* Student grid */}
                    {pagedStudents.length === 0 ? (
                      <div className="card p-8 text-center">
                        <p className="text-slate-400 text-sm">
                          {search ? `No students matching "${search}"` : 'No students in this class'}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {pagedStudents.map((student) => {
                          const isSelected = selectedStudents.has(student.id);
                          return (
                            <StudentCertCard
                              key={student.id}
                              student={student}
                              className={selectedClass.name}
                              studyYear={studyYearLabel}
                              config={config}
                              lang={lang}
                              isSelected={isSelected}
                              onToggle={() => toggleStudent(student.id)}
                              onPrint={() => { setPrinting(false); setPreviewStudent({ student, className: selectedClass.name }); setTimeout(doPrint, 300); }}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="card px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">
                            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredStudents.length)} of {filteredStudents.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              disabled={safePage <= 1}
                              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >← Prev</button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                              .reduce<(number | string)[]>((acc, p, i, arr) => {
                                if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                                acc.push(p);
                                return acc;
                              }, [])
                              .map((p, i) =>
                                typeof p === 'string'
                                  ? <span key={`dot-${i}`} className="px-1 text-xs text-slate-400">…</span>
                                  : <button key={p} onClick={() => setPage(p)} className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${p === safePage ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 hover:bg-slate-50'}`}>{p}</button>
                              )}
                            <button
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              disabled={safePage >= totalPages}
                              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >Next →</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Screen preview modal */}
      {previewStudent && !printing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setPreviewStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Certificate Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPrinting(false); setTimeout(doPrint, 100); }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5"
                >
                  🖨️ Print Certificate
                </button>
                <button onClick={() => setPreviewStudent(null)} className="text-slate-400 hover:text-slate-600 text-lg font-light transition-colors">✕</button>
              </div>
            </div>
            <div className="p-4 overflow-auto max-h-[80vh]">
              <div className="transform scale-[0.65] origin-top -mb-24">
                <CertificateSheet
                  student={previewStudent.student}
                  className={previewStudent.className}
                  studyYear={studyYearLabel}
                  config={config}
                  lang={lang}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: 'blue' | 'indigo' | 'green' | 'amber' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-100',
    indigo: 'bg-indigo-50 border-indigo-100',
    green: 'bg-green-50 border-green-100',
    amber: 'bg-amber-50 border-amber-100',
  };
  const textColors = {
    blue: 'text-blue-700',
    indigo: 'text-indigo-700',
    green: 'text-green-700',
    amber: 'text-amber-700',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color]}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div>
          <p className={`text-xl font-bold leading-tight ${textColors[color]}`}>{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ConfigField({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 transition-all resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 transition-all"
        />
      )}
    </div>
  );
}

function StudentCertCard({
  student, className, studyYear, config, lang, isSelected, onToggle, onPrint,
}: {
  student: Student;
  className: string;
  studyYear: string;
  config: CertConfig;
  lang: string;
  isSelected: boolean;
  onToggle: () => void;
  onPrint: () => void;
}) {
  return (
    <div
      className={`card p-0 overflow-hidden transition-all duration-200 cursor-pointer group ${isSelected ? 'ring-2 ring-amber-400 shadow-amber-100 shadow-md' : 'hover:shadow-md'}`}
      onClick={onToggle}
    >
      {/* Card top */}
      <div className={`px-4 pt-4 pb-3 transition-colors ${isSelected ? 'bg-amber-50' : 'bg-white'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Checkbox */}
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-300 group-hover:border-amber-400'}`}>
              {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
            </div>
            {/* Photo or avatar */}
            {student.photo ? (
              <img
                src={student.photo}
                alt={student.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-white shadow shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 text-white font-bold text-sm shadow">
                {student.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{student.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">#{student.studentNumber || '—'}</p>
            </div>
          </div>
          {isSelected && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">Selected</span>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">{className}</span>
          {studyYear && <span className="text-xs text-slate-400">{studyYear}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPrint}
          className="flex-1 py-1.5 text-[11px] font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
        >
          🖨️ Print
        </button>
        <button
          onClick={onToggle}
          className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${isSelected ? 'border-amber-300 text-amber-600 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
        >
          {isSelected ? '✓ Selected' : '+ Select'}
        </button>
      </div>
    </div>
  );
}

function CertificateSheet({
  student, className, studyYear, config, lang,
}: {
  student: Student;
  className: string;
  studyYear: string;
  config: CertConfig;
  lang: string;
}) {
  return (
    <div
      style={{
        width: '297mm',
        height: '210mm',
        background: 'white',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Georgia, "Times New Roman", serif',
        pageBreakAfter: 'always',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Outer border */}
      <div style={{
        position: 'absolute', inset: '8mm',
        border: '3px solid #d97706',
        borderRadius: '4px',
        pointerEvents: 'none',
      }} />
      {/* Inner border */}
      <div style={{
        position: 'absolute', inset: '11mm',
        border: '1px solid #fbbf24',
        borderRadius: '2px',
        pointerEvents: 'none',
      }} />

      {/* Corner decorations */}
      {[['12mm', '12mm'], ['12mm', 'auto'], ['auto', '12mm'], ['auto', 'auto']].map(([top, left], i) => (
        <div key={i} style={{
          position: 'absolute',
          top: i < 2 ? top : 'auto',
          bottom: i >= 2 ? '12mm' : 'auto',
          left: i % 2 === 0 ? left : 'auto',
          right: i % 2 === 1 ? '12mm' : 'auto',
          width: '18mm',
          height: '18mm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
        }}>
          ✦
        </div>
      ))}

      {/* Background watermark */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '200px', opacity: 0.025, pointerEvents: 'none',
        color: '#d97706',
      }}>🏆</div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24mm', width: '100%', boxSizing: 'border-box' }}>
        {/* School name */}
        <p style={{ fontSize: '14px', color: '#92400e', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'Georgia, serif', marginBottom: '4mm' }}>
          {config.schoolName}
        </p>

        {/* Decorative rule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '5mm' }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #d97706)' }} />
          <span style={{ color: '#d97706', fontSize: '16px' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #d97706)' }} />
        </div>

        {/* Main title */}
        <h1 style={{ fontSize: '32px', color: '#1e293b', fontFamily: 'Georgia, serif', marginBottom: '4mm', fontWeight: 'bold', letterSpacing: '1px' }}>
          {config.title}
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', marginBottom: '5mm', letterSpacing: '0.5px' }}>
          {config.subtitle}
        </p>

        {/* Student name */}
        <div style={{ marginBottom: '5mm' }}>
          <p style={{
            fontSize: '36px',
            color: '#92400e',
            fontFamily: 'Georgia, serif',
            fontWeight: 'bold',
            letterSpacing: '1px',
            borderBottom: '2px solid #fbbf24',
            display: 'inline-block',
            paddingBottom: '2mm',
            paddingLeft: '6mm',
            paddingRight: '6mm',
          }}>
            {student.name}
          </p>
        </div>

        {/* Class & Year */}
        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '5mm' }}>
          <strong>{className}</strong>{studyYear ? ` · Academic Year ${studyYear}` : ''}
          {student.studentNumber ? ` · ID: ${student.studentNumber}` : ''}
        </p>

        {/* Body text */}
        <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.8', maxWidth: '180mm', margin: '0 auto 6mm', fontStyle: 'italic' }}>
          {config.body}
        </p>

        {/* Decorative rule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '5mm' }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #d97706)' }} />
          <span style={{ color: '#d97706', fontSize: '12px' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #d97706)' }} />
        </div>

        {/* Footer: footer note + date + signature */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '2mm' }}>
          {/* Footer note */}
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>{config.footerNote}</p>
          </div>

          {/* Date */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: '#64748b' }}>{config.date}</p>
          </div>

          {/* Signatory */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2mm', minWidth: '40mm' }}>
              <p style={{ fontSize: '11px', color: '#1e293b', fontWeight: 'bold' }}>{config.signatoryName}</p>
              <p style={{ fontSize: '10px', color: '#64748b' }}>{config.signatoryTitle}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
