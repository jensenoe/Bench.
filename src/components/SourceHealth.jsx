import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as api from '../api.js'
import { getSourceHealth } from '../api/sources.js'
import { toast } from '../api/extras.js'
import { fmtDate } from '../lanes.js'
import { Bar } from './Skeleton.jsx'

/**
 * The Sources light in the top bar (roadmap 174). One dot and the word: no colour while every tool reads (or is
 * off on purpose), --caution when one is out of date or reads but probably the wrong thing, --late when one needs
 * a sign-in or fails. A click opens a short list: each tool, its state, why in plain words, when it last read or
 * since when it has not, and the one thing to do about it. Reads /api/sources/health every minute while the
 * window shows, and on bench:refresh. Escape closes and gives focus back to the light.
 */
const POLL_MS = 60_000
export const LATE = new Set(['signin', 'error'])
export const CAUTION = new Set(['stale', 'suspect'])
export const PROBLEM = new Set(['signin', 'error', 'stale', 'suspect'])
/** The state of one source, in a word or two. */
export const WORD = { ok: 'Reading', off: 'Off', stale: 'Out of date', suspect: 'Check', signin: 'Needs sign-in', error: 'Failed' }
/** The token for a state, or null for the calm ones. */
export const toneOf = state => LATE.has(state) ? 'var(--late)' : CAUTION.has(state) ? 'var(--caution)' : null
const hm = d => d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
/** "13:09" today, "Wed 7 Oct" before. */
export const whenOf = (iso, now = new Date()) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : sameDay(d, now) ? hm(d) : fmtDate(iso) }
/** "since Wed 7 Oct" for a problem, "last read 13:09" for a tool that reads, nothing for one that is off. */
export function whenLine(s, now = new Date()) {
  if (PROBLEM.has(s.state) && s.state !== 'suspect' && s.since) return `since ${whenOf(s.since, now)}`
  if (s.lastSync && s.state !== 'off') return `last read ${whenOf(s.lastSync, now)}`
  return null
}
/** "all reading", "1 not reading, 1 to check". */
export function summary(list = []) {
  const late = list.filter(s => LATE.has(s.state)).length, look = list.filter(s => CAUTION.has(s.state)).length
  const parts = [late && `${late} not reading`, look && `${look} to check`].filter(Boolean)
  return parts.length ? parts.join(', ') : list.some(s => s.state === 'ok') ? 'all reading' : 'none connected'
}
const ACTION = { signin: ['Sign in', 'Signing in'], connect: ['Connect Microsoft 365', 'Connecting'], sync: ['Sync now', 'Syncing'] }

/** The health of every source, polled every minute while the window shows and on bench:refresh. */
export function useSourceHealth() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(null)
  const poll = useCallback(async () => {
    try { setData(await getSourceHealth()); setFailed(null) } catch (e) { setFailed(e?.message || 'no answer') }
  }, [])
  useEffect(() => {
    poll()
    const visible = () => { if (document.visibilityState === 'visible') poll() }
    const id = setInterval(visible, POLL_MS)
    addEventListener('bench:refresh', poll)
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(id); removeEventListener('bench:refresh', poll); document.removeEventListener('visibilitychange', visible) }
  }, [poll])
  return { data, failed, poll }
}

/** One source in the list. */
function SourceRow({ s, now, busy, onAct, first }) {
  const tone = toneOf(s.state)
  const when = whenLine(s, now)
  const [label, doing] = ACTION[s.action] || []
  return (
    <li className={`${first ? '' : 'rule '}flex items-start gap-3 py-2.5`}>
      <span aria-hidden="true" className="mt-[6px] h-2 w-2 shrink-0 rounded-full" style={{ background: tone || (s.state === 'ok' ? 'var(--ok)' : 'transparent'), boxShadow: tone || s.state === 'ok' ? 'none' : 'inset 0 0 0 1.5px var(--ink-3)' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium" style={{ color: 'var(--ink)' }}>{s.label}</span>
          <span className="shrink-0 text-[12.5px] font-medium" style={{ color: tone || (s.state === 'ok' ? 'var(--ok)' : 'var(--ink-3)') }}>{WORD[s.state] || s.state}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>{s.reason}</p>
        {(when || label) && (
          <div className="mt-1 flex min-h-6 items-center justify-between gap-3">
            <span className="tnum text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{when}</span>
            {label && (
              <button onClick={() => onAct(s)} disabled={busy} aria-busy={busy || undefined} aria-label={`${label}: ${s.label}`}
                className="pill btn-quiet -my-0.5 inline-flex h-7 items-center px-3 text-[12.5px] font-medium">{busy ? doing : label}</button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export default function SourceHealth({ onConnect }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const { data, failed, poll } = useSourceHealth()
  const box = useRef(null), btn = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    poll()
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    const onRoute = () => setOpen(false)
    addEventListener('mousedown', onDoc); addEventListener('keydown', onKey); addEventListener('hashchange', onRoute)
    return () => { removeEventListener('mousedown', onDoc); removeEventListener('keydown', onKey); removeEventListener('hashchange', onRoute) }
  }, [open, poll])

  const act = async (s) => {
    if (s.action === 'connect') { setOpen(false); onConnect?.(); return }
    setBusy(s.key)
    try {
      const r = s.action === 'signin' ? await api.signInSource(s.key) : await api.syncSource(s.key)
      if (r && r.ok === false) toast(s.action === 'signin' ? `${s.label}: not signed in yet.` : `${s.label} did not read.`, r.reason === 'needs-signin' ? 'It wants a sign-in first.' : r.reason ? `${r.reason}.` : null)
      else toast(s.action === 'signin' ? `${s.label} signed in.` : `${s.label} synced.`)
    } catch (e) { toast(`${s.label}: that did not work.`, e?.message ? `${e.message}.` : null) }
    finally { setBusy(null); window.dispatchEvent(new Event('bench:refresh')) }
  }

  const list = data?.sources || []
  const tone = toneOf(data?.state)
  const said = data ? summary(list) : failed ? 'not checked' : 'checking'
  const now = new Date()

  return (
    <div ref={box} className="relative">
      <button ref={btn} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined}
        aria-label={`Sources, ${said}`} title={`Sources: ${said}`}
        className="pill flex h-10 items-center gap-2 px-3 text-[13.5px] transition-colors hover:bg-[var(--wash)] 2xl:h-11 2xl:text-[15px]"
        style={{ color: open ? 'var(--ink)' : 'var(--ink-3)', background: open ? 'var(--wash-2)' : 'transparent' }}>
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={tone ? { background: tone, boxShadow: '0 0 0 2px rgba(var(--veil),.9)' } : { boxShadow: 'inset 0 0 0 1.5px currentColor' }} />
        <span className="hidden xl:inline">Sources</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="panel" id={panelId} role="dialog" aria-label="Sources" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}
            className="panel off-photo absolute right-0 top-full z-[60] mt-2 w-[380px] max-w-[calc(100vw-2rem)] whitespace-normal p-4 text-[13.5px]" style={{ boxShadow: 'var(--shadow-pop)' }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="display text-[17px] font-semibold">Sources.</span>
              <span className="text-[13px]" style={{ color: tone || 'var(--ink-3)' }}>{data ? said : ''}</span>
            </div>
            {!data && failed && (
              <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>The sources did not load: {failed}. <button onClick={poll} className="-my-[3px] py-[3px] underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Try again</button></p>
            )}
            {!data && !failed && <div className="mt-3 flex flex-col gap-3"><Bar w="70%" /><Bar w="55%" /><Bar w="62%" /></div>}
            {data && (
              <ul className="mt-2 flex flex-col" aria-label="Sources Bench. reads">
                {list.map((s, i) => <SourceRow key={s.key} s={s} now={now} busy={busy === s.key} onAct={act} first={i === 0} />)}
              </ul>
            )}
            <div className="rule mt-1 flex items-center justify-between pt-2.5">
              <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Connected tools sync every two minutes.</span>
              <a href="#/tools" onClick={() => setOpen(false)} className="-my-1 inline-block py-1 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>Tools</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
