import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// notify.js and settings.js keep their files in BENCH_USER_DIR; point it at scratch before the import.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-policy-'))
process.env.BENCH_USER_DIR = dir
process.env.BENCH_DATA_DIR = dir

const policy = await import('../server/notify-policy.js')
let notify, bridge, settings
beforeAll(async () => {
  settings = await import('../server/settings.js')
  notify = await import('../server/notify.js')
  ;({ bridge } = await import('../server/bridge.js'))
})

const WED_10 = new Date(2026, 8, 30, 10, 0)    // Wed 30 Sep, 10:00
const WED_20 = new Date(2026, 8, 30, 20, 0)    // inside the default quiet hours
const SAT_10 = new Date(2026, 9, 3, 10, 0)     // a Saturday
const quiet = { quietFrom: '19:00', quietTo: '07:00', quietWeekends: true }
const standup = { id: 'm1', subject: 'Standup', start: '09:45', end: '10:15', allDay: false }

describe('the policy, pure', () => {
  it('has a default for every category, meetings on the desktop, drift and arrivals in the Bell', () => {
    expect(policy.DEFAULT_MODES).toMatchObject({ meeting: 'desktop', reminder: 'desktop', due: 'desktop', project: 'desktop', clock: 'desktop', arrivals: 'bell', sheet: 'bell', other: 'desktop' })
    for (const c of policy.CATEGORIES) expect(policy.MODES).toContain(c.mode)
  })

  it('knows the time clock by title and route, and calls the rest other', () => {
    expect(policy.inferCategory({ title: 'Lunch', route: '#/lunch' })).toBe('clock')
    expect(policy.inferCategory({ title: 'Back', route: '#/' })).toBe('clock')
    expect(policy.inferCategory({ title: 'One thing for today', route: '#/' })).toBe('clock')
    expect(policy.inferCategory({ title: '3 things for today', route: '#/' })).toBe('clock')
    expect(policy.inferCategory({ title: 'Chase it.', category: 'parts' })).toBe('parts')
    expect(policy.inferCategory({ title: 'Something', category: 'nonsense' })).toBe('other')
    expect(policy.inferCategory({ title: 'Something' })).toBe('other')
  })

  it('cleans the modes a patch sends', () => {
    expect(policy.cleanModes({ meeting: 'off', arrivals: 'desktop', nope: 'bell', due: 'loud' })).toEqual({ meeting: 'off', arrivals: 'desktop' })
    expect(policy.cleanModes(null)).toEqual({})
    expect(policy.cleanModes(['desktop'])).toEqual({})
    expect(policy.modeOf('arrivals', { notifyModes: { arrivals: 'desktop' } })).toBe('desktop')
    expect(policy.modeOf('arrivals', {})).toBe('bell')
  })

  it('follows the mode: off drops it, bell records it quietly, desktop shows it', () => {
    expect(policy.decide({ category: 'due', now: WED_10, settings: { notifyModes: { due: 'off' } } })).toEqual({ record: false, desktop: false, reason: 'off' })
    expect(policy.decide({ category: 'arrivals', now: WED_10 })).toEqual({ record: true, desktop: false, reason: 'bell' })
    expect(policy.decide({ category: 'due', now: WED_10, settings: quiet })).toEqual({ record: true, desktop: true, reason: null })
  })

  it('keeps the desktop quiet in the quiet hours and at the weekend, but records', () => {
    expect(policy.decide({ category: 'reminder', now: WED_20, settings: quiet })).toMatchObject({ record: true, desktop: false, reason: 'quiet' })
    expect(policy.decide({ category: 'reminder', now: SAT_10, settings: quiet })).toMatchObject({ desktop: false, reason: 'quiet' })
    expect(policy.decide({ category: 'reminder', now: SAT_10, settings: { ...quiet, quietWeekends: false } })).toMatchObject({ desktop: true })
  })

  it('holds toasts while a meeting runs, except the next meeting; and while focus runs, except its end', () => {
    const inMeeting = { now: WED_10, settings: quiet, meetings: [standup] }
    expect(policy.decide({ category: 'due', ...inMeeting })).toMatchObject({ record: true, desktop: false, reason: 'meeting' })
    expect(policy.decide({ category: 'meeting', ...inMeeting })).toMatchObject({ desktop: true })
    expect(policy.decide({ category: 'due', ...inMeeting, settings: { ...quiet, notifyNotInMeetings: false } })).toMatchObject({ desktop: true })
    expect(policy.decide({ category: 'due', now: WED_10, settings: quiet, meetings: [{ ...standup, allDay: true }] })).toMatchObject({ desktop: true })
    const focusing = { now: WED_10, settings: quiet, focusUntil: new Date(WED_10.getTime() + 10 * 60_000).toISOString() }
    expect(policy.decide({ category: 'parts', ...focusing })).toMatchObject({ desktop: false, reason: 'focus' })
    expect(policy.decide({ category: 'focus', ...focusing })).toMatchObject({ desktop: true })
    expect(policy.decide({ category: 'parts', ...focusing, settings: { ...quiet, notifyNotInFocus: false } })).toMatchObject({ desktop: true })
    expect(policy.decide({ category: 'parts', now: WED_10, settings: quiet, focusUntil: new Date(WED_10.getTime() - 1000).toISOString() })).toMatchObject({ desktop: true })
  })

  it('drops a key already sent today, and caps the desktop per category', () => {
    expect(policy.decide({ category: 'project', key: 'I-1050', now: WED_10, day: { keys: ['project:I-1050'] } })).toEqual({ record: false, desktop: false, reason: 'duplicate' })
    expect(policy.decide({ category: 'due', key: 'I-1050', now: WED_10, settings: quiet, day: { keys: ['project:I-1050'] } })).toMatchObject({ desktop: true })
    expect(policy.decide({ category: 'project', now: WED_10, settings: quiet, day: { counts: { project: 3 } } })).toEqual({ record: true, desktop: false, reason: 'cap' })
    expect(policy.decide({ category: 'reminder', now: WED_10, settings: quiet, day: { counts: { reminder: 50 } } })).toMatchObject({ desktop: true })
  })

  it('snoozes to an hour from now or 08:30 tomorrow', () => {
    expect(policy.snoozeUntil('hour', WED_10)).toEqual(new Date(2026, 8, 30, 11, 0))
    expect(policy.snoozeUntil('tomorrow', WED_20)).toEqual(new Date(2026, 9, 1, 8, 30))
    expect(policy.snoozeUntil('later', WED_10)).toBeNull()
  })
})

describe('notify() with the policy', () => {
  const sent = []
  beforeEach(() => { notify._reset(); sent.length = 0; bridge.notify = n => sent.push(n); settings.update({ quietFrom: '19:00', quietTo: '07:00', quietWeekends: true, notifyModes: { meeting: 'desktop', arrivals: 'bell' }, notifyNotInMeetings: true, notifyNotInFocus: true }) })

  it('records category and snoozable, and forwards a Teams link', () => {
    const item = notify.notify({ title: 'Meeting in 5 minutes.', body: 'Standup, 10:05.', route: '#/logbook', url: 'https://teams.microsoft.com/l/meetup-join/x', category: 'meeting', key: 'm1' }, { now: WED_10 })
    expect(item).toMatchObject({ category: 'meeting', snoozable: false, desktop: true, url: 'https://teams.microsoft.com/l/meetup-join/x' })
    expect(sent).toEqual([{ title: 'Meeting in 5 minutes.', body: 'Standup, 10:05.', route: '#/logbook', url: 'https://teams.microsoft.com/l/meetup-join/x' }])
    expect(notify.notify({ title: 'x', url: 'javascript:alert(1)', category: 'reminder' }, { now: WED_10 }).url).toBeUndefined()
  })

  it('says a key once a day, and again the next day', () => {
    expect(notify.notify({ title: 'Due today.', category: 'due', key: 'today' }, { now: WED_10 })).toBeTruthy()
    expect(notify.notify({ title: 'Due today.', category: 'due', key: 'today' }, { now: new Date(2026, 8, 30, 16, 0) })).toBeNull()
    expect(notify.notify({ title: 'Due today.', category: 'due', key: 'today' }, { now: new Date(2026, 9, 1, 15, 0) })).toBeTruthy()
    expect(notify.list().filter(i => i.title === 'Due today.')).toHaveLength(2)
  })

  it('infers clock for the time clock and follows its mode', () => {
    settings.update({ notifyModes: { clock: 'off' } })
    expect(notify.notify({ title: 'Lunch', body: 'It is twelve.', route: '#/lunch' }, { now: WED_10 })).toBeNull()
    settings.update({ notifyModes: { clock: 'bell' } })
    const i = notify.notify({ title: 'Back', body: 'Lunch ended at 12:30.', route: '#/' }, { now: WED_10 })
    expect(i).toMatchObject({ category: 'clock', desktop: false, held: 'bell' })
    expect(sent).toHaveLength(0)
  })

  it('holds the toast in a meeting and in focus, while the Bell records it', () => {
    notify.setMeetings([standup], WED_10)
    const a = notify.notify({ title: 'Chase it.', category: 'parts' }, { now: WED_10 })
    expect(a).toMatchObject({ desktop: false, held: 'meeting', read: false })
    expect(notify.holdFor('reminder', WED_10)).toBe('meeting')
    notify.setMeetings([], WED_10)
    notify.setFocus(new Date(WED_10.getTime() + 25 * 60_000).toISOString())
    expect(notify.notify({ title: 'Chase it.', category: 'parts' }, { now: WED_10 })).toMatchObject({ desktop: false, held: 'focus' })
    expect(notify.notify({ title: 'Focus done.', category: 'focus' }, { now: WED_10 })).toMatchObject({ desktop: true })
    notify.setFocus(null)
    expect(sent.map(s => s.title)).toEqual(['Focus done.'])
    expect(notify.unread()).toBe(3)
  })

  it('caps parts at three toasts a day; the rest go to the Bell', () => {
    for (let i = 0; i < 5; i++) notify.notify({ title: `Chase ${i}.`, category: 'parts', key: `p${i}` }, { now: WED_10 })
    expect(sent).toHaveLength(3)
    expect(notify.list().filter(i => i.held === 'cap')).toHaveLength(2)
  })

  it('the test button gets through the quiet hours', () => {
    const i = notify.sendTest(WED_20)
    expect(i.desktop).toBe(true)
    expect(sent[0]).toMatchObject({ title: 'Test.', force: true })
  })
})

describe('snooze', () => {
  const sent = []
  beforeEach(() => { notify._reset(); sent.length = 0; bridge.notify = n => sent.push(n); settings.update({ quietFrom: '19:00', quietTo: '07:00', quietWeekends: true, notifyModes: {} }) })

  it('puts a reminder away for an hour and sends it again then, through the same path', () => {
    const r = notify.notify({ title: 'Reminder.', body: 'Call Igus', route: '#/board', category: 'reminder', key: 't1|x' }, { now: WED_10 })
    const s = notify.snooze(r.id, 'hour', WED_10)
    expect(s.until).toBe(new Date(2026, 8, 30, 11, 0).toISOString())
    expect(notify.list().find(i => i.id === r.id)).toMatchObject({ read: true, snoozedUntil: s.until })
    expect(notify.fireSnoozed(new Date(2026, 8, 30, 10, 59))).toEqual([])
    const back = notify.fireSnoozed(new Date(2026, 8, 30, 11, 0))
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ title: 'Reminder.', body: 'Call Igus', category: 'reminder', read: false, desktop: true })
    expect(sent.map(x => x.body)).toEqual(['Call Igus', 'Call Igus'])
    expect(notify.fireSnoozed(new Date(2026, 8, 30, 12, 0))).toEqual([])   // once
    expect(notify.snoozed()).toEqual([])
  })

  it('tomorrow is 08:30; a snooze that ends in a meeting waits for its end', () => {
    const r = notify.notify({ title: 'Overdue.', body: '2 tasks', category: 'due', key: 'overdue' }, { now: WED_10 })
    expect(notify.snooze(r.id, 'tomorrow', WED_10).until).toBe(new Date(2026, 9, 1, 8, 30).toISOString())
    const thu = new Date(2026, 9, 1, 8, 30)
    notify.setMeetings([{ id: 'x', subject: 'Review', start: '08:00', end: '09:00' }], thu)
    expect(notify.fireSnoozed(thu)).toEqual([])
    notify.setMeetings([], thu)
    expect(notify.fireSnoozed(new Date(2026, 9, 1, 9, 0))).toHaveLength(1)   // the de-duplication key does not stop a snooze
  })

  it('refuses a row that is not snoozable, or an unknown preset', () => {
    const m = notify.notify({ title: 'Meeting in 5 minutes.', category: 'meeting' }, { now: WED_10 })
    expect(notify.snooze(m.id, 'hour', WED_10)).toBeNull()
    const r = notify.notify({ title: 'Reminder.', category: 'reminder' }, { now: WED_10 })
    expect(notify.snooze(r.id, 'next year', WED_10)).toBeNull()
    expect(notify.snooze('nope', 'hour', WED_10)).toBeNull()
  })
})

describe('settings', () => {
  it('adds the notification keys with safe defaults and validates them', () => {
    expect(settings.DEFAULTS).toMatchObject({ notifyModes: {}, notifyNotInMeetings: true, notifyNotInFocus: true })
    const was = { ...settings.get().notifyModes }
    const a = settings.update({ notifyModes: { due: 'bell', bogus: 'off', meeting: 'loud' } })
    expect(a.notifyModes).toEqual({ ...was, due: 'bell' })
    expect(a.notifyModes.bogus).toBeUndefined()
    expect(a.notifyModes.meeting).toBe(was.meeting)
    const b = settings.update({ notifyModes: { project: 'off' } })
    expect(b.notifyModes).toEqual({ ...was, due: 'bell', project: 'off' })   // a patch names only what changes
    expect(settings.update({ notifyModes: 'loud' }).notifyModes).toEqual(b.notifyModes)
    expect(settings.update({ notifyNotInMeetings: 'yes' }).notifyNotInMeetings).toBe(true)
    expect(settings.update({ notifyNotInFocus: false }).notifyNotInFocus).toBe(false)
  })
})
