"use client"

import { useEffect, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { useMathJax } from '../lib/useMathJax'
import MathText from './MathText'

const HTML_TAG_RE = /<([a-z][a-z0-9]*)\b[^>]*>/i

/** Renders a question's rich text (authored via RichTextEditor). Content authored
 * before this feature existed is plain text (possibly with LaTeX delimiters) —
 * detected by the absence of any real HTML tag and rendered via the existing
 * MathText component unchanged, so no data migration is needed. Content that does
 * contain HTML tags is sanitized (DOMPurify) and rendered as markup, then MathJax
 * typesets any \( \) / \[ \] LaTeX found inside it, same as MathText does for
 * plain text. */
export default function RichText({
  html, as = 'div', className,
}: { html: string | null | undefined; as?: 'div' | 'span' | 'p'; className?: string }) {
  const value = html ?? ''
  const looksLikeHtml = HTML_TAG_RE.test(value)
  const ready = useMathJax()
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!looksLikeHtml || !ready || !ref.current) return
    const el = ref.current
    window.MathJax?.typesetPromise?.([el]).catch(() => {
      // Leave the rendered HTML visible even if a LaTeX fragment fails to typeset.
    })
    return () => {
      try { window.MathJax?.typesetClear?.([el]) } catch {}
    }
  }, [ready, value, looksLikeHtml])

  if (!looksLikeHtml) {
    return <MathText as={as} text={value} className={className} />
  }

  const Tag = as as any
  const clean = DOMPurify.sanitize(value)
  return <Tag ref={ref} className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}
