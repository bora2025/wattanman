"use client"

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

// Same base64-in-database convention used for student/class photos and the Drag
// and Drop question's background image (frontend/components/questions/DragDropField.tsx)
// — this app has no real object-storage backend, so uploads are embedded directly.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

// Some third-party audio converters produce files whose container/codec headers
// look perfectly valid but that specific browsers still refuse to actually decode
// (this bit us with a Clipchamp-exported .m4a — standard AAC-LC per its own esds
// box, yet silently unplayable). Rather than trust the file, actually try to play
// a couple of frames of it in this browser before accepting the upload, so a
// broken file is caught immediately instead of surfacing as "audio doesn't play"
// for students much later.
function verifyAudioPlayable(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new window.Audio()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      probe.removeAttribute('src')
      probe.load()
      resolve(ok)
    }
    probe.addEventListener('canplaythrough', () => finish(true), { once: true })
    probe.addEventListener('loadeddata', () => finish(true), { once: true })
    probe.addEventListener('error', () => finish(false), { once: true })
    // A data URI decodes locally with no network latency, so a real failure
    // surfaces almost immediately. Neither event firing within the timeout is
    // itself a strong signal something is wrong, so treat it as a failure
    // rather than fail-open — a large file just makes for a slower rejection.
    setTimeout(() => finish(false), 6000)
    probe.src = src
    probe.load()
  })
}

/** Renders as a plain <audio controls src="..."> — RichText.tsx adds a speed
 * selector next to it at render time (see enhanceAudioPlayers there). Kept as a
 * minimal node (no custom NodeView) since the editor's own live preview only
 * needs native playback controls; the speed selector is a student-facing extra. */
const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  addAttributes() {
    return { src: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'audio[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['audio', mergeAttributes(HTMLAttributes, { controls: 'true', preload: 'metadata' })]
  },
})

/** Shared rich text editor for "Question text" fields (Exams, Assignments, Course
 * lesson questions). Outputs sanitized-at-render HTML (see RichText.tsx) — this
 * component itself does not sanitize, since TipTap's own schema already constrains
 * what nodes/marks can exist. Essentials-only toolbar: bold, italic, lists, link,
 * image, clear formatting. LaTeX (\( \) \[ \]) can still be typed as plain text
 * inside a paragraph — RichText's MathJax pass runs over the rendered HTML. */
export default function RichTextEditor({
  value, onChange, placeholder,
}: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Audio,
      Placeholder.configure({ placeholder: placeholder || 'Question text' }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose-sm max-w-none focus:outline-none h-full px-3 py-2 text-sm' },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Keep the editor in sync when the caller swaps which question's data is bound
  // to this component instance (the authoring lists key rows by index, so the
  // same DOM node can be reused for a different question after add/remove/reorder).
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== (value || '')) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadingAudio, setUploadingAudio] = useState(false)

  if (!editor) return null

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', previous || 'https://')
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setUploadError(null)
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError('Image must be smaller than 3MB')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run()
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setUploadError(null)
    if (!file) return
    if (file.size > MAX_AUDIO_BYTES) {
      setUploadError('Audio must be smaller than 8MB')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      // iOS/Safari reports .m4a files as "audio/x-m4a" — a non-standard MIME string
      // that Chrome/Firefox/Edge's <audio> element doesn't recognize, so it silently
      // fails to play there even though the underlying AAC-in-MP4 data is fine. Every
      // major browser (including Safari) plays the same data fine under "audio/mp4".
      const src = (reader.result as string).replace(/^data:audio\/x-m4a;/, 'data:audio/mp4;')
      setUploadingAudio(true)
      const playable = await verifyAudioPlayable(src)
      setUploadingAudio(false)
      if (!playable) {
        setUploadError("This browser can't play that audio file — try re-exporting it (e.g. as MP3) and upload again.")
        return
      }
      editor.chain().focus().insertContent({ type: 'audio', attrs: { src } }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-semibold border ${active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden mb-2">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Bold"><b>B</b></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Italic"><i>I</i></button>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Bullet list">• ―</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Numbered list">1. ―</button>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <button type="button" onClick={setLink} className={btn(editor.isActive('link'))} title="Link">🔗</button>
        <button type="button" onClick={() => imageInputRef.current?.click()} className={btn(false)} title="Upload image">🖼</button>
        <button type="button" onClick={() => audioInputRef.current?.click()} className={btn(false)} title="Upload audio" disabled={uploadingAudio}>{uploadingAudio ? '⏳' : '🔊'}</button>
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioFile} className="hidden" />
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} title="Clear formatting">✕ Format</button>
        {uploadingAudio && <span className="text-xs text-slate-400 ml-1">Checking audio…</span>}
        {uploadError && <span className="text-xs text-red-600 ml-1">{uploadError}</span>}
      </div>
      <EditorContent editor={editor} className="resize-y overflow-y-auto min-h-[4.5rem] max-h-[32rem]" />
    </div>
  )
}
