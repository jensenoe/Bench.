import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as day from '../api/day.js'
import { fmtDate } from '../lanes.js'
import { PanelSkeleton } from './Skeleton.jsx'

/**
 * The morning brief (roadmap 68). One panel over the page on the first start of the day: what was
 * left on Today, what the tools brought overnight, what is due, which order dates are close, today's
 * meetings and the state of the time sheet. Each leftover is kept or sent back to Active; "Start the
 * day." applies that and closes. "Later" (and Escape) only marks the brief seen.
 */
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))

export default function MorningBrief({ open, onClose, onChanged }) {
  const [brief, setBrief] = useState(null)
  const [err, setErr] = useState(null)
  const [back, setBack] = useState(() => new Set())   // leftover ids going back to Active
  const [busy, setBusy] = useState(false)
  const primary = useRef(null), before = useRef(null)

  useEffect(() => {
    if (!open) { before.current?.focus?.(); return }
    before.current = document.activeElement
    setBrief(null); setErr(null); setBack(new Set())
    let on = true
    day.getBrief().then(b => on && setBrief(b)).catch(e => on && setErr(e.message))
    return () => { on = false }
  }, [open])
  useEffect(() => {
    if (!open || !brief) return
    const id = setTimeout(() => primary.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [open, brief])

  const later = useCallback(async () => { try { await day.briefSeen() } catch { /* the next start asks again */ } onClose() }, [onClose])
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); later() } }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [open, later])

  const startDay = async () => {
    setBusy(true)
    try {
      const r = await day.applyBrief([...back])
      if (r.moved) toast(r.moved === 1 ? 'One back to Active.' : `${r.moved} back to Active.`, 'Today is what is left.')
      refresh(); onChanged?.(); onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const toggle = (id, toActive) => setBack(s => { const n = new Set(s); toActive ? n.add(id) : n.delete(id); return n })

  const b = brief
  const empty = b && !b.leftovers.length && !b.arrived.length && !b.due.length && !b.orders.length && !b.meetings.length
  const sheet = b ? (b.sheet.unclosed ? `${fmtDate(b.sheet.unclosed.date)} was never clocked out.` : b.sheet.pending ? (b.sheet.pending === 1 ? 'One punch waiting for the sheet.' : `${b.sheet.pending} punches waiting for the sheet.`) : 'In order.') : ''

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="brief" className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 pb-8 pt-[8vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', overscrollBehavior: 'contain' }} onMouseDown={later}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="brief-title"
            initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[620px] px-6 py-6 sm:px-8" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <h2 id="brief-title" className="display text-[30px] font-semibold leading-none">Morning.</h2>
            <p className="mt-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{b ? fmtDate(b.date) : fmtDate(new Date().toISOString())}</p>

            {!b && !err && <div className="mt-5"><PanelSkeleton rows={4} title={false} /></div>}
            {err && <p role="alert" className="mt-5 text-[13.5px]" style={{ color: 'var(--late)' }}>{err}</p>}

            {b && empty && <p className="mt-5 text-[14px]" style={{ color: 'var(--ink-2)' }}>Nothing left over, nothing new, nothing due. The day is yours.</p>}

            {b && b.leftovers.length > 0 && (
              <Section title="Left from yesterday" n={b.leftovers.length}>
                {b.leftovers.map(t => {
                  const toActive = back.has(t.id)
                  return (
                    <li key={t.id} className="row flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13.5px]" title={t.title}>{t.title}</span>
                      <span role="radiogroup" aria-label={`Where ${t.title} goes`} className="flex shrink-0 gap-1">
                        <Choice on={!toActive} onClick={() => toggle(t.id, false)}>Keep on Today</Choice>
                        <Choice on={toActive} onClick={() => toggle(t.id, true)}>Back to Active</Choice>
                      </span>
                    </li>
                  )
                })}
              </Section>
            )}
            {b && b.arrived.length > 0 && (
              <Section title="Came in overnight" n={b.arrived.length}>
                {b.arrived.map(t => <Row key={t.id} title={t.title} meta={t.tool ? `from ${t.tool}` : null} />)}
              </Section>
            )}
            {b && b.due.length > 0 && (
              <Section title="Due today" n={b.due.length}>
                {b.due.map(t => <Row key={t.id} title={t.title} meta={t.dueDate < b.date ? `was due ${fmtDate(t.dueDate)}` : null} tone={t.dueDate < b.date ? 'var(--late)' : null} />)}
              </Section>
            )}
            {b && b.orders.length > 0 && (
              <Section title="Order dates" n={b.orders.length}>
                {b.orders.map(t => <Row key={t.id} title={t.title} meta={t.days < 0 ? `order date passed, ${fmtDate(t.orderBy)}` : t.days === 0 ? 'order today' : `order by ${fmtDate(t.orderBy)}`} tone={t.days <= 0 ? 'var(--late)' : 'var(--caution)'} />)}
              </Section>
            )}
            {b && b.meetings.length > 0 && (
              <Section title="Meetings" n={b.meetings.length}>
                {b.meetings.map(m => <Row key={m.id} title={m.subject} lead={m.allDay ? 'all day' : m.start} meta={m.location} />)}
              </Section>
            )}
            {b && !empty && (
              <Section title="The sheet">
                <li className="text-[13.5px]" style={{ color: b.sheet.unclosed || b.sheet.pending ? 'var(--caution)' : 'var(--ink-2)' }}>{sheet}</li>
              </Section>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button ref={primary} disabled={!b || busy} onClick={startDay} className="pill px-5 py-2 text-[14px] font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Start the day.</button>
              <button onClick={later} className="-my-1 inline-block py-1 text-[13.5px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Later</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Section({ title, n, children }) {
  return (
    <section className="mt-6" aria-label={title}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="display text-[18px] font-semibold leading-none">{title}.</h3>
        {n !== undefined && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{n}</span>}
      </div>
      <ul className="mt-2.5 flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Row({ title, lead, meta, tone }) {
  return (
    <li className="row flex items-baseline gap-3 px-3.5 py-2.5 text-[13.5px]">
      {lead && <span className="tnum shrink-0" style={{ color: 'var(--ink-3)' }}>{lead}</span>}
      <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
      {meta && <span className="shrink-0 text-[13px]" style={{ color: tone || 'var(--ink-3)' }}>{meta}</span>}
    </li>
  )
}

function Choice({ on, onClick, children }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="pill h-6 px-3 text-[12.5px] font-medium"
      style={on ? { background: 'var(--ink)', color: 'var(--bg)' } : { border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>{children}</button>
  )
}
