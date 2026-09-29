import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { p2Suggestions, priorityOf } from '../src/lanes.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-p1-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
// imported after the folder is set: a static import of anything that loads store.js would use ./data
const { plannerPrio } = await import('../server/planner.js')
const store = await import('../server/store.js')
const { todaySuggestions, suggestionMessages } = await import('../server/alerts.js')
const byTitle = t => store.allTasks().find(x => x.title === t)
const clearToday = () => { for (const t of store.allTasks()) if (t.lane === 'today') store.updateTask(t.id, { lane: 'active' }) }

describe('P1 goes to Today (roadmap 155)', () => {
  it('when a task becomes P1, and when it is created as P1', () => {
    const t = store.createTask({ title: 'Fix the gripper', lane: 'active' })
    expect(store.updateTask(t.id, { priority: 1 }).lane).toBe('today')
    expect(store.createTask({ title: 'Call the supplier', priority: 1 }).lane).toBe('today')
    expect(store.createTask({ title: 'Tidy the bench', priority: 2 }).lane).toBe('active')
  })
  it('moved out by hand, it stays out; P1 again after a change, it comes back', () => {
    const t = byTitle('Fix the gripper')
    store.updateTask(t.id, { lane: 'active' })
    store.mergeSource('planner', [])
    expect(byTitle('Fix the gripper').lane).toBe('active')
    store.updateTask(t.id, { priority: 2 })
    expect(store.updateTask(t.id, { priority: 1 }).lane).toBe('today')
  })
  it('not when Today is full, and not out of Waiting', () => {
    clearToday()
    for (let i = 0; i < store.TODAY_CAP; i++) store.createTask({ title: `Full ${i}`, lane: 'today' })
    const t = store.createTask({ title: 'No room', lane: 'active' })
    expect(store.updateTask(t.id, { priority: 1 }).lane).toBe('active')
    clearToday()
    const w = store.createTask({ title: 'With Jacob', lane: 'waiting' })
    expect(store.updateTask(w.id, { priority: 1 }).lane).toBe('waiting')
  })
  it('a Planner card marked Urgent arrives on Today, once', () => {
    clearToday()
    expect([plannerPrio(1), plannerPrio(3), plannerPrio(5), plannerPrio(9), plannerPrio(undefined)]).toEqual([1, 2, null, null, null])
    store.mergePlannerTasks([{ plannerId: 'u1', title: 'Urgent from Planner', done: false, prio: 1 }, { plannerId: 'u2', title: 'Important from Planner', done: false, prio: 2 }])
    expect(byTitle('Urgent from Planner').lane).toBe('today')
    expect(byTitle('Important from Planner').lane).toBe('active')
    store.updateTask(byTitle('Urgent from Planner').id, { lane: 'active' })
    store.mergePlannerTasks([{ plannerId: 'u1', title: 'Urgent from Planner', done: false, prio: 1 }])
    expect(byTitle('Urgent from Planner').lane).toBe('active')
  })
})

describe('P2 is suggested when Today has room (roadmap 155)', () => {
  const tasks = [
    { id: 'a', title: 'Late P2', priority: 2, lane: 'active', dueDate: '2026-10-01' },
    { id: 'b', title: 'Early P2', meta: { prio: 2 }, lane: 'innovation', dueDate: '2026-09-30' },
    { id: 'c', title: 'Undated P2', priority: 2, lane: 'active' },
    { id: 'd', title: 'Parked P2', priority: 2, lane: 'parked' },
    { id: 'e', title: 'P3', priority: 3, lane: 'active' },
    { id: 'f', title: 'On Today', lane: 'today' }
  ]
  it('on the lane: soonest first, at most two, never more than the room, not what was set aside', () => {
    const cands = tasks.filter(t => ['active', 'innovation'].includes(t.lane))
    expect(priorityOf(tasks[1])).toBe(2)
    expect(p2Suggestions(cands, 4).map(t => t.id)).toEqual(['b', 'a'])
    expect(p2Suggestions(cands, 1).map(t => t.id)).toEqual(['b'])
    expect(p2Suggestions(cands, 0)).toEqual([])
    expect(p2Suggestions(cands, 4, ['b']).map(t => t.id)).toEqual(['a', 'c'])
  })
  it('as a bell note in the morning of a working day only', () => {
    const nine = new Date(2026, 8, 29, 9, 0)
    const s = todaySuggestions(tasks, nine, true)
    expect(s.room).toBe(4)
    expect(s.p2.map(t => t.id)).toEqual(['b', 'a', 'c'])
    const [m] = suggestionMessages(s, nine)
    expect(m.category).toBe('suggest')
    expect(m.title).toBe('Room on Today.')
    expect(todaySuggestions(tasks, new Date(2026, 8, 29, 14, 0), true)).toBeNull()
    expect(todaySuggestions(tasks, nine, false)).toBeNull()
  })
  it('a P1 that found Today full is named; one moved out by hand is not', () => {
    const s = todaySuggestions([{ id: 'x', title: 'Stuck P1', priority: 1, lane: 'active' }, { id: 'y', title: 'Moved out', priority: 1, lane: 'active', p1Placed: '2026-09-29' }], new Date(2026, 8, 29, 9), true)
    expect(s.p1.map(t => t.id)).toEqual(['x'])
    expect(suggestionMessages(s, new Date(2026, 8, 29, 9))[0].title).toBe('P1 with no room.')
  })
})
