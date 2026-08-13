"use client"

import { useCallback, useEffect, useState } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { apiFetch } from '../../../lib/api'
import { platformNav } from '../../../lib/platform-nav'

type Snapshot = {
  api: { requests: number; requestsPerMinute: number; errors: number; errorRate: number; availability: number; averageLatencyMs: number; p95LatencyMs: number; maxLatencyMs: number; saturation: { inFlight: number; peakInFlight: number; heapUsedBytes: number; rssBytes: number }; windowMinutes: number }
  dependencies: Record<string, { status: string; latencyMs: number | null; activeConnections?: number; totalConnections?: number; maxConnections?: number }>
  queues: Array<{ queue: string; status?: string; depth?: number; oldestJobAgeMs?: number; workers?: number; counts?: Record<string, number>; error?: string }>
  usage: { schools: Array<{ id: string; subdomain: string; extensionDataBytes: number; extensionDataRecords: number }>; extensions: Array<{ id: string; schoolId: string; dataBytes: number; dataRecords: number; extension: { key: string; name: string } }> }
  generatedAt: string
}

const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`
const duration = (value = 0) => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`

function Status({ value }: { value: string }) {
  const healthy = value === 'healthy'
  return <span className={`text-xs font-semibold rounded-full px-2 py-1 ${healthy ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>{value}</span>
}

function ObservabilityContent() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setError('')
    try {
      const response = await apiFetch('/api/platform/observability?minutes=60')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setSnapshot(await response.json())
    } catch { setError('Unable to load observability snapshot') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer) }, [load])

  const cards = snapshot ? [
    ['Availability', `${snapshot.api.availability}%`], ['Requests/min', String(snapshot.api.requestsPerMinute)],
    ['Error rate', `${snapshot.api.errorRate}%`], ['P95 latency', duration(snapshot.api.p95LatencyMs)],
    ['In flight', String(snapshot.api.saturation.inFlight)], ['Memory RSS', bytes(snapshot.api.saturation.rssBytes)],
  ] : []

  return <div className="page-shell">
    <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
    <main className="page-content">
      <div className="h-14 lg:hidden" />
      <header className="page-header flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Observability</h1><p className="text-sm text-slate-500 mt-1">API RED signals, dependencies, workers, queues, and extension resource consumers.</p></div><button className="btn-outline btn-sm" onClick={() => void load()}>Refresh</button></header>
      <div className="page-body space-y-6">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        {loading && !snapshot ? <div className="card p-10 text-center text-slate-500">Loading telemetry…</div> : snapshot && <>
          <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">{cards.map(([label, value]) => <div className="card p-4" key={label}><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{value}</p></div>)}</section>
          <section className="grid xl:grid-cols-2 gap-5">
            <div className="card p-5"><h2 className="font-bold text-lg mb-4">Dependencies</h2><div className="space-y-3">{Object.entries(snapshot.dependencies).map(([name, item]) => <div key={name} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><div><p className="font-semibold capitalize">{name}</p><p className="text-xs text-slate-500">{item.latencyMs === null ? 'Not configured' : `${duration(item.latencyMs)} probe`}{item.totalConnections !== undefined ? ` · ${item.totalConnections}/${item.maxConnections} DB connections` : ''}</p></div><Status value={item.status} /></div>)}</div></div>
            <div className="card p-5"><h2 className="font-bold text-lg mb-4">Queues and workers</h2><div className="space-y-3">{snapshot.queues.map(queue => <div key={queue.queue} className="border-b border-slate-100 dark:border-slate-800 pb-3"><div className="flex justify-between"><p className="font-semibold">{queue.queue}</p><Status value={queue.status || (queue.workers ? 'healthy' : 'unhealthy')} /></div><p className="text-xs text-slate-500 mt-1">Depth {queue.depth ?? '—'} · Workers {queue.workers ?? 0} · Oldest {duration(queue.oldestJobAgeMs)}</p></div>)}</div></div>
          </section>
          <section className="grid xl:grid-cols-2 gap-5">
            <div className="card p-5"><h2 className="font-bold text-lg mb-4">Top schools by extension data</h2>{snapshot.usage.schools.map(school => <div key={school.id} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800"><span>{school.subdomain}</span><span className="text-sm text-slate-500">{bytes(school.extensionDataBytes)} · {school.extensionDataRecords} records</span></div>)}</div>
            <div className="card p-5"><h2 className="font-bold text-lg mb-4">Top extension installations</h2>{snapshot.usage.extensions.map(item => <div key={item.id} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800"><span>{item.extension.name} <small className="text-slate-400">{item.extension.key}</small></span><span className="text-sm text-slate-500">{bytes(item.dataBytes)} · {item.dataRecords} records</span></div>)}</div>
          </section>
          <p className="text-xs text-slate-400">60-minute distributed window · refreshed {new Date(snapshot.generatedAt).toLocaleString()}</p>
        </>}
      </div>
    </main>
  </div>
}

export default function ObservabilityPage() { return <AuthGuard requiredRole="PLATFORM_ADMIN"><ObservabilityContent /></AuthGuard> }
