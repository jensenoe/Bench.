import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-remind-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => false }))

let rem, bridge
beforeAll(async () => { rem = await import('../server/reminders.js'); ({ bridge } = await import('../server/bridge.js')) })

const today = new Date(2026, 8, 23, 9, 0)   // Wed 23 Sep
const stats = [{ key: 'bosch', supplier: 'Bosch', median: 12, samples: [12], last: 12, count: 1 }]
const t = (over) => ({ id: over.id || over.title, title: 'part', done: false, supplier: 'Bosch', poNumber: 'PO-1', orderedOn: '2026-09-10', deliveredOn: null, dueDate: '2026-10-01', ...over })

describe('chaseList', () => {
  it('picks open, ordered, undelivered parts due inside the lead time', () => {
    const list = rem.chaseList([
      t({ id: 'inside', dueDate: '2026-10-01' }),                        // 8 days, inside Bosch's 12
      t({ id: 'far', dueDate: '2026-10-20' }),                           // 27 days, not yet
      t({ id: 'late', dueDate: '2026-09-20' }),                          // already late, still chased
      t({ id: 'delivered', deliveredOn: '2026-09-20' }),
      t({ id: 'done', done: true }),
      t({ id: 'not-ordered', orderedOn: null }),
      t({ id: 'no-date', dueDate: null }),
      t({ id: 'unknown-near', supplier: 'Nobody', dueDate: '2026-09-29' }),   // 6 days, inside the default 7
      t({ id: 'unknown-far', supplier: 'Nobody', dueDate: '2026-10-02' })     // 9 days, outside 7
    ], stats, today)
    expect(list.map(x => x.id)).toEqual(['late', 'unknown-near', 'inside'])
    expect(list[0]).toMatchObject({ daysLeft: -3, leadDays: 12 })
    expect(list[1]).toMatchObject({ daysLeft: 6, leadDays: 7, supplier: 'Nobody' })
  })
  it('reads BOM parts from their meta', () => {
    const list = rem.chaseList([{ id: 'bom', title: 'BOM part', done: false, meta: { supplier: 'Igus', orderedOn: '2026-09-01', orderNumber: '4711', needBy: '2026-09-25' } }], [], today)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ supplier: 'Igus', poNumber: '4711', dueDate: '2026-09-25', daysLeft: 2 })
  })
  it('says it the agreed way', () => {
    const m = rem.chaseMessage({ title: 'Linear rail', supplier: null, poNumber: null, dueDate: '2026-10-01' })
    expect(m).toEqual({ title: 'Chase it.', body: 'Linear rail: the supplier, PO none, needed Thu 1 Oct.', route: '#/procurement' })
  })
})

describe('tick', () => {
  it('notifies once per task per day and never throws', async () => {
    const store = await import('../server/store.js')
    const sent = []
    bridge.notify = (n) => sent.push(n)
    const a = store.createTask({ title: 'Chase me', supplier: 'Bosch', poNumber: 'PO-9', orderedOn: '2026-09-10', dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) })
    const r1 = await rem.tick(new Date())
    expect(r1.chase).toBe(1)
    expect(sent[0].title).toBe('Chase it.')
    expect(sent[0].body).toMatch(/Chase me: Bosch, PO PO-9/)
    // the same notification is in the history the Bell reads (roadmap 107)
    const history = JSON.parse(fs.readFileSync(path.join(dir, 'notifications.json'), 'utf8')).items
    expect(history[0]).toMatchObject({ title: 'Chase it.', route: '#/procurement', read: false })
    expect(history[0].body).toMatch(/Chase me: Bosch, PO PO-9/)
    const r2 = await rem.tick(new Date())
    expect(r2.chase).toBe(0)
    const d = new Date()
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'reminders.json'), 'utf8')).chased[a.id]).toBe(localToday)
    expect(r2.mirror).toBeTruthy()   // no token: skipped, not thrown
    expect(r2.drift).toBe(false)
    bridge.notify = null
  })
})
