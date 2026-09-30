/**
 * Today's meetings from Outlook, so a Logbook entry can start from the calendar instead of a blank page.
 * Read-only. Times come back in the machine's zone via Prefer: outlook.timezone.
 */
import { getTokenSilent, getAccount } from './auth.js'

/**
 * A calendar block that is not a meeting (roadmap 165): lunch. Only a title that is nothing but lunch counts, in English,
 * German or Swiss German ("Lunch", "Lunch break", "Mittagspause", "Zmittag"); "Lunch & Learn: CAD" stays a meeting.
 */
const LUNCH = new Set(['lunch', 'lunch break', 'lunchbreak', 'lunch time', 'lunchtime', 'mittag', 'mittagessen', 'mittagspause', 'mittagszeit', 'zmittag', 'zmittag esse', 'zmittagesse'])
export const notAMeeting = (subject) => LUNCH.has(String(subject || '').toLowerCase().normalize('NFKD').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim())

export async function todaysMeetings(date = new Date()) {
  const token = await getTokenSilent('extra')
  if (!token) return { ok: false, reason: (await getAccount()) ? 'needs-admin-consent' : 'needs-signin', events: [] }
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich'
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,attendees,organizer,isAllDay,isCancelled,onlineMeeting,webLink`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.timezone="${tz}"` } })
  if (!res.ok) return { ok: false, reason: `Graph ${res.status}`, events: [] }
  const { value = [] } = await res.json()
  return {
    ok: true,
    events: value.filter(e => !e.isCancelled && !notAMeeting(e.subject)).map(e => ({
      id: e.id, subject: e.subject || 'Meeting', allDay: !!e.isAllDay,
      start: e.start?.dateTime?.slice(11, 16) || '', end: e.end?.dateTime?.slice(11, 16) || '',
      location: e.location?.displayName || null,
      organizer: e.organizer?.emailAddress?.name || null,
      attendees: (e.attendees || []).map(a => a.emailAddress?.name).filter(Boolean),
      link: e.webLink || null,
      online: Boolean(e.onlineMeeting),
      joinUrl: e.onlineMeeting?.joinUrl || null   // the Teams link the five-minute reminder opens (roadmap 150)
    }))
  }
}
