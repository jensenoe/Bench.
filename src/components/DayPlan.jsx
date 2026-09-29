import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Check, ListChecks } from '@phosphor-icons/react'
import * as dayplan from '../api/dayplan.js'
import { fmtDate } from '../lanes.js'
import { PanelSkeleton } from './Skeleton.jsx'
import useFocusTrap from '../hooks/useFocusTrap.js'

/**
 * Plan my day (roadmap 161). A quiet button in the Today header opens one proposal from server/dayplan.js:
 * what stays, what comes in, what goes back to Active, each with its reason, and the hours it adds up to.
 * Every row has its own tick; "Plan it." moves the lanes (Enter does too), a toast says so with Undo, and
 * Escape or "Not now" leaves the board as it is. The morning brief's line opens it through #/board?plan=1.
 */
const toast = detail => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { plain: true, ms: 8000, ...detail } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
const h = n => Number.isInteger(n) ? String(n) : n.toFixed(1)
const round1 = n => Math.round(n * 10) / 10
const WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const word = n => WORDS[n] ?? String(n)
const LANE = { today: 'Today', innovation: 'Innovation', active: 'Active', waiting: 'Waiting', parked: 'Parked' }

export default function PlanDay() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = () => {
      if (!/[?&]plan=1(&|$)/.test(location.hash)) return
      history.replaceState(null, '', `${location.pathname}${location.search}#/board`)
      setOpen(true)
    }
    check()
    addEventListener('hashchange', check); return () => removeEventListener('hashchange', check)
  }, [])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="pill btn-quiet inline-flex h-7 shrink-0 items-center gap-1.5 px-3 text-[13px] font-medium">
        <ListChecks size={14} weight="bold" aria-hidden="true" />Plan my day
      </button>
      {createPortal(<PlanPanel open={open} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function PlanPanel({ open, onClose }) {
  const [p, setP] = useState(null)
  const [err, setErr] = useState(null)
  const [off, setOff] = useState(() => new Set())   // rows whose proposal is not taken
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const box = useRef(null), primary = useRef(null), notNow = useRef(null)
  useFocusTrap(box, open)

  useEffect(() => {
    if (!open) return
    setP(null); setErr(null); setOff(new Set())
    let on = true
    dayplan.getPlan().then(x => on && setP(x)).catch(e => on && setErr(e.message))
    return () => { on = false }
  }, [open, attempt])
  useEffect(() => { if (!open) setAttempt(0) }, [open])
  useEffect(() => {
    if (!open || !p) return
    const id = setTimeout(() => primary.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [open, p])

  const taken = id => !off.has(id)
  const keepOn = p ? p.keep.filter(taken) : []
  const addOn = p ? p.add.filter(taken) : []
  const back = p ? [...p.out.filter(taken), ...p.keep.filter(id => !taken(id))] : []
  const staying = p ? [...keepOn, ...p.out.filter(id => !taken(id))] : []
  const hoursOf = id => p?.items?.[id]?.hours ?? 1
  const places = staying.length + addOn.length
  const planned = round1([...staying, ...addOn].reduce((s, id) => s + hoursOf(id), 0))
  const unsized = [...staying, ...addOn].filter(id => p?.items?.[id]?.effortHours === null).length
  const overCap = Boolean(p) && places > p.cap
  const overHours = Boolean(p) && planned > p.hours.free
  const changes = addOn.length + back.length
  const listed = p ? p.keep.length + p.add.length + p.out.length : 0

  const apply = async () => {
    if (!p || busy || overCap) return
    if (!changes) { onClose(); return }
    setBusy(true)
    try {
      const r = await dayplan.applyPlan({ add: addOn, out: back })
      const parts = [r.added ? `${word(r.added)} in` : null, r.moved ? `${r.added ? word(r.moved).toLowerCase() : word(r.moved)} back to Active` : null].filter(Boolean)
      toast({
        text: 'Today is planned.', by: parts.length ? `${parts.join(', ')}.` : 'Nothing had to move.',
        undo: async () => {
          const u = await dayplan.undoPlan(r.before)
          refresh()
          if (u.skipped) toast({ text: 'Mostly back.', by: `${word(u.skipped)} moved again since, so ${u.skipped === 1 ? 'it stays' : 'they stay'}.` })
        }
      })
      refresh(); onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const applyRef = useRef(apply)
  useEffect(() => { applyRef.current = apply })   // the key handler below always plans with this render's ticks

  // Escape closes, Enter plans. The page's own keys (n, /, ?, the digits) wait while this is open; Tab stays in.
  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Tab') return
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'Enter' && !e.isComposing && document.activeElement !== notNow.current) { e.preventDefault(); applyRef.current() }
    }
    addEventListener('keydown', onKey, true); return () => removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const flip = id => setOff(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const row = (id, kind) => {
    const it = p.items[id] || { title: 'A card', hours: 1, effortHours: null, lane: 'active' }
    const on = taken(id)
    const label = kind === 'keep' ? `Keep ${it.title} on Today` : kind === 'add' ? `Bring ${it.title} to Today` : `Move ${it.title} back to Active`
    const instead = kind === 'keep' ? 'Goes back to Active instead.' : kind === 'add' ? `Stays in ${LANE[it.lane] || 'its lane'}.` : 'Stays on Today.'
    return <Row key={id} on={on} label={label} title={it.title} why={on ? p.why[id] : instead} hours={it.hours} from={kind === 'add' && on ? LANE[it.lane] : null} onFlip={() => flip(id)} />
  }

  const meetingsLine = p ? (p.hours.meetings ? `${h(p.hours.workday)} h workday less ${h(p.hours.meetings)} h of meetings.` : `${h(p.hours.workday)} h workday, no meetings on the calendar.`) : ''
  const fill = p && p.hours.free > 0 ? Math.min(1, planned / p.hours.free) : (planned > 0 ? 1 : 0)

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="plan" className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 pb-8 pt-[8vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', overscrollBehavior: 'contain' }} onMouseDown={onClose}>
          <motion.div ref={box} role="dialog" aria-modal="true" aria-labelledby="plan-title" aria-describedby={p ? 'plan-hours' : undefined}
            initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[640px] px-6 py-6 sm:px-8" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <h2 id="plan-title" className="display text-[30px] font-semibold leading-none">Today&apos;s plan.</h2>
            <p className="tnum mt-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{fmtDate(p?.date || new Date().toISOString())}{p ? `. ${meetingsLine}` : ''}</p>

            {!p && !err && <div className="mt-5"><PanelSkeleton rows={4} title={false} /></div>}
            {err && <p role="alert" className="mt-5 text-[13.5px]" style={{ color: 'var(--late)' }}>
              {p ? `The plan did not land: ${err}` : `The plan did not load: ${err}`}{' '}
              {!p && <button type="button" onClick={() => setAttempt(n => n + 1)} className="-my-1 inline-block py-1 underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Try again</button>}
            </p>}

            {p && (
              <div className="mt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p id="plan-hours" className="tnum text-[15px] font-medium" style={{ color: overHours ? 'var(--caution)' : 'var(--ink)' }}>{h(planned)} h planned of {h(p.hours.free)} h free</p>
                  <span className="tnum text-[13px]" style={{ color: overCap ? 'var(--late)' : 'var(--ink-3)' }}>{places} of {p.cap} places</span>
                </div>
                <div aria-hidden="true" className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--wash-2)' }}>
                  <div className="h-full w-full origin-left rounded-full" style={{ transform: `scaleX(${fill})`, background: overHours ? 'var(--caution)' : 'var(--accent)', transition: 'transform var(--quick) var(--ease)' }} />
                </div>
                {unsized > 0 && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>{unsized === 1 ? 'One card has no size; it counts as an hour.' : `${word(unsized)} cards have no size; each counts as an hour.`}</p>}
                {overCap && <p role="status" className="mt-2 text-[13px]" style={{ color: 'var(--late)' }}>That is {places} for {p.cap} places. Leave {places - p.cap} out.</p>}
              </div>
            )}

            {p && listed === 0 && <p className="mt-6 text-[14px]" style={{ color: 'var(--ink-2)' }}>Nothing presses today. Pull a card from Active when you are ready.</p>}
            {p && listed > 0 && p.add.length === 0 && p.out.length === 0 && <p className="mt-6 text-[14px]" style={{ color: 'var(--ink-2)' }}>Today already holds what matters.</p>}

            {p && p.keep.length > 0 && <Section title="Stays" n={p.keep.length}>{p.keep.map(id => row(id, 'keep'))}</Section>}
            {p && p.add.length > 0 && <Section title="Comes in" n={p.add.length}>{p.add.map(id => row(id, 'add'))}</Section>}
            {p && p.out.length > 0 && <Section title="Back to Active" n={p.out.length}>{p.out.map(id => row(id, 'out'))}</Section>}

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button ref={primary} type="button" disabled={!p || busy || overCap} aria-busy={busy} onClick={apply} className="pill btn-primary px-5 py-2 text-[14px] font-medium">Plan it.</button>
              <button ref={notNow} type="button" onClick={onClose} className="-my-1 inline-block py-1 text-[13.5px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Not now</button>
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
        <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{n}</span>
      </div>
      <ul className="mt-2.5 flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Row({ on, label, title, why, hours, from, onFlip }) {
  return (
    <li className="row flex items-start gap-3 px-3.5 py-2.5">
      <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onFlip} className="-ml-1 -mt-[2px] grid h-6 w-6 shrink-0 place-items-center">
        <span className="grid h-4 w-4 place-items-center rounded-[4px] border transition-colors" style={{ borderColor: on ? 'var(--accent)' : 'var(--line-2)', background: on ? 'var(--accent)' : 'transparent' }}>
          {on && <Check size={10} weight="bold" color="var(--accent-ink)" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] leading-snug" style={{ color: on ? 'var(--ink)' : 'var(--ink-3)' }} title={title}>{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--ink-3)' }}>{why}</p>
      </div>
      <span className="shrink-0 text-right text-[13px] leading-snug" style={{ color: 'var(--ink-3)' }}>
        <span className="tnum block">{h(hours)} h</span>
        {from && <span className="mt-0.5 block">from {from}</span>}
      </span>
    </li>
  )
}
