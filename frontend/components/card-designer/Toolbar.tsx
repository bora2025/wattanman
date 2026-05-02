'use client';

import { ChangeEvent, useRef } from 'react';
import { CardDesign, CardSize, CARD_SIZE_PRESETS, TextElement, LogoElement, ShapeElement, GradientStop, PhotoPlaceholder, QrPlaceholder, FONT_OPTIONS } from './types';

interface ToolbarProps {
  design: CardDesign;
  selectedId: string | null;
  onDesignChange: (design: CardDesign) => void;
  onSelect?: (id: string | null) => void;
  width?: number;
}

export default function Toolbar({ design, selectedId, onDesignChange, onSelect, width }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<CardDesign>) => {
    onDesignChange({ ...design, ...partial });
  };

  const genId = () => Math.random().toString(36).slice(2, 10);

  // --- Size ---
  const handleSizePreset = (size: CardSize) => {
    if (size === 'custom') {
      update({ size });
    } else {
      const preset = CARD_SIZE_PRESETS[size];
      update({ size, width: preset.width, height: preset.height });
    }
  };

  // --- Text ---
  const addText = () => {
    const newText: TextElement = {
      id: genId(),
      content: 'New Text',
      x: 20,
      y: 20 + design.texts.length * 30,
      fontSize: 16,
      color: '#1e293b',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      fontFamily: 'Inter, sans-serif',
      zIndex: getMaxZIndex() + 1,
    };
    update({ texts: [...design.texts, newText] });
  };

  const updateText = (id: string, changes: Partial<TextElement>) => {
    update({ texts: design.texts.map((t) => (t.id === id ? { ...t, ...changes } : t)) });
  };

  const deleteText = (id: string) => {
    update({ texts: design.texts.filter((t) => t.id !== id) });
  };

  // --- Logo ---
  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const newLogo: LogoElement = {
        id: genId(),
        src: reader.result as string,
        name: file.name,
        x: 20,
        y: 20,
        width: 80,
        height: 80,
        zIndex: getMaxZIndex() + 1,
      };
      update({ logos: [...design.logos, newLogo] });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateLogo = (id: string, changes: Partial<LogoElement>) => {
    update({ logos: design.logos.map((l) => (l.id === id ? { ...l, ...changes } : l)) });
  };

  const deleteLogo = (id: string) => {
    update({ logos: design.logos.filter((l) => l.id !== id) });
  };

  // --- Shapes ---
  const addShape = (type: 'rectangle' | 'circle' | 'line') => {
    const newShape: ShapeElement = {
      id: genId(),
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
      zIndex: getMaxZIndex() + 1,
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
    update({ shapes: [...(design.shapes ?? []), newShape] });
  };

  const updateShape = (id: string, changes: Partial<ShapeElement>) => {
    update({ shapes: (design.shapes ?? []).map((s) => (s.id === id ? { ...s, ...changes } : s)) });
  };

  const deleteShape = (id: string) => {
    update({ shapes: (design.shapes ?? []).filter((s) => s.id !== id) });
  };

  const updateShapeGradientStop = (shapeId: string, idx: number, changes: Partial<GradientStop>) => {
    const shape = (design.shapes ?? []).find((s) => s.id === shapeId);
    if (!shape) return;
    const stops = shape.gradient.stops.map((s, i) => (i === idx ? { ...s, ...changes } : s));
    updateShape(shapeId, { gradient: { ...shape.gradient, stops } });
  };

  const addGradientStop = (shapeId: string) => {
    const shape = (design.shapes ?? []).find((s) => s.id === shapeId);
    if (!shape) return;
    const stops = [...shape.gradient.stops, { offset: 1, color: '#f59e0b' }];
    updateShape(shapeId, { gradient: { ...shape.gradient, stops } });
  };

  const removeGradientStop = (shapeId: string, idx: number) => {
    const shape = (design.shapes ?? []).find((s) => s.id === shapeId);
    if (!shape || shape.gradient.stops.length <= 2) return;
    const stops = shape.gradient.stops.filter((_, i) => i !== idx);
    updateShape(shapeId, { gradient: { ...shape.gradient, stops } });
  };

  // --- Z-index helper ---
  const getMaxZIndex = () => {
    const all: number[] = [
      ...design.texts.map((t) => t.zIndex ?? 0),
      ...design.logos.map((l) => l.zIndex ?? 0),
      ...(design.shapes ?? []).map((s) => s.zIndex ?? 0),
      ...(design.photo ? [design.photo.zIndex ?? 0] : []),
      ...(design.qr ? [design.qr.zIndex ?? 0] : []),
    ];
    return all.length > 0 ? Math.max(...all) : 0;
  };
  const getMinZIndex = () => {
    const all: number[] = [
      ...design.texts.map((t) => t.zIndex ?? 0),
      ...design.logos.map((l) => l.zIndex ?? 0),
      ...(design.shapes ?? []).map((s) => s.zIndex ?? 0),
      ...(design.photo ? [design.photo.zIndex ?? 0] : []),
      ...(design.qr ? [design.qr.zIndex ?? 0] : []),
    ];
    return all.length > 0 ? Math.min(...all) : 0;
  };
  const getAllZIndices = () => {
    const items: { id: string; z: number }[] = [
      ...design.texts.map((t) => ({ id: t.id, z: t.zIndex ?? 0 })),
      ...design.logos.map((l) => ({ id: l.id, z: l.zIndex ?? 0 })),
      ...(design.shapes ?? []).map((s) => ({ id: s.id, z: s.zIndex ?? 0 })),
      ...(design.photo ? [{ id: '__photo__', z: design.photo.zIndex ?? 0 }] : []),
      ...(design.qr ? [{ id: '__qr__', z: design.qr.zIndex ?? 0 }] : []),
    ];
    return items.sort((a, b) => a.z - b.z);
  };

  const arrangeItem = (id: string, mode: 'front' | 'forward' | 'backward' | 'back') => {
    // Build sorted list (lowest z first)
    const ordered = [
      ...design.texts.map((t) => ({ id: t.id, z: t.zIndex ?? 0 })),
      ...design.logos.map((l) => ({ id: l.id, z: l.zIndex ?? 0 })),
      ...(design.shapes ?? []).map((s) => ({ id: s.id, z: s.zIndex ?? 0 })),
      ...(design.photo ? [{ id: '__photo__', z: design.photo.zIndex ?? 0 }] : []),
      ...(design.qr ? [{ id: '__qr__', z: design.qr.zIndex ?? 0 }] : []),
    ].sort((a, b) => a.z - b.z);

    const idx = ordered.findIndex((item) => item.id === id);
    if (idx < 0) return;

    // Remove item and re-insert at the new position
    const [item] = ordered.splice(idx, 1);
    if (mode === 'front') {
      ordered.push(item);
    } else if (mode === 'back') {
      ordered.unshift(item);
    } else if (mode === 'forward') {
      if (idx >= ordered.length) return; // already at top
      ordered.splice(idx + 1, 0, item);
    } else { // backward
      if (idx === 0) return; // already at bottom
      ordered.splice(idx - 1, 0, item);
    }

    // Reassign consecutive z-indices so they are always unique
    const zMap: Record<string, number> = {};
    ordered.forEach((el, i) => { zMap[el.id] = i; });

    update({
      texts: design.texts.map((t) => ({ ...t, zIndex: zMap[t.id] ?? t.zIndex ?? 0 })),
      logos: design.logos.map((l) => ({ ...l, zIndex: zMap[l.id] ?? l.zIndex ?? 0 })),
      shapes: (design.shapes ?? []).map((s) => ({ ...s, zIndex: zMap[s.id] ?? s.zIndex ?? 0 })),
      photo: design.photo ? { ...design.photo, zIndex: zMap['__photo__'] ?? design.photo.zIndex ?? 0 } : null,
      qr: design.qr ? { ...design.qr, zIndex: zMap['__qr__'] ?? design.qr.zIndex ?? 0 } : null,
    });
  };

  const selectedText = design.texts.find((t) => t.id === selectedId);
  const selectedLogo = design.logos.find((l) => l.id === selectedId);
  const selectedShape = (design.shapes ?? []).find((s) => s.id === selectedId);

  // --- Photo placeholder ---
  const togglePhoto = () => {
    if (design.photo) {
      update({ photo: null });
    } else {
      update({
        photo: { x: 15, y: 55, width: 70, height: 85, borderRadius: 6, borderColor: design.frameColor, borderWidth: 2 },
      });
    }
  };

  const updatePhoto = (changes: Partial<PhotoPlaceholder>) => {
    if (!design.photo) return;
    update({ photo: { ...design.photo, ...changes } });
  };

  // --- QR placeholder ---
  const toggleQr = () => {
    if (design.qr) {
      update({ qr: null });
    } else {
      update({ qr: { x: design.width - 100, y: design.height - 100, size: 80, width: 80, height: 80, borderRadius: 0, borderColor: '#cbd5e1', borderWidth: 1 } });
    }
  };

  const updateQr = (changes: Partial<QrPlaceholder>) => {
    if (!design.qr) return;
    update({ qr: { ...design.qr, ...changes } });
  };

  return (
    <div className="shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto max-h-[calc(100vh-12rem)]" style={{ width: width ?? 320 }}>
      {/* Card Size */}
      <Section title="📐 Card Size">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(CARD_SIZE_PRESETS) as Array<keyof typeof CARD_SIZE_PRESETS>).map((key) => (
              <button
                key={key}
                onClick={() => handleSizePreset(key)}
                className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  design.size === key
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {CARD_SIZE_PRESETS[key].label.split(' (')[0]}
              </button>
            ))}
            <button
              onClick={() => handleSizePreset('custom')}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                design.size === 'custom'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Custom
            </button>
          </div>
          {design.size === 'custom' && (
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="text-xs text-slate-500">Width</span>
                <input
                  type="number"
                  value={design.width}
                  onChange={(e) => update({ width: Math.max(100, Number(e.target.value)) })}
                  className="!py-1 !text-xs"
                />
              </label>
              <label className="flex-1">
                <span className="text-xs text-slate-500">Height</span>
                <input
                  type="number"
                  value={design.height}
                  onChange={(e) => update({ height: Math.max(100, Number(e.target.value)) })}
                  className="!py-1 !text-xs"
                />
              </label>
            </div>
          )}
        </div>
      </Section>

      {/* Colors */}
      <Section title="🎨 Colors">
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="color"
              value={design.backgroundColor ?? '#ffffff'}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-slate-300"
            />
            <div>
              <span className="text-sm text-slate-700">Background</span>
              <span className="block text-xs text-slate-400">{design.backgroundColor}</span>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="color"
              value={design.frameColor ?? '#000000'}
              onChange={(e) => update({ frameColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-slate-300"
            />
            <div>
              <span className="text-sm text-slate-700">Frame</span>
              <span className="block text-xs text-slate-400">{design.frameColor}</span>
            </div>
          </label>
          <label>
            <span className="text-xs text-slate-500">Frame Width ({design.frameWidth}px)</span>
            <input
              type="range"
              min={0}
              max={12}
              value={design.frameWidth ?? 0}
              onChange={(e) => update({ frameWidth: Number(e.target.value) })}
              className="w-full accent-indigo-600"
            />
          </label>
        </div>
      </Section>

      {/* Photo Placeholder */}
      <Section title="👤 Photo Placeholder">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={design.photo !== null}
              onChange={togglePhoto}
              className="accent-indigo-600"
            />
            <span className="text-xs text-slate-600">Show photo area</span>
          </label>
          {design.photo && (
            <>
              <div>
                <span className="text-xs text-slate-500 font-medium">Arrange</span>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  <button onClick={() => arrangeItem('__photo__', 'front')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring to Front">⤒ Front</button>
                  <button onClick={() => arrangeItem('__photo__', 'forward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring Forward">↑ Fwd</button>
                  <button onClick={() => arrangeItem('__photo__', 'backward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send Backward">↓ Bwd</button>
                  <button onClick={() => arrangeItem('__photo__', 'back')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send to Back">⤓ Back</button>
                </div>
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-xs text-slate-500">W</span>
                  <input
                    type="number"
                    value={design.photo.width}
                    onChange={(e) => updatePhoto({ width: Math.max(20, Number(e.target.value)) })}
                    className="!py-1 !text-xs"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-xs text-slate-500">H</span>
                  <input
                    type="number"
                    value={design.photo.height}
                    onChange={(e) => updatePhoto({ height: Math.max(20, Number(e.target.value)) })}
                    className="!py-1 !text-xs"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-xs text-slate-500">X</span>
                  <input
                    type="number"
                    value={design.photo.x}
                    onChange={(e) => updatePhoto({ x: Number(e.target.value) })}
                    className="!py-1 !text-xs"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-xs text-slate-500">Y</span>
                  <input
                    type="number"
                    value={design.photo.y}
                    onChange={(e) => updatePhoto({ y: Number(e.target.value) })}
                    className="!py-1 !text-xs"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={design.photo.borderColor ?? '#000000'}
                  onChange={(e) => updatePhoto({ borderColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-slate-300"
                />
                <span className="text-xs text-slate-500">Border Color</span>
              </label>
              <label>
                <span className="text-xs text-slate-500">R — Corner Radius ({design.photo.borderRadius}px)</span>
                <input
                  type="range"
                  min={0}
                  max={Math.floor(Math.min(design.photo.width, design.photo.height) / 2)}
                  value={design.photo.borderRadius ?? 0}
                  onChange={(e) => updatePhoto({ borderRadius: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>Rectangle</span>
                  <span>Circle</span>
                </div>
              </label>
              <label>
                <span className="text-xs text-slate-500">Border Width ({design.photo.borderWidth}px)</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={design.photo.borderWidth ?? 0}
                  onChange={(e) => updatePhoto({ borderWidth: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </label>
            </>
          )}
        </div>
      </Section>

      {/* QR Code Placeholder */}
      <Section title="📱 QR Code">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={design.qr !== null}
              onChange={toggleQr}
              className="accent-indigo-600"
            />
            <span className="text-xs text-slate-600">Show QR area</span>
          </label>
          {design.qr && (
            <>
              <div>
                <span className="text-xs text-slate-500 font-medium">Arrange</span>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  <button onClick={() => arrangeItem('__qr__', 'front')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring to Front">⤒ Front</button>
                  <button onClick={() => arrangeItem('__qr__', 'forward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring Forward">↑ Fwd</button>
                  <button onClick={() => arrangeItem('__qr__', 'backward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send Backward">↓ Bwd</button>
                  <button onClick={() => arrangeItem('__qr__', 'back')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send to Back">⤓ Back</button>
                </div>
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-xs text-slate-500">W</span>
                  <input
                    type="number"
                    value={design.qr.width}
                    onChange={(e) => updateQr({ width: Math.max(20, Number(e.target.value)) })}
                    className="!py-1 !text-xs"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-xs text-slate-500">H</span>
                  <input
                    type="number"
                    value={design.qr.height}
                    onChange={(e) => updateQr({ height: Math.max(20, Number(e.target.value)) })}
                    className="!py-1 !text-xs"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-xs text-slate-500">X</span>
                  <input
                    type="number"
                    value={design.qr.x}
                    onChange={(e) => updateQr({ x: Number(e.target.value) })}
                    className="!py-1 !text-xs"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-xs text-slate-500">Y</span>
                  <input
                    type="number"
                    value={design.qr.y}
                    onChange={(e) => updateQr({ y: Number(e.target.value) })}
                    className="!py-1 !text-xs"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={design.qr.borderColor ?? '#cbd5e1'}
                  onChange={(e) => updateQr({ borderColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-slate-300"
                />
                <span className="text-xs text-slate-500">Border Color</span>
              </label>
              <label>
                <span className="text-xs text-slate-500">R — Corner Radius ({design.qr.borderRadius}px)</span>
                <input
                  type="range"
                  min={0}
                  max={Math.floor(Math.min(design.qr.width, design.qr.height) / 2)}
                  value={design.qr.borderRadius ?? 0}
                  onChange={(e) => updateQr({ borderRadius: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>Rectangle</span>
                  <span>Circle</span>
                </div>
              </label>
              <label>
                <span className="text-xs text-slate-500">Border Width ({design.qr.borderWidth}px)</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={design.qr.borderWidth ?? 0}
                  onChange={(e) => updateQr({ borderWidth: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </label>
            </>
          )}
        </div>
      </Section>

      {/* Logos */}
      <Section title="🖼️ Logos">
        <div className="space-y-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary btn-sm w-full">
            + Add Logo
          </button>
          {design.logos.map((logo) => (
            <div key={logo.id}>
              <div
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors hover:bg-slate-50 ${
                  selectedId === logo.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                }`}
                onClick={() => onSelect?.(selectedId === logo.id ? null : logo.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt={logo.name} className="w-8 h-8 object-contain rounded" />
                <span className="flex-1 truncate text-slate-600">{logo.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteLogo(logo.id); }}
                  className="text-red-500 hover:text-red-700 font-bold text-sm px-1"
                  title="Delete logo"
                >
                  ✕
                </button>
              </div>
              {/* Inline edit panel */}
              {selectedId === logo.id && selectedLogo && (
                <div className="mt-1 ml-2 pl-3 border-l-2 border-indigo-300 space-y-2 py-2">
                  <div>
                    <span className="text-xs text-slate-500 font-medium">Arrange</span>
                    <div className="grid grid-cols-4 gap-1 mt-1">
                      <button onClick={() => arrangeItem(selectedLogo.id, 'front')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring to Front">⤒ Front</button>
                      <button onClick={() => arrangeItem(selectedLogo.id, 'forward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring Forward">↑ Fwd</button>
                      <button onClick={() => arrangeItem(selectedLogo.id, 'backward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send Backward">↓ Bwd</button>
                      <button onClick={() => arrangeItem(selectedLogo.id, 'back')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send to Back">⤓ Back</button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <span className="text-xs text-slate-500">Width</span>
                      <input type="number" value={selectedLogo.width} onChange={(e) => updateLogo(selectedLogo.id, { width: Math.max(10, Number(e.target.value)) })} className="!py-1 !text-xs" />
                    </label>
                    <label className="flex-1">
                      <span className="text-xs text-slate-500">Height</span>
                      <input type="number" value={selectedLogo.height} onChange={(e) => updateLogo(selectedLogo.id, { height: Math.max(10, Number(e.target.value)) })} className="!py-1 !text-xs" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <span className="text-xs text-slate-500">X</span>
                      <input type="number" value={Math.round(selectedLogo.x)} onChange={(e) => updateLogo(selectedLogo.id, { x: Number(e.target.value) })} className="!py-1 !text-xs" />
                    </label>
                    <label className="flex-1">
                      <span className="text-xs text-slate-500">Y</span>
                      <input type="number" value={Math.round(selectedLogo.y)} onChange={(e) => updateLogo(selectedLogo.id, { y: Number(e.target.value) })} className="!py-1 !text-xs" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Shapes */}
      <Section title="🔷 Shapes">
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1">
            <button onClick={() => addShape('rectangle')} className="btn-primary btn-sm text-xs">
              ▬ Rect
            </button>
            <button onClick={() => addShape('circle')} className="btn-primary btn-sm text-xs">
              ● Circle
            </button>
            <button onClick={() => addShape('line')} className="btn-primary btn-sm text-xs">
              ─ Line
            </button>
          </div>
          {(design.shapes ?? []).map((shape) => {
            const swatchBg = shape.gradient?.enabled
              ? shape.gradient.type === 'linear'
                ? `linear-gradient(${shape.gradient.angle}deg, ${shape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`
                : `radial-gradient(circle, ${shape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`
              : undefined;
            return (
              <div key={shape.id}>
                <div
                  onClick={() => onSelect?.(selectedId === shape.id ? null : shape.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors hover:bg-slate-50 ${
                    selectedId === shape.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded shrink-0 border border-slate-200"
                    style={{
                      backgroundColor: swatchBg ? undefined : shape.color,
                      backgroundImage: swatchBg,
                      borderRadius: shape.type === 'circle' ? '50%' : shape.borderRadius,
                    }}
                  />
                  <span className="flex-1 truncate text-slate-600 capitalize">{shape.type}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteShape(shape.id); }}
                    className="text-red-500 hover:text-red-700 font-bold text-sm px-1"
                    title="Delete shape"
                  >
                    ✕
                  </button>
                </div>
                {/* Inline edit panel */}
                {selectedId === shape.id && selectedShape && (
                  <div className="mt-1 ml-2 pl-3 border-l-2 border-indigo-300 space-y-2 py-2">
                    <div>
                      <span className="text-xs text-slate-500 font-medium">Arrange</span>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        <button onClick={() => arrangeItem(selectedShape.id, 'front')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring to Front">⤒ Front</button>
                        <button onClick={() => arrangeItem(selectedShape.id, 'forward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring Forward">↑ Fwd</button>
                        <button onClick={() => arrangeItem(selectedShape.id, 'backward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send Backward">↓ Bwd</button>
                        <button onClick={() => arrangeItem(selectedShape.id, 'back')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send to Back">⤓ Back</button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="text-xs text-slate-500">Width</span>
                        <input type="number" value={selectedShape.width} onChange={(e) => updateShape(selectedShape.id, { width: Math.max(2, Number(e.target.value)) })} className="!py-1 !text-xs" />
                      </label>
                      <label className="flex-1">
                        <span className="text-xs text-slate-500">Height</span>
                        <input type="number" value={selectedShape.height} onChange={(e) => updateShape(selectedShape.id, { height: Math.max(2, Number(e.target.value)) })} className="!py-1 !text-xs" />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="text-xs text-slate-500">X</span>
                        <input type="number" value={Math.round(selectedShape.x)} onChange={(e) => updateShape(selectedShape.id, { x: Number(e.target.value) })} className="!py-1 !text-xs" />
                      </label>
                      <label className="flex-1">
                        <span className="text-xs text-slate-500">Y</span>
                        <input type="number" value={Math.round(selectedShape.y)} onChange={(e) => updateShape(selectedShape.id, { y: Number(e.target.value) })} className="!py-1 !text-xs" />
                      </label>
                    </div>
                    <label className="flex items-center gap-2">
                      <input type="color" value={selectedShape.color ?? '#4f46e5'} onChange={(e) => updateShape(selectedShape.id, { color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border border-slate-300" />
                      <div className="flex-1">
                        <span className="text-xs text-slate-500">Fill Color</span>
                        <input type="text" value={selectedShape.color ?? '#4f46e5'} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) updateShape(selectedShape.id, { color: v }); }} className="!py-0.5 !text-[10px] font-mono w-full" placeholder="#000000" />
                      </div>
                    </label>
                    {selectedShape.type !== 'line' && (
                      <>
                        <label className="flex items-center gap-2">
                          <input type="color" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => updateShape(selectedShape.id, { borderColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer border border-slate-300" />
                          <div className="flex-1">
                            <span className="text-xs text-slate-500">Border Color</span>
                            <input type="text" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) updateShape(selectedShape.id, { borderColor: v }); }} className="!py-0.5 !text-[10px] font-mono w-full" placeholder="#000000" />
                          </div>
                        </label>
                        <label>
                          <span className="text-xs text-slate-500">Border ({selectedShape.borderWidth}px)</span>
                          <input type="range" min={0} max={10} value={selectedShape.borderWidth ?? 0} onChange={(e) => updateShape(selectedShape.id, { borderWidth: Number(e.target.value) })} className="w-full accent-indigo-600" />
                        </label>
                        {selectedShape.type === 'rectangle' && (
                          <label>
                            <span className="text-xs text-slate-500">Corner Radius ({selectedShape.borderRadius}px)</span>
                            <input type="range" min={0} max={50} value={selectedShape.borderRadius ?? 0} onChange={(e) => updateShape(selectedShape.id, { borderRadius: Number(e.target.value) })} className="w-full accent-indigo-600" />
                          </label>
                        )}
                      </>
                    )}
                    {selectedShape.type === 'line' && (
                      <>
                        <label className="flex items-center gap-2">
                          <input type="color" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => updateShape(selectedShape.id, { borderColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer border border-slate-300" />
                          <div className="flex-1">
                            <span className="text-xs text-slate-500">Line Color</span>
                            <input type="text" value={selectedShape.borderColor ?? '#1e293b'} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) updateShape(selectedShape.id, { borderColor: v }); }} className="!py-0.5 !text-[10px] font-mono w-full" placeholder="#000000" />
                          </div>
                        </label>
                        <label>
                          <span className="text-xs text-slate-500">Line Width ({selectedShape.borderWidth}pt)</span>
                          <input type="number" min={0.5} max={20} step={0.5} value={selectedShape.borderWidth ?? 1} onChange={(e) => updateShape(selectedShape.id, { borderWidth: Math.max(0.5, Number(e.target.value)) })} className="!py-1 !text-xs" />
                        </label>
                        <div>
                          <span className="text-xs text-slate-500">Line Style</span>
                          <div className="flex gap-1 mt-1">
                            {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                              <button
                                key={style}
                                onClick={() => updateShape(selectedShape.id, { lineStyle: style })}
                                className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${(selectedShape.lineStyle ?? 'solid') === style ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                              >
                                {style === 'solid' ? '\u2014 Solid' : style === 'dashed' ? '- - Dash' : '\u00B7\u00B7\u00B7 Dot'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    <label>
                      <span className="text-xs text-slate-500">Opacity ({Math.round((selectedShape.opacity ?? 1) * 100)}%)</span>
                      <input type="range" min={0} max={100} value={Math.round((selectedShape.opacity ?? 1) * 100)} onChange={(e) => updateShape(selectedShape.id, { opacity: Number(e.target.value) / 100 })} className="w-full accent-indigo-600" />
                    </label>
                    <label>
                      <span className="text-xs text-slate-500">Rotation ({Math.round(selectedShape.rotation ?? 0)}°)</span>
                      <input type="range" min={0} max={360} value={Math.round(selectedShape.rotation ?? 0)} onChange={(e) => updateShape(selectedShape.id, { rotation: Number(e.target.value) })} className="w-full accent-indigo-600" />
                    </label>
                    {/* Gradient */}
                    <div className="border-t border-slate-100 pt-2 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input type="checkbox" checked={selectedShape.gradient.enabled} onChange={(e) => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, enabled: e.target.checked } })} className="accent-indigo-600" />
                        <span className="text-xs font-medium text-slate-600">Gradient Fill</span>
                      </label>
                      {selectedShape.gradient.enabled && (
                        <div className="space-y-2">
                          <div className="w-full h-6 rounded-md border border-slate-200" style={{ backgroundImage: selectedShape.gradient.type === 'linear' ? `linear-gradient(${selectedShape.gradient.angle}deg, ${selectedShape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})` : `radial-gradient(circle, ${selectedShape.gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})` }} />
                          <div className="flex gap-1">
                            <button onClick={() => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, type: 'linear' } })} className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${selectedShape.gradient.type === 'linear' ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Linear</button>
                            <button onClick={() => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, type: 'radial' } })} className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${selectedShape.gradient.type === 'radial' ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Radial</button>
                          </div>
                          {selectedShape.gradient.type === 'linear' && (
                            <label>
                              <span className="text-xs text-slate-500">Angle ({selectedShape.gradient.angle}°)</span>
                              <input type="range" min={0} max={360} value={selectedShape.gradient.angle} onChange={(e) => updateShape(selectedShape.id, { gradient: { ...selectedShape.gradient, angle: Number(e.target.value) } })} className="w-full accent-indigo-600" />
                            </label>
                          )}
                          <div className="space-y-1.5">
                            <span className="text-xs text-slate-500 font-medium">Color Stops</span>
                            {selectedShape.gradient.stops.map((stop, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <input type="color" value={stop.color} onChange={(e) => updateShapeGradientStop(selectedShape.id, idx, { color: e.target.value })} className="w-5 h-5 rounded cursor-pointer border border-slate-300" />
                                <input type="range" min={0} max={100} value={Math.round(stop.offset * 100)} onChange={(e) => updateShapeGradientStop(selectedShape.id, idx, { offset: Number(e.target.value) / 100 })} className="flex-1 accent-indigo-600" />
                                <span className="text-[10px] text-slate-400 w-7">{Math.round(stop.offset * 100)}%</span>
                                {selectedShape.gradient.stops.length > 2 && (
                                  <button onClick={() => removeGradientStop(selectedShape.id, idx)} className="text-red-400 hover:text-red-600 text-xs px-0.5">✕</button>
                                )}
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
      </Section>

      {/* Text Elements */}
      <Section title="✏️ Text Elements">
        <div className="space-y-2">
          <button onClick={addText} className="btn-primary btn-sm w-full">
            + Add Text
          </button>
          {design.texts.map((text) => (
            <div key={text.id}>
              <div
                className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors hover:bg-slate-50 ${
                  selectedId === text.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                }`}
                onClick={() => onSelect?.(selectedId === text.id ? null : text.id)}
              >
                <div className="flex items-center gap-1">
                  <span className="flex-1 truncate text-slate-600 font-medium">{text.content || '(empty)'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteText(text.id); }}
                    className="text-red-500 hover:text-red-700 font-bold text-sm px-1"
                    title="Delete text"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {/* Inline edit panel */}
              {selectedId === text.id && selectedText && (
                <div className="mt-1 ml-2 pl-3 border-l-2 border-indigo-300 space-y-2 py-2">
                  <div>
                    <span className="text-xs text-slate-500 font-medium">Arrange</span>
                    <div className="grid grid-cols-4 gap-1 mt-1">
                      <button onClick={() => arrangeItem(selectedText.id, 'front')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring to Front">⤒ Front</button>
                      <button onClick={() => arrangeItem(selectedText.id, 'forward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Bring Forward">↑ Fwd</button>
                      <button onClick={() => arrangeItem(selectedText.id, 'backward')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send Backward">↓ Bwd</button>
                      <button onClick={() => arrangeItem(selectedText.id, 'back')} className="px-1 py-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors" title="Send to Back">⤓ Back</button>
                    </div>
                  </div>
                  <label>
                    <span className="text-xs text-slate-500">Content</span>
                    <textarea value={selectedText.content} onChange={(e) => updateText(selectedText.id, { content: e.target.value })} rows={2} className="!py-1.5 !text-xs" />
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">Font</span>
                    <select value={selectedText.fontFamily ?? 'Inter, sans-serif'} onChange={(e) => updateText(selectedText.id, { fontFamily: e.target.value })} className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white">
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">Size ({selectedText.fontSize}px)</span>
                    <input type="range" min={8} max={72} value={selectedText.fontSize} onChange={(e) => updateText(selectedText.id, { fontSize: Number(e.target.value) })} className="w-full accent-indigo-600" />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="color" value={selectedText.color} onChange={(e) => updateText(selectedText.id, { color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border border-slate-300" />
                    <span className="text-xs text-slate-500">Color</span>
                  </label>
                  <div className="flex gap-1">
                    <button onClick={() => updateText(selectedText.id, { fontWeight: selectedText.fontWeight === 'bold' ? 'normal' : 'bold' })} className={`px-2 py-1 text-xs rounded border transition-colors ${selectedText.fontWeight === 'bold' ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>B</button>
                    <button onClick={() => updateText(selectedText.id, { fontStyle: selectedText.fontStyle === 'italic' ? 'normal' : 'italic' })} className={`px-2 py-1 text-xs rounded border transition-colors italic ${selectedText.fontStyle === 'italic' ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>I</button>
                  </div>
                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button key={align} onClick={() => updateText(selectedText.id, { textAlign: align })} className={`px-2 py-1 text-xs rounded border transition-colors ${(selectedText.textAlign ?? 'left') === align ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} title={`Align ${align}`}>
                        {align === 'left' ? '⫷' : align === 'center' ? '⫶' : '⫸'}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <span className="text-xs text-slate-500">X</span>
                      <input type="number" value={Math.round(selectedText.x)} onChange={(e) => updateText(selectedText.id, { x: Number(e.target.value) })} className="!py-1 !text-xs" />
                    </label>
                    <label className="flex-1">
                      <span className="text-xs text-slate-500">Y</span>
                      <input type="number" value={Math.round(selectedText.y)} onChange={(e) => updateText(selectedText.id, { y: Number(e.target.value) })} className="!py-1 !text-xs" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 last:border-b-0">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {children}
    </div>
  );
}
