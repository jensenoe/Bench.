import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch folders before any server module loads: a static import would write into the repo's ./data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-raidd-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const R = await import('../server/raidd.js')
const notes = await import('../server/notes.js')
const settings = await import('../server/settings.js')
const projects = await import('../server/projects.js')
const store = await import('../server/store.js')
const express = (await import('express')).default
const { esc, fmt } = await import('../server/report.js')

const TODAY = '2026-10-06'

describe('levels and scores', () => {
  it('maps likelihood times impact onto four levels', () => {
    expect([1, 2, 3, 4].map(R.riskLevel)).toEqual(['low', 'low', 'low', 'low'])
    expect([5, 6, 8, 9].map(R.riskLevel)).toEqual(['medium', 'medium', 'medium', 'medium'])
    expect([10, 12, 15, 16].map(R.riskLevel)).toEqual(['high', 'high', 'high', 'high'])
    expect([20, 25].map(R.riskLevel)).toEqual(['critical', 'critical'])
    expect(R.riskLevel(0)).toBeNull()
    expect(R.riskLevel('x')).toBeNull()
  })
  it('derives the score and clamps the ratings to 1 to 5', () => {
    const e = R.clean({ id: 'a', project: 'I-1050', type: 'risk' }, { title: 'Load cell drifts', likelihood: 9, impact: -2 })
    expect(e).toMatchObject({ likelihood: 5, impact: 1, score: 5 })
    expect(R.clean({ id: 'b', project: 'I-1050', type: 'risk' }, { title: 'x', likelihood: '4', impact: 3.6 })).toMatchObject({ likelihood: 4, impact: 4, score: 16 })
    expect(R.clean({ id: 'c', project: 'I-1050', type: 'risk' }, { title: 'x' })).toMatchObject({ likelihood: 3, impact: 3, score: 9 })
  })
})

describe('validation', () => {
  it('trims and caps strings, keeps only real dates and known values', () => {
    const e = R.clean({ id: 'a', project: 'I-1050', type: 'issue' }, {
      title: '   Grip   sensor\n reads   high  ' + 'x'.repeat(400), detail: 'y'.repeat(5000), owner: '  Jürg  ',
      severity: 'HIGH', due: '2026-02-30', resolution: 'z'.repeat(3000), status: 'exploded', bogus: 'no'
    })
    expect(e.title.startsWith('Grip sensor reads high x')).toBe(true)
    expect(e.title).toHaveLength(R.MAX.title)
    expect(e.detail).toHaveLength(R.MAX.detail)
    expect(e.resolution).toHaveLength(R.MAX.long)
    expect(e.owner).toBe('Jürg')
    expect(e.severity).toBe('high')
    expect(e.due).toBeNull()
    expect(e.status).toBe('open')
    expect(e).not.toHaveProperty('bogus')
    expect(R.clean({ id: 'd', project: 'I-1050', type: 'dependency' }, { title: 'x', direction: 'sideways', needBy: '2026-11-03T10:00' })).toMatchObject({ direction: 'in', needBy: '2026-11-03' })
  })
  it('keeps an assumption status and its validated flag together', () => {
    const base = { id: 'a', project: 'I-1050', type: 'assumption' }
    expect(R.clean(base, { title: 'x' })).toMatchObject({ status: 'open', validated: null })
    expect(R.clean(base, { title: 'x', validated: true })).toMatchObject({ status: 'validated', validated: true })
    expect(R.clean(base, { title: 'x', status: 'invalid' })).toMatchObject({ status: 'invalid', validated: false })
    expect(R.clean({ ...base, title: 'x', status: 'validated', validated: true }, { validateBy: '2026-10-10' })).toMatchObject({ status: 'validated', validated: true, validateBy: '2026-10-10' })
  })
  it('knows the project keys', () => {
    expect(R.projectKey('i-1050')).toBe('I-1050')
    expect(R.projectKey('plan:4f2a-b1')).toBe('plan:4f2a-b1')
    expect(R.projectKey('I-10')).toBeNull()
    expect(R.projectKey('plan:../etc')).toBeNull()
    expect(R.projectKey('')).toBeNull()
  })
})

describe('the store', () => {
  beforeAll(() => settings.update({ name: 'Noël Jensen' }))
  it('creates each type with its own fields and the author from Settings', () => {
    const r = R.create({ project: 'I-1050', type: 'risk', title: 'Load cell supplier slips', likelihood: 4, impact: 5, mitigation: 'Second source', reviewOn: '2026-10-01' })
    expect(r).toMatchObject({ type: 'risk', score: 20, status: 'open', by: 'Noël Jensen', reviewOn: '2026-10-01' })
    const d = R.create({ project: 'I-1050', type: 'decision', title: 'Go with the 200 kg cell' })
    expect(d).toMatchObject({ status: 'made', decidedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(d).not.toHaveProperty('likelihood')
    const dep = R.create({ project: 'plan:abc12345', type: 'dependency', title: 'Frame from the workshop', on: 'Workshop', needBy: '2026-10-20', direction: 'in' })
    expect(dep).toMatchObject({ project: 'plan:abc12345', on: 'Workshop', direction: 'in', status: 'open' })
    expect(R.stored('I-1050')).toHaveLength(2)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'raidd.json'), 'utf8')).items).toHaveLength(3)
  })
  it('refuses an unknown type, a missing title and a bad project with a 400', () => {
    expect(() => R.create({ project: 'I-1050', type: 'rumour', title: 'x' })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => R.create({ project: 'I-1050', type: 'risk', title: '   ' })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => R.create({ project: 'Leg press', type: 'risk', title: 'x' })).toThrow(expect.objectContaining({ status: 400 }))
  })
  it('updates without changing type, project or author, and rescores', () => {
    const r = R.create({ project: 'I-1050', type: 'risk', title: 'Firmware late', likelihood: 2, impact: 2 })
    const u = R.update(r.id, { likelihood: 5, type: 'issue', project: 'I-9999', by: 'Someone', score: 1, status: 'mitigating' })
    expect(u).toMatchObject({ type: 'risk', project: 'I-1050', by: 'Noël Jensen', score: 10, status: 'mitigating', updatedBy: 'Noël Jensen' })
    expect(R.update('nope', { title: 'x' })).toBeNull()
    expect(() => R.update(r.id, { title: '' })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => R.update('logbook:e1:0', { title: 'x' })).toThrow(expect.objectContaining({ status: 400 }))
  })
  it('deletes, and Undo brings the entry back with its id', () => {
    const r = R.create({ project: 'I-1050', type: 'issue', title: 'Handle cracks', severity: 'high' })
    const gone = R.remove(r.id)
    expect(gone.id).toBe(r.id)
    expect(R.stored('I-1050').some(e => e.id === r.id)).toBe(false)
    expect(R.remove(r.id)).toBeNull()
    const back = R.create(gone)
    expect(back).toMatchObject({ id: r.id, title: 'Handle cracks', severity: 'high', createdAt: r.createdAt })
  })
  it('never touches the tasks', () => {
    expect(store.allTasks()).toHaveLength(0)
  })
})

describe('summary and matrix', () => {
  const entries = [
    { id: 'r1', type: 'risk', status: 'open', likelihood: 4, impact: 5, score: 20, reviewOn: '2026-10-01' },
    { id: 'r2', type: 'risk', status: 'mitigating', likelihood: 2, impact: 3, score: 6, reviewOn: '2026-10-07' },
    { id: 'r3', type: 'risk', status: 'closed', likelihood: 5, impact: 5, score: 25, reviewOn: '2026-01-01' },
    { id: 'r4', type: 'risk', status: 'open', likelihood: 4, impact: 5, score: 20 },
    { id: 'a1', type: 'assumption', status: 'open', validated: null, validateBy: '2026-10-05' },
    { id: 'a2', type: 'assumption', status: 'validated', validated: true, validateBy: '2026-09-01' },
    { id: 'i1', type: 'issue', status: 'in progress', severity: 'high', due: '2026-10-05' },
    { id: 'i2', type: 'issue', status: 'resolved', severity: 'high', due: '2026-09-01' },
    { id: 'i3', type: 'issue', status: 'open', severity: 'low', due: TODAY },
    { id: 'd1', type: 'dependency', status: 'at risk', needBy: '2026-12-01' },
    { id: 'd2', type: 'dependency', status: 'open', needBy: '2026-10-01' },
    { id: 'd3', type: 'dependency', status: 'met', needBy: '2026-09-01' },
    { id: 'x1', type: 'decision', status: 'made', decidedOn: '2026-09-30' }
  ]
  it('counts per type and open', () => {
    const s = R.summary(entries, TODAY)
    expect(s.counts).toEqual({ risk: { total: 4, open: 3 }, assumption: { total: 2, open: 1 }, issue: { total: 3, open: 2 }, dependency: { total: 3, open: 2 }, decision: { total: 1, open: 0 } })
    expect(s.open).toBe(8)
  })
  it('flags what needs a look, and nothing closed', () => {
    const s = R.summary(entries, TODAY)
    expect(s.highRisks).toEqual(['r1', 'r4'])
    expect(s.overdueIssues).toEqual(['i1'])          // due today is not overdue yet
    expect(s.dependenciesAtRisk).toEqual(['d1', 'd2'])
    expect(s.assumptionsDue).toEqual(['a1'])
    expect(s.reviewsDue).toEqual(['r1'])             // r2 reviews tomorrow, r3 is closed
    expect(s.attention).toBe(6)
  })
  it('puts the open risks on a 5 by 5 grid, likelihood by impact', () => {
    const g = R.matrix(entries)
    expect(g).toHaveLength(5)
    g.forEach(row => expect(row).toHaveLength(5))
    expect(g[3][4]).toEqual(['r1', 'r4'])
    expect(g[1][2]).toEqual(['r2'])
    expect(g[4][4]).toEqual([])                      // closed
    expect(g.flat().flat()).toHaveLength(3)
  })
  it('orders the most severe first, closed last', () => {
    const order = entries.slice().sort(R.bySeverity(TODAY)).map(e => e.id)
    expect(order.slice(0, 3)).toEqual(['r1', 'i1', 'r4'])   // a critical risk past review, a high issue overdue, a critical risk
    expect(order.indexOf('i1')).toBeLessThan(order.indexOf('i3'))
    expect(order.indexOf('r3')).toBeGreaterThan(order.indexOf('x1'))
  })
})

describe('decisions from the Logbook', () => {
  it('appear read-only on the project the entry names, and only there', () => {
    const e = notes.createEntry({ title: 'I-1050 design review', date: '2026-09-29', decisions: 'Use the 200 kg cell\nDrop the wireless option', attendees: 'Jürg' })
    notes.createEntry({ title: 'Weekly', date: '2026-09-30', notes: 'Talked about I-10500 only', decisions: 'Not this one' })
    notes.createEntry({ title: 'Ops', date: '2026-09-28', tags: ['I-1050'], decisions: ['Order two spares'] })
    const { entries, summary } = R.listFor('I-1050', { today: TODAY })
    const fromLog = entries.filter(x => x.source === 'logbook')
    expect(fromLog.map(x => x.title)).toEqual(['Use the 200 kg cell', 'Drop the wireless option', 'Order two spares'])
    expect(fromLog[0]).toMatchObject({ id: `logbook:${e.id}:0`, type: 'decision', decidedOn: '2026-09-29', source: 'logbook', readOnly: true, entryId: e.id, entryTitle: 'I-1050 design review' })
    expect(summary.counts.decision.total).toBeGreaterThanOrEqual(3)
    expect(() => R.update(fromLog[0].id, { title: 'x' })).toThrow(expect.objectContaining({ status: 400 }))
  })
  it('match a plan by its machine', () => {
    const p = projects.create({ name: 'Leg press 7', machine: 'Leg press 7' })
    notes.createEntry({ title: 'FAT prep', date: '2026-10-02', project: 'leg press 7', decisions: 'FAT on 12 Nov' })
    const { entries } = R.listFor(`plan:${p.id}`, { today: TODAY })
    expect(entries.filter(x => x.source === 'logbook').map(x => x.title)).toEqual(['FAT on 12 Nov'])
  })
})

describe('routes', () => {
  let server, base
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    R.registerRoutes(app)
    server = app.listen(0, '127.0.0.1')
    await new Promise(r => server.once('listening', r))
    base = `http://127.0.0.1:${server.address().port}/api/raidd`
  })
  afterAll(() => new Promise(r => server.close(r)))
  const send = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  it('creates, lists, patches and deletes', async () => {
    const c = await send(base, 'POST', { project: 'I-2001', type: 'issue', title: 'Motor hums', severity: 'medium', due: '2026-10-01' })
    expect(c.status).toBe(201)
    const issue = await c.json()
    const l = await (await fetch(`${base}?project=I-2001`)).json()
    expect(l.entries.map(e => e.id)).toEqual([issue.id])
    expect(l.summary.counts.issue).toEqual({ total: 1, open: 1 })
    expect(l.matrix).toHaveLength(5)
    const p = await send(`${base}/${issue.id}`, 'PATCH', { status: 'resolved', resolution: 'Shimmed' })
    expect(await p.json()).toMatchObject({ status: 'resolved', resolution: 'Shimmed' })
    const d = await send(`${base}/${issue.id}`, 'DELETE')
    expect(await d.json()).toMatchObject({ deleted: true, entry: { id: issue.id } })
    expect((await send(`${base}/${issue.id}`, 'DELETE')).status).toBe(404)
    expect((await send(`${base}/${issue.id}`, 'PATCH', { title: 'x' })).status).toBe(404)
  })
  it('says no to an unknown type, a bad project and a Logbook decision', async () => {
    const t = await send(base, 'POST', { project: 'I-2001', type: 'worry', title: 'x' })
    expect(t.status).toBe(400)
    expect((await t.json()).error).toMatch(/Unknown type/)
    expect((await fetch(`${base}?project=nothing`)).status).toBe(400)
    expect((await send(`${base}/logbook:abc:0`, 'DELETE')).status).toBe(400)
  })
})

describe('the report section', () => {
  const entries = [
    { id: 'r1', type: 'risk', status: 'open', title: 'Cell <b>drift</b>', owner: 'Jürg & Co', likelihood: 4, impact: 5, score: 20, mitigation: 'Second "source"', reviewOn: '2026-10-01' },
    { id: 'r2', type: 'risk', status: 'open', title: 'Small one', likelihood: 1, impact: 2, score: 2 },
    { id: 'r3', type: 'risk', status: 'closed', title: 'Closed risk', likelihood: 5, impact: 5, score: 25 },
    { id: 'x1', type: 'decision', status: 'made', title: 'Use <script>', decidedOn: '2026-09-29', source: 'logbook', entryTitle: 'Review' }
  ]
  it('escapes everything that came from a person and marks late dates', () => {
    const html = R.raiddReportHtml(entries, { today: TODAY, esc, fmt })
    expect(html).toContain('<h2>RAIDD log</h2>')
    expect(html).toContain('Cell &lt;b&gt;drift&lt;/b&gt;')
    expect(html).toContain('Jürg &amp; Co')
    expect(html).toContain('Second &quot;source&quot;')
    expect(html).toContain('Use &lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>drift')
    expect(html).toContain('<span class="late">1 Oct 2026</span>')
    expect(html).toContain('Logbook: Review')
    expect(html).not.toContain('Closed risk')
    expect(html.indexOf('Cell')).toBeLessThan(html.indexOf('Small one'))
    expect(html).toContain('2 open risks, 1 high or critical')
    expect(html).not.toContain(String.fromCharCode(0x2014))   // no em dash
  })
  it('says None. for each empty part', () => {
    const html = R.raiddReportHtml([], { today: TODAY, esc, fmt })
    expect(html.match(/<p class="none">None\.<\/p>/g)).toHaveLength(5)
  })
})
