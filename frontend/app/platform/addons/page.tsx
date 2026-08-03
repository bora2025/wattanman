"use client"

import { useEffect, useRef, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch } from '../../../lib/api'
import { THEME_FONTS, ThemeFont } from '../../../lib/appearance/themeFonts'
import { THEME_RADIUS_PRESETS, ThemeRadius } from '../../../lib/appearance/themeRadius'
import { uploadThemePackage } from '../../../lib/appearance/themePackage'
import { parseAddonPackageZip, uploadAddonPackage } from '../../../lib/addonPackage'

interface ThemeConfig {
  mode: 'light' | 'dark'
  primaryColor: string
  secondaryColor: string
  font: ThemeFont
  radius: ThemeRadius
  customCss?: string
}

interface AddonDefinition {
  id: string
  key: string
  kind: string
  name: string
  description: string | null
  detailDescription: string | null
  screenshotUrl: string | null
  category: string | null
  icon: string | null
  price: number | null
  priceNote: string | null
  themeConfig: ThemeConfig | null
  isActive: boolean
  createdAt: string
}

interface FormState {
  kind: 'MODULE' | 'ADDON' | 'THEME'
  name: string
  description: string
  detailDescription: string
  screenshotUrl: string
  category: string
  icon: string
  price: string
  priceNote: string
  themeMode: 'light' | 'dark'
  themePrimaryColor: string
  themeSecondaryColor: string
  themeFont: ThemeFont
  themeRadius: ThemeRadius
}

const EMPTY_FORM: FormState = {
  kind: 'ADDON', name: '', description: '', detailDescription: '', screenshotUrl: '', category: '', icon: '', price: '', priceNote: '',
  themeMode: 'light', themePrimaryColor: '#4f46e5', themeSecondaryColor: '#0284c7', themeFont: 'inter', themeRadius: 'soft',
}

/** Compress an image File to a JPEG data URL via <canvas>, same technique as
 * the appearance banner uploader (admin/appearance/page.tsx) — this app has
 * no server-side file storage, so uploads live as base64 in the DB. */
function compressImage(file: File, maxW: number, maxH: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW }
        if (h > maxH) { w = Math.round((w * maxH) / h); h = maxH }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Screenshot picker for a module/add-on's detail view — click or drag to
 * upload (compressed client-side), or paste an external URL instead. */
function ScreenshotUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [urlMode, setUrlMode] = useState(!value.startsWith('data:') && value.startsWith('http'))
  const [urlInput, setUrlInput] = useState(value.startsWith('http') ? value : '')
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > 15 * 1024 * 1024) { setError('File is too large. Maximum 15 MB.'); return }
    setError(null)
    setCompressing(true)
    try {
      onChange(await compressImage(file, 1280, 900))
      setUrlMode(false)
    } catch {
      setError('Could not process image. Try a different file.')
    } finally {
      setCompressing(false)
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 group">
          <img src={value} alt="Screenshot preview" className="w-full max-h-56 object-contain bg-slate-50 dark:bg-slate-800" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button type="button" onClick={() => inputRef.current?.click()} className="px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold rounded-lg shadow">Replace</button>
            <button type="button" onClick={() => { onChange(''); setUrlInput('') }} className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg shadow">Remove</button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg cursor-pointer transition-colors ${dragging ? 'border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600'}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
        >
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center gap-1">
            {compressing ? (
              <p className="text-xs text-brand-600 dark:text-brand-400 font-medium">Compressing…</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Click to upload or drag & drop a screenshot</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">JPEG/PNG/WebP — max 15 MB</p>
              </>
            )}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" onClick={() => setUrlMode(m => !m)} className="text-[11px] text-brand-500 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 underline">
        {urlMode ? 'Hide URL input' : 'Or paste an image URL instead'}
      </button>
      {urlMode && (
        <div className="flex gap-2">
          <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://…" className="flex-1 text-sm" />
          <button type="button" onClick={() => urlInput.trim() && onChange(urlInput.trim())} className="btn-outline btn-sm shrink-0">Use URL</button>
        </div>
      )}
    </div>
  )
}

function priceLabel(a: AddonDefinition): string {
  if (a.kind === 'MODULE') return 'Free module'
  if (a.kind === 'THEME' && a.price == null) return 'Free theme'
  if (a.price == null) return 'No price set'
  return `$${a.price}${a.priceNote ? ` ${a.priceNote}` : ''}`
}

/** Kind toggle used by both the create and edit forms — a single small
 * component rather than duplicating the 3-button markup twice. */
function KindToggle({ kind, onChange, moduleLabel, addonLabel }: { kind: FormState['kind']; onChange: (k: FormState['kind']) => void; moduleLabel: string; addonLabel: string }) {
  const options: { id: FormState['kind']; label: string; active: string }[] = [
    { id: 'MODULE', label: moduleLabel, active: 'bg-emerald-600 text-white border-emerald-600' },
    { id: 'ADDON', label: addonLabel, active: 'bg-amber-600 text-white border-amber-600' },
    { id: 'THEME', label: 'Theme', active: 'bg-violet-600 text-white border-violet-600' },
  ]
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${kind === o.id ? o.active : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** THEME-only preset fields (Phase 19) — light/dark, a primary + secondary
 * color (drives both the dashboard and the public site, replacing the old
 * fixed 10-name accent enum), a curated font, and a corner-roundness preset.
 * Shared by the create and edit forms. */
function ThemeConfigFields({ mode, primaryColor, secondaryColor, font, radius, onChange }: {
  mode: 'light' | 'dark'; primaryColor: string; secondaryColor: string; font: ThemeFont; radius: ThemeRadius
  onChange: (next: { mode?: 'light' | 'dark'; primaryColor?: string; secondaryColor?: string; font?: ThemeFont; radius?: ThemeRadius }) => void
}) {
  return (
    <div className="space-y-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900">
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Dashboard mode</label>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map(m => (
            <button key={m} type="button" onClick={() => onChange({ mode: m })}
              className={`text-sm px-3 py-1.5 rounded-lg border font-medium capitalize ${mode === m ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Primary color <span className="font-normal text-slate-400 dark:text-slate-500">(dashboard + site)</span></label>
          <div className="flex items-center gap-2">
            <input type="color" value={primaryColor} onChange={e => onChange({ primaryColor: e.target.value })} className="w-9 h-9 rounded cursor-pointer border border-slate-200 dark:border-slate-700" />
            <input type="text" value={primaryColor} onChange={e => onChange({ primaryColor: e.target.value })} placeholder="#4f46e5" className="w-24 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Secondary color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={secondaryColor} onChange={e => onChange({ secondaryColor: e.target.value })} className="w-9 h-9 rounded cursor-pointer border border-slate-200 dark:border-slate-700" />
            <input type="text" value={secondaryColor} onChange={e => onChange({ secondaryColor: e.target.value })} placeholder="#0284c7" className="w-24 text-sm" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Font</label>
        <div className="flex gap-2 flex-wrap">
          {THEME_FONTS.map(f => (
            <button key={f.id} type="button" onClick={() => onChange({ font: f.id })} style={{ fontFamily: f.previewStyle.replace('font-family: ', '').replace(/;$/, '') }}
              className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${font === f.id ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Corner roundness</label>
        <div className="flex gap-2">
          {THEME_RADIUS_PRESETS.map(r => (
            <button key={r.id} type="button" onClick={() => onChange({ radius: r.id })}
              className={`text-sm px-3 py-1.5 border font-medium ${radius === r.id ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
              style={{ borderRadius: r.radiusBtn }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Upload a real theme package (.zip: style.css + optional local assets) —
 * parsed and validated server-side before its self-contained CSS is stored.
 * Only meaningful once the theme already exists (needs an
 * addonId), so this only ever appears in EditForm, not the create form. */
function ThemePackageUpload({ addonId, currentCss, onUploaded }: { addonId: string; currentCss?: string; onUploaded: (updated: AddonDefinition) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    setError('')
    setSuccess(false)
    try {
      const updated = await uploadThemePackage(addonId, file)
      onUploaded(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e: any) {
      setError(e.message || 'Failed to upload theme package')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Theme package (.zip)</label>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        A .zip with a <code>style.css</code> (plus optional local images/fonts it references) — restyles the dashboard and public site
        on top of the colors/font/radius above. Optional; leave unset to use those alone.
      </p>
      {currentCss && !busy && (
        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">✓ Package uploaded ({(new Blob([currentCss]).size / 1024).toFixed(1)} KB)</p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-outline btn-sm disabled:opacity-50">
          {busy ? 'Uploading…' : currentCss ? 'Replace package' : 'Upload package'}
        </button>
        {success && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Uploaded ✓</span>}
      </div>
      <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

/** Richer catalog authoring, for any listing kind — upload a .zip bundling
 * a screenshot.* and/or a README.md instead of pasting a URL and typing a
 * description by hand. Metadata only, same as ThemePackageUpload's CSS
 * upload is styling-only: this can never add or change what a listing
 * *does*, only what's shown about it. */
function AddonPackageUpload({ addonId, onUploaded }: { addonId: string; onUploaded: (updated: AddonDefinition) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    setError('')
    setSuccess(false)
    try {
      const extracted = await parseAddonPackageZip(file)
      const updated = await uploadAddonPackage(addonId, extracted)
      onUploaded(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e: any) {
      setError(e.message || 'Failed to upload package')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Listing package (.zip)</label>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        A .zip with a <code>screenshot.png</code> and/or a <code>README.md</code> — fills in the screenshot and detail description below
        in one step instead of pasting/typing them. Optional.
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-outline btn-sm disabled:opacity-50">
          {busy ? 'Uploading…' : 'Upload package'}
        </button>
        {success && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Uploaded ✓</span>}
      </div>
      <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function EditForm({ addon, onCancel, onSaved }: { addon: AddonDefinition; onCancel: () => void; onSaved: (a: AddonDefinition) => void }) {
  const [form, setForm] = useState<FormState>({
    kind: addon.kind === 'MODULE' || addon.kind === 'THEME' ? addon.kind : 'ADDON',
    name: addon.name,
    description: addon.description ?? '',
    detailDescription: addon.detailDescription ?? '',
    screenshotUrl: addon.screenshotUrl ?? '',
    category: addon.category ?? '',
    icon: addon.icon ?? '',
    price: addon.price != null ? String(addon.price) : '',
    priceNote: addon.priceNote ?? '',
    themeMode: addon.themeConfig?.mode ?? 'light',
    themePrimaryColor: addon.themeConfig?.primaryColor ?? '#4f46e5',
    themeSecondaryColor: addon.themeConfig?.secondaryColor ?? '#0284c7',
    themeFont: addon.themeConfig?.font ?? 'inter',
    themeRadius: addon.themeConfig?.radius ?? 'soft',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customCss, setCustomCss] = useState(addon.themeConfig?.customCss)

  const kindChanged = form.kind !== addon.kind

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/addon-directory/${addon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          kind: form.kind,
          description: form.description,
          detailDescription: form.detailDescription,
          screenshotUrl: form.screenshotUrl,
          category: form.category,
          icon: form.icon,
          price: form.kind === 'MODULE' ? null : (form.price.trim() === '' ? null : Number(form.price)),
          priceNote: form.kind === 'MODULE' ? '' : form.priceNote,
          themeConfig: form.kind === 'THEME' ? { mode: form.themeMode, primaryColor: form.themePrimaryColor, secondaryColor: form.themeSecondaryColor, font: form.themeFont, radius: form.themeRadius } : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onSaved(data)
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Kind</label>
        <KindToggle kind={form.kind} onChange={(kind) => setForm({ ...form, kind })} moduleLabel="Module (free)" addonLabel="Paid add-on" />
        {kindChanged && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5 mt-2">
            {form.kind === 'ADDON' || (form.kind === 'THEME' && form.price.trim() !== '')
              ? 'Schools that already have this enabled keep it, free, with no change — only new schools (and anyone requesting it fresh) will see it as paid going forward.'
              : 'Every school (including ones with a pending paid request) can now self-enable it for free from their own Add-ons page — nothing turns on by itself, but no approval is needed anymore either.'}
          </p>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
          <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Attendance" className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Icon (emoji)</label>
          <input type="text" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="✨" className="w-full text-sm" />
        </div>
        {form.kind !== 'MODULE' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Price ($, blank = free)</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="29" className="w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Price note</label>
              <input type="text" value={form.priceNote} onChange={e => setForm({ ...form, priceNote: e.target.value })} placeholder="/month" className="w-full text-sm" />
            </div>
          </div>
        )}
      </div>
      {form.kind === 'THEME' && (
        <ThemeConfigFields
          mode={form.themeMode} primaryColor={form.themePrimaryColor} secondaryColor={form.themeSecondaryColor} font={form.themeFont} radius={form.themeRadius}
          onChange={(next) => setForm({
            ...form,
            ...(next.mode !== undefined && { themeMode: next.mode }),
            ...(next.primaryColor !== undefined && { themePrimaryColor: next.primaryColor }),
            ...(next.secondaryColor !== undefined && { themeSecondaryColor: next.secondaryColor }),
            ...(next.font !== undefined && { themeFont: next.font }),
            ...(next.radius !== undefined && { themeRadius: next.radius }),
          })}
        />
      )}
      {form.kind === 'THEME' && (
        <ThemePackageUpload
          addonId={addon.id}
          currentCss={customCss}
          onUploaded={(updated) => { setCustomCss(updated.themeConfig?.customCss); onSaved(updated) }}
        />
      )}
      <AddonPackageUpload
        addonId={addon.id}
        onUploaded={(updated) => {
          setForm(f => ({
            ...f,
            ...(updated.screenshotUrl !== undefined && { screenshotUrl: updated.screenshotUrl ?? '' }),
            ...(updated.detailDescription !== undefined && { detailDescription: updated.detailDescription ?? '' }),
          }))
          onSaved(updated)
        }}
      />
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Description <span className="font-normal text-slate-400 dark:text-slate-500">(short, shown in listing cards)</span></label>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Detail description <span className="font-normal text-slate-400 dark:text-slate-500">(long-form, platform admin's own reference)</span></label>
        <textarea value={form.detailDescription} onChange={e => setForm({ ...form, detailDescription: e.target.value })} rows={6} className="w-full text-sm" placeholder="What this module/add-on does, key features, who it's for…" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Screenshot</label>
        <ScreenshotUploader value={form.screenshotUrl} onChange={(v) => setForm({ ...form, screenshotUrl: v })} />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={!form.name.trim() || saving} className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="btn-outline text-sm px-4 py-2 rounded-lg">Cancel</button>
      </div>
    </div>
  )
}

function AddonCard({ addon, onChanged }: { addon: AddonDefinition; onChanged: (a: AddonDefinition | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggleActive() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/addon-directory/${addon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !addon.isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged(data)
    } catch (e: any) {
      setError(e.message || 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${addon.name}" from the directory? This only works if no school has a record of it.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/addon-directory/${addon.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged(null)
    } catch (e: any) {
      setError(e.message || 'Failed to delete')
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 space-y-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shrink-0">{addon.icon || '🧩'}</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{addon.name}</span>
              <code className="text-[10px] text-slate-400 dark:text-slate-500">{addon.key}</code>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                addon.kind === 'MODULE' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                  : addon.kind === 'THEME' ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
              }`}>
                {addon.kind === 'MODULE' ? 'Module' : addon.kind === 'THEME' ? 'Theme' : 'Paid add-on'}
              </span>
              {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-900">{addon.category}</span>}
              {!addon.isActive && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">Deactivated — hidden from new schools</span>}
            </div>
            {addon.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{addon.description}</p>}
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">{priceLabel(addon)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {addon.screenshotUrl && (
            <img src={addon.screenshotUrl} alt={`${addon.name} screenshot`} className="w-20 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          )}
          <button onClick={() => setEditing(!editing)} className="btn-outline btn-sm">{editing ? 'Close' : 'Edit'}</button>
          <button
            onClick={toggleActive}
            disabled={busy}
            title={addon.isActive ? 'Hide from new schools — existing schools keep access' : 'Offer this again to schools that don\'t have it yet'}
            className={`btn btn-sm border ${addon.isActive ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'}`}
          >
            {busy ? '…' : addon.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={remove} disabled={busy} className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50">Delete</button>
        </div>
      </div>
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
      {editing && <EditForm addon={addon} onCancel={() => setEditing(false)} onSaved={(a) => { onChanged(a); setEditing(false) }} />}
    </div>
  )
}

function NewAddonForm({ onCreated }: { onCreated: (a: AddonDefinition) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    setCreating(true)
    setError('')
    try {
      const res = await apiFetch('/api/platform/addon-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: form.kind,
          name: form.name.trim(),
          description: form.description || undefined,
          detailDescription: form.detailDescription || undefined,
          screenshotUrl: form.screenshotUrl || undefined,
          category: form.category || undefined,
          icon: form.icon || undefined,
          price: form.kind === 'MODULE' || form.price.trim() === '' ? undefined : Number(form.price),
          priceNote: form.kind === 'MODULE' ? undefined : (form.priceNote || undefined),
          themeConfig: form.kind === 'THEME' ? { mode: form.themeMode, primaryColor: form.themePrimaryColor, secondaryColor: form.themeSecondaryColor, font: form.themeFont, radius: form.themeRadius } : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onCreated(data)
      setForm(EMPTY_FORM)
      setOpen(false)
    } catch (e: any) {
      setError(e.message || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  function openAs(kind: FormState['kind']) {
    setForm({ ...EMPTY_FORM, kind })
    setOpen(true)
  }

  if (!open) {
    return (
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => openAs('MODULE')} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl w-fit">
          + Add new module
        </button>
        <button onClick={() => openAs('ADDON')} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl w-fit">
          + Add new add-on
        </button>
        <button onClick={() => openAs('THEME')} className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl w-fit">
          + Add new theme
        </button>
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-3 border-2 border-brand-100 dark:border-brand-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">New Listing</h3>
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Kind</label>
        <KindToggle kind={form.kind} onChange={(kind) => setForm({ ...form, kind })} moduleLabel="Module (free, opt-in at school creation)" addonLabel="Paid add-on (billed, enabled later)" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Face Recognition Attendance" className="w-full text-sm" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
          <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Attendance" className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Icon (emoji)</label>
          <input type="text" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="✨" className="w-full text-sm" />
        </div>
        {form.kind !== 'MODULE' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Price ($, blank = free)</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="29" className="w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Price note</label>
              <input type="text" value={form.priceNote} onChange={e => setForm({ ...form, priceNote: e.target.value })} placeholder="/month" className="w-full text-sm" />
            </div>
          </div>
        )}
      </div>
      {form.kind === 'THEME' && (
        <ThemeConfigFields
          mode={form.themeMode} primaryColor={form.themePrimaryColor} secondaryColor={form.themeSecondaryColor} font={form.themeFont} radius={form.themeRadius}
          onChange={(next) => setForm({
            ...form,
            ...(next.mode !== undefined && { themeMode: next.mode }),
            ...(next.primaryColor !== undefined && { themePrimaryColor: next.primaryColor }),
            ...(next.secondaryColor !== undefined && { themeSecondaryColor: next.secondaryColor }),
            ...(next.font !== undefined && { themeFont: next.font }),
            ...(next.radius !== undefined && { themeRadius: next.radius }),
          })}
        />
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Description <span className="font-normal text-slate-400 dark:text-slate-500">(short, shown in listing cards)</span></label>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What this add-on does, shown to schools browsing the directory." className="w-full text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Detail description <span className="font-normal text-slate-400 dark:text-slate-500">(long-form, platform admin's own reference)</span></label>
        <textarea value={form.detailDescription} onChange={e => setForm({ ...form, detailDescription: e.target.value })} rows={5} placeholder="What this module/add-on does, key features, who it's for…" className="w-full text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Screenshot</label>
        <ScreenshotUploader value={form.screenshotUrl} onChange={(v) => setForm({ ...form, screenshotUrl: v })} />
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">The internal key (e.g. FACE_RECOGNITION_ATTENDANCE) is derived automatically from the name.</p>
      <div className="flex gap-2">
        <button onClick={create} disabled={!form.name.trim() || creating} className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50">
          {creating ? 'Creating…' : 'Create'}
        </button>
        <button onClick={() => { setOpen(false); setForm(EMPTY_FORM) }} className="btn-outline text-sm px-4 py-2 rounded-lg">Cancel</button>
      </div>
    </div>
  )
}

const KIND_TABS: { id: 'ALL' | 'MODULE' | 'ADDON' | 'THEME'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'MODULE', label: 'Modules' },
  { id: 'ADDON', label: 'Add-ons' },
  { id: 'THEME', label: 'Themes' },
]

function AddonDirectoryContent() {
  const [addons, setAddons] = useState<AddonDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kindFilter, setKindFilter] = useState<'ALL' | 'MODULE' | 'ADDON' | 'THEME'>('ALL')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/platform/addon-directory')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAddons(await res.json())
    } catch {
      setError('Failed to load the add-ons directory')
    } finally {
      setLoading(false)
    }
  }

  function handleChanged(updated: AddonDefinition | null, id?: string) {
    if (updated) {
      setAddons(prev => prev.map(a => a.id === updated.id ? updated : a))
    } else if (id) {
      setAddons(prev => prev.filter(a => a.id !== id))
    }
  }

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Modules &amp; Add-ons Directory</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Free modules are offered at school creation; paid add-ons and themes are browsed and billed per school afterward. Create listings, price the paid ones, retire ones no longer offered.</p>
        </div>

        <div className="page-body space-y-4">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>}

          <NewAddonForm onCreated={(a) => setAddons(prev => [...prev, a])} />

          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
            {KIND_TABS.map(t => (
              <button key={t.id} onClick={() => setKindFilter(t.id)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${kindFilter === t.id ? 'border-slate-700 dark:border-slate-400 text-slate-800 dark:text-slate-100' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                {t.label}
                {t.id !== 'ALL' && <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">{addons.filter(a => a.kind === t.id).length}</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : addons.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No add-ons listed yet — create the first one above.</div>
          ) : (
            (() => {
              const filtered = kindFilter === 'ALL' ? addons : addons.filter(a => a.kind === kindFilter)
              return filtered.length === 0 ? (
                <div className="card p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No {KIND_TABS.find(t => t.id === kindFilter)?.label.toLowerCase()} yet.</div>
              ) : (
                <div className="grid gap-3">
                  {filtered.map(a => (
                    <AddonCard
                      key={a.id}
                      addon={a}
                      onChanged={(updated) => handleChanged(updated, updated ? undefined : a.id)}
                    />
                  ))}
                </div>
              )
            })()
          )}
        </div>
      </div>
    </div>
  )
}

export default function AddonDirectoryPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <AddonDirectoryContent />
    </AuthGuard>
  )
}
