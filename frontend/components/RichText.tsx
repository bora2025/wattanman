"use client"

import { useEffect, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { useMathJax } from '../lib/useMathJax'
import MathText from './MathText'

const HTML_TAG_RE = /<([a-z][a-z0-9]*)\b[^>]*>/i
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** Multi-megabyte base64 data: URIs are unreliable as a media element's `src`
 * when the element was parsed out of a huge dangerouslySetInnerHTML string —
 * some browsers stall or silently fail to decode rather than erroring, even
 * though the underlying audio is completely valid (confirmed by re-verifying
 * a real failing file byte-for-byte with a dedicated MP3 parser — it decoded
 * cleanly, so the data itself wasn't the problem). Converting to a real Blob
 * URL up front is the standard, more robust pattern for large embedded media.
 * Returns the object URL so the caller can revoke it when the content changes. */
function dataUriToBlobUrl(dataUri: string): string | null {
  const match = dataUri.match(/^data:([^;]+);base64,([\s\S]*)$/)
  if (!match) return null
  try {
    const [, mime, base64] = match
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  } catch {
    return null
  }
}

/** Adds a speed selector next to every <audio> in the container (idempotent —
 * safe to call again after re-renders). Plain DOM manipulation rather than React
 * since this runs over a dangerouslySetInnerHTML subtree React doesn't manage. */
function enhanceAudioPlayers(container: HTMLElement): () => void {
  // Temporary instrumentation: a click on the visible native play button never
  // reaches the <audio> element's own click listener, which means some other
  // element is absorbing the pointer event at that screen position. A capture-
  // phase listener on document fires before any descendant can stop it, so
  // this pins down exactly what's actually receiving the click.
  if (!(window as any).__audioDebugGlobalClick) {
    ;(window as any).__audioDebugGlobalClick = true
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      console.info('[audio-debug] document-capture click target:', t?.tagName, t?.className, t)
    }, true)
  }

  const blobUrls: string[] = []
  container.querySelectorAll('audio').forEach((audio) => {
    if (audio.dataset.enhanced) return
    audio.dataset.enhanced = '1'
    audio.className = `${audio.className} max-w-full`.trim()

    const src = audio.getAttribute('src')
    if (src?.startsWith('data:')) {
      const blobUrl = dataUriToBlobUrl(src)
      if (blobUrl) {
        blobUrls.push(blobUrl)
        audio.src = blobUrl
      }
    }

    const wrap = document.createElement('div')
    wrap.className = 'flex items-center gap-1.5 mt-1'
    const label = document.createElement('span')
    label.className = 'text-xs text-slate-500'
    label.textContent = 'Speed:'
    const select = document.createElement('select')
    select.className = 'text-xs border border-slate-200 rounded px-1 py-0.5 bg-white'
    PLAYBACK_RATES.forEach((rate) => {
      const opt = document.createElement('option')
      opt.value = String(rate)
      opt.textContent = `${rate}x`
      if (rate === 1) opt.selected = true
      select.appendChild(opt)
    })
    select.addEventListener('change', () => {
      audio.playbackRate = Number(select.value)
    })

    wrap.appendChild(label)
    wrap.appendChild(select)
    audio.insertAdjacentElement('afterend', wrap)

    // Playback failures (unsupported codec, corrupt data, etc.) otherwise fail
    // completely silently — the native controls just never respond to play.
    audio.addEventListener('error', () => {
      const err = audio.error
      const reason = err?.code === MediaError.MEDIA_ERR_DECODE ? 'This audio file is corrupted or uses an unsupported encoding.'
        : err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? "This browser can't play this audio format."
        : 'This audio failed to load.'
      const notice = document.createElement('p')
      notice.className = 'text-xs text-red-600 mt-1'
      notice.textContent = `⚠ ${reason}`
      wrap.insertAdjacentElement('afterend', notice)
    })

    // Temporary instrumentation: clicking Play but seeing no console output at
    // all (no error, no state change) means the click isn't reaching the media
    // element's playback logic — these logs pin down which stage actually runs.
    const tag = '[audio-debug]'
    audio.addEventListener('click', () => console.info(tag, 'click reached <audio>'))
    ;['play', 'playing', 'pause', 'stalled', 'waiting', 'suspend', 'abort'].forEach((evt) => {
      audio.addEventListener(evt, () => console.info(tag, evt, { currentTime: audio.currentTime, readyState: audio.readyState, networkState: audio.networkState }))
    })
  })
  return () => { blobUrls.forEach((url) => URL.revokeObjectURL(url)) }
}

/** Renders a question's rich text (authored via RichTextEditor). Content authored
 * before this feature existed is plain text (possibly with LaTeX delimiters) —
 * detected by the absence of any real HTML tag and rendered via the existing
 * MathText component unchanged, so no data migration is needed. Content that does
 * contain HTML tags is sanitized (DOMPurify) and rendered as markup, then MathJax
 * typesets any \( \) / \[ \] LaTeX found inside it, and any <audio> element gets a
 * speed-control dropdown added next to its native play/pause/seek controls. */
export default function RichText({
  html, as = 'div', className,
}: { html: string | null | undefined; as?: 'div' | 'span' | 'p'; className?: string }) {
  const value = html ?? ''
  const looksLikeHtml = HTML_TAG_RE.test(value)
  const ready = useMathJax()
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!looksLikeHtml || !ref.current) return
    return enhanceAudioPlayers(ref.current)
  }, [value, looksLikeHtml])

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
  const clean = DOMPurify.sanitize(value, { ADD_TAGS: ['audio'], ADD_ATTR: ['controls', 'preload'] })
  return <Tag ref={ref} className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}
