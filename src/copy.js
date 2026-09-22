import pack from './copy-pack.json'
import { isDark } from './scenes.js'

/**
 * Every word on the surface, one voice. No em-dashes anywhere (they read as
 * generated). Headlines end in a period. Say the thing, then stop.
 * The variable lines live in copy-pack.json and rotate by day, so the board does
 * not say the same thing every morning.
 */
export const LANES = {
  today:      { label: 'Today', cap: 5,
    blurb: 'Five slots. When they are full, something leaves before anything arrives.' },
  innovation: { label: 'Innovation', cap: null,
    blurb: 'The work that makes next year easier. It is the first thing to stall when a machine breaks, so it sits where you can see it not moving.' },
  waiting:    { label: 'Waiting on', cap: null,
    blurb: 'Handed off and out of your hands. Each line shows how long they have had it.' },
  active:     { label: 'Active', cap: null,
    blurb: 'Started, not finished, not today. Today pulls from here.' },
  parked:     { label: 'Parked', cap: null,
    blurb: 'Shelved on purpose. Kept visible so shelving stays a decision.' }
}

const dayOfYear = (d = new Date()) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
const pick = (arr, salt = 0) => arr[(dayOfYear() + salt) % arr.length]

const SHEET_META = [
  { id: 'board', title: 'Board', image: '/terrain/ridge.jpg', fallback: '/terrain/day.jpg' },
  { id: 'procurement', title: 'Procurement', image: '/terrain/dusk.jpg', fallback: '/terrain/dusk.jpg' },
  { id: 'tools', title: 'Tools', image: '/terrain/night.jpg', fallback: '/terrain/night.jpg' },
  { id: 'logbook', title: 'Logbook', image: '/terrain/dusk.jpg', fallback: '/terrain/dusk.jpg' },
  { id: 'napkin', title: 'Napkin', image: '/terrain/day.jpg', fallback: '/terrain/day.jpg' },
  { id: 'cockpit', title: 'Cockpit', image: '/terrain/cockpit-1.jpg', fallback: '/terrain/night.jpg', external: 'https://cockpit.tom.fit/dashboard' }
]
/** Sheets with today's line and body. */
export const SHEETS = SHEET_META.map((s, i) => ({ ...s, line: pick(pack.sheets[s.id].lines, i), body: pick(pack.sheets[s.id].bodies, i + 2) }))

export const ABOUT = pack.about
export const FIRST_RUN = pack.firstRun

let lastLead = -1
export function greeting({ open, today, waiting, pressing, innovationCold }, scene, name = '', { random = false, late = false, hoursIn = 0 } = {}) {
  // inside "day", mornings do not get afternoon lines and afternoons do not get morning ones
  const nowD = new Date(), hourNow = nowD.getHours()
  const dark = isDark(nowD)
  // "early" is before seven and before the sun, not just before seven
  const early = hourNow >= 4 && hourNow < 7 && dark
  const all = early ? pack.greetings.early : (pack.greetings[scene.key] || pack.greetings.day)
  const filtered = all
    .filter(([a]) => hourNow < 12 ? !/afternoon|noon|lunch/i.test(a) : !/morning/i.test(a))
    // "late morning" is not nine o'clock, "halfway" is not eight, "back at it" waits for after lunch
    .filter(([a]) => !/late morning/i.test(a) || (hourNow >= 10 && hourNow < 12))
    .filter(([a]) => !/halfway/i.test(a) || (hourNow >= 12 && hourNow < 15))
    .filter(([a]) => !/back at it/i.test(a) || hourNow >= 13)
    // lines about darkness only when it is actually dark out
    .filter(([a]) => dark || !/dark|before the sun|before the birds|not started yet/i.test(a))
  const leads = filtered.length ? filtered : (all.length ? all : [['Here is the bench,', '{name}.']])
  const first = (name || '').split(/\s+/)[0] || 'there'
  const fill = s => s.replace('{name}', first)

  const news = []
  // still clocked in past the useful hours: this comes before anything about the board
  if (late) news.push(fill(pick(pack.lateStates, hourNow)))
  else if (early && hoursIn < 1) news.push(pick(pack.earlyStates))
  if (pressing > 0) news.push(`${pressing} order ${pressing > 1 ? 'dates' : 'date'} will slip a build unless you act this week.`)
  if (today > 5) news.push(`Today has ${today} on it. ${today - 5} of those belong to tomorrow.`)
  if (today === 0 && open > 0) news.push('Today is empty. Pull from Active before the day pulls from you.')
  if (waiting >= 3) news.push(`${waiting} items are with other people. Worth a nudge.`)
  if (innovationCold >= 21) news.push(`Innovation last moved ${innovationCold} days ago.`)
  if (open === 0) news.push(pick(pack.quietStates))

  // the hour nudges the greeting too, so morning and afternoon differ inside "day"
  let lead
  if (random) {
    let i; do { i = Math.floor(Math.random() * leads.length) } while (i === lastLead && leads.length > 1)
    lastLead = i; lead = leads[i].map(fill)
  } else {
    lead = pick(leads, Math.floor(new Date().getHours() / 4)).map(fill)
  }
  return { lead, state: news[0] || `${open} open, ${today} on today.` }
}

/** For the completion toast: a line of encouragement and, optionally, a water or coffee nudge. */
let lastQuote = -1, lastNudge = -1
export function cheer({ withNudge = true } = {}) {
  const q = pack.encouragements, n = pack.nudges
  let qi; do { qi = Math.floor(Math.random() * q.length) } while (qi === lastQuote && q.length > 1)
  lastQuote = qi
  let nudge = null
  if (withNudge) {
    let ni; do { ni = Math.floor(Math.random() * n.length) } while (ni === lastNudge && n.length > 1)
    lastNudge = ni; nudge = n[ni]
  }
  const m = /^(.*\.)\s+([A-Z][^.]*)$/.exec(q[qi])   // "Text. Author" -> attributed quote
  return { text: m ? m[1] : q[qi], by: m ? m[2] : null, nudge }
}
