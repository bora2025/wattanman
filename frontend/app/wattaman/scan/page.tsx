"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserQRCodeReader } from '@zxing/library'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { wattamanNav } from '../../../lib/wattaman-nav'
import { apiFetch } from '../../../lib/api'

interface ScanResult {
  action: string
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
    return { label: '↩ Already Checked In', bg: 'bg-indigo-500', cardBg: 'bg-indigo-50', ring: 'ring-indigo-300', text: 'text-indigo-600', flash: 'rgba(99,102,241,0.4)' }
  if (status === 'LATE')
    return { label: '⚠️ Late', bg: 'bg-amber-500', cardBg: 'bg-amber-50', ring: 'ring-amber-300', text: 'text-amber-600', flash: 'rgba(251,191,36,0.35)' }
  if (status === 'DAY_OFF')
    return { label: '🌙 Day Off', bg: 'bg-slate-400', cardBg: 'bg-slate-100', ring: 'ring-slate-300', text: 'text-slate-500', flash: 'rgba(148,163,184,0.35)' }
  return { label: '✓ Present', bg: 'bg-emerald-500', cardBg: 'bg-emerald-50', ring: 'ring-emerald-300', text: 'text-emerald-600', flash: 'rgba(52,211,153,0.4)' }
}

// Defined at module level so React never treats these as new types on re-render
function StudentProfileCard({ result }: { result: ScanResult }) {
  const meta = statusMeta(result.action, result.status)
  const isAlready = result.action === 'ALREADY_RECORDED'
  const checkInDisplay = result.checkInTime
    ? new Date(result.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null
  return (
    <div className={`rounded-2xl overflow-hidden shadow-2xl ${meta.cardBg} ring-2 ${meta.ring}`}>
      <div className={`${meta.bg} px-4 py-2.5 flex items-center justify-between`}>
        <span className="text-white text-sm font-bold tracking-wide">{meta.label}</span>
        {isAlready && checkInDisplay && (
          <span className="text-white/90 text-xs">First in at {checkInDisplay}</span>
        )}
      </div>
      <div className="flex items-center gap-4 p-4">
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
          {result.session > 0 && <p className="text-xs text-slate-400 mt-0.5">Session {result.session}</p>}
          {!isAlready && checkInDisplay && (
            <p className={`text-sm font-bold mt-1.5 ${meta.text}`}>Checked in at {checkInDisplay}</p>
          )}
          {isAlready && <p className="text-xs text-indigo-600 font-medium mt-1">Already recorded — no duplicate</p>}
        </div>
      </div>
    </div>
  )
}

function ScanSkeletonCard({ photo }: { photo?: string | null }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-xl bg-white ring-2 ring-slate-200">
      <div className="bg-slate-200 px-4 py-2.5 h-10 animate-pulse" />
      <div className="flex items-center gap-4 p-4">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex-shrink-0 overflow-hidden bg-slate-200">
          {photo
            ? <img src={photo} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full animate-pulse" />}
        </div>
        <div className="flex-1 space-y-2.5">
          <div className="h-5 bg-slate-200 rounded-lg animate-pulse w-3/4" />
          <div className="h-3 bg-slate-100 rounded-lg animate-pulse w-1/2" />
          <div className="h-3 bg-slate-100 rounded-lg animate-pulse w-2/5" />
        </div>
      </div>
    </div>
  )
}

function StudentScanZone({ isLandscape }: { isLandscape: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
      <div className={`relative ${
        isLandscape
          ? 'w-52 h-52 md:w-64 md:h-64'
          : 'w-[62vw] h-[62vw] max-w-xs max-h-[300px] sm:max-w-sm sm:max-h-[340px] md:max-w-md md:max-h-[380px]'
      }`}>
        <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />
        <div className="absolute top-0 left-0 w-10 h-10 sm:w-12 sm:h-12 border-t-4 border-l-4 border-teal-400 rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-10 h-10 sm:w-12 sm:h-12 border-t-4 border-r-4 border-teal-400 rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-10 h-10 sm:w-12 sm:h-12 border-b-4 border-l-4 border-teal-400 rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-10 h-10 sm:w-12 sm:h-12 border-b-4 border-r-4 border-teal-400 rounded-br-2xl" />
        <div
          className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent drop-shadow-[0_0_6px_rgba(0,201,167,0.9)]"
          style={{ animation: 'scanLine 2s linear infinite' }}
        />
      </div>
    </div>
  )
}

function WattamanScanContent() {
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [allCameras, setAllCameras] = useState<MediaDeviceInfo[]>([])
  const [currentCamIdx, setCurrentCamIdx] = useState(0)
  const [cameraLabel, setCameraLabel] = useState('')
  const [flashColor, setFlashColor] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([])
  const [scanCount, setScanCount] = useState(0)
  const [isLandscape, setIsLandscape] = useState(false)
  const [profileVisible, setProfileVisible] = useState(false)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null)
  const allCamerasRef = useRef<MediaDeviceInfo[]>([])
  const currentCamIdxRef = useRef(0)
  const lockRef = useRef(false)
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const torchTrackRef = useRef<MediaStreamTrack | null>(null)
  const photoCacheRef = useRef<Map<string, string>>(new Map())
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── orientation detection ── */
  useEffect(() => {
    const check = () =>
      setIsLandscape(window.matchMedia('(orientation: landscape) and (min-width: 600px)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  /* ── auto-start ── */
  useEffect(() => {
    setScanning(true)
    setMessage('Initializing camera…')
  }, [])

  /* ── sounds ── */
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
    setPendingPhoto(null)
    setIsLoading(false)
  }, [])

  /* ── QR handler ── */
  const handleQrScanned = useCallback(async (qrData: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setIsLoading(true)
    setProfileVisible(false)

    let resolvedQr = qrData
    try {
      const parsed = JSON.parse(qrData)
      if (parsed.staffId) {
        setIsLoading(false)
        playSound('error')
        setPendingPhoto(null)
        setMessage('⚠️ Staff card — please scan a student ID card')
        if ('vibrate' in navigator) navigator.vibrate([100, 100, 100])
        lockTimerRef.current = setTimeout(() => { setMessage(''); lockRef.current = false }, 3000)
        return
      }
      if (parsed.studentId) resolvedQr = parsed.studentId
      else if (parsed.userId) resolvedQr = parsed.userId
      // Pre-fill skeleton with cached photo if we've seen this student before
      const cachedId = parsed.studentId || parsed.userId
      if (cachedId) setPendingPhoto(photoCacheRef.current.get(cachedId) ?? null)
    } catch {
      /* Raw QR — try teacher endpoint first */
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
          const isLate = data.status === 'LATE'
          if (isAlready) playSound('already'); else playSound('success')
          const fc = isAlready ? 'rgba(99,102,241,0.4)' : isLate ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.4)'
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
            setTimeout(() => { setLastResult(null); setMessage(''); lockRef.current = false }, 300)
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
        const isAlready = result.action === 'ALREADY_RECORDED'
        const isDayOff = result.action === 'DAY_OFF'
        const isLate = result.status === 'LATE'
        if (isDayOff) playSound('error')
        else if (isAlready) playSound('already')
        else playSound('success')
        const meta = statusMeta(result.action, result.status)
        if (!isDayOff) {
          setFlashColor(meta.flash); setTimeout(() => setFlashColor(null), 500)
          if (!isAlready) setScanCount(c => c + 1)
        }
        try {
          const key = `wattaman_scans_${new Date().toISOString().split('T')[0]}`
          const saved = JSON.parse(localStorage.getItem(key) || '[]')
          saved.unshift({ action: result.action, status: result.status, studentName: result.studentName, className: result.className, time: new Date().toISOString() })
          localStorage.setItem(key, JSON.stringify(saved.slice(0, 200)))
          window.dispatchEvent(new StorageEvent('storage', { key }))
        } catch { /* storage unavailable */ }
        setLastResult(result)
        setProfileVisible(true)
        setScanHistory(prev => [result, ...prev].slice(0, 30))
        if (result.studentId && result.studentPhoto) {
          photoCacheRef.current.set(result.studentId, result.studentPhoto)
        }
        if ('vibrate' in navigator) navigator.vibrate(isAlready ? [80] : 200)
        const displayTime = isAlready ? 2200 : 2800
        setTimeout(() => {
          setProfileVisible(false)
          setTimeout(() => { setLastResult(null); setMessage(''); setPendingPhoto(null); lockRef.current = false }, 300)
        }, displayTime)
      } else {
        playSound('error')
        const errBody = await res.json().catch(() => ({}))
        const msg = res.status === 404
          ? '❌ Student not recognised — check ID card'
          : res.status >= 500
            ? '⚠️ Server error — try again'
            : errBody.message || '❌ Scan failed — try again'
        setPendingPhoto(null)
        setMessage(msg)
        if ('vibrate' in navigator) navigator.vibrate([100, 100, 100])
        lockTimerRef.current = setTimeout(() => { setMessage(''); lockRef.current = false }, 3000)
      }
    } catch (err) {
      setIsLoading(false)
      playSound('error')
      setPendingPhoto(null)
      const isOffline = !navigator.onLine || (err instanceof TypeError && err.message.includes('fetch'))
      setMessage(isOffline ? '📡 No internet — check connection' : '⚠️ Network error — try again')
      lockTimerRef.current = setTimeout(() => { setMessage(''); lockRef.current = false }, 3000)
    }
  }, [playSound])

  /* ── camera init ── */
  useEffect(() => {
    if (!scanning || !videoRef.current) return
    let cancelled = false
    const videoEl = videoRef.current
    const init = async () => {
      try {
        // Reset per-camera state before switching so stale torch/refs don't linger
        setHasTorch(false); setTorchOn(false); torchTrackRef.current = null

        if (codeReaderRef.current) { codeReaderRef.current.reset(); codeReaderRef.current = null }
        videoEl.pause()
        if (videoEl.srcObject) {
          (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop())
          videoEl.srcObject = null
        }
        await new Promise(r => setTimeout(r, 300))
        if (cancelled) return
        const reader = new BrowserQRCodeReader()
        reader.timeBetweenDecodingAttempts = 30
        codeReaderRef.current = reader
        // Always re-enumerate: before any getUserMedia call, browsers may return
        // empty-string deviceIds for privacy. Re-enumerate every init so switching
        // cameras always gets valid deviceIds (populated once permission is granted).
        const cameras = await reader.listVideoInputDevices()
        allCamerasRef.current = cameras
        if (!cancelled) setAllCameras([...cameras])
        if (cancelled) return
        // Guard against index going out-of-range if enumeration result changed
        let idx = currentCamIdxRef.current
        if (idx >= cameras.length) { idx = 0; currentCamIdxRef.current = 0; setCurrentCamIdx(0) }
        const deviceId = cameras[idx]?.deviceId || null   // "" → null (use default)
        if (!cancelled) setCameraLabel(cameras[idx]?.label || `Camera ${idx + 1}`)
        await reader.decodeFromVideoDevice(deviceId, videoEl, (result) => {
          if (cancelled || !result) return
          handleQrScanned(result.getText())
        })
        if (!cancelled && videoEl.srcObject) {
          const track = (videoEl.srcObject as MediaStream).getVideoTracks()[0]
          if (track) {
            const cap = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
            if (cap.torch) { setHasTorch(true); torchTrackRef.current = track }
          }
        }
        if (!cancelled) setMessage('')
      } catch (err: unknown) {
        if (cancelled) return
        const e = err as { name?: string }
        if (e?.name === 'NotAllowedError') setMessage('Camera access denied. Please allow camera permissions.')
        else if (e?.name === 'NotFoundError') setMessage('No camera found on this device.')
        else setMessage('Failed to start camera. Try again.')
      }
    }
    init()
    return () => {
      cancelled = true
      if (codeReaderRef.current) { codeReaderRef.current.reset(); codeReaderRef.current = null }
      if (videoEl.srcObject) {
        (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop())
        videoEl.srcObject = null
      }
    }
  }, [scanning, handleQrScanned, currentCamIdx])

  const stopScanning = () => {
    if (codeReaderRef.current) { codeReaderRef.current.reset(); codeReaderRef.current = null }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null }
    setScanning(false); setLastResult(null); setMessage('')
    lockRef.current = false; setHasTorch(false); setTorchOn(false)
    torchTrackRef.current = null; setProfileVisible(false)
  }

  const switchCamera = useCallback(() => {
    const cameras = allCamerasRef.current
    if (cameras.length <= 1) return
    const next = (currentCamIdx + 1) % cameras.length
    currentCamIdxRef.current = next; setCurrentCamIdx(next)
  }, [currentCamIdx])

  const toggleTorch = useCallback(async () => {
    if (!torchTrackRef.current) return
    try {
      await torchTrackRef.current.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn(v => !v)
    } catch { /* torch not available */ }
  }, [torchOn])

  return (
    <div className="page-shell">
      <style>{`
        @keyframes scanLine { 0%, 100% { top: 6%; } 50% { top: 90%; } }
        @keyframes flashOverlay { 0% { opacity: 0.6; } 100% { opacity: 0; } }
        @keyframes slideUp { from { transform: translateY(110%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideUpFade { from { transform: translateY(20px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(16px); } }
        .profile-enter { animation: slideUp 0.32s cubic-bezier(0.34,1.46,0.64,1) forwards; }
        .profile-exit  { animation: fadeOut 0.22s ease-in forwards; }
        .result-enter  { animation: slideUpFade 0.25s ease-out forwards; }
      `}</style>

      <Sidebar title="Wattaman" subtitle="QR Attendance" navItems={wattamanNav} accentColor="emerald"
        bottomTabs={['/wattaman', '/wattaman/scan', '/wattaman/teacher-scan', '/wattaman/teacher-reports']} />

      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* ═══════════════════════════════════════════════
            FULLSCREEN CAMERA OVERLAY
        ═══════════════════════════════════════════════ */}
        {scanning && (
          <div className={`fixed inset-0 z-50 bg-black ${isLandscape ? 'flex flex-row' : 'flex flex-col'}`}>

            {/* ── Video pane ── */}
            <div className="relative flex-1 overflow-hidden">
              <video ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay playsInline muted />

              {/* Color flash */}
              {flashColor && (
                <div className="absolute inset-0 z-20 pointer-events-none"
                  style={{ background: flashColor, animation: 'flashOverlay 0.5s ease-out forwards' }} />
              )}

              {/* Scan zone brackets + sweep line */}
              <StudentScanZone isLandscape={isLandscape} />

              {/* Processing spinner (inside zone area) */}
              {isLoading && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
                </div>
              )}

              {/* ── Top bar ── */}
              <div className="relative z-20 flex items-center justify-between px-4 pt-4 pb-2 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span className="text-white text-sm font-semibold">Wattaman Scan</span>
                  {scanCount > 0 && (
                    <div className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-bold">{scanCount} scanned</div>
                  )}
                  {cameraLabel && (
                    <span className="text-white/40 text-xs hidden sm:inline truncate max-w-[130px]">{cameraLabel}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {hasTorch && (
                    <button onClick={toggleTorch}
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-xl transition-all active:scale-90 ${torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}>
                      🔦
                    </button>
                  )}
                  {allCameras.length > 1 && (
                    <button onClick={switchCamera}
                      className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-xl text-white active:scale-90 transition-all">
                      🔄
                    </button>
                  )}
                  <button onClick={stopScanning}
                    className="w-11 h-11 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-lg active:scale-90 transition-all shadow-lg">
                    ✕
                  </button>
                </div>
              </div>

              {/* ── Bottom hint / error message ── */}
              <div className="absolute bottom-24 left-0 right-0 z-20 flex justify-center pointer-events-none px-4">
                {!lastResult && !isLoading && !message && (
                  <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 text-white/80 text-xs">
                    {isLandscape ? 'Point at student or teacher QR card' : 'Aim camera at QR code on ID card'}
                  </div>
                )}
                {message && !lastResult && (
                  message.startsWith('❌') || message.startsWith('⚠️') || message.startsWith('📡') ? (
                    <button
                      className="w-full max-w-sm px-4 py-3 rounded-2xl text-sm font-medium text-center backdrop-blur-sm bg-red-500/90 text-white pointer-events-auto active:scale-95 transition-transform"
                      onClick={dismissLock}
                    >
                      <div>{message}</div>
                      <div className="text-xs mt-1 opacity-75">Tap to scan again</div>
                    </button>
                  ) : (
                    <div className="w-full max-w-sm px-4 py-3 rounded-2xl text-sm font-medium text-center backdrop-blur-sm bg-black/60 text-white">
                      {message}
                    </div>
                  )
                )}
              </div>

              {/* ── Scan history chips ── */}
              {scanHistory.length > 0 && !lastResult && !isLoading && !isLandscape && (
                <div className="absolute bottom-14 left-0 right-0 z-20 px-3">
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {scanHistory.slice(0, 6).map((r, i) => {
                      const m = statusMeta(r.action, r.status)
                      return (
                        <div key={i}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold text-white ${m.bg} shadow`}>
                          {r.studentName.split(' ').slice(0, 2).join(' ')}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Phone: loading skeleton (bottom of video pane) ── */}
              {!isLandscape && isLoading && (
                <div className="absolute bottom-0 left-0 right-0 z-40 px-3 pb-4 profile-enter">
                  <ScanSkeletonCard photo={pendingPhoto} />
                </div>
              )}

              {/* ── Phone: result profile card (bottom sheet) ── */}
              {!isLandscape && lastResult && !isLoading && (
                <div className={`absolute bottom-0 left-0 right-0 z-40 px-3 pb-4 ${profileVisible ? 'profile-enter' : 'profile-exit'}`}>
                  <StudentProfileCard result={lastResult} />
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════
                TABLET LANDSCAPE: right info panel
            ═══════════════════════════════════════════════ */}
            {isLandscape && (
              <div className="w-72 md:w-80 xl:w-96 bg-black/85 backdrop-blur-sm flex flex-col p-4 gap-3 overflow-y-auto">
                {/* Panel header */}
                <div className="flex items-center gap-2 mb-1 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-white/80 text-sm font-semibold">Attendance Log</p>
                  {scanCount > 0 && (
                    <span className="ml-auto text-emerald-400 text-xs font-bold">{scanCount} scanned today</span>
                  )}
                </div>

                {/* Loading skeleton */}
                {isLoading && (
                  <div className="result-enter flex-shrink-0">
                    <div className="rounded-2xl overflow-hidden bg-slate-800 ring-1 ring-white/10">
                      <div className="h-9 bg-slate-700 animate-pulse" />
                      <div className="flex gap-3 p-3">
                        <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-slate-700">
                          {pendingPhoto
                            ? <img src={pendingPhoto} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full animate-pulse" />}
                        </div>
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="h-4 bg-slate-700 rounded animate-pulse w-3/4" />
                          <div className="h-3 bg-slate-600 rounded animate-pulse w-1/2" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Result card on panel */}
                {lastResult && !isLoading && (
                  <div className={`flex-shrink-0 result-enter transition-opacity duration-300 ${profileVisible ? 'opacity-100' : 'opacity-0'}`}>
                    <StudentProfileCard result={lastResult} />
                  </div>
                )}

                {/* History list */}
                <div className="space-y-2 overflow-y-auto flex-1">
                  {scanHistory.length === 0 && !isLoading && (
                    <p className="text-white/30 text-xs text-center py-8">No scans yet this session</p>
                  )}
                  {scanHistory.map((r, i) => {
                    const m = statusMeta(r.action, r.status)
                    return (
                      <div key={i} className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${m.bg}`}>
                          {r.action === 'ALREADY_RECORDED' ? '↩' : r.status === 'LATE' ? 'L' : '✓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{r.studentName}</p>
                          <p className="text-xs text-white/40 truncate">{r.className}</p>
                        </div>
                        {r.checkInTime && (
                          <span className="text-xs text-white/30 flex-shrink-0">
                            {new Date(r.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            NON-SCANNING PAGE
        ═══════════════════════════════════════════════ */}
        <div className="page-header">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Scan Student Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">Scan student or teacher QR codes — recorded instantly</p>
        </div>

        <div className="page-body space-y-4">
          {/* Big CTA */}
          <button
            onClick={() => { setScanning(true); setMessage('Initializing camera…') }}
            className="w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="relative overflow-hidden rounded-2xl shadow-lg p-6 text-white"
              style={{ background: 'linear-gradient(135deg,#00C9A7 0%,#00a88a 50%,#008f75 100%)' }}>
              <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10" />
              <div className="absolute -right-2 top-10 w-24 h-24 rounded-full bg-white/10" />
              <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white/80 text-sm font-medium">{scanning ? 'Scanner is active' : 'Ready to scan'}</p>
                  <h2 className="text-2xl font-bold mt-0.5">{scanning ? 'Scanner Running…' : 'Open QR Scanner'}</h2>
                  <p className="text-white/70 text-xs mt-1">Student &amp; teacher QR cards supported</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 text-sm font-semibold">
                    <span>{scanning ? 'Scanner active' : 'Tap to start'}</span>
                    {!scanning && <span>→</span>}
                  </div>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-4xl flex-shrink-0">📷</div>
              </div>
            </div>
          </button>

          {/* Session stats */}
          {scanCount > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">This session</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <p className="text-2xl font-bold text-slate-800">{scanCount}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Scanned</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-xl">
                  <p className="text-2xl font-bold text-emerald-600">
                    {scanHistory.filter(r => r.status === 'PRESENT' && r.action !== 'ALREADY_RECORDED').length}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Present</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-xl">
                  <p className="text-2xl font-bold text-amber-500">
                    {scanHistory.filter(r => r.status === 'LATE').length}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Late</p>
                </div>
              </div>
            </div>
          )}

          {/* Scan history list */}
          {scanHistory.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-700 text-sm">Recent Scans ({scanHistory.length})</h3>
                <button
                  onClick={() => { setScanHistory([]); setScanCount(0) }}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors py-1 px-2 rounded-lg">
                  Clear
                </button>
              </div>
              <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {scanHistory.map((r, i) => {
                  const meta = statusMeta(r.action, r.status)
                  const timeStr = r.checkInTime
                    ? new Date(r.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                    : ''
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      {r.studentPhoto ? (
                        <img src={r.studentPhoto} alt={r.studentName}
                          className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">👤</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.studentName}</p>
                        <p className="text-xs text-slate-400 truncate">{r.className}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white ${meta.bg}`}>
                          {r.action === 'ALREADY_RECORDED' ? '↩' : r.status === 'LATE' ? '⚠️ Late' : '✓'}
                        </span>
                        {timeStr && <span className="text-xs text-slate-300">{timeStr}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* How it works guide */}
          {scanHistory.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-700 text-sm mb-3">How it works</h3>
              <div className="space-y-3">
                {[
                  { icon: '📷', title: 'Open Scanner', desc: 'Tap the card above — camera starts automatically' },
                  { icon: '🪪', title: 'Point at QR Card', desc: 'Aim at student or teacher ID card QR code' },
                  { icon: '✅', title: 'Instant Record', desc: 'Profile displays and attendance is saved immediately' },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xl flex-shrink-0">{step.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{step.title}</p>
                      <p className="text-xs text-slate-400">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WattamanScanPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN', 'ADMIN']}>
      <WattamanScanContent />
    </AuthGuard>
  )
}
