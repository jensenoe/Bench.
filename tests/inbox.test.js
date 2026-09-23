import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-inbox-'))
process.env.BENCH_USER_DIR = path.join(tmp, 'user')
process.env.BENCH_DATA_DIR = path.join(tmp, 'data')
const inbox = await import('../server/inbox.js')
const settings = await import('../server/settings.js')
const store = await import('../server/store.js')

const DAY = 86400000
const photos = path.join(tmp, 'photos')
const touch = (name, ageDays, body = 'x') => {
  const p = path.join(photos, name)
  fs.writeFileSync(p, body)
  const t = new Date(Date.now() - ageDays * DAY)
  fs.utimesSync(p, t, t)
}

beforeAll(() => {
  fs.mkdirSync(photos, { recursive: true })
  touch('IMG_0001.jpg', 1)
  touch('IMG_0002.HEIC', 3)
  touch('IMG_0003.png', 20)        // too old
  touch('notes.txt', 0)             // not a picture
  touch('screen.webp', 0.5)
  fs.mkdirSync(path.join(photos, 'album.jpg'))   // a folder with a picture name is not a file
})
afterAll(() => { inbox.stop(); fs.rmSync(tmp, { recursive: true, force: true }) })

describe('safeName', () => {
  it('accepts plain picture names', () => {
    expect(inbox.safeName('IMG_0001.jpg')).toBe('IMG_0001.jpg')
    expect(inbox.safeName('20260923_121500.HEIC')).toBe('20260923_121500.HEIC')
    expect(inbox.safeName('a b.webp')).toBe('a b.webp')
  })
  it('refuses paths, parents, other types and junk', () => {
    for (const bad of ['../secrets.jpg', '..\\x.jpg', 'sub/x.jpg', 'sub\\x.jpg', 'x..jpg', '..', '.', '', 'notes.txt', 'run.exe', 'a\0b.jpg', 'a\nb.jpg', 'x'.repeat(260) + '.jpg']) {
      expect(inbox.safeName(bad), bad).toBeNull()
    }
    expect(inbox.safeName(null)).toBeNull()
    expect(inbox.safeName(42)).toBeNull()
  })
  it('knows the content types', () => {
    expect(inbox.contentType('a.jpg')).toBe('image/jpeg')
    expect(inbox.contentType('a.HEIC')).toBe('image/heic')
    expect(inbox.contentType('a.webp')).toBe('image/webp')
  })
})

describe('listDir', () => {
  it('lists recent pictures only, newest first', () => {
    const names = inbox.listDir(photos).map(f => f.name)
    expect(names).toEqual(['screen.webp', 'IMG_0001.jpg', 'IMG_0002.HEIC'])
  })
  it('honours the window', () => {
    expect(inbox.listDir(photos, { days: 2 }).map(f => f.name)).toEqual(['screen.webp', 'IMG_0001.jpg'])
    expect(inbox.listDir(photos, { days: 30 }).map(f => f.name)).toContain('IMG_0003.png')
  })
})

describe('list, attach and dismiss', () => {
  it('says why when no folder is set or it is missing', () => {
    settings.update({ inboxDir: '' })
    expect(inbox.list().ok).toBe(false)
    settings.update({ inboxDir: path.join(tmp, 'nowhere') })
    const r = inbox.list()
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not there/)
  })
  it('lists the folder with urls, and a dismissed or attached file leaves the list', () => {
    settings.update({ inboxDir: photos })
    const first = inbox.list()
    expect(first.ok).toBe(true)
    expect(first.files.map(f => f.name)).toEqual(['screen.webp', 'IMG_0001.jpg', 'IMG_0002.HEIC'])
    expect(first.files[0].url).toBe('/api/inbox/file?name=screen.webp')

    inbox.dismiss({ name: 'screen.webp' })
    expect(inbox.list().files.map(f => f.name)).toEqual(['IMG_0001.jpg', 'IMG_0002.HEIC'])

    const task = store.createTask({ title: 'Fit the guard', lane: 'active' })
    const r = inbox.attach({ name: 'IMG_0001.jpg', taskId: task.id })
    expect(r.ok).toBe(true)
    expect(r.href).toBe(path.join(photos, 'IMG_0001.jpg'))
    expect(inbox.list().files.map(f => f.name)).toEqual(['IMG_0002.HEIC'])
    const seen = JSON.parse(fs.readFileSync(path.join(tmp, 'user', 'inbox.json'), 'utf8'))
    expect(Object.keys(seen.attached)).toEqual(['IMG_0001.jpg'])
    expect(Object.keys(seen.dismissed)).toEqual(['screen.webp'])
  })
  it('refuses to resolve anything outside the folder', () => {
    expect(() => inbox.resolveFile('../settings.json')).toThrow()
    expect(() => inbox.resolveFile('notes.txt')).toThrow()
    expect(() => inbox.resolveFile('missing.jpg')).toThrow(/not in the folder/)
    expect(() => inbox.attach({ name: 'IMG_0002.HEIC', taskId: 'nope' })).toThrow(/No such task/)
    expect(() => inbox.dismiss({ name: '../x.jpg' })).toThrow()
  })
})
