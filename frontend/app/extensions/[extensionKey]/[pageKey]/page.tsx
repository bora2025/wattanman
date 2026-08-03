'use client'

import { FormEvent, useEffect, useState } from 'react'
import AuthGuard from '../../../../components/AuthGuard'
import Sidebar from '../../../../components/Sidebar'
import { adminNav } from '../../../../lib/admin-nav'
import { apiFetch } from '../../../../lib/api'

interface FieldDefinition { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean'; required?: boolean }
interface PageDefinition { key: string; title: string; resource: string; roles: string[]; fields: FieldDefinition[] }
interface RuntimePage { extension: { key: string; name: string }; page: PageDefinition }
interface RuntimeRecord { id: string; data: Record<string, any>; createdAt: string }

async function json(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

function DynamicExtensionPage({ extensionKey, pageKey }: { extensionKey: string; pageKey: string }) {
  const [definition, setDefinition] = useState<RuntimePage | null>(null)
  const [records, setRecords] = useState<RuntimeRecord[]>([])
  const [form, setForm] = useState<Record<string, any>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const page = await json(await apiFetch(`/api/extensions/${extensionKey}/pages/${pageKey}`))
      setDefinition(page)
      setRecords(await json(await apiFetch(`/api/extensions/${extensionKey}/resources/${page.page.resource}`)))
      setError('')
    } catch (loadError: any) {
      setError(loadError.message || 'Extension page unavailable')
    }
  }

  useEffect(() => { load() }, [extensionKey, pageKey])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!definition) return
    setBusy(true)
    try {
      await json(await apiFetch(`/api/extensions/${extensionKey}/resources/${definition.page.resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }))
      setForm({})
      await load()
    } catch (submitError: any) {
      setError(submitError.message || 'Could not save record')
    } finally {
      setBusy(false)
    }
  }

  async function remove(recordId: string) {
    if (!definition || !confirm('Delete this record?')) return
    try {
      await json(await apiFetch(`/api/extensions/${extensionKey}/resources/${definition.page.resource}/${recordId}`, { method: 'DELETE' }))
      await load()
    } catch (removeError: any) {
      setError(removeError.message || 'Could not delete record')
    }
  }

  return <div className="page-shell">
    <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" />
    <div className="page-content">
      <div className="h-14 lg:hidden" />
      <div className="page-header"><h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{definition?.page.title || 'Extension'}</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{definition?.extension.name}</p></div>
      <div className="page-body space-y-5">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {definition && <>
          <form onSubmit={submit} className="card p-5 grid md:grid-cols-3 gap-3 items-end">
            {definition.page.fields.map(field => <label key={field.key} className="text-xs text-slate-600 dark:text-slate-300">{field.label}
              {field.type === 'boolean' ? <input type="checkbox" checked={!!form[field.key]} onChange={event => setForm({ ...form, [field.key]: event.target.checked })} className="ml-2" /> : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value })} className="input mt-1" />}
            </label>)}
            <button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Add record'}</button>
          </form>
          <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr>{definition.page.fields.map(field => <th key={field.key} className="text-left p-3">{field.label}</th>)}<th className="p-3" /></tr></thead><tbody>{records.map(record => <tr key={record.id} className="border-t border-slate-100 dark:border-slate-800">{definition.page.fields.map(field => <td key={field.key} className="p-3 text-slate-700 dark:text-slate-200">{String(record.data[field.key] ?? '')}</td>)}<td className="p-3 text-right"><button onClick={() => remove(record.id)} className="text-xs text-red-600">Delete</button></td></tr>)}</tbody></table>{records.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No records yet.</p>}</div>
        </>}
      </div>
    </div>
  </div>
}

export default function ExtensionPage({ params }: { params: { extensionKey: string; pageKey: string } }) {
  return <AuthGuard><DynamicExtensionPage extensionKey={params.extensionKey} pageKey={params.pageKey} /></AuthGuard>
}
