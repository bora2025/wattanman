'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CardDesign, CardType, FONT_OPTIONS,
  LogoElement, PhotoPlaceholder, QrPlaceholder, ShapeElement, TextElement,
  STUDENT_TEMPLATE, STAFF_TEMPLATE, BLANK_TEMPLATE,
  STUDENT_CLASSIC_BLUE, STUDENT_DARK_NAVY, STUDENT_SKY_WAVE, STUDENT_GEOMETRIC, STUDENT_MINIMAL,
  STAFF_CORPORATE_TEAL, STAFF_DEEP_OCEAN, STAFF_ROSE, STAFF_FOREST, STAFF_SLATE_EXECUTIVE,
  loadSavedDesign, saveDesign, clearAllCache, SavedTemplate,
  apiLoadTemplates, apiSaveTemplate, apiDeleteTemplate, apiGetActiveDesign, apiSetActiveDesign,
} from './types';
import { renderDesignToCanvas } from './renderDesignToCanvas';
import { downloadSingleCardPDF } from './generateCardPDF';
import CardCanvas from './CardCanvas';
import Toolbar from './Toolbar';
import LayersPanel from './LayersPanel';
import NewProjectDialog from './NewProjectDialog';

const TEMPLATES: Partial<Record<CardType, CardDesign>> = { student: STUDENT_TEMPLATE, staff: STAFF_TEMPLATE };

const PREVIEW_DATA: Record<string, string> = {
  'Student Name': 'Sophea Chann', 'Name': 'Sophea Chann', 'ID': 'STU-2024-001',
  'Student ID': 'STU-2024-001', 'Class': 'Grade 10A', 'Class Name': 'Grade 10A',
  'Gender': 'Female', 'Date of Birth': '12 Mar 2008', 'DOB': '12 Mar 2008',
  'Address': '123 Norodom Blvd, Phnom Penh', 'Ranking': '#3 / Monthly',
  'Monthly Rank': '#3', 'Yearly Rank': '#5', 'Department': 'Mathematics',
  'Role': 'Senior Teacher', 'Staff Name': 'Dara Sok', 'Staff ID': 'STAFF-2024-042',
  'School': 'Wattanman School', 'Year': '2024-2025',
};

function applyPreviewData(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    return PREVIEW_DATA[trimmed] ?? `[${trimmed}]`;
  });
}

// ── Compact top-bar icon button ──────────────────────────────────────────────
interface TopBtnProps {
  icon: string; label: string; title?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'emerald' | 'indigo' | 'violet' | 'amber' | 'danger';
}
function TopBtn({ icon, label, title, onClick, disabled, active, variant = 'default' }: TopBtnProps) {
  const base = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed select-none';
  const variants: Record<string, string> = {
    default: active ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
    emerald: active ? 'bg-emerald-600 text-white' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
    indigo: active ? 'bg-indigo-600 text-white' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100',
    violet: active ? 'bg-violet-600 text-white' : 'text-violet-700 bg-violet-50 hover:bg-violet-100',
    amber: active ? 'bg-amber-500 text-white' : 'text-amber-700 bg-amber-50 hover:bg-amber-100',
    danger: 'text-red-600 hover:bg-red-50',
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title ?? label} className={`${base} ${variants[variant]}`}>
      <span className="text-sm leading-none">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-slate-200 mx-0.5 shrink-0" />;
}

export default function CardEditor({ initialCardType, openNewProject, onSave }: { initialCardType?: CardType; openNewProject?: boolean; onSave?: () => void } = {}) {
  const [design, setDesign] = useState<CardDesign>(initialCardType === 'staff' ? STAFF_TEMPLATE : STUDENT_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const lastDesignRef = useRef<CardDesign | null>(null);
  const isFirstRenderRef = useRef(true);
  const isLoadingRef = useRef(true);

  // ── Canvas view state ────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(100); // percent
  const [showGrid, setShowGrid] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showNewProject, setShowNewProject] = useState(openNewProject ?? false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);

  // ── History ──────────────────────────────────────────────────────────────
  const historyStackRef = useRef<CardDesign[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);
  const canUndo = historyTick >= 0 && historyIndexRef.current > 0;
  const canRedo = historyTick >= 0 && historyIndexRef.current < historyStackRef.current.length - 1;

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current--;
    setDesign(historyStackRef.current[historyIndexRef.current]);
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyStackRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current++;
    setDesign(historyStackRef.current[historyIndexRef.current]);
    setHistoryTick((t) => t + 1);
  }, []);

  // ── Context menu ─────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string | null } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // ── Template modals ──────────────────────────────────────────────────────
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [templatePreviews, setTemplatePreviews] = useState<Record<string, string>>({});
  const [showClearCache, setShowClearCache] = useState(false);

  // ── Server sync ──────────────────────────────────────────────────────────
  const syncToServer = useCallback(async (d: CardDesign) => {
    setSyncStatus('syncing');
    const ok = await apiSetActiveDesign(d);
    if (ok) { lastDesignRef.current = d; setSyncStatus('synced'); setTimeout(() => setSyncStatus('idle'), 3000); }
    else setSyncStatus('error');
  }, []);

  // ── Load on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    isLoadingRef.current = true;
    const cardType = initialCardType ?? 'student';
    const localDesign = loadSavedDesign(cardType);
    if (localDesign) setDesign(localDesign);
    apiGetActiveDesign(cardType).then((apiDesign) => {
      if (apiDesign) { saveDesign(apiDesign); setDesign(apiDesign); lastDesignRef.current = apiDesign; }
      else if (localDesign) { saveDesign(localDesign); syncToServer(localDesign); }
    }).finally(() => { setTimeout(() => { isLoadingRef.current = false; }, 2000); });
  }, [initialCardType, syncToServer]);

  // ── History tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return; }
    const timer = setTimeout(() => {
      historyStackRef.current = [...historyStackRef.current.slice(0, historyIndexRef.current + 1), design].slice(-50);
      historyIndexRef.current = historyStackRef.current.length - 1;
      setHistoryTick((t) => t + 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [design]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      // Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveRef.current(); return; }

      if (isEditing) return;

      // Escape: deselect
      if (e.key === 'Escape') { setSelectedId(null); return; }

      // Delete / Backspace: remove selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        setDesign((prev) => ({
          ...prev,
          texts: prev.texts.filter((t) => t.id !== selectedId),
          logos: prev.logos.filter((l) => l.id !== selectedId),
          shapes: (prev.shapes ?? []).filter((s) => s.id !== selectedId),
          photo: selectedId === '__photo__' ? null : prev.photo,
          qr: selectedId === '__qr__' ? null : prev.qr,
        }));
        setSelectedId(null);
        return;
      }

      // Arrow keys: nudge selected element by 1px (10px with Shift)
      const delta = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
      const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
      if ((dx !== 0 || dy !== 0) && selectedId) {
        e.preventDefault();
        setDesign((prev) => {
          const sid = selectedId;
          const text = prev.texts.find((t) => t.id === sid);
          if (text) return { ...prev, texts: prev.texts.map((t) => t.id === sid ? { ...t, x: Math.max(0, t.x + dx), y: Math.max(0, t.y + dy) } : t) };
          const logo = prev.logos.find((l) => l.id === sid);
          if (logo) return { ...prev, logos: prev.logos.map((l) => l.id === sid ? { ...l, x: Math.max(0, l.x + dx), y: Math.max(0, l.y + dy) } : l) };
          const shape = (prev.shapes ?? []).find((s) => s.id === sid);
          if (shape) return { ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === sid ? { ...s, x: Math.max(0, s.x + dx), y: Math.max(0, s.y + dy) } : s) };
          if (sid === '__photo__' && prev.photo) return { ...prev, photo: { ...prev.photo, x: Math.max(0, prev.photo.x + dx), y: Math.max(0, prev.photo.y + dy) } };
          if (sid === '__qr__' && prev.qr) return { ...prev, qr: { ...prev.qr, x: Math.max(0, prev.qr.x + dx), y: Math.max(0, prev.qr.y + dy) } };
          return prev;
        });
      }

      // Ctrl+D: duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        ctxDuplicateRef.current(selectedId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedId]);

  // ── Auto-save ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return; }
    setAutoSaveStatus('saving');
    const timer = setTimeout(() => {
      saveDesign(design);
      if (!isLoadingRef.current) syncToServer(design);
      setAutoSaveStatus('saved');
      const reset = setTimeout(() => setAutoSaveStatus('idle'), 2500);
      return () => clearTimeout(reset);
    }, 1500);
    return () => { clearTimeout(timer); };
  }, [design, syncToServer]);

  // ── Close menus on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const h = () => closeContextMenu();
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [contextMenu, closeContextMenu]);

  useEffect(() => {
    if (!showExportMenu) return;
    const h = () => setShowExportMenu(false);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [showExportMenu]);

  // ── Template picker: generate previews ───────────────────────────────────
  useEffect(() => {
    if (!showTemplatePicker) return;
    let cancelled = false;
    (async () => {
      const templates = await apiLoadTemplates();
      if (!cancelled) setSavedTemplates(templates);
      const allDesigns = [
        { key: '__builtin_blank', design: BLANK_TEMPLATE },
        { key: '__builtin_student', design: STUDENT_TEMPLATE },
        { key: '__builtin_staff', design: STAFF_TEMPLATE },
        { key: '__preset_st1', design: STUDENT_CLASSIC_BLUE }, { key: '__preset_st2', design: STUDENT_DARK_NAVY },
        { key: '__preset_st3', design: STUDENT_SKY_WAVE }, { key: '__preset_st4', design: STUDENT_GEOMETRIC },
        { key: '__preset_st5', design: STUDENT_MINIMAL }, { key: '__preset_sf1', design: STAFF_CORPORATE_TEAL },
        { key: '__preset_sf2', design: STAFF_DEEP_OCEAN }, { key: '__preset_sf3', design: STAFF_ROSE },
        { key: '__preset_sf4', design: STAFF_FOREST }, { key: '__preset_sf5', design: STAFF_SLATE_EXECUTIVE },
        ...templates.map((t) => ({ key: t.id, design: t.design })),
      ];
      const previews: Record<string, string> = {};
      for (const item of allDesigns) {
        if (cancelled) break;
        try { const c = await renderDesignToCanvas(item.design, { scale: 1 }); previews[item.key] = c.toDataURL('image/png'); } catch { /* skip */ }
      }
      if (!cancelled) setTemplatePreviews(previews);
    })();
    return () => { cancelled = true; };
  }, [showTemplatePicker]);

  // ── Stable refs for use inside event listeners ────────────────────────────
  const handleSaveRef = useRef<() => void>(() => {});
  const ctxDuplicateRef = useRef<(id: string) => void>(() => {});

  // ── Core helpers ──────────────────────────────────────────────────────────
  const genId = () => Math.random().toString(36).slice(2, 10);
  const getMaxZ = (d: CardDesign) => {
    const all = [...d.texts.map((t) => t.zIndex ?? 0), ...d.logos.map((l) => l.zIndex ?? 0),
      ...(d.shapes ?? []).map((s) => s.zIndex ?? 0), ...(d.photo ? [d.photo.zIndex ?? 0] : []), ...(d.qr ? [d.qr.zIndex ?? 0] : [])];
    return all.length > 0 ? Math.max(...all) : 0;
  };

  // ── Arrange (z-index) ────────────────────────────────────────────────────
  const handleArrange = useCallback((id: string, mode: 'front' | 'forward' | 'backward' | 'back') => {
    setDesign((prev) => {
      const ordered = [
        ...(prev.photo ? [{ id: '__photo__', z: prev.photo.zIndex ?? 0 }] : []),
        ...(prev.qr ? [{ id: '__qr__', z: prev.qr.zIndex ?? 0 }] : []),
        ...(prev.shapes ?? []).map((s) => ({ id: s.id, z: s.zIndex ?? 0 })),
        ...prev.logos.map((l) => ({ id: l.id, z: l.zIndex ?? 0 })),
        ...prev.texts.map((t) => ({ id: t.id, z: t.zIndex ?? 0 })),
      ].sort((a, b) => a.z - b.z);

      const idx = ordered.findIndex((item) => item.id === id);
      if (idx < 0) return prev;
      const [item] = ordered.splice(idx, 1);

      if (mode === 'front') ordered.push(item);
      else if (mode === 'back') ordered.unshift(item);
      else if (mode === 'forward') ordered.splice(Math.min(idx + 1, ordered.length), 0, item);
      else ordered.splice(Math.max(idx - 1, 0), 0, item);

      const zMap: Record<string, number> = {};
      ordered.forEach((el, i) => { zMap[el.id] = i; });
      return {
        ...prev,
        texts: prev.texts.map((t) => ({ ...t, zIndex: zMap[t.id] ?? t.zIndex ?? 0 })),
        logos: prev.logos.map((l) => ({ ...l, zIndex: zMap[l.id] ?? l.zIndex ?? 0 })),
        shapes: (prev.shapes ?? []).map((s) => ({ ...s, zIndex: zMap[s.id] ?? s.zIndex ?? 0 })),
        photo: prev.photo ? { ...prev.photo, zIndex: zMap['__photo__'] ?? prev.photo.zIndex ?? 0 } : null,
        qr: prev.qr ? { ...prev.qr, zIndex: zMap['__qr__'] ?? prev.qr.zIndex ?? 0 } : null,
      };
    });
  }, []);

  // ── Duplicate ─────────────────────────────────────────────────────────────
  const handleDuplicate = useCallback((id: string) => {
    const offset = 12;
    setDesign((prev) => {
      const mz = getMaxZ(prev) + 1;
      const text = prev.texts.find((t) => t.id === id);
      if (text) { const dup = { ...text, id: genId(), x: text.x + offset, y: text.y + offset, zIndex: mz }; setSelectedId(dup.id); return { ...prev, texts: [...prev.texts, dup] }; }
      const logo = prev.logos.find((l) => l.id === id);
      if (logo) { const dup = { ...logo, id: genId(), x: logo.x + offset, y: logo.y + offset, zIndex: mz }; setSelectedId(dup.id); return { ...prev, logos: [...prev.logos, dup] }; }
      const shape = (prev.shapes ?? []).find((s) => s.id === id);
      if (shape) { const dup = { ...shape, id: genId(), x: shape.x + offset, y: shape.y + offset, zIndex: mz }; setSelectedId(dup.id); return { ...prev, shapes: [...(prev.shapes ?? []), dup] }; }
      return prev;
    });
  }, []);

  // ── Delete selected ───────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback((id: string) => {
    setDesign((prev) => ({
      ...prev,
      texts: prev.texts.filter((t) => t.id !== id),
      logos: prev.logos.filter((l) => l.id !== id),
      shapes: (prev.shapes ?? []).filter((s) => s.id !== id),
      photo: id === '__photo__' ? null : prev.photo,
      qr: id === '__qr__' ? null : prev.qr,
    }));
    setSelectedId(null);
  }, []);

  // Keep stable refs up to date
  useEffect(() => { ctxDuplicateRef.current = handleDuplicate; }, [handleDuplicate]);

  // ── Canvas element move/resize handlers ────────────────────────────────────
  const handleMoveText = useCallback((id: string, x: number, y: number) =>
    setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === id ? { ...t, x, y } : t) })), []);
  const handleMoveLogo = useCallback((id: string, x: number, y: number) =>
    setDesign((prev) => ({ ...prev, logos: prev.logos.map((l) => l.id === id ? { ...l, x, y } : l) })), []);
  const handleResizeLogo = useCallback((id: string, changes: Partial<LogoElement>) =>
    setDesign((prev) => ({ ...prev, logos: prev.logos.map((l) => l.id === id ? { ...l, ...changes } : l) })), []);
  const handleMoveShape = useCallback((id: string, x: number, y: number) =>
    setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === id ? { ...s, x, y } : s) })), []);
  const handleResizeShape = useCallback((id: string, changes: Partial<ShapeElement>) =>
    setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === id ? { ...s, ...changes } : s) })), []);
  const handleMovePhoto = useCallback((x: number, y: number) =>
    setDesign((prev) => prev.photo ? { ...prev, photo: { ...prev.photo, x, y } } : prev), []);
  const handleResizePhoto = useCallback((changes: Partial<PhotoPlaceholder>) =>
    setDesign((prev) => prev.photo ? { ...prev, photo: { ...prev.photo, ...changes } } : prev), []);
  const handleMoveQr = useCallback((x: number, y: number) =>
    setDesign((prev) => prev.qr ? { ...prev, qr: { ...prev.qr, x, y } } : prev), []);
  const handleResizeQr = useCallback((changes: Partial<QrPlaceholder>) =>
    setDesign((prev) => prev.qr ? { ...prev, qr: { ...prev.qr, ...changes } } : prev), []);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportPNG = async () => {
    setExporting('png'); setShowExportMenu(false);
    try {
      const canvas = await renderDesignToCanvas(design);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob) { alert('Failed to generate image.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${design.cardType}-card-design.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed. Please try again.'); }
    finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting('pdf'); setShowExportMenu(false);
    try { await downloadSingleCardPDF(design, { name: `${design.cardType}-card-design`, fieldValues: {} }); }
    catch { alert('Export failed. Please try again.'); }
    finally { setExporting(null); }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    saveDesign(design); syncToServer(design);
    setSaved(true); setAutoSaveStatus('saved');
    setTimeout(() => { setSaved(false); setAutoSaveStatus('idle'); }, 2000);
    onSave?.();
  }, [design, syncToServer, onSave]);

  // Update stable ref
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // ── Save as template ──────────────────────────────────────────────────────
  const handleSaveAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    await apiSaveTemplate(name, design);
    setTemplateName(''); setShowSaveTemplate(false);
  };

  // ── Apply template ────────────────────────────────────────────────────────
  const handleApplyTemplate = useCallback((d: CardDesign) => {
    const copy = JSON.parse(JSON.stringify(d)) as CardDesign;
    isLoadingRef.current = false;
    setDesign(copy); setSelectedId(null); setShowTemplatePicker(false);
    saveDesign(copy); syncToServer(copy);
  }, [syncToServer]);

  const handleLoadTemplate = (tpl: SavedTemplate) => handleApplyTemplate(tpl.design);
  const handleDeleteTemplate = async (id: string) => {
    await apiDeleteTemplate(id);
    setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Card type switch ──────────────────────────────────────────────────────
  const handleCardTypeChange = (type: CardType) => {
    isLoadingRef.current = true;
    const sd = loadSavedDesign(type);
    setDesign(sd ?? TEMPLATES[type] ?? BLANK_TEMPLATE); setSelectedId(null);
    apiGetActiveDesign(type).then((d) => { if (d) { saveDesign(d); setDesign(d); } })
      .finally(() => { setTimeout(() => { isLoadingRef.current = false; }, 2000); });
  };

  // ── Reset / Clear ─────────────────────────────────────────────────────────
  const handleReset = () => { setDesign(TEMPLATES[design.cardType] ?? BLANK_TEMPLATE); setSelectedId(null); };
  const handleClearCache = () => {
    clearAllCache();
    setDesign(STUDENT_TEMPLATE); setSelectedId(null); setSavedTemplates([]);
    isFirstRenderRef.current = true; // ensure next change gets auto-saved properly
    setAutoSaveStatus('idle'); setShowClearCache(false);
  };

  // ── Context menu (right-click canvas) ────────────────────────────────────
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent, id: string | null) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 228);
    const y = Math.min(e.clientY, window.innerHeight - (id ? 348 : 228));
    setContextMenu({ x, y, targetId: id });
    if (id) setSelectedId(id);
  }, []);

  const ctxArrange = (id: string, mode: 'front' | 'forward' | 'backward' | 'back') => { handleArrange(id, mode); closeContextMenu(); };

  // Context menu: add text
  const ctxAddText = () => {
    const n: TextElement = {
      id: genId(), content: 'New Text', x: 20, y: 20 + design.texts.length * 30,
      fontSize: 16, color: '#1e293b', fontWeight: 'normal', fontStyle: 'normal',
      textAlign: 'left', fontFamily: 'Inter, sans-serif', zIndex: getMaxZ(design) + 1,
    };
    setDesign((prev) => ({ ...prev, texts: [...prev.texts, n] }));
    setSelectedId(n.id); closeContextMenu();
  };

  // Context menu: add shape
  const ctxAddShape = (type: 'rectangle' | 'circle' | 'line') => {
    const n: ShapeElement = {
      id: genId(), type, x: 20, y: 20 + (design.shapes ?? []).length * 20,
      width: type === 'line' ? 120 : 80, height: type === 'line' ? 4 : 60,
      color: '#4f46e5', borderColor: '#1e293b', borderWidth: type === 'line' ? 2 : 0,
      borderRadius: type === 'circle' ? 9999 : 8, opacity: 1, rotation: 0,
      zIndex: getMaxZ(design) + 1, lineStyle: type === 'line' ? 'solid' : undefined,
      gradient: { enabled: false, type: 'linear', angle: 90, stops: [{ offset: 0, color: '#4f46e5' }, { offset: 1, color: '#06b6d4' }] },
    };
    setDesign((prev) => ({ ...prev, shapes: [...(prev.shapes ?? []), n] }));
    setSelectedId(n.id); closeContextMenu();
  };

  // ── Computed preview design ────────────────────────────────────────────────
  const previewDesign: CardDesign = isPreviewMode
    ? { ...design, texts: design.texts.map((t) => ({ ...t, content: applyPreviewData(t.content) })) }
    : design;

  // ── Selected element info (for floating property bar) ─────────────────────
  const selText = design.texts.find((t) => t.id === selectedId);
  const selLogo = design.logos.find((l) => l.id === selectedId);
  const selShape = (design.shapes ?? []).find((s) => s.id === selectedId);
  const selPhoto = selectedId === '__photo__' ? design.photo : null;
  const selQr = selectedId === '__qr__' ? design.qr : null;

  const selLabel = selText ? `Text: "${selText.content.slice(0, 20)}"` :
    selLogo ? `Image: ${selLogo.name}` :
    selShape ? `${selShape.type.charAt(0).toUpperCase() + selShape.type.slice(1)}` :
    selPhoto ? 'Photo Placeholder' :
    selQr ? 'QR Code' : null;

  const selPos = selText ? `${Math.round(selText.x)}, ${Math.round(selText.y)}` :
    selLogo ? `${Math.round(selLogo.x)}, ${Math.round(selLogo.y)}` :
    selShape ? `${Math.round(selShape.x)}, ${Math.round(selShape.y)}` :
    selPhoto ? `${Math.round(selPhoto.x)}, ${Math.round(selPhoto.y)}` :
    selQr ? `${Math.round(selQr.x)}, ${Math.round(selQr.y)}` : null;

  return (
    <div className="flex flex-col bg-[#f0f0f0]" style={{ height: 'calc(100vh - 9rem)' }}>

      {/* ── TOP TOOLBAR ──────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-0.5 bg-white border-b border-slate-200 px-2 py-1.5 shadow-sm z-10 overflow-x-auto">

        {/* File group */}
        <TopBtn icon="📄" label="New" onClick={() => setShowNewProject(true)} />
        <TopBtn icon="💾" label="Save" onClick={handleSave} active={saved} variant={saved ? 'emerald' : 'default'} />
        <Divider />

        {/* History */}
        <TopBtn icon="↩" label="Undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <TopBtn icon="↪" label="Redo" title="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
        <Divider />

        {/* Card type switcher */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
          <button onClick={() => handleCardTypeChange('student')} title="Student Card" className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${design.cardType === 'student' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>🎓 Student</button>
          <button onClick={() => handleCardTypeChange('staff')} title="Staff Card" className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 flex items-center gap-1 ${design.cardType === 'staff' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>👨‍🏫 Staff</button>
        </div>
        <Divider />

        {/* Design */}
        <TopBtn icon="🎨" label="Templates" onClick={() => setShowTemplatePicker(true)} variant="amber" />

        {/* Export */}
        <div className="relative">
          <TopBtn icon={exporting ? '⏳' : '⬇️'} label={exporting ? 'Exporting…' : 'Export'} onClick={(e) => { e.stopPropagation(); setShowExportMenu((v) => !v); }} disabled={!!exporting} variant="indigo" active={showExportMenu} />
          {showExportMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleExportPNG} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">🖼️ Export PNG</button>
              <button onClick={handleExportPDF} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors text-left">📄 Export PDF</button>
            </div>
          )}
        </div>
        <Divider />

        {/* View */}
        <TopBtn icon="⊞" label={showGrid ? 'Grid On' : 'Grid'} title="Toggle Grid" onClick={() => setShowGrid((v) => !v)} active={showGrid} variant={showGrid ? 'indigo' : 'default'} />
        <TopBtn icon="👁️" label={isPreviewMode ? 'Exit Preview' : 'Preview'} title="Toggle data preview (Ctrl+P)" onClick={() => { setIsPreviewMode((v) => !v); setSelectedId(null); }} active={isPreviewMode} variant={isPreviewMode ? 'violet' : 'default'} />
        <Divider />

        {/* Status indicators */}
        <div className="flex items-center gap-1.5 mx-1 shrink-0 min-w-[80px]">
          {autoSaveStatus === 'saving' && <span className="flex items-center gap-1 text-xs text-slate-400"><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />Saving…</span>}
          {autoSaveStatus === 'saved' && <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>}
          {syncStatus === 'syncing' && <span className="text-xs text-indigo-400">⇄ Sharing…</span>}
          {syncStatus === 'synced' && <span className="text-xs text-emerald-600">⇄ Shared</span>}
          {syncStatus === 'error' && <span className="text-xs text-red-500">⚠ <button onClick={() => syncToServer(design)} className="underline">Retry</button></span>}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right-side utility */}
        <TopBtn icon="📋" label="As Template" title="Save as template" onClick={() => setShowSaveTemplate(true)} />
        <TopBtn icon="↺" label="Reset" title="Reset to default template" onClick={handleReset} />
        <TopBtn icon="🧹" label="Clear All" title="Clear all saved designs" onClick={() => setShowClearCache(true)} variant="danger" />
      </div>

      {/* Preview mode banner */}
      {isPreviewMode && (
        <div className="shrink-0 flex items-center justify-between bg-violet-600 text-white px-4 py-1 text-sm z-10">
          <span className="flex items-center gap-2 text-xs"><span>👁️</span><span className="font-semibold">Preview Mode</span><span className="text-violet-200">{'— {{placeholders}} replaced with sample data. Canvas is read-only.'}</span></span>
          <button onClick={() => setIsPreviewMode(false)} className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">Exit</button>
        </div>
      )}

      {/* ── CONTEXTUAL PROPERTY BAR (Canva-style) ───────────────────────── */}
      {selectedId && !isPreviewMode && selLabel && (
        <div className="shrink-0 flex items-center gap-1.5 bg-white border-b border-slate-200 px-3 py-1.5 z-10 overflow-x-auto shadow-sm">

          {/* Element badge */}
          <span className="text-[10px] font-bold uppercase tracking-wide text-white bg-indigo-500 rounded px-1.5 py-0.5 shrink-0">
            {selText ? 'T' : selShape ? selShape.type[0].toUpperCase() : selLogo ? '🖼' : selPhoto ? '📷' : selQr ? 'QR' : '?'}
          </span>

          {/* ── TEXT PROPERTIES ── */}
          {selText && (
            <>
              {/* Font family */}
              <select
                value={selText.fontFamily ?? 'Inter, sans-serif'}
                onChange={(e) => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, fontFamily: e.target.value } : t) }))}
                className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 shrink-0 max-w-[110px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                title="Font Family"
              >
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>

              {/* Font size */}
              <div className="flex items-center border border-slate-200 rounded overflow-hidden shrink-0">
                <button
                  onClick={() => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, fontSize: Math.max(6, t.fontSize - 1) } : t) }))}
                  className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold transition-colors"
                  title="Decrease font size"
                >−</button>
                <input
                  type="number"
                  min={6} max={200}
                  value={selText.fontSize}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 6) setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, fontSize: v } : t) })); }}
                  className="w-9 text-center text-xs py-1 border-0 outline-none text-slate-700 bg-white"
                  title="Font Size"
                />
                <button
                  onClick={() => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, fontSize: Math.min(200, t.fontSize + 1) } : t) }))}
                  className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold transition-colors"
                  title="Increase font size"
                >+</button>
              </div>

              {/* Bold */}
              <button
                onClick={() => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, fontWeight: t.fontWeight === 'bold' ? 'normal' : 'bold' } : t) }))}
                title="Bold (B)"
                className={`text-xs font-bold w-7 h-7 rounded border transition-colors shrink-0 ${
                  selText.fontWeight === 'bold' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >B</button>

              {/* Italic */}
              <button
                onClick={() => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' } : t) }))}
                title="Italic (I)"
                className={`text-xs italic font-semibold w-7 h-7 rounded border transition-colors shrink-0 ${
                  selText.fontStyle === 'italic' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >I</button>

              {/* Text Align */}
              <div className="flex border border-slate-200 rounded overflow-hidden shrink-0">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, textAlign: align } : t) }))}
                    title={`Align ${align}`}
                    className={`w-7 h-7 flex items-center justify-center transition-colors ${
                      selText.textAlign === align ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {align === 'left' && (
                      <svg viewBox="0 0 12 10" className="w-3.5 h-3.5" fill="currentColor">
                        <rect x="0" y="0" width="12" height="2"/><rect x="0" y="4" width="8" height="2"/><rect x="0" y="8" width="10" height="2"/>
                      </svg>
                    )}
                    {align === 'center' && (
                      <svg viewBox="0 0 12 10" className="w-3.5 h-3.5" fill="currentColor">
                        <rect x="0" y="0" width="12" height="2"/><rect x="2" y="4" width="8" height="2"/><rect x="1" y="8" width="10" height="2"/>
                      </svg>
                    )}
                    {align === 'right' && (
                      <svg viewBox="0 0 12 10" className="w-3.5 h-3.5" fill="currentColor">
                        <rect x="0" y="0" width="12" height="2"/><rect x="4" y="4" width="8" height="2"/><rect x="2" y="8" width="10" height="2"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Text color */}
              <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="Text Color">
                <span className="text-xs text-slate-500">A</span>
                <div className="relative">
                  <div className="w-6 h-6 rounded border border-slate-300 overflow-hidden" style={{ backgroundColor: selText.color }}>
                    <input
                      type="color"
                      value={selText.color}
                      onChange={(e) => setDesign((prev) => ({ ...prev, texts: prev.texts.map((t) => t.id === selectedId ? { ...t, color: e.target.value } : t) }))}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </div>
                </div>
              </label>
            </>
          )}

          {/* ── SHAPE PROPERTIES ── */}
          {selShape && (
            <>
              {/* Fill color */}
              <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="Fill Color">
                <span className="text-xs text-slate-500">Fill</span>
                <div className="relative">
                  <div className="w-6 h-6 rounded border border-slate-300 overflow-hidden" style={{ backgroundColor: selShape.color }}>
                    <input
                      type="color"
                      value={selShape.color}
                      onChange={(e) => setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === selectedId ? { ...s, color: e.target.value } : s) }))}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </div>
                </div>
              </label>

              {/* Opacity */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-slate-500">Opacity</span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={selShape.opacity ?? 1}
                  onChange={(e) => setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === selectedId ? { ...s, opacity: parseFloat(e.target.value) } : s) }))}
                  className="w-16 accent-indigo-500"
                  title={`Opacity: ${Math.round((selShape.opacity ?? 1) * 100)}%`}
                />
                <span className="text-xs text-slate-400 w-7">{Math.round((selShape.opacity ?? 1) * 100)}%</span>
              </div>

              {/* Border color */}
              <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="Border Color">
                <span className="text-xs text-slate-500">Border</span>
                <div className="relative">
                  <div className="w-6 h-6 rounded border border-slate-300 overflow-hidden" style={{ backgroundColor: selShape.borderColor ?? '#000' }}>
                    <input
                      type="color"
                      value={selShape.borderColor ?? '#000000'}
                      onChange={(e) => setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === selectedId ? { ...s, borderColor: e.target.value } : s) }))}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </div>
                </div>
              </label>

              {/* Border width */}
              <div className="flex items-center border border-slate-200 rounded overflow-hidden shrink-0">
                <button onClick={() => setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === selectedId ? { ...s, borderWidth: Math.max(0, (s.borderWidth ?? 0) - 1) } : s) }))} className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold">−</button>
                <span className="w-6 text-center text-xs text-slate-700">{selShape.borderWidth ?? 0}</span>
                <button onClick={() => setDesign((prev) => ({ ...prev, shapes: (prev.shapes ?? []).map((s) => s.id === selectedId ? { ...s, borderWidth: Math.min(20, (s.borderWidth ?? 0) + 1) } : s) }))} className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold">+</button>
              </div>
            </>
          )}

          {/* ── PHOTO PROPERTIES ── */}
          {selPhoto && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-slate-500">Corner</span>
              <input
                type="range" min={0} max={50} step={1}
                value={selPhoto.borderRadius ?? 0}
                onChange={(e) => setDesign((prev) => prev.photo ? { ...prev, photo: { ...prev.photo, borderRadius: parseInt(e.target.value) } } : prev)}
                className="w-14 accent-indigo-500"
                title={`Border Radius: ${selPhoto.borderRadius ?? 0}px`}
              />
              <span className="text-xs text-slate-400 w-5">{selPhoto.borderRadius ?? 0}</span>
            </div>
          )}

          <Divider />

          {/* ── ARRANGE (always) ── */}
          <span className="text-[10px] text-slate-400 shrink-0">Arrange:</span>
          <button onClick={() => handleArrange(selectedId, 'front')} title="Bring to Front" className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shrink-0">⤒ Front</button>
          <button onClick={() => handleArrange(selectedId, 'forward')} title="Move Forward" className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shrink-0">↑ Fwd</button>
          <button onClick={() => handleArrange(selectedId, 'backward')} title="Move Backward" className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shrink-0">↓ Bwd</button>
          <button onClick={() => handleArrange(selectedId, 'back')} title="Send to Back" className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shrink-0">⤓ Back</button>
          <Divider />

          {/* Duplicate & Delete */}
          {selectedId !== '__photo__' && selectedId !== '__qr__' && (
            <button onClick={() => handleDuplicate(selectedId)} title="Duplicate (Ctrl+D)" className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors shrink-0">📋 Dup</button>
          )}
          <button onClick={() => handleDeleteSelected(selectedId)} title="Delete (Del)" className="text-[11px] px-2 py-0.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors shrink-0">🗑️</button>

          <div className="flex-1" />
          <span className="text-[10px] text-slate-300 shrink-0 hidden xl:inline">↑↓←→ nudge · Del delete · Esc deselect</span>
        </div>
      )}

      {/* ── MAIN BODY (3-panel) ───────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT — Design Tools (Toolbar) */}
        <div className="shrink-0 bg-white border-r border-slate-200 flex flex-col" style={{ width: 300 }}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Toolbar
              design={isPreviewMode ? previewDesign : design}
              selectedId={isPreviewMode ? null : selectedId}
              onDesignChange={isPreviewMode ? () => {} : setDesign}
              onSelect={isPreviewMode ? () => {} : setSelectedId}
            />
          </div>
        </div>

        {/* CENTER — Canvas + footer zoom bar */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Canvas scroll area */}
          <div
            className="flex-1 overflow-auto flex items-start justify-center"
            style={{
              padding: 40,
              background: showGrid
                ? `linear-gradient(rgba(99,102,241,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.1) 1px, transparent 1px), #e2e8f0`
                : '#e2e8f0',
              backgroundSize: showGrid ? '20px 20px, 20px 20px, auto' : 'auto',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s' }}>
              {isPreviewMode ? (
                <div className="pointer-events-none">
                  <CardCanvas design={previewDesign} selectedId={null} onSelect={() => {}} onMoveText={() => {}} onMoveLogo={() => {}} />
                </div>
              ) : (
                <CardCanvas
                  design={design} selectedId={selectedId} onSelect={setSelectedId}
                  onMoveText={handleMoveText} onMoveLogo={handleMoveLogo} onResizeLogo={handleResizeLogo}
                  onMoveShape={handleMoveShape} onResizeShape={handleResizeShape}
                  onMovePhoto={handleMovePhoto} onResizePhoto={handleResizePhoto}
                  onMoveQr={handleMoveQr} onResizeQr={handleResizeQr}
                  onContextMenu={handleCanvasContextMenu}
                />
              )}
            </div>
          </div>

          {/* Zoom footer bar (Canva-style) */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-white border-t border-slate-200 select-none">
            <button onClick={() => setZoom((z) => Math.max(25, z - 10))} title="Zoom Out" className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 text-sm font-bold transition-colors">−</button>
            <input type="range" min={25} max={200} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-indigo-500" title={`Zoom: ${zoom}%`} />
            <button onClick={() => setZoom((z) => Math.min(200, z + 10))} title="Zoom In" className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 text-sm font-bold transition-colors">+</button>
            <button onClick={() => setZoom(100)} className="text-xs text-slate-500 hover:text-slate-800 font-mono min-w-[3rem] transition-colors" title="Reset Zoom">{zoom}%</button>
            <div className="flex-1" />
            <span className="text-xs text-slate-400 hidden md:inline">{design.width} × {design.height}px · {design.cardType}</span>
            {showGrid && <span className="text-xs text-indigo-400">Grid on</span>}
          </div>
        </div>

        {/* RIGHT — Layers Panel */}
        <LayersPanel design={design} selectedId={selectedId} onSelect={setSelectedId} onDesignChange={setDesign} onArrange={handleArrange} />
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* New Project */}
      {showNewProject && (
        <NewProjectDialog onClose={() => setShowNewProject(false)} onCreate={(d) => { handleApplyTemplate(d); setShowNewProject(false); }} />
      )}

      {/* Save as Template */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSaveTemplate(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">📋 Save as Template</h3>
            <p className="text-sm text-slate-500 mb-3">Save the current <span className="font-medium text-slate-700">{design.cardType}</span> card design as a reusable template.</p>
            <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveAsTemplate()} placeholder="Template name…" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4" autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveTemplate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSaveAsTemplate} disabled={!templateName.trim()} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40">Save Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cache Confirm */}
      {showClearCache && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowClearCache(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3"><span className="text-3xl">🧹</span><h3 className="text-lg font-bold text-slate-800">Clear Cache</h3></div>
            <p className="text-sm text-slate-600 mb-2">This will permanently delete:</p>
            <ul className="text-sm text-slate-600 mb-5 list-disc list-inside space-y-1"><li>All saved card designs</li><li>All saved custom templates</li></ul>
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-5">⚠️ This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClearCache(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleClearCache} className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium">Clear Cache</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Picker */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTemplatePicker(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">🎨 Choose Template</h3>
              <button onClick={() => setShowTemplatePicker(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Built-in */}
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Built-in</h4>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[{ key: '__builtin_blank', d: BLANK_TEMPLATE, emoji: '📄', label: 'Blank Card' },
                { key: '__builtin_student', d: STUDENT_TEMPLATE, emoji: '🎓', label: 'Student' },
                { key: '__builtin_staff', d: STAFF_TEMPLATE, emoji: '👨‍🏫', label: 'Staff' }
              ].map(({ key, d: tpl, emoji, label }) => (
                <TemplateCard key={key} preview={templatePreviews[key]} emoji={emoji} label={label} onClick={() => handleApplyTemplate(tpl)} />
              ))}
            </div>

            {/* Student presets */}
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">🎓 Student Styles</h4>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {([
                { key: '__preset_st1', d: STUDENT_CLASSIC_BLUE, emoji: '🔵', label: 'Classic Blue' },
                { key: '__preset_st2', d: STUDENT_DARK_NAVY, emoji: '🌌', label: 'Dark Navy' },
                { key: '__preset_st3', d: STUDENT_SKY_WAVE, emoji: '🌊', label: 'Sky Wave' },
                { key: '__preset_st4', d: STUDENT_GEOMETRIC, emoji: '🔷', label: 'Geometric' },
                { key: '__preset_st5', d: STUDENT_MINIMAL, emoji: '⬜', label: 'Minimal' },
              ] as const).map(({ key, d: tpl, emoji, label }) => (
                <TemplateCard key={key} preview={templatePreviews[key]} emoji={emoji} label={label} onClick={() => handleApplyTemplate(tpl)} small />
              ))}
            </div>

            {/* Staff presets */}
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">👨‍🏫 Staff Styles</h4>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {([
                { key: '__preset_sf1', d: STAFF_CORPORATE_TEAL, emoji: '🟢', label: 'Corp Teal' },
                { key: '__preset_sf2', d: STAFF_DEEP_OCEAN, emoji: '🌑', label: 'Deep Ocean' },
                { key: '__preset_sf3', d: STAFF_ROSE, emoji: '🌸', label: 'Rose Pro' },
                { key: '__preset_sf4', d: STAFF_FOREST, emoji: '🌿', label: 'Forest' },
                { key: '__preset_sf5', d: STAFF_SLATE_EXECUTIVE, emoji: '🏛️', label: 'Executive' },
              ] as const).map(({ key, d: tpl, emoji, label }) => (
                <TemplateCard key={key} preview={templatePreviews[key]} emoji={emoji} label={label} onClick={() => handleApplyTemplate(tpl)} small />
              ))}
            </div>

            {/* Saved templates */}
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Your Saved Templates</h4>
            {savedTemplates.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <span className="text-3xl block mb-2">📭</span>
                <p className="text-sm text-slate-400">No saved templates yet. Click &ldquo;As Template&rdquo; to save one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {savedTemplates.map((tpl) => (
                  <div key={tpl.id} className="rounded-xl border-2 border-slate-200 hover:border-slate-400 bg-white transition-all relative group overflow-hidden">
                    <button onClick={() => handleLoadTemplate(tpl)} className="w-full text-left">
                      <div className="bg-slate-50 flex items-center justify-center p-3 border-b border-slate-100 h-28">
                        {templatePreviews[tpl.id] ? <img src={templatePreviews[tpl.id]} alt={tpl.name} className="rounded-lg shadow-sm max-h-24 object-contain" /> : <span className="text-slate-300 text-xs">Preview</span>}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-1"><span>{tpl.cardType === 'student' ? '🎓' : '👨‍🏫'}</span><span className="font-semibold text-slate-800 truncate text-sm">{tpl.name}</span></div>
                        <span className="text-[10px] text-slate-400">{new Date(tpl.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTEXT MENU ───────────────────────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 select-none min-w-[210px]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.targetId && (() => {
            const tid = contextMenu.targetId!;
            const label = tid === '__photo__' ? 'Photo Placeholder' : tid === '__qr__' ? 'QR Placeholder' :
              design.texts.find((t) => t.id === tid) ? 'Text Element' :
              design.logos.find((l) => l.id === tid) ? 'Image / Logo' : 'Shape';
            return (
              <>
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
                <div className="h-px bg-slate-100 mx-2 my-1" />
                <button onClick={() => ctxArrange(tid, 'front')} className="ctx-item">⬆️ Bring to Front</button>
                <button onClick={() => ctxArrange(tid, 'forward')} className="ctx-item">▲ Move Forward</button>
                <button onClick={() => ctxArrange(tid, 'backward')} className="ctx-item">▼ Move Backward</button>
                <button onClick={() => ctxArrange(tid, 'back')} className="ctx-item">⬇️ Send to Back</button>
                <div className="h-px bg-slate-100 mx-2 my-1" />
                {tid !== '__photo__' && tid !== '__qr__' && (
                  <button onClick={() => { handleDuplicate(tid); closeContextMenu(); }} className="ctx-item">📋 Duplicate <span className="ml-auto text-slate-300">Ctrl+D</span></button>
                )}
                <button onClick={() => { handleDeleteSelected(tid); closeContextMenu(); }} className="ctx-item text-red-600 hover:bg-red-50">🗑️ Delete <span className="ml-auto text-slate-300">Del</span></button>
                <div className="h-px bg-slate-100 mx-2 my-1" />
              </>
            );
          })()}
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Add Element</div>
          <button onClick={ctxAddText} className="ctx-item">✏️ Add Text</button>
          <button onClick={() => ctxAddShape('rectangle')} className="ctx-item">▭ Add Rectangle</button>
          <button onClick={() => ctxAddShape('circle')} className="ctx-item">◯ Add Circle</button>
          <button onClick={() => ctxAddShape('line')} className="ctx-item">─ Add Line</button>
          <div className="h-px bg-slate-100 mx-2 my-1" />
          <button onClick={() => { undo(); closeContextMenu(); }} disabled={!canUndo} className="ctx-item disabled:opacity-30 flex justify-between">
            <span>↩ Undo</span><span className="text-slate-300">Ctrl+Z</span>
          </button>
          <button onClick={() => { redo(); closeContextMenu(); }} disabled={!canRedo} className="ctx-item disabled:opacity-30 flex justify-between">
            <span>↪ Redo</span><span className="text-slate-300">Ctrl+Y</span>
          </button>
        </div>
      )}

    </div>
  );
}

// ── Helper: Template Card (for picker modal) ─────────────────────────────────
function TemplateCard({ preview, emoji, label, onClick, small }: { preview?: string; emoji: string; label: string; onClick: () => void; small?: boolean }) {
  return (
    <button onClick={onClick} className="rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 bg-white transition-all text-left overflow-hidden w-full">
      <div className={`bg-slate-50 flex items-center justify-center border-b border-slate-100 ${small ? 'h-20 p-1.5' : 'h-28 p-3'}`}>
        {preview ? <img src={preview} alt={label} className="rounded shadow-sm max-h-full object-contain" /> : <span className="text-slate-300 text-xs">Loading…</span>}
      </div>
      <div className={small ? 'p-1.5' : 'p-3'}>
        <div className={`flex items-center gap-1.5 ${small ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-700 truncate`}><span>{emoji}</span>{label}</div>
      </div>
    </button>
  );
}
