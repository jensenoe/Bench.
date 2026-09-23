import { useEffect, useState } from 'react'
import { j } from '../api/http.js'
import { getMailStatus, runMail } from '../api/mail.js'

/**
 * The Settings blocks for the eighth batch's integrations: reading the mail (roadmap 113), the phone
 * view on the workshop network (116) and the storage engine line (109). Small on purpose; Settings.jsx
 * mounts them in the Tools and This machine tabs and passes its own draft, set, save and saveNow.
 */
const getPhone = () => fetch('/api/phone').then(j)
const getStorage = () => fetch('/api/storage').then(j)
const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : ''

const Switch = ({ on, onChange, label, hint }) => (
  <button type="button" onClick={onChange} role="switch" aria-checked={on} className="flex min-h-6 items-start gap-2.5 text-left text-[13px]">
    <span className="mt-[1px] inline-block h-[18px] w-[30px] shrink-0 rounded-full p-[2px] transition-colors" style={{ background: on ? 'var(--accent)' : 'rgba(var(--ink-rgb),.14)' }}>
      <span className="block h-[14px] w-[14px] rounded-full transition-transform" style={{ background: on ? 'var(--accent-ink)' : 'var(--ink-3)', transform: on ? 'translateX(12px)' : 'none' }} />
    </span>
    <span>{label}{hint && <span className="mt-0.5 block text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{hint}</span>}</span>
  </button>
)
const Note = ({ children, tone = 'var(--ink-3)' }) => <p className="text-[13px] leading-relaxed" style={{ color: tone }}>{children}</p>
const pill = 'pill px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50'

/** Order confirmations and delivery notes from Outlook set the order and delivery dates. */
export function MailReading({ on, onToggle }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = () => getMailStatus().then(setSt).catch(() => setSt(null))
  useEffect(() => { load() }, [on])
  const reason = r => r === 'off' ? 'Off.' : r === 'needs-signin' ? 'Connect Microsoft 365 first.' : r === 'needs-admin-consent' ? 'Mail.Read needs the one-time admin approval; the approval link above covers it, the admin has to click it once more.' : r ? `Could not read: ${r}` : null
  return (
    <>
      <Switch on={on} onChange={onToggle} label="Read the mail for order confirmations and delivery notes"
        hint="Every half hour the last seven days of Outlook are matched against tasks with a supplier and a PO number: a confirmation sets ordered on, a delivery note sets delivered on. Subjects and previews only, never the bodies, nothing leaves the machine." />
      {on && st && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={async () => { setBusy(true); try { await runMail(); await load() } finally { setBusy(false) } }} disabled={busy} className={pill} style={{ border: '1px solid var(--line-2)' }}>{busy ? 'Reading…' : 'Read the mail now'}</button>
          <Note tone={st.reason && st.reason !== 'off' ? 'var(--caution)' : 'var(--ink-3)'}>
            {reason(st.reason) || (st.lastRun ? `Read at ${hhmm(st.lastRun)}, ${st.matched === 1 ? 'one date set' : `${st.matched || 0} dates set`}.` : 'Not read yet; the first pass runs a minute after start.')}
          </Note>
        </div>
      )}
    </>
  )
}

/** The phone view: a second server on the workshop network behind a PIN. */
export function PhoneView({ draft, set, save, saveNow }) {
  const [info, setInfo] = useState(null)
  const on = draft.phoneAccess === true
  useEffect(() => {
    let alive = true
    const load = () => getPhone().then(i => alive && setInfo(i)).catch(() => alive && setInfo(null))
    load(); const id = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(id) }
  }, [on, draft.phonePin])
  return (
    <>
      <Switch on={on} onChange={() => saveNow({ phoneAccess: !on })} label="Phone view on the workshop network"
        hint="A small page on port 5199 for the phone on the same Wi-Fi: the brief, Today ticks, the clock, quick add and a camera button that drops a photo into the inbox folder above. Needs the PIN; ten wrong tries lock the address for five minutes." />
      {on && (
        <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>PIN, four to eight digits
          <input inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={draft.phonePin ?? ''} onChange={e => set('phonePin', e.target.value.replace(/\D/g, '').slice(0, 8))} onBlur={() => save('phonePin')}
            onKeyDown={e => { if (e.key === 'Enter') { save('phonePin'); e.target.blur() } }} className="field tnum mt-1 w-[160px] px-2.5 py-2 text-[13px]" style={{ color: 'var(--ink)' }} />
        </label>
      )}
      {on && info && (
        info.on ? <Note>On. Type <span className="tnum" style={{ color: 'var(--ink)' }}>{info.url}</span> on the phone{info.addresses?.length > 1 ? `, or one of ${info.addresses.join(', ')}` : ''}. The phone has to be on the same network.</Note>
          : !info.configured ? <Note tone="var(--caution)">Set a PIN to switch it on.</Note>
            : <Note tone="var(--caution)">Not running yet. Bench picks the change up within half a minute; if it stays off, port 5199 is taken or the firewall said no.</Note>
      )}
    </>
  )
}

/** Which engine holds the board, and how to move. */
export function StorageLine() {
  const [s, setS] = useState(null)
  useEffect(() => { getStorage().then(setS).catch(() => setS(null)) }, [])
  if (!s) return null
  return (
    <>
      <Note>Storage: {s.engine === 'sqlite' ? <>SQLite, <span className="tnum">{s.path}</span>.</> : <>JSON files in <span className="tnum">{s.dir}</span>.</>}</Note>
      {s.wanted && s.wanted !== s.engine && <Note tone="var(--caution)">{s.wanted} was asked for but {s.error || 'it could not be loaded'}; running on {s.engine}.</Note>}
      {s.migrate && <Note>To move: stop Bench, run <span className="tnum">{s.migrate}</span>, then start with the other engine in machine.json.</Note>}
    </>
  )
}
