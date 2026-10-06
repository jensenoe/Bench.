import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch folders before any server module loads: a static import would write into the repo's ./data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-kitting-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const K = await import('../server/kitting.js')
const projects = await import('../server/projects.js')
const settings = await import('../server/settings.js')
const store = await import('../server/store.js')
const { bridge } = await import('../server/bridge.js')
const express = (await import('express')).default
const { esc, fmt } = await import('../server/report.js')

const item = (name, kind = 'teil', extra = {}) => ({ id: `i-${name.replace(/\W+/g, '-')}`, kind, name, qty: 1, ...extra })
const done = (name, kind = 'teil', extra = {}) => item(name, kind, { kitted: true, checked: true, stockUpdated: true, ...extra })

describe('cleaning and clamping', () => {
  it('normalises machine numbers and bundles', () => {
    expect(['30', '000030', '000 030', ' 0 0 0 0 3 0 '].map(K.normNumber)).toEqual(['000 030', '000 030', '000 030', '000 030'])
    expect(K.normNumber('RC-proto A')).toBe('RC-proto A')
    expect(K.normNumber('   ')).toBe('')
    expect([1, '6', 'Bundle 3', 'b8', 0, 9, 'x', null, ''].map(K.normBundle)).toEqual([1, 6, 3, 8, null, null, null, null, null])
  })
  it('cleans items: kinds, quantities, flags, caps; drops nameless ones', () => {
    const it = K.cleanItem({ id: 'bad id!', kind: 'gizmo', name: '  M4x12   screw ', qty: '8,5', kitted: 'yes', checked: true, stockUpdated: 1, link: 'x'.repeat(2000), partNumber: 'p'.repeat(200) })
    expect(it.kind).toBe('teil')
    expect(it.name).toBe('M4x12 screw')
    expect(it.qty).toBe(8.5)
    expect([it.kitted, it.checked, it.stockUpdated]).toEqual([false, true, false])
    expect(it.id).not.toBe('bad id!')
    expect(it.link).toHaveLength(K.MAX.link)
    expect(it.partNumber).toHaveLength(K.MAX.partNumber)
    expect(K.cleanItem({ name: '   ' })).toBeNull()
    expect(K.cleanItem({ name: 'x', qty: -3 }).qty).toBe(1)
    expect(K.cleanItem({ name: 'x', qty: 1e9 }).qty).toBe(K.MAX.qty)
  })
  it('clamps to 60 machines and 300 items, drops duplicate numbers and machines without one', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ name: `Part ${i}` }))
    const machines = [{ number: '30', items: many }, { number: '000 030' }, { number: '' }, ...Array.from({ length: 80 }, (_, i) => ({ number: String(100 + i), bundle: 99 }))]
    const d = K.cleanDoc({ machines, template: many }, 'plan:x')
    expect(d.machines).toHaveLength(60)
    expect(d.machines[0].number).toBe('000 030')
    expect(d.machines[0].items).toHaveLength(300)
    expect(d.template).toHaveLength(300)
    expect(d.machines[1].number).toBe('000 100')
    expect(d.machines[1].bundle).toBeNull()
    expect(new Set(d.machines.map(m => m.id)).size).toBe(60)
    expect(K.cleanDoc('nonsense').machines).toEqual([])
  })
  it('keeps dates only when they are real days', () => {
    const m = K.cleanMachine({ number: '31', presentedOn: '2026-10-02', handedOverOn: '2026-02-30' })
    expect(m.presentedOn).toBe('2026-10-02')
    expect(m.handedOverOn).toBeNull()
  })
  it('reads a pasted list', () => {
    expect(K.parsePaste('000 030, Bundle 2\n000031; 2\n\n000 052 B6\n000 053\tbundle 6\n33\nBundle 4\n')).toEqual([
      { number: '000 030', bundle: 2 }, { number: '000 031', bundle: 2 }, { number: '000 052', bundle: 6 }, { number: '000 053', bundle: 6 }, { number: '000 033', bundle: null }
    ])
  })
})

describe('the template', () => {
  const template = [item('Remote Coach unit'), item('USB-C cable 2 m', 'kabel'), item('M4x12', 'schraube', { qty: 8 })]
  it('adds only what is missing, never removes or unticks', () => {
    const doc = {
      template,
      machines: [
        { id: 'a', number: '000 030', items: [{ ...done('Remote Coach unit'), tpl: template[0].id }, done('Own extra', 'doku')] },
        { id: 'b', number: '000 031', items: [] }
      ]
    }
    const { doc: next, added } = K.applyTemplate(doc)
    expect(added).toBe(5)
    const a = next.machines[0].items
    expect(a.map(i => i.name)).toEqual(['Remote Coach unit', 'Own extra', 'USB-C cable 2 m', 'M4x12'])
    expect(a.slice(0, 2).every(i => i.kitted && i.checked)).toBe(true)
    expect(a.slice(2).every(i => !i.kitted && !i.checked && !i.stockUpdated)).toBe(true)
    expect(a[3].qty).toBe(8)
    expect(a[2].tpl).toBe(template[1].id)
    expect(next.machines[1].items.map(i => i.tpl)).toEqual(template.map(t => t.id))
    // a second apply adds nothing
    expect(K.applyTemplate(next).added).toBe(0)
    // a renamed template item is still the same one by its link
    const renamed = { ...next, template: [{ ...template[0], name: 'Remote Coach' }, ...template.slice(1)] }
    expect(K.applyTemplate(renamed).added).toBe(0)
  })
  it('matches by kind, name and part number when there is no link, accents and case ignored', () => {
    const r = K.mergeItems([item('Displäy', 'teil', { partNumber: 'TF-1' })], [item('DISPLAY', 'teil', { partNumber: 'tf-1' }), item('Display', 'doku'), item('Display', 'teil', { partNumber: 'TF-2' })])
    expect(r.added).toBe(2)
    expect(r.items.map(i => [i.kind, i.partNumber])).toEqual([['teil', 'TF-1'], ['doku', ''], ['teil', 'TF-2']])
    // an item without a part number is the same as the named one with it
    expect(K.mergeItems([item('CAT6 cable', 'kabel')], [item('CAT6 cable', 'kabel', { partNumber: 'K-6' })]).added).toBe(0)
  })
})

describe('progress', () => {
  const m = { id: 'm', number: '000 030', items: [done('Unit'), done('Schematic', 'schema', { stockUpdated: false }), item('Cable', 'kabel', { kitted: true, checked: true }), item('Bracket', 'teil', { kitted: true })] }
  it('counts kitted, checked and stock for one machine', () => {
    expect(K.progress(m)).toEqual({ total: 4, kitted: 4, checked: 3, stockNeeded: 3, stock: 1, open: 2, complete: false })
    expect(K.progress({ items: [done('Unit'), done('Doc', 'doku', { stockUpdated: false })] }).complete).toBe(true)
    expect(K.progress({ items: [] }).complete).toBe(false)
    expect(K.progress(null)).toMatchObject({ total: 0, complete: false })
  })
  it('sums a plan', () => {
    const p = K.planProgress({ machines: [m, { id: 'n', number: '000 031', bundle: 6, presentedOn: '2026-10-05', items: [done('Unit')] }] })
    expect(p.machines.map(x => [x.number, x.complete])).toEqual([['000 030', false], ['000 031', true]])
    expect(p.overall).toMatchObject({ machines: 2, complete: 1, total: 5, kitted: 5, checked: 4, stockNeeded: 4, stock: 2, open: 2, presented: 1, handedOver: 0 })
  })
  it('kitCompleteDoc: null without machines, false with one open, true when all are complete', () => {
    expect(K.kitCompleteDoc({ machines: [] })).toBeNull()
    expect(K.kitCompleteDoc({})).toBeNull()
    expect(K.kitCompleteDoc(null)).toBeNull()
    expect(K.kitCompleteDoc({ machines: [m] })).toBe(false)
    expect(K.kitCompleteDoc({ machines: [{ number: '1', items: [] }] })).toBe(false)
    expect(K.kitCompleteDoc({ machines: [{ number: '1', items: [done('Unit')] }, { number: '2', items: [done('Screw', 'schraube')] }] })).toBe(true)
  })
  it('bundleCheck wants a presented machine from Bundle 1 to 5 and one from Bundle 6', () => {
    const base = [{ number: '000 030', bundle: 2 }, { number: '000 052', bundle: 6 }, { number: '000 070', bundle: 7, presentedOn: '2026-10-01' }]
    expect(K.bundleCheck({ machines: base })).toEqual({ ok: false, bundle1to5: [], bundle6: [] })
    const one = base.map(x => x.bundle === 2 ? { ...x, presentedOn: '2026-10-02' } : x)
    expect(K.bundleCheck({ machines: one })).toEqual({ ok: false, bundle1to5: ['000 030'], bundle6: [] })
    const both = one.map(x => x.bundle === 6 ? { ...x, presentedOn: '2026-10-03' } : x)
    expect(K.bundleCheck({ machines: both })).toEqual({ ok: true, bundle1to5: ['000 030'], bundle6: ['000 052'] })
    expect(K.bundleCheck(null).ok).toBe(false)
  })
})

describe('itemsFromBom', () => {
  const tree = {
    id: 7, name: 'Remote Coach 000 030',
    children: [
      { id: 10, name: 'Head assembly', full_number: 'RC-100', is_branch: true, children: [
        { id: 11, name: 'Display 10 inch', full_number: 'RC-101', revision: 'B', quantity: 1, drawing_links: [{ url: 'https://drawings.example/RC-101.pdf' }], critical: true },
        { id: 12, name: 'USB-C cable 2 m', part_number: 'CAB-USBC-2', qty: 2 },
        { id: 13, name: 'Screw M4x12 ISO 4762', full_number: 'DIN-912-M4x12', menge: '8' },
        { id: 14, name: 'Sub bracket', full_number: 'RC-110', is_branch: true, children: [
          { id: 15, name: 'Screw M4x12 ISO 4762', full_number: 'DIN-912-M4x12', quantity: 4 },
          { id: 16, name: 'Cable ties 200 mm', full_number: 'CT-200', quantity: 10, unit: 'pcs' }
        ] },
        { id: 17, name: 'Empty branch', is_branch: true, children: [] }
      ] },
      { id: 20, name: 'Base frame', full_number: 'RC-200', children: [{ id: 21, name: 'Leveling foot', full_number: 'RC-201', quantity: 4 }] }
    ]
  }
  it('maps the parts under a node, sums repeated part numbers, guesses kinds', () => {
    const items = K.itemsFromBom(tree, 10)
    expect(items.map(i => [i.name, i.kind, i.partNumber, i.qty])).toEqual([
      ['Display 10 inch', 'teil', 'RC-101', 1],
      ['USB-C cable 2 m', 'kabel', 'CAB-USBC-2', 2],
      ['Screw M4x12 ISO 4762', 'schraube', 'DIN-912-M4x12', 12],
      ['Cable ties 200 mm', 'teil', 'CT-200', 10]
    ])
    expect(items[0]).toMatchObject({ id: 'bom-11', bom: '11', link: 'https://drawings.example/RC-101.pdf', note: 'Rev B, critical', kitted: false, checked: false, stockUpdated: false })
    expect(items[3].unit).toBe('pcs')
  })
  it('takes the whole tree without a root, a flat list through parent_id, and nothing for an unknown node', () => {
    expect(K.itemsFromBom(tree).map(i => i.partNumber)).toEqual(['RC-101', 'CAB-USBC-2', 'DIN-912-M4x12', 'CT-200', 'RC-201'])
    const flat = [
      { id: 'a', name: 'Arm', is_branch: true, parent_id: null },
      { id: 'b', name: 'Motor', full_number: 'M-1', parent_id: 'a' },
      { id: 'c', name: 'Motor cable', full_number: 'K-1', parent_id: 'a', drawing_links: ['\\\\srv\\drawings\\K-1.pdf'] },
      { id: 'd', name: 'Elsewhere', full_number: 'X-1', parent_id: 'z' }
    ]
    expect(K.itemsFromBom(flat, 'a').map(i => [i.name, i.kind, i.link])).toEqual([['Motor', 'teil', ''], ['Motor cable', 'kabel', '\\\\srv\\drawings\\K-1.pdf']])
    expect(K.itemsFromBom(tree, 999)).toEqual([])
    expect(K.itemsFromBom(null)).toEqual([])
  })
  it('a second fill adds nothing', () => {
    const first = K.itemsFromBom(tree, 10)
    expect(K.mergeItems(first.map(i => ({ ...i, kitted: true })), K.itemsFromBom(tree, 10)).added).toBe(0)
  })
  it('lists the assemblies to pick from', () => {
    expect(K.bomBranches(tree).map(b => [b.id, b.depth, b.parts])).toEqual([['10', 0, 4], ['14', 1, 2], ['20', 0, 1]])
  })
})

describe('the handover report', () => {
  const doc = {
    project: 'plan:p1',
    machines: [
      { id: 'a', number: '000 030', bundle: 2, label: 'Show <unit>', presentedOn: '2026-10-02', notes: 'Fan "rattles" & hums', items: [
        done('Remote Coach unit', 'teil', { partNumber: 'RC-1' }),
        item('USB-C <b>cable</b>', 'kabel', { kitted: true, link: 'https://x.example/?a=1&b=<2>' }),
        done('Wiring schematic', 'schema', { stockUpdated: false, link: '\\\\srv\\schema.pdf' })
      ] },
      { id: 'b', number: '000 052', bundle: 6, items: [done('Remote Coach unit')] },
      { id: 'c', number: '000 053', bundle: 6, items: [] }
    ]
  }
  const html = K.kittingReportHtml(doc, { esc, fmt, today: '2026-10-06', title: 'Remote Coach <rüsten>', author: 'Noël Jensen' })
  it('escapes everything that came from a person', () => {
    expect(html).toContain('Übergabe an den Service: Remote Coach &lt;rüsten&gt;')
    expect(html).toContain('USB-C &lt;b&gt;cable&lt;/b&gt;')
    expect(html).toContain('Show &lt;unit&gt;')
    expect(html).toContain('Fan &quot;rattles&quot; &amp; hums')
    expect(html).toContain('https://x.example/?a=1&amp;b=&lt;2&gt;')
    expect(html).not.toContain('<b>cable')
    expect(html).not.toContain('<rüsten>')
    expect(html).not.toContain('<script')
  })
  it('one section per machine, a page break before every one after the first', () => {
    expect(html.match(/<section class="machine">/g)).toHaveLength(3)
    expect(html).toContain('.machine + .machine { break-before: page;')
    expect(html).toContain('<h2>Machine 000 030</h2>')
    expect(html).toContain('6 Oct 2026')
    expect(html).toContain('Prepared by Noël Jensen')
  })
  it('writes links out, marks the open points and the presentation', () => {
    expect(html).toContain('<p class="link">\\\\srv\\schema.pdf</p>')
    expect(html).toContain('USB-C &lt;b&gt;cable&lt;/b&gt;: not checked, stock not updated.')
    expect(html).toContain('No items on this machine yet.')
    expect(html).toContain('Presented from Bundle 1 to 5: 000 030. From Bundle 6: <span class="late">none yet</span>.')
    expect(K.kittingReportHtml(doc, { print: true })).toContain('print()')
  })
})

describe('routes', () => {
  let server, base, plan
  beforeAll(async () => {
    settings.update({ name: 'Noël Jensen' })
    plan = projects.create({ name: 'Remote Coach rüsten' })
    store.createTask({ title: 'Untouched task' })
    const app = express()
    app.use(express.json({ limit: '2mb' }))
    K.registerRoutes(app)
    server = app.listen(0, '127.0.0.1')
    await new Promise(r => server.once('listening', r))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(() => new Promise(r => server.close(r)))
  const send = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  it('answers an empty kit, saves a cleaned one, applies the template', async () => {
    const key = encodeURIComponent(`plan:${plan.id}`)
    const empty = await (await fetch(`${base}/api/kitting?project=${key}`)).json()
    expect(empty).toMatchObject({ doc: { template: [], machines: [] }, complete: null, bundles: { ok: false }, plan: { name: 'Remote Coach rüsten' } })
    const put = await send(`${base}/api/kitting?project=${key}`, 'PUT', {
      template: [{ name: 'Remote Coach unit' }, { name: 'CAT6 cable', kind: 'kabel' }],
      machines: [{ number: '30', bundle: '2', items: [{ name: 'Remote Coach unit', kitted: true }] }, { number: '000 052', bundle: 6 }, { number: '000 030' }]
    })
    expect(put.status).toBe(200)
    const saved = await put.json()
    expect(saved.doc.machines.map(m => [m.number, m.bundle])).toEqual([['000 030', 2], ['000 052', 6]])
    expect(saved.doc.by).toBe('Noël Jensen')
    const applied = await (await send(`${base}/api/kitting/apply-template?project=${key}`, 'POST')).json()
    expect(applied.added).toBe(3)
    expect(applied.doc.machines[0].items.map(i => [i.name, i.kitted])).toEqual([['Remote Coach unit', true], ['CAT6 cable', false]])
    expect(applied.complete).toBe(false)
    expect((await (await send(`${base}/api/kitting/apply-template?project=${key}`, 'POST')).json()).added).toBe(0)
    expect(store.allTasks().map(t => t.title)).toEqual(['Untouched task'])
  })
  it('refuses a bad key, a gone plan and a body that is not a kit', async () => {
    expect((await fetch(`${base}/api/kitting?project=nothing`)).status).toBe(400)
    expect((await fetch(`${base}/api/kitting?project=plan:gone`)).status).toBe(404)
    expect((await send(`${base}/api/kitting?project=plan:${plan.id}`, 'PUT', [1, 2])).status).toBe(400)
  })
  it('says the BOM needs the desktop app when there is no session', async () => {
    expect(bridge.desktop).toBe(false)
    const machineId = (await (await fetch(`${base}/api/kitting?project=plan:${plan.id}`)).json()).doc.machines[0].id
    const r = await send(`${base}/api/kitting/from-bom?project=plan:${plan.id}&machine=${machineId}`, 'POST', { bomMachine: '12', rootId: '10' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/^Needs the desktop app/)
    expect((await fetch(`${base}/api/kitting/bom`)).status).toBe(409)
    expect((await send(`${base}/api/kitting/from-bom?project=plan:${plan.id}&machine=nope`, 'POST', { bomMachine: '12' })).status).toBe(404)
  })
  it('fills from the BOM through the desktop session', async () => {
    const tree = { id: 1, name: 'RC', children: [{ id: 2, name: 'Head', is_branch: true, children: [{ id: 3, name: 'Display', full_number: 'RC-101' }, { id: 4, name: 'CAT6 cable', full_number: 'K-6' }] }] }
    const saved = { desktop: bridge.desktop, fetchWithSession: bridge.fetchWithSession }
    bridge.desktop = true
    bridge.fetchWithSession = async url => url.endsWith('/api/machine/12')
      ? { ok: true, status: 200, json: async () => tree }
      : { ok: true, status: 200, url, text: async () => '<a href="/machine/12">RC</a>' }
    try {
      const view = await (await fetch(`${base}/api/kitting?project=plan:${plan.id}`)).json()
      const m = view.doc.machines[1]
      const r = await (await send(`${base}/api/kitting/from-bom?project=plan:${plan.id}&machine=${m.id}`, 'POST', { bomMachine: '12', rootId: '2' })).json()
      expect(r.added).toBe(1)   // the CAT6 cable came from the template already
      expect(r.doc.machines[1].items.map(i => i.name)).toEqual(['Remote Coach unit', 'CAT6 cable', 'Display'])
      const list = await (await fetch(`${base}/api/kitting/bom`)).json()
      expect(list.machines).toEqual([{ id: '12', name: 'RC' }])
      const branches = await (await fetch(`${base}/api/kitting/bom?machine=12`)).json()
      expect(branches.branches).toEqual([{ id: '2', label: 'Head', depth: 0, parts: 2 }])
    } finally { Object.assign(bridge, saved) }
  })
  it('serves the handover report on both routes', async () => {
    const key = `plan:${plan.id}`
    const a = await fetch(`${base}/api/report/handover?project=${encodeURIComponent(key)}`)
    expect(a.status).toBe(200)
    expect(a.headers.get('content-type')).toMatch(/html/)
    const text = await a.text()
    expect(text).toContain('Übergabe an den Service: Remote Coach rüsten')
    expect(text).toContain('<h2>Machine 000 052</h2>')
    const b = await (await fetch(`${base}/api/report/handover/${encodeURIComponent(key)}?print=1`)).text()
    expect(b).toContain('print()')
    expect((await fetch(`${base}/api/report/handover?project=nothing`)).status).toBe(400)
  })
  it('kitComplete(plan) loads the kit synchronously for the gate', () => {
    expect(K.kitComplete(plan)).toBe(false)
    expect(K.kitComplete(`plan:${plan.id}`)).toBe(false)
    expect(K.kitComplete({ id: 'no-such-plan', name: 'Nothing stored' })).toBeNull()
    expect(K.kitComplete('plan:no-such-plan')).toBeNull()
    expect(K.kitComplete(null)).toBeNull()
    expect(K.kitComplete('nonsense')).toBeNull()
    expect(K.kitComplete({ name: 'no id' })).toBeNull()
    const other = projects.create({ name: 'Empty kit' })
    K.save(`plan:${other.id}`, { template: [{ name: 'Unit' }], machines: [] })
    expect(K.kitComplete(other)).toBeNull()
    K.save(`plan:${other.id}`, { machines: [{ number: '1', items: [{ name: 'Unit', kitted: true, checked: true, stockUpdated: true }, { name: 'Manual', kind: 'doku', kitted: true, checked: true }] }] })
    expect(K.kitComplete(other)).toBe(true)
    expect(K.kitComplete({ ...other, kind: 'paket', machine: 'Remote Coach' })).toBe(true)
    // a kit document works too
    expect(K.kitComplete({ machines: [{ number: '2', items: [] }] })).toBe(false)
  })
  it('stores the kit in the shared folder as kitting.json', () => {
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'kitting.json'), 'utf8'))
    expect(file.items.map(x => x.id)).toContain(`plan:${plan.id}`)
    expect(file.items.every(x => /^plan:/.test(x.id) && Array.isArray(x.machines))).toBe(true)
  })
})
