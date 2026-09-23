import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bell as BellIcon } from '@phosphor-icons/react'
import { getNotifications, markNotificationsRead } from '../api/notify.js'
import { fmtDate } from '../lanes.js'

/**
 * Notification history in the nav (roadmap 107). The bell carries a dot while something is unread; the
 * panel lists the last 20 with when they came, newest first. A row goes where the toast would have gone
 * and counts as read from then on; "Mark all read" clears the dot. Polls every minute and on bench:refresh.
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

export default function Bell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const box = useRef(null), btn = useRef(null)

  const poll = useCallback(async () => {
    try {
      const r = await getNotifications(20)
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

  const go = (n) => {
    setOpen(false)
    if (!n.read) {
      setItems(list => list.map(i => i.id === n.id ? { ...i, read: true } : i)); setUnread(u => Math.max(0, u - 1))
      markNotificationsRead([n.id]).catch(() => { /* the next poll shows the truth */ })
    }
    if (typeof n.route === 'string' && n.route.startsWith('#')) location.hash = n.route
  }
  const allRead = () => {
    setItems(list => list.map(i => ({ ...i, read: true }))); setUnread(0)
    markNotificationsRead('all').catch(() => { /* the next poll shows the truth */ })
  }
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <div ref={box} className="relative">
      <button ref={btn} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="dialog" aria-label={label} title={label}
        className="relative grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-[rgba(var(--ink-rgb),.08)] 2xl:h-11 2xl:w-11"
        style={{ color: open ? 'var(--ink)' : 'var(--ink-3)', background: open ? 'rgba(var(--ink-rgb),.1)' : 'transparent' }}>
        <BellIcon size={15} weight="bold" />
        {unread > 0 && <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 0 2px rgba(var(--veil),.9)' }} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="panel" role="dialog" aria-label="Notifications" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}
            className="panel absolute right-0 top-full z-[60] mt-2 w-[360px] p-4 text-[13.5px]" style={{ boxShadow: 'var(--shadow-panel)' }}>
            <div className="flex items-baseline justify-between">
              <span className="display text-[17px] font-semibold">Notifications.</span>
              <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{unread ? `${unread} unread` : items.length ? 'all read' : ''}</span>
            </div>
            {items.length === 0
              ? <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing yet. What Bench tells you lands here as well.</p>
              : (
                <ul className="mt-3 flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                  {items.map(n => (
                    <li key={n.id}>
                      <button onClick={() => go(n)} aria-label={`${n.title} ${n.body || ''}, ${ago(n.at, now)}${n.read ? '' : ', unread'}`}
                        className="row flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[rgba(var(--ink-rgb),.04)]">
                        <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.read ? 'transparent' : 'var(--accent)' }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate font-medium" style={{ color: n.read ? 'var(--ink-2)' : 'var(--ink)' }}>{n.title}</span>
                            <span className="tnum shrink-0 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{ago(n.at, now)}</span>
                          </span>
                          {n.body && <span className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--ink-3)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
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
