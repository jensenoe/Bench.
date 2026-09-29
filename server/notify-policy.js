/**
 * The notification policy (roadmap 150), pure so the tests can walk a day through it. server/notify.js asks
 * `decide()` for every notification: record it in the Bell or not, show it on the desktop or not, and why.
 *
 * Every notification has a category. Each category is Desktop, Bell only or Off (Settings > Notifications);
 * what is not set there takes the default below. The defaults, and why:
 *
 *   meeting    desktop  starts in five minutes: missing it is the one thing that really costs
 *   reminder   desktop  a time you set yourself, or a snoozed notification coming back
 *   due        desktop  two summaries a day at most (overdue in the morning, due today at three)
 *   logbook    desktop  a meeting just ended, write it down; actions due today; both come rarely
 *   project    desktop  an innovation project due in three working days or overdue, three toasts a day at most
 *   clock      desktop  the time clock's lunch, back and morning digest, plus not clocked in, still clocked in
 *   parts      desktop  an ordered part to chase; three toasts a day, the rest in the Bell
 *   nudge      desktop  water and coffee, four a day (nudges.js keeps its own rules on top)
 *   focus      desktop  the focus timer ran out
 *   arrivals   bell     new work from Planner and Issues: worth knowing, never worth an interruption
 *   sheet      bell     Monday's sheet drift: the Hours page is where it gets fixed, on your own time
 *   other      desktop  anything that does not name a category
 *
 * On top of the mode, in this order: a key already sent today in the category is dropped (de-duplication);
 * Bell only records without a toast; the quiet hours, a meeting in progress and a running focus session
 * keep the toast away but the Bell still records it; past the daily cap the Bell records and the desktop
 * stays quiet. A meeting about to start and the end of a focus session are exempt from the meeting and
 * focus rules: the first is the reason to interrupt, the second is the end of the interruption.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isQuiet } = require('../electron/quiet.cjs')

export const MODES = ['desktop', 'bell', 'off']

/** key, label and hint for Settings; mode is the default; cap is desktop toasts a day (null: no cap). */
export const CATEGORIES = [
  { key: 'meeting', label: 'Meetings', hint: 'Five minutes before one starts. A click joins it.', mode: 'desktop', cap: null, busy: false },
  { key: 'reminder', label: 'Your reminders', hint: 'The time set on a task, and a snoozed notification.', mode: 'desktop', cap: null },
  { key: 'due', label: 'Due and overdue tasks', hint: 'Overdue in the morning, still open at 15:00.', mode: 'desktop', cap: 2 },
  { key: 'logbook', label: 'Logbook', hint: 'A meeting just ended; actions due today or overdue.', mode: 'desktop', cap: 8 },
  { key: 'project', label: 'Innovation projects', hint: 'Due within three working days, or overdue.', mode: 'desktop', cap: 3 },
  { key: 'clock', label: 'Time clock', hint: 'Lunch, the morning digest, not clocked in by 09:30, still in at 18:30.', mode: 'desktop', cap: null },
  { key: 'parts', label: 'Parts to chase', hint: 'An ordered part inside its lead time.', mode: 'desktop', cap: 3 },
  { key: 'nudge', label: 'Water and coffee', hint: 'Before a long meeting, after a long stretch.', mode: 'desktop', cap: 4 },
  { key: 'focus', label: 'Focus timer', hint: 'A focus session ran out.', mode: 'desktop', cap: null, busy: false },
  { key: 'suggest', label: 'Suggestions for Today', hint: 'Room on Today and P2 tasks that could fill it, once in the morning; a P1 with no room.', mode: 'bell', cap: 2 },
  { key: 'arrivals', label: 'New work', hint: 'New from Planner and Issues since the last look.', mode: 'bell', cap: null },
  { key: 'sheet', label: 'The time sheet', hint: 'Monday: the sheet and Bench. disagree.', mode: 'bell', cap: null },
  { key: 'other', label: 'Everything else', hint: 'Whatever does not fit above.', mode: 'desktop', cap: null }
]
export const KEYS = CATEGORIES.map(c => c.key)
const BY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))
export const DEFAULT_MODES = Object.fromEntries(CATEGORIES.map(c => [c.key, c.mode]))
/** Rows of these categories offer Snooze in the Bell: they ask you to do something that can wait an hour. */
export const SNOOZABLE = new Set(['reminder', 'due', 'logbook', 'project', 'parts', 'clock'])

/** A known category, or 'other'. */
export const categoryKey = c => KEYS.includes(c) ? c : 'other'

/**
 * The time clock calls notify() without a category and cannot be edited, so its three are known by title
 * and route: "Lunch" (#/lunch), "Back" and the morning digest ("One thing for today", "3 things for today").
 */
export function inferCategory(p = {}) {
  if (p.category) return categoryKey(p.category)
  const title = String(p.title || '').trim()
  if (p.route === '#/lunch' || title === 'Lunch' || title === 'Back' || /^(one thing|\d+ things) for today$/i.test(title)) return 'clock'
  return 'other'
}

/** Settings' notifyModes, cleaned: only known categories, only known modes. Anything else is dropped. */
export function cleanModes(v) {
  const out = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, m] of Object.entries(v)) if (KEYS.includes(k) && MODES.includes(m)) out[k] = m
  return out
}
export const modeOf = (category, settings = {}) => cleanModes(settings.notifyModes)[category] || DEFAULT_MODES[category] || 'desktop'

const mins = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
/** A timed meeting running at `now` (start inclusive, end exclusive). Meetings are today's, times 'HH:MM'. */
export function meetingRunning(meetings, now) {
  const n = now.getHours() * 60 + now.getMinutes()
  return (meetings || []).some(m => m && !m.allDay && !m.isCancelled && mins(m.start) !== null && mins(m.end) !== null && mins(m.start) <= n && n < mins(m.end))
}
const focusRunning = (focusUntil, now) => Boolean(focusUntil) && new Date(focusUntil).getTime() > now.getTime()

/**
 * Why the desktop would stay quiet for this category right now, apart from mode, de-duplication and cap:
 * 'quiet', 'meeting', 'focus' or null. The reminders ask this to wait for the end of a meeting instead of
 * landing only in the Bell.
 */
export function holdReason({ category, now = new Date(), settings = {}, meetings = [], focusUntil = null }) {
  const c = BY[categoryKey(category)]
  if (isQuiet(now, settings)) return 'quiet'
  if (c.busy !== false && settings.notifyNotInMeetings !== false && meetingRunning(meetings, now)) return 'meeting'
  if (c.busy !== false && settings.notifyNotInFocus !== false && focusRunning(focusUntil, now)) return 'focus'
  return null
}

/**
 * The decision for one notification.
 *   category   one of KEYS (anything else counts as 'other')
 *   key        optional; the same category and key a second time on the same day is dropped
 *   day        { keys: [...'category:key'], counts: { category: desktop toasts today } }
 * Returns { record, desktop, reason }: reason is null when it goes to the desktop, otherwise
 * 'off', 'duplicate', 'bell', 'quiet', 'meeting', 'focus' or 'cap'.
 */
export function decide({ category, key = null, now = new Date(), settings = {}, day = {}, meetings = [], focusUntil = null }) {
  const cat = categoryKey(category)
  const mode = modeOf(cat, settings)
  if (mode === 'off') return { record: false, desktop: false, reason: 'off' }
  if (key !== null && key !== undefined && key !== '' && (day.keys || []).includes(`${cat}:${key}`)) return { record: false, desktop: false, reason: 'duplicate' }
  if (mode === 'bell') return { record: true, desktop: false, reason: 'bell' }
  const held = holdReason({ category: cat, now, settings, meetings, focusUntil })
  if (held) return { record: true, desktop: false, reason: held }
  const cap = BY[cat].cap
  if (cap && ((day.counts || {})[cat] || 0) >= cap) return { record: true, desktop: false, reason: 'cap' }
  return { record: true, desktop: true, reason: null }
}

/** When a snooze ends: 'hour' is an hour from now, 'tomorrow' is 08:30 the next day. Null for anything else. */
export function snoozeUntil(preset, now = new Date()) {
  if (preset === 'hour') return new Date(now.getTime() + 60 * 60_000)
  if (preset === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(8, 30, 0, 0); return d }
  return null
}
