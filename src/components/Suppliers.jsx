import { useCallback, useEffect, useState } from 'react'
import { EnvelopeSimple } from '@phosphor-icons/react'
import { getSuppliers, getMailStatus, runMail } from '../api/mail.js'
import { fmtDate } from '../lanes.js'
import { STATUS } from '../scenes.js'

/**
 * Suppliers (roadmap 113): one row per supplier with what is open, ordered and delivered, the learned lead
 * time, the share of deliveries that made the need-by date, and the open POs underneath. The last line says
 * whether Bench reads the mail for confirmations and delivery notes, and lets you run that now.
 * No props: it fetches its own rows and follows bench:refresh, so it mounts anywhere on the Procurement page.
 */
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const pct = r => `${Math.round(r * 100)}%`
const hhmm = iso => new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

function Counts({ s }) {
  const parts = []
  if (s.open) parts.push(`${s.open} to order`)
  if (s.ordered) parts.push(`${s.ordered} on the way`)
  if (s.delivered) parts.push(`${s.delivered} delivered`)
  return <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{parts.join(', ') || 'nothing yet'}</span>
}

function SupplierRow({ s }) {
  const rateTone = s.hitRate === null ? 'var(--ink-3)' : s.hitRate >= 0.8 ? STATUS.done : s.hitRate >= 0.5 ? STATUS.caution : STATUS.overdue
  return (
    <li className="py-3" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="min-w-[160px] flex-1 text-[14px] font-medium">{s.supplier}</span>
        <Counts s={s} />
        <span className="tnum w-[104px] text-right text-[13px]" style={{ color: 'var(--ink-2)' }}>{s.medianDays !== null ? `${s.medianDays} d lead` : 'no lead time yet'}</span>
        <span className="tnum w-[92px] text-right text-[13.5px] font-semibold" style={{ color: rateTone }} title="Deliveries on or before the need-by date">{s.hitRate === null ? 'no dated deliveries' : `${pct(s.hitRate)} on time`}</span>
      </div>
      {s.openPOs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 pl-3">
          {s.openPOs.map(p => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>
              <a href={`#/board?task=${p.id}`} className="-my-[2px] min-w-[160px] flex-1 py-[2px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>{p.title}</a>
              {p.poNumber && <span className="tnum">PO {p.poNumber}</span>}
              <span className="tnum">ordered {fmtDate(p.orderedOn)}</span>
              {p.dueDate && <span className="tnum" style={{ color: p.dueDate < new Date().toISOString().slice(0, 10) ? STATUS.overdue : 'var(--ink-3)' }}>needed {fmtDate(p.dueDate)}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Suppliers() {
  const [rows, setRows] = useState(null)
  const [mail, setMail] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    getSuppliers().then(setRows).catch(() => setRows([]))
    getMailStatus().then(setMail).catch(() => setMail(null))
  }, [])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])

  const readNow = async () => {
    setBusy(true)
    try {
      const r = await runMail()
      if (!r.ok) toast('The mail was not read.', r.reason === 'off' ? 'Turn it on in Settings > Tools.' : r.reason === 'needs-admin-consent' ? 'Mail.Read needs the admin approval.' : r.reason === 'needs-signin' ? 'Connect Microsoft 365 first.' : r.reason)
      else toast(r.applied.length ? `${plural(r.applied.length, 'date')} set from the mail.` : 'Nothing new in the mail.', `${r.read} messages read.`)
      refresh()
    } catch (e) { toast('That did not work.', e.message) } finally { setBusy(false) }
  }

  if (rows === null) return null
  if (rows.length === 0 && !mail?.on) return null
  const mailLine = !mail ? null
    : !mail.on ? 'Bench does not read the mail. Settings > Tools turns on order confirmations and delivery notes from Outlook.'
    : mail.reason === 'needs-admin-consent' ? 'Reading the mail waits on the admin approval for Mail.Read.'
    : mail.reason === 'needs-signin' ? 'Reading the mail needs the Microsoft 365 sign-in.'
    : mail.reason && mail.reason !== 'off' ? `The last read failed: ${mail.reason}`
    : mail.lastRun ? `Mail read at ${hhmm(mail.lastRun)}, ${plural(mail.matched, 'date')} set so far.` : 'The mail is read every 30 minutes; the first pass is due shortly.'

  return (
    <section className="panel p-6 sm:p-7" aria-label="Suppliers">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="display text-[22px] font-semibold leading-none">Suppliers.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(rows.length, 'supplier')}</span>
      </div>
      <p className="mt-1.5 max-w-[65ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>Lead time is the median of what each supplier took. On time is the share of deliveries that made the need-by date.</p>
      {rows.length === 0
        ? <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Put a supplier on a task with an order date and the row appears here.</p>
        : <ul className="mt-4 flex flex-col">{rows.map(s => <SupplierRow key={s.supplier} s={s} />)}</ul>}
      {mailLine && (
        <div className="mt-4 flex flex-wrap items-center gap-3 pt-3 text-[13px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
          <span className="min-w-0 flex-1">{mailLine}</span>
          {mail?.on && <button onClick={readNow} disabled={busy} className="pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50" style={{ background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}><EnvelopeSimple size={13} weight="bold" /> Read the mail now</button>}
        </div>
      )}
    </section>
  )
}
