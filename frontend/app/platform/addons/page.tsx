"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch } from '../../../lib/api'

interface AddonDefinition {
  id: string
  key: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  price: number | null
  priceNote: string | null
  isActive: boolean
  createdAt: string
}

interface FormState {
  name: string
  description: string
  category: string
  icon: string
  price: string
  priceNote: string
}

const EMPTY_FORM: FormState = { name: '', description: '', category: '', icon: '', price: '', priceNote: '' }

function priceLabel(a: AddonDefinition): string {
  if (a.price == null) return 'No price set'
  return `$${a.price}${a.priceNote ? ` ${a.priceNote}` : ''}`
}

function EditForm({ addon, onCancel, onSaved }: { addon: AddonDefinition; onCancel: () => void; onSaved: (a: AddonDefinition) => void }) {
  const [form, setForm] = useState<FormState>({
    name: addon.name,
    description: addon.description ?? '',
    category: addon.category ?? '',
    icon: addon.icon ?? '',
    price: addon.price != null ? String(addon.price) : '',
    priceNote: addon.priceNote ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/addon-directory/${addon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description,
          category: form.category,
          icon: form.icon,
          price: form.price.trim() === '' ? null : Number(form.price),
          priceNote: form.priceNote,
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
    <div className="space-y-3 pt-3 border-t border-slate-100">
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
          <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Attendance" className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Icon (emoji)</label>
          <input type="text" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="✨" className="w-full text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Price ($)</label>
            <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="29" className="w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Price note</label>
            <input type="text" value={form.priceNote} onChange={e => setForm({ ...form, priceNote: e.target.value })} placeholder="/month" className="w-full text-sm" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full text-sm" />
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
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">{addon.icon || '🧩'}</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{addon.name}</span>
              <code className="text-[10px] text-slate-400">{addon.key}</code>
              {addon.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{addon.category}</span>}
              {!addon.isActive && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Retired</span>}
            </div>
            {addon.description && <p className="text-xs text-slate-500 mt-1">{addon.description}</p>}
            <p className="text-xs font-medium text-slate-600 mt-1">{priceLabel(addon)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setEditing(!editing)} className="btn-outline btn-sm">{editing ? 'Close' : 'Edit'}</button>
          <button onClick={toggleActive} disabled={busy} className="btn-outline btn-sm disabled:opacity-50">
            {addon.isActive ? 'Retire' : 'Reactivate'}
          </button>
          <button onClick={remove} disabled={busy} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Delete</button>
        </div>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
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
          name: form.name.trim(),
          description: form.description || undefined,
          category: form.category || undefined,
          icon: form.icon || undefined,
          price: form.price.trim() === '' ? undefined : Number(form.price),
          priceNote: form.priceNote || undefined,
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

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary text-sm px-4 py-2.5 rounded-xl w-fit">
        + New Add-on
      </button>
    )
  }

  return (
    <div className="card p-5 space-y-3 border-2 border-indigo-100">
      <h3 className="text-sm font-semibold text-slate-700">New Add-on Listing</h3>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Face Recognition Attendance" className="w-full text-sm" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
          <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Attendance" className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Icon (emoji)</label>
          <input type="text" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="✨" className="w-full text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Price ($)</label>
            <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="29" className="w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Price note</label>
            <input type="text" value={form.priceNote} onChange={e => setForm({ ...form, priceNote: e.target.value })} placeholder="/month" className="w-full text-sm" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What this add-on does, shown to schools browsing the directory." className="w-full text-sm" />
      </div>
      <p className="text-[11px] text-slate-400">The internal key (e.g. FACE_RECOGNITION_ATTENDANCE) is derived automatically from the name.</p>
      <div className="flex gap-2">
        <button onClick={create} disabled={!form.name.trim() || creating} className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50">
          {creating ? 'Creating…' : 'Create'}
        </button>
        <button onClick={() => { setOpen(false); setForm(EMPTY_FORM) }} className="btn-outline text-sm px-4 py-2 rounded-lg">Cancel</button>
      </div>
    </div>
  )
}

function AddonDirectoryContent() {
  const [addons, setAddons] = useState<AddonDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
          <h1 className="text-2xl font-bold text-slate-800">Add-ons Directory</h1>
          <p className="text-sm text-slate-500 mt-1">The catalog every school browses from its own Add-ons page. Create listings, price them, retire ones no longer sold.</p>
        </div>

        <div className="page-body space-y-4">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}

          <NewAddonForm onCreated={(a) => setAddons(prev => [...prev, a])} />

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : addons.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm">No add-ons listed yet — create the first one above.</div>
          ) : (
            <div className="grid gap-3">
              {addons.map(a => (
                <AddonCard
                  key={a.id}
                  addon={a}
                  onChanged={(updated) => handleChanged(updated, updated ? undefined : a.id)}
                />
              ))}
            </div>
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
