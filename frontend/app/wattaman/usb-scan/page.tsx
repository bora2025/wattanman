"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { wattamanNav } from '../../../lib/wattaman-nav'
import { apiFetch } from '../../../lib/api'
import { formatCambodiaTime, todayCambodia } from '../../../lib/dateUtils'

interface ScanResult {
  action: string
  sessionType?: string
  studentId: string
  studentName: string
  studentPhoto: string | null
  className: string
  status: string
  session: number
  checkInTime: string | null
  message?: string
}

/* ─── helpers ─────────────────────────────────────────────── */
const statusMeta = (action: string, status: string) => {
  if (action === 'ALREADY_RECORDED')
    return { label: '↩ Already Recorded', bg: 'bg-indigo-500', cardBg: 'bg-indigo-50', ring: 'ring-indigo-300', text: 'text-indigo-600', flash: 'rgba(99,102,241,0.4)', bgLight: 'rgba(99,102,241,0.1)', textHex: '#4338ca' }
  if (action === 'CHECK_OUT')
    return { label: '↑ Checked Out', bg: 'bg-blue-500', cardBg: 'bg-blue-50', ring: 'ring-blue-300', text: 'text-blue-600', flash: 'rgba(59,130,246,0.4)', bgLight: 'rgba(59,130,246,0.1)', textHex: '#1d4ed8' }
  if (status === 'LATE')
    return { label: '⚠️ Late', bg: 'bg-amber-500', cardBg: 'bg-amber-50', ring: 'ring-amber-300', text: 'text-amber-600', flash: 'rgba(251,191,36,0.35)', bgLight: 'rgba(245,158,11,0.12)', textHex: '#b45309' }
  if (status === 'DAY_OFF')
    return { label: '🌙 Day Off', bg: 'bg-slate-400', cardBg: 'bg-slate-100', ring: 'ring-slate-300', text: 'text-slate-500', flash: 'rgba(148,163,184,0.35)', bgLight: 'rgba(148,163,184,0.12)', textHex: '#64748b' }
  return { label: '✓ Checked In', bg: 'bg-emerald-500', cardBg: 'bg-emerald-50', ring: 'ring-emerald-300', text: 'text-emerald-600', flash: 'rgba(52,211,153,0.4)', bgLight: 'rgba(16,185,129,0.12)', textHex: '#047857' }
}

function StudentProfileCard({ result }: { result: ScanResult }) {
  const meta = statusMeta(result.action, result.status)
  const isAlready = result.action === 'ALREADY_RECORDED'
  const timeDisplay = result.checkInTime ? formatCambodiaTime(result.checkInTime, true) : null
  return (
    <div className={`rounded-2xl overflow-hidden shadow-2xl ${meta.cardBg} ring-2 ${meta.ring}`}>
      <div className={`${meta.bg} px-4 py-2.5 flex items-center justify-between`}>
        <span className="text-white text-sm font-bold tracking-wide">{meta.label}</span>
        {result.session > 0 && (
          <span className="text-white/80 text-xs font-medium">Session {result.session}</span>
        )}
      </div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        <div className={`flex-shrink-0 ring-2 ${meta.ring} rounded-2xl shadow-md overflow-hidden`}>
          {result.studentPhoto ? (
            <img src={result.studentPhoto} alt={result.studentName}
              className="w-20 h-20 sm:w-24 sm:h-24 object-cover" />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white flex items-center justify-center text-5xl">👤</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-slate-800 text-lg sm:text-xl leading-tight truncate">{result.studentName}</p>
          <p className="text-sm text-slate-500 truncate mt-0.5">{result.className}</p>
          {isAlready && <p className="text-xs text-indigo-500 font-medium mt-1">Already recorded — no duplicate</p>}
        </div>
      </div>
      {timeDisplay && (
        <div className="mx-4 mb-4 rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: meta.bgLight }}>
          <div className="flex items-center gap-2">
            <span className="text-base">🕐</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {isAlready ? 'First scan time' : result.action === 'CHECK_OUT' ? 'Check-out time' : 'Check-in time'}
            </span>
          </div>
          <span className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight"
            style={{ color: meta.textHex }}>
            {timeDisplay}
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Main content ─────────────────────────────────────────── */
function UsbScanContent() {
  const router = useRouter()
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [flashColor, setFlashColor] = useState<string | null>(null)
  const [profileVisible, setProfileVisible] = useState(false)
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([])
  const [scanCount, setScanCount] = useState(0)
  const [clockStr, setClockStr] = useState('')
  const [activeSession, setActiveSession] = useState<{
    session: number; type: string; startTime: string; endTime: string; isActive: boolean; badge: 'Active' | 'Near' | 'Upcoming'
  } | null>(null)

  /* ── Input buffer for USB scanner keyboard emulation ── */
  const [bufferDisplay, setBufferDisplay] = useState('')   // shown in the input box
  const bufferRef = useRef('')                             // accumulates raw keystrokes
  const lastKeyTimeRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Device activity detection ── */
  const [deviceActive, setDeviceActive] = useState(false)   // scanner sent keystrokes recently
  const [lastActivityStr, setLastActivityStr] = useState<string | null>(null)
  const lastActivityTimeRef = useRef<number>(0)
  const deviceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Test mode (scan without recording) ── */
  const [testMode, setTestMode] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  /* ── Unknown-card linking modal ── */
  const [linkCardQr, setLinkCardQr] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<Array<{
    id: string; studentNumber: string | null; photo: string | null;
    user: { name: string; photo: string | null }; class: { name: string } | null
  }>>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkError, setLinkError] = useState('')

  const lockRef = useRef(false)
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionConfigsRef = useRef<Array<{ session: number; type: string; startTime: string; endTime: string }>>([])

  /* ── GPS ── */
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      pos => { locationRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude } },
      () => { locationRef.current = null },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  /* ── Session config + live clock ── */
  useEffect(() => {
    const fetchConfigs = () =>
      apiFetch('/api/session-config/global')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (Array.isArray(data)) sessionConfigsRef.current = data.filter((c: any) => c.startTime !== c.endTime) })
        .catch(() => {})
    fetchConfigs()
    const configInterval = setInterval(fetchConfigs, 60_000)
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const tick = () => {
      const cam = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
      const hh = String(cam.getUTCHours()).padStart(2, '0')
      const mm = String(cam.getUTCMinutes()).padStart(2, '0')
      const ss = String(cam.getUTCSeconds()).padStart(2, '0')
      setClockStr(`${hh}:${mm}:${ss}`)
      const configs = sessionConfigsRef.current
      if (configs.length === 0) return
      const nowMin = parseInt(hh) * 60 + parseInt(mm)
      const sorted = [...configs].sort((a, b) => a.session - b.session)
      let matched: typeof sorted[0] | undefined = sorted.find(c => nowMin >= toMin(c.startTime) && nowMin <= toMin(c.endTime))
      const isActive = !!matched
      let badge: 'Active' | 'Near' | 'Upcoming' = 'Upcoming'
      if (isActive) {
        badge = 'Active'
      } else {
        matched = sorted.find(c => { const s = toMin(c.startTime); return nowMin >= s - 30 && nowMin < s })
        if (matched) {
          badge = 'Near'
        } else {
          const upcoming = sorted.filter(c => toMin(c.startTime) > nowMin)
          if (upcoming.length > 0) {
            matched = upcoming[0]
          } else {
            const past = sorted.filter(c => toMin(c.startTime) <= nowMin)
            matched = past.length > 0 ? past[past.length - 1] : sorted[0]
          }
          badge = 'Upcoming'
        }
      }
      setActiveSession(matched ? { ...matched, isActive, badge } : null)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => { clearInterval(iv); clearInterval(configInterval) }
  }, [])

  /* ── Sounds ── */
  const playSound = useCallback((type: 'success' | 'error' | 'already') => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const tone = (freq: number, start: number, dur: number, vol = 0.25) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.frequency.setValueAtTime(freq, ctx.currentTime + start)
        g.gain.setValueAtTime(vol, ctx.currentTime + start)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur)
      }
      if (type === 'success') { tone(880, 0, 0.12, 0.3); tone(1108, 0.1, 0.2, 0.3) }
      else if (type === 'already') { tone(660, 0, 0.1, 0.15); tone(660, 0.15, 0.1, 0.15) }
      else { tone(330, 0, 0.15); tone(220, 0.15, 0.25) }
    } catch { /* audio not supported */ }
  }, [])

  const dismissLock = useCallback(() => {
    if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null }
    lockRef.current = false
    setMessage('')
    setIsLoading(false)
    bufferRef.current = ''
    setBufferDisplay('')
    // Re-focus the hidden input so the next scan is captured immediately
    inputRef.current?.focus()
  }, [])

  /* ── Link-card modal ── */
  const closeLinkModal = useCallback(() => {
    setLinkCardQr(null)
    setLinkSearch('')
    setLinkResults([])
    setLinkError('')
    setLinkSaving(false)
    dismissLock()
  }, [dismissLock])

  useEffect(() => {
    if (!linkCardQr) return
    setLinkLoading(true)
    const handle = setTimeout(() => {
      apiFetch(`/api/card-aliases/students?q=${encodeURIComponent(linkSearch.trim())}`)
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => { if (Array.isArray(data)) setLinkResults(data) })
        .catch(() => setLinkResults([]))
        .finally(() => setLinkLoading(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [linkCardQr, linkSearch])

  /* ── Process scanned QR value ── */
  const handleQrScanned = useCallback(async (qrData: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setIsLoading(true)
    setProfileVisible(false)
    setBufferDisplay('')
    bufferRef.current = ''

    let resolvedQr = qrData
    try {
      const parsed = JSON.parse(qrData)
      if (parsed.staffId || parsed.STAFFID) {
        setIsLoading(false)
        playSound('error')
        setMessage('⚠️ Staff card — please scan a student ID card')
        if ('vibrate' in navigator) navigator.vibrate([100, 100, 100])
        lockTimerRef.current = setTimeout(dismissLock, 3000)
        return
      }
      const sid = parsed.studentId || parsed.STUDENTID || parsed.userId || parsed.USERID
      if (sid) resolvedQr = sid
    } catch {
      /* Raw QR string — try teacher endpoint first */
      const loc2 = locationRef.current
      try {
        const tr = await apiFetch('/api/timetable/teacher-attendance/wattaman-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qrCode: resolvedQr,
            ...(loc2 ? { latitude: loc2.latitude, longitude: loc2.longitude, location: `${loc2.latitude.toFixed(6)}, ${loc2.longitude.toFixed(6)}` } : {}),
          }),
        })
        if (tr.ok) {
          setIsLoading(false)
          const data = await tr.json()
          const isAlready = data.action === 'ALREADY_RECORDED'
          if (isAlready) playSound('already'); else playSound('success')
          const fc = isAlready ? 'rgba(99,102,241,0.4)' : data.status === 'LATE' ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.4)'
          setFlashColor(fc); setTimeout(() => setFlashColor(null), 500)
          if (!isAlready) setScanCount(c => c + 1)
          const mapped: ScanResult = {
            action: data.action,
            studentId: data.teacherId,
            studentName: `🎓 ${data.teacherName}`,
            studentPhoto: null,
            className: data.subjectName ? `${data.subjectName}${data.className ? ` · ${data.className}` : ''}` : data.className,
            status: data.status,
            session: data.period,
            checkInTime: data.checkIn,
          }
          setLastResult(mapped)
          setProfileVisible(true)
          setScanHistory(prev => [mapped, ...prev].slice(0, 30))
          if ('vibrate' in navigator) navigator.vibrate(isAlready ? [80] : 200)
          setTimeout(() => {
            setProfileVisible(false)
            setTimeout(dismissLock, 300)
          }, isAlready ? 2200 : 2800)
          return
        }
      } catch { /* fall through to student endpoint */ }
    }

    const loc = locationRef.current
    try {
      const res = await apiFetch('/api/attendance/wattaman/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrData: resolvedQr,
          ...(loc ? { latitude: loc.latitude, longitude: loc.longitude, location: `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}` } : {}),
        }),
      })
      setIsLoading(false)
      if (res.ok) {
        const result: ScanResult = await res.json()
        if ((result as any).action === 'UNMATCHED' || (result as any).unmatched) {
          playSound('error')
          setLinkCardQr(((result as any).qrValue as string) || resolvedQr)
          setLinkSearch('')
          setLinkResults([])
          setLinkError('')
          if ('vibrate' in navigator) navigator.vibrate([60, 40, 60])
          return
        }
        const isAlready = result.action === 'ALREADY_RECORDED'
        const isDayOff = result.action === 'DAY_OFF'
        if (isDayOff) playSound('error')
        else if (isAlready) playSound('already')
        else playSound('success')
        const meta = statusMeta(result.action, result.status)
        if (!isDayOff) { setFlashColor(meta.flash); setTimeout(() => setFlashColor(null), 500) }
        if (!isAlready && !isDayOff) setScanCount(c => c + 1)
        try {
          const key = `wattaman_scans_${todayCambodia()}`
          const saved = JSON.parse(localStorage.getItem(key) || '[]')
          saved.unshift({ action: result.action, status: result.status, studentName: result.studentName, className: result.className, time: new Date().toISOString() })
          localStorage.setItem(key, JSON.stringify(saved.slice(0, 200)))
          window.dispatchEvent(new StorageEvent('storage', { key }))
        } catch { /* storage unavailable */ }
        setLastResult(result)
        setProfileVisible(true)
        setScanHistory(prev => [result, ...prev].slice(0, 30))
        if ('vibrate' in navigator) navigator.vibrate(isAlready ? [80] : 200)
        setTimeout(() => {
          setProfileVisible(false)
          setTimeout(dismissLock, 300)
        }, isAlready ? 2200 : 2800)
      } else {
        playSound('error')
        const errBody = await res.json().catch(() => ({}))
        const serverMsg = errBody.message || ''
        const msg = res.status === 404
          ? serverMsg ? `❌ ${serverMsg}` : '❌ Student not recognised — check ID card'
          : res.status >= 500 ? '⚠️ Server error — try again' : serverMsg || '❌ Scan failed — try again'
        setMessage(msg)
        if ('vibrate' in navigator) navigator.vibrate([100, 100, 100])
        lockTimerRef.current = setTimeout(dismissLock, res.status === 404 ? 5000 : 3000)
      }
    } catch (err) {
      setIsLoading(false)
      playSound('error')
      const isOffline = !navigator.onLine || (err instanceof TypeError && err.message.includes('fetch'))
      setMessage(isOffline ? '📡 No internet — check connection' : '⚠️ Network error — try again')
      lockTimerRef.current = setTimeout(dismissLock, 3000)
    }
  }, [playSound, dismissLock])

  const linkCardToStudent = useCallback(async (studentId: string) => {
    if (!linkCardQr || linkSaving) return
    setLinkSaving(true)
    setLinkError('')
    try {
      const res = await apiFetch('/api/card-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrValue: linkCardQr, studentId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLinkError(body?.message || 'Failed to link card')
        setLinkSaving(false)
        return
      }
      playSound('success')
      const linkedQr = linkCardQr
      closeLinkModal()
      setTimeout(() => { handleQrScanned(linkedQr) }, 150)
    } catch {
      setLinkError('Network error — try again')
      setLinkSaving(false)
    }
  }, [linkCardQr, linkSaving, playSound, closeLinkModal, handleQrScanned])

  /* ── Keep input focused + handle scanner keyboard input ── */
  useEffect(() => {
    const inputEl = inputRef.current
    if (!inputEl) return

    // Re-focus whenever the window is clicked/tapped (so the input doesn't lose focus)
    const refocus = (e: MouseEvent | TouchEvent) => {
      if (linkCardQr) return   // don't steal focus from link modal
      const target = e.target as HTMLElement
      if (!target.closest('[data-modal]')) inputEl.focus()
    }
    document.addEventListener('mousedown', refocus)
    document.addEventListener('touchstart', refocus)

    const onKeyDown = (e: KeyboardEvent) => {
      if (linkCardQr) return   // modal is open — don't intercept
      const now = Date.now()

      // Mark device as active and record timestamp
      lastActivityTimeRef.current = now
      setDeviceActive(true)
      setLastActivityStr(new Date().toLocaleTimeString())
      if (deviceTimerRef.current) clearTimeout(deviceTimerRef.current)
      deviceTimerRef.current = setTimeout(() => setDeviceActive(false), 3000)

      // If there's a gap > 200ms between keystrokes, reset buffer (differentiates scanner from human)
      if (now - lastKeyTimeRef.current > 200 && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        e.preventDefault()
        const code = bufferRef.current.trim()
        bufferRef.current = ''
        setBufferDisplay('')
        if (code.length > 0) {
          if (testMode) {
            // Test mode: show raw value without calling API
            setTestResult(code)
            lockRef.current = false
          } else {
            handleQrScanned(code)
          }
        }
        return
      }
      // Only accumulate printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key
        setBufferDisplay(bufferRef.current)
        setTestResult(null)  // clear test result while typing
      }
    }
    inputEl.addEventListener('keydown', onKeyDown)
    inputEl.focus()

    return () => {
      inputEl.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', refocus)
      document.removeEventListener('touchstart', refocus)
    }
  }, [linkCardQr, handleQrScanned])

  const handleLogout = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch { /* ignore */ }
    localStorage.removeItem('role')
    router.push('/login')
  }, [router])

  const sessionBadgeColor = activeSession?.badge === 'Active'
    ? 'bg-emerald-500 text-white'
    : activeSession?.badge === 'Near'
      ? 'bg-amber-400 text-white'
      : 'bg-slate-200 text-slate-600'

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        title="Wattaman"
        subtitle="USB Scanner"
        navItems={wattamanNav}
        accentColor="emerald"
        bottomTabs={['/wattaman', '/wattaman/scan', '/wattaman/usb-scan', '/wattaman/teacher-scan', '/wattaman/teacher-reports']}
      />

      {/* ── Flash overlay ── */}
      {flashColor && (
        <div className="fixed inset-0 z-50 pointer-events-none transition-opacity"
          style={{ background: flashColor, opacity: 1 }} />
      )}

      {/* Hidden input that captures USB scanner keystrokes */}
      <input
        ref={inputRef}
        type="text"
        className="sr-only"
        aria-label="USB scanner input"
        autoFocus
        readOnly
      />

      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🖲️</span>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">USB Scanner Mode</h1>
              <p className="text-xs text-slate-500">Connect your QR scanner device and scan cards</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeSession && (
              <button onClick={() => {}} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sessionBadgeColor}`}>
                {activeSession.badge === 'Active' ? '● ' : activeSession.badge === 'Near' ? '◎ ' : '○ '}
                S{activeSession.session} {activeSession.startTime}–{activeSession.endTime}
              </button>
            )}
            <span className="text-sm font-mono font-semibold text-slate-600 tabular-nums">{clockStr}</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 p-4 sm:p-6 max-w-5xl w-full mx-auto">

          {/* ── Left: Scanner zone ── */}
          <div className="flex-1 flex flex-col gap-4">

            {/* ── Device connection status ── */}
            <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition-all duration-500 ${
              deviceActive
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-all duration-300 ${
                deviceActive ? 'bg-emerald-500 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]' : 'bg-slate-300'
              }`}
                style={deviceActive ? { animation: 'ping 1s ease-in-out 1' } : undefined}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  deviceActive ? 'text-emerald-700' : 'text-slate-500'
                }`}>
                  {deviceActive ? '🔌 Scanner Connected & Active' : '⏸ Waiting for scanner input…'}
                </p>
                {lastActivityStr && (
                  <p className="text-xs text-slate-400">Last activity: {lastActivityStr}</p>
                )}
                {!lastActivityStr && (
                  <p className="text-xs text-slate-400">Plug in USB scanner, then press any button on it or scan a code</p>
                )}
              </div>
              <button
                onClick={() => {
                  setTestMode(t => !t)
                  setTestResult(null)
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex-shrink-0 ${
                  testMode
                    ? 'bg-violet-500 text-white border-violet-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-600'
                }`}
              >
                {testMode ? '🧪 Test Mode ON' : 'Test Mode'}
              </button>
            </div>

            {/* Test mode result */}
            {testMode && (
              <div className="rounded-xl border-2 border-violet-200 bg-violet-50 px-4 py-3">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">🧪 Test Mode — scan without recording</p>
                {testResult ? (
                  <div className="mt-2 bg-white rounded-lg px-3 py-2.5 border border-violet-200">
                    <p className="text-xs text-slate-400 mb-1">Raw QR value received from scanner:</p>
                    <p className="font-mono text-sm text-slate-800 break-all">{testResult}</p>
                    <p className="text-xs text-emerald-600 mt-1.5 font-medium">✓ Scanner is sending data correctly</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Scan any card to see its raw QR value — attendance will NOT be recorded</p>
                )}
              </div>
            )}

            {/* Scanner status card */}
            <div className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
              isLoading
                ? 'border-amber-300 bg-amber-50'
                : message && message.startsWith('❌')
                  ? 'border-red-300 bg-red-50'
                  : message
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-emerald-300 bg-emerald-50'
            }`}>
              <div className={`px-5 py-3 flex items-center gap-3 ${
                isLoading ? 'bg-amber-400' : message ? 'bg-red-500' : 'bg-emerald-500'
              }`}>
                <span className="text-white text-xl">
                  {isLoading ? '⏳' : message ? '⚠️' : '✅'}
                </span>
                <span className="text-white font-bold text-sm">
                  {isLoading ? 'Processing…' : message ? 'Scan Error' : 'Ready to Scan'}
                </span>
                {scanCount > 0 && !isLoading && !message && (
                  <span className="ml-auto text-white/80 text-xs font-medium">{scanCount} scanned today</span>
                )}
              </div>

              <div className="px-5 py-6 flex flex-col items-center gap-4">
                {/* Scanner icon */}
                <div className={`w-24 h-24 rounded-2xl flex items-center justify-center text-5xl shadow-inner ${
                  isLoading ? 'bg-amber-100 animate-pulse' : message ? 'bg-red-100' : 'bg-white'
                }`}>
                  {isLoading ? '🔄' : '🖲️'}
                </div>

                {/* Buffer display */}
                {bufferDisplay && (
                  <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Reading:</span>
                    <span className="font-mono text-sm text-slate-700 truncate flex-1">{bufferDisplay}</span>
                    <span className="w-2 h-4 bg-emerald-500 animate-pulse rounded-sm" />
                  </div>
                )}

                {/* Message */}
                {message ? (
                  <p className="text-center font-semibold text-sm text-red-700">{message}</p>
                ) : !bufferDisplay && (
                  <p className="text-center text-sm text-slate-500">
                    {isLoading
                      ? 'Sending to server…'
                      : 'Point the USB scanner at a student QR card and scan'}
                  </p>
                )}

                {/* Scan line animation when idle */}
                {!isLoading && !message && (
                  <div className="w-full max-w-xs h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full"
                      style={{ animation: 'usbScanPulse 2s ease-in-out infinite' }} />
                  </div>
                )}
              </div>
            </div>

            {/* Last result */}
            <div className={`transition-all duration-300 ${profileVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              {lastResult && <StudentProfileCard result={lastResult} />}
            </div>

            {/* How it works */}
            <div className="rounded-xl bg-white border border-slate-200 p-4 text-sm text-slate-600 space-y-2">
              <p className="font-semibold text-slate-700 flex items-center gap-2">
                <span>ℹ️</span> How USB Scanner Mode Works
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
                <li>Connect your USB QR/barcode scanner to this computer</li>
                <li>The scanner acts like a keyboard — keep this page open and focused</li>
                <li>Scan a student&apos;s QR card — attendance is recorded automatically</li>
                <li>Works with any HID-compatible USB barcode or QR scanner device</li>
                <li>No camera or mobile app needed</li>
              </ul>
            </div>
          </div>

          {/* ── Right: Scan history ── */}
          <div className="lg:w-72 xl:w-80 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-700 text-sm">Recent Scans</h2>
              {scanHistory.length > 0 && (
                <button onClick={() => setScanHistory([])}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors">
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] lg:max-h-full pr-0.5">
              {scanHistory.length === 0 ? (
                <div className="rounded-xl bg-white border border-dashed border-slate-200 px-4 py-8 text-center">
                  <p className="text-2xl mb-1">📋</p>
                  <p className="text-xs text-slate-400">No scans yet</p>
                </div>
              ) : (
                scanHistory.map((r, i) => {
                  const meta = statusMeta(r.action, r.status)
                  return (
                    <div key={i} className={`rounded-xl flex items-center gap-3 px-3 py-2.5 border ${meta.cardBg} ring-1 ${meta.ring}`}>
                      {r.studentPhoto ? (
                        <img src={r.studentPhoto} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-xl flex-shrink-0">👤</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{r.studentName}</p>
                        <p className="text-xs text-slate-500 truncate">{r.className}</p>
                      </div>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${meta.bg} text-white flex-shrink-0`}>
                        {meta.label.replace(/^[^\w]+/, '')}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Animation styles ── */}
      <style jsx global>{`
        @keyframes usbScanPulse {
          0%, 100% { width: 0%; margin-left: 0%; }
          50% { width: 60%; margin-left: 20%; }
        }
      `}</style>

      {/* ── Link unknown card modal ── */}
      {linkCardQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          data-modal>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-0 overflow-hidden"
            data-modal>
            <div className="bg-amber-500 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-base">Unknown Card</p>
                <p className="text-white/80 text-xs mt-0.5">Link this card to a student</p>
              </div>
              <button onClick={closeLinkModal}
                className="text-white/80 hover:text-white text-2xl leading-none transition-colors">×</button>
            </div>
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs text-slate-500 font-mono mb-3 break-all bg-slate-50 rounded-lg px-3 py-2">{linkCardQr}</p>
              <input
                type="text"
                placeholder="Search student by name or ID…"
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                autoFocus
              />
            </div>
            <div className="px-5 pb-5 max-h-64 overflow-y-auto flex flex-col gap-2 mt-2">
              {linkLoading && <p className="text-center text-xs text-slate-400 py-4">Searching…</p>}
              {!linkLoading && linkResults.length === 0 && linkSearch.trim() && (
                <p className="text-center text-xs text-slate-400 py-4">No students found</p>
              )}
              {!linkLoading && linkResults.map(s => (
                <button key={s.id}
                  onClick={() => linkCardToStudent(s.id)}
                  disabled={linkSaving}
                  className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-2.5 hover:bg-amber-50 active:bg-amber-100 border border-transparent hover:border-amber-200 transition-all disabled:opacity-50">
                  {(s.photo || s.user.photo) ? (
                    <img src={(s.photo || s.user.photo)!} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">👤</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.user.name}</p>
                    <p className="text-xs text-slate-500">{s.studentNumber} · {s.class?.name ?? '—'}</p>
                  </div>
                  <span className="text-amber-500 text-sm">Link →</span>
                </button>
              ))}
              {linkError && <p className="text-xs text-red-500 text-center">{linkError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function UsbScanPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN', 'ADMIN']}>
      <UsbScanContent />
    </AuthGuard>
  )
}
