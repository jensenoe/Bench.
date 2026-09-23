import { ArrowSquareOut } from '@phosphor-icons/react'
import { openExternal } from '../api.js'
import { STATUS } from '../scenes.js'
import { fmtDate, daysUntil } from '../lanes.js'

/**
 * What the structured BOM says about the parts assigned to you: procurement status per assembly,
 * grouped by machine, with supplier, lead time, order and delivery dates where the BOM carries them.
 * Read-only here; the BOM owns these fields. Order dates you set yourself live on the task cards.
 */
export default function BomParts({ tasks }) {
  const parts = tasks.filter(t => t.source === 'bom' && !t.done && (t.meta?.procurement || t.meta?.leadTimeDays || t.meta?.deliveryDate || t.meta?.orderedOn))
  if (!parts.length) return null
  const byMachine = new Map()
  for (const p of parts) { const k = p.meta?.machine || p.planTitle || 'Machine'; if (!byMachine.has(k)) byMachine.set(k, []); byMachine.get(k).push(p) }
  const tone = (p) => {
    const s = String(p.meta?.procurement || '').toLowerCase()
    if (/geliefert|delivered|erhalten|received/.test(s)) return STATUS.done
    if (/bestellt|ordered|unterwegs|shipped/.test(s)) return STATUS.held
    if (/offen|open|anfrage|quote|todo|zu bestellen/.test(s)) return STATUS.caution
    return 'var(--ink-3)'
  }
  return (
    <section className="panel p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="display text-[22px] font-semibold leading-none">From the BOM.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{parts.length} {parts.length === 1 ? 'part' : 'parts'}</span>
      </div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Procurement status of the assemblies assigned to you, as the structured BOM has it. The BOM owns these; change them there.
      </p>
      {[...byMachine.entries()].map(([machine, list]) => (
        <div key={machine} className="mt-5">
          <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{machine}</h3>
          <ul className="mt-2 flex flex-col">
            {list.map(p => {
              const m = p.meta || {}
              const eta = m.deliveryDate ? daysUntil(m.deliveryDate) : null
              return (
                <li key={p.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                  <button onClick={() => p.url && openExternal(p.url)} className="min-w-[220px] flex-1 text-left text-[14px] underline-offset-2 hover:underline">
                    {p.title}{p.url && <ArrowSquareOut size={11} weight="bold" className="ml-1.5 inline" style={{ color: 'var(--ink-3)' }} />}
                  </button>
                  <span className="tnum flex flex-wrap gap-x-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                    {[m.supplier, m.leadTimeDays ? `${m.leadTimeDays}d lead` : null, m.orderNumber ? `PO ${m.orderNumber}` : null, m.orderedOn ? `ordered ${fmtDate(m.orderedOn)}` : null].filter(Boolean).map(x => <span key={x}>{x}</span>)}
                  </span>
                  {m.deliveryDate && <span className="tnum text-[13px]" style={{ color: eta !== null && eta < 0 ? STATUS.overdue : 'var(--ink-2)' }}>due {fmtDate(m.deliveryDate)}</span>}
                  <span className="tnum min-w-[110px] text-right text-[13.5px] font-semibold" style={{ color: tone(p) }}>{m.procurement || (m.critical ? 'critical' : '')}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
