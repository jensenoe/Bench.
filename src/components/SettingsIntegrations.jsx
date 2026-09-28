import { useEffect, useState } from 'react'
import { j } from '../api/http.js'
import { getMailStatus, runMail } from '../api/mail.js'
import { getCommute } from '../api/day.js'
import { toast } from '../api/extras.js'
import * as api from '../api.js'

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
  const reason = r => r === 'off' ? 'Off.' : r === 'needs-signin' ? 'Connect Microsoft 365 first.' : r === 'needs-admin-consent' ? 'Mail.Read needs its own admin approval. It is not part of the note for your admin above, on purpose: the calendar and the issue list should not wait on it.' : r ? `Could not read: ${r}` : null
  return (
    <>
      <Switch on={on} onChange={onToggle} label="Read the mail for order confirmations and delivery notes"
        hint="Every half hour Bench. matches the last seven days of Outlook against tasks with a supplier and a PO number: a confirmation sets ordered on, a delivery note sets delivered on. Subjects and previews only, never the bodies, and nothing leaves the machine." />
      {on && st && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={async () => { setBusy(true); try { await runMail(); await load() } catch (e) { toast('The mail was not read.', `${e.message}. Try again.`) } finally { setBusy(false) } }} disabled={busy} className={pill + ' btn-quiet'}>{busy ? 'Reading…' : 'Read the mail now'}</button>
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
            : <Note tone="var(--caution)">Not running yet. Bench. picks the change up within half a minute; if it stays off, port 5199 is taken or the firewall said no.</Note>
      )}
    </>
  )
}

/** The drive home with live traffic (roadmap 120): a place, a TomTom key kept on this machine, and a test line. */
export function DriveHome({ draft, set, save, settings }) {
  const [est, setEst] = useState(null)
  const [busy, setBusy] = useState(false)
  const test = async () => { setBusy(true); try { setEst(await getCommute('home', true)) } catch (e) { setEst({ ok: false, reason: e.message }) } finally { setBusy(false) } }
  const reason = r => r === 'no-key' ? 'Paste a TomTom key first.' : r === 'no-home' ? 'Say where home is first.' : r === 'bad-key' ? 'TomTom did not accept the key.' : r === 'offline' ? 'Could not reach TomTom.' : r === 'no-route' ? 'No road between the two.' : r ? `Could not check: ${r}.` : null
  return (
    <>
      <Note>Bench. says how long the drive home takes, with the traffic as it is, from half past three while you are clocked in, and the drive in before half past eight. Work is Oetwil am See. It needs a free TomTom key (developer.tomtom.com, 2,500 calls a day, Bench. uses about forty); the key stays in your own profile and is never exported.</Note>
      <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>Home
        <input value={draft.homePlace ?? ''} placeholder="Neerach" onChange={e => set('homePlace', e.target.value)} onBlur={() => save('homePlace')} onKeyDown={e => { if (e.key === 'Enter') { save('homePlace'); e.target.blur() } }} className="field mt-1 w-full px-2.5 py-2 text-[13px]" style={{ color: 'var(--ink)' }} />
      </label>
      <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>TomTom key
        <input type="password" autoComplete="off" value={draft.trafficKey ?? ''} placeholder={settings.hasTrafficKey ? 'A key is saved. Paste a new one to replace it.' : 'the key from developer.tomtom.com'} onChange={e => set('trafficKey', e.target.value)} onBlur={() => save('trafficKey')} onKeyDown={e => { if (e.key === 'Enter') { save('trafficKey'); e.target.blur() } }} className="field tnum mt-1 w-full px-2.5 py-2 text-[13px]" style={{ color: 'var(--ink)' }} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={test} disabled={busy} className={pill + ' btn-quiet'}>{busy ? 'Asking…' : 'Check the drive home now'}</button>
        {est && <Note tone={est.ok ? 'var(--ink-2)' : 'var(--caution)'}>{est.ok ? est.text : reason(est.reason)}</Note>}
      </div>
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
      {s.migrate && <Note>To move: stop Bench. and run <span className="tnum">{s.migrate}</span>, then start with the other engine in machine.json.</Note>}
    </>
  )
}

/**
 * For the admin (roadmap 138). What Bench. needs from Microsoft, which parts already work, and the one
 * link an admin opens to approve all four permissions at once. The note is ready to paste into a mail or
 * a Teams chat; "Open it here" is for the admin at this desk.
 */
export function AdminApproval({ auth, name = '' }) {
  const [copied, setCopied] = useState(null)
  const a = auth?.approval
  if (!a) return null
  const on = { 'Tasks.ReadWrite': auth.signedIn, 'Files.ReadWrite': auth.signedIn, 'Calendars.Read': auth.extra?.granted, 'Sites.Read.All': auth.extra?.granted }
  const first = String(name || '').trim().split(/\s+/)[0] || ''
  const note = [
    'Hi,', '',
    `Could you approve the app "${a.app}" for me? It is my own planning tool, registered in our tenant (client ID ${a.clientId}). It signs in as me with delegated permissions only, so it sees only what I can already see:`,
    ...a.scopes.map(x => `- ${x.scope}: ${x.why}`), '',
    'One click: open this link with your admin account, check the list, press Accept. A blank page afterwards means it worked.',
    a.url, '',
    'Or in the Entra admin center: Enterprise applications > Project Management Tool > Permissions > Grant admin consent.', '',
    first ? `Thanks, ${first}` : 'Thanks'
  ].join('\n')
  const copy = async (text, which) => { try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 2500) } catch { toast('Could not copy.', 'Select the text by hand instead.') } }
  return (
    <div className="row mt-3 p-4 text-[13.5px]">
      <p className="font-medium">For your admin.</p>
      <p className="mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>Microsoft wants an admin to approve Bench. once for tom.fit. The link below asks for exactly these four, nothing else, and afterwards Bench. picks the approval up by itself.</p>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
        {a.scopes.map(x => (
          <li key={x.scope} className="flex flex-wrap items-baseline gap-x-2">
            <span className="inline-block h-2 w-2 rounded-full" aria-hidden="true" style={{ background: on[x.scope] ? 'var(--ok)' : auth.signedIn ? 'var(--caution)' : 'var(--ink-3)' }} />
            <span className="tnum">{x.scope}</span><span style={{ color: 'var(--ink-3)' }}>{x.why.replace(/\bmy\b/g, 'your')}, {on[x.scope] ? 'works' : auth.signedIn ? 'waiting for the approval' : 'not connected yet'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => copy(note, 'note')} className="pill btn-primary inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium">{copied === 'note' ? 'Copied' : 'Copy a note for your admin'}</button>
        <button onClick={() => copy(a.url, 'link')} className="pill btn-quiet inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px]">{copied === 'link' ? 'Copied' : 'Copy only the link'}</button>
        <button onClick={() => api.openExternal(a.url)} className="-my-1 inline-block py-1 text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Open it here, for an admin at this desk</button>
      </div>
    </div>
  )
}
