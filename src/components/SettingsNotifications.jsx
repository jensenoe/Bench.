import { useEffect, useState } from 'react'
import { getNotifyCategories, sendTestNotification } from '../api/notify.js'
import { toast, refresh } from '../api/extras.js'
import { Bar } from './Skeleton.jsx'

/**
 * Settings > Notifications (roadmap 150): per category Desktop, Bell only or Off, with the server's default
 * for each (server/notify-policy.js). The quiet hours and the meeting and focus switches sit next to it in
 * Settings.jsx; the test button is here.
 */
const MODES = [{ key: 'desktop', label: 'Desktop' }, { key: 'bell', label: 'Bell only' }, { key: 'off', label: 'Off' }]

export function NotifyCategories({ modes = {}, onPick }) {
  const [cats, setCats] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => getNotifyCategories().then(r => { setCats(Array.isArray(r?.categories) ? r.categories : []); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  if (err) return <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>The categories did not load: {err}. <button onClick={load} className="-my-[3px] py-[3px] underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Try again</button></p>
  if (!cats) return <Bar w="70%" h={12} />
  return (
    <ul className="flex flex-col gap-3">
      {cats.map(c => {
        const mode = modes?.[c.key] || c.default
        return (
          <li key={c.key} className="flex flex-col gap-1.5">
            <span className="text-[13px]" style={{ color: 'var(--ink)' }}>{c.label}
              <span className="mt-0.5 block text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{c.hint}{c.default !== 'desktop' ? ` Bell only unless you change it.` : ''}</span>
            </span>
            <div role="group" aria-label={c.label} className="flex flex-wrap gap-1.5">
              {MODES.map(m => {
                const on = mode === m.key
                return <button key={m.key} onClick={() => !on && onPick(c.key, m.key)} aria-pressed={on} className="pill inline-flex min-h-6 items-center px-3 py-1 text-[13px] transition-colors"
                  style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'var(--wash-2)' : 'transparent' }}>{m.label}</button>
              })}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function TestNotification() {
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await sendTestNotification()
      refresh()
      toast('Sent.', window.bench?.desktop ? 'It shows in the corner of the screen and in the Bell.' : 'It is in the Bell. Windows notifications come from the desktop app.')
    } catch (e) { toast('Not sent.', e?.message ? `${e.message}. Try again.` : 'Try again.') }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={send} disabled={busy} aria-busy={busy || undefined} className="pill btn-quiet px-3.5 py-1.5 text-[13.5px] font-medium">Send a test notification</button>
      <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>It comes through the quiet hours.</span>
    </div>
  )
}
