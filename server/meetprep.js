/**
 * Meeting prep (roadmap 163): what a meeting is about and what to bring, from what Bench. already holds.
 * Pure: the meeting and the data come in through the arguments, nothing is read or written here, so the
 * tests can feed it fixtures and server/meetprep-live.js feeds it the live store.
 *
 *   prepFor(meeting, { tasks, entries, projects, machines, portfolio, me, today })
 *     topics   the I-codes, machine names and project names in the subject and the place (the body is not
 *              fetched: Calendars.ReadBasic has none), plus the attendees the board knows as a lead, the one
 *              who handed a task over or the one a task waits on
 *     open     open tasks tied to those topics or people, at most 8, each with its reason ("I-1050", "with Jacob")
 *     owed     open Logbook actions tied to the topics or owned by an attendee, at most 8
 *     last     the last Logbook entry of the same meeting or on the same topics, with its date and decisions
 *     waiting  open tasks waiting on an attendee
 *     draft    the Logbook entry "Log this meeting" starts, created only when that is clicked
 *
 *   phaseOf(meeting, now)      'soon' within 30 minutes, 'now' while it runs, 'ended' after, else 'later'
 *   pickNext(meetings, now, prepOf, loggedOf)   the one meeting the Home card speaks of, or null
 *
 * Names match without case or accents ("Jürg" is "Jurg" is "Juerg"), and a first name matches the full one
 * ("Jacob" on a task is "Jacob Müller" in the calendar). Your own name never counts as an attendee.
 */
import { codeOf, mentions } from './codes.js'

export const SOON_MIN = 30
export const LIMIT = 8

// ── words ─────────────────────────────────────────────────────────────
/** Lower case, accents off, German umlauts written out folded the same way, so "Jürg", "Jurg" and "Juerg" meet. */
export const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Does the folded text hold the phrase as whole words? */
const hasPhrase = (text, phrase) => {
  const p = fold(phrase).replace(/\s+/g, ' ').trim()
  return p.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'u').test(fold(text))
}
/** Every I-code in a text, upper-cased, once each, in order. */
export const codesIn = text => [...new Set([...String(text || '').matchAll(/\bI-(\d{3,5})\b/gi)].map(m => `I-${m[1]}`))]

// ── people ────────────────────────────────────────────────────────────
/** The words of a name: an address gives its local part, brackets are dropped, one-letter initials too. */
export const nameTokens = name => {
  let s = String(name || '').trim()
  if (s.includes('@')) s = s.split('@')[0].replace(/[._-]+/g, ' ')
  s = s.replace(/\([^)]*\)/g, ' ')
  return fold(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2)
}
/** Two spellings of one person: every word of the shorter name is in the longer one. */
export function samePerson(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b)
  if (!ta.length || !tb.length) return false
  const [short, long] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)]
  return short.every(t => long.has(t))
}
/** The organiser and the attendees, once each, without you. */
export function peopleOf(meeting, me = '') {
  const out = []
  for (const n of [meeting?.organizer, ...(meeting?.attendees || [])]) {
    const name = String(n || '').trim()
    if (!name || !nameTokens(name).length) continue
    if (me && samePerson(name, me)) continue
    if (out.some(x => samePerson(x, name) && nameTokens(x).length === nameTokens(name).length)) continue
    out.push(name)
  }
  return out
}
const PERSON_FIELDS = [['lead', 'with'], ['assignedBy', 'from'], ['waitingOn', 'waiting on']]
const firstName = s => String(s || '').trim().split(/\s+/)[0]

// ── time ──────────────────────────────────────────────────────────────
const minOf = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const nowMin = now => now.getHours() * 60 + now.getMinutes()
/** 'soon' (starts within 30 minutes), 'now' (running), 'ended' (earlier today), 'later', or null for an all-day or untimed one. */
export function phaseOf(m, now = new Date(), soon = SOON_MIN) {
  if (!m || m.allDay || m.isCancelled) return null
  const s = minOf(m.start), e = minOf(m.end) ?? s, n = nowMin(now)
  if (s === null) return null
  if (s > n) return s - n <= soon ? 'soon' : 'later'
  return n < e ? 'now' : 'ended'
}
/** Minutes until the start (soon), until the end (now) or since the end (ended). */
export function minutesOf(m, now = new Date()) {
  const n = nowMin(now), s = minOf(m?.start), e = minOf(m?.end) ?? s
  const ph = phaseOf(m, now)
  return ph === 'soon' || ph === 'later' ? s - n : ph === 'now' ? e - n : ph === 'ended' ? n - e : null
}
/** The join link: the Teams URL, or the event's web link when it is an online meeting. Null for a room. */
export const joinOf = m => m?.joinUrl || m?.onlineMeeting?.joinUrl || (m?.online || m?.onlineMeeting ? m?.link || m?.webLink || null : null)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = v => v ? String(v).slice(0, 10) : null
/** "Thu 1 Oct" */
const fmtDay = s => { const d = new Date(`${String(s).slice(0, 10)}T12:00:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }

// ── topics ────────────────────────────────────────────────────────────
const LANE_RANK = { today: 0, innovation: 1, active: 2, waiting: 3, parked: 4 }
const machineSpellings = m => [...new Set([m?.name, ...(m?.spellings || [])].map(s => String(s || '').trim()).filter(s => s.length >= 2))]

/**
 * The topics of a meeting: codes first (with the project's name when the portfolio knows it), then
 * machines, then plans from Projects, then people. Each is { kind, label, ... } and appears once.
 */
export function topicsOf(meeting, { tasks = [], entries = [], projects = [], machines = [], portfolio = [], me = '' } = {}) {
  const text = [meeting?.subject, meeting?.location, meeting?.bodyPreview].filter(Boolean).join(' \n ')
  const topics = []
  const codes = new Set(codesIn(text))
  // an innovation project named by its name alone ("Handgrip strength review") is its code too
  for (const p of portfolio) if (p?.code && p.name && p.name !== p.code && String(p.name).trim().length >= 4 && hasPhrase(text, p.name)) codes.add(p.code)
  for (const code of codes) {
    const p = portfolio.find(x => x.code === code)
    topics.push({ kind: 'code', label: code, key: code, name: p?.name && p.name !== code ? p.name : null })
  }
  for (const m of machines) {
    const hit = machineSpellings(m).find(s => !codesIn(s).length && hasPhrase(text, s))
    if (hit && !topics.some(t => t.kind === 'machine' && t.key === m.key)) topics.push({ kind: 'machine', label: m.name || hit, key: m.key || fold(m.name), spellings: machineSpellings(m), tasks: m.tasks || [] })
  }
  for (const p of projects) {
    if (!p || p.archived || String(p.name || '').trim().length < 3) continue
    if (!hasPhrase(text, p.name)) continue
    const code = codesIn(p.machine)[0] || codesIn(p.name)[0]
    if (code && topics.some(t => t.kind === 'code' && t.key === code)) continue   // the code already stands for it
    topics.push({ kind: 'project', label: p.name, key: p.id || fold(p.name), machine: p.machine || null, code: code || null })
  }
  // people: the attendees the board or the Logbook knows by name
  const known = [
    ...tasks.filter(t => !t.done).flatMap(t => PERSON_FIELDS.map(([f]) => t[f]).filter(Boolean)),
    ...entries.flatMap(e => (e.actions || []).filter(a => !a.done && a.owner).map(a => a.owner))
  ]
  for (const name of peopleOf(meeting, me)) {
    if (known.some(k => samePerson(k, name))) topics.push({ kind: 'person', label: name, key: fold(name) })
  }
  return topics
}

/** Why a task belongs to the meeting: the topic or person reasons it meets, at most two, or null. */
function taskReasons(t, topics, people) {
  const out = []
  const blob = [t.title, t.project, t.meta?.machine].filter(Boolean).join(' ')
  for (const tp of topics) {
    // the project's own Planner card is the project, not a task on it (as on the project's page)
    if (tp.kind === 'code' && !(t.source === 'planner' && codeOf(t.title) === tp.key) && (mentions(t.title, tp.key) || mentions(t.project, tp.key))) out.push(tp.label)
    else if (tp.kind === 'machine' && (tp.tasks.includes(t.id) || tp.spellings.some(s => fold(s) === fold(t.project) || fold(s) === fold(t.meta?.machine) || hasPhrase(blob, s)))) out.push(tp.label)
    else if (tp.kind === 'project' && ((tp.machine && fold(tp.machine) === fold(t.project)) || hasPhrase(blob, tp.label))) out.push(tp.label)
  }
  for (const [field, word] of PERSON_FIELDS) {
    if (field === 'waitingOn' || !t[field]) continue
    if (people.some(p => samePerson(t[field], p))) out.push(`${word} ${firstName(t[field])}`)
  }
  return out.length ? [...new Set(out)].slice(0, 2).join(', ') : null
}
/** Is a Logbook entry on one of the topics (codes also count in its notes, as on a project's page)? */
function entryTopic(e, topics) {
  const blob = [e.title, e.project, ...(e.tags || [])].filter(Boolean).join(' ')
  for (const tp of topics) {
    if (tp.kind === 'code' && mentions([blob, e.notes].join(' '), tp.key)) return tp.label
    if (tp.kind === 'machine' && tp.spellings.some(s => fold(s) === fold(e.project) || hasPhrase(blob, s))) return tp.label
    if (tp.kind === 'project' && ((tp.machine && fold(tp.machine) === fold(e.project)) || hasPhrase(blob, tp.label))) return tp.label
  }
  return null
}
const sameTitle = (a, b) => fold(a).replace(/\s+/g, ' ').trim() === fold(b).replace(/\s+/g, ' ').trim() && fold(a).trim() !== ''

/** Today's Logbook entry of this meeting (same title, same day), or null. */
export const loggedOf = (meeting, entries = [], today) => entries.find(e => e.date === today && sameTitle(e.title, meeting?.subject)) || null

// ── the prep ──────────────────────────────────────────────────────────
export function prepFor(meeting, { tasks = [], entries = [], projects = [], machines = [], portfolio = [], me = '', today = ymd(new Date()) } = {}) {
  const topics = topicsOf(meeting, { tasks, entries, projects, machines, portfolio, me })
  const people = peopleOf(meeting, me)
  const openTasks = tasks.filter(t => t && !t.done)

  const waitingAll = openTasks.filter(t => t.waitingOn && people.some(p => samePerson(t.waitingOn, p)))
    .sort((a, b) => (a.waitingSince || a.updatedAt || '').localeCompare(b.waitingSince || b.updatedAt || ''))
  const waitingIds = new Set(waitingAll.map(t => t.id))
  const openAll = openTasks.filter(t => !waitingIds.has(t.id)).map(t => ({ t, reason: taskReasons(t, topics, people) })).filter(x => x.reason)
    .sort((a, b) => (LANE_RANK[a.t.lane] ?? 9) - (LANE_RANK[b.t.lane] ?? 9) || (day(a.t.dueDate) || '9999').localeCompare(day(b.t.dueDate) || '9999') || (b.t.updatedAt || '').localeCompare(a.t.updatedAt || ''))
  const taskOut = (t, reason) => ({ id: t.id, title: t.title, lane: t.lane, dueDate: day(t.dueDate), project: t.project || null, late: Boolean(day(t.dueDate) && day(t.dueDate) < today), reason })

  const owedAll = []
  for (const e of entries) {
    const onTopic = entryTopic(e, topics)
    for (const a of e.actions || []) {
      if (a.done || !a.text) continue
      const owner = a.owner && people.find(p => samePerson(a.owner, p))
      const own = topics.find(tp => (tp.kind === 'code' && mentions(a.text, tp.key)) || (tp.kind !== 'code' && tp.kind !== 'person' && hasPhrase(a.text, tp.label)))
      const reason = onTopic || own?.label || (owner ? `${firstName(a.owner)} owns it` : null)
      if (reason) owedAll.push({ id: a.id, text: a.text, owner: a.owner || null, mine: Boolean(me && a.owner && samePerson(a.owner, me)), due: a.due || null, late: Boolean(a.due && a.due < today), entryId: e.id, entryTitle: e.title, entryDate: e.date || null, reason })
    }
  }
  owedAll.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.entryDate || '').localeCompare(a.entryDate || ''))

  // the last time: this meeting's own series first, then an entry on a topic, then one with an attendee in it
  const logged = loggedOf(meeting, entries, today)
  const before = entries.filter(e => e.id !== logged?.id && (e.date || '') <= today).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
  const lastHit = before.map(e => ({ e, reason: sameTitle(e.title, meeting?.subject) ? 'same meeting' : entryTopic(e, topics) })).find(x => x.reason)
    || before.map(e => ({ e, who: (e.attendees || []).find(a => people.some(p => samePerson(a, p))) })).filter(x => x.who).map(x => ({ e: x.e, reason: `with ${firstName(x.who)}` }))[0]
  const last = lastHit ? { id: lastHit.e.id, title: lastHit.e.title, date: lastHit.e.date || null, project: lastHit.e.project || null, decisions: (lastHit.e.decisions || []).slice(0, 8), reason: lastHit.reason } : null

  const open = openAll.slice(0, LIMIT).map(x => taskOut(x.t, x.reason))
  const owed = owedAll.slice(0, LIMIT)
  const waiting = waitingAll.slice(0, LIMIT).map(t => ({ ...taskOut(t, `waiting on ${firstName(t.waitingOn)}`), waitingOn: t.waitingOn, since: day(t.waitingSince) }))
  const publicTopics = topics.map(({ kind, label, key, name }) => ({ kind, label, key, ...(name ? { name } : {}) }))
  const empty = !topics.length && !open.length && !owed.length && !waiting.length && !last

  return {
    topics: publicTopics, people, open, openCount: openAll.length, owed, owedCount: owedAll.length, waiting, waitingCount: waitingAll.length,
    last, logged: logged ? logged.id : null, empty,
    draft: draftOf(meeting, { topics, people, open, owed, waiting, today })
  }
}

/**
 * The Logbook entry "Log this meeting" starts: the title, the day, the project (the first code, plan or
 * machine), the attendees, the other topics as tags, and what was open going in as a reference list in the
 * notes. The actions themselves stay in their own entries, so ticking one there is the only tick.
 */
export function draftOf(meeting, { topics = [], people = [], open = [], owed = [], waiting = [], today } = {}) {
  const lead = topics.find(t => t.kind === 'code') || topics.find(t => t.kind === 'project') || topics.find(t => t.kind === 'machine')
  const project = !lead ? null : lead.kind === 'project' ? (lead.code || lead.machine || lead.label) : lead.label
  const tags = topics.filter(t => t.kind !== 'person' && t !== lead).map(t => t.label).filter(l => l !== project).slice(0, 6)
  const head = [meeting?.start && meeting?.end ? `${meeting.start} to ${meeting.end}` : null, meeting?.location ? `At ${meeting.location}` : null, meeting?.organizer ? `Organised by ${meeting.organizer}` : null].filter(Boolean).join('. ')
  // the entry's project need not be repeated on every line; what else ties a task in ("with Jacob") stays
  const why = t => [...String(t.reason || '').split(', ').filter(x => x && x !== lead?.label), t.dueDate ? `due ${fmtDay(t.dueDate)}` : null].filter(Boolean).join(', ')
  const lines = [
    ...open.map(t => `- ${t.title}${why(t) ? ` (${why(t)})` : ''}`),
    ...owed.map(a => `- ${a.owner ? `${a.owner}: ` : ''}${a.text}${a.due ? `, due ${fmtDay(a.due)}` : ''} (from ${a.entryTitle}${a.entryDate ? `, ${fmtDay(a.entryDate)}` : ''})`),
    ...waiting.map(t => `- Waiting on ${t.waitingOn}: ${t.title}`)
  ]
  const notes = [head ? head + '.' : null, lines.length ? `Open going in:\n${lines.join('\n')}` : null].filter(Boolean).join('\n\n')
  return { title: String(meeting?.subject || 'Meeting').trim() || 'Meeting', date: today, project, attendees: people, tags, notes: notes ? notes + '\n\n' : '' }
}

/**
 * The meeting the Home card speaks of: one starting within 30 minutes with something to bring, else one
 * running now with something to bring, else the last one that ended today with other people or something
 * to bring and no Logbook entry yet.
 * `prepOf(m)` gives the prep, `loggedOf(m)` whether today's entry exists.
 */
export function pickNext(meetings = [], now = new Date(), prepOf = () => ({ empty: true }), isLogged = () => false) {
  const timed = meetings.filter(m => m && m.id && phaseOf(m, now))
  const by = ph => timed.filter(m => phaseOf(m, now) === ph)
  const soon = by('soon').sort((a, b) => minOf(a.start) - minOf(b.start))
  for (const m of soon) { const prep = prepOf(m); if (!prep.empty) return { meeting: m, phase: 'soon', prep } }
  for (const m of by('now')) { const prep = prepOf(m); if (!prep.empty) return { meeting: m, phase: 'now', prep } }
  const ended = by('ended').sort((a, b) => (minOf(b.end) ?? 0) - (minOf(a.end) ?? 0))
  // a block in the calendar with nobody else in it and nothing to bring (lunch, focus time) is not asked about
  for (const m of ended) { if (isLogged(m)) continue; const prep = prepOf(m); if (!prep.empty || prep.people?.length) return { meeting: m, phase: 'ended', prep } }
  return null
}
