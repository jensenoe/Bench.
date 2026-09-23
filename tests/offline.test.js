import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The folder goes away mid-test: we replace the data directory with a file of the same name, which
// is what a dead share looks like to fs (ENOENT / ENOTDIR on every write), then bring it back.
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-offline-'))
const dir = path.join(parent, 'data')
fs.mkdirSync(dir)
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = parent
let store, notes

const takeAway = () => { fs.rmSync(dir, { recursive: true, force: true }); fs.writeFileSync(dir, 'not a folder') }
const bringBack = () => { fs.rmSync(dir, { force: true }) }

beforeAll(async () => { store = await import('../server/store.js'); notes = await import('../server/notes.js') })

describe('store while the folder is unreachable', () => {
  it('keeps writing in memory, reports offline, and lands everything when the folder is back', () => {
    const t = store.createTask({ title: 'Before the drop' })
    expect(store.status().offline).toBe(false)

    takeAway()
    expect(() => store.updateTask(t.id, { notes: 'written offline' })).not.toThrow()
    const u = store.createTask({ title: 'Also offline' })
    const s = store.status()
    expect(s.offline).toBe(true)
    expect(s.pending).toBe(2)
    expect(s.since).toBeTruthy()
    expect(s.error).toMatch(/ENOENT|ENOTDIR|EEXIST|EPERM/)
    expect(store.allTasks().find(x => x.id === t.id).notes).toBe('written offline')
    expect(store.retryWrite()).toBe(false)
    expect(() => store.reload()).toThrow(/unreachable/)

    bringBack()
    expect(store.retryWrite()).toBe(true)
    expect(store.status()).toEqual({ offline: false, since: null, error: null, pending: 0 })
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'))
    expect(disk.tasks.find(x => x.id === t.id).notes).toBe('written offline')
    expect(disk.tasks.some(x => x.id === u.id)).toBe(true)
  })
  it('the next save also brings it back', () => {
    takeAway()
    const t = store.createTask({ title: 'Second outage' })
    expect(store.status().offline).toBe(true)
    bringBack()
    store.updateTask(t.id, { notes: 'back' })
    expect(store.status().offline).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8')).tasks.find(x => x.id === t.id).notes).toBe('back')
  })
  it('a real error still throws', () => {
    expect(store.isUnreachable({ code: 'ENOENT' })).toBe(true)
    expect(store.isUnreachable({ code: 'ERR_INVALID_ARG_TYPE' })).toBe(false)   // the folder is there, the data was wrong
  })
})

describe('notes while the folder is unreachable', () => {
  it('holds logbook and napkin writes and flushes them', () => {
    const e = notes.createEntry({ title: 'Standup' })
    takeAway()
    notes.updateEntry(e.id, { notes: 'offline note' })
    const m = notes.createMap({ title: 'Offline map' })
    expect(notes.status().offline).toBe(true)
    expect(notes.status().pending).toBe(2)
    bringBack()
    expect(notes.retryWrite()).toBe(true)
    expect(notes.status().offline).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'logbook.json'), 'utf8')).items[0].notes).toBe('offline note')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'napkin.json'), 'utf8')).items.some(x => x.id === m.id)).toBe(true)
  })
})
