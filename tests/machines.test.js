import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// machines.js imports the store, which reads BENCH_DATA_DIR at import time, so point it at a scratch folder first.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-machines-'))
process.env.BENCH_DATA_DIR = dir
let m

beforeAll(async () => { m = await import('../server/machines.js') })

const TODAY = '2026-09-23'
const task = (over = {}) => ({ id: over.id || Math.random().toString(36).slice(2), source: 'local', title: 'A task', notes: '', lane: 'active', done: false, dueDate: null, orderBy: null, orderedOn: null, project: null, meta: {}, updatedAt: '2026-09-20T10:00:00.000Z', ...over })

const fixture = () => ({
  tasks: [
    task({ id: 't1', title: 'Replace belt', project: 'Machine 14', updatedAt: '2026-09-22T08:00:00.000Z' }),
    task({ id: 't2', title: 'Order bearing', project: 'Machine 14', orderBy: '2026-09-20', supplier: 'SKF', updatedAt: '2026-09-21T08:00:00.000Z' }),
    task({ id: 't3', title: 'Wait for quote', project: 'machine  14', lane: 'waiting', dueDate: '2026-09-01', updatedAt: '2026-09-19T08:00:00.000Z' }),
    task({ id: 't4', title: 'Old job', project: 'Machine 14', done: true, completedAt: '2026-09-10T08:00:00.000Z', updatedAt: '2026-09-10T08:00:00.000Z' }),
    task({ id: 't5', title: 'M14 spindle noise', source: 'issues', meta: { machine: 'M14' }, updatedAt: '2026-09-23T06:00:00.000Z' }),
    task({ id: 't6', title: 'Frame bolts', source: 'bom', meta: { machine: 'Machine 7', supplier: 'Bossard', deliveryDate: '2026-09-01' }, updatedAt: '2026-09-15T08:00:00.000Z' }),
    task({ id: 't7', title: 'Check M14 guarding', project: 'Line 2', updatedAt: '2026-09-18T08:00:00.000Z' }),
    task({ id: 't8', title: 'Something else', notes: 'Talked about Machine 14 with Tom', updatedAt: '2026-09-18T08:00:00.000Z' }),
    task({ id: 't9', title: 'Too short', project: 'X', updatedAt: '2026-09-18T08:00:00.000Z' })
  ],
  entries: [
    { id: 'e1', title: 'Weekly', date: '2026-09-22', project: 'Machine 14', updatedAt: '2026-09-22T12:00:00.000Z' },
    { id: 'e2', title: 'M14 acceptance', date: '2026-09-21', project: null, updatedAt: '2026-09-21T12:00:00.000Z' },
    { id: 'e3', title: 'Unrelated', date: '2026-09-21', project: 'Machine 7', updatedAt: '2026-09-21T12:00:00.000Z' }
  ],
  maps: [{ id: 'n1', title: 'Machine 14 upgrade' }, { id: 'n2', title: 'Holiday' }],
  today: TODAY
})

describe('normalisation', () => {
  it('trims, collapses spaces and lower-cases the key', () => {
    expect(m.baseKey('  Machine   14 ')).toBe('machine 14')
    expect(m.cleanName('  Machine   14 ')).toBe('Machine 14')
    expect(m.cleanName('X')).toBeNull()
    expect(m.cleanName(null)).toBeNull()
  })
  it('follows the alias map, and stops on a loop', () => {
    expect(m.resolveKey('M14', { m14: 'machine 14' })).toBe('machine 14')
    expect(m.resolveKey('Maschine 14', { 'maschine 14': 'm14', m14: 'machine 14' })).toBe('machine 14')
    expect(m.resolveKey('a', { a: 'b', b: 'a' })).toBe('a')
  })
})

describe('machinesFrom', () => {
  it('derives machines from task.project, meta.machine and entry.project, ignoring short names', () => {
    const list = m.machinesFrom(fixture())
    expect(list.map(x => x.key).sort()).toEqual(['line 2', 'm14', 'machine 14', 'machine 7'])
  })
  it('picks the most common spelling as the name', () => {
    const list = m.machinesFrom(fixture())
    expect(list.find(x => x.key === 'machine 14').name).toBe('Machine 14')
  })
  it('counts open, done, late, waiting and orders', () => {
    const x = m.machinesFrom(fixture()).find(x => x.key === 'machine 14')
    expect(x.open).toBe(3)
    expect(x.done).toBe(1)
    expect(x.late).toBe(2)      // t2 order date passed and not ordered, t3 due date passed
    expect(x.waiting).toBe(1)
    expect(x.orders).toBe(1)
    expect(x.tasks).toEqual(['t1', 't2', 't3', 't4'])
  })
  it('does not count an ordered part as late for its order date', () => {
    const f = fixture()
    f.tasks.find(t => t.id === 't2').orderedOn = '2026-09-19'
    const x = m.machinesFrom(f).find(x => x.key === 'machine 14')
    expect(x.late).toBe(1)
    expect(x.orders).toBe(0)
  })
  it('counts logbook entries by project and by a mention in the title, and napkin maps by title', () => {
    const x = m.machinesFrom(fixture()).find(x => x.key === 'machine 14')
    expect(x.logbook).toBe(1)   // e1 by project; e2 says M14, which is not an alias yet
    expect(x.maps).toBe(1)
  })
  it('merges spellings through the alias map', () => {
    const f = { ...fixture(), aliases: { m14: 'machine 14' } }
    const list = m.machinesFrom(f)
    expect(list.map(x => x.key).sort()).toEqual(['line 2', 'machine 14', 'machine 7'])
    const x = list.find(x => x.key === 'machine 14')
    expect(x.open).toBe(4)
    expect(x.issues).toBe(1)
    expect(x.logbook).toBe(2)   // e2 mentions M14 in its title now that M14 is a spelling
    expect(x.tasks).toContain('t5')
  })
  it('uses the display name when one is set', () => {
    const x = m.machinesFrom({ ...fixture(), names: { 'machine 14': 'Presse 14' } }).find(x => x.key === 'machine 14')
    expect(x.name).toBe('Presse 14')
  })
  it('sorts by last activity, newest first', () => {
    const list = m.machinesFrom(fixture())
    expect(list[0].key).toBe('m14')          // t5 at 23 Sep 06:00
    expect(list[1].key).toBe('machine 14')   // e1 at 22 Sep 12:00
    expect(list[1].lastActivity).toBe('2026-09-22T12:00:00.000Z')
  })
  it('counts one task once even when project and meta.machine agree', () => {
    const list = m.machinesFrom({ tasks: [task({ id: 'a', project: 'Machine 3', meta: { machine: 'machine 3' } })], today: TODAY })
    expect(list).toHaveLength(1)
    expect(list[0].open).toBe(1)
    expect(list[0].tasks).toEqual(['a'])
  })
  it('returns an empty list for nothing', () => {
    expect(m.machinesFrom({})).toEqual([])
  })
})

describe('detailFrom', () => {
  it('groups tasks by lane, counts by source and lists procurement rows', () => {
    const d = m.detailFrom('Machine 14', { ...fixture(), aliases: { m14: 'machine 14' } })
    expect(d.machine.key).toBe('machine 14')
    expect(d.tasks.active.map(t => t.id)).toEqual(['t1', 't2', 't5'])
    expect(d.tasks.waiting.map(t => t.id)).toEqual(['t3'])
    expect(d.tasks.done.map(t => t.id)).toEqual(['t4'])
    expect(d.bySource).toEqual({ local: 3, issues: 1, qms: 0, bom: 0, planner: 0 })
    expect(d.procurement).toHaveLength(1)
    expect(d.procurement[0]).toMatchObject({ id: 't2', supplier: 'SKF', orderBy: '2026-09-20' })
  })
  it('takes the procurement side of a BOM part from meta', () => {
    const d = m.detailFrom('Machine 7', fixture())
    expect(d.procurement[0]).toMatchObject({ id: 't6', supplier: 'Bossard', deliveryDate: '2026-09-01' })
  })
  it('lists entries newest first and the maps that mention the machine', () => {
    const d = m.detailFrom('machine 14', { ...fixture(), aliases: { m14: 'machine 14' } })
    expect(d.entries.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(d.maps).toEqual([{ id: 'n1', title: 'Machine 14 upgrade' }])
  })
  it('finds mentions in title or notes of tasks filed elsewhere', () => {
    const d = m.detailFrom('machine 14', { ...fixture(), aliases: { m14: 'machine 14' } })
    expect(d.mentions.map(t => t.id).sort()).toEqual(['t7', 't8'])
    expect(d.mentions.find(t => t.id === 't7').project).toBe('Line 2')
  })
  it('does not match a name inside a longer word', () => {
    const d = m.detailFrom('m14', { tasks: [task({ id: 'a', project: 'M14' }), task({ id: 'b', title: 'PM140 check' })], today: TODAY })
    expect(d.mentions).toEqual([])
  })
  it('is null for a key nothing uses', () => {
    expect(m.detailFrom('nowhere', fixture())).toBeNull()
  })
})

describe('the alias file', () => {
  it('starts empty and writes atomically', () => {
    expect(m.readAliases()).toEqual({ aliases: {}, names: {} })
    const r = m.rename('Machine 14', '  Presse  14 ')
    expect(r).toEqual({ key: 'machine 14', name: 'Presse 14' })
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'machines.json'), 'utf8'))
    expect(file.names).toEqual({ 'machine 14': 'Presse 14' })
    // the new name's own spelling resolves to the key, so a task filed under "Presse 14" lands here
    expect(file.aliases).toEqual({ 'presse 14': 'machine 14' })
    expect(fs.existsSync(path.join(dir, 'machines.json.tmp'))).toBe(false)
  })
  it('merges one machine into another and keeps the map one hop deep', () => {
    expect(m.alias('M14', 'Machine 14')).toEqual({ key: 'machine 14' })
    m.alias('Maschine 14', 'M14')
    expect(m.readAliases().aliases).toEqual({ 'presse 14': 'machine 14', m14: 'machine 14', 'maschine 14': 'machine 14' })
    // merging the target into a third machine drags its aliases along
    m.alias('Machine 14', 'Presse')
    expect(m.readAliases().aliases).toEqual({ 'presse 14': 'presse', m14: 'presse', 'maschine 14': 'presse', 'machine 14': 'presse' })
    expect(m.readAliases().names).toEqual({ presse: 'Presse 14' })
  })
  it('refuses a merge into itself and a name that is too short', () => {
    expect(() => m.alias('M14', 'Presse')).toThrow(/already/)
    expect(() => m.alias('', 'Presse')).toThrow()
    expect(() => m.rename('presse', 'P')).toThrow(/two characters/)
  })
})

describe('assign', () => {
  it('sets the task project to the machine display name through the store', async () => {
    const store = await import('../server/store.js')
    const a = store.createTask({ title: 'Anchor', project: 'Machine 21' })
    const b = store.createTask({ title: 'Loose end' })
    const t = m.assign(b.id, 'machine 21')
    expect(t.project).toBe('Machine 21')
    expect(store.allTasks().find(x => x.id === b.id).project).toBe('Machine 21')
    expect(m.list().find(x => x.key === 'machine 21').tasks.sort()).toEqual([a.id, b.id].sort())
    expect(() => m.assign(b.id, 'nowhere at all')).toThrow(/not on the list/)
  })
  it('after a rename, an assigned task still counts under the same machine', async () => {
    const store = await import('../server/store.js')
    const a = store.createTask({ title: 'Anchor', project: 'Machine 30' })
    const b = store.createTask({ title: 'Loose end two' })
    m.rename('machine 30', 'Presse 30')
    expect(m.assign(b.id, 'machine 30').project).toBe('Presse 30')
    const x = m.list().find(x => x.key === 'machine 30')
    expect(x.name).toBe('Presse 30')
    expect(x.tasks.sort()).toEqual([a.id, b.id].sort())
    expect(m.list().find(x => x.key === 'presse 30')).toBeUndefined()
  })
})
