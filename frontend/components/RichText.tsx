"use client"

import { useEffect, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { useMathJax } from '../lib/useMathJax'
import MathText from './MathText'

const HTML_TAG_RE = /<([a-z][a-z0-9]*)\b[^>]*>/i
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** Adds a speed selector next to every <audio> in the container (idempotent —
 * safe to call again after re-renders). Plain DOM manipulation rather than React
 * since this runs over a dangerouslySetInnerHTML subtree React doesn't manage.
 *
 * Deliberately minimal: the question-authoring editor renders the exact same
 * <audio controls src="data:..."> markup with no extra processing and plays
 * fine, so this leaves the native element and its src completely untouched —
 * earlier attempts to "fix" playback here (converting to a Blob URL, swapping
 * in a custom play button) were unverified guesses layered on top of a native
 * player that was never actually broken, and only added new failure surface. */
function enhanceAudioPlayers(container: HTMLElement) {
  container.querySelectorAll('audio').forEach((audio) => {
    if (audio.dataset.enhanced) return
    audio.dataset.enhanced = '1'
    audio.className = `${audio.className} max-w-full`.trim()

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

    // Temporary diagnostic: clicking the native play button produces zero
    // visible effect (no time movement, no sound, no error) even with the
    // exact same src/controls setup that works in the editor. This button
    // calls audio.play() directly, bypassing whatever handles clicks on the
    // native control's shadow-root UI, so we can tell apart "clicks aren't
    // reaching the element" from "the browser can't actually play this data."
    const testBtn = document.createElement('button')
    testBtn.type = 'button'
    testBtn.textContent = '🔧 Test play()'
    testBtn.className = 'text-xs border border-amber-300 bg-amber-50 text-amber-700 rounded px-2 py-0.5'
    testBtn.addEventListener('click', () => {
      const r = audio.getBoundingClientRect()
      console.info('[audio-debug] rect:', { width: r.width, height: r.height, top: r.top, left: r.left })
      console.info('[audio-debug] readyState:', audio.readyState, 'networkState:', audio.networkState, 'error:', audio.error, 'paused:', audio.paused, 'currentTime:', audio.currentTime, 'duration:', audio.duration)
      audio.play().then(() => {
        console.info('[audio-debug] play() RESOLVED')
        setTimeout(() => console.info('[audio-debug] 1s later currentTime:', audio.currentTime), 1000)
      }).catch((e) => {
        console.info('[audio-debug] play() REJECTED:', e?.name, e?.message)
      })
    })
    wrap.appendChild(testBtn)

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
  })
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
    enhanceAudioPlayers(ref.current)
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
