/**
 * Every page in one place (roadmap 130): what the nav shows on top, what the More menu holds and in
 * which group, the number key, and the one line that says what a page is for. The nav, the key map,
 * the key sheet and the search read from here, so a page added once shows up everywhere.
 *
 * On top: the three pages of a working day. The wordmark is Home. Everything else sits in More,
 * grouped, with its line; the TomFit tools open outside Bench and sit in More under the Tools page.
 *
 * Roadmap 173 cut Procurement, Napkin, Wall mode, the Lunch screen and the Cockpit door. Their old
 * links land through GONE: a page that still answers takes the visitor there, the rest go to the
 * Board with one plain sentence; the Lunch screen goes Home. Keys run 1 to 9 without a gap.
 */
export const PAGES = [
  { id: '', title: 'Home', key: '1', line: 'The day at a glance' },
  { id: 'board', title: 'Board', key: '2', primary: true, line: 'Five lanes, a cap of five on Today' },
  { id: 'logbook', title: 'Logbook', key: '3', primary: true, line: 'Meetings, decisions, actions' },
  { id: 'projects', title: 'Projects', key: '4', primary: true, line: 'Innovation projects and their plans' },
  { id: 'machines', title: 'Machines', key: '5', group: 'Machines and playbooks', line: 'Everything that hangs on one machine' },
  { id: 'playbooks', title: 'Playbooks', key: '6', group: 'Machines and playbooks', line: 'The standard task set for a machine' },
  { id: 'hours', title: 'Hours', key: '7', group: 'Time', line: 'The month as the time sheet sees it' },
  { id: 'review', title: 'Review', key: '8', group: 'Time', line: 'The week in short sentences' },
  { id: 'tools', title: 'Tools', key: '9', group: 'TomFit tools', line: 'What Bench. reads from the TomFit tools' },
  // hidden: no key, not on top, not in More; reached from Home and the meeting reminder (roadmap 163)
  { id: 'meeting', title: 'Meeting', hidden: true, line: 'What a meeting is about and what to bring' }
]
export const PRIMARY = PAGES.filter(p => p.primary)
export const MORE = PAGES.filter(p => p.group)
/** Pages with a route but no link of their own, opened from somewhere else. */
export const HIDDEN = PAGES.filter(p => p.hidden)
export const GROUPS = [...new Set(MORE.map(p => p.group))].map(g => ({ title: g, pages: MORE.filter(p => p.group === g) }))
/** key -> route, for the 1 to 9 shortcut. Keys run without a gap (roadmap 173). */
export const PAGE_KEYS = Object.fromEntries(PAGES.filter(p => p.key).map(p => [p.key, p.id]))
/** "Home, Board, Logbook, ..." in key order, for the key sheet */
export const KEY_ORDER = PAGES.filter(p => p.key).sort((a, b) => a.key.localeCompare(b.key)).map(p => p.title).join(', ')
export const titleOf = id => PAGES.find(p => p.id === id)?.title || null
/** Every route a page answers on, the hidden ones included. */
export const ROUTES = new Set(PAGES.map(p => p.id))

/**
 * Pages that were cut (roadmap 173), so an old link, a bookmark or a notification in the Bell lands somewhere
 * sensible: `to` is where it goes, `note` the one sentence a toast says on arrival. The data behind them stays
 * on disk untouched (napkin.json, the order dates on the tasks, the time clock).
 */
export const GONE = {
  procurement: { to: 'board', note: 'Procurement is gone. Order-by dates live on the task cards and in the morning brief.' },
  napkin: { to: 'board', note: 'The Napkin is gone. Your maps are still in napkin.json in the data folder.' },
  wall: { to: 'board', note: 'Wall mode is gone. The board is here.' },
  lunch: { to: '', note: null }   // the 12:00 notification (server/timeclock.js) still names #/lunch: Home, where the hero says it is lunch
}

/** The TomFit tools themselves, opened outside Bench. */
export const TOMFIT = [
  { label: 'Cockpit', url: 'https://cockpit.tom.fit/dashboard' },
  { label: 'Issue tickets', url: 'https://issues.tom.fit/' },
  { label: 'QMS', url: 'https://tf-hw-qms.vercel.app/' },
  { label: 'Structured BOM', url: 'https://oetwil-structured-bom.vercel.app/' },
  { label: 'Innovation dashboard', url: 'https://innovation.tom.fit/dashboard.html' }
]
