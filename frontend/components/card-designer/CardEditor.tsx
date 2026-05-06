'use client';

import { useCallback, useEffect, useRef, useState, MouseEvent as ReactMouseEvent } from 'react';
import { CardDesign, CardType, LogoElement, PhotoPlaceholder, QrPlaceholder, ShapeElement, TextElement, STUDENT_TEMPLATE, STAFF_TEMPLATE, BLANK_TEMPLATE, STUDENT_CLASSIC_BLUE, STUDENT_DARK_NAVY, STUDENT_SKY_WAVE, STUDENT_GEOMETRIC, STUDENT_MINIMAL, STAFF_CORPORATE_TEAL, STAFF_DEEP_OCEAN, STAFF_ROSE, STAFF_FOREST, STAFF_SLATE_EXECUTIVE, loadSavedDesign, saveDesign, clearAllCache, SavedTemplate, apiLoadTemplates, apiSaveTemplate, apiDeleteTemplate, apiGetActiveDesign, apiSetActiveDesign } from './types';
import { renderDesignToCanvas } from './renderDesignToCanvas';
import { downloadSingleCardPDF } from './generateCardPDF';
import CardCanvas from './CardCanvas';
import Toolbar from './Toolbar';

const TEMPLATES: Record<CardType, CardDesign> = {
  student: STUDENT_TEMPLATE,
  staff: STAFF_TEMPLATE,
};

export default function CardEditor({ initialCardType, onSave }: { initialCardType?: CardType; onSave?: () => void } = {}) {
  const [design, setDesign] = useState<CardDesign>(initialCardType === 'staff' ? STAFF_TEMPLATE : STUDENT_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);
  const isFirstRenderRef = useRef(true);
  // True while the design is being loaded from API/localStorage — prevents the
  // auto-save effect from pushing a stale local design back to the server.
  const isLoadingRef = useRef(true);

  // --- Undo / Redo history ---
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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string | null } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Template management
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [templatePreviews, setTemplatePreviews] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const [showClearCache, setShowClearCache] = useState(false);

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - ev.clientX;
      const newWidth = Math.min(600, Math.max(200, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // Load saved design on mount (localStorage first, then API overrides with shared design)
  useEffect(() => {
    isLoadingRef.current = true;
    const cardType = initialCardType ?? 'student';
    const localDesign = loadSavedDesign(cardType);
    if (localDesign) setDesign(localDesign);
    apiGetActiveDesign(cardType).then((apiDesign) => {
      if (apiDesign) {
        saveDesign(apiDesign); // keep localStorage in sync
        setDesign(apiDesign);
      }
    }).finally(() => {
      // Wait longer than the auto-save debounce (1.5s) before allowing API pushes
      setTimeout(() => { isLoadingRef.current = false; }, 2000);
    });
  }, [initialCardType]);

  // Push design changes to history (debounced 400ms to batch drag moves)
  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      historyStackRef.current = [
        ...historyStackRef.current.slice(0, historyIndexRef.current + 1),
        design,
      ].slice(-50);
      historyIndexRef.current = historyStackRef.current.length - 1;
      setHistoryTick((t) => t + 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [design]);

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Auto-save: debounced 1.5s after every design change
  useEffect(() => {
    // Skip the very first render (design loaded from storage)
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    setAutoSaveStatus('saving');
    const timer = setTimeout(() => {
      saveDesign(design);
      // Only push to server when the admin has actually edited — not during initial load
      if (!isLoadingRef.current) {
        apiSetActiveDesign(design);
      }
      setAutoSaveStatus('saved');
      const reset = setTimeout(() => setAutoSaveStatus('idle'), 2500);
      return () => clearTimeout(reset);
    }, 1500);
    return () => { clearTimeout(timer); };
  }, [design]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu, closeContextMenu]);

  // Refresh template list and generate previews when picker opens
  useEffect(() => {
    if (!showTemplatePicker) return;
    let cancelled = false;

    (async () => {
      const templates = await apiLoadTemplates();
      if (!cancelled) setSavedTemplates(templates);

      // Generate preview thumbnails for built-in + saved templates
      const allDesigns: { key: string; design: CardDesign }[] = [
        { key: '__builtin_blank', design: BLANK_TEMPLATE },
        { key: '__builtin_student', design: STUDENT_TEMPLATE },
        { key: '__builtin_staff', design: STAFF_TEMPLATE },
        { key: '__preset_st1', design: STUDENT_CLASSIC_BLUE },
        { key: '__preset_st2', design: STUDENT_DARK_NAVY },
        { key: '__preset_st3', design: STUDENT_SKY_WAVE },
        { key: '__preset_st4', design: STUDENT_GEOMETRIC },
        { key: '__preset_st5', design: STUDENT_MINIMAL },
        { key: '__preset_sf1', design: STAFF_CORPORATE_TEAL },
        { key: '__preset_sf2', design: STAFF_DEEP_OCEAN },
        { key: '__preset_sf3', design: STAFF_ROSE },
        { key: '__preset_sf4', design: STAFF_FOREST },
        { key: '__preset_sf5', design: STAFF_SLATE_EXECUTIVE },
        ...templates.map((t) => ({ key: t.id, design: t.design })),
      ];

      const previews: Record<string, string> = {};
      for (const item of allDesigns) {
        if (cancelled) break;
        try {
          const canvas = await renderDesignToCanvas(item.design, { scale: 1 });
          previews[item.key] = canvas.toDataURL('image/png');
        } catch {
          // skip failed previews
        }
      }
      if (!cancelled) setTemplatePreviews(previews);
    })();

    return () => { cancelled = true; };
  }, [showTemplatePicker]);

  const handleSaveAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    await apiSaveTemplate(name, design);
    setTemplateName('');
    setShowSaveTemplate(false);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2000);
  };

  /**
   * Central handler for ALL template selections (built-in, preset, saved).
   * Immediately pushes to API so all browsers see the change — does NOT rely
   * on the debounced auto-save which can be skipped by isLoadingRef or navigation.
   */
  const handleApplyTemplate = useCallback((d: CardDesign) => {
    const copy = JSON.parse(JSON.stringify(d)) as CardDesign;
    isLoadingRef.current = false; // user made an explicit choice — allow future auto-saves
    setDesign(copy);
    setSelectedId(null);
    setShowTemplatePicker(false);
    saveDesign(copy);           // keep localStorage in sync
    apiSetActiveDesign(copy);   // immediately share with all other browsers
  }, []);

  const handleLoadTemplate = (tpl: SavedTemplate) => {
    handleApplyTemplate(tpl.design);
  };

  const handleDeleteTemplate = async (id: string) => {
    await apiDeleteTemplate(id);
    setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCardTypeChange = (type: CardType) => {
    // Block API push while we load the new type's shared design
    isLoadingRef.current = true;
    const savedDesign = loadSavedDesign(type);
    setDesign(savedDesign ?? TEMPLATES[type]);
    setSelectedId(null);
    apiGetActiveDesign(type).then((apiDesign) => {
      if (apiDesign) {
        saveDesign(apiDesign);
        setDesign(apiDesign);
      }
    }).finally(() => {
      setTimeout(() => { isLoadingRef.current = false; }, 2000);
    });
  };

  const handleMoveText = useCallback(
    (id: string, x: number, y: number) => {
      setDesign((prev) => ({
        ...prev,
        texts: prev.texts.map((t) => (t.id === id ? { ...t, x, y } : t)),
      }));
    },
    []
  );

  const handleMoveLogo = useCallback(
    (id: string, x: number, y: number) => {
      setDesign((prev) => ({
        ...prev,
        logos: prev.logos.map((l) => (l.id === id ? { ...l, x, y } : l)),
      }));
    },
    []
  );

  const handleResizeLogo = useCallback(
    (id: string, changes: Partial<LogoElement>) => {
      setDesign((prev) => ({
        ...prev,
        logos: prev.logos.map((l) => (l.id === id ? { ...l, ...changes } : l)),
      }));
    },
    []
  );

  const handleMoveShape = useCallback(
    (id: string, x: number, y: number) => {
      setDesign((prev) => ({
        ...prev,
        shapes: (prev.shapes ?? []).map((s) => (s.id === id ? { ...s, x, y } : s)),
      }));
    },
    []
  );

  const handleResizeShape = useCallback(
    (id: string, changes: Partial<ShapeElement>) => {
      setDesign((prev) => ({
        ...prev,
        shapes: (prev.shapes ?? []).map((s) => (s.id === id ? { ...s, ...changes } : s)),
      }));
    },
    []
  );

  const handleMovePhoto = useCallback(
    (x: number, y: number) => {
      setDesign((prev) => prev.photo ? { ...prev, photo: { ...prev.photo, x, y } } : prev);
    },
    []
  );

  const handleResizePhoto = useCallback(
    (changes: Partial<PhotoPlaceholder>) => {
      setDesign((prev) => prev.photo ? { ...prev, photo: { ...prev.photo, ...changes } } : prev);
    },
    []
  );

  const handleMoveQr = useCallback(
    (x: number, y: number) => {
      setDesign((prev) => prev.qr ? { ...prev, qr: { ...prev.qr, x, y } } : prev);
    },
    []
  );

  const handleResizeQr = useCallback(
    (changes: Partial<QrPlaceholder>) => {
      setDesign((prev) => prev.qr ? { ...prev, qr: { ...prev.qr, ...changes } } : prev);
    },
    []
  );

  const handleExportPNG = async () => {
    setExporting('png');
    try {
      const canvas = await renderDesignToCanvas(design);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob) { alert('Failed to generate image.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${design.cardType}-card-design.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PNG export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      await downloadSingleCardPDF(design, {
        name: `${design.cardType}-card-design`,
        fieldValues: {},
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const handleSave = () => {
    saveDesign(design);
    apiSetActiveDesign(design); // always push on explicit save regardless of loading state
    setSaved(true);
    setAutoSaveStatus('saved');
    setTimeout(() => { setSaved(false); setAutoSaveStatus('idle'); }, 2000);
    onSave?.();
  };

  const handleReset = () => {
    setDesign(TEMPLATES[design.cardType]);
    setSelectedId(null);
  };

  const handleClearCache = () => {
    clearAllCache();
    setDesign(STUDENT_TEMPLATE);
    setSelectedId(null);
    setSavedTemplates([]);
    isFirstRenderRef.current = true;
    setAutoSaveStatus('idle');
    setShowClearCache(false);
  };

  // --- Context menu helpers ---
  const ctxGenId = () => Math.random().toString(36).slice(2, 10);
  const ctxGetMaxZ = (d: CardDesign) => {
    const all = [
      ...d.texts.map((t) => t.zIndex ?? 0),
      ...d.logos.map((l) => l.zIndex ?? 0),
      ...(d.shapes ?? []).map((s) => s.zIndex ?? 0),
      ...(d.photo ? [d.photo.zIndex ?? 0] : []),
      ...(d.qr ? [d.qr.zIndex ?? 0] : []),
    ];
    return all.length > 0 ? Math.max(...all) : 0;
  };

  const ctxAddText = () => {
    const newText: TextElement = {
      id: ctxGenId(),
      content: 'New Text',
      x: 20,
      y: 20 + design.texts.length * 30,
      fontSize: 16,
      color: '#1e293b',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      fontFamily: 'Inter, sans-serif',
      zIndex: ctxGetMaxZ(design) + 1,
    };
    setDesign((prev) => ({ ...prev, texts: [...prev.texts, newText] }));
    setSelectedId(newText.id);
    closeContextMenu();
  };

  const ctxAddShape = (type: 'rectangle' | 'circle' | 'line') => {
    const newShape: ShapeElement = {
      id: ctxGenId(),
      type,
      x: 20,
      y: 20 + (design.shapes ?? []).length * 20,
      width: type === 'line' ? 120 : 80,
      height: type === 'line' ? 4 : 60,
      color: '#4f46e5',
      borderColor: '#1e293b',
      borderWidth: type === 'line' ? 2 : 0,
      borderRadius: type === 'circle' ? 9999 : 8,
      opacity: 1,
      rotation: 0,
      zIndex: ctxGetMaxZ(design) + 1,
      lineStyle: type === 'line' ? 'solid' : undefined,
      gradient: {
        enabled: false,
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#4f46e5' },
          { offset: 1, color: '#06b6d4' },
        ],
      },
    };
    setDesign((prev) => ({ ...prev, shapes: [...(prev.shapes ?? []), newShape] }));
    setSelectedId(newShape.id);
    closeContextMenu();
  };

  const ctxDuplicate = (id: string) => {
    const offset = 12;
    setDesign((prev) => {
      const text = prev.texts.find((t) => t.id === id);
      if (text) {
        const dup = { ...text, id: ctxGenId(), x: text.x + offset, y: text.y + offset, zIndex: ctxGetMaxZ(prev) + 1 };
        setSelectedId(dup.id);
        return { ...prev, texts: [...prev.texts, dup] };
      }
      const logo = prev.logos.find((l) => l.id === id);
      if (logo) {
        const dup = { ...logo, id: ctxGenId(), x: logo.x + offset, y: logo.y + offset, zIndex: ctxGetMaxZ(prev) + 1 };
        setSelectedId(dup.id);
        return { ...prev, logos: [...prev.logos, dup] };
      }
      const shape = (prev.shapes ?? []).find((s) => s.id === id);
      if (shape) {
        const dup = { ...shape, id: ctxGenId(), x: shape.x + offset, y: shape.y + offset, zIndex: ctxGetMaxZ(prev) + 1 };
        setSelectedId(dup.id);
        return { ...prev, shapes: [...(prev.shapes ?? []), dup] };
      }
      return prev;
    });
    closeContextMenu();
  };

  const ctxDelete = (id: string) => {
    setDesign((prev) => ({
      ...prev,
      texts: prev.texts.filter((t) => t.id !== id),
      logos: prev.logos.filter((l) => l.id !== id),
      shapes: (prev.shapes ?? []).filter((s) => s.id !== id),
      photo: id === '__photo__' ? null : prev.photo,
      qr: id === '__qr__' ? null : prev.qr,
    }));
    setSelectedId(null);
    closeContextMenu();
  };

  const ctxArrange = (id: string, mode: 'front' | 'forward' | 'backward' | 'back') => {
    setDesign((prev) => {
      // Build sorted list in the SAME spread order as CardCanvas (photo, qr, shapes, logos, texts)
      // so stable-sort tie-breaking for equal z-indices matches the visual render order.
      const ordered = [
        ...(prev.photo ? [{ id: '__photo__', z: prev.photo.zIndex ?? 0 }] : []),
        ...(prev.qr ? [{ id: '__qr__', z: prev.qr.zIndex ?? 0 }] : []),
        ...(prev.shapes ?? []).map((s) => ({ id: s.id, z: s.zIndex ?? 0 })),
        ...prev.logos.map((l) => ({ id: l.id, z: l.zIndex ?? 0 })),
        ...prev.texts.map((t) => ({ id: t.id, z: t.zIndex ?? 0 })),
      ].sort((a, b) => a.z - b.z);

      const idx = ordered.findIndex((item) => item.id === id);
      if (idx < 0) return prev;

      // Remove item and re-insert at the new position
      const [item] = ordered.splice(idx, 1);
      if (mode === 'front') {
        ordered.push(item);
      } else if (mode === 'back') {
        ordered.unshift(item);
      } else if (mode === 'forward') {
        if (idx >= ordered.length) return prev; // already at top
        ordered.splice(idx + 1, 0, item);
      } else { // backward
        if (idx === 0) return prev; // already at bottom
        ordered.splice(idx - 1, 0, item);
      }

      // Reassign consecutive z-indices so they are always unique
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
    closeContextMenu();
  };

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent, id: string | null) => {
    e.preventDefault();
    // Position menu within viewport
    const menuW = 220;
    const menuH = id ? 340 : 220;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setContextMenu({ x, y, targetId: id });
    if (id) setSelectedId(id);
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
        {/* Card Type Switcher */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mr-1">
          <button
            onClick={() => handleCardTypeChange('student')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              design.cardType === 'student'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            🎓 Student
          </button>
          <button
            onClick={() => handleCardTypeChange('staff')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-slate-200 ${
              design.cardType === 'staff'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            👨‍🏫 Staff
          </button>
        </div>

        <div className="w-px h-7 bg-slate-200 mx-1 hidden sm:block" />

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="px-2.5 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ↩ Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="px-2.5 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ↪ Redo
        </button>

        <div className="w-px h-7 bg-slate-200 mx-1 hidden sm:block" />

        {/* Template */}
        <button onClick={() => setShowTemplatePicker(true)} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
          📂 Template
        </button>

        <div className="w-px h-7 bg-slate-200 mx-1 hidden sm:block" />

        {/* Save group */}
        <button onClick={handleSave} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          {saved ? '✅ Saved!' : '💾 Save'}
        </button>
        <button onClick={() => setShowSaveTemplate(true)} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
          {templateSaved ? '✅ Saved!' : '📋 Save as Template'}
        </button>

        {/* Auto-save status */}
        <span className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-300 ${autoSaveStatus === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
          {autoSaveStatus === 'saving' && (
            <><span className="inline-block w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" /><span className="text-slate-400">Saving…</span></>
          )}
          {autoSaveStatus === 'saved' && (
            <><span className="text-emerald-500">✓</span><span className="text-emerald-600">Auto-saved</span></>
          )}
        </span>

        <div className="w-px h-7 bg-slate-200 mx-1 hidden sm:block" />

        {/* Export */}
        <button onClick={handleExportPNG} disabled={!!exporting} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-wait">
          {exporting === 'png' ? '⏳ Exporting…' : '🖼️ Export PNG'}
        </button>
        <button onClick={handleExportPDF} disabled={!!exporting} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-wait">
          {exporting === 'pdf' ? '⏳ Exporting…' : '📄 Export PDF'}
        </button>

        {/* Spacer + Reset */}
        <div className="flex-1" />
        <button onClick={handleReset} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors">
          🗑️ Reset
        </button>
        <button onClick={() => setShowClearCache(true)} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-orange-200 text-orange-500 hover:bg-orange-50 hover:text-orange-600 transition-colors" title="Clear all saved designs and templates from browser cache">
          🧹 Clear Cache
        </button>
      </div>

      {/* Save Template Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSaveTemplate(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">💾 Save as Template</h3>
            <p className="text-sm text-slate-500 mb-3">Save the current <span className="font-medium text-slate-700">{design.cardType}</span> card design as a reusable template.</p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveAsTemplate()}
              placeholder="Template name (e.g. Blue Modern Student Card)"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveTemplate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSaveAsTemplate} disabled={!templateName.trim()} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Save Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cache Confirmation Modal */}
      {showClearCache && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowClearCache(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🧹</span>
              <h3 className="text-lg font-bold text-slate-800">Clear Cache</h3>
            </div>
            <p className="text-sm text-slate-600 mb-2">
              This will permanently delete:
            </p>
            <ul className="text-sm text-slate-600 mb-5 list-disc list-inside space-y-1">
              <li>All saved card designs (Student &amp; Staff)</li>
              <li>All saved custom templates</li>
            </ul>
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-5">
              ⚠️ This cannot be undone. The canvas will reset to the default Student template.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearCache(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearCache}
                className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTemplatePicker(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">📂 Choose Template</h3>
              <button onClick={() => setShowTemplatePicker(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {/* Built-in Templates */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Built-in Templates</h4>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleApplyTemplate(BLANK_TEMPLATE)}
                  className="rounded-xl border-2 border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 transition-all text-left group overflow-hidden"
                >
                  <div className="bg-slate-50 flex items-center justify-center p-3 border-b border-slate-100">
                    {templatePreviews['__builtin_blank'] ? (
                      <img src={templatePreviews['__builtin_blank']} alt="Blank Card Preview" className="rounded-lg shadow-sm max-h-36 object-contain" />
                    ) : (
                      <div className="h-28 w-full flex items-center justify-center text-slate-400 text-sm">Loading...</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">📄</span>
                      <span className="font-semibold text-slate-800">Blank Card</span>
                    </div>
                    <div className="text-xs text-slate-500">Empty card — start from scratch with a clean canvas</div>
                    <div className="mt-2 inline-block px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-500 font-medium">Built-in</div>
                  </div>
                </button>
                <button
                  onClick={() => handleApplyTemplate(STUDENT_TEMPLATE)}
                  className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group overflow-hidden"
                >
                  <div className="bg-slate-100 flex items-center justify-center p-3 border-b border-indigo-100">
                    {templatePreviews['__builtin_student'] ? (
                      <img src={templatePreviews['__builtin_student']} alt="Student Card Preview" className="rounded-lg shadow-sm max-h-36 object-contain" />
                    ) : (
                      <div className="h-28 w-full flex items-center justify-center text-slate-400 text-sm">Loading...</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🎓</span>
                      <span className="font-semibold text-slate-800">Student Card</span>
                    </div>
                    <div className="text-xs text-slate-500">Default student ID card with photo, QR code, name, class and ID fields</div>
                    <div className="mt-2 inline-block px-2 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-600 font-medium">Built-in</div>
                  </div>
                </button>
                <button
                  onClick={() => handleApplyTemplate(STAFF_TEMPLATE)}
                  className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left group overflow-hidden"
                >
                  <div className="bg-slate-100 flex items-center justify-center p-3 border-b border-emerald-100">
                    {templatePreviews['__builtin_staff'] ? (
                      <img src={templatePreviews['__builtin_staff']} alt="Staff Card Preview" className="rounded-lg shadow-sm max-h-36 object-contain" />
                    ) : (
                      <div className="h-28 w-full flex items-center justify-center text-slate-400 text-sm">Loading...</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">👨‍🏫</span>
                      <span className="font-semibold text-slate-800">Staff Card</span>
                    </div>
                    <div className="text-xs text-slate-500">Default staff ID card with photo, QR code, name, department and role fields</div>
                    <div className="mt-2 inline-block px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-600 font-medium">Built-in</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Preset Styled Templates — Student */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">🎓 Student Preset Styles</h4>
              <div className="grid grid-cols-5 gap-2">
                {([
                  { key: '__preset_st1', design: STUDENT_CLASSIC_BLUE, label: 'Classic Blue', emoji: '🔵' },
                  { key: '__preset_st2', design: STUDENT_DARK_NAVY, label: 'Dark Navy', emoji: '🌌' },
                  { key: '__preset_st3', design: STUDENT_SKY_WAVE, label: 'Sky Wave', emoji: '🌊' },
                  { key: '__preset_st4', design: STUDENT_GEOMETRIC, label: 'Geometric', emoji: '🔷' },
                  { key: '__preset_st5', design: STUDENT_MINIMAL, label: 'Minimal', emoji: '⬜' },
                ] as const).map(({ key, design: tplDesign, label, emoji }) => (
                  <button
                    key={key}
                    onClick={() => handleApplyTemplate(tplDesign)}
                    className="rounded-xl border-2 border-indigo-100 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left overflow-hidden group"
                  >
                    <div className="bg-slate-50 flex items-center justify-center p-2 border-b border-indigo-100 h-32">
                      {templatePreviews[key] ? (
                        <img src={templatePreviews[key]} alt={label} className="rounded shadow-sm max-h-28 object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">Loading...</div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-semibold text-slate-700 flex items-center gap-1"><span>{emoji}</span><span className="truncate">{label}</span></div>
                      <div className="mt-1 inline-block px-1.5 py-0.5 text-[9px] rounded-full bg-indigo-100 text-indigo-600 font-medium">Student</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preset Styled Templates — Staff */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">👨‍🏫 Staff Preset Styles</h4>
              <div className="grid grid-cols-5 gap-2">
                {([
                  { key: '__preset_sf1', design: STAFF_CORPORATE_TEAL, label: 'Corp Teal', emoji: '🟢' },
                  { key: '__preset_sf2', design: STAFF_DEEP_OCEAN, label: 'Deep Ocean', emoji: '🌑' },
                  { key: '__preset_sf3', design: STAFF_ROSE, label: 'Rose Pro', emoji: '🌸' },
                  { key: '__preset_sf4', design: STAFF_FOREST, label: 'Forest', emoji: '🌿' },
                  { key: '__preset_sf5', design: STAFF_SLATE_EXECUTIVE, label: 'Executive', emoji: '🏛️' },
                ] as const).map(({ key, design: tplDesign, label, emoji }) => (
                  <button
                    key={key}
                    onClick={() => handleApplyTemplate(tplDesign)}
                    className="rounded-xl border-2 border-emerald-100 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left overflow-hidden group"
                  >
                    <div className="bg-slate-50 flex items-center justify-center p-2 border-b border-emerald-100 h-32">
                      {templatePreviews[key] ? (
                        <img src={templatePreviews[key]} alt={label} className="rounded shadow-sm max-h-28 object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">Loading...</div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-semibold text-slate-700 flex items-center gap-1"><span>{emoji}</span><span className="truncate">{label}</span></div>
                      <div className="mt-1 inline-block px-1.5 py-0.5 text-[9px] rounded-full bg-emerald-100 text-emerald-600 font-medium">Staff</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Saved Templates */}
            <div>
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Your Saved Templates</h4>
              {savedTemplates.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <span className="text-3xl block mb-2">📭</span>
                  <p className="text-sm text-slate-400">No saved templates yet. Design a card and click &ldquo;Save as Template&rdquo; to save it here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {savedTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="rounded-xl border-2 border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50 transition-all text-left relative group overflow-hidden"
                    >
                      <button
                        onClick={() => handleLoadTemplate(tpl)}
                        className="w-full text-left"
                      >
                        <div className="bg-slate-50 flex items-center justify-center p-3 border-b border-slate-100">
                          {templatePreviews[tpl.id] ? (
                            <img src={templatePreviews[tpl.id]} alt={tpl.name} className="rounded-lg shadow-sm max-h-36 object-contain" />
                          ) : (
                            <div className="h-28 w-full flex items-center justify-center">
                              <div className="rounded-lg border-2 border-dashed border-slate-200 w-full h-full flex items-center justify-center text-slate-300 text-xs">Preview</div>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{tpl.cardType === 'student' ? '🎓' : '👨‍🏫'}</span>
                            <span className="font-semibold text-slate-800 truncate">{tpl.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full font-medium ${
                              tpl.cardType === 'student' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>{tpl.cardType}</span>
                            <span className="text-[10px] text-slate-400">{new Date(tpl.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex gap-1 mt-2 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tpl.design.width}×{tpl.design.height}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tpl.design.texts.length} texts</span>
                            {tpl.design.photo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Photo</span>}
                            {tpl.design.qr && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">QR</span>}
                            {(tpl.design.shapes?.length ?? 0) > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tpl.design.shapes.length} shapes</span>}
                            {(tpl.design.logos?.length ?? 0) > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tpl.design.logos.length} logos</span>}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete template"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editor Layout */}
      <div className="flex gap-4 items-start" ref={canvasRef}>
        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <CardCanvas
            design={design}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveText={handleMoveText}
            onMoveLogo={handleMoveLogo}
            onResizeLogo={handleResizeLogo}
            onMoveShape={handleMoveShape}
            onResizeShape={handleResizeShape}
            onMovePhoto={handleMovePhoto}
            onResizePhoto={handleResizePhoto}
            onMoveQr={handleMoveQr}
            onResizeQr={handleResizeQr}
            onContextMenu={handleCanvasContextMenu}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize rounded-full hover:bg-indigo-400 bg-slate-300 transition-colors self-stretch"
          title="Drag to resize sidebar"
        />

        {/* Properties sidebar */}
        <Toolbar
          design={design}
          selectedId={selectedId}
          onDesignChange={setDesign}
          onSelect={setSelectedId}
          width={sidebarWidth}
        />
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 select-none"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 210 }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.targetId && (
            <>
              {/* Element label */}
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {contextMenu.targetId === '__photo__' ? 'Photo Placeholder'
                  : contextMenu.targetId === '__qr__' ? 'QR Placeholder'
                  : design.texts.find((t) => t.id === contextMenu.targetId) ? 'Text Element'
                  : design.logos.find((l) => l.id === contextMenu.targetId) ? 'Image / Logo'
                  : 'Shape'}
              </div>
              <div className="h-px bg-slate-100 mx-2 my-1" />

              {/* Arrange */}
              <button onClick={() => ctxArrange(contextMenu.targetId!, 'front')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
                <span className="text-base">⬆️</span> Bring to Front
              </button>
              <button onClick={() => ctxArrange(contextMenu.targetId!, 'forward')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
                <span className="text-base">▲</span> Move Forward
              </button>
              <button onClick={() => ctxArrange(contextMenu.targetId!, 'backward')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
                <span className="text-base">▼</span> Move Backward
              </button>
              <button onClick={() => ctxArrange(contextMenu.targetId!, 'back')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
                <span className="text-base">⬇️</span> Send to Back
              </button>

              <div className="h-px bg-slate-100 mx-2 my-1" />

              {/* Duplicate / Delete — not for photo/qr since those are singletons */}
              {contextMenu.targetId !== '__photo__' && contextMenu.targetId !== '__qr__' && (
                <button onClick={() => ctxDuplicate(contextMenu.targetId!)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left">
                  <span className="text-base">📋</span> Duplicate
                </button>
              )}
              <button onClick={() => ctxDelete(contextMenu.targetId!)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
                <span className="text-base">🗑️</span> Delete
              </button>

              <div className="h-px bg-slate-100 mx-2 my-1" />
            </>
          )}

          {/* Add Elements */}
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Add Element</div>
          <button onClick={ctxAddText} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left">
            <span className="text-base">✏️</span> Add Text
          </button>
          <button onClick={() => ctxAddShape('rectangle')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left">
            <span className="text-base">▭</span> Add Rectangle
          </button>
          <button onClick={() => ctxAddShape('circle')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left">
            <span className="text-base">◯</span> Add Circle
          </button>
          <button onClick={() => ctxAddShape('line')} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left">
            <span className="text-base">─</span> Add Line
          </button>

          <div className="h-px bg-slate-100 mx-2 my-1" />

          {/* Undo / Redo */}
          <button onClick={() => { undo(); closeContextMenu(); }} disabled={!canUndo} className="w-full flex items-center justify-between gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left">
            <span className="flex items-center gap-2.5"><span className="text-base">↩</span> Undo</span>
            <span className="text-[11px] text-slate-400">Ctrl+Z</span>
          </button>
          <button onClick={() => { redo(); closeContextMenu(); }} disabled={!canRedo} className="w-full flex items-center justify-between gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left">
            <span className="flex items-center gap-2.5"><span className="text-base">↪</span> Redo</span>
            <span className="text-[11px] text-slate-400">Ctrl+Y</span>
          </button>
        </div>
      )}
    </div>
  );
}
