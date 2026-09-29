/** Meeting prep and Log this meeting (server/meetprep-live.js, roadmap 163). */
import { j, H } from './http.js'

/** { meeting, phase: 'soon' | 'now' | 'ended', minutes, prep } for the Home card, or { meeting: null } */
export const getNextPrep = () => fetch('/api/meetprep/next').then(j)
/** One of today's meetings with its prep; throws "That meeting is not on today's calendar." when it is gone. */
export const getPrep = (id) => fetch(`/api/meetprep/${encodeURIComponent(id)}`).then(j)
export const prepHref = (id) => `#/meeting?id=${encodeURIComponent(id)}`

/**
 * Log this meeting: today's entry when it exists, otherwise a new one from the prep's draft (title, day,
 * project, attendees, tags and the open items as a reference list), then the Logbook opens on it.
 * Only ever called from a click. Resolves to the entry id.
 */
export async function logMeeting(prep) {
  let id = prep?.logged || null
  if (!id) {
    const e = await fetch('/api/logbook', { method: 'POST', headers: H, body: JSON.stringify(prep?.draft || {}) }).then(j)
    id = e.id
    window.dispatchEvent(new Event('bench:refresh'))
  }
  location.hash = `#/logbook?entry=${encodeURIComponent(id)}`
  return id
}

/** "in 12 minutes", "now, until 10:30", "ended at 10:30" */
export function whenText(phase, minutes, meeting) {
  const n = Math.max(0, Number(minutes) || 0)
  if (phase === 'soon') return n <= 0 ? 'starting now' : `in ${n} ${n === 1 ? 'minute' : 'minutes'}`
  if (phase === 'now') return meeting?.end ? `now, until ${meeting.end}` : 'now'
  if (phase === 'ended') return meeting?.end ? `ended at ${meeting.end}` : 'ended'
  if (phase === 'later') return meeting?.start ? `at ${meeting.start}` : 'later today'
  return ''
}
/** A subject as a headline: it ends with a period unless it already ends with a mark of its own. */
export const headline = (s) => { const t = String(s || 'Meeting').trim(); return /[.?!]$/.test(t) ? t : `${t}.` }
/**
 * A task's reason without what the page already says: with one project or machine on the meeting, "I-1050"
 * on every line repeats the chip, so only the rest ("with Jacob") stays. Null when nothing is left.
 */
export function reasonText(reason, topics = []) {
  const things = topics.filter(t => t.kind !== 'person')
  const parts = String(reason || '').split(', ').filter(Boolean)
  return (things.length === 1 ? parts.filter(x => x !== things[0].label) : parts).join(', ') || null
}
/** Who owes an action: you, or the name as the Logbook has it. */
export const ownerText = (a) => a?.mine ? 'you' : (a?.owner || null)
/** Is an entry of the same meeting series (same title)? Then the line need not say its title. */
export const sameSeries = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
