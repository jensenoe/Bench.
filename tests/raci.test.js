import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// a scratch folder before any server module is loaded: store.js and db.js write wherever these point
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-raci-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const R = await import('../server/raci.js')
const rules = await import('../server/raci-rules.js')
const store = await import('../server/store.js')
const notes = await import('../server/notes.js')
const projects = await import('../server/projects.js')
const settings = await import('../server/settings.js')
const { esc } = await import('../server/report.js')

beforeAll(() => {
  settings.update({ name: 'Noël Jensen' })
  store.createTask({ title: 'I-1050 grip sensor housing', lead: 'Jacob Meier', assignedBy: 'Sara Keller', waitingOn: 'jacob meier' })
  store.createTask({ title: 'Load cell order', project: 'I-1050 Handgrip strength', waitingOn: 'Lukas Brändli' })
  store.createTask({ title: 'Unrelated', lead: 'Someone Else', project: 'Leg press 7' })
  notes.createEntry({ title: 'I-1050 gate review', attendees: ['Sara Keller', 'Noel Jensen', 'Lukas Brandli', 'mira@tom.fit', 'Mira Vogel'] })
  notes.createEntry({ title: 'Leg press 7 weekly', project: 'Leg press 7', attendees: ['Tom Huber'] })
})

describe('letters', () => {
  it('only R, A, AR, C and I, case ignored, RA read as AR', () => {
    expect(['r', 'A', ' c ', 'i', 'ar', 'RA'].map(rules.normLetter)).toEqual(['R', 'A', 'C', 'I', 'AR', 'AR'])
    expect(['X', 'RR', '', null, 'RAC', 7].map(rules.normLetter)).toEqual([null, null, null, null, null, null])
  })
  it('a click cycles empty, R, A, AR, C, I and back to empty', () => {
    const seen = []
    let l = ''
    for (let i = 0; i < 6; i++) { l = rules.nextLetter(l); seen.push(l) }
    expect(seen).toEqual(['R', 'A', 'AR', 'C', 'I', ''])
  })
  it('typing R on an A makes AR, the same letter again takes it off', () => {
    expect(rules.typeLetter('A', 'r')).toBe('AR')
    expect(rules.typeLetter('R', 'A')).toBe('AR')
    expect(rules.typeLetter('AR', 'A')).toBe('R')
    expect(rules.typeLetter('AR', 'R')).toBe('A')
    expect(rules.typeLetter('C', 'C')).toBe('')
    expect(rules.typeLetter('C', 'I')).toBe('I')
    expect(rules.typeLetter('C', 'x')).toBe('C')
  })
})

describe('checks', () => {
  it('a row needs one A and at least one R', () => {
    expect(R.checkRow({ Jacob: 'A', Sara: 'R' })).toEqual([])
    expect(R.checkRow({ Jacob: 'AR' })).toEqual([])
    expect(R.checkRow({}).map(p => p.code)).toEqual(['noA', 'noR'])
    expect(R.checkRow({ Jacob: 'R', Sara: 'C' }).map(p => p.short)).toEqual(['No A'])
    const two = R.checkRow({ Jacob: 'A', Sara: 'AR' })
    expect(two.map(p => p.short)).toEqual(['Two A'])
    expect(two[0].text).toMatch(/^Two people own the outcome\./)
    expect(R.checkRow({ a: 'A', b: 'A', c: 'A', d: 'R' })[0].short).toBe('Three A')
    expect(R.checkRow({ Jacob: 'A', Sara: 'I' }).map(p => p.code)).toEqual(['noR'])
  })
  it('the matrix: problems per row, soft hints per person, and a count of problems only', () => {
    const m = {
      people: ['Jacob', 'Sara', 'Tom', 'Mira'],
      rows: [{ id: 'a', activity: 'Concept' }, { id: 'b', activity: 'Testing' }],
      cells: { a: { Jacob: 'A', Sara: 'R', Tom: 'I' }, b: { Jacob: 'A', Sara: 'A', Tom: 'I', Ghost: 'R' } }
    }
    const c = R.check(m)
    expect(c.rows.a).toEqual([])
    expect(c.rows.b.map(p => p.code)).toEqual(['manyA', 'noR'])   // Ghost is not a column: their R does not count
    expect(c.people.Tom.map(h => h.code)).toEqual(['onlyI'])
    expect(c.people.Mira.map(h => h.code)).toEqual(['unused'])
    expect(c.people.Jacob).toEqual([])
    expect(c.count).toBe(2)
    expect(c.list.filter(x => x.severity === 'hint').map(x => x.person)).toEqual(['Tom', 'Mira'])
    expect(c.list[0]).toMatchObject({ rowId: 'b', activity: 'Testing', code: 'manyA' })
  })
})

describe('starting rows', () => {
  it('an I-code starts from the five stages, Gate review and Budget, and nothing is stored', () => {
    const r = R.matrixFor('i-1050')
    expect(r.matrix.project).toBe('I-1050')
    expect(r.matrix.rows.map(x => x.activity)).toEqual(['Concept', 'Development', 'Procurement', 'Testing', 'Production', 'Gate review', 'Budget'])
    expect(r.matrix.people).toEqual([])
    expect(r.matrix.updatedAt).toBeNull()
    expect(r.problems.rows.concept.map(p => p.code)).toEqual(['noA', 'noR'])
    expect(fs.existsSync(path.join(dir, 'raci.json'))).toBe(false)
  })
  it('a plan starts from its phases, read only until the first edit', () => {
    const p = projects.create({ name: 'Leg press 7', machine: 'Leg press 7', phases: [{ name: 'Design', days: 5 }, { name: 'Build', days: 10 }] })
    const r = R.matrixFor(`plan:${p.id}`)
    expect(r.matrix.rows.map(x => x.activity)).toEqual(['Design', 'Build'])
    expect(r.matrix.rows[0].id).toBe(`phase-${p.phases[0].id}`)
    expect(fs.existsSync(path.join(dir, 'raci.json'))).toBe(false)
    expect(r.suggestions).toEqual(['Noël Jensen', 'Someone Else', 'Tom Huber'])
  })
  it('a key that is neither is refused, a plan that is gone is not found', () => {
    expect(() => R.matrixFor('Leg press 7')).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => R.matrixFor('plan:nope')).toThrow(expect.objectContaining({ status: 404 }))
    expect(R.parseKey('plan:a b')).toBeNull()
    expect(R.parseKey(' I-1050 ')).toMatchObject({ key: 'I-1050', kind: 'innovation' })
  })
})

describe('suggestions', () => {
  it('names from the tasks and the Logbook, you first, accents and case folded, no emails', () => {
    const s = R.matrixFor('I-1050').suggestions
    expect(s[0]).toBe('Noël Jensen')
    expect(s).toContain('Jacob Meier')
    expect(s).toContain('Sara Keller')
    expect(s).toContain('Lukas Brändli')   // "Lukas Brandli" in the Logbook is the same person; the accented spelling wins
    expect(s).toContain('Mira Vogel')
    expect(s).not.toContain('Someone Else')
    expect(s.filter(n => rules.fold(n) === 'jacob meier')).toHaveLength(1)
    expect(s.filter(n => rules.fold(n) === 'noel jensen')).toHaveLength(1)
    expect(s.some(n => n.includes('@'))).toBe(false)
  })
  it('meta.with on a synced ticket counts too', () => {
    const t = store.createTask({ title: 'I-1050 ticket' })
    t.meta = { with: ['Pia Roth'] }
    expect(R.suggestionsFor('I-1050')).toContain('Pia Roth')
  })
  it('people already on the matrix are not suggested again', () => {
    expect(R.suggestionsFor('I-1050', ['noel jensen', 'SARA KELLER'])).not.toContain('Sara Keller')
    expect(R.suggestionsFor('I-1050', ['noel jensen'])[0]).not.toBe('Noël Jensen')
  })
})

describe('cleaning and clamping', () => {
  it('names trimmed and unique, letters only from the set, cells only for rows and people that exist', () => {
    const m = R.clean({
      people: ['  Jacob   Meier ', 'jacob meier', 'Noël', 'Noel', '', 42],
      rows: [{ id: 'a', activity: '  Concept ' }, { id: 'a', activity: 'Same id' }, { id: 'bad id!', activity: '' }, 'As text', null],
      cells: { a: { 'jacob meier': 'r', 'Noel': 'X', Ghost: 'A' }, nope: { 'Jacob Meier': 'A' } }
    }, 'I-1050')
    expect(m.people).toEqual(['Jacob Meier', 'Noël', '42'])
    expect(m.rows.map(r => r.activity)).toEqual(['Concept', 'Same id', 'Activity 3', 'As text'])
    expect(m.rows[0].id).toBe('a')
    expect(m.rows[1].id).not.toBe('a')
    expect(m.rows[2].id).toMatch(/^[\w-]+$/)
    expect(m.cells).toEqual({ a: { 'Jacob Meier': 'R' } })
  })
  it('at most 40 rows and 16 people, long names cut', () => {
    const m = R.clean({
      people: Array.from({ length: 20 }, (_, i) => `Person ${i} ${'x'.repeat(80)}`),
      rows: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, activity: `Row ${i}`, group: 'g'.repeat(60) }))
    })
    expect(m.people).toHaveLength(16)
    expect(m.people[0].length).toBe(60)
    expect(m.rows).toHaveLength(40)
    expect(m.rows[0].group).toHaveLength(40)
  })
})

describe('save, load and reset', () => {
  it('saves the whole matrix, reads it back, and resets to the starting rows', () => {
    const before = R.matrixFor('I-1050').matrix
    const r = R.save('I-1050', { ...before, people: ['Noël Jensen', 'Jacob Meier'], cells: { concept: { 'Noël Jensen': 'A', 'Jacob Meier': 'R' }, budget: { 'Noël Jensen': 'Q' } } })
    expect(r.matrix.updatedAt).toBeTruthy()
    expect(r.matrix.by).toBe('Noël Jensen')
    expect(r.matrix.cells).toEqual({ concept: { 'Noël Jensen': 'A', 'Jacob Meier': 'R' } })
    expect(r.problems.rows.concept).toEqual([])
    expect(r.suggestions).not.toContain('Jacob Meier')
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'raci.json'), 'utf8'))
    expect(file.items.map(x => x.id)).toEqual(['I-1050'])
    expect(R.matrixFor('i-1050').matrix.people).toEqual(['Noël Jensen', 'Jacob Meier'])
    expect(R.matrixFor('I-1051').matrix.people).toEqual([])   // another project keeps its own

    const back = R.reset('I-1050')
    expect(back.matrix.people).toEqual([])
    expect(back.matrix.updatedAt).toBeNull()
    expect(back.matrix.rows).toHaveLength(7)
  })
  it('accepts { matrix } as the body, refuses what is not an object', () => {
    expect(R.save('I-2000', { matrix: { people: ['A B'], rows: [{ id: 'x', activity: 'X' }] } }).matrix.rows).toEqual([{ id: 'x', activity: 'X' }])
    expect(() => R.save('I-2000', [])).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => R.save('plan:gone', { people: [] })).toThrow(expect.objectContaining({ status: 404 }))
  })
  it('never touches a task', () => {
    const before = JSON.stringify(store.allTasks())
    R.save('I-1050', { people: ['Jacob Meier'], rows: [{ id: 'a', activity: 'A' }], cells: { a: { 'Jacob Meier': 'AR' } } })
    R.reset('I-1050')
    expect(JSON.stringify(store.allTasks())).toBe(before)
  })
})

describe('the report section', () => {
  const m = {
    people: ['Jacob <Meier>', 'Sara'],
    rows: [{ id: 'a', activity: 'Concept & "draft"' }, { id: 'b', activity: 'Testing' }],
    cells: { a: { 'Jacob <Meier>': 'A', Sara: 'R' }, b: { 'Jacob <Meier>': 'AR', Sara: 'A' } }
  }
  it('escapes names and activities, bolds A, lists the row problems', () => {
    const html = R.raciReportHtml(m, { esc })
    expect(html.startsWith('<h2>RACI</h2>')).toBe(true)
    expect(html).toContain('Jacob &lt;Meier&gt;')
    expect(html).toContain('Concept &amp; &quot;draft&quot;')
    expect(html).not.toContain('<Meier>')
    expect(html).toContain('<b>A</b>R')
    expect(html).toMatch(/<td style="text-align:center"><b>A<\/b><\/td>/)
    expect(html).toContain('To settle: Testing, two A.')
    expect(html.match(/<table/g)).toHaveLength(1)
  })
  it('splits into two tables past eight people', () => {
    const people = Array.from({ length: 11 }, (_, i) => `P${i}`)
    const html = R.raciReportHtml({ people, rows: [{ id: 'a', activity: 'A' }], cells: { a: { P0: 'A', P10: 'R' } } }, { esc })
    const tables = html.split('<table').slice(1)
    expect(tables).toHaveLength(2)
    expect((tables[0].match(/<th /g) || []).length).toBe(6)
    expect((tables[1].match(/<th /g) || []).length).toBe(5)
    expect(html).not.toContain('To settle')
  })
  it('says so when nobody is on it yet', () => {
    expect(R.raciReportHtml({ people: [], rows: [{ id: 'a', activity: 'A' }] }, { esc })).toContain('Nobody is on the matrix yet.')
  })
})
