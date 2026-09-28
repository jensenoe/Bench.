import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-projects-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const P = await import('../server/projects.js')
const store = await import('../server/store.js')

describe('working days', () => {
  it('skips weekends in both directions', () => {
    expect(P.addWorkingDays('2026-09-25', 1)).toBe('2026-09-28')      // Friday plus one is Monday
    expect(P.addWorkingDays('2026-09-28', -1)).toBe('2026-09-25')     // Monday minus one is Friday
    expect(P.addWorkingDays('2026-09-27', -1)).toBe('2026-09-24')     // from a Sunday, back to Friday first, then one more
    expect(P.workingDaysBetween('2026-09-21', '2026-09-25')).toBe(5)
    expect(P.workingDaysBetween('2026-09-21', '2026-09-28')).toBe(6)
    expect(P.workingDaysBetween('2026-09-28', '2026-09-21')).toBe(-6)
  })
})

describe('planning backwards', () => {
  const phases = [{ id: 'a', name: 'Design', days: 5 }, { id: 'b', name: 'Procurement', days: 10 }, { id: 'c', name: 'Test', days: 3 }]
  it('the last phase ends on the deadline and the others sit before it, working days only', () => {
    const s = P.scheduleBackwards(phases, '2026-10-30')   // a Friday
    expect(s[2]).toMatchObject({ start: '2026-10-28', end: '2026-10-30' })
    expect(s[1]).toMatchObject({ start: '2026-10-14', end: '2026-10-27' })
    expect(s[0]).toMatchObject({ start: '2026-10-07', end: '2026-10-13' })
    expect(P.workingDaysBetween(s[1].start, s[1].end)).toBe(10)
  })
  it('a weekend deadline moves to the Friday before', () => {
    expect(P.scheduleBackwards(phases, '2026-10-31')[2].end).toBe('2026-10-30')
  })
  it('order-by dates come from the phase start and the lead time', () => {
    const s = P.scheduleBackwards(phases, '2026-10-30')
    const project = { machine: 'Machine 14', deadline: '2026-10-30' }
    const tasks = [
      { id: 't1', title: 'Rails', project: 'Machine 14', supplier: 'Misumi', phase: 'c', done: false },
      { id: 't2', title: 'Seals', project: 'Machine 14', supplier: 'Bosch', done: false },
      { id: 't3', title: 'Ordered already', project: 'Machine 14', supplier: 'Bosch', orderedOn: '2026-09-01', done: false },
      { id: 't4', title: 'Other machine', project: 'Row 3', supplier: 'Bosch', done: false }
    ]
    const suggest = ({ needBy }) => ({ orderBy: P.addWorkingDays(needBy, -10), days: 14, basis: 'default' })
    const o = P.orderSuggestions(project, s, tasks, suggest)
    expect(o.map(x => x.taskId)).toEqual(['t1', 't2'])
    expect(o[0]).toMatchObject({ needBy: '2026-10-28', orderBy: '2026-10-14' })
    expect(o[1].needBy).toBe('2026-10-28')   // no phase: the phase after Procurement
  })
})

describe('slack and fit', () => {
  const phases = P.scheduleBackwards([{ id: 'a', name: 'Design', days: 5 }, { id: 'b', name: 'Assembly', days: 10 }], '2026-10-30')
  const project = { machine: 'M14', deadline: '2026-10-30' }
  it('slack is the room between the latest due date of a phase and its end', () => {
    const tasks = [{ id: '1', project: 'M14', phase: 'b', dueDate: '2026-10-23', done: false }, { id: '2', project: 'M14', phase: 'a', dueDate: '2026-10-20', done: false }]
    const s = P.slackOf(project, phases, tasks, '2026-10-01')
    expect(s.perPhase.find(x => x.id === 'b').slack).toBe(5)
    expect(s.perPhase.find(x => x.id === 'a').slack).toBe(-2)   // due Tue 20 Oct, Design ends Fri 16 Oct: two working days late
    expect(P.gap('2026-10-13', '2026-10-14')).toBe(1)    // one working day of room, and the same the other way round
    expect(P.gap('2026-10-14', '2026-10-13')).toBe(-1)
    expect(P.gap('2026-10-16', '2026-10-13')).toBe(-3)
    expect(s.slack).toBeLessThan(0)
    expect(s.late.map(t => t.id)).toEqual(['2'])
  })
  it('with nothing dated, slack is the working days to the deadline', () => {
    expect(P.slackOf(project, phases, [], '2026-10-26').slack).toBe(4)
  })
  it('fit compares hours with the phase capacity', () => {
    const tasks = [{ id: '1', project: 'M14', phase: 'b', effortHours: 30, done: false }, { id: '2', project: 'M14', phase: 'b', done: false }]
    const f = P.fitOf(project, phases, tasks, { workdayHours: 8, share: 0.5 })
    const b = f.find(x => x.id === 'b')
    expect(b).toMatchObject({ hours: 30, unsized: 1, capacity: 40, fits: true })
  })
})

describe('the store', () => {
  it('creates a planned project, assigns a phase, re-plans and writes the dates', () => {
    const p = P.create({ name: 'Leg press 7', machine: 'Leg press 7', deadline: '2026-11-27', deadlineLabel: 'FAT' })
    expect(p.phases).toHaveLength(7)
    expect(p.phases.at(-1).end).toBe('2026-11-27')
    const t = store.createTask({ title: 'Linear rails', project: 'Leg press 7', supplier: 'Misumi', lane: 'active' })
    const assembly = p.phases.find(x => /Mechanical/.test(x.name))
    store.updateTask(t.id, { phase: assembly.id })
    const d = P.detail(p.id, '2026-10-01')
    expect(d.phases.find(x => x.id === assembly.id).tasks.map(x => x.id)).toEqual([t.id])
    expect(d.orders[0]).toMatchObject({ taskId: t.id, needBy: assembly.start })
    const r = P.schedule(p.id, { apply: true })
    expect(r.written).toBe(1)
    const after = store.allTasks().find(x => x.id === t.id)
    expect(after.orderBy).toBe(r.orders[0].orderBy)
    expect(after.dueDate).toBe(assembly.start)
    expect(P.summaries('2026-10-01')[0]).toMatchObject({ name: 'Leg press 7', open: 1 })
    expect(P.remove(p.id)).toBe(true)
  })
})

const W = await import('../server/workdays.js')
const S = await import('../server/settings.js')

describe('holidays and days off (roadmap 131)', () => {
  it('knows Easter and the ten Zurich holidays', () => {
    expect(W.easter(2025)).toBe('2025-04-20')
    expect(W.easter(2026)).toBe('2026-04-05')
    expect(W.easter(2027)).toBe('2027-03-28')
    const zh = W.holidays(2026, 'ZH')
    expect(zh.size).toBe(10)
    expect(zh.get('2026-04-03')).toBe('Good Friday')
    expect(zh.get('2026-05-14')).toBe('Ascension')
    expect(zh.get('2026-05-25')).toBe('Whit Monday')
    expect(W.holidays(2026, 'CH').size).toBe(4)
    expect(W.holidays(2026, 'none').size).toBe(0)
  })
  it('reads dates and ranges', () => {
    expect([...W.parseDaysOff('2026-12-28 to 2026-12-31, 2027-01-05')]).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-05'])
    expect(W.parseDaysOff('2026-12-31..2026-12-30').size).toBe(2)
    expect(W.parseDaysOff('nonsense, 2026-13').size).toBe(0)
  })
  it('the plan skips the Easter weekend and Christmas', () => {
    // five working days ending Fri 10 Apr 2026: 10, 9, 8, 7, then over Easter Monday, the weekend and Good Friday to Thu 2 Apr
    expect(P.scheduleBackwards([{ id: 'x', name: 'Test', days: 5 }], '2026-04-10')[0].start).toBe('2026-04-02')
    expect(P.addWorkingDays('2026-12-23', 1)).toBe('2026-12-24')
    expect(P.addWorkingDays('2026-12-23', 2)).toBe('2026-12-28')
    expect(W.offBetween('2026-12-20', '2027-01-06').map(x => x.date)).toEqual(['2026-12-25', '2027-01-01'])   // 26 Dec and 2 Jan fall on a Saturday
  })
  it('the days off in Settings count too, and go away again', () => {
    S.update({ daysOff: '2026-12-28 to 2026-12-31' })
    expect(P.addWorkingDays('2026-12-24', 1)).toBe('2027-01-04')
    S.update({ holidayRegion: 'none', daysOff: '' })
    expect(P.addWorkingDays('2026-12-24', 1)).toBe('2026-12-25')
    S.update({ holidayRegion: 'ZH' })
    expect(P.addWorkingDays('2026-12-24', 1)).toBe('2026-12-28')
  })
})

describe('waits for (roadmap 132)', () => {
  const project = { machine: 'M', deadline: '2026-11-27' }
  const suggest = () => ({ days: 14 })
  const base = () => [
    { id: 'a', title: 'Design', project: 'M', effortHours: 10, done: false },
    { id: 'b', title: 'Weld', project: 'M', effortHours: 8, after: ['a'], done: false },
    { id: 'c', title: 'Rails', project: 'M', supplier: 'Misumi', done: false },
    { id: 'd', title: 'Assemble', project: 'M', after: ['b', 'c'], dueDate: '2026-10-16', done: false }
  ]
  it('walks forward from today and names the chain that decides', () => {
    const f = P.forecastOf(project, [], base(), '2026-10-01', { workdayHours: 8, share: 0.5, suggestFn: suggest })
    expect(f.tasks.a).toMatchObject({ start: '2026-10-01', finish: '2026-10-05', days: 3 })
    expect(f.tasks.b).toMatchObject({ start: '2026-10-06', finish: '2026-10-07' })
    expect(f.tasks.c).toMatchObject({ start: '2026-10-01', finish: '2026-10-14', days: 10 })   // fourteen calendar days, ten working
    expect(f.tasks.d).toMatchObject({ start: '2026-10-15', finish: '2026-10-15', heldBy: 'c', slack: 1 })
    expect(f.chain.map(x => x.id)).toEqual(['c', 'd'])
    expect(f.slack).toBe(1)
  })
  it('a due date inside the chain goes negative', () => {
    const t = base(); t[3].dueDate = '2026-10-14'
    expect(P.forecastOf(project, [], t, '2026-10-01', { workdayHours: 8, share: 0.5, suggestFn: suggest }).slack).toBe(-1)
  })
  it('an ordered part only waits for what is left of its lead time, a done task holds nothing up', () => {
    const t = base(); t[2].orderedOn = '2026-09-24'; t[0].done = true
    const f = P.forecastOf(project, [], t, '2026-10-01', { workdayHours: 8, share: 0.5, suggestFn: suggest })
    expect(f.tasks.c.days).toBe(5)   // ten working days of lead, five gone since Thu 24 Sep
    expect(f.tasks.b.start).toBe('2026-10-01')
  })
  it('no pairs, no forecast; a loop does not hang', () => {
    expect(P.forecastOf(project, [], [{ id: 'z', project: 'M', done: false }], '2026-10-01')).toEqual({ tasks: {}, chain: [], slack: null })
    const loop = [{ id: 'e', title: 'E', project: 'M', after: ['f'], done: false }, { id: 'f', title: 'F', project: 'M', after: ['e'], done: false }]
    expect(() => P.forecastOf(project, [], loop, '2026-10-01', { suggestFn: suggest })).not.toThrow()
  })
  it('the store keeps after clean: no self, no repeats', () => {
    const t = store.createTask({ title: 'Wire the cabinet', project: 'M', lane: 'active' })
    const u = store.updateTask(t.id, { after: ['x1', 'x1', t.id, 7, 'x2'] })
    expect(u.after).toEqual(['x1', 'x2'])
  })
})

describe('Logbook actions into the phase (roadmap 133)', () => {
  it('phaseFor picks the phase running today, else the next, and nothing for an unplanned machine', () => {
    const p = P.create({ name: 'Row 9', machine: 'Row 9', deadline: '2026-11-27' })
    const running = p.phases.find(x => x.start <= '2026-10-01' && '2026-10-01' <= x.end)
    expect(P.phaseFor('row 9', '2026-10-01')).toBe(running.id)
    expect(P.phaseFor('Row 9', '2026-01-05')).toBe(p.phases[0].id)
    expect(P.phaseFor('No such machine', '2026-10-01')).toBe(null)
    P.remove(p.id)
  })
})

describe('the forecast inside the plan', () => {
  it('a task does not start before its phase, and the chain runs to the last task', () => {
    const phases = P.scheduleBackwards([{ id: 'd', name: 'Design', days: 10 }, { id: 'm', name: 'Mechanical', days: 10 }, { id: 't', name: 'Test', days: 5 }], '2026-11-27')
    const tasks = [
      { id: 'a', title: 'Drawings', project: 'M', phase: 'd', effortHours: 5, done: false },
      { id: 'b', title: 'Weld', project: 'M', phase: 'm', effortHours: 5, after: ['a'], done: false },
      { id: 'c', title: 'Test run', project: 'M', phase: 't', effortHours: 5, after: ['b'], done: false }
    ]
    const f = P.forecastOf({ machine: 'M', deadline: '2026-11-27' }, phases, tasks, '2026-09-28', { workdayHours: 10, share: 0.5, suggestFn: () => ({ days: 14 }) })
    expect(f.tasks.a.start).toBe(phases[0].start)
    expect(f.tasks.b.start).toBe(phases[1].start)
    expect(f.tasks.c.start).toBe(phases[2].start)
    expect(f.chain.map(x => x.id)).toEqual(['c'])   // each waits for its phase, not for the one before, so the chain is the last task alone
    expect(f.slack).toBe(Math.min(f.tasks.a.slack, f.tasks.b.slack, f.tasks.c.slack))
  })
})
