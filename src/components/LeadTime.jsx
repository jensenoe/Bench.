import { motion } from 'motion/react'
import { STATUS } from '../scenes.js'

const SPAN = 14

/**
 * Order dates on one shared 14-day scale. Not deadlines. The last day an
 * order can go out and still land before the build needs the part.
 */
export default function LeadTime({ items, compact = false }) {
  if (!items.length) return null
  return (
    <section className="panel p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={`display font-semibold leading-none ${compact ? 'text-[22px]' : 'text-[30px]'}`}>Order dates.</h2>
        <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>next {SPAN} days</span>
      </div>
      {!compact && <p className="mt-1.5 max-w-[60ch] text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Worked back from each part's lead time. Miss one and the build moves, not the task.
      </p>}

      <div className="relative mt-6 ml-14 h-5">
        {[0, 7, 14].map(t => (
          <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: `${t / SPAN * 100}%`, transform: 'translateX(-50%)' }}>
            <div className="h-2 w-px" style={{ background: 'var(--line-2)' }} />
            <span className="tnum mt-1 text-[10px]" style={{ color: 'var(--ink-3)' }}>{t === 0 ? 'today' : `${t}d`}</span>
          </div>
        ))}
        <div className="absolute top-2 h-px w-full" style={{ background: 'var(--line)' }} />
      </div>

      <ul className="mt-2 flex flex-col">
        {items.map((it, i) => {
          const over = it.days < 0
          const color = over ? STATUS.overdue : it.days <= 7 ? STATUS.caution : STATUS.held
          const pct = Math.min(100, Math.max(it.days, 0) / SPAN * 100)
          return (
            <li key={it.id} className="py-3" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13.5px]">{it.title}</span>
                <span className="tnum shrink-0 text-[13px] font-semibold" style={{ color }}>
                  {over ? `${-it.days}d late` : it.days === 0 ? 'today' : `${it.days}d`}
                </span>
              </div>
              <div className="relative ml-14 mt-2 h-[3px]">
                {over
                  ? <motion.div className="absolute right-full top-0 h-[3px] rounded-l-full" style={{ background: color }}
                      initial={{ width: 0 }} animate={{ width: 44 }} transition={{ duration: .6, delay: .2 + i * .07, ease: [0.16, 1, 0.3, 1] }} />
                  : <motion.div className="absolute left-0 top-0 h-[3px] rounded-full" style={{ background: color }}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .8, delay: .2 + i * .07, ease: [0.16, 1, 0.3, 1] }} />}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
