import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Two Bench instances on one folder: this module and a second, separately imported copy.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-shared-'))
process.env.BENCH_DATA_DIR = dir
const file = path.join(dir, 'tasks.json')
let A, B
const bump = () => { const t = new Date(Date.now() + 5000); fs.utimesSync(file, t, t) }   // make the mtime visibly different

beforeAll(async () => {
  A = await import('../server/store.js?shared-a')
  B = await import('../server/store.js?shared-b')
})

describe('Today cap', () => {
  it('refuses a sixth open task on Today, from create and from a move', () => {
    for (let i = 0; i < 5; i++) A.createTask({ title: `t${i}`, lane: 'today' })
    expect(() => A.createTask({ title: 'six', lane: 'today' })).toThrow(/Today is full/)
    const act = A.createTask({ title: 'active one', lane: 'active' })
    let err
    try { A.updateTask(act.id, { lane: 'today' }) } catch (e) { err = e }
    expect(err?.status).toBe(409)
    expect(A.allTasks().find(t => t.id === act.id).lane).toBe('active')
    // completing one frees a slot
    A.updateTask(A.allTasks().find(t => t.title === 't0').id, { done: true })
    expect(A.updateTask(act.id, { lane: 'today' }).lane).toBe('today')
    // reopening the done one would overflow
    expect(() => A.updateTask(A.allTasks().find(t => t.title === 't0').id, { done: false })).toThrow(/Today is full/)
    // syncs may still land due-today items there
    expect(() => A.mergeSource('issues', [{ sourceId: 'X', title: 'due today', dueDate: new Date().toISOString().slice(0, 10) }])).not.toThrow()
    expect(A.allTasks().filter(t => t.lane === 'today' && !t.done).length).toBe(6)
  })
})

describe('checklist, repeat, procurement fields', () => {
  it('normalises a checklist and ticks items', () => {
    const t = A.createTask({ title: 'cal', checklist: 'zero the cell\ncheck 10 kg\n\nsign off' })
    expect(t.checklist.map(c => c.text)).toEqual(['zero the cell', 'check 10 kg', 'sign off'])
    const u = A.updateTask(t.id, { checklist: t.checklist.map((c, i) => i === 1 ? { ...c, done: true } : c) })
    expect(u.checklist[1].done).toBe(true)
    expect(u.checklist[1].id).toBe(t.checklist[1].id)
  })
  it('keeps supplier, PO and ordered-on, drops junk', () => {
    const t = A.createTask({ title: 'rails', supplier: ' Bosch ', poNumber: 'PO-771', orderedOn: '2026-09-20T10:00:00Z', repeat: 'never' })
    expect(t.supplier).toBe('Bosch')
    expect(t.poNumber).toBe('PO-771')
    expect(t.orderedOn).toBe('2026-09-20')
    expect(t.repeat).toBeNull()
  })
  it('completing a repeating task leaves the next one behind', () => {
    const t = A.createTask({ title: 'Monday plan', lane: 'active', repeat: 'weekly', dueDate: '2026-09-21', checklist: ['open the board', 'pick five'] })
    A.updateTask(t.id, { checklist: t.checklist.map(c => ({ ...c, done: true })) })
    const r = A.updateTask(t.id, { done: true })
    expect(r.done).toBe(true)
    expect(r.spawned).toBeTruthy()
    const next = A.allTasks().find(x => x.repeatOf === t.id)
    expect(next.dueDate).toBe('2026-09-28')
    expect(next.done).toBe(false)
    expect(next.repeat).toBe('weekly')
    expect(next.checklist.every(c => !c.done)).toBe(true)
    expect(A.nextOccurrence('monthly', '2026-01-31')).toBe('2026-03-03')   // JS month arithmetic, documented
    expect(A.nextOccurrence('fortnightly', '2026-09-21')).toBe('2026-10-05')
  })
})

describe('two instances on one folder', () => {
  it('sees a task the other instance added', () => {
    const before = B.allTasks().length
    A.createTask({ title: 'from A' }); bump()
    expect(B.allTasks().length).toBe(before + 1)
    expect(B.allTasks().some(t => t.title === 'from A')).toBe(true)
  })
  it('keeps both sides’ edits when they touch different tasks', () => {
    const a = A.createTask({ title: 'A edits me' }); bump()
    const b = B.createTask({ title: 'B edits me' }); bump()
    A.load(); B.load()
    A.updateTask(a.id, { notes: 'by A' }); bump()
    B.updateTask(b.id, { notes: 'by B' }); bump()
    A.load()
    expect(A.allTasks().find(t => t.id === a.id).notes).toBe('by A')
    expect(A.allTasks().find(t => t.id === b.id).notes).toBe('by B')
    expect(B.allTasks().find(t => t.id === a.id).notes).toBe('by A')
  })
  it('a delete on one side is a delete, not a resurrection', () => {
    const a = A.createTask({ title: 'doomed' }); bump()
    B.load()
    expect(B.allTasks().some(t => t.id === a.id)).toBe(true)
    A.deleteTask(a.id); bump()
    B.createTask({ title: 'B writes after the delete' }); bump()
    expect(B.allTasks().some(t => t.id === a.id)).toBe(false)
    A.load()
    expect(A.allTasks().some(t => t.id === a.id)).toBe(false)
    expect(A.allTasks().some(t => t.title === 'B writes after the delete')).toBe(true)
  })
})
