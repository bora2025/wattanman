'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { wattamanNav } from '../../../lib/wattaman-nav'
import { apiFetch } from '../../../lib/api'
import Link from 'next/link'

interface TeacherScanResult {
  action: string
  teacherId: string
  teacherName: string
  period: number
  status: string
  checkIn: string | null
  subjectName: string
  className: string
  timetableName: string
  scheduledPeriods: number[]
  message?: string
}

function TeacherScanContent() {
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const [lastResult, setLastResult] = useState<TeacherScanResult | null>(null)
  const [allCameras, setAllCameras] = useState<MediaDeviceInfo[]>([])
  const [currentCamIdx, setCurrentCamIdx] = useState(0)
  const [scanHistory, setScanHistory] = useState<TeacherScanResult[]>([])
  const [flashColor, setFlashColor] = useState<'green' | 'blue' | 'amber' | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [scanCount, setScanCount] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const allCamerasRef = useRef<MediaDeviceInfo[]>([])
  const currentCamIdxRef = useRef(0)
  const lockRef = useRef(false)
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const torchTrackRef = useRef<MediaStreamTrack | null>(null)

  // GPS
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => { locationRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude } },
      () => { locationRef.current = null },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    setScanning(true)
    setMessage('Initializing camera…')
  }, [])

  const playSound = useCallback((type: 'success' | 'error' | 'already') => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const playTone = (freq: number, start: number, duration: number, vol = 0.25) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
        gain.gain.setValueAtTime(vol, ctx.currentTime + start)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + duration)
      }
      if (type === 'success') {
        playTone(880, 0, 0.12, 0.3); playTone(1108, 0.1, 0.2, 0.3)
      } else if (type === 'already') {
        playTone(660, 0, 0.1, 0.15); playTone(660, 0.15, 0.1, 0.15)
      } else {
        playTone(330, 0, 0.15); playTone(220, 0.15, 0.25)
      }
    } catch { /* audio not supported */ }
  }, [])

  const handleQrScanned = useCallback(async (qrData: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setIsLoading(true)

    // Teacher QR codes from TimetableTeacher are raw hex strings (not JSON).
    // If someone scans a student/staff JSON QR, reject it gracefully.
    let resolvedQr = qrData
    try {
      const parsed = JSON.parse(qrData)
      // Any JSON QR (studentId, staffId, userId) is not a teacher card
      if (parsed.studentId || parsed.userId || parsed.staffId) {
        setIsLoading(false)
        playSound('error')
        setMessage('⚠️ Not a teacher card — please scan a teacher ID QR code')
        if ('vibrate' in navigator) navigator.vibrate([100, 100, 100])
        setTimeout(() => { setMessage(''); lockRef.current = false }, 2500)
        return
      }
    } catch { /* raw string = teacher QR */ }

    const loc = locationRef.current
    try {
      const res = await apiFetch('/api/timetable/teacher-attendance/wattaman-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: resolvedQr,
          ...(loc ? { latitude: loc.latitude, longitude: loc.longitude, location: `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}` } : {}),
        }),
      })
      setIsLoading(false)
      if (res.ok) {
        const result: TeacherScanResult = await res.json()
        const isAlready = result.action === 'ALREADY_RECORDED'
        const isLate = result.status === 'LATE'

        if (isAlready) playSound('already')
        else playSound('success')

        const fc: 'green' | 'blue' | 'amber' = isAlready ? 'blue' : isLate ? 'amber' : 'green'
        setFlashColor(fc)
        if (!isAlready) setScanCount(c => c + 1)
        setTimeout(() => setFlashColor(null), 500)

        setLastResult(result)
        setScanHistory(prev => [result, ...prev].slice(0, 20))
        if ('vibrate' in navigator) navigator.vibrate(isAlready ? [80] : 200)

        const displayTime = isAlready ? 2000 : 2500
        setTimeout(() => {
          setLastResult(null)
          setMessage('')
          lockRef.current = false
        }, displayTime)
      } else {
        playSound('error')
        const err = await res.json().catch(() => ({}))
        setMessage(err.message || 'Teacher QR code not found in timetable')
        if ('vibrate' in navigator) navigator.vibrate([100, 100, 100])
        setTimeout(() => { setMessage(''); lockRef.current = false }, 2500)
      }
    } catch {
      setIsLoading(false)
      playSound('error')
      setMessage('Network error — check connection')
      setTimeout(() => { setMessage(''); lockRef.current = false }, 2000)
    }
  }, [playSound])

  // Camera init
  useEffect(() => {
    if (!scanning || !videoRef.current) return
    let cancelled = false
    const videoEl = videoRef.current
    const init = async () => {
      try {
        if (codeReaderRef.current) { codeReaderRef.current.reset(); codeReaderRef.current = null }
        videoEl.pause()
        if (videoEl.srcObject) {
          (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop())
          videoEl.srcObject = null
        }
        await new Promise(r => setTimeout(r, 400))
        if (cancelled) return

        const reader = new BrowserMultiFormatReader()
        codeReaderRef.current = reader

        let cameras = allCamerasRef.current
        if (cameras.length === 0) {
          cameras = await reader.listVideoInputDevices()
          cameras.sort((a, b) => (/back|rear|environment|後/i.test(a.label) ? 0 : 1) - (/back|rear|environment|後/i.test(b.label) ? 0 : 1))
          allCamerasRef.current = cameras
          if (!cancelled) setAllCameras([...cameras])
        }
        if (cancelled) return

        const idx = currentCamIdxRef.current
        const deviceId = cameras[idx]?.deviceId ?? undefined
        reader.timeBetweenDecodingAttempts = 50

        await reader.decodeFromVideoDevice(deviceId || null, videoEl, (result) => {
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
        else setMessage('Failed to start camera. Please try again.')
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
    setScanning(false)
    setLastResult(null)
    setMessage('')
    lockRef.current = false
    setHasTorch(false)
    setTorchOn(false)
    torchTrackRef.current = null
  }

  const switchCamera = useCallback(() => {
    const cameras = allCamerasRef.current
    if (cameras.length <= 1) return
    const next = (currentCamIdx + 1) % cameras.length
    currentCamIdxRef.current = next
    setCurrentCamIdx(next)
  }, [currentCamIdx])

  const toggleTorch = useCallback(async () => {
    if (!torchTrackRef.current) return
    try {
      await torchTrackRef.current.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn(v => !v)
    } catch { /* torch not supported */ }
  }, [torchOn])

  return (
    <div className="page-shell">
      <style>{`
        @keyframes scanLine { 0%, 100% { top: 0%; } 50% { top: 100%; } }
        @keyframes flashOverlay { 0% { opacity: 0.55; } 100% { opacity: 0; } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <Sidebar
        title="Wattaman"
        subtitle="Teacher Scan"
        navItems={wattamanNav}
        accentColor="emerald"
        bottomTabs={['/wattaman', '/wattaman/scan', '/wattaman/scheduled-teacher', '/wattaman/teacher-reports']}
      />
      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* Fullscreen camera */}
        {scanning && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />

            {flashColor && (
              <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{
                  background: flashColor === 'blue' ? 'rgba(99,102,241,0.4)' : flashColor === 'amber' ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.4)',
                  animation: 'flashOverlay 0.5s ease-out forwards',
                }}
              />
            )}

            {isLoading && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 rounded-full border-4 border-white/20 border-t-white animate-spin" />
              </div>
            )}

            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 sm:w-72 sm:h-72 relative">
                  <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-teal-400 rounded-tl-2xl" />
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-teal-400 rounded-tr-2xl" />
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-teal-400 rounded-bl-2xl" />
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-teal-400 rounded-br-2xl" />
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent" style={{ animation: 'scanLine 2s linear infinite' }} />
                </div>
              </div>
            </div>

            {/* Top bar */}
            <div className="relative z-20 flex items-center justify-between px-4 pt-4 pb-2 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white text-sm font-semibold">Teacher Attendance</span>
                {scanCount > 0 && (
                  <div className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-bold">{scanCount} scanned</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasTorch && (
                  <button onClick={toggleTorch} className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all active:scale-90 ${torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}>🔦</button>
                )}
                {allCameras.length > 1 && (
                  <button onClick={switchCamera} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg active:scale-90 transition-all">🔄</button>
                )}
                <button onClick={stopScanning} className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold active:scale-90 transition-all">✕</button>
              </div>
            </div>

            {/* Label below top bar */}
            <div className="relative z-20 text-center mt-2">
              <p className="text-white/70 text-xs">Point camera at teacher&apos;s ID card QR code</p>
            </div>

            {/* Message overlay */}
            {message && !lastResult && (
              <div className="absolute bottom-28 left-4 right-4 z-20">
                <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center text-white text-sm font-medium">
                  {message}
                </div>
              </div>
            )}

            {/* Result card */}
            {lastResult && (() => {
              const isAlready = lastResult.action === 'ALREADY_RECORDED'
              const isLate = lastResult.status === 'LATE'
              const checkInDisplay = lastResult.checkIn
                ? new Date(lastResult.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : null
              const cardBg = isAlready ? 'bg-indigo-50/97' : isLate ? 'bg-amber-50/97' : 'bg-emerald-50/97'
              const accentBg = isAlready ? 'bg-indigo-500' : isLate ? 'bg-amber-500' : 'bg-emerald-500'
              const accentText = isAlready ? '↩ Already Recorded' : isLate ? '⚠️ Late' : '✓ Present'
              return (
                <div className="relative z-20 mx-3 mt-2" style={{ animation: 'slideDown 0.2s ease-out' }}>
                  <div className={`rounded-2xl shadow-2xl overflow-hidden ${cardBg} backdrop-blur-sm`}>
                    <div className={`${accentBg} px-4 py-1.5 flex items-center justify-between`}>
                      <span className="text-white text-xs font-bold tracking-wide">{accentText}</span>
                      {isAlready && checkInDisplay && <span className="text-white/90 text-xs">First in at {checkInDisplay}</span>}
                    </div>
                    <div className="flex items-center gap-3 p-4">
                      <div className="w-14 h-14 rounded-xl bg-white border-2 border-slate-100 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
                        👨‍🏫
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-base leading-tight">{lastResult.teacherName}</p>
                        {lastResult.subjectName && (
                          <p className="text-xs text-slate-500 mt-0.5">{lastResult.subjectName} · {lastResult.className}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">Period {lastResult.period} · {lastResult.timetableName}</p>
                        {!isAlready && checkInDisplay && (
                          <p className="text-xs font-semibold mt-1" style={{ color: isLate ? '#d97706' : '#059669' }}>
                            Checked in at {checkInDisplay}
                          </p>
                        )}
                        {isAlready && <p className="text-xs text-indigo-600 font-medium mt-1">Already recorded — no duplicate</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Scan history strip */}
            {scanHistory.length > 0 && !lastResult && (
              <div className="absolute bottom-20 left-0 right-0 z-20 px-4">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {scanHistory.slice(0, 6).map((r, i) => (
                    <div key={i} className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-medium text-white ${r.status === 'LATE' ? 'bg-amber-500' : r.action === 'ALREADY_RECORDED' ? 'bg-indigo-500' : 'bg-emerald-600'}`}>
                      {r.teacherName.split(' ')[0]} · P{r.period}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom instruction */}
            <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center">
              <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 text-white/80 text-xs text-center">
                Scan teacher&apos;s timetable ID card QR code
              </div>
            </div>
          </div>
        )}

        {/* Non-scanning view */}
        {!scanning && (
          <div className="page-body space-y-5">
            {/* Header */}
            <div className="page-header pb-0">
              <div className="flex items-center gap-3">
                <Link href="/wattaman/scheduled-teacher" className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </Link>
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Scan Teacher QR</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Record teacher attendance from timetable</p>
                </div>
              </div>
            </div>

            {/* Big scan CTA */}
            <button onClick={() => setScanning(true)} className="block w-full active:scale-[0.98] transition-transform">
              <div className="relative overflow-hidden rounded-2xl shadow-lg p-6 text-white" style={{ background: 'linear-gradient(135deg,#00C9A7 0%,#00a88a 50%,#008f75 100%)' }}>
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -right-2 top-8 w-20 h-20 rounded-full bg-white/10" />
                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white/80 text-sm font-medium">Ready to scan</p>
                    <h2 className="text-2xl font-bold mt-0.5">Open Teacher Scanner</h2>
                    <p className="text-white/70 text-xs mt-1">Scan teacher timetable QR cards</p>
                    <div className="mt-4 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 text-sm font-semibold">
                      <span>Start Scanning</span>
                      <span>→</span>
                    </div>
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-4xl flex-shrink-0">👨‍🏫</div>
                </div>
              </div>
            </button>

            {/* Scan history */}
            {scanHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent Scans</p>
                <div className="space-y-2">
                  {scanHistory.slice(0, 8).map((r, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${r.action === 'ALREADY_RECORDED' ? 'bg-indigo-500' : r.status === 'LATE' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                        {r.status === 'LATE' ? 'L' : r.action === 'ALREADY_RECORDED' ? '↩' : '✓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.teacherName}</p>
                        <p className="text-xs text-slate-400 truncate">Period {r.period}{r.subjectName ? ` · ${r.subjectName}` : ''}{r.className ? ` · ${r.className}` : ''}</p>
                      </div>
                      {r.checkIn && (
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {new Date(r.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Guide */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-700 text-sm mb-3">How it works</h3>
              <div className="space-y-3">
                {[
                  { icon: '📷', title: 'Open Scanner', desc: 'Tap the button above' },
                  { icon: '🪪', title: 'Point at Teacher Card', desc: 'Aim at the QR code on the teacher timetable ID card' },
                  { icon: '✅', title: 'Instant Record', desc: 'Attendance recorded for the current period automatically' },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">{step.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{step.title}</p>
                      <p className="text-xs text-slate-400">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

export default function TeacherScanPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN', 'ADMIN']}>
      <TeacherScanContent />
    </AuthGuard>
  )
}
