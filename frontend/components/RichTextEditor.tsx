"use client"

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

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
      Placeholder.configure({ placeholder: placeholder || 'Question text' }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose-sm max-w-none focus:outline-none min-h-[4.5rem] px-3 py-2 text-sm' },
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

  if (!editor) return null

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', previous || 'https://')
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const addImage = () => {
    const url = window.prompt('Image URL')
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
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
        <button type="button" onClick={addImage} className={btn(false)} title="Image">🖼</button>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} title="Clear formatting">✕ Format</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
