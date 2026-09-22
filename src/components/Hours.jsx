import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight, Warning } from '@phosphor-icons/react'
import * as api from '../api.js'
import { shortDate } from '../lanes.js'

/**
 * The month, the way the Zeiterfassung sheet has it: one row per day, in, out, break, worked.
 * Punches still waiting to reach the sheet are marked, failed ones say why, an open day is flagged.
 * This is the page to look at before someone else looks at the sheet.
 */
const hm = (ms) => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
const t = (iso) => iso ? new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : ''
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export default function Hours({ clock }) {
  const [month, setMonth] = useState(() => ym(new Date()))
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { let on = true; api.getMonth(month).then(d => on && setData(d)).catch(e => on && setErr(e.message)); return () => { on = false } }, [month, clock?.events?.length, clock?.unclosed])
  const shift = (n) => { const [y, m] = month.split('-').map(Number); setMonth(ym(new Date(y, m - 1 + n, 1))) }
  const title = new Date(month + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const isNow = month === ym(new Date())
  const pending = data?.days.reduce((s, d) => s + d.pending, 0) || 0
  const failed = data?.days.filter(d => d.failed) || []

  return (
    <main className="mx-auto col px-6">
      <section className="panel p-6 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => shift(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full" style={{ border: '1px solid var(--line)' }}><CaretLeft size={13} weight="bold" /></button>
              <h2 className="display min-w-[220px] text-center text-[26px] font-semibold leading-none">{title}.</h2>
              <button onClick={() => shift(1)} disabled={isNow} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30" style={{ border: '1px solid var(--line)' }}><CaretRight size={13} weight="bold" /></button>
            </div>
            {data && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>Sheet <span className="tnum" style={{ color: 'var(--ink-2)' }}>{data.sheet}</span> in <span className="tnum">{data.workbook}</span>.</p>}
          </div>
          {data && (
            <div className="flex gap-8 text-right">
              <div><div className="display tnum text-[32px] font-semibold leading-none">{hm(data.worked)}</div><div className="mt-1 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>on the clock</div></div>
              <div><div className="display tnum text-[32px] font-semibold leading-none">{data.daysWorked}</div><div className="mt-1 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>days</div></div>
              {pending > 0 && <div><div className="display tnum text-[32px] font-semibold leading-none" style={{ color: '#E8B85A' }}>{pending}</div><div className="mt-1 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>not in the sheet yet</div></div>}
            </div>
          )}
        </div>

        {err && <p className="mt-5 text-[13px]" style={{ color: '#F0776B' }}>{err}</p>}
        {failed.length > 0 && (
          <p className="mt-5 flex items-start gap-2 text-[13px]" style={{ color: '#E8B85A' }}><Warning size={15} weight="bold" className="mt-0.5 shrink-0" /> {failed[0].failed}</p>
        )}

        {data && (
          <table className="mt-6 w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
                <th className="pb-2 font-medium">Day</th><th className="pb-2 font-medium tnum">In</th><th className="pb-2 font-medium tnum">Out</th><th className="pb-2 font-medium tnum">Break</th><th className="pb-2 text-right font-medium tnum">Worked</th><th className="pb-2 pl-4 font-medium">Sheet</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map(d => {
                const weekend = d.weekday === 0 || d.weekday === 6
                const empty = !d.worked && !d.in
                return (
                  <tr key={d.date} style={{ borderTop: '1px solid var(--line)', opacity: d.future ? .35 : (weekend && empty) ? .5 : 1, background: d.today ? 'rgba(var(--ink-rgb),.04)' : 'transparent' }}>
                    <td className="py-2" style={{ color: d.today ? 'var(--ink)' : weekend ? 'var(--ink-3)' : 'var(--ink-2)', fontWeight: d.today ? 500 : 400 }}>{shortDate(new Date(d.date + 'T12:00:00'))}</td>
                    <td className="tnum py-2">{t(d.in)}</td>
                    <td className="tnum py-2">{d.open && !d.today ? <span style={{ color: '#E8B85A' }}>open</span> : t(d.out)}</td>
                    <td className="tnum py-2" style={{ color: 'var(--ink-3)' }}>{d.breakMs ? hm(d.breakMs) : ''}</td>
                    <td className="tnum py-2 text-right" style={{ fontWeight: d.worked ? 500 : 400 }}>{d.worked ? hm(d.worked) : ''}</td>
                    <td className="py-2 pl-4 text-[13.5px]">
                      {d.failed ? <span title={d.failed} style={{ color: '#F0776B' }}>failed</span>
                        : d.unclosed ? <span style={{ color: '#E8B85A' }}>needs closing</span>
                        : d.pending ? <span style={{ color: '#E8B85A' }}>{d.pending} waiting</span>
                        : d.closedLater ? <span style={{ color: 'var(--ink-3)' }}>closed later</span>
                        : d.in ? <span style={{ color: '#8CD3A2' }}>written</span> : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Written means every punch of that day reached the workbook. Waiting means Bench still holds it, usually because Microsoft 365 was not connected at the time; it writes on the next connection. The sheet itself stays the record; this page is the receipt.
        </p>
      </section>
    </main>
  )
}
