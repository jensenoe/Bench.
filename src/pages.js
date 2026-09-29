/**
 * Every page in one place (roadmap 130): what the nav shows on top, what the More menu holds and in
 * which group, the number key, and the one line that says what a page is for. The nav, the key map,
 * the key sheet and the search read from here, so a page added once shows up everywhere.
 *
 * On top: the three pages of a working day. The wordmark is Home. Everything else sits in More,
 * grouped, with its line; the TomFit tools open outside Bench.
 */
export const PAGES = [
  { id: '', title: 'Home', key: '1', line: 'The day at a glance' },
  { id: 'board', title: 'Board', key: '2', primary: true, line: 'Five lanes, a cap of five on Today' },
  { id: 'logbook', title: 'Logbook', key: '3', primary: true, line: 'Meetings, decisions, actions' },
  { id: 'projects', title: 'Projects', key: '4', primary: true, line: 'Innovation projects and their plans' },
  { id: 'procurement', title: 'Procurement', key: '5', group: 'Parts and machines', line: 'Order dates, suppliers, lead times' },
  { id: 'machines', title: 'Machines', key: '6', group: 'Parts and machines', line: 'Everything that hangs on one machine' },
  { id: 'playbooks', title: 'Playbooks', group: 'Parts and machines', line: 'The standard task set for a machine' },
  { id: 'hours', title: 'Hours', key: '7', group: 'Time', line: 'The month as the time sheet sees it' },
  { id: 'review', title: 'Review', key: '8', group: 'Time', line: 'The week in short sentences' },
  { id: 'napkin', title: 'Napkin', key: '9', group: 'Notes and connections', line: 'Mind maps, one branch at a time' },
  { id: 'tools', title: 'Tools', group: 'Notes and connections', line: 'What Bench. reads from the TomFit tools' },
  // hidden: no key, not on top, not in More; reached from Home and the meeting reminder (roadmap 163)
  { id: 'meeting', title: 'Meeting', hidden: true, line: 'What a meeting is about and what to bring' }
]
export const PRIMARY = PAGES.filter(p => p.primary)
export const MORE = PAGES.filter(p => p.group)
/** Pages with a route but no link of their own, opened from somewhere else. */
export const HIDDEN = PAGES.filter(p => p.hidden)
export const GROUPS = [...new Set(MORE.map(p => p.group))].map(g => ({ title: g, pages: MORE.filter(p => p.group === g) }))
/** key -> route, for the 1 to 9 shortcut */
export const PAGE_KEYS = Object.fromEntries(PAGES.filter(p => p.key).map(p => [p.key, p.id]))
/** "Home, Board, Logbook, ..." in key order, for the key sheet */
export const KEY_ORDER = PAGES.filter(p => p.key).sort((a, b) => a.key.localeCompare(b.key)).map(p => p.title).join(', ')
export const titleOf = id => PAGES.find(p => p.id === id)?.title || null

/** The TomFit tools themselves, opened outside Bench. */
export const TOMFIT = [
  { label: 'Cockpit', url: 'https://cockpit.tom.fit/dashboard' },
  { label: 'Issue tickets', url: 'https://issues.tom.fit/' },
  { label: 'QMS', url: 'https://tf-hw-qms.vercel.app/' },
  { label: 'Structured BOM', url: 'https://oetwil-structured-bom.vercel.app/' },
  { label: 'Innovation dashboard', url: 'https://innovation.tom.fit/dashboard.html' }
]
