'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Sidebar from '../../../../components/Sidebar'
import AuthGuard from '../../../../components/AuthGuard'
import { adminNav } from '../../../../lib/admin-nav'
import { apiFetch } from '../../../../lib/api'

/* ─── Types ─────────────────────────────────────────────── */

type PostType = 'text' | 'image' | 'video'

interface Post {
  id: string
  title: string
  excerpt: string
  body: string
  type: PostType
  imageUrl: string
  videoUrl: string
  published: boolean
  pinned: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

const EMPTY_POST: Omit<Post, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  excerpt: '',
  body: '',
  type: 'text',
  imageUrl: '',
  videoUrl: '',
  published: true,   // new posts are published by default
  pinned: false,
  tags: [],
}

/* ─── Image compression helper ───────────────────────────── */

function compressImage(file: File, maxW = 1200, maxH = 800, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
        if (h > maxH) { w = Math.round(w * maxH / h); h = maxH }
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

/* ─── ImageUpload ─────────────────────────────────────────── */

function ImageUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function pick(file: File) {
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    if (file.size > 15 * 1024 * 1024) { setErr('File too large (max 15 MB).'); return }
    setErr(''); setBusy(true)
    try { onChange(await compressImage(file)) }
    catch { setErr('Could not process image.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 group">
          <img src={value} alt="preview" className="w-full h-52 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button type="button" onClick={() => ref.current?.click()}
              className="px-3 py-1.5 bg-white text-gray-800 text-xs font-semibold rounded-lg">Replace</button>
            <button type="button" onClick={() => onChange('')}
              className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg">Remove</button>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-gray-50 transition-all"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pick(f) }}
        >
          <div className="flex flex-col items-center py-8 gap-2 text-center">
            {busy ? (
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                </svg>
                <p className="text-sm font-medium text-gray-600">Click or drag image here</p>
                <p className="text-xs text-gray-400">JPEG, PNG, WebP — max 15 MB</p>
              </>
            )}
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
    </div>
  )
}

/* ─── Post Editor Modal ───────────────────────────────────── */

function PostEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Partial<Post> | null
  onSave: (post: Post) => void
  onClose: () => void
}) {
  const isNew = !initial?.id
  const [form, setForm] = useState({
    ...EMPTY_POST,
    ...(initial ?? {}),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }

  function removeTag(t: string) {
    set('tags', form.tags.filter((x) => x !== t))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required.'); return }
    // When clicking "Publish Post" on a new post, always publish
    const payload = isNew ? { ...form, published: true } : form
    setSaving(true); setError(null)
    try {
      const res = await apiFetch(
        isNew ? '/api/posts' : `/api/posts/${initial!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const saved = await res.json()
      onSave(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const typeOptions: { value: PostType; label: string; icon: string }[] = [
    { value: 'text', label: 'Text', icon: '📝' },
    { value: 'image', label: 'Image', icon: '🖼️' },
    { value: 'video', label: 'Video', icon: '🎬' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{isNew ? 'New Post' : 'Edit Post'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Post type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Post Type</label>
            <div className="flex gap-2">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('type', opt.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.type === opt.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>{opt.icon}</span> {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Post title…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt <span className="text-xs text-gray-400">(short summary shown in cards)</span></label>
            <textarea
              value={form.excerpt}
              onChange={(e) => set('excerpt', e.target.value)}
              rows={2}
              placeholder="Brief description…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Image upload — shown for image & text types */}
          {(form.type === 'image' || form.type === 'text') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.type === 'image' ? 'Image (required)' : 'Featured Image (optional)'}
              </label>
              <ImageUpload value={form.imageUrl} onChange={(v) => set('imageUrl', v)} />
            </div>
          )}

          {/* Video URL — shown for video type */}
          {form.type === 'video' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Video URL <span className="text-xs text-gray-400">(YouTube, Vimeo, or direct .mp4)</span></label>
              <input
                type="url"
                value={form.videoUrl}
                onChange={(e) => set('videoUrl', e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {/* Video preview */}
              {form.videoUrl && (
                <div className="mt-2">
                  <VideoEmbed url={form.videoUrl} />
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              rows={6}
              placeholder="Full post content…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add tag and press Enter"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="button" onClick={addTag}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
                Add
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => set('published', !form.published)}
                className={`w-10 h-5.5 rounded-full transition-colors relative cursor-pointer ${form.published ? 'bg-emerald-500' : 'bg-gray-300'}`}
                style={{ width: 40, height: 22 }}
              >
                <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${form.published ? 'left-[18px]' : 'left-0.5'}`}
                  style={{ width: 18, height: 18, top: 2, left: form.published ? 20 : 2 }} />
              </div>
              <span className="text-sm font-medium text-gray-700">Published</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => set('pinned', !form.pinned)}
                className={`relative cursor-pointer rounded-full transition-colors`}
                style={{ width: 40, height: 22, backgroundColor: form.pinned ? '#f59e0b' : '#d1d5db' }}
              >
                <div className={`absolute rounded-full bg-white shadow transition-all`}
                  style={{ width: 18, height: 18, top: 2, left: form.pinned ? 20 : 2 }} />
              </div>
              <span className="text-sm font-medium text-gray-700">📌 Pinned</span>
            </label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : isNew ? 'Publish Post' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Video embed helper ──────────────────────────────────── */

function VideoEmbed({ url }: { url: string }) {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (ytMatch) {
    return (
      <div className="relative rounded-xl overflow-hidden bg-black" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={`https://www.youtube.com/embed/${ytMatch[1]}`}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          title="video"
        />
      </div>
    )
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) {
    return (
      <div className="relative rounded-xl overflow-hidden bg-black" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          title="video"
        />
      </div>
    )
  }
  // Direct video
  return <video src={url} controls className="w-full rounded-xl max-h-52" />
}

/* ─── Post Card (list view) ───────────────────────────────── */

function PostCard({
  post,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  post: Post
  onEdit: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  const typeColors: Record<PostType, string> = {
    text: 'bg-blue-50 text-blue-700',
    image: 'bg-purple-50 text-purple-700',
    video: 'bg-rose-50 text-rose-700',
  }
  const typeIcons: Record<PostType, string> = { text: '📝', image: '🖼️', video: '🎬' }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Cover image */}
      {post.imageUrl && (
        <div className="h-36 overflow-hidden">
          <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
        </div>
      )}
      {/* Video thumbnail placeholder */}
      {post.type === 'video' && !post.imageUrl && post.videoUrl && (
        <div className="h-36 bg-gray-900 flex items-center justify-center">
          <span className="text-4xl">🎬</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[post.type]}`}>
            {typeIcons[post.type]} {post.type}
          </span>
          {post.pinned && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">📌 Pinned</span>}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ml-auto ${post.published ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {post.published ? '✓ Published' : 'Draft'}
          </span>
        </div>

        {/* Title + excerpt */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 line-clamp-2">{post.title}</h3>
          {post.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{post.excerpt}</p>}
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.slice(0, 3).map((t) => (
              <span key={t} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[11px] rounded-full">{t}</span>
            ))}
            {post.tags.length > 3 && <span className="text-[11px] text-gray-400">+{post.tags.length - 3}</span>}
          </div>
        )}

        {/* Date */}
        <p className="text-[11px] text-gray-400">{new Date(post.createdAt).toLocaleDateString()}</p>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <button onClick={onEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Edit
          </button>
          <button onClick={onTogglePublish}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              post.published
                ? 'text-gray-500 hover:bg-gray-100'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}>
            {post.published ? 'Unpublish' : 'Publish'}
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-auto">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main posts management page ──────────────────────────── */

function PostsContent() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Post> | null | false>(false)
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'text' | 'image' | 'video'>('all')
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch('/api/posts')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved(post: Post) {
    setPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === post.id)
      return idx >= 0 ? prev.map((p) => (p.id === post.id ? post : p)) : [post, ...prev]
    })
    setEditing(false)
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/posts/${id}`, { method: 'DELETE' })
    setPosts((prev) => prev.filter((p) => p.id !== id))
    setConfirmDelete(null)
  }

  async function togglePublish(post: Post) {
    const res = await apiFetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !post.published }),
    })
    if (res.ok) {
      const updated = await res.json()
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    }
  }

  const filtered = posts.filter((p) => {
    if (filter === 'published' && !p.published) return false
    if (filter === 'draft' && p.published) return false
    if (filter === 'text' && p.type !== 'text') return false
    if (filter === 'image' && p.type !== 'image') return false
    if (filter === 'video' && p.type !== 'video') return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) &&
        !p.excerpt.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    all: posts.length,
    published: posts.filter((p) => p.published).length,
    draft: posts.filter((p) => !p.published).length,
    text: posts.filter((p) => p.type === 'text').length,
    image: posts.filter((p) => p.type === 'image').length,
    video: posts.filter((p) => p.type === 'video').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/appearance" className="hover:text-indigo-600 transition-colors">Appearance</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">Posts</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Posts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Publish content on the public school website</p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          New Post
        </button>
      </div>

      {/* Warning banner if there are draft posts */}
      {posts.length > 0 && counts.draft > 0 && counts.published === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="text-amber-500 text-lg flex-none">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              {counts.draft} post{counts.draft > 1 ? 's are' : ' is'} saved as Draft — not visible on the website.
            </p>
            <p className="text-amber-600 mt-0.5">Toggle "Published" on each post, or use the Publish button below.</p>
          </div>
          <button
            onClick={async () => {
              const drafts = posts.filter((p) => !p.published)
              await Promise.all(drafts.map((p) => apiFetch(`/api/posts/${p.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ published: true }),
              })))
              load()
            }}
            className="flex-none px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors"
          >
            Publish All Drafts
          </button>
        </div>
      )}

      {/* Filter + search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
          {([
            ['all', 'All'],
            ['published', '✓ Published'],
            ['draft', 'Drafts'],
            ['text', '📝 Text'],
            ['image', '🖼️ Image'],
            ['video', '🎬 Video'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                filter === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label} <span className="opacity-60">({counts[key]})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs ml-auto">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-3">📭</div>
          <p className="text-sm font-medium">
            {posts.length === 0 ? 'No posts yet. Create your first post!' : 'No posts match your filter.'}
          </p>
          {posts.length === 0 && (
            <button onClick={() => setEditing({})}
              className="mt-4 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
              Create First Post
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onEdit={() => setEditing(post)}
              onDelete={() => setConfirmDelete(post.id)}
              onTogglePublish={() => togglePublish(post)}
            />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing !== false && (
        <PostEditor
          initial={editing || null}
          onSave={handleSaved}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Delete Post?</h3>
            <p className="text-sm text-gray-500">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Page export ─────────────────────────────────────────── */

export default function PostsPage() {
  return (
    <AuthGuard>
      <div className="flex h-screen bg-gray-50">
        <Sidebar title="Admin" navItems={adminNav} accentColor="indigo" />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <PostsContent />
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
