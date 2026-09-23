import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-mail-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
let token = null, account = null
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => token, getAccount: async () => account, isConfigured: () => true }))

let mail, store, settings, bridge
beforeAll(async () => {
  mail = await import('../server/mail.js')
  store = await import('../server/store.js')
  settings = await import('../server/settings.js')
  ;({ bridge } = await import('../server/bridge.js'))
})

const msg = (over = {}) => ({ id: over.id || Math.random().toString(36).slice(2), subject: '', bodyPreview: '', receivedDateTime: '2026-09-22T09:15:00Z', from: { emailAddress: { name: 'Bosch', address: 'orders@bosch.example' } }, ...over })
const t = (over = {}) => ({ id: over.id || over.title, title: 'Part', done: false, supplier: 'Bosch', poNumber: '4711', orderedOn: null, deliveredOn: null, ...over })

describe('classify', () => {
  it('sets ordered-on from an order confirmation that names the PO', () => {
    const out = mail.classify(msg({ id: 'm1', subject: 'Auftragsbestätigung 4711' }), [t({ id: 'a' })])
    expect(out).toEqual([{ taskId: 'a', title: 'Part', poNumber: '4711', supplier: 'Bosch', messageId: 'm1', subject: 'Auftragsbestätigung 4711', value: '2026-09-22', field: 'orderedOn' }])
  })
  it('sets delivered-on from a delivery note, and both when one mail says both', () => {
    expect(mail.classify(msg({ subject: 'Your shipment', bodyPreview: 'PO 4711 has shipped, tracking 1Z...' }), [t({ id: 'a', orderedOn: '2026-09-10' })]).map(c => c.field)).toEqual(['deliveredOn'])
    expect(mail.classify(msg({ subject: 'Order confirmation and delivery note 4711' }), [t({ id: 'a' })]).map(c => c.field)).toEqual(['orderedOn', 'deliveredOn'])
  })
  it('leaves a field that is already set, a done task, and tasks without supplier or PO alone', () => {
    const tasks = [t({ id: 'set', orderedOn: '2026-09-01' }), t({ id: 'done', done: true }), t({ id: 'nopo', poNumber: null }), t({ id: 'nosup', supplier: null })]
    expect(mail.classify(msg({ subject: 'Order confirmation 4711' }), tasks)).toEqual([])
  })
  it('needs the PO as a whole word and a confirming or delivering phrase', () => {
    expect(mail.classify(msg({ subject: 'Order confirmation 47110' }), [t({ id: 'a' })])).toEqual([])
    expect(mail.classify(msg({ subject: 'Rechnung 4711' }), [t({ id: 'a' })])).toEqual([])
    expect(mail.classify(msg({ subject: 'AB 4711 Bosch' }), [t({ id: 'a' })]).map(c => c.field)).toEqual(['orderedOn'])
    expect(mail.classify(msg({ subject: 'Lieferschein zu Bestellung PO-2026-17' }), [t({ id: 'b', poNumber: 'PO-2026-17' })]).map(c => c.field)).toEqual(['deliveredOn'])
  })
  it('uses the message day in local time', () => {
    const out = mail.classify(msg({ subject: 'Lieferschein 4711', receivedDateTime: '2026-09-21T23:30:00Z' }), [t({ id: 'a' })])
    expect(out[0].value).toBe('2026-09-22')   // 01:30 in Zurich
  })
  it('says nothing for an empty or undated message', () => {
    expect(mail.classify(msg({ subject: '', bodyPreview: '' }), [t()])).toEqual([])
    expect(mail.classify(msg({ subject: 'Order confirmation 4711', receivedDateTime: 'nonsense' }), [t()])).toEqual([])
  })
})

describe('changeMessage', () => {
  it('says it the agreed way', () => {
    expect(mail.changeMessage({ field: 'orderedOn', supplier: 'Bosch', poNumber: '4711' })).toEqual({ title: 'Order confirmed.', body: 'Bosch confirmed PO 4711.', route: '#/procurement' })
    expect(mail.changeMessage({ field: 'deliveredOn', supplier: 'Igus', poNumber: '9' }).body).toBe('Igus delivered PO 9.')
  })
})

describe('suppliersFrom', () => {
  const stats = [{ key: 'bosch', supplier: 'Bosch', median: 12, samples: [12, 12], count: 2 }]
  it('counts open, ordered and delivered per supplier and reads the median from the lead times', () => {
    const rows = mail.suppliersFrom([
      t({ id: '1', title: 'Relay', orderBy: '2026-10-01' }),
      t({ id: '2', title: 'Sensor', orderedOn: '2026-09-10', dueDate: '2026-09-30' }),
      t({ id: '3', title: 'Cable', orderedOn: '2026-09-01', deliveredOn: '2026-09-12', dueDate: '2026-09-15' }),
      t({ id: '4', title: 'Late cable', orderedOn: '2026-09-01', deliveredOn: '2026-09-20', dueDate: '2026-09-15' }),
      t({ id: '5', title: 'Undated', orderedOn: '2026-09-01', deliveredOn: '2026-09-20', dueDate: null }),
      t({ id: '6', title: 'Bolts', supplier: 'Bossard', poNumber: 'B1' }),
      { id: '7', title: 'BOM part', done: false, meta: { supplier: 'Igus', orderedOn: '2026-09-05', orderNumber: 'I-1', needBy: '2026-09-25' } },
      t({ id: '8', title: 'No supplier', supplier: null })
    ], stats)
    expect(rows.map(r => r.supplier)).toEqual(['Bosch', 'Bossard', 'Igus'])
    const bosch = rows[0]
    expect(bosch).toMatchObject({ open: 1, ordered: 1, delivered: 3, medianDays: 12, hitRate: 0.5 })
    expect(bosch.openPOs).toEqual([{ id: '2', title: 'Sensor', poNumber: '4711', orderedOn: '2026-09-10', dueDate: '2026-09-30' }])
    expect(rows[1]).toMatchObject({ supplier: 'Bossard', open: 1, medianDays: null, hitRate: null, openPOs: [] })
    expect(rows[2].openPOs[0]).toMatchObject({ poNumber: 'I-1', orderedOn: '2026-09-05', dueDate: '2026-09-25' })
  })
  it('is empty without suppliers', () => { expect(mail.suppliersFrom([], [])).toEqual([]) })
})

describe('run and applyChanges', () => {
  it('is off until Settings says otherwise, then wants the extra token', async () => {
    mail._reset()
    expect(await mail.run()).toMatchObject({ ok: false, reason: 'off' })
    expect(mail.status()).toMatchObject({ on: false, reason: 'off', matched: 0 })
    settings.update({ mailRead: true })
    expect((await mail.run()).reason).toBe('needs-signin')
    account = { username: 'noel@tom.fit' }
    expect((await mail.run()).reason).toBe('needs-admin-consent')
  })
  it('reads the last seven days, sets the dates once and notifies once per change', async () => {
    token = 'tok'
    const a = store.createTask({ title: 'Servo', supplier: 'Bosch', poNumber: '4711' })
    const b = store.createTask({ title: 'Guard', supplier: 'Igus', poNumber: 'I-9', orderedOn: '2026-09-10' })
    const notified = []
    bridge.notify = (n) => notified.push(n)
    const urls = []
    const fetchImpl = async (url) => {
      urls.push(url)
      return { ok: true, json: async () => ({ value: [
        msg({ id: 'm-late', subject: 'Lieferschein I-9', receivedDateTime: '2026-09-22T10:00:00Z' }),
        msg({ id: 'm-early', subject: 'Order confirmation 4711', receivedDateTime: '2026-09-20T10:00:00Z' }),
        msg({ id: 'm-noise', subject: 'Newsletter', receivedDateTime: '2026-09-21T10:00:00Z' })
      ] }) }
    }
    const now = new Date('2026-09-23T08:00:00Z')
    const r = await mail.run({ fetchImpl, now })
    expect(r.ok).toBe(true)
    expect(r.read).toBe(3)
    expect(r.applied.map(c => [c.taskId, c.field, c.value])).toEqual([[a.id, 'orderedOn', '2026-09-20'], [b.id, 'deliveredOn', '2026-09-22']])
    expect(urls[0]).toMatch(/\/me\/messages\?\$top=50&\$select=subject,receivedDateTime,from,bodyPreview&\$orderby=receivedDateTime desc&\$filter=receivedDateTime ge 2026-09-16T08:00:00.000Z/)
    expect(store.allTasks().find(x => x.id === a.id).orderedOn).toBe('2026-09-20')
    expect(store.allTasks().find(x => x.id === b.id).deliveredOn).toBe('2026-09-22')
    expect(notified.map(n => n.body)).toEqual(['Bosch confirmed PO 4711.', 'Igus delivered PO I-9.'])
    // the same messages again: nothing applied, nothing notified
    const again = await mail.run({ fetchImpl, now })
    expect(again.applied).toEqual([])
    expect(notified).toHaveLength(2)
    expect(mail.status()).toMatchObject({ on: true, matched: 2, reason: null, lastRun: now.toISOString() })
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'mail.json'), 'utf8'))
    expect(Object.keys(file.used)).toHaveLength(2)
  })
  it('records a Graph failure as the reason', async () => {
    const r = await mail.run({ fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'Forbidden' }) })
    expect(r.ok).toBe(false)
    expect(mail.status().reason).toMatch(/Graph 403/)
  })
})
