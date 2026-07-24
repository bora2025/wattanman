'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '../../lib/api'

interface PublicClass {
  id: string
  name: string
  subject: string | null
  registrationStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN'
  studyYear: { label: string | null; year: number } | null
}

type FieldMode = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN'

interface FormConfig {
  settings: { khmerNameMode: FieldMode; phoneMode: FieldMode; emailMode: FieldMode; photoMode: FieldMode }
  fields: { id: string; key: string; label: string; required: boolean }[]
}

const DEFAULT_FORM_CONFIG: FormConfig = {
  settings: { khmerNameMode: 'REQUIRED', phoneMode: 'REQUIRED', emailMode: 'REQUIRED', photoMode: 'OPTIONAL' },
  fields: [],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PHOTO_BYTES = 3 * 1024 * 1024 // 3MB source file cap
const MIN_PASSWORD_LENGTH = 6

export default function StudentRegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const searchParams = useSearchParams()
  const urlClassId = searchParams.get('classId') || ''

  const [classes, setClasses] = useState<PublicClass[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG)

  const [classId, setClassId] = useState(urlClassId)
  const [nameKh, setNameKh] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})

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

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/class-registrations/public/form-config')
        if (res.ok) setFormConfig(await res.json())
      } catch {
        // Fall back to the default (all built-in fields required, no custom fields)
      }
    })()
  }, [])

  const { khmerNameMode, phoneMode, emailMode, photoMode } = formConfig.settings

  const emailTrimmed = email.trim()
  const phoneTrimmed = phone.trim()
  const emailFormatOk = EMAIL_RE.test(emailTrimmed)

  // Email and Phone are each independently Required/Optional/Hidden (admin-configured,
  // never both Hidden at once — enforced server-side too). Whichever one is REQUIRED
  // must be present/valid on its own; if NEITHER is required, at least one of them
  // still has to be filled in, mirroring the backend's baseline safety net.
  const identifierOk =
    (emailMode !== 'REQUIRED' || (emailTrimmed !== '' && emailFormatOk)) &&
    (phoneMode !== 'REQUIRED' || phoneTrimmed !== '') &&
    (emailMode === 'REQUIRED' || phoneMode === 'REQUIRED' || emailFormatOk || phoneTrimmed !== '')

  const passwordValid = password.length >= MIN_PASSWORD_LENGTH
  const passwordsMatch = password === confirmPassword

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
    classId &&
    (khmerNameMode !== 'REQUIRED' || nameKh.trim()) &&
    nameEn.trim() &&
    identifierOk &&
    (photoMode !== 'REQUIRED' || photo) &&
    passwordValid &&
    passwordsMatch &&
    formConfig.fields.every((f) => !f.required || customFieldValues[f.key]?.trim())

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
          nameKh: khmerNameMode === 'HIDDEN' ? undefined : nameKh.trim(),
          nameEn: nameEn.trim(),
          // Only ever send email if it's actually a valid address — if it isn't
          // (e.g. leftover/duplicate text) and a phone was given, it's just dropped.
          email: emailMode === 'HIDDEN' ? undefined : (emailFormatOk ? emailTrimmed : undefined),
          phone: phoneMode === 'HIDDEN' ? undefined : phoneTrimmed || undefined,
          password,
          photo: photoMode === 'HIDDEN' ? undefined : photo || undefined,
          customFieldValues,
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
              Your registration is pending review.{' '}
              {emailTrimmed
                ? <>We'll email you at <span className="font-medium text-slate-700">{emailTrimmed}</span> once an admin approves or rejects it.</>
                : <>An admin will review your request soon.</>}
              {' '}Once approved, log in with the {emailTrimmed ? 'email' : 'phone number'} and password you just set.
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

            {khmerNameMode !== 'HIDDEN' && (
              <div>
                <label className="form-label">
                  Full Name (Khmer) — ឈ្មោះពេញជាភាសាខ្មែរ
                  {khmerNameMode === 'OPTIONAL' && <span className="text-slate-400 font-normal text-xs"> (optional)</span>}
                </label>
                <input type="text" value={nameKh} onChange={(e) => setNameKh(e.target.value)} required={khmerNameMode === 'REQUIRED'} placeholder="សុខ សុភា" />
              </div>
            )}

            <div>
              <label className="form-label">Full Name (English)</label>
              <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required placeholder="Sok Sophea" />
            </div>

            {phoneMode !== 'HIDDEN' && (
              <div>
                <label className="form-label">
                  Phone Number
                  {phoneMode === 'OPTIONAL' && <span className="text-slate-400 font-normal text-xs"> (optional)</span>}
                </label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} required={phoneMode === 'REQUIRED'} placeholder="012 345 678" />
              </div>
            )}

            {emailMode !== 'HIDDEN' && (
              <div>
                <label className="form-label">
                  Email
                  {emailMode === 'OPTIONAL' && (
                    <span className="text-slate-400 font-normal text-xs">
                      {' '}({phoneTrimmed ? 'you can leave this blank — you already entered a phone number above' : 'optional'})
                    </span>
                  )}
                </label>
                <input
                  // type="text", not "email" — the browser's own type="email" format
                  // validation would block submission natively even when our own JS
                  // validation intentionally allows non-email text here once a phone
                  // number covers the requirement, regardless of the required attribute.
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={emailMode === 'REQUIRED'}
                  placeholder={emailMode !== 'REQUIRED' && phoneTrimmed ? 'Leave blank' : 'you@example.com'}
                />
                {email.length > 0 && !emailFormatOk && emailMode !== 'REQUIRED' && phoneTrimmed ? (
                  // A phone number already satisfies the requirement, so this is just an
                  // FYI — it won't block submission, and won't be sent since it isn't a
                  // valid email.
                  <p className="text-xs text-slate-400 mt-1">
                    This won't be submitted since it isn't a valid email — you're all set with the phone number entered above.
                  </p>
                ) : email.length > 0 && !emailFormatOk && /^[\d\s+()-]+$/.test(emailTrimmed) ? (
                  <p className="text-xs text-red-600 mt-1">That looks like a phone number{phoneMode !== 'HIDDEN' ? ' — enter it in the Phone Number field above instead, and leave this blank' : ''}.</p>
                ) : email.length > 0 && !emailFormatOk && (
                  <p className="text-xs text-red-600 mt-1">Enter a valid email address</p>
                )}
                {emailMode !== 'REQUIRED' && !emailTrimmed && !phoneTrimmed && phoneMode !== 'REQUIRED' && (
                  <p className="text-xs text-red-600 mt-1">Enter an email or a phone number above</p>
                )}
              </div>
            )}

            {photoMode !== 'HIDDEN' && (
              <div>
                <label className="form-label">
                  Photo {photoMode === 'OPTIONAL' && <span className="text-slate-400 font-normal text-xs">(optional)</span>}
                </label>
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-sm" required={photoMode === 'REQUIRED'} />
                {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
                {photo && (
                  <img src={photo} alt="Preview" className="mt-2 w-20 h-20 rounded-lg object-cover border border-slate-200" />
                )}
              </div>
            )}

            {formConfig.fields.map((f) => (
              <div key={f.id}>
                <label className="form-label">
                  {f.label}
                  {!f.required && <span className="text-slate-400 font-normal text-xs"> (optional)</span>}
                </label>
                <input
                  type="text"
                  value={customFieldValues[f.key] || ''}
                  onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  required={f.required}
                />
              </div>
            ))}

            <div className="pt-2 border-t border-slate-100">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
              {password.length > 0 && !passwordValid && (
                <p className="text-xs text-red-600 mt-1">Password must be at least {MIN_PASSWORD_LENGTH} characters</p>
              )}
            </div>

            <div>
              <label className="form-label">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter your password"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>

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
