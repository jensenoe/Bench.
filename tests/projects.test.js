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
