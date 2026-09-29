/**
 * "Remind me" on a task (roadmap 150): the preset times, and how a reminder reads on a card. Pure, so the
 * tests can check them against a fixed clock. The server fires the reminder (server/alerts.js).
 *
 *   hour        an hour from now
 *   afternoon   today at 14:00 (hidden once 14:00 has passed)
 *   tomorrow    tomorrow at 08:30
 */
const at = (base, days, h, m) => { const d = new Date(base); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d }

export function presets(now = new Date()) {
  const out = [{ key: 'hour', label: 'In an hour', at: new Date(now.getTime() + 60 * 60_000) }]
  const afternoon = at(now, 0, 14, 0)
  if (afternoon > now) out.push({ key: 'afternoon', label: 'This afternoon, 14:00', at: afternoon })
  out.push({ key: 'tomorrow', label: 'Tomorrow, 08:30', at: at(now, 1, 8, 30) })
  return out.map(p => ({ ...p, iso: p.at.toISOString() }))
}

const pad = n => String(n).padStart(2, '0')
/** The value a datetime-local input shows for an ISO time, in local time. */
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
/** A datetime-local value back to ISO; null when it does not read as a time. */
export const fromLocalInput = (v) => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v || ''))) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString() }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "14:00" today, "tomorrow 08:30", "Thu 1 Oct 09:00" further out; "now" when it is due. */
export function remindLabel(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d <= now) return 'now'
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const day = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (day(d) === day(now)) return hm
  if (day(d) === day(at(now, 1, 12, 0))) return `tomorrow ${hm}`
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`
}
