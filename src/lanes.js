export const LANES = {
  today: {
    key: 'today', label: 'Today', accent: 'var(--color-alpenglow)',
    blurb: 'What actually gets done before you leave.', cap: 5
  },
  innovation: {
    key: 'innovation', label: 'Innovation', accent: 'var(--color-lichen)',
    blurb: 'The lane that starves when a machine breaks.', cap: null
  },
  waiting: {
    key: 'waiting', label: 'Waiting on', accent: 'var(--color-ice)',
    blurb: 'Someone else holds this. Age it, chase it.', cap: null
  },
  active: {
    key: 'active', label: 'Active', accent: 'var(--color-rock-500)',
    blurb: 'In flight, not today.', cap: null
  },
  parked: {
    key: 'parked', label: 'Parked', accent: 'var(--color-stone-400)',
    blurb: 'Deliberately not now. Not a guilt pile.', cap: null
  }
}
export const LANE_ORDER = ['today', 'innovation', 'waiting', 'active', 'parked']

export const DAY = 86400000
/** A task's priority: its own, else its tool's (1 to 3), else none. Same rule as the server's effectivePriority. */
export const priorityOf = t => t.priority ?? (Number(t.meta?.prio) >= 1 && Number(t.meta?.prio) <= 3 ? Number(t.meta.prio) : null)
/**
 * P2 tasks that could fill Today's free places (roadmap 155): open, from Innovation or Active, not set aside today,
 * soonest due first, at most two and never more than the room. Pure.
 */
export function p2Suggestions(candidates, room, notToday = []) {
  if (room <= 0) return []
  return candidates.filter(t => !t.done && priorityOf(t) === 2 && !notToday.includes(t.id))
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
    .slice(0, Math.min(2, room))
}
export const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / DAY) : null
export const daysUntil = (iso) => {
  if (!iso) return null
  const d = new Date(iso); d.setHours(0, 0, 0, 0)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((d - t) / DAY)   // whole calendar days, exact
}
/** "Tue 22 Sep": three-letter month, day first, no locale surprises like "Sept". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const shortDate = (d, { weekday = true } = {}) => `${weekday ? DAYS[d.getDay()] + ' ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}`
export const fmtDate = (iso) => iso ? shortDate(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) : null
