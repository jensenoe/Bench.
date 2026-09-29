import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bell as BellIcon } from '@phosphor-icons/react'
import { getNotifications, markNotificationsRead, snoozeNotification } from '../api/notify.js'
import { openExternal } from '../api.js'
import { toast } from '../api/extras.js'
import { fmtDate } from '../lanes.js'

/**
 * Notification history in the nav (roadmap 107, 150). The bell carries a dot while something is unread; the
 * panel lists the last 30, grouped into today, yesterday and earlier, newest first. Open goes where the toast
 * would have gone (a meeting opens its Teams link) and counts the row as read. A row that asks you to do
 * something (a reminder, due tasks, a project, parts, the clock) can be snoozed for an hour or to 08:30
 * tomorrow: it comes back as a fresh notification then. "Mark all read" clears the dot. Polls every minute
 * and on bench:refresh.
 */
const POLL_MS = 60_000
/** "just now", "12 min ago", "3 h ago", then the date. */
export const ago = (iso, now = new Date()) => {
  const min = Math.max(0, Math.round((now - new Date(iso)) / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return fmtDate(iso)
}
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
/** Today, Yesterday, Earlier: the groups that have rows, in that order. */
export function groupByDay(items, now = new Date()) {
  const y = new Date(now); y.setDate(y.getDate() - 1)
  const today = dayKey(now), yesterday = dayKey(y)
  const groups = [{ key: 'today', label: 'Today', items: [] }, { key: 'yesterday', label: 'Yesterday', items: [] }, { key: 'earlier', label: 'Earlier', items: [] }]
  for (const n of items) {
    const k = dayKey(new Date(n.at))
    groups[k === today ? 0 : k === yesterday ? 1 : 2].items.push(n)
  }
  return groups.filter(g => g.items.length)
}
const hm = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const backAt = (iso, now = new Date()) => dayKey(new Date(iso)) === dayKey(now) ? `back at ${hm(iso)}` : `back ${fmtDate(iso)} at ${hm(iso)}`
const act = 'pill btn-ghost inline-flex h-6 items-center px-2 text-[12.5px] font-medium'

export default function Bell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const box = useRef(null), btn = useRef(null)

  const poll = useCallback(async () => {
    try {
      const r = await getNotifications(30)
      setItems(Array.isArray(r.items) ? r.items : []); setUnread(r.unread || 0); setNow(new Date())
    } catch { /* the next poll tries again */ }
  }, [])
  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    addEventListener('bench:refresh', poll)
    return () => { clearInterval(id); removeEventListener('bench:refresh', poll) }
  }, [poll])
  useEffect(() => {
    if (!open) return
    poll()
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    addEventListener('mousedown', onDoc); addEventListener('keydown', onKey)
    return () => { removeEventListener('mousedown', onDoc); removeEventListener('keydown', onKey) }
  }, [open, poll])

  const markLocal = (id) => {
    setItems(list => list.map(i => i.id === id ? { ...i, read: true } : i))
    setUnread(u => Math.max(0, u - 1))
  }
  const go = (n) => {
    setOpen(false)
    if (!n.read) {
      markLocal(n.id)
      markNotificationsRead([n.id]).catch(() => { /* the next poll shows the truth */ })
    }
    if (typeof n.url === 'string' && /^https:/.test(n.url)) openExternal(n.url)
    else if (typeof n.route === 'string' && n.route.startsWith('#')) location.hash = n.route
  }
  const snooze = async (n, preset) => {
    try {
      const r = await snoozeNotification(n.id, preset)
      setItems(list => list.map(i => i.id === n.id ? { ...i, read: true, snoozedUntil: r.until } : i)); setUnread(r.unread ?? 0)
      const line = backAt(r.until, new Date())
      toast('Snoozed.', `${line[0].toUpperCase()}${line.slice(1)}.`)
    } catch (e) { toast('Not snoozed.', e?.message ? `${e.message}. Try again.` : 'Try again.') }
  }
  const allRead = () => {
    setItems(list => list.map(i => ({ ...i, read: true }))); setUnread(0)
    markNotificationsRead('all').catch(() => { /* the next poll shows the truth */ })
  }
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'
  const groups = groupByDay(items, now)

  return (
    <div ref={box} className="relative">
      <button ref={btn} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="dialog" aria-label={label} title={label}
        className="relative grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-[var(--wash)] 2xl:h-11 2xl:w-11"
        style={{ color: open ? 'var(--ink)' : 'var(--ink-3)', background: open ? 'var(--wash-2)' : 'transparent' }}>
        <BellIcon size={15} weight="bold" />
        {unread > 0 && <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 0 2px rgba(var(--veil),.9)' }} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="panel" role="dialog" aria-label="Notifications" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}
            className="panel off-photo absolute right-0 top-full z-[60] mt-2 w-[380px] max-w-[calc(100vw-2rem)] p-4 text-[13.5px]" style={{ boxShadow: 'var(--shadow-pop)' }}>
            <div className="flex items-baseline justify-between">
              <span className="display text-[17px] font-semibold">Notifications.</span>
              <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{unread ? `${unread} unread` : items.length ? 'all read' : ''}</span>
            </div>
            {items.length === 0
              ? <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing yet. What Bench. tells you lands here as well.</p>
              : (
                <div className="mt-2 flex max-h-[60vh] flex-col overflow-y-auto">
                  {groups.map(g => (
                    <section key={g.key} aria-label={g.label} className="mt-2 first:mt-0">
                      <h3 className="px-3 pb-1 text-[12.5px] font-medium" style={{ color: 'var(--ink-3)' }}>{g.label}</h3>
                      <ul className="flex flex-col gap-1">
                        {g.items.map(n => (
                          <li key={n.id} className="row flex items-start gap-2.5 px-3 py-2">
                            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.read ? 'transparent' : 'var(--accent)' }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate font-medium" style={{ color: n.read ? 'var(--ink-2)' : 'var(--ink)' }}>{n.title}{n.read ? '' : <span className="sr-only">, unread</span>}</span>
                                <span className="tnum shrink-0 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{ago(n.at, now)}</span>
                              </div>
                              {n.body && <p className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--ink-3)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</p>}
                              <div className="-ml-2 mt-1 flex flex-wrap items-center gap-1">
                                {(n.route || n.url) && <button onClick={() => go(n)} aria-label={`Open: ${n.title} ${n.body || ''}`} className={act} style={{ color: 'var(--ink-2)' }}>Open</button>}
                                {n.snoozable && !n.snoozedUntil && <>
                                  <button onClick={() => snooze(n, 'hour')} aria-label={`Snooze ${n.title} for an hour`} className={act} style={{ color: 'var(--ink-3)' }}>Snooze 1 hour</button>
                                  <button onClick={() => snooze(n, 'tomorrow')} aria-label={`Snooze ${n.title} to 08:30 tomorrow`} className={act} style={{ color: 'var(--ink-3)' }}>Tomorrow 08:30</button>
                                </>}
                                {n.snoozedUntil && <span className="tnum px-2 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Snoozed, {backAt(n.snoozedUntil, now)}</span>}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            {items.length > 0 && (
              <div className="mt-3 flex justify-end">
                <button onClick={allRead} disabled={!unread} className="-my-1 inline-block py-1 text-[13px] underline-offset-2 hover:underline disabled:no-underline" style={{ color: 'var(--ink-3)' }}>Mark all read</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
