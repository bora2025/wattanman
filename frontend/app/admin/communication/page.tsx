"use client"

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { formatCambodiaTime } from '../../../lib/dateUtils'

type Tab = 'inbox' | 'broadcast' | 'history'

interface Message {
  id: string; content: string; createdAt: string; readAt: string | null
  sender: { id: string; name: string; photo: string | null }
  receiver: { id: string; name: string }
}
interface InboxItem { partner: { id: string; name: string; photo: string | null; role: string }; lastMessage: Message }
interface Contact { id: string; name: string; role: string }
interface Announcement {
  id: string; title: string; body: string; audience: string
  targetRole: string | null; classId: string | null; channels: string
  pinned: boolean; scheduledAt: string | null; sentAt: string | null; createdAt: string
  author: { id: string; name: string; role: string }
  class: { id: string; name: string } | null
  _count: { reads: number }
}
interface ClassRow { id: string; name: string }

interface BroadcastForm {
  title: string
  body: string
  audience: 'SCHOOL' | 'ROLE' | 'CLASS'
  targetRole: 'PARENT' | 'TEACHER' | 'STUDENT' | 'ALL'
  classId: string
  channelInApp: boolean
  channelEmail: boolean
  channelSms: boolean
  pinned: boolean
  scheduledAt: string
}

export default function AdminCommunicationPage() {
  const [tab, setTab] = useState<Tab>('inbox')

  return (
    <AuthGuard requiredRole="ADMIN">
      <div className="page-shell">
        <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
        <div className="page-content">
          <div className="h-14 lg:hidden" />
          <div className="page-header">
            <h1 className="text-2xl font-bold text-slate-800">Communication Hub</h1>
            <p className="text-sm text-slate-500 mt-1">
              Direct messages, school-wide broadcasts, and audit log.
            </p>
          </div>
          <div className="page-body">
            <div className="flex gap-1 border-b border-slate-200 mb-6">
              {([
                ['inbox', 'Inbox'],
                ['broadcast', 'New Broadcast'],
                ['history', 'History'],
              ] as [Tab, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                    tab === id
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'inbox' && <InboxTab />}
            {tab === 'broadcast' && <BroadcastTab />}
            {tab === 'history' && <HistoryTab />}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}

// ─── Inbox tab — admin can DM anyone (uses existing /api/messages) ──────────
function InboxTab() {
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'TEACHER' | 'PARENT' | 'STUDENT'>('ALL')
  const qc = useQueryClient()

  const { data: inbox = [] } = useQuery<InboxItem[]>({
    queryKey: ['admin-inbox'],
    queryFn: async () => { const r = await apiFetch('/api/messages/inbox'); if (!r.ok) throw new Error(); return r.json() },
  })
  // Admin reuses teachers + parents/students endpoints to compose contact list
  const { data: teachers = [] } = useQuery<Contact[]>({
    queryKey: ['admin-msg-teachers'],
    queryFn: async () => { const r = await apiFetch('/api/messages/teachers'); if (!r.ok) throw new Error(); return r.json() },
  })
  const { data: parentsStudents = [] } = useQuery<Contact[]>({
    queryKey: ['admin-msg-ps'],
    queryFn: async () => { const r = await apiFetch('/api/messages/parents-students'); if (!r.ok) throw new Error(); return r.json() },
  })
  const contacts = [...teachers, ...parentsStudents]
  const filtered = contacts
    .filter(c => filter === 'ALL' || c.role === filter)
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  const { data: conversation = [] } = useQuery<Message[]>({
    queryKey: ['admin-conv', partnerId],
    queryFn: async () => { const r = await apiFetch(`/api/messages/conversation/${partnerId}`); if (!r.ok) throw new Error(); return r.json() },
    enabled: !!partnerId,
  })

  const sendMutation = useMutation({
    mutationFn: (data: { receiverId: string; content: string }) =>
      apiFetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-conv', partnerId] }); qc.invalidateQueries({ queryKey: ['admin-inbox'] }) },
  })
  const markRead = useMutation({
    mutationFn: (pid: string) => apiFetch(`/api/messages/read/${pid}`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-inbox'] }),
  })

  const { register, handleSubmit, reset } = useForm<{ content: string }>()
  const onSend = (data: { content: string }) => {
    if (!partnerId || !data.content?.trim()) return
    sendMutation.mutate({ receiverId: partnerId, content: data.content.trim() })
    reset()
  }
  const onPick = (id: string) => { setPartnerId(id); markRead.mutate(id); setShowPicker(false); setSearch('') }
  const partner = inbox.find(i => i.partner.id === partnerId)?.partner ?? contacts.find(c => c.id === partnerId)

  return (
    <div className="card overflow-hidden flex h-[70vh]">
      <div className="w-72 border-r border-slate-200 flex flex-col bg-slate-50">
        <div className="p-3 border-b border-slate-200">
          <button onClick={() => setShowPicker(s => !s)} className="w-full text-sm text-indigo-600 font-medium hover:underline">
            + New Message
          </button>
          {showPicker && (
            <div className="mt-2 bg-white rounded border border-slate-200 p-2">
              <input
                type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full text-xs border rounded px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <div className="flex gap-1 mb-2 flex-wrap">
                {(['ALL', 'TEACHER', 'PARENT', 'STUDENT'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}>
                    {f === 'ALL' ? 'All' : f}
                  </button>
                ))}
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filtered.slice(0, 50).map(c => (
                  <button key={c.id} onClick={() => onPick(c.id)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    <span className="text-[9px] font-bold text-slate-400">{c.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {inbox.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-6 text-center">No conversations yet.</p>
          )}
          {inbox.map(item => {
            const unread = !item.lastMessage.readAt && item.lastMessage.sender.id === item.partner.id
            return (
              <button key={item.partner.id} onClick={() => onPick(item.partner.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${partnerId === item.partner.id ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-white'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate ${unread ? 'font-bold text-slate-800' : 'font-medium'}`}>{item.partner.name}</p>
                  {unread && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                </div>
                <p className="text-xs truncate text-slate-400">{item.lastMessage.content}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!partnerId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-4xl mb-3">💬</p>
              <p>Select a conversation or start a new one</p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-3">
              <p className="font-semibold text-slate-800">{partner?.name ?? 'Chat'}</p>
              <p className="text-xs text-slate-400">{partner?.role ?? ''}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50">
              {conversation.length === 0 && (
                <p className="text-center text-sm text-slate-400 mt-8">No messages yet.</p>
              )}
              {conversation.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender.id === partnerId ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-md px-4 py-2 rounded-2xl text-sm ${msg.sender.id === partnerId ? 'bg-white border border-slate-200 text-slate-800' : 'bg-indigo-600 text-white'}`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender.id === partnerId ? 'text-slate-400' : 'text-indigo-200'}`}>
                      {formatCambodiaTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSubmit(onSend)} className="bg-white border-t border-slate-200 p-4 flex gap-3">
              <input {...register('content', { required: true })} autoComplete="off"
                placeholder="Type a message…"
                className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button type="submit" disabled={sendMutation.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
                {sendMutation.isPending ? '...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Broadcast tab — compose announcement to school / role / class ──────────
function BroadcastTab() {
  const qc = useQueryClient()
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<BroadcastForm>({
    defaultValues: {
      audience: 'SCHOOL', targetRole: 'ALL', classId: '',
      channelInApp: true, channelEmail: false, channelSms: false,
      pinned: false, scheduledAt: '', title: '', body: '',
    },
  })
  const audience = watch('audience')

  const { data: classes = [] } = useQuery<ClassRow[]>({
    queryKey: ['admin-classes-list'],
    queryFn: async () => { const r = await apiFetch('/api/classes'); if (!r.ok) return []; return r.json() },
  })

  const create = useMutation({
    mutationFn: async (form: BroadcastForm) => {
      const channels: string[] = []
      if (form.channelInApp) channels.push('IN_APP')
      if (form.channelEmail) channels.push('EMAIL')
      if (form.channelSms) channels.push('SMS')
      const body: any = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        channels,
        pinned: form.pinned,
      }
      if (form.audience === 'ROLE') body.targetRole = form.targetRole
      if (form.audience === 'CLASS') body.classId = form.classId
      if (form.scheduledAt) body.scheduledAt = new Date(form.scheduledAt).toISOString()
      const r = await apiFetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error('Failed to send')
      return r.json()
    },
    onSuccess: () => {
      reset()
      qc.invalidateQueries({ queryKey: ['admin-announcements'] })
    },
  })

  return (
    <form onSubmit={handleSubmit(d => create.mutate(d))} className="card p-6 max-w-3xl">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Compose Broadcast</h3>

      <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
      <input {...register('title', { required: 'Title required', maxLength: 120 })}
        className="w-full border rounded-lg px-3 py-2 mb-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      {errors.title && <p className="text-xs text-red-600 mb-2">{errors.title.message}</p>}

      <label className="block text-sm font-medium text-slate-700 mb-1 mt-3">Message</label>
      <textarea rows={5} {...register('body', { required: 'Message required' })}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      {errors.body && <p className="text-xs text-red-600 mb-2">{errors.body.message}</p>}

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Audience</label>
          <select {...register('audience')}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="SCHOOL">Entire school</option>
            <option value="ROLE">By role</option>
            <option value="CLASS">Specific class</option>
          </select>
        </div>
        {audience === 'ROLE' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select {...register('targetRole')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="ALL">All staff & families</option>
              <option value="PARENT">Parents only</option>
              <option value="TEACHER">Teachers only</option>
              <option value="STUDENT">Students only</option>
            </select>
          </div>
        )}
        {audience === 'CLASS' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
            <select {...register('classId', { required: audience === 'CLASS' })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">— select class —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700 mb-1">Delivery channels</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...register('channelInApp')} className="h-4 w-4" />
            In-app
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...register('channelEmail')} className="h-4 w-4" />
            Email <span className="text-xs text-slate-400">(SendGrid)</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...register('channelSms')} className="h-4 w-4" />
            SMS <span className="text-xs text-amber-600">(billable — Twilio)</span>
          </label>
        </div>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" {...register('pinned')} className="h-4 w-4" />
          Pin to top of feed
        </label>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Schedule (optional)</label>
          <input type="datetime-local" {...register('scheduledAt')}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>

      {create.isError && (
        <p className="mt-3 text-sm text-red-600">Failed to send broadcast.</p>
      )}
      {create.isSuccess && (
        <p className="mt-3 text-sm text-emerald-600">Broadcast sent.</p>
      )}

      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={create.isPending} className="btn-primary disabled:opacity-60">
          {create.isPending ? 'Sending…' : 'Send broadcast'}
        </button>
        <button type="button" onClick={() => reset()} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          Reset
        </button>
      </div>
    </form>
  )
}

// ─── History tab — audit log of past broadcasts ─────────────────────────────
function HistoryTab() {
  const qc = useQueryClient()
  const { data: list = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ['admin-announcements'],
    queryFn: async () => { const r = await apiFetch('/api/announcements/all'); if (!r.ok) throw new Error(); return r.json() },
  })
  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-announcements'] }),
  })

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (list.length === 0) return <p className="text-sm text-slate-400">No broadcasts yet.</p>

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left">Title</th>
            <th className="px-4 py-2 text-left">Audience</th>
            <th className="px-4 py-2 text-left">Channels</th>
            <th className="px-4 py-2 text-left">Author</th>
            <th className="px-4 py-2 text-left">Sent</th>
            <th className="px-4 py-2 text-left">Reads</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {list.map(a => (
            <tr key={a.id} className="border-t border-slate-100">
              <td className="px-4 py-2">
                <div className="font-medium text-slate-800 flex items-center gap-2">
                  {a.pinned && <span className="text-amber-500" title="Pinned">📌</span>}
                  {a.title}
                </div>
                <p className="text-xs text-slate-400 truncate max-w-md">{a.body}</p>
              </td>
              <td className="px-4 py-2 text-slate-600">
                {a.audience === 'SCHOOL' && 'School'}
                {a.audience === 'ROLE' && `Role: ${a.targetRole}`}
                {a.audience === 'CLASS' && `Class: ${a.class?.name ?? '—'}`}
              </td>
              <td className="px-4 py-2 text-xs text-slate-600">{a.channels}</td>
              <td className="px-4 py-2 text-slate-600">{a.author.name}</td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {a.sentAt ? formatCambodiaTime(a.sentAt) : a.scheduledAt ? `⏰ ${formatCambodiaTime(a.scheduledAt)}` : '—'}
              </td>
              <td className="px-4 py-2 text-slate-600">{a._count.reads}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => { if (confirm('Delete this broadcast?')) del.mutate(a.id) }}
                  className="text-xs text-red-600 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
