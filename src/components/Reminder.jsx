import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from '@phosphor-icons/react'

/**
 * A quiet reminder under the punch control. Fades in after the app has been open a minute:
 * "not clocked in" on a weekday morning, "still clocked in" once the evening starts.
 * The cross puts it away for the rest of the day.
 */
const KEY = 'bench.reminder.dismissed'
const today = (d) => d.toISOString().slice(0, 10)

export default function Reminder({ clock, now }) {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })
  useEffect(() => { const t = setTimeout(() => setReady(true), 60_000); return () => clearTimeout(t) }, [])
  if (!ready || !clock) return null

  const weekday = now.getDay() >= 1 && now.getDay() <= 5
  const h = now.getHours() + now.getMinutes() / 60
  let kind = null, text = null
  if (weekday && clock.status === 'off' && h >= 6.5 && h < 11.5) { kind = 'in'; text = 'Not clocked in yet.' }
  const inSince = clock.events.find(e => e.kind === 'in')?.at
  const hoursIn = inSince ? (now - new Date(inSince)) / 3600000 : 0
  if ((clock.status === 'in' || clock.status === 'lunch') && (h >= 17.25 || hoursIn >= 9.5)) { kind = 'out'; text = clock.status === 'lunch' ? 'Still on break.' : (h >= 19 || hoursIn >= 10) ? 'Still clocked in. Tomorrow is a day as well.' : 'Still clocked in.' }
  const show = kind && dismissed[kind] !== today(now)
  const dismiss = () => { const d = { ...dismissed, [kind]: today(now) }; setDismissed(d); try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ } }

  return (
    <AnimatePresence>
      {show && (
        <motion.div key={kind} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .8, ease: [0.16, 1, 0.3, 1] }}
          className="glass absolute right-0 top-full mt-2 flex items-center gap-2 px-3 py-1.5 text-[13px]" style={{ borderRadius: 9999, color: 'var(--ink-2)' }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          {text}
          <button onClick={dismiss} aria-label="Dismiss for today" className="grid h-4 w-4 place-items-center rounded-full" style={{ color: 'var(--ink-3)' }}><X size={10} weight="bold" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
