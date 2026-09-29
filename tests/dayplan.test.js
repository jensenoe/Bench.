import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch folders before any server module loads: a static import of anything that loads store.js writes into ./data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-dayplan-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
// No token: the calendar answers ok:false and nothing touches Graph.
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null }))

let plan, store, day
beforeAll(async () => {
  plan = await import('../server/dayplan.js')
  store = await import('../server/store.js')
  day = await import('../server/day.js')
})

// Tuesday 29 Sep 2026. Weekends only, so the tests do not lean on the canton's holidays.
const TODAY = '2026-09-29'
const weekend = d => { const x = new Date(d + 'T12:00:00').getDay(); return x === 0 || x === 6 }
const opts = (o = {}) => ({ today: TODAY, meetings: [], workdayHours: 20, cap: 10, isOff: weekend, ...o })
let n = 0
const task = (o = {}) => ({ id: o.id || `t${++n}`, title: o.title || o.id || 'Task', lane: 'active', done: false, order: n, lastTouched: `${TODAY}T08:00:00.000Z`, ...o })

describe('proposeDay: the order of claims', () => {
  it('overdue, due today, P1, due within two working days, then P2 by due date', () => {
    const tasks = [
      task({ id: 'p2-late', priority: 2, dueDate: '2026-10-09' }),
      task({ id: 'p2-undated', priority: 2 }),
      task({ id: 'soon', dueDate: '2026-10-01' }),              // Thursday: the second working day after Tuesday
      task({ id: 'p1', priority: 1 }),
      task({ id: 'today', dueDate: TODAY }),
      task({ id: 'overdue', dueDate: '2026-09-25' }),
      task({ id: 'p2-early', meta: { prio: 2 }, dueDate: '2026-10-05' }),
      task({ id: 'later', dueDate: '2026-10-02' }),             // Friday: three working days out, no claim
      task({ id: 'p3', priority: 3 })
    ]
    const p = plan.proposeDay(tasks, opts())
    expect(p.add).toEqual(['overdue', 'today', 'p1', 'soon', 'p2-early', 'p2-late', 'p2-undated'])
    expect(p.why.overdue).toBe('Was due Fri 25 Sep.')
    expect(p.why.today).toBe('Due today.')
    expect(p.why.p1).toBe('P1.')
    expect(p.why.soon).toBe('Due Thu 1 Oct.')
    expect(p.why['p2-early']).toBe('P2, due Mon 5 Oct.')
    expect(p.why['p2-undated']).toBe('P2.')
    expect(p.keep).toEqual([]); expect(p.out).toEqual([])
  })
  it('counts working days across a weekend, and says tomorrow', () => {
    const friday = '2026-10-02'
    const p = plan.proposeDay([
      task({ id: 'tue', dueDate: '2026-10-06' }), task({ id: 'wed', dueDate: '2026-10-07' }), task({ id: 'sat', dueDate: '2026-10-03' })
    ], opts({ today: friday }))
    expect(p.add).toEqual(['sat', 'tue'])
    expect(p.why.sat).toBe('Due tomorrow.')
    expect(plan.nthWorkday(friday, 2, weekend)).toBe('2026-10-06')
    expect(plan.workdaysBetween('2026-09-23', TODAY, weekend)).toBe(4)
  })
  it('keeps what is on Today and claims nothing else when there is room', () => {
    const p = plan.proposeDay([task({ id: 'on', lane: 'today' }), task({ id: 'p1', priority: 1 })], opts())
    expect(p.keep).toEqual(['on'])
    expect(p.add).toEqual(['p1'])
    expect(p.why.on).toBe('On Today already, and there is room.')
  })
  it('leaves out a card that waits for another open card', () => {
    const p = plan.proposeDay([task({ id: 'first', priority: 3 }), task({ id: 'second', priority: 1, after: ['first'] })], opts())
    expect(p.add).toEqual([])
  })
})

describe('proposeDay: the cap', () => {
  it('never plans more than the cap, and moves the unclaimed Today cards back first', () => {
    const tasks = [
      task({ id: 'a', lane: 'today' }), task({ id: 'b', lane: 'today' }), task({ id: 'c', lane: 'today', priority: 1 }),
      ...['1', '2', '3', '4'].map(i => task({ id: `due${i}`, dueDate: TODAY }))
    ]
    const p = plan.proposeDay(tasks, opts({ cap: 5 }))
    expect(p.count).toBe(5)
    expect(p.keep).toEqual(['c'])
    expect(p.add).toEqual(['due1', 'due2', 'due3', 'due4'])
    expect(p.out).toEqual(['a', 'b'])
    expect(p.why.a).toBe('Today is full with more pressing work.')
  })
  it('prefers a Today card over an equal claim from another lane', () => {
    const p = plan.proposeDay([task({ id: 'new', dueDate: TODAY }), task({ id: 'there', dueDate: TODAY, lane: 'today' })], opts({ cap: 1 }))
    expect(p.keep).toEqual(['there']); expect(p.add).toEqual([]); expect(p.out).toEqual([])
  })
})

describe('proposeDay: the hours', () => {
  it('free is the workday less timed meetings; unsized counts as one hour; what does not fit stays out', () => {
    const meetings = [{ start: '09:00', end: '10:30' }, { start: '14:00', end: '15:00' }, { allDay: true, start: null, end: null }]
    const tasks = [
      task({ id: 'big', dueDate: TODAY, effortHours: 3 }),
      task({ id: 'unsized', dueDate: TODAY }),
      task({ id: 'two', priority: 1, effortHours: 2 }),
      task({ id: 'half', priority: 2, effortHours: 0.5 }),
      task({ id: 'stays-out', lane: 'today', effortHours: 1 })
    ]
    const p = plan.proposeDay(tasks, opts({ workdayHours: 7, meetings }))
    expect(p.hours.meetings).toBe(2.5)
    expect(p.hours.free).toBe(4.5)
    expect(p.add).toEqual(['big', 'unsized', 'half'])   // 3 + 1 + 0.5; the 2 h P1 does not fit
    expect(p.hours.planned).toBe(4.5)
    expect(p.hours.unsized).toBe(1)
    expect(p.out).toEqual(['stays-out'])
    expect(p.why['stays-out']).toBe('It does not fit in the hours left.')
    expect(plan.effortOf({ effortHours: null })).toBe(1)
    expect(plan.effortOf({ effortHours: 0 })).toBe(0)
  })
  it('a day of meetings leaves no free hours and plans nothing', () => {
    const p = plan.proposeDay([task({ id: 'x', dueDate: TODAY })], opts({ workdayHours: 8, meetings: [{ start: '08:00', end: '17:00' }] }))
    expect(p.hours.free).toBe(0); expect(p.add).toEqual([])
  })
})

describe('proposeDay: what never comes in', () => {
  it('no parked and no done cards, whatever they claim', () => {
    const p = plan.proposeDay([
      task({ id: 'parked', lane: 'parked', priority: 1, dueDate: '2026-09-01' }),
      task({ id: 'done', done: true, dueDate: TODAY }),
      task({ id: 'ok', dueDate: TODAY })
    ], opts())
    expect(p.add).toEqual(['ok'])
  })
})

describe('proposeDay: waiting comes in only for a follow-up', () => {
  it('four working days of waiting is time to chase; two is not; a due date alone is not', () => {
    const p = plan.proposeDay([
      task({ id: 'jacob', lane: 'waiting', waitingOn: 'Jacob', waitingSince: '2026-09-23T09:00:00.000Z' }),
      task({ id: 'recent', lane: 'waiting', waitingOn: 'Anna', waitingSince: '2026-09-25T09:00:00.000Z' }),
      task({ id: 'late', lane: 'waiting', dueDate: '2026-09-20', waitingSince: `${TODAY}T07:00:00.000Z` })
    ], opts())
    expect(p.add).toEqual(['jacob'])
    expect(p.why.jacob).toBe('Waiting 6 days on Jacob; time to chase.')
  })
  it('a follow-up reminder of your own that has come brings it in', () => {
    const p = plan.proposeDay([task({ id: 'r', lane: 'waiting', waitingOn: 'Anna', waitingSince: `${TODAY}T07:00:00.000Z`, remindAt: '2026-09-29T13:00:00.000Z' })], opts())
    expect(p.add).toEqual(['r'])
    expect(p.why.r).toBe('Your follow-up with Anna is due.')
  })
  it('a chase ranks after due soon and before P2', () => {
    const p = plan.proposeDay([
      task({ id: 'p2', priority: 2 }),
      task({ id: 'chase', lane: 'waiting', waitingSince: '2026-09-21T09:00:00.000Z' }),
      task({ id: 'soon', dueDate: '2026-09-30' })
    ], opts())
    expect(p.add).toEqual(['soon', 'chase', 'p2'])
  })
})

describe('proposeDay: the Innovation quota', () => {
  it('one cold Innovation card at most, the coldest, after everything else', () => {
    const p = plan.proposeDay([
      task({ id: 'cold20', lane: 'innovation', lastTouched: '2026-09-09T08:00:00.000Z' }),
      task({ id: 'cold30', lane: 'innovation', lastTouched: '2026-08-30T08:00:00.000Z' }),
      task({ id: 'cold15', lane: 'innovation', lastTouched: '2026-09-14T08:00:00.000Z' }),
      task({ id: 'warm', lane: 'innovation', lastTouched: '2026-09-24T08:00:00.000Z' }),
      task({ id: 'p2', priority: 2 })
    ], opts())
    expect(p.add).toEqual(['p2', 'cold30'])
    expect(p.why.cold30).toBe('Innovation, untouched for 30 days.')
  })
  it('an Innovation card with a stronger claim comes in on that claim, outside the quota', () => {
    const p = plan.proposeDay([
      task({ id: 'due', lane: 'innovation', dueDate: TODAY, lastTouched: '2026-08-01T08:00:00.000Z' }),
      task({ id: 'cold', lane: 'innovation', lastTouched: '2026-08-30T08:00:00.000Z' })
    ], opts())
    expect(p.add).toEqual(['due', 'cold'])
  })
})

describe('summary', () => {
  it('one line, only when something would change', () => {
    expect(plan.summary({ add: ['a', 'b', 'c'], out: ['d'] })).toBe('Plan my day is ready: 3 to add, 1 to move back.')
    expect(plan.summary({ add: ['a'], out: [] })).toBe('Plan my day is ready: 1 to add.')
    expect(plan.summary({ add: [], out: [] })).toBeNull()
  })
})

describe('apply and undo against the store', () => {
  const lane = id => store.allTasks().find(t => t.id === id)?.lane
  it('moves only the lanes, records the history, and undo puts them back', async () => {
    for (const t of store.allTasks()) if (t.lane === 'today') store.updateTask(t.id, { lane: 'active' })
    const kept = store.createTask({ title: 'Kept', lane: 'today' })
    const leave = store.createTask({ title: 'Leave', lane: 'today', notes: 'keep these words' })
    const come = store.createTask({ title: 'Come in', lane: 'innovation', effortHours: 2 })
    const chase = store.createTask({ title: 'Chase Jacob', lane: 'waiting', waitingOn: 'Jacob' })
    const since = '2026-09-20T09:00:00.000Z'
    store.updateTask(chase.id, { waitingSince: since })

    const r = plan.applyPlan({ add: [come.id, chase.id], out: [leave.id] })
    expect(r).toMatchObject({ added: 2, moved: 1 })
    expect([lane(kept.id), lane(leave.id), lane(come.id), lane(chase.id)]).toEqual(['today', 'active', 'today', 'today'])
    const left = store.allTasks().find(t => t.id === leave.id)
    expect(left.notes).toBe('keep these words')
    expect(store.allTasks().find(t => t.id === come.id).effortHours).toBe(2)
    const history = await import('../server/history.js')
    const moves = history.list(10).filter(e => e.kind === 'changed' && [leave.id, come.id].includes(e.taskId))
    expect(moves.length).toBe(2)
    expect(moves.every(e => e.changes.every(c => c.field === 'lane'))).toBe(true)

    const u = plan.undoPlan({ before: r.before })
    expect(u).toEqual({ restored: 3, skipped: 0 })
    expect([lane(leave.id), lane(come.id), lane(chase.id)]).toEqual(['today', 'innovation', 'waiting'])
    expect(store.allTasks().find(t => t.id === chase.id).waitingSince).toBe(since)
  })
  it('refuses the whole plan when it would not fit the cap, before anything moves', () => {
    for (const t of store.allTasks()) if (t.lane === 'today') store.updateTask(t.id, { lane: 'active' })
    const on = [1, 2, 3, 4].map(i => store.createTask({ title: `On ${i}`, lane: 'today' }))
    const extra = [1, 2].map(i => store.createTask({ title: `Extra ${i}`, lane: 'active' }))
    expect(() => plan.applyPlan({ add: extra.map(t => t.id), out: [] })).toThrow(/Today is full/)
    expect(extra.map(t => lane(t.id))).toEqual(['active', 'active'])
    const ok = plan.applyPlan({ add: extra.map(t => t.id), out: [on[0].id] })
    expect(ok).toMatchObject({ added: 2, moved: 1 })
  })
  it('ignores ids that are parked, done or already where they would go', () => {
    const parked = store.createTask({ title: 'Parked', lane: 'parked' })
    const r = plan.applyPlan({ add: [parked.id, 'nope'], out: [parked.id] })
    expect(r).toMatchObject({ added: 0, moved: 0 })
    expect(lane(parked.id)).toBe('parked')
  })
  it('the proposal for now names every card it lists', async () => {
    const p = await plan.proposalNow()
    for (const id of [...p.keep, ...p.add, ...p.out]) expect(p.items[id]?.title).toBeTruthy()
    expect(p.cap).toBe(5)
  })
})

describe('the morning brief', () => {
  it('carries the plan line when the proposal would change Today, and it never makes the brief non-empty by itself', async () => {
    for (const t of store.allTasks()) if (!t.done) store.updateTask(t.id, { done: true })
    day._reset()
    expect((await day.brief()).plan).toBeNull()
    const t = store.createTask({ title: 'Important this week', lane: 'active', priority: 2 })
    const b = await day.brief()
    expect(b.plan).toEqual({ add: 1, out: 0, text: 'Plan my day is ready: 1 to add.' })
    expect(b.empty).toBe(day.isEmptyBrief({ ...b, plan: null }))
    store.updateTask(t.id, { done: true })
  })
})
