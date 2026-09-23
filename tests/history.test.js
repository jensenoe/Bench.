import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-history-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
let store, history

beforeAll(async () => { store = await import('../server/store.js'); history = await import('../server/history.js') })

describe('record', () => {
  it('writes created, changed and deleted entries, newest first, with the task before', () => {
    const t = store.createTask({ title: 'Grease the rails', lane: 'active' })
    store.updateTask(t.id, { lane: 'waiting', waitingOn: 'Bosch', order: 99 })
    store.updateTask(t.id, { order: 3 })                       // reorder only: no entry
    store.deleteTask(t.id)
    const list = history.list(10)
    expect(list.map(e => e.kind)).toEqual(['deleted', 'changed', 'created'])
    expect(list[1].changes).toEqual(expect.arrayContaining([{ field: 'lane', from: 'active', to: 'waiting' }, { field: 'waitingOn', from: null, to: 'Bosch' }]))
    expect(list[1].changes.some(c => c.field === 'order' || c.field === 'updatedAt' || c.field === 'waitingSince')).toBe(false)
    expect(list[1].snapshot.lane).toBe('active')
    expect(list[0].snapshot.id).toBe(t.id)
    expect(list[0].who).toBe('someone')
    expect(list[0].title).toBe('Grease the rails')
    expect(fs.existsSync(path.join(dir, 'history.json'))).toBe(true)
  })
  it('logs what a sync adds and closes, with the source as who', () => {
    store.mergeSource('issues', [{ sourceId: 'I-1', title: 'Belt squeal', done: false }])
    store.mergeSource('issues', [])
    const [closed, added] = history.list(2)
    expect(added).toMatchObject({ kind: 'synced', who: 'issues', title: 'Belt squeal' })
    expect(closed.kind).toBe('synced')
    expect(closed.changes).toEqual(expect.arrayContaining([{ field: 'done', from: false, to: true }]))
    expect(history.undoable(closed)).toBe(false)
  })
})

describe('undo', () => {
  it('puts an edit back, recreates a deleted task with its id, removes a created one', async () => {
    const t = store.createTask({ title: 'Undo me', lane: 'active', priority: 2 })
    store.updateTask(t.id, { lane: 'parked', priority: 1, title: 'Renamed' })
    const changed = history.list(1)[0]
    expect(changed.kind).toBe('changed')
    await history.undo(changed.id)
    const back = store.allTasks().find(x => x.id === t.id)
    expect(back).toMatchObject({ lane: 'active', priority: 2, title: 'Undo me' })
    expect(history.list(1)[0]).toMatchObject({ kind: 'changed', taskId: t.id })   // the undo is itself an entry
    await expect(history.undo(changed.id)).rejects.toThrow(/already undone/)

    store.deleteTask(t.id)
    const deleted = history.list(1)[0]
    const r = await history.undo(deleted.id)
    expect(r.task.id).toBe(t.id)
    expect(store.allTasks().find(x => x.id === t.id).title).toBe('Undo me')

    const created = history.list(1)[0]
    expect(created.kind).toBe('created')
    await history.undo(created.id)
    expect(store.allTasks().some(x => x.id === t.id)).toBe(false)
  })
  it('refuses sync entries and unknown ids', async () => {
    const synced = history.list(50).find(e => e.kind === 'synced')
    await expect(history.undo(synced.id)).rejects.toMatchObject({ status: 400 })
    await expect(history.undo('nope')).rejects.toMatchObject({ status: 404 })
  })
  it('caps the feed', () => {
    expect(history.CAP).toBe(2000)
    expect(history.list(5000).length).toBeLessThanOrEqual(2000)
  })
})
