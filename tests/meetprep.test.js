import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch folders before any server module loads: the live half imports the store, which reads them at import time.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-meetprep-'))
process.env.BENCH_DATA_DIR = path.join(dir, 'data')
process.env.BENCH_USER_DIR = path.join(dir, 'user')
process.env.BENCH_SECRETS_DIR = path.join(dir, 'user')
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => false }))

let mp, live
beforeAll(async () => {
  mp = await import('../server/meetprep.js')
  live = await import('../server/meetprep-live.js')
})

const TODAY = '2026-09-30'
const task = (over = {}) => ({ id: over.id || Math.random().toString(36).slice(2), source: 'local', title: 'A task', lane: 'active', done: false, dueDate: null, project: null, lead: null, assignedBy: null, waitingOn: null, meta: {}, updatedAt: '2026-09-20T10:00:00.000Z', ...over })
const meeting = (over = {}) => ({ id: 'm1', subject: 'Weekly', start: '10:00', end: '10:30', location: null, organizer: 'Noël Jensen', attendees: [], allDay: false, ...over })
const at = (h, m = 0) => new Date(2026, 8, 30, h, m)

const world = () => ({
  me: 'Noël Jensen',
  today: TODAY,
  tasks: [
    task({ id: 't1', title: 'I-1050 grip sensor calibration', lane: 'today' }),
    task({ id: 't2', title: 'Order load cell', project: 'I-1050', dueDate: '2026-10-02' }),
    task({ id: 't3', title: 'Replace belt', project: 'Leg press 7' }),
    task({ id: 't4', title: 'Drawing check', lead: 'Jacob' }),
    task({ id: 't5', title: 'Quote for rails', lane: 'waiting', waitingOn: 'Jürg Keller', waitingSince: '2026-09-22T08:00:00.000Z' }),
    task({ id: 't6', title: 'Old I-1050 job', done: true }),
    task({ id: 't8', title: 'I-1050 Handgrip strength', source: 'planner', lane: 'innovation', bucketName: 'Entwicklung' }),
    task({ id: 't7', title: 'Unrelated', project: 'Rower 2' })
  ],
  entries: [
    { id: 'e1', title: 'Weekly', date: '2026-09-23', project: null, attendees: ['Jacob Müller'], decisions: ['Ship on Friday'], actions: [{ id: 'a1', text: 'Send the drawing', owner: 'Jacob', due: '2026-09-29', done: false }] },
    { id: 'e2', title: 'Handgrip sync', date: '2026-09-16', project: 'I-1050', decisions: ['Load cell from HBM'], actions: [{ id: 'a2', text: 'Check the housing', owner: 'Noël', due: null, done: false }, { id: 'a3', text: 'Done one', done: true }] }
  ],
  machines: [{ key: 'leg press 7', name: 'Leg press 7', spellings: ['Leg press 7', 'LP7'], tasks: ['t3'] }],
  projects: [{ id: 'p1', name: 'Rower rebuild', machine: 'Rower 2' }],
  portfolio: [{ code: 'I-1050', name: 'Handgrip strength' }]
})

describe('topics', () => {
  it('finds an I-code and names it from the portfolio', () => {
    const p = mp.prepFor(meeting({ subject: 'I-1050 design review' }), world())
    expect(p.topics).toEqual([{ kind: 'code', label: 'I-1050', key: 'I-1050', name: 'Handgrip strength' }])
    expect(p.open.map(t => [t.id, t.reason])).toEqual([['t1', 'I-1050'], ['t2', 'I-1050']])
    expect(p.open.some(t => t.id === 't6')).toBe(false)   // a done task is not open
    expect(p.open.some(t => t.id === 't8')).toBe(false)   // the project's own Planner card is the project
  })
  it('finds a project by its innovation name alone', () => {
    const p = mp.prepFor(meeting({ subject: 'Handgrip strength: next steps' }), world())
    expect(p.topics.map(t => t.label)).toEqual(['I-1050'])
  })
  it('finds a machine by any of its spellings, in the subject or the place', () => {
    const p = mp.prepFor(meeting({ subject: 'Acceptance', location: 'Hall 2, next to LP7' }), world())
    expect(p.topics).toEqual([{ kind: 'machine', label: 'Leg press 7', key: 'leg press 7' }])
    expect(p.open.map(t => [t.id, t.reason])).toEqual([['t3', 'Leg press 7']])
  })
  it('finds a plan from Projects and the tasks on its machine', () => {
    const p = mp.prepFor(meeting({ subject: 'Rower rebuild kickoff' }), world())
    expect(p.topics.map(t => [t.kind, t.label])).toEqual([['project', 'Rower rebuild']])
    expect(p.open.map(t => t.id)).toEqual(['t7'])
    expect(p.draft.project).toBe('Rower 2')
  })
})

describe('people', () => {
  it('matches an attendee to a task lead by first name, and says with whom', () => {
    const p = mp.prepFor(meeting({ attendees: ['Jacob Müller', 'Noël Jensen'] }), world())
    expect(p.topics).toEqual([{ kind: 'person', label: 'Jacob Müller', key: 'jacob muller' }])
    expect(p.open.map(t => [t.id, t.reason])).toEqual([['t4', 'with Jacob']])
    expect(p.owed.map(a => [a.id, a.reason])).toEqual([['a1', 'Jacob owns it']])
    expect(p.people).toEqual(['Jacob Müller'])   // you are never an attendee of your own meeting
  })
  it('lists what waits on an attendee, without accents or case getting in the way', () => {
    for (const name of ['Jurg Keller', 'JÜRG KELLER', 'Juerg Keller', 'jürg']) {
      const p = mp.prepFor(meeting({ subject: 'Rails', attendees: [name] }), world())
      expect(p.waiting.map(t => [t.id, t.reason, t.since])).toEqual([['t5', 'waiting on Jürg', '2026-09-22']])
      expect(p.open.some(t => t.id === 't5')).toBe(false)   // listed once, under Waiting on
    }
  })
  it('does not take a different person for a namesake by surname only', () => {
    expect(mp.samePerson('Jacob', 'Jacob Müller')).toBe(true)
    expect(mp.samePerson('Anna Müller', 'Jacob Müller')).toBe(false)
    expect(mp.samePerson('jacob.mueller@tom.fit', 'Jacob Müller')).toBe(true)
  })
})

describe('owed and last', () => {
  it('owed: open actions of entries on the topic; last: the newest entry on it, with its decisions', () => {
    const p = mp.prepFor(meeting({ subject: 'I-1050 review' }), world())
    expect(p.owed.map(a => [a.id, a.reason, a.entryTitle])).toEqual([['a2', 'I-1050', 'Handgrip sync']])
    expect(p.last).toMatchObject({ id: 'e2', date: '2026-09-16', decisions: ['Load cell from HBM'], reason: 'I-1050' })
  })
  it('last: the same meeting series wins over a topic', () => {
    const p = mp.prepFor(meeting({ subject: 'weekly' }), world())
    expect(p.last).toMatchObject({ id: 'e1', reason: 'same meeting', decisions: ['Ship on Friday'] })
  })
  it('an entry of today with the same title is this meeting logged, not the last time', () => {
    const w = world(); w.entries.push({ id: 'e3', title: 'Weekly', date: TODAY, actions: [] })
    const p = mp.prepFor(meeting(), w)
    expect(p.logged).toBe('e3')
    expect(p.last.id).toBe('e1')
  })
})

describe('the empty case and the limits', () => {
  it('a meeting nothing on the board speaks of is empty', () => {
    const p = mp.prepFor(meeting({ subject: 'Lunch', attendees: ['Somebody Else'] }), world())
    expect(p).toMatchObject({ topics: [], open: [], owed: [], waiting: [], last: null, empty: true })
    expect(mp.prepFor(meeting({ subject: '' }), {}).empty).toBe(true)
    expect(mp.prepFor(null, {}).empty).toBe(true)
  })
  it('open holds at most eight, today first, and says how many there are', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task({ id: `x${i}`, title: `I-2000 part ${i}`, lane: i === 11 ? 'today' : 'active' }))
    const p = mp.prepFor(meeting({ subject: 'I-2000' }), { tasks })
    expect(p.open).toHaveLength(8)
    expect(p.openCount).toBe(12)
    expect(p.open[0].id).toBe('x11')
  })
  it('I-10500 is not I-1050', () => {
    const p = mp.prepFor(meeting({ subject: 'I-10500 review' }), world())
    expect(p.open).toEqual([])
  })
})

describe('the draft', () => {
  it('carries the title, the day, the project, the people and what was open as a reference list', () => {
    const p = mp.prepFor(meeting({ subject: 'I-1050 review', location: 'Rigi', organizer: 'Jacob Müller', attendees: ['Jürg Keller', 'Noël Jensen'] }), world())
    expect(p.draft).toMatchObject({ title: 'I-1050 review', date: TODAY, project: 'I-1050', attendees: ['Jacob Müller', 'Jürg Keller'] })
    expect(p.draft.notes).toContain('10:00 to 10:30. At Rigi. Organised by Jacob Müller.')
    expect(p.draft.notes).toContain('Open going in:\n- I-1050 grip sensor calibration\n')
    expect(p.draft.notes).toContain('- Order load cell (due Fri 2 Oct)')
    expect(p.draft.notes).toContain('- Drawing check (with Jacob)')
    expect(p.draft.notes).toContain('- Jacob: Send the drawing, due Tue 29 Sep (from Weekly, Wed 23 Sep)')
    expect(p.draft.notes).toContain('- Waiting on Jürg Keller: Quote for rails')
    expect(p.draft.notes).not.toMatch(new RegExp(String.fromCharCode(0x2014)))   // no em dash
  })
})

describe('when', () => {
  const list = [
    meeting({ id: 'a', subject: 'I-1050 review', start: '10:20', end: '10:50' }),
    meeting({ id: 'b', subject: 'Lunch', start: '10:10', end: '10:15' }),
    meeting({ id: 'c', subject: 'Weekly', start: '08:00', end: '08:30', attendees: ['Jacob Müller'] }),
    meeting({ id: 'd', subject: 'Holiday', allDay: true })
  ]
  const prepOf = m => mp.prepFor(m, world())
  it('phases: soon within 30 minutes, now while it runs, ended after', () => {
    expect(mp.phaseOf(list[0], at(9, 49))).toBe('later')
    expect(mp.phaseOf(list[0], at(9, 50))).toBe('soon')
    expect(mp.phaseOf(list[0], at(10, 20))).toBe('now')
    expect(mp.phaseOf(list[0], at(10, 50))).toBe('ended')
    expect(mp.phaseOf(list[3], at(10))).toBe(null)
    expect(mp.minutesOf(list[0], at(10, 8))).toBe(12)
  })
  it('the Home card: the next one with something to bring, else the last one that ended and is not logged', () => {
    expect(mp.pickNext(list, at(10, 8), prepOf)).toMatchObject({ meeting: { id: 'a' }, phase: 'soon' })
    expect(mp.pickNext(list, at(9, 0), prepOf)).toMatchObject({ meeting: { id: 'c' }, phase: 'ended' })
    expect(mp.pickNext(list, at(9, 0), prepOf, m => m.id === 'c')).toBe(null)
    // lunch alone, ended, with nobody in it: not asked about
    expect(mp.pickNext([list[1]], at(11, 0), prepOf)).toBe(null)
  })
})

describe('the reminder route', () => {
  it('goes to the prep page when there is something to bring, and stays as it was otherwise', () => {
    expect(live.prepRoute(meeting({ id: 'AAMk/x=', subject: 'I-3000 review' }))).toEqual({ route: '#/meeting?id=AAMk%2Fx%3D' })
    expect(live.prepRoute(meeting({ subject: 'Lunch' }))).toEqual({})
    expect(live.prepRoute(null)).toEqual({})
  })
})
