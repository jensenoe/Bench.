import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-alerts-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => false }))

let alerts, store, notify, bridge, settings
beforeAll(async () => {
  settings = await import('../server/settings.js')
  settings.update({ quietFrom: '19:00', quietTo: '07:00', quietWeekends: true })
  alerts = await import('../server/alerts.js')
  store = await import('../server/store.js')
  notify = await import('../server/notify.js')
  ;({ bridge } = await import('../server/bridge.js'))
})

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m)   // September 2026; the 30th is a Wednesday
const WED = 30

describe('meeting in five minutes', () => {
  const meetings = [
    { id: 'a', subject: 'Design review', start: '10:05', end: '10:30', location: 'Rigi', online: true, joinUrl: 'https://teams.microsoft.com/l/meetup-join/a', allDay: false },
    { id: 'b', subject: 'Supplier call', start: '10:03', end: '10:30', location: null, online: true, link: 'https://outlook.office.com/b', allDay: false },
    { id: 'c', subject: 'Bench walk', start: '10:04', end: '10:20', location: 'Workshop', allDay: false },
    { id: 'd', subject: 'Later', start: '10:30', end: '11:00', allDay: false },
    { id: 'e', subject: 'Holiday', start: '00:00', end: '00:00', allDay: true },
    { id: 'f', subject: 'Started', start: '10:00', end: '10:30', allDay: false }
  ]
  it('picks timed meetings that start within five minutes', () => {
    expect(alerts.meetingsSoon(meetings, at(WED, 10, 0)).map(m => [m.id, m.minutes])).toEqual([['a', 5], ['b', 3], ['c', 4]])
  })
  it('says subject, time and place, and joins on Teams when it can; a room goes to the Logbook', () => {
    const [a, b, c] = alerts.meetingsSoon(meetings, at(WED, 10, 0))
    expect(alerts.meetingMessage(a)).toEqual({ title: 'Meeting in 5 minutes.', body: 'Design review, 10:05 to 10:30, Rigi.', route: '#/logbook', url: 'https://teams.microsoft.com/l/meetup-join/a', category: 'meeting', key: 'a@10:05' })
    expect(alerts.meetingMessage(b)).toMatchObject({ body: 'Supplier call, 10:03 to 10:30, Teams.', url: 'https://outlook.office.com/b' })
    const room = alerts.meetingMessage(c)
    expect(room.url).toBeUndefined()
    expect(room.route).toBe('#/logbook')
    expect(alerts.meetingMessage({ ...c, minutes: 1 }).title).toBe('Meeting in 1 minute.')
  })
})

describe('due and overdue', () => {
  const tasks = [
    { id: '1', title: 'Wire the panel', dueDate: '2026-09-30' },
    { id: '2', title: 'Order the rail', dueDate: '2026-09-28' },
    { id: '3', title: 'Done already', dueDate: '2026-09-30', done: true },
    { id: '4', title: 'Tomorrow', dueDate: '2026-10-01' },
    { id: '5', title: 'I-1050 Handgrip strength', source: 'planner', dueDate: '2026-09-29' },
    { id: '6', title: 'No date' }
  ]
  it('due today from 15:00 to 19:00 on a working day', () => {
    expect(alerts.dueToday(tasks, at(WED, 14, 59))).toEqual([])
    expect(alerts.dueToday(tasks, at(WED, 15, 0)).map(t => t.id)).toEqual(['1'])
    expect(alerts.dueToday(tasks, at(WED, 19, 0))).toEqual([])
    expect(alerts.dueToday(tasks, at(WED, 16, 0), false)).toEqual([])
  })
  it('overdue from 07:00 to 12:00, the project cards left to the project rule', () => {
    expect(alerts.overdue(tasks, at(WED, 6, 59))).toEqual([])
    expect(alerts.overdue(tasks, at(WED, 8, 0)).map(t => t.id)).toEqual(['2'])
    expect(alerts.overdue(tasks, at(WED, 12, 0))).toEqual([])
  })
  it('summarises in one line', () => {
    expect(alerts.overdueMessage([{ title: 'A' }, { title: 'B' }])).toEqual({ title: 'Overdue.', body: '2 tasks past the date: A and B.', route: '#/board', category: 'due', key: 'overdue' })
    expect(alerts.dueTodayMessage([{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, { title: 'E' }]).body).toBe('5 tasks still open: A, B, C and 2 more.')
    expect(alerts.dueTodayMessage([{ title: 'A' }]).body).toBe('1 task still open: A.')
  })
})

describe('Logbook actions', () => {
  const entries = [
    { id: 'e1', title: 'Weekly', actions: [
      { id: 'a1', text: 'Send drawing to Igus', due: '2026-09-30', done: false },
      { id: 'a2', text: 'Check torque', due: '2026-09-25', done: false },
      { id: 'a3', text: 'Next week', due: '2026-10-07', done: false },
      { id: 'a4', text: 'Done', due: '2026-09-29', done: true },
      { id: 'a5', text: 'On the board', due: '2026-09-29', done: false, taskId: 't9' },
      { id: 'a6', text: 'No date', done: false }
    ] }
  ]
  it('open actions due today or earlier, 09:00 to 17:00, oldest first; one already a task is left to the task', () => {
    expect(alerts.actionsDue(entries, [{ id: 't9' }], at(WED, 8, 59))).toEqual([])
    expect(alerts.actionsDue(entries, [{ id: 't9' }], at(WED, 9, 0)).map(a => a.id)).toEqual(['a2', 'a1'])
    expect(alerts.actionsDue(entries, [], at(WED, 9, 0)).map(a => a.id)).toEqual(['a2', 'a5', 'a1'])   // the task is gone: the action counts again
    expect(alerts.actionsDue(entries, [], at(WED, 10, 0), false)).toEqual([])
    expect(alerts.actionsMessage([{ text: 'A' }, { text: 'B' }])).toMatchObject({ title: 'Logbook actions.', body: '2 actions due or overdue: A and B.', route: '#/logbook', category: 'logbook', key: 'actions' })
  })
})

describe('innovation projects', () => {
  const weekend = d => [0, 6].includes(new Date(d + 'T12:00:00').getDay())
  it('counts working days, skipping the weekend and days off', () => {
    expect(alerts.workingDaysUntil('2026-10-01', '2026-10-01', weekend)).toBe(0)
    expect(alerts.workingDaysUntil('2026-10-01', '2026-10-05', weekend)).toBe(2)   // Thu to Mon: Fri, Mon
    expect(alerts.workingDaysUntil('2026-10-01', '2026-09-28', weekend)).toBe(-3)
    expect(alerts.workingDaysUntil('2026-10-01', '2026-10-05', d => weekend(d) || d === '2026-10-02')).toBe(1)
  })
  it('due within three working days or overdue, open ones, in working hours', () => {
    const projects = [
      { code: 'I-1050', name: 'Handgrip strength', due: '2026-10-05', done: false },   // Wed to Mon: 3 working days
      { code: 'I-1051', name: 'Rower', due: '2026-10-06', done: false },               // 4
      { code: 'I-1052', name: 'Late', due: '2026-09-25', done: false },
      { code: 'I-1053', name: 'Done', due: '2026-09-25', done: true },
      { code: 'I-1054', name: 'No date', due: null, done: false }
    ]
    const now = at(WED, 9, 0)
    expect(alerts.projectsDue(projects, now, { isOff: weekend }).map(p => [p.code, p.left])).toEqual([['I-1050', 3], ['I-1052', -5]])
    expect(alerts.projectsDue(projects, at(WED, 7, 59), { isOff: weekend })).toEqual([])
    expect(alerts.projectsDue(projects, now, { isOff: weekend, workday: false })).toEqual([])
    const [soon, late] = alerts.projectsDue(projects, now, { isOff: weekend })
    expect(alerts.projectMessage(soon)).toEqual({ title: 'Project due soon.', body: 'I-1050 Handgrip strength: due Mon 5 Oct, in 3 working days.', route: '#/projects?i=I-1050', category: 'project', key: 'I-1050' })
    expect(alerts.projectMessage(late)).toMatchObject({ title: 'Project overdue.', body: 'I-1052 Late: 5 days overdue, due Fri 25 Sep.' })
    expect(alerts.projectMessage({ ...soon, left: 0 }).body).toBe('I-1050 Handgrip strength: due today.')
  })
})

describe('new work', () => {
  it('open tasks from Planner or Issues that came in after the last look', () => {
    const tasks = [
      { id: '1', title: 'New card', source: 'planner', createdAt: '2026-09-30T08:00:00Z' },
      { id: '2', title: 'New ticket', source: 'issues', createdAt: '2026-09-30T09:00:00Z' },
      { id: '3', title: 'Old', source: 'planner', createdAt: '2026-09-29T08:00:00Z' },
      { id: '4', title: 'QMS', source: 'qms', createdAt: '2026-09-30T08:00:00Z' },
      { id: '5', title: 'Mine', source: 'local', createdAt: '2026-09-30T08:00:00Z' },
      { id: '6', title: 'Closed', source: 'issues', createdAt: '2026-09-30T08:00:00Z', done: true }
    ]
    const list = alerts.arrivals(tasks, '2026-09-30T00:00:00Z')
    expect(list.map(t => t.id)).toEqual(['1', '2'])
    expect(alerts.arrivalsMessage(list)).toEqual({ title: 'New work.', body: '2 new from Planner and Issues: New card and New ticket.', route: '#/board', category: 'arrivals', key: '2026-09-30T09:00:00Z' })
  })
})

describe('the clock', () => {
  const off = { status: 'off', events: [] }
  const inn = { status: 'in', events: [{ kind: 'in', at: '2026-09-30T06:00:00Z' }] }
  it('not clocked in from 09:30 to 12:00 on a working day', () => {
    expect(alerts.clockCheck(off, at(WED, 9, 29))).toBeNull()
    expect(alerts.clockCheck(off, at(WED, 9, 30))).toBe('not-in')
    expect(alerts.clockCheck(off, at(WED, 12, 0))).toBeNull()                 // the time clock's lunch reminder speaks from here
    expect(alerts.clockCheck(off, at(WED, 10, 0), false)).toBeNull()
    expect(alerts.clockCheck({ status: 'out', events: [{ kind: 'in' }, { kind: 'out' }] }, at(WED, 10, 0))).toBeNull()
    expect(alerts.clockCheck(inn, at(WED, 10, 0))).toBeNull()
  })
  it('still clocked in from 18:30', () => {
    expect(alerts.clockCheck(inn, at(WED, 18, 29))).toBeNull()
    expect(alerts.clockCheck(inn, at(WED, 18, 30))).toBe('still-in')
    expect(alerts.clockCheck({ ...inn, status: 'lunch' }, at(WED, 19, 0))).toBe('still-in')
    expect(alerts.clockCheck({ ...inn, status: 'out' }, at(WED, 19, 0))).toBeNull()
    expect(alerts.clockMessage('not-in', at(WED, 9, 42))).toEqual({ title: 'Not clocked in.', body: 'It is 09:42 and the clock has not started today.', route: '#/', category: 'clock', key: 'not-in' })
    expect(alerts.clockMessage('still-in', at(WED, 18, 30))).toMatchObject({ title: 'Still clocked in.', key: 'still-in' })
  })
})

describe('your own reminders', () => {
  const sent = []
  beforeEach(() => { notify._reset(); sent.length = 0; bridge.notify = n => sent.push(n) })

  it('remindAt is an own field: set, cleaned, cleared, and kept out of the next repeat', () => {
    const t = store.createTask({ title: 'Call Igus', remindAt: '2026-09-30T14:00:00.000Z' })
    expect(t.remindAt).toBe('2026-09-30T14:00:00.000Z')
    expect(store.OWN_FIELDS).toContain('remindAt')
    expect(store.updateTask(t.id, { remindAt: '2026-10-01T06:30' }).remindAt).toBe(new Date('2026-10-01T06:30').toISOString())
    expect(store.updateTask(t.id, { remindAt: 'tomorrow' }).remindAt).toBeNull()
    expect(store.updateTask(t.id, { remindAt: '2026-10-01T06:30:00.000Z' }).remindAt).toBe('2026-10-01T06:30:00.000Z')
    expect(store.updateTask(t.id, { remindAt: null }).remindAt).toBeNull()
    expect(store.createTask({ title: 'Plain' }).remindAt).toBeNull()
    const r = store.createTask({ title: 'Weekly check', repeat: 'weekly', remindAt: '2026-09-30T08:00:00.000Z' })
    const done = store.updateTask(r.id, { done: true })
    expect(done.spawned.remindAt).toBeNull()
  })

  it('fires once at the time, then clears, without touching the card', () => {
    const t = store.createTask({ title: 'Send the quote', remindAt: at(WED, 14, 0).toISOString() })
    const before = store.allTasks().find(x => x.id === t.id).updatedAt
    expect(alerts.fireReminders(at(WED, 13, 59))).toEqual([])
    expect(alerts.fireReminders(at(WED, 14, 0))).toEqual([t.id])
    expect(sent).toEqual([{ title: 'Reminder.', body: 'Send the quote', route: '#/board' }])
    const after = store.allTasks().find(x => x.id === t.id)
    expect(after.remindAt).toBeNull()
    expect(after.updatedAt).toBe(before)
    expect(alerts.fireReminders(at(WED, 14, 1))).toEqual([])
    expect(sent).toHaveLength(1)
    expect(notify.list(1)[0]).toMatchObject({ title: 'Reminder.', category: 'reminder', snoozable: true })
  })

  it('a time that passed while Bench was closed fires on the first tick, once; a done task clears unsaid', () => {
    const past = store.createTask({ title: 'Yesterday', remindAt: at(29, 16, 0).toISOString() })
    const done = store.createTask({ title: 'Finished', remindAt: at(29, 16, 0).toISOString() })
    store.updateTask(done.id, { done: true })
    expect(alerts.fireReminders(at(WED, 8, 0))).toEqual([past.id])
    expect(store.allTasks().find(x => x.id === done.id).remindAt).toBeNull()
    expect(alerts.fireReminders(at(WED, 8, 1))).toEqual([])
    expect(sent.map(s => s.body)).toEqual(['Yesterday'])
  })

  it('waits for the end of a meeting or a focus session', () => {
    const t = store.createTask({ title: 'Ring the electrician', remindAt: at(WED, 10, 0).toISOString() })
    notify.setMeetings([{ id: 'm', subject: 'Standup', start: '09:45', end: '10:15' }], at(WED, 10, 0))
    expect(alerts.fireReminders(at(WED, 10, 0))).toEqual([])
    expect(store.allTasks().find(x => x.id === t.id).remindAt).not.toBeNull()
    notify.setMeetings([], at(WED, 10, 0))
    notify.setFocus(at(WED, 10, 40).toISOString())
    expect(alerts.fireReminders(at(WED, 10, 15))).toEqual([])
    notify.setFocus(null)
    expect(alerts.fireReminders(at(WED, 10, 16))).toEqual([t.id])
  })

  it('the tick runs every rule and never throws', async () => {
    const r = await alerts.tick(at(WED, 15, 30))
    expect(Object.keys(r)).toEqual(['suggest', 'yours', 'snoozed', 'meeting', 'due', 'actions', 'project', 'arrivals', 'clock'])
    expect(Object.values(r).every(v => v !== null)).toBe(true)
  })
})
