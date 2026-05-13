'use client';

import { CardDesign, LogoElement, TextElement, ShapeElement, PhotoPlaceholder, QrPlaceholder } from './types';

interface LayerItem {
  id: string;
  label: string;
  icon: string;
  type: 'text' | 'logo' | 'shape' | 'photo' | 'qr';
  z: number;
  visible?: boolean;
  locked?: boolean;
}

interface LayersPanelProps {
  design: CardDesign;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDesignChange: (design: CardDesign) => void;
  onArrange: (id: string, mode: 'front' | 'forward' | 'backward' | 'back') => void;
}

export default function LayersPanel({ design, selectedId, onSelect, onDesignChange, onArrange }: LayersPanelProps) {
  // Build flat layer list sorted by z-index descending (top layer = highest z)
  const buildLayers = (): LayerItem[] => {
    const items: LayerItem[] = [
      ...(design.photo
        ? [{ id: '__photo__', label: 'Photo', icon: '👤', type: 'photo' as const, z: design.photo.zIndex ?? 0, visible: (design.photo as PhotoPlaceholder & { visible?: boolean }).visible !== false, locked: (design.photo as PhotoPlaceholder & { locked?: boolean }).locked ?? false }]
        : []),
      ...(design.qr
        ? [{ id: '__qr__', label: 'QR Code', icon: '📱', type: 'qr' as const, z: design.qr.zIndex ?? 0, visible: (design.qr as QrPlaceholder & { visible?: boolean }).visible !== false, locked: (design.qr as QrPlaceholder & { locked?: boolean }).locked ?? false }]
        : []),
      ...(design.shapes ?? []).map((s) => ({
        id: s.id,
        label: s.type === 'rectangle' ? 'Rectangle' : s.type === 'circle' ? 'Circle' : 'Line',
        icon: s.type === 'rectangle' ? '▭' : s.type === 'circle' ? '◯' : '─',
        type: 'shape' as const,
        z: s.zIndex ?? 0,
        visible: (s as ShapeElement & { visible?: boolean }).visible !== false,
        locked: (s as ShapeElement & { locked?: boolean }).locked ?? false,
      })),
      ...design.logos.map((l) => ({
        id: l.id,
        label: l.name || 'Logo',
        icon: '🖼️',
        type: 'logo' as const,
        z: l.zIndex ?? 0,
        visible: (l as LogoElement & { visible?: boolean }).visible !== false,
        locked: (l as LogoElement & { locked?: boolean }).locked ?? false,
      })),
      ...design.texts.map((t) => ({
        id: t.id,
        label: t.content.length > 20 ? t.content.slice(0, 20) + '…' : t.content,
        icon: '✏️',
        type: 'text' as const,
        z: t.zIndex ?? 0,
        visible: (t as TextElement & { visible?: boolean }).visible !== false,
        locked: (t as TextElement & { locked?: boolean }).locked ?? false,
      })),
    ];
    return items.sort((a, b) => b.z - a.z);
  };

  const layers = buildLayers();

  const toggleVisibility = (layer: LayerItem) => {
    if (layer.type === 'text') {
      onDesignChange({
        ...design,
        texts: design.texts.map((t) =>
          t.id === layer.id ? { ...t, visible: !((t as TextElement & { visible?: boolean }).visible !== false) } : t
        ),
      });
    } else if (layer.type === 'logo') {
      onDesignChange({
        ...design,
        logos: design.logos.map((l) =>
          l.id === layer.id ? { ...l, visible: !((l as LogoElement & { visible?: boolean }).visible !== false) } : l
        ),
      });
    } else if (layer.type === 'shape') {
      onDesignChange({
        ...design,
        shapes: (design.shapes ?? []).map((s) =>
          s.id === layer.id ? { ...s, visible: !((s as ShapeElement & { visible?: boolean }).visible !== false) } : s
        ),
      });
    } else if (layer.type === 'photo' && design.photo) {
      onDesignChange({
        ...design,
        photo: { ...design.photo, visible: !((design.photo as PhotoPlaceholder & { visible?: boolean }).visible !== false) } as PhotoPlaceholder,
      });
    } else if (layer.type === 'qr' && design.qr) {
      onDesignChange({
        ...design,
        qr: { ...design.qr, visible: !((design.qr as QrPlaceholder & { visible?: boolean }).visible !== false) } as QrPlaceholder,
      });
    }
  };

  const toggleLock = (layer: LayerItem) => {
    if (layer.type === 'text') {
      onDesignChange({
        ...design,
        texts: design.texts.map((t) =>
          t.id === layer.id ? { ...t, locked: !((t as TextElement & { locked?: boolean }).locked ?? false) } : t
        ),
      });
    } else if (layer.type === 'logo') {
      onDesignChange({
        ...design,
        logos: design.logos.map((l) =>
          l.id === layer.id ? { ...l, locked: !((l as LogoElement & { locked?: boolean }).locked ?? false) } : l
        ),
      });
    } else if (layer.type === 'shape') {
      onDesignChange({
        ...design,
        shapes: (design.shapes ?? []).map((s) =>
          s.id === layer.id ? { ...s, locked: !((s as ShapeElement & { locked?: boolean }).locked ?? false) } : s
        ),
      });
    }
  };

  const deleteLayer = (layer: LayerItem) => {
    if (layer.type === 'text') {
      onDesignChange({ ...design, texts: design.texts.filter((t) => t.id !== layer.id) });
    } else if (layer.type === 'logo') {
      onDesignChange({ ...design, logos: design.logos.filter((l) => l.id !== layer.id) });
    } else if (layer.type === 'shape') {
      onDesignChange({ ...design, shapes: (design.shapes ?? []).filter((s) => s.id !== layer.id) });
    } else if (layer.type === 'photo') {
      onDesignChange({ ...design, photo: null });
    } else if (layer.type === 'qr') {
      onDesignChange({ ...design, qr: null });
    }
  };

  const typeColor: Record<string, string> = {
    text: 'bg-indigo-100 text-indigo-600',
    logo: 'bg-amber-100 text-amber-600',
    shape: 'bg-violet-100 text-violet-600',
    photo: 'bg-blue-100 text-blue-600',
    qr: 'bg-emerald-100 text-emerald-600',
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 select-none" style={{ width: 220 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50">
        <span className="text-base">🗂️</span>
        <span className="text-sm font-semibold text-slate-700">Layers</span>
        <span className="ml-auto text-xs text-slate-400">{layers.length}</span>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <span className="text-3xl mb-2">📋</span>
            <p className="text-xs text-slate-400">No layers yet. Add elements to the canvas.</p>
          </div>
        ) : (
          <div className="py-1">
            {layers.map((layer, idx) => {
              const isSelected = selectedId === layer.id;
              const isHidden = !layer.visible;
              const isLocked = layer.locked ?? false;
              return (
                <div
                  key={layer.id}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'border-l-2 border-transparent hover:bg-slate-50'
                  } ${isHidden ? 'opacity-40' : ''}`}
                  onClick={() => !isLocked && onSelect(isSelected ? null : layer.id)}
                >
                  {/* Layer icon */}
                  <span className="text-sm shrink-0 w-5 text-center">{layer.icon}</span>

                  {/* Label */}
                  <span className={`flex-1 text-xs truncate ${isSelected ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                    {layer.label}
                  </span>

                  {/* Type badge */}
                  <span className={`hidden group-hover:inline text-[9px] px-1 rounded font-medium shrink-0 ${typeColor[layer.type]}`}>
                    {layer.type}
                  </span>

                  {/* Lock toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLock(layer); }}
                    title={isLocked ? 'Unlock' : 'Lock'}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[11px] transition-colors ${
                      isLocked ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isLocked ? '🔒' : '🔓'}
                  </button>

                  {/* Visibility toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(layer); }}
                    title={isHidden ? 'Show' : 'Hide'}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[11px] transition-colors ${
                      isHidden ? 'text-slate-300' : 'text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isHidden ? '🙈' : '👁️'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection actions */}
      {selectedId && (
        <div className="border-t border-slate-200 p-2 bg-slate-50">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">Arrange</div>
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => onArrange(selectedId, 'front')}
              title="Bring to Front"
              className="py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >⤒</button>
            <button
              onClick={() => onArrange(selectedId, 'forward')}
              title="Move Forward"
              className="py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >↑</button>
            <button
              onClick={() => onArrange(selectedId, 'backward')}
              title="Move Backward"
              className="py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >↓</button>
            <button
              onClick={() => onArrange(selectedId, 'back')}
              title="Send to Back"
              className="py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >⤓</button>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <button
              onClick={() => {
                const layer = layers.find((l) => l.id === selectedId);
                if (layer) toggleVisibility(layer);
              }}
              className="py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Toggle Vis
            </button>
            <button
              onClick={() => {
                const layer = layers.find((l) => l.id === selectedId);
                if (layer) deleteLayer(layer);
                onSelect(null);
              }}
              className="py-1.5 rounded-lg border border-red-200 text-[11px] text-red-500 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
