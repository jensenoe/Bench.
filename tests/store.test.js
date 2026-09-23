import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The store reads BENCH_DATA_DIR at import time, so point it at a scratch folder first.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-store-'))
process.env.BENCH_DATA_DIR = dir
let store

beforeAll(async () => { store = await import('../server/store.js') })

const remote = (over = {}) => ({ sourceId: 'T-1', title: 'Replace spindle bearing', dueDate: null, done: false, group: 'Plan A', subgroup: 'Bucket', status: 'open', url: 'https://issues.tom.fit/1', ...over })

describe('createTask', () => {
  it('fills defaults and normalises the fields the board owns', () => {
    const t = store.createTask({ title: '  Order belts ', priority: 9, tags: 'motor, belts,, motor', effortHours: '2.5', assignedBy: ' Tom ' })
    expect(t.title).toBe('Order belts')
    expect(t.lane).toBe('active')
    expect(t.source).toBe('local')
    expect(t.priority).toBe(3)
    expect(t.tags).toEqual(['motor', 'belts'])
    expect(t.effortHours).toBe(2.5)
    expect(t.assignedBy).toBe('Tom')
    expect(t.done).toBe(false)
    expect(fs.existsSync(path.join(dir, 'tasks.json'))).toBe(true)
  })

  it('rejects unknown lanes and starts the waiting clock', () => {
    expect(store.createTask({ title: 'x', lane: 'nowhere' }).lane).toBe('active')
    const w = store.createTask({ title: 'y', lane: 'waiting', waitingOn: 'Supplier' })
    expect(w.waitingSince).toBeTruthy()
  })
})

describe('updateTask', () => {
  it('stamps completion and clears it again', () => {
    const t = store.createTask({ title: 'done me' })
    const d = store.updateTask(t.id, { done: true })
    expect(d.completedAt).toBeTruthy()
    expect(d.completedBy).toBe('local')
    expect(store.updateTask(t.id, { done: false }).completedAt).toBeNull()
  })

  it('clamps priority and ignores fields it does not know', () => {
    const t = store.createTask({ title: 'p' })
    const u = store.updateTask(t.id, { priority: -5, bogus: 1 })
    expect(u.priority).toBe(1)
    expect(u.bogus).toBeUndefined()
    expect(store.updateTask(t.id, { priority: '' }).priority).toBeNull()
  })

  it('moving out of waiting stops the clock', () => {
    const t = store.createTask({ title: 'w', lane: 'waiting' })
    expect(store.updateTask(t.id, { lane: 'active' }).waitingSince).toBeNull()
    expect(store.updateTask(t.id, { lane: 'waiting' }).waitingSince).toBeTruthy()
  })
})

describe('mergeSource', () => {
  it('adds new items with the source fields and an inferred lane', () => {
    const r = store.mergeSource('issues', [remote(), remote({ sourceId: 'T-2', dueDate: '2000-01-01' })])
    expect(r).toEqual({ added: 2, updated: 0, closed: 0 })
    const a = store.allTasks().find(t => t.sourceId === 'T-1')
    const b = store.allTasks().find(t => t.sourceId === 'T-2')
    expect(a.lane).toBe('active')
    expect(b.lane).toBe('today')   // due in the past lands on today
    expect(a.url).toBe('https://issues.tom.fit/1')
    expect(a.planTitle).toBe('Plan A')
  })

  it('never overwrites what the board owns', () => {
    const a = store.allTasks().find(t => t.sourceId === 'T-1')
    store.updateTask(a.id, { lane: 'parked', notes: 'mine', orderBy: '2026-10-01', waitingOn: 'Vendor', priority: 1, tags: ['x'], lead: 'Anna', project: 'M3', effortHours: 4 })
    const r = store.mergeSource('issues', [remote({ title: 'Renamed upstream', dueDate: '2026-12-24', status: 'in progress' }), remote({ sourceId: 'T-2' })])
    expect(r.updated).toBe(2)
    const after = store.allTasks().find(t => t.sourceId === 'T-1')
    expect(after.title).toBe('Renamed upstream')
    expect(after.dueDate).toBe('2026-12-24')
    expect(after.sourceStatus).toBe('in progress')
    for (const k of ['lane', 'notes', 'orderBy', 'waitingOn', 'priority', 'tags', 'lead', 'project', 'effortHours']) {
      expect(after[k], k).toEqual({ lane: 'parked', notes: 'mine', orderBy: '2026-10-01', waitingOn: 'Vendor', priority: 1, tags: ['x'], lead: 'Anna', project: 'M3', effortHours: 4 }[k])
    }
    expect(store.OWN_FIELDS).toEqual(expect.arrayContaining(['priority', 'tags', 'lead', 'project']))
  })

  it('closes items that vanished upstream and reopens ones the source reopened', () => {
    const r = store.mergeSource('issues', [remote({ sourceId: 'T-2', done: true })])
    expect(r.closed).toBe(1)
    const gone = store.allTasks().find(t => t.sourceId === 'T-1')
    expect(gone.done).toBe(true)
    expect(gone.completedAt).toBeTruthy()
    const two = store.allTasks().find(t => t.sourceId === 'T-2')
    expect(two.done).toBe(true)
    store.mergeSource('issues', [remote({ sourceId: 'T-2', done: false }), remote({ sourceId: 'T-1' })])
    expect(store.allTasks().find(t => t.sourceId === 'T-2').done).toBe(false)
  })

  it('keeps a local completion when the source still says open', () => {
    const t = store.allTasks().find(t => t.sourceId === 'T-2')
    store.updateTask(t.id, { done: true })
    store.mergeSource('issues', [remote({ sourceId: 'T-2', done: false }), remote({ sourceId: 'T-1' })])
    expect(store.allTasks().find(t => t.sourceId === 'T-2').done).toBe(true)
  })

  it('leaves other sources alone', () => {
    store.mergeSource('qms', [remote({ sourceId: 'Q-1', title: 'CAPA 12' })])
    expect(store.allTasks().find(t => t.sourceId === 'Q-1').done).toBe(false)
    store.mergeSource('issues', [remote({ sourceId: 'T-1' }), remote({ sourceId: 'T-2' })])
    expect(store.allTasks().find(t => t.sourceId === 'Q-1').done).toBe(false)
    expect(store.getMeta().sources.qms.count).toBe(1)
  })
})

describe('delivered-on and links', () => {
  it('keeps a delivery date and cleans links like the logbook does', () => {
    const t = store.createTask({ title: 'rails', supplier: 'Bosch', orderedOn: '2026-09-01', deliveredOn: '2026-09-12T08:00:00Z', links: ['\\\\share\\photos\\rail.jpg', { href: 'https://x.y/z', label: ' Drawing ' }, { href: '' }, 'junk-free'] })
    expect(t.deliveredOn).toBe('2026-09-12')
    expect(t.links).toHaveLength(3)
    expect(t.links[0]).toMatchObject({ href: '\\\\share\\photos\\rail.jpg', label: 'rail.jpg' })
    expect(t.links[1]).toMatchObject({ href: 'https://x.y/z', label: 'Drawing' })
    expect(t.links[0].id).toBeTruthy()
    const u = store.updateTask(t.id, { deliveredOn: 'nope', links: 'not a list' })
    expect(u.deliveredOn).toBeNull()
    expect(u.links).toEqual([])
    expect(store.OWN_FIELDS).toEqual(expect.arrayContaining(['deliveredOn', 'links']))
    store.mergeSource('bom', [remote({ sourceId: 'B-1', title: 'motor' })])
    expect(store.allTasks().find(x => x.sourceId === 'B-1')).toMatchObject({ deliveredOn: null, links: [] })
  })
  it('status says the folder is reachable and reload re-reads the disk', () => {
    expect(store.status()).toEqual({ offline: false, since: null, error: null, pending: 0 })
    const n = store.allTasks().length
    expect(store.reload().tasks.length).toBe(n)
  })
})

describe('load', () => {
  it('moves an unreadable file aside instead of losing it', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-store-corrupt-'))
    fs.writeFileSync(path.join(dir2, 'tasks.json'), '{ not json')
    // A fresh module instance for a fresh data dir.
    process.env.BENCH_DATA_DIR = dir2
    const fresh = await import('../server/store.js?corrupt')
    expect(fresh.allTasks()).toEqual([])
    expect(fs.readdirSync(dir2).some(f => f.startsWith('tasks.json.corrupt-'))).toBe(true)
    process.env.BENCH_DATA_DIR = dir
  })
})
