'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import AuthGuard from '../../../../components/AuthGuard'
import Sidebar from '../../../../components/Sidebar'
import { adminNav } from '../../../../lib/admin-nav'
import { apiCursorItems, apiFetch } from '../../../../lib/api'
import { useLanguage } from '../../../../lib/i18n'

interface FieldDefinition { key: string; label: string; labelKey?: string; type: 'text' | 'number' | 'date' | 'boolean'; required?: boolean }
interface MetricDefinition { key: string; label: string; labelKey?: string; aggregate: 'count' | 'sum' | 'average'; field?: string }
type ComponentDefinition =
  | { type: 'stats'; title?: string; titleKey?: string; metrics: MetricDefinition[] }
  | { type: 'form'; title?: string; titleKey?: string; actions?: Array<'create' | 'update'> }
  | { type: 'table'; title?: string; titleKey?: string; columns?: string[]; actions?: Array<'view' | 'edit' | 'delete'>; searchable?: boolean }
  | { type: 'details'; title?: string; titleKey?: string; fields?: string[] }
  | { type: 'chart'; title?: string; titleKey?: string; categoryField: string; valueField: string; aggregate?: 'sum' | 'average' }
interface PageDefinition { key: string; title: string; titleKey?: string; ariaLabel?: string; resource: string; roles: string[]; fields: FieldDefinition[]; components?: ComponentDefinition[] }
interface RuntimePage { extension: { key: string; name: string }; page: PageDefinition; defaultLocale?: string; translations?: Record<string, Record<string, string>> }
interface RuntimeRecord { id: string; data: Record<string, any>; createdAt: string }

async function json(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

function DynamicExtensionPage({ extensionKey, pageKey }: { extensionKey: string; pageKey: string }) {
  const { lang } = useLanguage()
  const [definition, setDefinition] = useState<RuntimePage | null>(null)
  const [records, setRecords] = useState<RuntimeRecord[]>([])
  const [form, setForm] = useState<Record<string, any>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<RuntimeRecord | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const translate = (key: string | undefined, fallback: string) => {
    if (!key || !definition) return fallback
    return definition.translations?.[lang]?.[key]
      || definition.translations?.[definition.defaultLocale || 'en']?.[key]
      || fallback
  }

  async function load() {
    try {
      const page = await json(await apiFetch(`/api/extensions/${extensionKey}/pages/${pageKey}`))
      setDefinition(page)
      setRecords(await apiCursorItems<RuntimeRecord>(`/api/extensions/${extensionKey}/resources/${page.page.resource}`))
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
      const path = `/api/extensions/${extensionKey}/resources/${definition.page.resource}${editingId ? `/${editingId}` : ''}`
      await json(await apiFetch(path, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }))
      setForm({})
      setEditingId(null)
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
      if (selected?.id === recordId) setSelected(null)
      await load()
    } catch (removeError: any) {
      setError(removeError.message || 'Could not delete record')
    }
  }

  const components = useMemo<ComponentDefinition[]>(() => definition?.page.components?.length ? definition.page.components : [
    { type: 'form', actions: ['create', 'update'] },
    { type: 'table', actions: ['view', 'edit', 'delete'], searchable: true },
    { type: 'details' },
  ], [definition])
  const filtered = records.filter(record => !search || JSON.stringify(record.data).toLowerCase().includes(search.toLowerCase()))

  function field(key: string) { return definition?.page.fields.find(candidate => candidate.key === key) }
  function renderForm(component: Extract<ComponentDefinition, { type: 'form' }>) {
    const canUpdate = component.actions?.includes('update') !== false
    return <form onSubmit={submit} className="card p-5 grid md:grid-cols-3 gap-3 items-end" aria-label={translate(component.titleKey, component.title || definition!.page.ariaLabel || definition!.page.title)}>
      <h2 className="md:col-span-3 font-semibold">{translate(component.titleKey, component.title || (editingId ? 'Edit record' : 'Add record'))}</h2>
      {definition!.page.fields.map(item => <label key={item.key} className="text-xs text-slate-600 dark:text-slate-300">{translate(item.labelKey, item.label)}
        {item.type === 'boolean' ? <input aria-label={translate(item.labelKey, item.label)} type="checkbox" checked={!!form[item.key]} onChange={event => setForm({ ...form, [item.key]: event.target.checked })} className="ml-2" /> : <input aria-label={translate(item.labelKey, item.label)} type={item.type === 'number' ? 'number' : item.type === 'date' ? 'date' : 'text'} required={item.required} value={form[item.key] ?? ''} onChange={event => setForm({ ...form, [item.key]: item.type === 'number' ? Number(event.target.value) : event.target.value })} className="input mt-1" />}
      </label>)}
      <div className="flex gap-2"><button disabled={busy || (!!editingId && !canUpdate)} className="btn-primary">{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add record'}</button>{editingId && <button type="button" className="btn-outline" onClick={() => { setEditingId(null); setForm({}) }}>Cancel</button>}</div>
    </form>
  }
  function renderTable(component: Extract<ComponentDefinition, { type: 'table' }>) {
    const columns = component.columns?.map(field).filter(Boolean) as FieldDefinition[] || definition!.page.fields
    const actions = component.actions || ['view']
    return <div className="card overflow-x-auto" aria-label={translate(component.titleKey, component.title || `${definition!.page.title} records`)}>{component.searchable && <div className="p-3"><label className="sr-only" htmlFor="extension-record-search">Search records</label><input id="extension-record-search" className="input max-w-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records" /></div>}<table className="w-full text-sm"><caption className="sr-only">{translate(component.titleKey, component.title || definition!.page.title)}</caption><thead><tr>{columns.map(item => <th key={item.key} scope="col" className="text-left p-3">{translate(item.labelKey, item.label)}</th>)}<th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(record => <tr key={record.id} className="border-t border-slate-100 dark:border-slate-800">{columns.map(item => <td key={item.key} className="p-3 text-slate-700 dark:text-slate-200">{String(record.data[item.key] ?? '')}</td>)}<td className="p-3 text-right whitespace-nowrap">{actions.includes('view') && <button onClick={() => setSelected(record)} className="text-xs text-blue-600 mr-3">View</button>}{actions.includes('edit') && <button onClick={() => { setEditingId(record.id); setForm(record.data) }} className="text-xs text-amber-600 mr-3">Edit</button>}{actions.includes('delete') && <button onClick={() => remove(record.id)} className="text-xs text-red-600">Delete</button>}</td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No records found.</p>}</div>
  }
  function renderStats(component: Extract<ComponentDefinition, { type: 'stats' }>) {
    return <section className="grid md:grid-cols-3 gap-3" aria-label={translate(component.titleKey, component.title || 'Summary')}>{component.metrics.map(metric => { const values = metric.field ? records.map(record => Number(record.data[metric.field!])).filter(Number.isFinite) : []; const value = metric.aggregate === 'count' ? records.length : metric.aggregate === 'sum' ? values.reduce((sum, item) => sum + item, 0) : values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0; return <div key={metric.key} className="stat-card"><p className="text-xs text-slate-500">{translate(metric.labelKey, metric.label)}</p><p className="text-2xl font-bold">{Number(value.toFixed(2))}</p></div> })}</section>
  }
  function renderChart(component: Extract<ComponentDefinition, { type: 'chart' }>) {
    const groups = new Map<string, number[]>()
    for (const record of records) { const category = String(record.data[component.categoryField] ?? 'Unknown'); const values = groups.get(category) || []; values.push(Number(record.data[component.valueField]) || 0); groups.set(category, values) }
    const points = [...groups].map(([label, values]) => ({ label, value: component.aggregate === 'average' ? values.reduce((a, b) => a + b, 0) / values.length : values.reduce((a, b) => a + b, 0) }))
    const max = Math.max(...points.map(point => point.value), 1)
    return <section className="card p-5" aria-label={translate(component.titleKey, component.title || 'Chart')}><h2 className="font-semibold mb-4">{translate(component.titleKey, component.title || 'Chart')}</h2><div className="space-y-3">{points.map(point => <div key={point.label}><div className="flex justify-between text-xs"><span>{point.label}</span><span>{Number(point.value.toFixed(2))}</span></div><div className="h-3 rounded bg-slate-100 dark:bg-slate-800"><div className="h-3 rounded bg-brand-500" style={{ width: `${(point.value / max) * 100}%` }} /></div></div>)}</div></section>
  }

  return <div className="page-shell">
    <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" />
    <main className="page-content" aria-label={definition?.page.ariaLabel || definition?.page.title || 'Extension'}>
      <div className="h-14 lg:hidden" />
      <div className="page-header"><h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{definition ? translate(definition.page.titleKey, definition.page.title) : 'Extension'}</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{definition?.extension.name}</p></div>
      <div className="page-body space-y-5">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {definition && components.map((component, index) => <div key={`${component.type}-${index}`}>{component.type === 'form' ? renderForm(component) : component.type === 'table' ? renderTable(component) : component.type === 'stats' ? renderStats(component) : component.type === 'chart' ? renderChart(component) : component.type === 'details' && selected ? <section className="card p-5" aria-label={translate(component.titleKey, component.title || 'Record details')}><div className="flex justify-between"><h2 className="font-semibold">{translate(component.titleKey, component.title || 'Record details')}</h2><button onClick={() => setSelected(null)} aria-label="Close record details">×</button></div><dl className="grid md:grid-cols-2 gap-3 mt-4">{(component.fields || definition.page.fields.map(item => item.key)).map(key => { const item = field(key); return item ? <div key={key}><dt className="text-xs text-slate-500">{translate(item.labelKey, item.label)}</dt><dd>{String(selected.data[key] ?? '')}</dd></div> : null })}</dl></section> : null}</div>)}
      </div>
    </main>
  </div>
}

export default function ExtensionPage({ params }: { params: { extensionKey: string; pageKey: string } }) {
  return <AuthGuard><DynamicExtensionPage extensionKey={params.extensionKey} pageKey={params.pageKey} /></AuthGuard>
}
