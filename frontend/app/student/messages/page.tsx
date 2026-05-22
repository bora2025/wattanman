"use client"

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { apiFetch, getCurrentUser } from '../../../lib/api'
import { formatCambodiaTime } from '../../../lib/dateUtils'
import { useMessageSocket } from '../../../lib/messageSocket'

const studentNav = [
  { label: 'nav.dashboard', href: '/student', icon: 'dashboard' },
  { label: 'Assignments', href: '/student/assignments', icon: 'book' },
  { label: 'My Scores', href: '/student/scores', icon: 'chart' },
  { label: 'Exams', href: '/student/exams', icon: 'clipboard' },
  { label: 'Messages', href: '/student/messages', icon: 'clipboard' },
  { label: 'My Parent', href: '/student/parent', icon: 'users' },
]

interface Message { id: string; content: string; createdAt: string; readAt: string | null; sender: { id: string; name: string; photo: string | null }; receiver: { id: string; name: string } }
interface Inbox { partner: { id: string; name: string; photo: string | null; role: string }; lastMessage: Message }
interface Teacher { id: string; name: string; role: string }
interface FamilyContact { id: string; name: string; role: string; relation: 'parent' | 'child' }

export default function StudentMessagesPage() {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [showTeacherList, setShowTeacherList] = useState(false)
  const [myId, setMyId] = useState<string>('')
  const qc = useQueryClient()

  useEffect(() => { getCurrentUser().then(u => u && setMyId(u.userId)) }, [])
  useMessageSocket(myId || undefined, {
    onMessage: () => {
      qc.invalidateQueries({ queryKey: ['conversation', selectedPartnerId] })
      qc.invalidateQueries({ queryKey: ['student-inbox'] })
    },
  })

  const { data: inbox = [] as Inbox[], isLoading } = useQuery<Inbox[]>({
    queryKey: ['student-inbox'],
    queryFn: async () => { const r = await apiFetch('/api/messages/inbox'); if (!r.ok) throw new Error(); return r.json() },
  })
  const { data: teachers = [] as Teacher[] } = useQuery<Teacher[]>({
    queryKey: ['message-teachers'],
    queryFn: async () => { const r = await apiFetch('/api/messages/teachers'); if (!r.ok) throw new Error(); return r.json() },
  })
  const { data: family = [] as FamilyContact[] } = useQuery<FamilyContact[]>({
    queryKey: ['student-family-contacts'],
    queryFn: async () => {
      const r = await apiFetch('/api/messages/family-contacts')
      if (!r.ok) return []
      const list = await r.json()
      return Array.isArray(list) ? list : []
    },
  })
  const { data: conversation = [] as Message[] } = useQuery<Message[]>({
    queryKey: ['conversation', selectedPartnerId],
    queryFn: async () => { const r = await apiFetch(`/api/messages/conversation/${selectedPartnerId}`); if (!r.ok) throw new Error(); return r.json() },
    enabled: !!selectedPartnerId,
  })

  const sendMutation = useMutation({
    mutationFn: (data: { receiverId: string; content: string }) =>
      apiFetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversation', selectedPartnerId] }); qc.invalidateQueries({ queryKey: ['student-inbox'] }) },
  })

  const { register, handleSubmit, reset } = useForm<{ content: string }>()
  const onSend = (data: { content: string }) => {
    if (!selectedPartnerId || !data.content?.trim()) return
    sendMutation.mutate({ receiverId: selectedPartnerId, content: data.content.trim() })
    reset()
  }

  const selectedPartner = inbox.find(i => i.partner.id === selectedPartnerId)?.partner
    ?? teachers.find(t => t.id === selectedPartnerId)
    ?? family.find(f => f.id === selectedPartnerId)

  return (
    <AuthGuard requiredRole="STUDENT">
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar title="Student" subtitle="Portal" navItems={studentNav} accentColor="emerald" />
        <aside className="w-52 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <Link href="/student" className="text-xs text-sky-600">← Back</Link>
            <p className="text-sm font-bold text-slate-700 mt-2">Messages</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <button onClick={() => setShowTeacherList(!showTeacherList)}
              className="w-full text-xs text-sky-600 py-2 hover:underline">+ New Message</button>
            {showTeacherList && (
              <div className="mb-2">
                {family.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400">My family</p>
                    {family.map(f => (
                      <button key={f.id} onClick={() => { setSelectedPartnerId(f.id); setShowTeacherList(false) }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-emerald-50 text-emerald-700">
                        {f.name} <span className="text-slate-400">(Parent)</span>
                      </button>
                    ))}
                  </>
                )}
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400">School staff</p>
                {teachers.map(t => (
                  <button key={t.id} onClick={() => { setSelectedPartnerId(t.id); setShowTeacherList(false) }}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50 text-slate-700">{t.name} ({t.role})</button>
                ))}
              </div>
            )}
            {isLoading ? <div className="animate-pulse h-10 bg-slate-100 rounded-lg m-2" /> : inbox.map(item => (
              <button key={item.partner.id} onClick={() => setSelectedPartnerId(item.partner.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${selectedPartnerId === item.partner.id ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <p className="font-medium truncate">{item.partner.name}</p>
                <p className="text-xs truncate text-slate-400">{item.lastMessage?.content ?? ''}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          {!selectedPartnerId ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-3">💬</p>
                <p>Select a conversation or start a new one</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white border-b border-slate-200 px-6 py-4">
                <p className="font-semibold text-slate-800">{selectedPartner?.name ?? 'Chat'}</p>
                <p className="text-xs text-slate-400">Verified School</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {conversation.map(msg => {
                  const fromPartner = msg.sender?.id === selectedPartnerId
                  return (
                    <div key={msg.id} className={`flex ${fromPartner ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${fromPartner ? 'bg-white border border-slate-200 text-slate-800' : 'bg-sky-600 text-white'}`}>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${fromPartner ? 'text-slate-400' : 'text-sky-200'}`}>
                          {formatCambodiaTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <form onSubmit={handleSubmit(onSend)} className="bg-white border-t border-slate-200 p-4 flex gap-3">
                <input {...register('content', { required: true })}
                  placeholder="Type a message..." className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                <button type="submit" disabled={sendMutation.isPending}
                  className="bg-sky-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
                  {sendMutation.isPending ? '...' : 'Send'}
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  )
}
