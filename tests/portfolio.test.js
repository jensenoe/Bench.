import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-portfolio-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const C = await import('../server/codes.js')
const PF = await import('../server/portfolio.js')
const P = await import('../server/projects.js')
const store = await import('../server/store.js')

const card = (id, title, bucket, due = null, done = false) => ({ id, source: 'planner', title, bucketName: bucket, dueDate: due, done, planTitle: 'Task Allgemein', sourceStatus: done ? 'done' : 'open' })

describe('I-codes (roadmap 143)', () => {
  it('reads the code and the name, and matches whole codes only', () => {
    expect(C.codeOf('I-1050 Handgrip strength')).toBe('I-1050')
    expect(C.codeOf('Notes for i-2001')).toBe('I-2001')
    expect(C.codeOf('Typenschild')).toBe(null)
    expect(C.nameOf('I-1050 Handgrip strength', 'I-1050')).toBe('Handgrip strength')
    expect(C.nameOf('I-1041: Wave Sensor', 'I-1041')).toBe('Wave Sensor')
    expect(C.mentions('Order parts for I-1050', 'I-1050')).toBe(true)
    expect(C.mentions('I-10500 is another one', 'I-1050')).toBe(false)
    expect(C.mentions('XI-1050', 'I-1050')).toBe(false)
  })
})

describe('the stages from the Planner buckets', () => {
  it('maps the five buckets in order, and nothing else', () => {
    expect(PF.stageOf('Konzept (concept)')).toBe(0)
    expect(PF.stageOf('Entwicklung + Konstruktion (development + construction)')).toBe(1)
    expect(PF.stageOf('Beschaffung (procurement)')).toBe(2)
    expect(PF.stageOf('Prüfung (testing)')).toBe(3)
    expect(PF.stageOf('Produktion (production)')).toBe(4)
    expect(PF.stageOf('Technic')).toBe(-1)
    expect(PF.stageOf(null)).toBe(-1)
  })
})

describe('the portfolio', () => {
  const tasks = [
    card('a', 'I-1050 Handgrip strength', 'Produktion (production)', '2026-09-25T00:00:00Z'),
    card('b', 'I-2001 Calibration scale', 'Entwicklung + Konstruktion (development + construction)', '2026-11-02T00:00:00Z'),
    card('c', 'I-1008 Stellantrieb 4.0 Design', 'Prüfung (testing)', null, true),
    card('d', 'Powercooling 1.0', 'Entwicklung + Konstruktion (development + construction)'),
    { id: 'e', source: 'local', title: 'Order load cells', project: 'I-2001 Calibration scale', done: false },
    { id: 'f', source: 'local', title: 'Calibrate I-2001 against the reference', done: true },
    { id: 'g', source: 'local', title: 'Something else', project: 'Row 4', done: false }
  ]
  const entries = [{ id: 'l1', title: 'Weekly', date: '2026-09-28', project: 'I-2001', actions: [{ id: 'x', text: 'Ask for the drawing' }, { id: 'y', text: 'Done one', done: true }] }]
  const maps = [{ id: 'm1', title: 'I-2001 ideas' }]
  it('one project per I-coded card, with stage, due, overdue and what carries the code', () => {
    const list = PF.portfolio(tasks, { today: '2026-09-29', entries, maps, folders: { 'I-1050': 'C:/x/TomFit Oetwil - I-1050 Handgrip strength' } })
    expect(list.map(p => p.code)).toEqual(['I-1050', 'I-2001', 'I-1008'])   // overdue first, then by due, done last; Powercooling is not a project
    const hg = list[0], cs = list[1]
    expect(hg).toMatchObject({ name: 'Handgrip strength', stage: 4, stageName: 'Production', due: '2026-09-25', overdue: 4, folder: 'C:/x/TomFit Oetwil - I-1050 Handgrip strength' })
    expect(cs).toMatchObject({ stage: 1, stageName: 'Development', overdue: 0, open: 1, closed: 1, entries: 1, openActions: 1, maps: 1 })
  })
  it('an open card wins over a done one with the same code', () => {
    const list = PF.portfolio([card('old', 'I-1050 Handgrip strength', 'Konzept (concept)', null, true), card('new', 'I-1050 Handgrip strength', 'Prüfung (testing)')], { today: '2026-09-29' })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ cardId: 'new', stage: 3 })
  })
})

describe('the Teams folders', () => {
  it('finds a synced folder whose name carries the code, one level inside a root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-roots-'))
    fs.mkdirSync(path.join(root, 'TomFit Oetwil - I-1050 Handgrip strength'))
    fs.mkdirSync(path.join(root, 'TomFit Oetwil - General'))
    expect(PF.findFolders(['I-1050', 'I-2001'], [root])).toEqual({ 'I-1050': path.join(root, 'TomFit Oetwil - I-1050 Handgrip strength') })
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-home-'))
    for (const n of ['OneDrive - tom.fit', 'tom.fit', 'PycharmProjects', 'Documents']) fs.mkdirSync(path.join(home, n))
    expect(PF.defaultRoots(home).map(p => path.basename(p)).sort()).toEqual(['OneDrive - tom.fit', 'tom.fit'])
  })
})

describe('a plan for an innovation project', () => {
  it('starts with the five stages and takes every task that names the code, not its own card', () => {
    const p = P.create({ name: 'I-2001 Calibration scale', machine: 'I-2001 Calibration scale', deadline: '2026-12-18' })
    expect(p.phases.map(x => x.name)).toEqual(['Concept', 'Development', 'Procurement', 'Testing', 'Production'])
    store.createTask({ title: 'Order load cells', project: 'I-2001', lane: 'active' })
    store.createTask({ title: 'Check I-2001 drawings', lane: 'active' })
    store.createTask({ title: 'Unrelated', project: 'Row 4', lane: 'active' })
    const d = P.detail(p.id, '2026-10-01')
    expect(d.unassigned.map(t => t.title).sort()).toEqual(['Check I-2001 drawings', 'Order load cells'])
    P.remove(p.id)
  })
})
