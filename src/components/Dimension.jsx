import { motion } from 'motion/react'

/**
 * The one place this interface raises its voice.
 *
 * Lead time is not a deadline, so it is not drawn as one. It is drawn
 * the way a draughtsman dimensions a gap: extension lines at each end,
 * arrowheads turned inward, the measurement called out on the line.
 * All items share one scale, so two orders can be compared by eye —
 * exactly what a shared drawing scale is for.
 */
const SPAN = 14 // days across the full track

function Arrow({ dir = 'right', color }) {
  return (
    <svg viewBox="0 0 7 8" className="h-2 w-[7px] shrink-0" fill={color} aria-hidden="true"
         style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}>
      <path d="M0 0 L7 4 L0 8 Z" />
    </svg>
  )
}

export default function Dimension({ items }) {
  if (!items.length) return null

  return (
    <section className="rule-b px-4 py-6 sm:px-6" style={{ borderColor: 'var(--rule)' }}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Order dates</h2>
        <span className="anno">scale 0 to {SPAN} days</span>
      </div>
      <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        The last date an order still lands before the build needs it. Not a deadline —
        miss it and the build moves, not the task.
      </p>

      {/* scale — offset so zero has room to be overrun */}
      <div className="relative mt-6 ml-12 h-4" aria-hidden="true">
        {[0, 7, 14].map(t => (
          <div key={t} className="absolute top-0 flex flex-col items-center"
               style={{ left: `${(t / SPAN) * 100}%`, transform: 'translateX(-50%)' }}>
            <div className="h-2 w-px" style={{ background: 'var(--rule-strong)' }} />
            <span className="gridref mt-0.5">{t}d</span>
          </div>
        ))}
        <div className="absolute top-2 h-px w-full" style={{ background: 'var(--rule)' }} />
      </div>

      <ul className="mt-3 flex flex-col">
        {items.map((it, i) => {
          const over = it.days < 0
          const color = over ? 'var(--rev)' : it.days <= 7 ? 'var(--caut)' : 'var(--cons)'
          const pct = Math.max(2, Math.min(100, (Math.max(it.days, 0) / SPAN) * 100))

          return (
            <li key={it.id} className="rule-t py-3" style={{ borderColor: 'var(--rule)' }}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13px]" style={{ color: 'var(--ink)' }}>{it.title}</span>
                <span className="num text-[12px] font-medium shrink-0" style={{ color }}>
                  {over ? `${Math.abs(it.days)}d past` : it.days === 0 ? 'today' : `${it.days}d`}
                </span>
              </div>

              <div className="relative ml-12 mt-2 h-3">
                {/* extension line at zero — today */}
                <div className="absolute left-0 top-0 h-3 w-px" style={{ background: color }} />

                {over ? (
                  /* overrun: the dimension runs back off the scale */
                  <motion.div className="absolute top-[5px] flex items-center"
                    style={{ left: -46, width: 46, color }}
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: .5, delay: .35 + i * .08, ease: [0.16, 1, 0.3, 1] }}>
                    <Arrow dir="left" color={color} />
                    <div className="h-px flex-1" style={{ background: color }} />
                  </motion.div>
                ) : (
                  <>
                    <motion.div className="absolute top-[5px] flex items-center"
                      style={{ left: 0, color }}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: `${pct}%`, opacity: 1 }}
                      transition={{ duration: .75, delay: .35 + i * .08, ease: [0.16, 1, 0.3, 1] }}>
                      <Arrow dir="left" color={color} />
                      <div className="h-px flex-1" style={{ background: color }} />
                      <Arrow dir="right" color={color} />
                    </motion.div>
                    <motion.div className="absolute top-0 h-3 w-px" style={{ background: color }}
                      initial={{ left: 0, opacity: 0 }}
                      animate={{ left: `calc(${pct}% - 1px)`, opacity: 1 }}
                      transition={{ duration: .75, delay: .35 + i * .08, ease: [0.16, 1, 0.3, 1] }} />
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
