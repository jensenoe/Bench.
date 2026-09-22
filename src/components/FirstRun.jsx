import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check } from '@phosphor-icons/react'
import Photo from './Photo.jsx'
import Connect from './Connect.jsx'
import { FIRST_RUN } from '../copy.js'

const EASE = [0.16, 1, 0.3, 1]
const Dots = ({ step }) => (
  <span className="flex items-center gap-1.5">
    {[0, 1].map(i => <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 18 : 6, background: i === step ? 'var(--accent)' : 'rgba(var(--ink-rgb),.25)' }} />)}
  </span>
)

/**
 * Shown once, before the board. Two steps: who you are, then the Microsoft sign-in.
 * The second step can be skipped; the same Connect button waits in Settings.
 */
export default function FirstRun({ scene, auth, onSave, onRefresh }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const next = async e => { e.preventDefault(); if (!ok) return; setBusy(true); try { await onSave({ name: name.trim(), email: email.trim() }); setStep(1) } finally { setBusy(false) } }
  const finish = async () => { setBusy(true); try { await onSave({ setupDone: true }); await onRefresh?.() } finally { setBusy(false) } }
  const panel = 'glass max-w-[600px] px-8 py-7 sm:px-10 sm:py-9'

  return (
    <section className="on-photo relative isolate min-h-[100svh] overflow-hidden">
      <Photo animated key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
        initial={{ scale: 1.06, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.6, ease: EASE }}
        className="photo absolute inset-0 h-full w-full object-cover object-center" />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(var(--veil),.97) 0%, rgba(var(--veil),.7) 40%, rgba(var(--veil),.2) 100%)' }} />
      <div className="relative z-10 mx-auto flex min-h-[100svh] col flex-col justify-end px-6 pb-24">
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.form key="who" onSubmit={next} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .6, ease: EASE }} className={panel}>
              <div className="flex items-center justify-between">
                <p className="display text-[15px] font-semibold tracking-tight" style={{ color: 'var(--ink-3)' }}>Bench.</p>
                <Dots step={0} />
              </div>
              <h1 className="display mt-3 text-[clamp(44px,7vw,84px)] font-semibold leading-[.95] tracking-tight">{FIRST_RUN.title}</h1>
              <p className="mt-5 text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{FIRST_RUN.body}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <label className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{FIRST_RUN.nameLabel}
                  <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Noël Jensen" className="field mt-1 w-full px-3 py-2.5 text-[15px]" /></label>
                <label className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{FIRST_RUN.emailLabel}
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@tom.fit" className="field mt-1 w-full px-3 py-2.5 text-[15px]" /></label>
              </div>
              <button type="submit" disabled={!ok || busy} className="pill mt-6 px-6 py-3 text-[14px] font-medium transition-opacity disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>{FIRST_RUN.cta}</button>
            </motion.form>
          ) : (
            <motion.div key="m365" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .6, ease: EASE }} className={panel}>
              <div className="flex items-center justify-between">
                <p className="display text-[15px] font-semibold tracking-tight" style={{ color: 'var(--ink-3)' }}>Bench.</p>
                <Dots step={1} />
              </div>
              <h1 className="display mt-3 text-[clamp(44px,7vw,84px)] font-semibold leading-[.95] tracking-tight">{FIRST_RUN.connectTitle}</h1>
              <p className="mt-5 text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{FIRST_RUN.connectBody}</p>
              <div className="mt-8">
                {auth?.signedIn ? (
                  <p className="flex items-center gap-2 text-[14px]"><Check size={15} weight="bold" style={{ color: 'var(--accent)' }} /> Connected as <span className="tnum">{auth.username}</span></p>
                ) : (
                  <Connect auth={auth} onRefresh={onRefresh} tier="core" label="Connect Microsoft 365" quiet big />
                )}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button onClick={finish} disabled={busy} className="pill px-6 py-3 text-[14px] font-medium transition-opacity disabled:opacity-40"
                  style={auth?.signedIn ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { border: '1px solid var(--line-2)', color: 'var(--ink)' }}>
                  {auth?.signedIn ? FIRST_RUN.done : FIRST_RUN.skip}
                </button>
                {!auth?.signedIn && <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>You can connect later from the gear.</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
