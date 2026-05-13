'use client';

import { ChangeEvent, useState, useRef } from 'react';
import {
  CardDesign, CardSize, CARD_SIZE_PRESETS,
  TextElement, LogoElement, ShapeElement, GradientStop,
  PhotoPlaceholder, QrPlaceholder, FONT_OPTIONS,
} from './types';

interface ToolbarProps {
  design: CardDesign;
  selectedId: string | null;
  onDesignChange: (design: CardDesign) => void;
  onSelect?: (id: string | null) => void;
  width?: number;
}

type Tab = 'size' | 'colors' | 'text' | 'shapes' | 'images' | 'photo' | 'qr';

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  {
    id: 'size', label: 'Size',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="3" y="5" width="14" height="10" rx="1.5" />
        <path d="M7 5v10M13 5v10" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'colors', label: 'Colors',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <circle cx="10" cy="10" r="7" />
        <path d="M10 3a7 7 0 0 1 4.95 11.95" />
        <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'text', label: 'Text',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
        <path d="M3 5h14v2H11v9H9V7H3z" />
      </svg>
    ),
  },
  {
    id: 'shapes', label: 'Shapes',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="3" y="8" width="7" height="7" rx="1" />
        <circle cx="14" cy="6.5" r="3.5" />
        <path d="M9 16l4-7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'images', label: 'Images',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="3" y="4" width="14" height="12" rx="1.5" />
        <circle cx="7.5" cy="8" r="1.5" />
        <path d="M3 14l4-4 3 3 2-2 5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'photo', label: 'Photo',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <circle cx="10" cy="9" r="3" />
        <path d="M4 17c0-3.31 2.69-6 6-6s6 2.69 6 6" strokeLinecap="round" />
        <circle cx="10" cy="9" r="7" />
      </svg>
    ),
  },
  {
    id: 'qr', label: 'QR',
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
        <path d="M3 3h6v6H3V3zm2 2v2h2V5H5zM11 3h6v6h-6V3zm2 2v2h2V5h-2zM3 11h6v6H3v-6zm2 2v2h2v-2H5zM13 11h2v2h-2zM15 13h2v2h-2zM13 15h2v2h-2z" />
      </svg>
    ),
  },
];

export default function Toolbar({ design, selectedId, onDesignChange, onSelect }: ToolbarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<CardDesign>) => onDesignChange({ ...design, ...partial });
  const genId = () => Math.random().toString(36).slice(2, 10);

  const handleSizePreset = (size: CardSize) => {
    if (size === 'custom') { update({ size }); }
    else { const p = CARD_SIZE_PRESETS[size]; update({ size, width: p.width, height: p.height }); }
  };

  const addText = () => {
    const n: TextElement = {
      id: genId(), content: 'New Text',
      x: 20, y: 20 + design.texts.length * 30,
      fontSize: 16, color: '#1e293b',
      fontWeight: 'normal', fontStyle: 'normal',
      textAlign: 'left', fontFamily: 'Inter, sans-serif',
      zIndex: getMaxZ() + 1,
    };
    update({ texts: [...design.texts, n] });
    onSelect?.(n.id);
  };
  const deleteText = (id: string) => { update({ texts: design.texts.filter((t) => t.id !== id) }); if (selectedId === id) onSelect?.(null); };
  const updateText = (id: string, changes: Partial<TextElement>) => update({ texts: design.texts.map((t) => t.id === id ? { ...t, ...changes } : t) });

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const n: LogoElement = { id: genId(), src: reader.result as string, name: file.name, x: 20, y: 20, width: 80, height: 80, zIndex: getMaxZ() + 1 };
      update({ logos: [...design.logos, n] });
      onSelect?.(n.id);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const deleteLogo = (id: string) => { update({ logos: design.logos.filter((l) => l.id !== id) }); if (selectedId === id) onSelect?.(null); };
  const updateLogo = (id: string, changes: Partial<LogoElement>) => update({ logos: design.logos.map((l) => l.id === id ? { ...l, ...changes } : l) });

  const addShape = (type: 'rectangle' | 'circle' | 'line') => {
    const n: ShapeElement = {
      id: genId(), type, x: 20, y: 20 + (design.shapes ?? []).length * 20,
      width: type === 'line' ? 120 : 80, height: type === 'line' ? 4 : 60,
      color: '#4f46e5', borderColor: '#1e293b', borderWidth: type === 'line' ? 2 : 0,
      borderRadius: type === 'circle' ? 9999 : 8, opacity: 1, rotation: 0, zIndex: getMaxZ() + 1,
      lineStyle: type === 'line' ? 'solid' : undefined,
      gradient: { enabled: false, type: 'linear', angle: 90, stops: [{ offset: 0, color: '#4f46e5' }, { offset: 1, color: '#06b6d4' }] },
    };
    update({ shapes: [...(design.shapes ?? []), n] });
    onSelect?.(n.id);
  };
  const deleteShape = (id: string) => { update({ shapes: (design.shapes ?? []).filter((s) => s.id !== id) }); if (selectedId === id) onSelect?.(null); };
  const updateShape = (id: string, changes: Partial<ShapeElement>) => update({ shapes: (design.shapes ?? []).map((s) => s.id === id ? { ...s, ...changes } : s) });
  const updateShapeGradientStop = (shapeId: string, idx: number, changes: Partial<GradientStop>) => {
    const shape = (design.shapes ?? []).find((s) => s.id === shapeId);
    if (!shape) return;
    updateShape(shapeId, { gradient: { ...shape.gradient, stops: shape.gradient.stops.map((s, i) => i === idx ? { ...s, ...changes } : s) } });
  };
  const addGradientStop = (shapeId: string) => {
    const shape = (design.shapes ?? []).find((s) => s.id === shapeId);
    if (!shape) return;
    updateShape(shapeId, { gradient: { ...shape.gradient, stops: [...shape.gradient.stops, { offset: 1, color: '#f59e0b' }] } });
  };
  const removeGradientStop = (shapeId: string, idx: number) => {
    const shape = (design.shapes ?? []).find((s) => s.id === shapeId);
    if (!shape || shape.gradient.stops.length <= 2) return;
    updateShape(shapeId, { gradient: { ...shape.gradient, stops: shape.gradient.stops.filter((_, i) => i !== idx) } });
  };

  const togglePhoto = () => {
    if (design.photo) { update({ photo: null }); if (selectedId === '__photo__') onSelect?.(null); }
    else { update({ photo: { x: 15, y: 55, width: 70, height: 85, borderRadius: 6, borderColor: design.frameColor, borderWidth: 2 } }); onSelect?.('__photo__'); }
  };
  const updatePhoto = (changes: Partial<PhotoPlaceholder>) => { if (!design.photo) return; update({ photo: { ...design.photo, ...changes } }); };

  const toggleQr = () => {
    if (design.qr) { update({ qr: null }); if (selectedId === '__qr__') onSelect?.(null); }
    else { update({ qr: { x: design.width - 100, y: design.height - 100, size: 80, width: 80, height: 80, borderRadius: 0, borderColor: '#cbd5e1', borderWidth: 1 } }); onSelect?.('__qr__'); }
  };
  const updateQr = (changes: Partial<QrPlaceholder>) => { if (!design.qr) return; update({ qr: { ...design.qr, ...changes } }); };

  const getMaxZ = () => {
    const all = [...design.texts.map((t) => t.zIndex ?? 0), ...design.logos.map((l) => l.zIndex ?? 0), ...(design.shapes ?? []).map((s) => s.zIndex ?? 0), ...(design.photo ? [design.photo.zIndex ?? 0] : []), ...(design.qr ? [design.qr.zIndex ?? 0] : [])];
    return all.length ? Math.max(...all) : 0;
  };

  const selectedText = design.texts.find((t) => t.id === selectedId);
  const selectedLogo = design.logos.find((l) => l.id === selectedId);
  const selectedShape = (design.shapes ?? []).find((s) => s.id === selectedId);

  return (
    <div className="flex h-full">
      {/* Icon nav strip */}
      <div className="flex flex-col items-center gap-1 py-2 px-1 bg-slate-50 border-r border-slate-200 shrink-0 w-14">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className={`flex flex-col items-center gap-0.5 w-11 py-2 rounded-xl transition-all text-[10px] font-medium ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
          >
            {tab.icon}
            <span className="leading-none">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-white">

        {/* SIZE */}
        {activeTab === 'size' && (
          <div className="p-3 space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Card Size</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(CARD_SIZE_PRESETS) as Array<keyof typeof CARD_SIZE_PRESETS>).map((key) => (
                <button key={key} onClick={() => handleSizePreset(key)} className={`text-xs px-2 py-2 rounded-lg border transition-colors text-left leading-tight ${design.size === key ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <span className="block font-medium">{CARD_SIZE_PRESETS[key].label.split(' (')[0]}</span>
                  <span className="block text-[10px] text-slate-400">{CARD_SIZE_PRESETS[key].width}x{CARD_SIZE_PRESETS[key].height}</span>
                </button>
              ))}
              <button onClick={() => handleSizePreset('custom')} className={`text-xs px-2 py-2 rounded-lg border transition-colors ${design.size === 'custom' ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Custom</button>
            </div>
            {design.size === 'custom' && (
              <div className="flex gap-2">
                <label className="flex-1"><span className="text-[10px] text-slate-500 uppercase tracking-wide">W (px)</span><input type="number" value={design.width} onChange={(e) => update({ width: Math.max(100, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                <label className="flex-1"><span className="text-[10px] text-slate-500 uppercase tracking-wide">H (px)</span><input type="number" value={design.height} onChange={(e) => update({ height: Math.max(100, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
              </div>
            )}
            <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">Current: {design.width} x {design.height} px</p>
          </div>
        )}

        {/* COLORS */}
        {activeTab === 'colors' && (
          <div className="p-3 space-y-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Card Colors</p>
            <div className="flex items-center gap-3">
              <label className="relative cursor-pointer" title="Background Color">
                <div className="w-10 h-10 rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden">
                  <input type="color" value={design.backgroundColor ?? '#ffffff'} onChange={(e) => update({ backgroundColor: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                  <div className="w-full h-full" style={{ backgroundColor: design.backgroundColor ?? '#ffffff' }} />
                </div>
              </label>
              <div><p className="text-xs font-medium text-slate-700">Background</p><p className="text-[10px] text-slate-400 font-mono">{design.backgroundColor ?? '#ffffff'}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <label className="relative cursor-pointer" title="Frame Color">
                <div className="w-10 h-10 rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden">
                  <input type="color" value={design.frameColor ?? '#000000'} onChange={(e) => update({ frameColor: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                  <div className="w-full h-full" style={{ backgroundColor: design.frameColor ?? '#000000' }} />
                </div>
              </label>
              <div className="flex-1"><p className="text-xs font-medium text-slate-700">Frame</p><p className="text-[10px] text-slate-400 font-mono">{design.frameColor ?? '#000000'}</p></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><span className="text-xs text-slate-600">Frame Width</span><span className="text-xs font-mono text-slate-500">{design.frameWidth ?? 0}px</span></div>
              <input type="range" min={0} max={12} value={design.frameWidth ?? 0} onChange={(e) => update({ frameWidth: Number(e.target.value) })} className="w-full accent-indigo-600" />
            </div>
          </div>
        )}

        {/* TEXT */}
        {activeTab === 'text' && (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Text Elements</p>
              <span className="text-[10px] text-slate-400">{design.texts.length}</span>
            </div>
            <button onClick={addText} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M2 3h12v2H9v8H7V5H2z"/></svg>
              Add Text
            </button>
            {design.texts.length === 0 && <div className="py-6 text-center text-[11px] text-slate-400">No text elements yet.</div>}
            {design.texts.map((text) => {
              const isSel = selectedId === text.id;
              return (
                <div key={text.id} className={`group rounded-xl border transition-all overflow-hidden ${isSel ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => onSelect?.(isSel ? null : text.id)}>
                    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 shrink-0 ${isSel ? 'text-indigo-600' : 'text-slate-400'}`} fill="currentColor"><path d="M2 3h12v2H9v8H7V5H2z"/></svg>
                    <span className="flex-1 text-xs truncate text-slate-700 font-medium">{text.content || '(empty)'}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{text.fontSize}px</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteText(text.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-0.5 transition-opacity" title="Delete">x</button>
                  </div>
                  {isSel && selectedText && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-indigo-100 bg-white">
                      <label>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Content</span>
                        <textarea value={selectedText.content} onChange={(e) => updateText(selectedText.id, { content: e.target.value })} rows={2} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      </label>
                      <label>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Font</span>
                        <select value={selectedText.fontFamily ?? 'Inter, sans-serif'} onChange={(e) => updateText(selectedText.id, { fontFamily: e.target.value })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                          {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                        </select>
                      </label>
                      <div>
                        <div className="flex justify-between"><span className="text-[10px] text-slate-500 uppercase tracking-wide">Size</span><span className="text-[10px] font-mono text-indigo-600">{selectedText.fontSize}px</span></div>
                        <input type="range" min={8} max={96} value={selectedText.fontSize} onChange={(e) => updateText(selectedText.id, { fontSize: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateText(selectedText.id, { fontWeight: selectedText.fontWeight === 'bold' ? 'normal' : 'bold' })} title="Bold" className={`w-7 h-7 rounded-lg border text-xs font-bold transition-colors ${selectedText.fontWeight === 'bold' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>B</button>
                        <button onClick={() => updateText(selectedText.id, { fontStyle: selectedText.fontStyle === 'italic' ? 'normal' : 'italic' })} title="Italic" className={`w-7 h-7 rounded-lg border text-xs italic font-semibold transition-colors ${selectedText.fontStyle === 'italic' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>I</button>
                        <div className="w-px h-5 bg-slate-200 mx-0.5" />
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button key={align} onClick={() => updateText(selectedText.id, { textAlign: align })} title={`Align ${align}`} className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${selectedText.textAlign === align ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                            {align === 'left' && <svg viewBox="0 0 12 10" className="w-3 h-3" fill="currentColor"><rect x="0" y="0" width="12" height="2"/><rect x="0" y="4" width="8" height="2"/><rect x="0" y="8" width="10" height="2"/></svg>}
                            {align === 'center' && <svg viewBox="0 0 12 10" className="w-3 h-3" fill="currentColor"><rect x="0" y="0" width="12" height="2"/><rect x="2" y="4" width="8" height="2"/><rect x="1" y="8" width="10" height="2"/></svg>}
                            {align === 'right' && <svg viewBox="0 0 12 10" className="w-3 h-3" fill="currentColor"><rect x="0" y="0" width="12" height="2"/><rect x="4" y="4" width="8" height="2"/><rect x="2" y="8" width="10" height="2"/></svg>}
                          </button>
                        ))}
                        <div className="w-px h-5 bg-slate-200 mx-0.5" />
                        <label className="relative cursor-pointer" title="Text Color">
                          <div className="w-7 h-7 rounded-lg border border-slate-200 overflow-hidden relative">
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: selectedText.color }}>A</span>
                            <div className="absolute bottom-0.5 left-1 right-1 h-1 rounded-sm" style={{ backgroundColor: selectedText.color }} />
                            <input type="color" value={selectedText.color} onChange={(e) => updateText(selectedText.id, { color: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                          </div>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="text-[10px] text-slate-500">X</span><input type="number" value={Math.round(selectedText.x)} onChange={(e) => updateText(selectedText.id, { x: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                        <label className="flex-1"><span className="text-[10px] text-slate-500">Y</span><input type="number" value={Math.round(selectedText.y)} onChange={(e) => updateText(selectedText.id, { y: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SHAPES */}
        {activeTab === 'shapes' && (
          <div className="p-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Shapes</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { type: 'rectangle' as const, label: 'Rect', icon: <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="12" height="8" rx="1.5"/></svg> },
                { type: 'circle' as const, label: 'Circle', icon: <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="8" cy="8" r="5.5"/></svg> },
                { type: 'line' as const, label: 'Line', icon: <svg viewBox="0 0 16 16" className="w-4 h-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="2" y1="8" x2="14" y2="8"/></svg> },
              ]).map(({ type, label, icon }) => (
                <button key={type} onClick={() => addShape(type)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-all text-[11px] font-medium" title={`Add ${label}`}>
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            {(design.shapes ?? []).length === 0 && <div className="py-6 text-center text-[11px] text-slate-400">No shapes yet.</div>}
            {(design.shapes ?? []).map((shape) => {
              const isSel = selectedId === shape.id;
              const swatchBg = shape.gradient?.enabled
                ? (shape.gradient.type === 'linear' ? `linear-gradient(${shape.gradient.angle}deg, ${shape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})` : `radial-gradient(circle, ${shape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`)
                : undefined;
              return (
                <div key={shape.id} className={`group rounded-xl border transition-all overflow-hidden ${isSel ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => onSelect?.(isSel ? null : shape.id)}>
                    <span className="w-5 h-5 rounded shrink-0 border border-slate-200" style={{ backgroundColor: swatchBg ? undefined : shape.color, backgroundImage: swatchBg, borderRadius: shape.type === 'circle' ? '50%' : shape.borderRadius }} />
                    <span className={`flex-1 text-xs capitalize font-medium ${isSel ? 'text-indigo-700' : 'text-slate-700'}`}>{shape.type}</span>
                    <span className="text-[10px] text-slate-400">{shape.width}x{shape.height}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteShape(shape.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-0.5 transition-opacity" title="Delete">x</button>
                  </div>
                  {isSel && selectedShape && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-indigo-100 bg-white">
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="text-[10px] text-slate-500">W</span><input type="number" value={selectedShape.width} onChange={(e) => updateShape(selectedShape.id, { width: Math.max(2, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                        <label className="flex-1"><span className="text-[10px] text-slate-500">H</span><input type="number" value={selectedShape.height} onChange={(e) => updateShape(selectedShape.id, { height: Math.max(2, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="text-[10px] text-slate-500">X</span><input type="number" value={Math.round(selectedShape.x)} onChange={(e) => updateShape(selectedShape.id, { x: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                        <label className="flex-1"><span className="text-[10px] text-slate-500">Y</span><input type="number" value={Math.round(selectedShape.y)} onChange={(e) => updateShape(selectedShape.id, { y: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="relative cursor-pointer" title="Fill Color">
                          <div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden">
                            <div className="w-full h-full" style={{ backgroundColor: swatchBg ? undefined : selectedShape.color, backgroundImage: swatchBg }} />
                            <input type="color" value={selectedShape.color ?? '#4f46e5'} onChange={(e) => updateShape(selectedShape.id, { color: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                          </div>
                        </label>
                        <span className="text-xs text-slate-600">Fill</span>
                        <input type="text" value={selectedShape.color ?? '#4f46e5'} onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateShape(selectedShape.id, { color: e.target.value }); }} className="flex-1 text-xs font-mono rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      </div>
                      {selectedShape.type !== 'line' && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="relative cursor-pointer" title="Border Color">
                              <div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden" style={{ backgroundColor: selectedShape.borderColor ?? '#1e293b' }}>
                                <input type="color" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => updateShape(selectedShape.id, { borderColor: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                              </div>
                            </label>
                            <span className="text-xs text-slate-600">Border</span>
                            <input type="text" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateShape(selectedShape.id, { borderColor: e.target.value }); }} className="flex-1 text-xs font-mono rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                          </div>
                          <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Border Width</span><span className="text-[10px] font-mono text-slate-500">{selectedShape.borderWidth ?? 0}px</span></div><input type="range" min={0} max={10} value={selectedShape.borderWidth ?? 0} onChange={(e) => updateShape(selectedShape.id, { borderWidth: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /></div>
                          {selectedShape.type === 'rectangle' && (
                            <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Corner Radius</span><span className="text-[10px] font-mono text-slate-500">{selectedShape.borderRadius ?? 0}px</span></div><input type="range" min={0} max={50} value={selectedShape.borderRadius ?? 0} onChange={(e) => updateShape(selectedShape.id, { borderRadius: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /></div>
                          )}
                        </>
                      )}
                      {selectedShape.type === 'line' && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="relative cursor-pointer" title="Line Color">
                              <div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden" style={{ backgroundColor: selectedShape.borderColor ?? '#1e293b' }}>
                                <input type="color" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => updateShape(selectedShape.id, { borderColor: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                              </div>
                            </label>
                            <span className="text-xs text-slate-600">Color</span>
                          </div>
                          <div><span className="text-[10px] text-slate-500">Line Width ({selectedShape.borderWidth ?? 1}pt)</span><input type="number" min={0.5} max={20} step={0.5} value={selectedShape.borderWidth ?? 1} onChange={(e) => updateShape(selectedShape.id, { borderWidth: Math.max(0.5, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
                          <div>
                            <span className="text-[10px] text-slate-500 mb-1 block">Style</span>
                            <div className="flex gap-1">
                              {(['solid', 'dashed', 'dotted'] as const).map((s) => (
                                <button key={s} onClick={() => updateShape(selectedShape.id, { lineStyle: s })} className={`flex-1 py-1 text-xs rounded-lg border transition-colors ${(selectedShape.lineStyle ?? 'solid') === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                  {s === 'solid' ? 'Solid' : s === 'dashed' ? 'Dash' : 'Dot'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Opacity</span><span className="text-[10px] font-mono text-slate-500">{Math.round((selectedShape.opacity ?? 1) * 100)}%</span></div><input type="range" min={0} max={100} value={Math.round((selectedShape.opacity ?? 1) * 100)} onChange={(e) => updateShape(selectedShape.id, { opacity: Number(e.target.value) / 100 })} className="w-full accent-indigo-600 mt-1" /></div>
                      <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Rotation</span><span className="text-[10px] font-mono text-slate-500">{Math.round(selectedShape.rotation ?? 0)}deg</span></div><input type="range" min={0} max={360} value={Math.round(selectedShape.rotation ?? 0)} onChange={(e) => updateShape(selectedShape.id, { rotation: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /></div>
                      <div className="border-t border-slate-100 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedShape.gradient.enabled} onChange={(e) => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, enabled: e.target.checked } })} className="accent-indigo-600" />
                          <span className="text-xs font-medium text-slate-600">Gradient Fill</span>
                        </label>
                        {selectedShape.gradient.enabled && (
                          <div className="mt-2 space-y-2">
                            <div className="w-full h-5 rounded-lg border border-slate-200" style={{ backgroundImage: selectedShape.gradient.type === 'linear' ? `linear-gradient(${selectedShape.gradient.angle}deg, ${selectedShape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})` : `radial-gradient(circle, ${selectedShape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})` }} />
                            <div className="flex gap-1">
                              <button onClick={() => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, type: 'linear' } })} className={`flex-1 py-1 text-xs rounded-lg border transition-colors ${selectedShape.gradient.type === 'linear' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Linear</button>
                              <button onClick={() => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, type: 'radial' } })} className={`flex-1 py-1 text-xs rounded-lg border transition-colors ${selectedShape.gradient.type === 'radial' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Radial</button>
                            </div>
                            {selectedShape.gradient.type === 'linear' && (
                              <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Angle</span><span className="text-[10px] font-mono text-slate-500">{selectedShape.gradient.angle}deg</span></div><input type="range" min={0} max={360} value={selectedShape.gradient.angle} onChange={(e) => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, angle: Number(e.target.value) } })} className="w-full accent-indigo-600 mt-1" /></div>
                            )}
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-slate-500 font-medium">Color Stops</span>
                              {selectedShape.gradient.stops.map((stop, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <input type="color" value={stop.color} onChange={(e) => updateShapeGradientStop(selectedShape.id, idx, { color: e.target.value })} className="w-5 h-5 rounded cursor-pointer border border-slate-300" />
                                  <input type="range" min={0} max={100} value={Math.round(stop.offset * 100)} onChange={(e) => updateShapeGradientStop(selectedShape.id, idx, { offset: Number(e.target.value) / 100 })} className="flex-1 accent-indigo-600" />
                                  <span className="text-[10px] text-slate-400 w-6">{Math.round(stop.offset * 100)}%</span>
                                  {selectedShape.gradient.stops.length > 2 && <button onClick={() => removeGradientStop(selectedShape.id, idx)} className="text-red-400 hover:text-red-600 text-xs">x</button>}
                                </div>
                              ))}
                              <button onClick={() => addGradientStop(selectedShape.id)} className="text-xs text-indigo-500 hover:text-indigo-700">+ Add Stop</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* IMAGES */}
        {activeTab === 'images' && (
          <div className="p-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Logos & Images</p>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 3v10M3 8h10" strokeLinecap="round"/></svg>
              Upload Image
            </button>
            {design.logos.length === 0 && <div className="py-6 text-center text-[11px] text-slate-400">No images uploaded yet.</div>}
            {design.logos.map((logo) => {
              const isSel = selectedId === logo.id;
              return (
                <div key={logo.id} className={`group rounded-xl border transition-all overflow-hidden ${isSel ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 px-2 py-1.5 cursor-pointer" onClick={() => onSelect?.(isSel ? null : logo.id)}>
                    <img src={logo.src} alt={logo.name} className="w-8 h-8 object-contain rounded-lg border border-slate-200 bg-slate-50" />
                    <span className="flex-1 text-xs truncate text-slate-700 font-medium">{logo.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteLogo(logo.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-0.5 transition-opacity" title="Delete">x</button>
                  </div>
                  {isSel && selectedLogo && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-indigo-100 bg-white">
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="text-[10px] text-slate-500">W</span><input type="number" value={selectedLogo.width} onChange={(e) => updateLogo(selectedLogo.id, { width: Math.max(10, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                        <label className="flex-1"><span className="text-[10px] text-slate-500">H</span><input type="number" value={selectedLogo.height} onChange={(e) => updateLogo(selectedLogo.id, { height: Math.max(10, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="text-[10px] text-slate-500">X</span><input type="number" value={Math.round(selectedLogo.x)} onChange={(e) => updateLogo(selectedLogo.id, { x: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                        <label className="flex-1"><span className="text-[10px] text-slate-500">Y</span><input type="number" value={Math.round(selectedLogo.y)} onChange={(e) => updateLogo(selectedLogo.id, { y: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* PHOTO */}
        {activeTab === 'photo' && (
          <div className="p-3 space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Photo Placeholder</p>
            <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${design.photo ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="10" cy="8" r="3"/><path d="M4 17c0-3.31 2.69-6 6-6s6 2.69 6 6" strokeLinecap="round"/><circle cx="10" cy="8" r="7.5"/></svg>
              </div>
              <div className="flex-1"><p className="text-xs font-semibold text-slate-700">Photo Area</p><p className="text-[10px] text-slate-400">{design.photo ? 'Shown on card' : 'Not added'}</p></div>
              <button onClick={togglePhoto} className={`w-10 h-6 rounded-full transition-colors relative ${design.photo ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${design.photo ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {design.photo && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <label className="flex-1"><span className="text-[10px] text-slate-500">W</span><input type="number" value={design.photo.width} onChange={(e) => updatePhoto({ width: Math.max(20, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                  <label className="flex-1"><span className="text-[10px] text-slate-500">H</span><input type="number" value={design.photo.height} onChange={(e) => updatePhoto({ height: Math.max(20, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1"><span className="text-[10px] text-slate-500">X</span><input type="number" value={design.photo.x} onChange={(e) => updatePhoto({ x: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                  <label className="flex-1"><span className="text-[10px] text-slate-500">Y</span><input type="number" value={design.photo.y} onChange={(e) => updatePhoto({ y: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                </div>
                <div className="flex items-center gap-3">
                  <label className="relative cursor-pointer"><div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden" style={{ backgroundColor: design.photo.borderColor ?? '#000' }}><input type="color" value={design.photo.borderColor ?? '#000000'} onChange={(e) => updatePhoto({ borderColor: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" /></div></label>
                  <span className="text-xs text-slate-600">Border Color</span>
                </div>
                <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Corner Radius</span><span className="text-[10px] font-mono text-slate-500">{design.photo.borderRadius ?? 0}px</span></div><input type="range" min={0} max={Math.floor(Math.min(design.photo.width, design.photo.height) / 2)} value={design.photo.borderRadius ?? 0} onChange={(e) => updatePhoto({ borderRadius: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /><div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>Square</span><span>Circle</span></div></div>
                <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Border Width</span><span className="text-[10px] font-mono text-slate-500">{design.photo.borderWidth ?? 0}px</span></div><input type="range" min={0} max={10} value={design.photo.borderWidth ?? 0} onChange={(e) => updatePhoto({ borderWidth: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /></div>
              </div>
            )}
          </div>
        )}

        {/* QR */}
        {activeTab === 'qr' && (
          <div className="p-3 space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">QR Code</p>
            <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${design.qr ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor"><path d="M3 3h6v6H3V3zm2 2v2h2V5H5zM11 3h6v6h-6V3zm2 2v2h2V5h-2zM3 11h6v6H3v-6zm2 2v2h2v-2H5zM13 11h2v2h-2zM15 13h2v2h-2zM13 15h2v2h-2z"/></svg>
              </div>
              <div className="flex-1"><p className="text-xs font-semibold text-slate-700">QR Code Area</p><p className="text-[10px] text-slate-400">{design.qr ? 'Shown on card' : 'Not added'}</p></div>
              <button onClick={toggleQr} className={`w-10 h-6 rounded-full transition-colors relative ${design.qr ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${design.qr ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {design.qr && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <label className="flex-1"><span className="text-[10px] text-slate-500">W</span><input type="number" value={design.qr.width} onChange={(e) => updateQr({ width: Math.max(20, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                  <label className="flex-1"><span className="text-[10px] text-slate-500">H</span><input type="number" value={design.qr.height} onChange={(e) => updateQr({ height: Math.max(20, Number(e.target.value)) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1"><span className="text-[10px] text-slate-500">X</span><input type="number" value={design.qr.x} onChange={(e) => updateQr({ x: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                  <label className="flex-1"><span className="text-[10px] text-slate-500">Y</span><input type="number" value={design.qr.y} onChange={(e) => updateQr({ y: Number(e.target.value) })} className="mt-0.5 w-full text-xs rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></label>
                </div>
                <div className="flex items-center gap-3">
                  <label className="relative cursor-pointer"><div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden" style={{ backgroundColor: design.qr.borderColor ?? '#cbd5e1' }}><input type="color" value={design.qr.borderColor ?? '#cbd5e1'} onChange={(e) => updateQr({ borderColor: e.target.value })} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" /></div></label>
                  <span className="text-xs text-slate-600">Border Color</span>
                </div>
                <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Corner Radius</span><span className="text-[10px] font-mono text-slate-500">{design.qr.borderRadius ?? 0}px</span></div><input type="range" min={0} max={Math.floor(Math.min(design.qr.width, design.qr.height) / 2)} value={design.qr.borderRadius ?? 0} onChange={(e) => updateQr({ borderRadius: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /></div>
                <div><div className="flex justify-between"><span className="text-[10px] text-slate-500">Border Width</span><span className="text-[10px] font-mono text-slate-500">{design.qr.borderWidth ?? 0}px</span></div><input type="range" min={0} max={10} value={design.qr.borderWidth ?? 0} onChange={(e) => updateQr({ borderWidth: Number(e.target.value) })} className="w-full accent-indigo-600 mt-1" /></div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
