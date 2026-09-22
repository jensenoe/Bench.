import Dimension from './Dimension.jsx'
import TaskRow from './TaskRow.jsx'
import { daysSince } from '../lanes.js'

/**
 * Everything whose progress depends on somebody else: parts with a
 * lead time, and work sitting with a person or a supplier.
 */
export default function Procurement({ pressing, held, withDates, onPatch, onDelete }) {
  return (
    <div>
      <section className="px-4 pb-8 pt-14 sm:px-6">
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] sm:text-[42px]">Procurement</h1>
        <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          Work you cannot finish alone. Order dates come from lead time, not from when
          somebody wants it; held items age from the day they left your hands.
        </p>
      </section>

      <Dimension items={pressing} />

      <section className="px-4 py-8 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[14px] font-semibold tracking-tight">Held elsewhere</h2>
          <div className="h-px flex-1" style={{ background: 'var(--rule)' }} />
          <span className="num text-[11px]" style={{ color: 'var(--ink-faint)' }}>{held.length}</span>
        </div>
        {held.length === 0
          ? <p className="rule-t mt-3 py-4 text-[12.5px]" style={{ borderColor: 'var(--rule)', color: 'var(--ink-faint)' }}>
              Nothing is sitting with anyone else.
            </p>
          : <>
              <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                Past seven days, chase it — that is usually the whole reason a build sits still.
              </p>
              <ul className="mt-3 flex flex-col">
                {held
                  .slice()
                  .sort((a, b) => (daysSince(b.waitingSince) ?? 0) - (daysSince(a.waitingSince) ?? 0))
                  .map(t => <TaskRow key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}
              </ul>
            </>}
      </section>

      <section className="px-4 py-8 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[14px] font-semibold tracking-tight">All dated orders</h2>
          <div className="h-px flex-1" style={{ background: 'var(--rule)' }} />
          <span className="num text-[11px]" style={{ color: 'var(--ink-faint)' }}>{withDates.length}</span>
        </div>
        {withDates.length === 0
          ? <p className="rule-t mt-3 py-4 text-[12.5px]" style={{ borderColor: 'var(--rule)', color: 'var(--ink-faint)' }}>
              No task carries an order date yet. Add one when a part has a lead time worth tracking.
            </p>
          : <ul className="mt-3 flex flex-col">
              {withDates.map(t => <TaskRow key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}
            </ul>}
      </section>
    </div>
  )
}
