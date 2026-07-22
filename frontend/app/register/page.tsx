'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '../../lib/api'

interface PublicClass {
  id: string
  name: string
  subject: string | null
  registrationStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN'
  studyYear: { label: string | null; year: number } | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PHOTO_BYTES = 3 * 1024 * 1024 // 3MB source file cap

export default function StudentRegisterPage() {
  const [classes, setClasses] = useState<PublicClass[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)

  const [classId, setClassId] = useState('')
  const [nameKh, setNameKh] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [codeSent, setCodeSent] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [code, setCode] = useState('')
  const [codeNotice, setCodeNotice] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [classesLoadError, setClassesLoadError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/class-registrations/public/classes')
        if (res.ok) {
          setClasses(await res.json())
        } else {
          setClassesLoadError(`Failed to load classes (${res.status}). Please try again later.`)
        }
      } catch {
        setClassesLoadError('Failed to load classes. Please check your connection and try again.')
      } finally {
        setLoadingClasses(false)
      }
    })()
  }, [])

  const emailValid = EMAIL_RE.test(email.trim())

  const handleSendCode = async () => {
    if (!emailValid) return
    setSendingCode(true)
    setCodeNotice(null)
    setError(null)
    try {
      const res = await apiFetch('/api/class-registrations/public/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setCodeSent(true)
        setCodeNotice('A 6-digit code has been sent to your email. It expires in 10 minutes.')
      } else {
        const j = await res.json().catch(() => ({}))
        setError(j.message || 'Failed to send verification code')
      }
    } catch {
      setError('Failed to send verification code')
    } finally {
      setSendingCode(false)
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setPhotoError(null)
    if (!file) { setPhoto(null); return }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo must be smaller than 3MB')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const canSubmit =
    classId && nameKh.trim() && nameEn.trim() && emailValid && phone.trim() && codeSent && /^\d{6}$/.test(code)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/class-registrations/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          nameKh: nameKh.trim(),
          nameEn: nameEn.trim(),
          email: email.trim(),
          phone: phone.trim(),
          photo: photo || undefined,
          code: code.trim(),
        }),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        const j = await res.json().catch(() => ({}))
        setError(j.message || 'Failed to submit registration')
      }
    } catch {
      setError('Failed to submit registration')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-6 text-center">
          <Link href="/" className="text-xs text-indigo-600 hover:underline">← Back to home</Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">🎓 Student Registration</h1>
          <p className="text-sm text-slate-500 mt-1">Register for a class — your request will be reviewed by an admin before your account is activated.</p>
        </div>

        {success ? (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-semibold text-slate-800">Registration submitted</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your registration is pending review. We'll email you at <span className="font-medium text-slate-700">{email}</span> once an admin approves or rejects it.
            </p>
            <Link href="/" className="btn-primary inline-flex mt-6">Back to home</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <div>
              <label className="form-label">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} required disabled={loadingClasses}>
                <option value="">{loadingClasses ? 'Loading classes…' : 'Select a class…'}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.registrationStatus !== 'AVAILABLE'}>
                    {c.name}{c.subject ? ` — ${c.subject}` : ''}{c.registrationStatus !== 'AVAILABLE' ? ' (Closed)' : ''}
                  </option>
                ))}
              </select>
              {!loadingClasses && classesLoadError && (
                <p className="text-xs text-red-600 mt-1">{classesLoadError}</p>
              )}
              {!loadingClasses && !classesLoadError && classes.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No classes are currently open for registration.</p>
              )}
            </div>

            <div>
              <label className="form-label">Full Name (Khmer) — ឈ្មោះពេញជាភាសាខ្មែរ</label>
              <input type="text" value={nameKh} onChange={(e) => setNameKh(e.target.value)} required placeholder="សុខ សុភា" />
            </div>

            <div>
              <label className="form-label">Full Name (English)</label>
              <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required placeholder="Sok Sophea" />
            </div>

            <div>
              <label className="form-label">Phone Number</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="012 345 678" />
            </div>

            <div>
              <label className="form-label">Photo <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-sm" />
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
              {photo && (
                <img src={photo} alt="Preview" className="mt-2 w-20 h-20 rounded-lg object-cover border border-slate-200" />
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="form-label">Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setCode('') }}
                  required
                  placeholder="you@example.com"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!emailValid || sendingCode}
                  className="btn-outline whitespace-nowrap disabled:opacity-50"
                >
                  {sendingCode ? 'Sending…' : codeSent ? 'Resend' : 'Send Code'}
                </button>
              </div>
              {codeNotice && <p className="text-xs text-emerald-600 mt-1">{codeNotice}</p>}
            </div>

            {codeSent && (
              <div>
                <label className="form-label">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  placeholder="123456"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={!canSubmit || submitting} className="btn-primary w-full justify-center disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Registration'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
