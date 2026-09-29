import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-innolane-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const store = await import('../server/store.js')
const lane = id => store.allTasks().find(t => t.sourceId === id)?.lane

describe('innovation cards live in the Innovation lane (roadmap 145)', () => {
  it('moves what is already there once, sends new I-cards there, and leaves a lane chosen by hand alone', () => {
    // before the rule: an overdue card sits in Today, a plain one in Active, a local task titled with a code in Active
    store.createTask({ title: 'I-2001 order load cells', lane: 'active' })
    store.createTask({ title: 'Buy coffee', lane: 'active' })
    const past = new Date(Date.now() - 4 * 86400000).toISOString()
    store.mergeSource('planner', [])   // first sync after the update: the one-time move runs
    const local = store.allTasks().find(t => t.title === 'I-2001 order load cells')
    expect(local.lane).toBe('innovation')
    expect(store.allTasks().find(t => t.title === 'Buy coffee').lane).toBe('active')

    store.mergeSource('planner', [
      { sourceId: 'p1', title: 'I-1050 Handgrip strength', dueDate: past, done: false },
      { sourceId: 'p2', title: 'Typenschild', dueDate: past, done: false }
    ])
    expect(lane('p1')).toBe('innovation')   // overdue, still Innovation
    expect(lane('p2')).toBe('today')        // no code: the usual rule

    // moved by hand: the next syncs keep it where it was put
    const card = store.allTasks().find(t => t.sourceId === 'p1')
    store.updateTask(card.id, { lane: 'active' })
    store.mergeSource('planner', [{ sourceId: 'p1', title: 'I-1050 Handgrip strength', dueDate: past, done: false }, { sourceId: 'p2', title: 'Typenschild', dueDate: past, done: false }])
    expect(lane('p1')).toBe('active')
  })
  it('a card that gains a code upstream moves once', () => {
    store.mergeSource('planner', [{ sourceId: 'p3', title: 'Powercooling 1.0', done: false }])
    expect(lane('p3')).toBe('active')
    store.mergeSource('planner', [{ sourceId: 'p3', title: 'I-1060 Powercooling 1.0', done: false }])
    expect(lane('p3')).toBe('innovation')
  })
})
