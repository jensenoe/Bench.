import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// notify.js keeps its file in BENCH_USER_DIR; point it at scratch before the import.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-notify-'))
process.env.BENCH_USER_DIR = dir
process.env.BENCH_DATA_DIR = dir

let notify, bridge
beforeAll(async () => { notify = await import('../server/notify.js'); ({ bridge } = await import('../server/bridge.js')) })

describe('notify', () => {
  it('records newest first, forwards the payload to the desktop, and persists', () => {
    const sent = []
    bridge.notify = n => sent.push(n)
    const a = notify.notify({ title: 'Chase it.', body: 'Rail: Igus, PO 4711.', route: '#/procurement' })
    const b = notify.notify({ title: 'Lunch', body: 'It is twelve.', route: '#/lunch' })
    expect(sent).toEqual([
      { title: 'Chase it.', body: 'Rail: Igus, PO 4711.', route: '#/procurement' },
      { title: 'Lunch', body: 'It is twelve.', route: '#/lunch' }
    ])
    expect(a).toMatchObject({ title: 'Chase it.', body: 'Rail: Igus, PO 4711.', route: '#/procurement', read: false })
    expect(a.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(notify.list().map(i => i.id)).toEqual([b.id, a.id])
    expect(notify.unread()).toBe(2)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notifications.json'), 'utf8')).items.map(i => i.id)).toEqual([b.id, a.id])
    bridge.notify = null
  })

  it('does not fall over a desktop that throws, or a payload without a title', () => {
    bridge.notify = () => { throw new Error('no toasts here') }
    const n = notify.notify({ body: 'x', route: 42 })
    expect(n.title).toBe('Bench.')
    expect(n.route).toBeNull()
    expect(notify.unread()).toBe(3)
    bridge.notify = null
  })

  it('marks some read, then all', () => {
    const [newest] = notify.list(1)
    expect(notify.markRead([newest.id])).toBe(2)
    expect(notify.list().find(i => i.id === newest.id).read).toBe(true)
    expect(notify.markRead(['not-an-id'])).toBe(2)
    expect(notify.markRead('all')).toBe(0)
    expect(notify.unread()).toBe(0)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notifications.json'), 'utf8')).items.every(i => i.read)).toBe(true)
  })

  it('keeps 200 and cuts the list to the limit', () => {
    for (let i = 0; i < 205; i++) notify.notify({ title: `n${i}` })
    expect(notify.list(500)).toHaveLength(notify.CAP)
    expect(notify.list()).toHaveLength(20)
    expect(notify.list(5).map(i => i.title)).toEqual(['n204', 'n203', 'n202', 'n201', 'n200'])
    expect(notify.list('nonsense')).toHaveLength(20)
    expect(notify.unread()).toBe(200)
  })

  it('answers its routes', async () => {
    const routes = {}
    notify.registerRoutes({ get: (p, h) => { routes[`GET ${p}`] = h }, post: (p, h) => { routes[`POST ${p}`] = h } })
    const call = async (key, req = {}) => {
      let out, code = 200
      const res = { status(c) { code = c; return this }, json(v) { out = v } }
      await routes[key]({ query: {}, body: {}, ...req }, res)
      return { code, out }
    }
    const g = await call('GET /api/notifications', { query: { limit: '3' } })
    expect(g.code).toBe(200)
    expect(g.out.items).toHaveLength(3)
    expect(g.out.unread).toBe(200)
    expect((await call('POST /api/notifications/read', { body: { ids: [g.out.items[0].id] } })).out).toEqual({ unread: 199 })
    expect((await call('POST /api/notifications/read', { body: {} })).out).toEqual({ unread: 199 })
    expect((await call('POST /api/notifications/read', { body: { all: true } })).out).toEqual({ unread: 0 })
  })
})
