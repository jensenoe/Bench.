import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-report-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const { innovationReport, planReport, esc, fmt } = await import('../server/report.js')

const stages = ['Concept', 'Development', 'Procurement', 'Testing', 'Production'].map((name, i) => ({ key: String(i), name }))
const inno = {
  project: { code: 'I-1050', name: 'Handgrip strength', plan: 'Innovation', stage: 1, stageName: 'Development', bucket: 'Entwicklung + Konstruktion', due: '2026-09-20', overdue: 9, done: false },
  stages,
  tasks: [{ id: 'a', title: 'Order <load> cells', lane: 'active', done: false, due: '2026-10-02' }, { id: 'b', title: 'Sketch the grip', lane: 'today', done: true, due: null }],
  entries: [{ id: 'e', title: 'Weekly', date: '2026-09-24', decisions: ['Go with the 50 kg cell'], openActions: 1 }],
  actions: [{ id: 'x', text: 'Ask for a quote', owner: 'Jacob', due: '2026-10-01' }],
  maps: [], plan: null
}

describe('project reports (roadmap 158)', () => {
  it('an innovation report has the stage, the figures, tasks, actions and decisions, all escaped', () => {
    const html = innovationReport(inno, { today: '2026-09-29', author: 'Noël' })
    expect(html).toContain('<title>I-1050 Handgrip strength</title>')
    expect(html).toContain('class="step done">Concept')
    expect(html).toContain('class="step now">Development')
    expect(html).toContain('20 Sep 2026')
    expect(html).toContain('9 days over')
    expect(html).toContain('1 of 2')
    expect(html).toContain('Order &lt;load&gt; cells')
    expect(html).not.toContain('<load>')
    expect(html).toContain('Ask for a quote')
    expect(html).toContain('Go with the 50 kg cell')
    expect(html).toContain('Prepared by Noël')
    expect(html).not.toContain('print()')
    expect(innovationReport(inno, { today: '2026-09-29', print: true })).toContain('print()')
  })
  it('a plan report has the phases with dates, the room and what runs late', () => {
    const d = {
      project: { id: 'p', name: 'Handgrip rig', machine: 'Rig 3', goal: 'A rig for the trade fair', deadline: '2026-11-20', deadlineLabel: 'Delivery' },
      phases: [
        { id: 'c', name: 'Construction', start: '2026-09-01', end: '2026-10-09', tasks: [{ id: 't1', title: 'Frame', done: true, lane: 'active' }, { id: 't2', title: 'Motor mount', done: false, lane: 'today', dueDate: '2026-09-25' }] },
        { id: 'b', name: 'Build', start: '2026-10-12', end: '2026-11-20', tasks: [] }
      ],
      unassigned: [], orders: [{ title: 'Linear rail', supplier: 'Igus', orderBy: '2026-10-05', needBy: '2026-10-12' }],
      slack: { slack: -2, late: [{ id: 't2', title: 'Motor mount', dueDate: '2026-09-25', phase: 'c' }] }, forecast: { slack: null }
    }
    const html = planReport(d, { today: '2026-09-29' })
    expect(html).toContain('Construction (now)')
    expect(html).toContain('1 of 2')
    expect(html).toContain('2 behind')
    expect(html).toContain('Running late')
    expect(html).toContain('Linear rail')
    expect(html).toContain('A rig for the trade fair')
  })
  it('escapes and dates', () => {
    expect(esc(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
    expect(fmt('2026-01-05T10:00:00Z')).toBe('5 Jan 2026')
    expect(fmt(null)).toBe('')
  })
})
