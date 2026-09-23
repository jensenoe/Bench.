import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as db from '../server/db.js'

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `bench-db-${n}-`))
const tasksDoc = {
  tasks: [
    { id: 'a', title: 'A', updatedAt: '2026-09-23T08:00:00.000Z', order: 0 },
    { id: 'b', title: 'B', updatedAt: '2026-09-23T08:01:00.000Z', order: 1 }
  ],
  meta: { lastSync: null, lastSyncError: null, sources: { issues: { count: 2 } }, version: 2 }
}
const notesDoc = { items: [{ id: 'e1', title: 'Standup', date: '2026-09-22', updatedAt: '2026-09-22T09:00:00.000Z' }] }

describe('json engine', () => {
  const dir = tmp('json')
  it('reads and writes the files as before, atomically', () => {
    const col = db.jsonEngine(dir).collection('tasks')
    expect(col.exists()).toBe(false)
    expect(col.mtime()).toBe(0)
    expect(col.file).toBe(path.join(dir, 'tasks.json'))
    col.write(tasksDoc)
    expect(col.exists()).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'))).toEqual(tasksDoc)
    expect(col.read()).toEqual(tasksDoc)
    expect(col.mtime()).toBeGreaterThan(0)
    expect(fs.existsSync(path.join(dir, 'tasks.json.tmp'))).toBe(false)
  })
  it('moves an unreadable file aside as a copy', () => {
    fs.writeFileSync(path.join(dir, 'logbook.json'), '{ nope')
    const col = db.jsonEngine(dir).collection('logbook')
    expect(() => col.read()).toThrow()
    const bak = col.moveAside()
    expect(fs.existsSync(bak)).toBe(true)
    expect(path.basename(bak)).toMatch(/^logbook\.json\.corrupt-\d+$/)
  })
  it('is the default engine and knows only the three collections', () => {
    delete process.env.BENCH_STORAGE
    expect(db.wanted()).toBe('json')
    expect(db.describe(dir)).toMatchObject({ engine: 'json', wanted: 'json', error: null, path: null, dir, migrate: 'node server/db.js migrate --to sqlite' })
    expect(db.collection('napkin', dir).path).toBe(path.join(dir, 'napkin.json'))
    expect(() => db.collection('nope', dir)).toThrow(/unknown collection/)
    process.env.BENCH_STORAGE = 'csv'
    expect(db.wanted()).toBe('json')
    delete process.env.BENCH_STORAGE
  })
})

const sqlite = await import('../server/db-sqlite.js')
const canSqlite = sqlite.available()
if (!canSqlite) console.warn('[db.test] better-sqlite3 did not load here, the sqlite tests are skipped:', sqlite.driver().error?.message)

describe.skipIf(!canSqlite)('sqlite engine', () => {
  const dir = tmp('sqlite')
  let eng
  it('opens a database in the folder and round-trips a collection', () => {
    eng = sqlite.open(dir, db.COLLECTIONS)
    expect(fs.existsSync(path.join(dir, 'bench.sqlite'))).toBe(true)
    const col = eng.collection('tasks')
    expect(col.exists()).toBe(false)
    expect(col.mtime()).toBe(0)
    expect(col.file).toBeNull()
    expect(col.read()).toEqual({ tasks: [], meta: null })
    col.write(tasksDoc)
    expect(col.exists()).toBe(true)
    expect(col.read()).toEqual(tasksDoc)
    expect(col.mtime()).toBeGreaterThan(0)
  })
  it('saves and deletes single documents and keeps the order', () => {
    const col = eng.collection('tasks')
    const before = col.mtime()
    col.saveDoc({ id: 'c', title: 'C', updatedAt: '2026-09-23T08:02:00.000Z' })
    col.saveDoc({ id: 'a', title: 'A2', updatedAt: '2026-09-23T08:03:00.000Z' })
    expect(col.loadAll().map(t => t.id)).toEqual(['a', 'b', 'c'])
    expect(col.loadAll()[0].title).toBe('A2')
    expect(col.deleteDoc('b')).toBe(true)
    expect(col.deleteDoc('b')).toBe(false)
    expect(col.read().tasks.map(t => t.id)).toEqual(['a', 'c'])
    expect(col.read().meta).toEqual(tasksDoc.meta)   // a per-document save leaves the meta alone
    expect(col.mtime()).toBeGreaterThanOrEqual(before)
    expect(() => col.saveDoc({ title: 'no id' })).toThrow(/id/)
  })
  it('write replaces: rows not in the document go, the meta follows', () => {
    const col = eng.collection('tasks')
    col.write({ tasks: [{ id: 'z', title: 'Z' }], meta: { version: 2, sources: {} } })
    expect(col.read()).toEqual({ tasks: [{ id: 'z', title: 'Z' }], meta: { version: 2, sources: {} } })
  })
  it('keeps the notes collections apart, without meta', () => {
    const lb = eng.collection('logbook'), nk = eng.collection('napkin')
    lb.write(notesDoc)
    expect(lb.read()).toEqual(notesDoc)
    expect(nk.exists()).toBe(false)
    expect(nk.read()).toEqual({ items: [] })
    expect(() => eng.collection('nope')).toThrow(/unknown collection/)
  })
  it('survives a reopen', () => {
    eng.close()
    eng = sqlite.open(dir, db.COLLECTIONS)
    expect(eng.collection('logbook').read()).toEqual(notesDoc)
    expect(eng.collection('tasks').read().tasks.map(t => t.id)).toEqual(['z'])
  })
  it('moveAside keeps the file as evidence and starts a fresh database', () => {
    const bak = eng.moveAside()
    expect(fs.existsSync(bak)).toBe(true)
    expect(path.basename(bak)).toMatch(/^bench\.sqlite\.corrupt-\d+$/)
    expect(eng.collection('tasks').exists()).toBe(false)
    expect(eng.collection('tasks').read()).toEqual({ tasks: [], meta: null })
    eng.close()
  })
  it('is chosen by BENCH_STORAGE and described for Settings', () => {
    process.env.BENCH_STORAGE = 'sqlite'
    const d = tmp('describe')
    expect(db.describe(d)).toMatchObject({ engine: 'sqlite', wanted: 'sqlite', error: null, path: path.join(d, 'bench.sqlite'), sqliteAvailable: true, migrate: 'node server/db.js migrate --to json' })
    db.engineFor(d).close()
    delete process.env.BENCH_STORAGE
  })
})

describe.skipIf(!canSqlite)('migrate', () => {
  const dir = tmp('migrate')
  it('copies the files into the database and back', async () => {
    fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify(tasksDoc))
    fs.writeFileSync(path.join(dir, 'logbook.json'), JSON.stringify(notesDoc))
    const r = await db.migrate('sqlite', dir)
    expect(r).toEqual({ to: 'sqlite', dir, copied: { tasks: 2, logbook: 1, napkin: null } })
    const eng = sqlite.open(dir, db.COLLECTIONS)
    expect(eng.collection('tasks').read()).toEqual(tasksDoc)
    expect(eng.collection('logbook').read()).toEqual(notesDoc)
    eng.collection('napkin').write({ items: [{ id: 'm1', title: 'Map' }] })
    eng.collection('tasks').write({ ...tasksDoc, tasks: tasksDoc.tasks.slice(1) })
    eng.close()
    const back = await db.migrate('json', dir)
    expect(back.copied).toEqual({ tasks: 1, logbook: 1, napkin: 1 })
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8')).tasks.map(t => t.id)).toEqual(['b'])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'napkin.json'), 'utf8'))).toEqual({ items: [{ id: 'm1', title: 'Map' }] })
    // the file that was overwritten got its daily copy first
    expect(fs.existsSync(path.join(dir, 'backups', `tasks.${new Date().toISOString().slice(0, 10)}.json`))).toBe(true)
  })
  it('refuses an unknown target', async () => {
    await expect(db.migrate('csv', dir)).rejects.toThrow(/--to/)
  })
})

describe.skipIf(!canSqlite)('the store and the notes on sqlite', () => {
  it('create, read back after a reload, and leave no JSON files behind', async () => {
    const dir = tmp('store')
    process.env.BENCH_DATA_DIR = dir
    process.env.BENCH_STORAGE = 'sqlite'
    const store = await import('../server/store.js')
    const notes = await import('../server/notes.js')
    const t = store.createTask({ title: 'On sqlite', lane: 'today' })
    store.updateTask(t.id, { notes: 'kept' })
    const gone = store.createTask({ title: 'Gone soon' })
    store.deleteTask(gone.id)
    const e = notes.createEntry({ title: 'Meeting' })
    notes.createMap({ title: 'Ideas' })
    expect(fs.existsSync(path.join(dir, 'bench.sqlite'))).toBe(true)
    for (const f of ['tasks.json', 'logbook.json', 'napkin.json']) expect(fs.existsSync(path.join(dir, f)), f).toBe(false)
    expect(store.reload().tasks.map(x => [x.title, x.notes])).toEqual([['On sqlite', 'kept']])
    notes.reload()
    expect(notes.listEntries().map(x => x.id)).toEqual([e.id])
    expect(notes.listMaps().map(x => x.title)).toEqual(['Ideas'])
    expect(store.status().offline).toBe(false)
    const eng = sqlite.open(dir, db.COLLECTIONS)
    expect(eng.collection('tasks').read().tasks[0].title).toBe('On sqlite')
    expect(eng.collection('tasks').read().meta.version).toBe(2)
    eng.close()
    delete process.env.BENCH_STORAGE
  })
})
