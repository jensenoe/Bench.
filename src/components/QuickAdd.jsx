import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { LANES } from '../copy.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

const ORDER = ['today', 'active', 'innovation', 'waiting', 'parked']

/**
 * `n` from anywhere: one line, pick a lane, Enter. Escape closes. The full editor is a click away
 * on the card afterwards; this is for getting the thought down before it goes. Tab stays inside while it
 * is open and focus goes back where it was; an empty Enter says what is missing instead of doing nothing.
 */
export default function QuickAdd({ open, onClose, onCreate, defaultLane = 'active' }) {
  const [title, setTitle] = useState('')
  const [lane, setLane] = useState(defaultLane)
  const [err, setErr] = useState(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const box = useRef(null)
  useFocusTrap(box, open)
  useEffect(() => { if (open) { setTitle(''); setLane(defaultLane); setErr(null); setMissing(false); setBusy(false); setTimeout(() => input.current?.focus(), 30) } }, [open, defaultLane])
  const submit = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (!title.trim()) { setMissing(true); input.current?.focus(); return }
    setBusy(true)
    try {
      const t = title.trim()
      await onCreate({ title: t, lane })
      window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text: `Added to ${LANES[lane].label}.`, by: t, plain: true } }))
      onClose()
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  // On the whole form, so Escape and Alt with a digit work from a lane button too, not only from the field.
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    // Alt + digit picks a lane without leaving the field
    if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); setLane(ORDER[Number(e.key) - 1]) }
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="quick" ref={box} role="dialog" aria-modal="true" aria-label="Quick add" className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onMouseDown={onClose}>
          <motion.form onSubmit={submit} onKeyDown={onKey} initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[640px] overflow-hidden" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <input ref={input} value={title} onChange={e => { setTitle(e.target.value); if (missing) setMissing(false) }} placeholder="What needs doing?"
                aria-label="Task title" aria-invalid={missing || undefined} aria-describedby={missing || err ? 'quick-add-msg' : undefined} className="w-full bg-transparent text-[17px]" style={{ outline: 'none' }} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
              {ORDER.map((k, i) => (
                <button type="button" key={k} onClick={() => setLane(k)} aria-pressed={lane === k} aria-keyshortcuts={`Alt+${i + 1}`} className="pill px-3 py-1.5 text-[13px] transition-colors" title={`Alt ${i + 1}`}
                  style={{ color: lane === k ? 'var(--ink)' : 'var(--ink-3)', background: lane === k ? 'var(--wash-2)' : 'transparent' }}>{LANES[k].label}</button>
              ))}
              <span className="ml-auto flex items-center gap-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
                {(err || missing) && <span id="quick-add-msg" role="alert" style={{ color: 'var(--caution)' }}>{err || 'Type what needs doing first.'}</span>}
                <span className="tnum flex gap-3"><span>Enter adds</span><span>Esc closes</span></span>
              </span>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
