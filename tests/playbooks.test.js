import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-playbooks-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
let pb, store

beforeAll(async () => { pb = await import('../server/playbooks.js'); store = await import('../server/store.js') })

describe('the starter and the file', () => {
  it('serves the starter until the file exists, and writes the file on the first save', () => {
    const list = pb.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Commissioning, standard')
    expect(list[0].tasks.map(t => t.title)).toEqual(['Incoming inspection', 'Mechanical assembly check', 'Electrical check', 'Safety relay test', 'Software load', 'FAT protocol', 'Handover note'])
    expect(fs.existsSync(path.join(dir, 'playbooks.json'))).toBe(false)
    const saved = pb.save({ name: 'Small press', machineType: 'press', tasks: [{ title: 'Level it', lane: 'today', effortHours: '1.5', checklist: 'Feet\nSpirit level', orderBy: '+3', supplier: 'Bossard' }, { title: '' }, { lane: 'active' }] })
    expect(saved.id).toBeTruthy()
    expect(saved.tasks).toEqual([{ title: 'Level it', lane: 'today', effortHours: 1.5, checklist: ['Feet', 'Spirit level'], orderBy: '+3', supplier: 'Bossard' }])
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'playbooks.json'), 'utf8'))
    expect(file.map(p => p.name)).toEqual(['Commissioning, standard', 'Small press'])   // the starter is kept alongside
  })
  it('updates by id, refuses an empty one, and deletes', () => {
    const p = pb.list().find(x => x.name === 'Small press')
    const up = pb.save({ ...p, name: 'Small press, v2' })
    expect(up.id).toBe(p.id)
    expect(pb.list().map(x => x.name)).toEqual(['Commissioning, standard', 'Small press, v2'])
    expect(() => pb.save({ name: 'Nothing', tasks: [] })).toThrow(/at least one task/)
    expect(pb.remove(p.id)).toBe(true)
    expect(pb.remove(p.id)).toBe(false)
    expect(pb.list()).toHaveLength(1)
  })
  it('reads offsets leniently and drops the rest', () => {
    expect(pb.offset('+5')).toBe('+5')
    expect(pb.offset('12')).toBe('+12')
    expect(pb.offset(' +0 ')).toBe('+0')
    expect(pb.offset('2026-10-01')).toBeNull()
    expect(pb.offset('')).toBeNull()
    expect(pb.offsetDays('+7')).toBe(7)
  })
})

describe('tasksFor and apply', () => {
  it('turns offsets into dates from the day it is applied and tags the tasks', () => {
    const tpl = { tasks: [{ title: 'A', lane: 'active', orderBy: '+3', effortHours: 2, checklist: ['x'] }, { title: 'B', lane: 'waiting' }] }
    const out = pb.tasksFor(tpl, 'Machine 21', '2026-09-28')
    expect(out[0]).toMatchObject({ title: 'A', lane: 'active', project: 'Machine 21', orderBy: '2026-10-01', effortHours: 2, checklist: ['x'], tags: ['playbook'] })
    expect(out[1]).toMatchObject({ title: 'B', lane: 'waiting', orderBy: null, effortHours: null })
  })
  it('creates the tasks with the project set and respects the Today cap', () => {
    for (let i = 0; i < 4; i++) store.createTask({ title: `Filler ${i}`, lane: 'today' })   // four on Today, one slot left
    const p = pb.save({ name: 'Two for today', tasks: [{ title: 'First', lane: 'today' }, { title: 'Second', lane: 'today' }, { title: 'Third', lane: 'active', orderBy: '+2' }] })
    const r = pb.apply(p.id, 'Machine 21', '2026-09-23')
    expect(r.created).toHaveLength(3)
    expect(r.project).toBe('Machine 21')
    const made = r.created.map(id => store.allTasks().find(t => t.id === id))
    expect(made.map(t => t.lane)).toEqual(['today', 'active', 'active'])   // the second one waits in Active
    expect(made.every(t => t.project === 'Machine 21' && t.tags.includes('playbook'))).toBe(true)
    expect(made[2].orderBy).toBe('2026-09-25')
    expect(() => pb.apply(p.id, '')).toThrow(/Which machine/)
    expect(() => pb.apply('nope', 'X')).toThrow(/gone/)
  })
})

describe('templateFrom and fromMachine', () => {
  it('copies titles, lanes, sizes, checklists unticked and order offsets from the earliest date', () => {
    const tasks = [
      { id: '1', title: 'Order frame', lane: 'active', order: 2, effortHours: 1, orderBy: '2026-08-10', supplier: 'Bossard', checklist: [{ text: 'quote', done: true }] },
      { id: '2', title: 'Order drives', lane: 'today', order: 1, orderBy: '2026-08-03', done: true },
      { id: '3', title: 'Wire cabinet', lane: 'active', order: 3, effortHours: 6 },
      { id: '4', title: '#12 ticket', lane: 'active', order: 0, source: 'issues' },
      { id: '5', title: 'Parked idea', lane: 'parked', order: 4 }
    ]
    const p = pb.templateFrom(tasks, { name: 'Press, as built', machineType: 'press' })
    expect(p.name).toBe('Press, as built')
    expect(p.machineType).toBe('press')
    expect(p.tasks).toEqual([
      { title: 'Order drives', lane: 'today', orderBy: '+0' },
      { title: 'Order frame', lane: 'active', effortHours: 1, checklist: ['quote'], orderBy: '+7', supplier: 'Bossard' },
      { title: 'Wire cabinet', lane: 'active', effortHours: 6 },
      { title: 'Parked idea', lane: 'parked' }
    ])
    expect(() => pb.templateFrom([{ id: 'x', title: 'Ticket', source: 'qms' }], { name: 'Empty' })).toThrow(/no tasks of its own/)
  })
  it('builds one from a machine on the live store and saves it', () => {
    store.createTask({ title: 'Align spindle', project: 'Machine 40', effortHours: 2, orderBy: '2026-10-05' })
    store.createTask({ title: 'Order belt', project: 'Machine 40', orderBy: '2026-10-01', supplier: 'Gates' })
    const p = pb.fromMachine({ key: 'Machine 40' })
    expect(p.name).toBe('Machine 40, as built')
    expect(p.machineType).toBe('Machine 40')
    expect(p.tasks.map(t => [t.title, t.orderBy])).toEqual([['Align spindle', '+4'], ['Order belt', '+0']])
    expect(pb.list().some(x => x.id === p.id)).toBe(true)
    expect(() => pb.fromMachine({ key: 'nowhere' })).toThrow(/not on the list/)
  })
})
