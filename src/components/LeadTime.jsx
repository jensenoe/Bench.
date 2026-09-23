import { STATUS } from '../scenes.js'
import { fmtDate } from '../lanes.js'

/**
 * Order dates as rows: the part, the last day to order, how many days that is, and once it is
 * ordered, when and from whom. Not deadlines: the last day an order can go out and still land
 * before the build needs the part.
 */
export default function LeadTime({ items, compact = false, title = 'Order dates.', note = 'Worked back from each part\'s lead time. Miss one and the build moves, not the task.', span = 'next 14 days' }) {
  if (!items.length) return null
  return (
    <section className="panel p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={`display font-semibold leading-none ${compact ? 'text-[22px]' : 'text-[30px]'}`}>{title}</h2>
        {span && <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{span}</span>}
      </div>
      {!compact && note && <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{note}</p>}

      <ul className="mt-5 flex flex-col">
        {items.map(it => {
          const ordered = Boolean(it.orderedOn)
          const over = it.days < 0
          const color = ordered ? STATUS.done : over ? STATUS.overdue : it.days <= 7 ? STATUS.caution : STATUS.held
          const when = ordered ? `ordered ${fmtDate(it.orderedOn)}` : over ? `${-it.days}d late` : it.days === 0 ? 'today' : `${it.days}d`
          return (
            <li key={it.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3" style={{ borderTop: '1px solid var(--line)', opacity: ordered ? .7 : 1 }}>
              <a href={`#/board?task=${it.id}`} className="-my-[2px] min-w-[200px] flex-1 py-[2px] text-[14px] underline-offset-2 hover:underline">{it.title}</a>
              <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{it.supplier ? `${it.supplier}${it.poNumber ? ` · PO ${it.poNumber}` : ''}` : it.poNumber ? `PO ${it.poNumber}` : ''}</span>
              <span className="tnum w-[92px] text-right text-[13px]" style={{ color: 'var(--ink-2)' }}>{fmtDate(it.orderBy)}</span>
              <span className="tnum w-[128px] shrink-0 text-right text-[13.5px] font-semibold" style={{ color }}>{when}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
