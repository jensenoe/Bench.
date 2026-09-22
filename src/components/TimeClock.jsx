import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CaretDown } from '@phosphor-icons/react'
import { fmt, mmss, hm, workedMs } from '../hooks/useTimeclock.js'

/**
 * The time clock in the nav, as one control: the state and the one action that fits the hour,
 * then a small panel with the rest (the other punch, today's numbers, the month page).
 * The state pill is what you read; the panel is what you open once a day.
 */
export default function TimeClock({ clock, punch, now }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('mousedown', onDoc); addEventListener('keydown', onKey)
    return () => { removeEventListener('mousedown', onDoc); removeEventListener('keydown', onKey) }
  }, [open])
  if (!clock) return null

  const go = async (kind) => { setBusy(true); try { if (await punch(kind) && kind === 'lunchOut') location.hash = '#/lunch' } finally { setBusy(false); setOpen(false) } }
  const last = k => clock.events.filter(e => e.kind === k).at(-1)
  const noonish = now.getHours() >= 11 && now.getHours() < 14 && !last('lunchOut')
  const worked = workedMs(clock, now)
  const dot = (clock.pending > 0 || clock.lastError || clock.unclosed) && (
    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: clock.lastError ? '#F0776B' : '#E8B85A' }} />
  )
  const solid = { background: 'var(--accent)', color: 'var(--accent-ink)' }
  const ghost = { border: '1px solid var(--line-2)' }

  // the one action for now
  let primary = null, secondary = null, state = null
  if (clock.status === 'off') { primary = { kind: 'in', label: 'Clock in', style: solid }; state = 'Not clocked in' }
  else if (clock.status === 'in') {
    state = `In ${fmt(last('lunchIn')?.at || last('in')?.at)}`
    if (noonish) { primary = { kind: 'lunchOut', label: 'Lunch', style: solid }; secondary = { kind: 'out', label: 'Clock out' } }
    else { primary = { kind: 'out', label: 'Clock out', style: ghost }; if (!last('lunchOut')) secondary = { kind: 'lunchOut', label: 'Lunch' } }
  } else if (clock.status === 'lunch') { primary = { kind: 'lunchIn', label: 'Back', style: solid }; state = `Break ${mmss(now.getTime() - new Date(clock.lunch.startedAt).getTime())}` }
  else { primary = { kind: 'in', label: 'Clock in again', style: ghost }; state = `Out ${fmt(last('out')?.at)}` }

  return (
    <div ref={box} className="relative flex items-center gap-2">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label="Time clock"
        className="pill flex items-center gap-2 px-3 py-2 text-[13.5px] transition-colors hover:bg-[rgba(var(--ink-rgb),.06)] 2xl:text-[15px]" style={{ color: 'var(--ink-2)' }}>
        {dot}<span className="tnum">{state}</span><CaretDown size={11} weight="bold" style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {primary && <button disabled={busy} onClick={() => go(primary.kind)} className="pill px-4.5 py-2.5 text-[13.5px] font-medium transition-opacity disabled:opacity-50 2xl:px-5 2xl:py-3 2xl:text-[15px]" style={primary.style}>{primary.label}</button>}

      <AnimatePresence>
        {open && (
          <motion.div key="panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}
            className="panel absolute right-0 top-full z-[60] mt-2 w-[300px] p-4 text-[13.5px]" style={{ boxShadow: 'var(--shadow-panel)' }}>
            <div className="flex items-baseline justify-between">
              <span className="display text-[17px] font-semibold">Today.</span>
              <span className="tnum" style={{ color: 'var(--ink-3)' }}>{clock.status === 'off' ? 'nothing yet' : `${hm(worked)} worked`}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {clock.events.filter(e => e.kind !== 'pause').map((e, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{{ in: 'In', lunchOut: 'Lunch out', lunchIn: 'Lunch in', out: 'Out' }[e.kind]}</span>
                  <span className="tnum flex items-center gap-2">{e.label}{e.error ? <span title={e.error} className="h-1.5 w-1.5 rounded-full" style={{ background: '#F0776B' }} /> : !e.written ? <span title="Not in the sheet yet" className="h-1.5 w-1.5 rounded-full" style={{ background: '#E8B85A' }} /> : null}</span>
                </li>
              ))}
              {!clock.events.length && <li style={{ color: 'var(--ink-3)' }}>No punches yet.</li>}
            </ul>
            {clock.lastError && <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: '#E8B85A' }}>{clock.lastError}</p>}
            {!clock.lastError && clock.pending > 0 && <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{clock.pending} punch{clock.pending > 1 ? 'es' : ''} waiting to be written.</p>}
            {clock.sheet && !clock.pending && !clock.lastError && clock.events.length > 0 && <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Written to {clock.sheet.name}, row {clock.sheet.row}.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {secondary && <button disabled={busy} onClick={() => go(secondary.kind)} className="pill px-3.5 py-1.5 text-[13px]" style={ghost}>{secondary.label}</button>}
              <a href="#/hours" onClick={() => setOpen(false)} className="text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>This month</a>
              <a href="#/lunch" onClick={() => setOpen(false)} className="ml-auto text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Lunch screen</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
