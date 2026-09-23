import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// day.js keeps its file in BENCH_USER_DIR and reads tasks and notes from BENCH_DATA_DIR; both go to scratch.
// No token means the calendar answers ok:false and nothing touches Graph.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-day-'))
process.env.BENCH_USER_DIR = dir
process.env.BENCH_DATA_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null }))

let day, store, notes
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0, 0)
const NOW = local(2026, 9, 23, 8, 30)   // Wednesday

beforeAll(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  day = await import('../server/day.js')
  store = await import('../server/store.js')
  notes = await import('../server/notes.js')
})
afterAll(() => vi.useRealTimers())

const task = (over = {}) => ({ id: over.id || Math.random().toString(36).slice(2), title: 'Task', lane: 'active', done: false, source: 'local', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), effortHours: null, ...over })

describe('pickLeftovers', () => {
  const midnight = local(2026, 9, 23, 0, 0)
  it('takes Today tasks untouched since before midnight on the first brief', () => {
    const old = task({ id: 'a', lane: 'today', updatedAt: local(2026, 9, 22, 16).toISOString() })
    const fresh = task({ id: 'b', lane: 'today', updatedAt: local(2026, 9, 23, 7).toISOString() })
    const elsewhere = task({ id: 'c', lane: 'active', updatedAt: local(2026, 9, 20).toISOString() })
    const done = task({ id: 'd', lane: 'today', done: true, updatedAt: local(2026, 9, 20).toISOString() })
    expect(day.pickLeftovers([old, fresh, elsewhere, done], { midnight }).map(t => t.id)).toEqual(['a'])
  })
  it('also takes what the last brief recorded on Today, even when touched this morning', () => {
    const touched = task({ id: 'b', lane: 'today', updatedAt: local(2026, 9, 23, 7).toISOString() })
    const moved = task({ id: 'x', lane: 'active', updatedAt: local(2026, 9, 23, 7).toISOString() })
    expect(day.pickLeftovers([touched, moved], { previousTodayIds: ['b', 'x'], midnight }).map(t => t.id)).toEqual(['b'])
  })
})

describe('pickArrived, pickDue, pickOrders', () => {
  it('arrived means a tool created it after the last brief', () => {
    const since = local(2026, 9, 22, 8).toISOString()
    const fromTool = task({ id: 'i', source: 'issues', createdAt: local(2026, 9, 22, 18).toISOString() })
    const older = task({ id: 'o', source: 'issues', createdAt: local(2026, 9, 21).toISOString() })
    const typed = task({ id: 't', source: 'local', createdAt: local(2026, 9, 22, 18).toISOString() })
    const closed = task({ id: 'c', source: 'qms', done: true, createdAt: local(2026, 9, 22, 18).toISOString() })
    expect(day.pickArrived([fromTool, older, typed, closed], since).map(t => t.id)).toEqual(['i'])
  })
  it('due is today or earlier, orders are inside three days and not yet ordered', () => {
    const tasks = [
      task({ id: 'd1', dueDate: '2026-09-23' }), task({ id: 'd2', dueDate: '2026-09-20' }), task({ id: 'd3', dueDate: '2026-09-24' }),
      task({ id: 'o1', orderBy: '2026-09-25' }), task({ id: 'o2', orderBy: '2026-09-27' }), task({ id: 'o3', orderBy: '2026-09-21' }), task({ id: 'o4', orderBy: '2026-09-24', orderedOn: '2026-09-22' })
    ]
    expect(day.pickDue(tasks, '2026-09-23').map(t => t.id)).toEqual(['d1', 'd2'])
    expect(day.pickOrders(tasks, NOW).map(t => t.id)).toEqual(['o1', 'o3'])
  })
})

describe('capacity', () => {
  const meetings = [{ subject: 'Standup', allDay: false, start: '09:00', end: '09:30' }, { subject: 'Review', allDay: false, start: '14:00', end: '15:00' }, { subject: 'Offsite', allDay: true, start: '', end: '' }]
  it('takes meetings and clocked hours off the workday and sums the sized Today tasks', () => {
    const tasks = [task({ lane: 'today', effortHours: 2 }), task({ lane: 'today', effortHours: 1.5 }), task({ lane: 'today' }), task({ lane: 'active', effortHours: 8 }), task({ lane: 'today', done: true, effortHours: 4 })]
    const c = day.capacity({ workdayHours: 8.4, meetings, clockedMs: 2 * 3600000, tasks })
    expect(c.meetingHours).toBe(1.5)
    expect(c.clockedHours).toBe(2)
    expect(c.freeHours).toBe(4.9)
    expect(c.todayHours).toBe(3.5)
    expect(c.unsized).toBe(1)
    expect(c.over).toBe(false)
  })
  it('never goes below zero and flags an overfull Today', () => {
    const c = day.capacity({ workdayHours: 8, meetings, clockedMs: 9 * 3600000, tasks: [task({ lane: 'today', effortHours: 1 })] })
    expect(c.freeHours).toBe(0)
    expect(c.over).toBe(true)
  })
  it('is quiet with no calendar and no clock', () => {
    const c = day.capacity({ workdayHours: 8.4, meetings: [], clockedMs: 0, tasks: [] })
    expect(c).toEqual({ workdayHours: 8.4, meetingHours: 0, clockedHours: 0, freeHours: 8.4, todayHours: 0, unsized: 0, over: false })
  })
})

describe('endedRecently', () => {
  const events = [
    { id: 'a', subject: 'Standup', allDay: false, start: '09:00', end: '09:30' },
    { id: 'b', subject: 'Review', allDay: false, start: '10:00', end: '11:00' },
    { id: 'c', subject: 'Offsite', allDay: true, start: '', end: '' }
  ]
  it('finds the meeting that ended inside the window and nothing else', () => {
    expect(day.endedRecently(events, local(2026, 9, 23, 9, 31)).map(m => m.id)).toEqual(['a'])
    expect(day.endedRecently(events, local(2026, 9, 23, 9, 34)).map(m => m.id)).toEqual([])
    expect(day.endedRecently(events, local(2026, 9, 23, 9, 29)).map(m => m.id)).toEqual([])
    expect(day.endedRecently(events, local(2026, 9, 23, 11, 0)).map(m => m.id)).toEqual(['b'])
  })
})

describe('dayNoteText', () => {
  it('says hours, ticked, meetings and what rolls over in short lines', () => {
    const text = day.dayNoteText({ workedMs: (7 * 60 + 45) * 60000, ticked: [{ title: 'Belts' }, { title: 'Spindle' }], meetings: [{ subject: 'Standup', allDay: false, start: '09:00' }], keep: [{ title: 'Drawing' }] })
    expect(text.split('\n')).toEqual(['7:45 on the clock.', 'Ticked 2 tasks: Belts, Spindle.', 'Meetings: Standup at 09:00.', 'Rolls to tomorrow: Drawing.'])
  })
  it('has a line for every empty part', () => {
    expect(day.dayNoteText({})).toBe('Nothing on the clock.\nNothing ticked.\nNothing rolls to tomorrow.')
  })
})

describe('weekOf and isoWeek', () => {
  it('finds Monday to Sunday around any day, today by default', () => {
    expect(day.weekOf('2026-09-23')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(day.weekOf('2026-09-27')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(day.weekOf('2026-09-21')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(day.weekOf('')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(day.weekOf('nonsense')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })
  it('numbers the week the ISO way', () => {
    expect(day.isoWeek('2026-09-21')).toBe(39)
    expect(day.isoWeek('2026-01-01')).toBe(1)
    expect(day.isoWeek('2027-01-01')).toBe(53)
  })
})

describe('buildReview and reviewText', () => {
  const start = '2026-09-21', end = '2026-09-27'
  const tasks = [
    task({ id: 'd1', title: 'Belts', project: 'M3', done: true, completedBy: 'local', completedAt: local(2026, 9, 22, 15).toISOString(), effortHours: 2 }),
    task({ id: 'd2', title: 'Spindle', project: null, done: true, completedBy: 'local', completedAt: local(2026, 9, 23, 8).toISOString(), effortHours: 1.5 }),
    task({ id: 'd3', title: 'Upstream', done: true, completedAt: local(2026, 9, 22).toISOString() }),                       // closed by a sync, not by hand
    task({ id: 'd4', title: 'Last week', done: true, completedBy: 'local', completedAt: local(2026, 9, 18).toISOString(), effortHours: 5 }),
    task({ id: 's1', title: 'Drawing', dueDate: '2026-09-22' }),
    task({ id: 's2', title: 'Later', dueDate: '2026-10-02' }),
    task({ id: 'i1', title: 'Idea', lane: 'innovation', lastTouched: local(2026, 9, 21).toISOString() }),
    task({ id: 'i2', title: 'Old idea', lane: 'innovation', lastTouched: local(2026, 8, 1).toISOString() }),
    task({ id: 'o1', title: 'Bearing', orderedOn: '2026-09-24', supplier: 'SKF' }),
    task({ id: 'o2', title: 'Motor', orderedOn: '2026-09-10' })
  ]
  const entries = [{ id: 'e1', title: 'Standup', date: '2026-09-22' }, { id: 'e2', title: 'Old', date: '2026-09-12' }]
  const clocked = [{ date: '2026-09-21', worked: 8 * 3600000 }, { date: '2026-09-22', worked: (7 * 60 + 30) * 60000 }, { date: '2026-09-23', worked: 0 }]

  it('sorts the week into its sections', () => {
    const r = day.buildReview({ start, end, tasks, entries, clocked, firstName: 'Noël' })
    expect(r.week).toBe(39)
    expect(r.done.map(t => t.id)).toEqual(['d1', 'd2'])
    expect(r.slipped.map(t => t.id)).toEqual(['s1'])
    expect(r.hoursByProject).toEqual([{ project: 'M3', hours: 2 }, { project: 'Unassigned', hours: 1.5 }])
    expect(r.innovation.map(t => t.id)).toEqual(['i1'])
    expect(r.orders.map(t => t.id)).toEqual(['o1'])
    expect(r.logbook.map(e => e.id)).toEqual(['e1'])
    expect(r.clocked).toEqual(clocked)
  })
  it('writes the text as short sentences, one per section', () => {
    const r = day.buildReview({ start, end, tasks, entries, clocked, firstName: 'Noël' })
    expect(r.text.startsWith('Week 39, 21 Sep to 27 Sep.\n')).toBe(true)
    expect(r.text).toContain('Done, 2 tasks:\n  Belts (M3)\n  Spindle')
    expect(r.text).toContain('Slipped, 1:\n  Drawing, due Tue 22 Sep')
    expect(r.text).toContain('15:30 on the clock over 2 days: Mon 8:00, Tue 7:30.')
    expect(r.text).toContain('Hours by project: M3 2, Unassigned 1.5.')
    expect(r.text).toContain('Innovation, 1 item touched: Idea.')
    expect(r.text).toContain('Ordered, 1: Bearing from SKF.')
    expect(r.text).toContain('Logbook, 1 entry: Standup (Tue 22 Sep).')
    expect(r.text).not.toMatch(/—/)
  })
  it('says so when a week is empty', () => {
    const r = day.buildReview({ start, end, tasks: [], entries: [], clocked: [] })
    expect(r.text.split('\n').filter(Boolean)).toEqual([
      'Week 39, 21 Sep to 27 Sep.', 'Nothing ticked this week.', 'Nothing slipped.', 'Nothing on the clock.', 'No sized tasks were ticked.',
      'Innovation did not move.', 'Nothing ordered.', 'Nothing in the logbook.'
    ])
  })
})

describe('the brief and the close against the store', () => {
  it('freezes leftovers on the first look, applies choices, and records Today for tomorrow', async () => {
    day._reset()
    const a = store.createTask({ title: 'Old on Today', lane: 'today' })
    const b = store.createTask({ title: 'Also old', lane: 'today' })
    // both were put on Today "yesterday": push their timestamps back
    for (const t of store.allTasks()) if ([a.id, b.id].includes(t.id)) { t.updatedAt = local(2026, 9, 22, 16).toISOString(); t.createdAt = t.updatedAt }
    const fresh = store.createTask({ title: 'This morning', lane: 'today' })
    const first = await day.brief()
    expect(first.seen).toBe(false)
    expect(first.date).toBe('2026-09-23')
    expect(first.leftovers.map(t => t.id).sort()).toEqual([a.id, b.id].sort())
    expect(first.meetings).toEqual([])
    expect(first.sheet).toEqual({ pending: 0, unclosed: null })

    const r = day.applyBrief({ toActive: [b.id, fresh.id] })
    expect(r.moved).toBe(1)   // fresh was not a leftover, so it stays where it is
    expect(store.allTasks().find(t => t.id === b.id).lane).toBe('active')
    const second = await day.brief()
    expect(second.seen).toBe(true)
    expect(second.leftovers.map(t => t.id)).toEqual([a.id])   // the one that stayed
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'day.json'), 'utf8')).todayIds.sort()).toEqual([a.id, fresh.id].sort())
  })

  it('closes the day: moves, writes one day note, updates it on a second close', async () => {
    const open = store.allTasks().filter(t => t.lane === 'today' && !t.done)
    const [keep, ...rest] = open
    const ticked = store.createTask({ title: 'Ticked today', lane: 'active' })
    store.updateTask(ticked.id, { done: true })
    const r1 = await day.closeDay({ toActive: rest.map(t => t.id), keep: [keep.id], note: true })
    expect(r1.moved).toBe(rest.length)
    expect(r1.entry.title).toBe('Day note.')
    expect(r1.entry.tags).toEqual(['day'])
    expect(r1.entry.date).toBe('2026-09-23')
    expect(r1.entry.notes).toContain('Ticked 1 task: Ticked today.')
    expect(r1.entry.notes).toContain(`Rolls to tomorrow: ${keep.title}.`)
    const r2 = await day.closeDay({ toActive: [], keep: [], note: true })
    expect(r2.entry.id).toBe(r1.entry.id)
    expect(r2.entry.notes).toContain('Nothing rolls to tomorrow.')
    expect(notes.listEntries().filter(e => e.date === '2026-09-23' && e.tags.includes('day'))).toHaveLength(1)
    const r3 = await day.closeDay({ note: false })
    expect(r3).toEqual({ moved: 0, entry: null })
  })

  it('reviews the current week from the store', () => {
    const r = day.review('')
    expect(r.start).toBe('2026-09-21')
    expect(r.end).toBe('2026-09-27')
    expect(r.done.some(t => t.title === 'Ticked today')).toBe(true)
    expect(r.logbook.some(e => e.title === 'Day note.')).toBe(true)
    expect(r.clocked.map(d => d.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23'])
    expect(typeof r.text).toBe('string')
  })
})
