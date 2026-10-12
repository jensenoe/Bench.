import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Workshop mode for Rüsten (roadmap 176): the phone's kit routes behind the PIN, ticks per item through
// kitting.js, finding by part number and name, photos per plan and machine, and the photos in the handover.
// Scratch folders before any server module loads.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-workshop-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const K = await import('../server/kitting.js')
const projects = await import('../server/projects.js')
const phone = await import('../server/phone.js')
const { trimView, kitPage } = await import('../server/phone-kit.js')
const express = (await import('express')).default

const PIN = '2468'
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(64, 7)])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(32, 1)])
let mainServer, phoneServer, mainBase, phoneBase, plan, key

/** Plain http so the bytes and headers are exactly what is sent: { status, headers, json, text, buf }. */
const request = (base, method, p, { headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const u = new URL(base + p)
  const data = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  const req = http.request({ host: u.hostname, port: u.port, method, path: u.pathname + u.search, headers: { ...(data && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(data ? { 'Content-Length': data.length } : {}), ...headers } }, res => {
    const chunks = []
    res.on('data', c => chunks.push(c)); res.on('end', () => { const buf = Buffer.concat(chunks); const text = buf.toString('utf8'); let json = null; try { json = JSON.parse(text) } catch { /* html or bytes */ } resolve({ status: res.statusCode, headers: res.headers, json, text, buf }) })
  })
  req.on('error', reject)
  if (data) req.write(data)
  req.end()
})
const P = { 'bench-pin': PIN }
const ph = (method, p, opts = {}) => request(phoneBase, method, p, opts)
const stored = () => K.docFor(key)

beforeAll(async () => {
  const main = express()
  main.use(express.json({ limit: '1mb' }))
  K.registerRoutes(main)
  mainServer = main.listen(0, '127.0.0.1')
  await new Promise(r => mainServer.once('listening', r))
  mainBase = `http://127.0.0.1:${mainServer.address().port}`
  phoneServer = http.createServer(phone.createApp({ pin: PIN, mainBase, inboxDir: path.join(dir, 'inbox') }))
  await new Promise(r => phoneServer.listen(0, '127.0.0.1', r))
  phoneBase = `http://127.0.0.1:${phoneServer.address().port}`

  plan = projects.create({ name: 'Remote Coach E2E' })
  key = `plan:${plan.id}`
  K.save(key, {
    template: [],
    machines: [
      { id: 'm-30', number: '30', bundle: 2, items: [
        { id: 'i-cable', kind: 'kabel', name: 'USB-C cable 2 m', partNumber: 'TF-100-23', qty: 2 },
        { id: 'i-screw', kind: 'schraube', name: 'Screw M4x12 DIN 912', partNumber: 'S-412' },
        { id: 'i-unit', kind: 'teil', name: 'Remote Coach unit', partNumber: 'RC-1000' },
        { id: 'i-doc', kind: 'doku', name: 'Wiring manual', partNumber: '' }
      ] },
      { id: 'm-52', number: '52', bundle: 6, items: [{ id: 'i-unit2', kind: 'teil', name: 'Remote Coach unit', partNumber: 'RC-1000' }] }
    ]
  })
})
afterAll(async () => {
  await new Promise(r => phoneServer.close(r))
  await new Promise(r => mainServer.close(r))
})

describe('the PIN gate in front of Rüsten', () => {
  it('serves the PIN form at /kit without a PIN and the Rüsten page with one', async () => {
    const form = await ph('GET', '/kit')
    expect(form.status).toBe(200)
    expect(form.text).toMatch(/id="pin"/)
    expect(form.text).not.toMatch(/Part number or name/)
    const page = await ph('GET', '/kit', { headers: P })
    expect(page.text).toMatch(/Part number or name/)
    expect(page.text).toMatch(/function findItems/)
  })
  it('refuses every kit route without the PIN, and with a wrong one', async () => {
    for (const [method, p, body] of [['GET', '/api/kit/jobs'], ['GET', `/api/kit?project=${encodeURIComponent(key)}`], ['GET', `/api/kit/find?project=${encodeURIComponent(key)}&machine=m-30&q=RC`],
      ['POST', '/api/kit/tick', { project: key, machine: 'm-30', item: 'i-unit', field: 'kitted', value: true }], ['POST', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30`, JPEG],
      ['GET', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30&file=x.jpg`]]) {
      expect((await ph(method, p, { body: body ?? null, headers: Buffer.isBuffer(body) ? { 'Content-Type': 'image/jpeg' } : {} })).status, `${method} ${p}`).toBe(401)
    }
    expect((await ph('GET', '/api/kit/jobs', { headers: { 'bench-pin': '1357' } })).status).toBe(401)
    expect(stored().machines[0].items.every(i => !i.kitted)).toBe(true)
    expect(stored().machines[0].photos).toEqual([])
  })
  it('lists the open job, and the kit without its template', async () => {
    const jobs = await ph('GET', '/api/kit/jobs', { headers: P })
    expect(jobs.json.jobs).toEqual([expect.objectContaining({ key, name: 'Remote Coach E2E', machines: 2, complete: 0, total: 5 })])
    const kit = await ph('GET', `/api/kit?project=${encodeURIComponent(key)}`, { headers: P })
    expect(kit.json.machines.map(m => m.number)).toEqual(['000 030', '000 052'])
    expect(kit.json).not.toHaveProperty('template')
    expect(kit.json.machines[0].photos).toEqual([])
    expect((await ph('GET', '/api/kit?project=../../etc', { headers: P })).status).toBe(400)
  })
})

describe('ticks go through kitting.js and keep the other items', () => {
  it('ticks one item and leaves what the desktop ticked meanwhile', async () => {
    // the phone loaded the kit; then the desktop ticks the cable as checked
    await ph('GET', `/api/kit?project=${encodeURIComponent(key)}`, { headers: P })
    K.tick(key, { machine: 'm-30', item: 'i-cable', checked: true })
    const r = await ph('POST', '/api/kit/tick', { headers: P, body: { project: key, machine: 'm-30', item: 'i-unit', field: 'kitted', value: true } })
    expect(r.status).toBe(200)
    expect(r.json.item).toMatchObject({ id: 'i-unit', kitted: true, checked: false })
    expect(r.json.machine).toMatchObject({ id: 'm-30', kitted: 1, checked: 1, total: 4 })
    const items = stored().machines[0].items
    expect(items.find(i => i.id === 'i-cable')).toMatchObject({ checked: true, kitted: false })
    expect(items.find(i => i.id === 'i-unit')).toMatchObject({ kitted: true })
    expect(stored().machines[1].items[0].kitted).toBe(false)
  })
  it('lets the last tick on an item win, and validates every input', async () => {
    await ph('POST', '/api/kit/tick', { headers: P, body: { project: key, machine: 'm-30', item: 'i-unit', field: 'kitted', value: false } })
    expect(stored().machines[0].items.find(i => i.id === 'i-unit').kitted).toBe(false)
    const bad = [
      [{ project: key, machine: 'm-30', item: 'i-unit', field: 'name', value: true }, 400],
      [{ project: key, machine: 'm-30', item: 'i-unit', field: 'kitted', value: 'yes' }, 400],
      [{ project: 'nonsense', machine: 'm-30', item: 'i-unit', field: 'kitted', value: true }, 400],
      [{ project: key, machine: '../m', item: 'i-unit', field: 'kitted', value: true }, 400],
      [{ project: key, machine: 'm-30', item: 'gone', field: 'kitted', value: true }, 404],
      [{ project: key, machine: 'm-99', item: 'i-unit', field: 'kitted', value: true }, 404],
      [{ project: key, machine: 'm-30', item: 'i-doc', field: 'stockUpdated', value: true }, 400],
      [{ project: 'plan:no-such-plan', machine: 'm-30', item: 'i-unit', field: 'kitted', value: true }, 404]
    ]
    for (const [body, status] of bad) expect((await ph('POST', '/api/kit/tick', { headers: P, body })).status, JSON.stringify(body)).toBe(status)
  })
  it('a whole-document save with keep=ticks cannot untick what the phone ticked', async () => {
    const stale = stored()   // what the desktop loaded
    await ph('POST', '/api/kit/tick', { headers: P, body: { project: key, machine: 'm-30', item: 'i-screw', field: 'kitted', value: true } })
    stale.machines[0].label = 'showcase'
    const r = await fetch(`${mainBase}/api/kitting?project=${encodeURIComponent(key)}&keep=ticks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stale) })
    expect(r.status).toBe(200)
    const m = stored().machines[0]
    expect(m.label).toBe('showcase')
    expect(m.items.find(i => i.id === 'i-screw').kitted).toBe(true)
    expect(m.items.find(i => i.id === 'i-cable').checked).toBe(true)
  })
})

describe('find by scan or by typing', () => {
  const items = [
    { id: 'a', name: 'USB-C cable 2 m', partNumber: 'TF-100-23' },
    { id: 'b', name: 'Remote Coach unit', partNumber: 'RC-1000' },
    { id: 'c', name: 'Remote Coach mount', partNumber: 'RC-10007' },
    { id: 'd', name: 'Kabelbinder schwarz', partNumber: '' }
  ]
  it('finds by part number first, ignoring spaces, dashes and case', () => {
    expect(K.findItems(items, 'tf10023').map(i => i.id)).toEqual(['a'])
    expect(K.findItems(items, 'TF 100-23').map(i => i.id)).toEqual(['a'])
    expect(K.findItems(items, 'RC-1000').map(i => i.id)).toEqual(['b', 'c'])   // exact first, then the longer one
    expect(K.findItems(items, '0007').map(i => i.id)).toEqual(['c'])
  })
  it('finds by every word of the name, with umlauts folded, and nothing for an empty query', () => {
    expect(K.findItems(items, 'coach unit').map(i => i.id)).toEqual(['b'])
    expect(K.findItems(items, 'remote').map(i => i.id)).toEqual(['b', 'c'])
    expect(K.findItems(items, 'kabelbinder').map(i => i.id)).toEqual(['d'])
    expect(K.findItems([{ id: 'u', name: 'Kühlkörper' }], 'kuhlkorper').map(i => i.id)).toEqual(['u'])
    expect(K.findItems(items, '   ')).toEqual([])
    expect(K.findItems(items, 'nothing like it')).toEqual([])
  })
  it('the phone finds on a machine through the same function', async () => {
    const r = await ph('GET', `/api/kit/find?project=${encodeURIComponent(key)}&machine=m-30&q=${encodeURIComponent('s 412')}`, { headers: P })
    expect(r.json.items.map(i => i.id)).toEqual(['i-screw'])
    const byName = await ph('GET', `/api/kit/find?project=${encodeURIComponent(key)}&machine=m-30&q=manual`, { headers: P })
    expect(byName.json.items.map(i => i.id)).toEqual(['i-doc'])
  })
  it('names the next open item, wrapping round', () => {
    const list = [{ id: '1', done: true }, { id: '2', done: false }, { id: '3', done: true }, { id: '4', done: false }]
    const isDone = i => i.done
    expect(K.nextOpen(list, null, isDone).id).toBe('2')
    expect(K.nextOpen(list, '2', isDone).id).toBe('4')
    expect(K.nextOpen(list, '4', isDone).id).toBe('2')
    expect(K.nextOpen(list.map(i => ({ ...i, done: true })), '1', isDone)).toBeNull()
  })
})

describe('photos per plan and machine', () => {
  let first
  it('stores the bytes in the shared folder under a name the server makes, and the reference on the machine', async () => {
    const r = await ph('POST', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30&item=i-cable&caption=${encodeURIComponent('Cable <b>routed</b> left')}`, { headers: { ...P, 'Content-Type': 'image/jpeg' }, body: JPEG })
    expect(r.status).toBe(200)
    first = r.json.photo
    expect(first).toMatchObject({ itemId: 'i-cable', caption: 'Cable <b>routed</b> left' })
    expect(first.file).toMatch(/^000-030-\d{8}-\d{6}-[0-9a-f]{8}\.jpg$/)
    const file = path.join(dir, 'kitting-photos', `plan-${plan.id}`, 'm-30', first.file)
    expect(fs.readFileSync(file)).toEqual(JPEG)
    expect(stored().machines[0].photos).toEqual([first])
    expect(stored().machines[1].photos).toEqual([])
    // the JSON holds the reference, never the picture
    expect(fs.readFileSync(path.join(dir, 'kitting.json'), 'utf8')).not.toMatch(/\/9j\/|base64/)
  })
  it('takes the reduced copy for the handover and serves both back through the gate', async () => {
    const s = await ph('POST', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30&photo=${first.id}&rendition=small`, { headers: { ...P, 'Content-Type': 'image/png' }, body: PNG })
    expect(s.status).toBe(200)
    expect(s.json.photo.small).toBe(first.file.replace('.jpg', '-small.png'))
    const big = await ph('GET', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30&file=${first.file}`, { headers: P })
    expect(big.status).toBe(200)
    expect(big.headers['content-type']).toMatch(/image\/jpeg/)
    expect(big.buf).toEqual(JPEG)
    expect((await ph('GET', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30&file=${s.json.photo.small}`, { headers: P })).buf).toEqual(PNG)
  })
  it('refuses what is not a picture, an empty body, a big one, and names that climb out', async () => {
    const up = (q, body, type = 'image/jpeg') => ph('POST', `/api/kit/photo?project=${encodeURIComponent(key)}&${q}`, { headers: { ...P, 'Content-Type': type }, body })
    expect((await up('machine=m-30', Buffer.from('<script>alert(1)</script> not an image'), 'image/jpeg')).status).toBe(415)
    expect((await up('machine=m-30', Buffer.alloc(0))).status).toBe(400)
    expect((await up('machine=m-30', Buffer.concat([JPEG, Buffer.alloc(12 * 1024 * 1024)]))).status).toBe(413)
    expect((await up('machine=..%2F..%2Fx', JPEG)).status).toBe(400)
    expect((await up('machine=m-30&item=nope', JPEG)).status).toBe(404)
    expect((await up('machine=m-30&item=..%2Fx', JPEG)).status).toBe(400)
    for (const file of ['..%2F..%2Fkitting.json', 'kitting.json', '..%5Cx.jpg', `${first.file}%00.jpg`, 'other-20261012-101500-00000000.jpg']) {
      expect([400, 404], file).toContain((await ph('GET', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-30&file=${file}`, { headers: P })).status)
    }
    // the main app checks the same, for the desktop
    expect(() => K.photoDir(key, '../../x')).toThrow(/Which machine/)
    expect(() => K.photoFile(key, 'm-30', '../kitting.json')).toThrow(/Which picture/)
    expect(stored().machines[0].photos).toHaveLength(1)
  })
  it('holds at most 40 photos on a machine', async () => {
    for (let i = stored().machines[1].photos.length; i < K.MAX.photos; i++) K.addPhoto(key, 'm-52', JPEG)
    expect(stored().machines[1].photos).toHaveLength(40)
    const r = await ph('POST', `/api/kit/photo?project=${encodeURIComponent(key)}&machine=m-52`, { headers: { ...P, 'Content-Type': 'image/jpeg' }, body: JPEG })
    expect(r.status).toBe(409)
    expect(fs.readdirSync(path.join(dir, 'kitting-photos', `plan-${plan.id}`, 'm-52'))).toHaveLength(40)
  })
  it('a whole-document save neither drops nor forges photos', async () => {
    const doc = stored()
    doc.machines[0].photos = [{ id: 'forged', file: 'forged.jpg' }]
    doc.machines[1].photos = []
    K.save(key, doc)
    expect(stored().machines[0].photos.map(p => p.id)).toEqual([first.id])
    expect(stored().machines[1].photos).toHaveLength(40)
  })
  it('keeps old documents valid: no photos field reads as none, bad references are dropped', () => {
    const m = K.cleanMachine({ number: '7', items: [{ name: 'Unit' }] })
    expect(m.photos).toEqual([])
    const photos = K.cleanPhotos([{ id: 'p1', file: 'a.jpg', at: '2026-10-12T08:00:00Z', caption: '  Left   side ', itemId: 'i-1', small: 'a-small.jpg' }, { file: '../x.jpg' }, { file: 'a.jpg' }, { file: 'b.gif' }, null, { id: 'bad id', file: 'c.png', at: 'never' }])
    expect(photos).toHaveLength(2)
    expect(photos[0]).toEqual({ id: 'p1', file: 'a.jpg', at: '2026-10-12T08:00:00.000Z', caption: 'Left side', itemId: 'i-1', small: 'a-small.jpg' })
    expect(photos[1]).toMatchObject({ file: 'c.png', at: null })
    expect(photos[1].id).not.toBe('bad id')
    expect(K.cleanPhotos(Array.from({ length: 60 }, (_, i) => ({ file: `p${i}.jpg` })))).toHaveLength(40)
  })
  it('changes a caption and removes a photo with its files on the desktop', () => {
    const p = stored().machines[1].photos[0]
    expect(K.editPhoto(key, 'm-52', p.id, { caption: 'Front' }).photo.caption).toBe('Front')
    K.editPhoto(key, 'm-52', p.id, { remove: true })
    expect(stored().machines[1].photos).toHaveLength(39)
    expect(fs.existsSync(path.join(dir, 'kitting-photos', `plan-${plan.id}`, 'm-52', p.file))).toBe(false)
  })
})

describe('the handover carries the photos', () => {
  it('shows each machine\'s photos as a grid with escaped captions, the reduced copy first', async () => {
    const html = await (await fetch(`${mainBase}/api/report/handover/${encodeURIComponent(key)}`)).text()
    const p = stored().machines[0].photos[0]
    expect(html).toContain('<h3>Photos (1)</h3>')
    expect(html).toContain(`src="/api/kitting/photo?project=${encodeURIComponent(key)}&amp;machine=m-30&amp;file=${p.small}"`)
    expect(html).toContain('Cable &lt;b&gt;routed&lt;/b&gt; left')
    expect(html).not.toContain('<b>routed</b>')
    expect(html).toContain('<span>USB-C cable 2 m, ')
    // the img route the report names answers on the main server, as the print window will ask it
    const img = await fetch(`${mainBase}/api/kitting/photo?project=${encodeURIComponent(key)}&machine=m-30&file=${p.small}`)
    expect(img.status).toBe(200)
    expect(Buffer.from(await img.arrayBuffer())).toEqual(PNG)
  })
  it('escapes a hostile caption and a hostile source in the pure report', () => {
    const html = K.kittingReportHtml({ project: 'plan:x', machines: [{ id: 'm', number: '1', items: [{ name: 'Unit' }], photos: [{ id: 'p', file: 'a.jpg', caption: '"><script>alert(1)</script>' }] }] },
      { photoSrc: () => 'x" onerror="alert(1)' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).toContain('src="x&quot; onerror=&quot;alert(1)"')
  })
  it('the phone view trims the kit to what the page needs', () => {
    const v = trimView({ plan: { key: 'plan:x', name: 'X' }, complete: false, doc: { updatedAt: 't', template: [{ name: 'T' }], machines: [{ id: 'm', number: '1', items: [{ id: 'i', kind: 'teil', name: 'Unit', qty: 1, kitted: true, tpl: 'x' }], photos: [] }] } })
    expect(v).toEqual({ key: 'plan:x', name: 'X', updatedAt: 't', complete: false, machines: [{ id: 'm', number: '1', bundle: null, label: '', presentedOn: null, handedOverOn: null, items: [{ id: 'i', kind: 'teil', name: 'Unit', partNumber: '', qty: 1, unit: '', note: '', kitted: true, checked: false, stockUpdated: false }], photos: [] }] })
    expect(kitPage({ head: (css, t) => `<head><title>${t}</title></head>`, css: '' })).toMatch(/<title>Rüsten\. Bench\.<\/title>/)
  })
})
