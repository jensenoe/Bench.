import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-backup-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => false }))
let store, notes, backup

beforeAll(async () => {
  store = await import('../server/store.js')
  notes = await import('../server/notes.js')
  backup = await import('../server/backup.js')
})

describe('backups', () => {
  it('lists the daily copy and a copy made right now', () => {
    store.createTask({ title: 'one' })
    notes.createEntry({ title: 'meeting' })
    const today = new Date().toISOString().slice(0, 10)
    const daily = backup.list()
    expect(daily.some(b => b.name === 'tasks' && b.date === today && b.file === `tasks.${today}.json`)).toBe(true)
    const r = backup.now()
    expect(r.files).toHaveLength(2)   // tasks and logbook exist, napkin not yet
    const all = backup.list()
    for (const f of r.files) expect(all.find(b => b.file === f)).toMatchObject({ date: today, beforeRestore: false })
    expect(all[0]).toHaveProperty('size')
    expect(all[0]).toHaveProperty('at')
  })

  it('restores a copy, keeps the current file aside and reloads the store', async () => {
    const before = store.allTasks().length
    const snap = backup.now().files.find(f => f.startsWith('tasks.'))
    store.createTask({ title: 'after the snapshot' })
    expect(store.allTasks().length).toBe(before + 1)
    const r = await backup.restore(snap)
    expect(r.name).toBe('tasks')
    expect(r.kept).toMatch(/^tasks\.before-restore-/)
    expect(store.allTasks().length).toBe(before)
    expect(backup.list().find(b => b.file === r.kept)).toMatchObject({ name: 'tasks', beforeRestore: true })
    // the copy kept aside still has the extra task
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'backups', r.kept), 'utf8')).tasks.length).toBe(before + 1)
  })

  it('restores the logbook through notes.reload()', async () => {
    const snap = backup.now().files.find(f => f.startsWith('logbook.'))
    notes.createEntry({ title: 'extra' })
    expect(notes.listEntries().length).toBe(2)
    await backup.restore(snap)
    expect(notes.listEntries().length).toBe(1)
  })

  it('refuses names that are not in the list', async () => {
    await expect(backup.restore('../tasks.json')).rejects.toMatchObject({ status: 404 })
    await expect(backup.restore('tasks.2000-01-01.json')).rejects.toMatchObject({ status: 404 })
  })

  it('mirror without a token is skipped, not failed', async () => {
    const r = await backup.mirrorToOneDrive()
    expect(r.skipped).toBe('needs-signin')
    expect(backup.mirrorStatus().ok).toBeNull()
  })
})
