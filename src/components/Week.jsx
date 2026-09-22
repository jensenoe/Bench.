import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import * as api from '../api.js'

/**
 * The week, as seven thin columns: hours on the clock as the bar, ticked-off tasks as dots
 * underneath, a logbook entry as a small mark. Today is live. Nothing to click; it is a glance.
 */
const hm = (ms) => { const m = Math.round(ms / 60000); return m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : '' }

export default function Week({ refreshKey }) {
  const [days, setDays] = useState(null)
  useEffect(() => { api.getWeek().then(setDays).catch(() => setDays([])) }, [refreshKey])
  if (!days?.length) return null
  const max = Math.max(8 * 3600000, ...days.map(d => d.worked))
  const total = days.reduce((s, d) => s + d.worked, 0)
  const done = days.reduce((s, d) => s + d.completed, 0)
  const any = days.some(d => d.worked || d.completed || d.logbook)
  if (!any) return null
  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[22px] font-semibold leading-none">The week.</h2>
        <p className="tnum text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{hm(total) || '0:00'} on the clock · {done} ticked off</p>
      </div>
      <div className="mt-6 grid grid-cols-7 gap-3">
        {days.map((d, i) => {
          const date = new Date(d.date + 'T12:00:00')
          const h = d.worked ? Math.max(4, (d.worked / max) * 96) : 0
          const weekend = date.getDay() === 0 || date.getDay() === 6
          return (
            <div key={d.date} className="flex flex-col items-stretch" style={{ opacity: weekend && !d.worked ? .45 : 1 }}>
              <div className="relative h-[96px] overflow-hidden rounded-[10px]" style={{ background: 'rgba(var(--ink-rgb),.045)' }}>
                {h > 0 && <motion.div initial={{ height: 0 }} animate={{ height: h }} transition={{ duration: .6, delay: i * .04, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-x-0 bottom-0 rounded-[10px]" style={{ background: d.today ? 'var(--accent)' : 'rgba(var(--ink-rgb),.28)', opacity: d.open && !d.today ? .5 : 1 }} />}
                {d.worked > 0 && <span className="tnum absolute left-0 right-0 top-2 text-center text-[11px]" style={{ color: d.today && h > 30 ? 'var(--accent-ink)' : 'var(--ink-2)' }}>{hm(d.worked)}</span>}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11.5px]" style={{ color: d.today ? 'var(--ink)' : 'var(--ink-3)', fontWeight: d.today ? 500 : 400 }}>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                <span className="flex items-center gap-[3px]">
                  {Array.from({ length: Math.min(d.completed, 6) }).map((_, k) => <span key={k} className="block h-[5px] w-[5px] rounded-full" style={{ background: '#8CD3A2' }} />)}
                  {d.completed > 6 && <span className="tnum text-[10px]" style={{ color: 'var(--ink-3)' }}>+{d.completed - 6}</span>}
                  {d.logbook > 0 && <span className="ml-1 block h-[5px] w-[9px] rounded-sm" title={`${d.logbook} logbook`} style={{ background: 'var(--accent)', opacity: .8 }} />}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>Bars are hours on the clock, dots are tasks ticked off here, the small bar is a logbook entry. Today fills in live.</p>
    </section>
  )
}
