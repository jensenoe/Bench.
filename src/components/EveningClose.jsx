import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as day from '../api/day.js'
import { PanelSkeleton } from './Skeleton.jsx'

/**
 * The evening close (roadmap 69). Offered right after the out punch: each open Today task rolls to
 * tomorrow or goes back to Active, and a day note goes into the Logbook with the hours, what was
 * ticked, the meetings and what rolls over. "Close the day." does it and shuts the panel.
 */
const hm = ms => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))

export default function EveningClose({ open, onClose, onChanged }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)
  const [back, setBack] = useState(() => new Set())   // ids going back to Active
  const [note, setNote] = useState(true)
  const [busy, setBusy] = useState(false)
  const primary = useRef(null), before = useRef(null)

  useEffect(() => {
    if (!open) { before.current?.focus?.(); return }
    before.current = document.activeElement
    setInfo(null); setErr(null); setBack(new Set()); setNote(true)
    let on = true
    day.getClose().then(i => on && setInfo(i)).catch(e => on && setErr(e.message))
    return () => { on = false }
  }, [open])
  useEffect(() => {
    if (!open || !info) return
    const id = setTimeout(() => primary.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [open, info])
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [open, onClose])

  const closeDay = async () => {
    if (!info) return
    setBusy(true)
    try {
      const toActive = [...back]
      const keep = info.today.filter(t => !back.has(t.id)).map(t => t.id)
      const r = await day.closeDay({ toActive, keep, note })
      const parts = [r.moved ? (r.moved === 1 ? 'One back to Active' : `${r.moved} back to Active`) : null, r.entry ? 'the day note is in the Logbook' : null].filter(Boolean)
      toast('Closed.', parts.length ? parts.join(', ') + '.' : 'See you tomorrow.')
      refresh(); onChanged?.(); onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const toggle = (id, toActive) => setBack(s => { const n = new Set(s); toActive ? n.add(id) : n.delete(id); return n })

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="close" className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 pb-8 pt-[8vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', overscrollBehavior: 'contain' }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="close-title"
            initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[620px] px-6 py-6 sm:px-8" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <h2 id="close-title" className="display text-[30px] font-semibold leading-none">Closing the day.</h2>
            {info && <p className="tnum mt-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{hm(info.worked)} on the clock, {info.ticked === 1 ? 'one task ticked' : `${info.ticked} tasks ticked`}.</p>}

            {!info && !err && <div className="mt-5"><PanelSkeleton rows={3} title={false} /></div>}
            {err && <p role="alert" className="mt-5 text-[13.5px]" style={{ color: 'var(--late)' }}>{err}</p>}

            {info && (
              <section className="mt-6" aria-label="Still on Today">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="display text-[18px] font-semibold leading-none">Still on Today.</h3>
                  <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{info.today.length}</span>
                </div>
                {info.today.length === 0 && <p className="mt-2.5 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Today is clear. Nothing rolls over.</p>}
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {info.today.map(t => {
                    const toActive = back.has(t.id)
                    return (
                      <li key={t.id} className="row flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[13.5px]" title={t.title}>{t.title}</span>
                        <span role="radiogroup" aria-label={`Where ${t.title} goes`} className="flex shrink-0 gap-1">
                          <Choice on={!toActive} onClick={() => toggle(t.id, false)}>Tomorrow</Choice>
                          <Choice on={toActive} onClick={() => toggle(t.id, true)}>Back to Active</Choice>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {info && (
              <div className="mt-6 flex items-center gap-3 text-[13.5px]">
                <button type="button" role="switch" aria-checked={note} aria-labelledby="close-note-label" onClick={() => setNote(v => !v)} className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
                  style={{ background: note ? 'var(--accent)' : 'var(--bg-2)', border: '1px solid var(--line-2)' }}>
                  <span aria-hidden="true" className="absolute top-[3px] h-[14px] w-[14px] rounded-full transition-transform" style={{ left: 3, transform: note ? 'translateX(16px)' : 'none', background: note ? 'var(--accent-ink)' : 'var(--ink-3)' }} />
                </button>
                <span id="close-note-label" className="cursor-pointer select-none" onClick={() => setNote(v => !v)}>Write a day note to the Logbook</span>
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button ref={primary} disabled={!info || busy} onClick={closeDay} className="pill px-5 py-2 text-[14px] font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Close the day.</button>
              <button onClick={onClose} className="-my-1 inline-block py-1 text-[13.5px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Not now</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Choice({ on, onClick, children }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="pill h-6 px-3 text-[12.5px] font-medium"
      style={on ? { background: 'var(--ink)', color: 'var(--bg)' } : { border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>{children}</button>
  )
}
