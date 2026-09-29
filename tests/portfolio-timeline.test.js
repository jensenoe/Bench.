import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// scratch folders before any server module loads: store.js and history.js pick their folder at import time
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-pf-timeline-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const PF = await import('../server/portfolio.js')
const { portfolioReport } = await import('../server/report.js')
const store = await import('../server/store.js')
const history = await import('../server/history.js')

const TODAY = '2026-09-29'
const at = (d) => `${d}T10:00:00.000Z`
const move = (taskId, date, from, to) => ({ id: `${taskId}-${date}`, at: at(date), taskId, kind: 'synced', changes: [{ field: 'bucketName', from, to }] })
const card = (id, title, bucket, due = null, done = false) => ({ id, source: 'planner', title, bucketName: bucket, dueDate: due, done, planTitle: 'Innovation', sourceStatus: done ? 'done' : 'open' })

describe('stage moves from the change feed (roadmap 162)', () => {
  it('reads moves oldest first, the first sighting apart, and skips a renamed bucket', () => {
    const feed = [
      move('a', '2026-09-17', 'Beschaffung (procurement)', 'Prüfung (testing)'),
      move('a', '2026-08-01', null, 'Konzept'),
      move('a', '2026-08-20', 'Konzept', 'Entwicklung + Konstruktion'),
      move('a', '2026-08-25', 'Entwicklung + Konstruktion', 'Entwicklung + Konstruktion (development + construction)'),   // renamed, same stage
      move('a', '2026-09-02', 'Entwicklung + Konstruktion (development + construction)', 'Beschaffung (procurement)'),
      move('b', '2026-09-10', 'Konzept', 'Prüfung'),
      { id: 'x', at: at('2026-09-11'), taskId: 'a', kind: 'synced', changes: [{ field: 'title', from: 'I-1050', to: 'I-1050 Handgrip' }] }
    ]
    const t = PF.stageTrail(feed, 'a')
    expect(t.seen).toEqual({ date: '2026-08-01', bucket: 'Konzept' })
    expect(t.moves.map(m => [m.date, m.from, m.to])).toEqual([
      ['2026-08-20', 'Concept', 'Development'], ['2026-09-02', 'Development', 'Procurement'], ['2026-09-17', 'Procurement', 'Testing']
    ])
    expect(t.moves[2]).toMatchObject({ fromStage: 2, toStage: 3 })
    expect(PF.stageSince(t, 'Prüfung (testing)')).toEqual({ date: '2026-09-17', exact: true })
  })
  it('since: the first sighting is a lower bound, a last move elsewhere means not known, a card never seen has none', () => {
    const seenOnly = PF.stageTrail([move('c', '2026-06-01', null, 'Konzept')], 'c')
    expect(PF.stageSince(seenOnly, 'Konzept (concept)')).toEqual({ date: '2026-06-01', exact: false })
    expect(PF.stageSince(seenOnly, 'Prüfung')).toBe(null)                    // moved before Bench. recorded moves
    const elsewhere = PF.stageTrail([move('d', '2026-09-01', 'Konzept', 'Beschaffung')], 'd')
    expect(PF.stageSince(elsewhere, 'Prüfung')).toBe(null)
    expect(PF.stageSince(PF.stageTrail([], 'e'), 'Konzept')).toBe(null)
    const other = PF.stageTrail([move('f', '2026-09-20', 'Backlog', 'Parked ideas')], 'f')   // two buckets that are no stage still count
    expect(other.moves[0]).toMatchObject({ from: 'Backlog', to: 'Parked ideas', fromStage: -1, toStage: -1 })
    expect(PF.stageSince(other, 'Parked ideas')).toEqual({ date: '2026-09-20', exact: true })
  })
  it('portfolio carries stageSince, daysInStage and the moves of the chosen card only', () => {
    const tasks = [card('a', 'I-1050 Handgrip strength', 'Prüfung (testing)', '2026-12-01'), card('old', 'I-1050 Handgrip strength', 'Konzept', null, true)]
    const feed = [move('a', '2026-09-17', 'Beschaffung', 'Prüfung (testing)'), move('old', '2026-09-20', 'Konzept', 'Produktion')]
    const [p] = PF.portfolio(tasks, { today: TODAY, feed })
    expect(p).toMatchObject({ cardId: 'a', stageSince: '2026-09-17', stageSinceExact: true, daysInStage: 12, daysToDue: 63 })
    expect(p.moves).toEqual([{ date: '2026-09-17', from: 'Procurement', to: 'Testing', fromStage: 2, toStage: 3 }])
  })
  it('a Planner sync that changes a bucket lands in the feed and comes back as a move; no task is changed or lost', () => {
    const planner = (bucket) => [{ plannerId: 'pl-1', title: 'I-2001 Calibration scale', dueDate: '2026-11-02T00:00:00Z', done: false, planTitle: 'Innovation', bucketName: bucket }]
    store.mergePlannerTasks(planner('Konzept (concept)'))
    const before = structuredClone(store.allTasks())
    store.mergePlannerTasks(planner('Konzept (concept)'))          // nothing moved: no new entry
    const n = history.list(history.CAP).length
    store.mergePlannerTasks(planner('Entwicklung + Konstruktion (development + construction)'))
    const feed = history.list(history.CAP)
    expect(feed.length).toBe(n + 1)
    expect(feed[0]).toMatchObject({ kind: 'synced', who: 'planner', title: 'I-2001 Calibration scale' })
    expect(feed[0].changes).toEqual(expect.arrayContaining([{ field: 'bucketName', from: 'Konzept (concept)', to: 'Entwicklung + Konstruktion (development + construction)' }]))
    const after = store.allTasks()
    expect(after.map(t => t.id)).toEqual(before.map(t => t.id))
    expect(after[0]).toMatchObject({ lane: before[0].lane, notes: before[0].notes, title: before[0].title, done: false })
    const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const p = PF.list(iso).find(x => x.code === 'I-2001')
    expect(p).toMatchObject({ stage: 1, stageSince: iso, stageSinceExact: true, daysInStage: 0 })
    expect(p.moves.map(m => [m.from, m.to])).toEqual([['Concept', 'Development']])
    expect(PF.overview(iso).summary).toMatchObject({ movedProjects: 1 })
  })
})

const proj = (over = {}) => ({ code: 'I-1000', name: 'A project', done: false, stage: 1, stageName: 'Development', bucket: 'Entwicklung', due: '2026-12-01', overdue: 0, daysToDue: 63, open: 0, openActions: 0, staleActions: 0, stageSince: '2026-09-01', stageSinceExact: true, daysInStage: 28, moves: [], ...over })

describe('needs attention', () => {
  it('names overdue projects, 60 days or more in one stage, and actions open longer than 14 days', () => {
    const list = [
      proj({ code: 'I-1001', name: 'Late', overdue: 12, due: '2026-09-17', daysToDue: -12 }),
      proj({ code: 'I-1002', name: 'Stuck', daysInStage: 60, stageSince: '2026-07-31' }),
      proj({ code: 'I-1003', name: 'Almost stuck', daysInStage: 59 }),
      proj({ code: 'I-1004', name: 'Seen long ago', daysInStage: 90, stageSinceExact: false }),
      proj({ code: 'I-1005', name: 'Old actions', staleActions: 2, openActions: 3 }),
      proj({ code: 'I-1006', name: 'Done and late', done: true, overdue: 40 }),
      proj({ code: 'I-1007', name: 'No stage', stage: -1, stageName: null, daysInStage: 200 }),
      proj({ code: 'I-1008', name: 'Everything', overdue: 3, daysInStage: 70, staleActions: 1 })
    ]
    const a = PF.needsAttention(list)
    expect(a.map(x => x.code)).toEqual(['I-1001', 'I-1008', 'I-1004', 'I-1002', 'I-1005'])
    expect(a[0].reasons).toEqual([{ kind: 'overdue', text: '12 days past its due date' }])
    expect(a[1].reasons.map(r => r.kind)).toEqual(['overdue', 'stuck', 'actions'])
    expect(a[1].reasons[2].text).toBe('1 open action older than 14 days')
    expect(a.find(x => x.code === 'I-1002').reasons[0].text).toBe('in Development for 60 days')
    expect(a.find(x => x.code === 'I-1004').reasons[0].text).toBe('in Development for at least 90 days')
  })
  it('counts open actions by the date of their meeting, more than 14 days back', () => {
    const tasks = [card('a', 'I-1050 Handgrip strength', 'Konzept')]
    const entries = [
      { id: 'e1', title: 'Kickoff', date: '2026-09-14', project: 'I-1050', actions: [{ id: 'x', text: 'Old one' }, { id: 'y', text: 'Ticked', done: true }] },
      { id: 'e2', title: 'Weekly', date: '2026-09-15', project: 'I-1050', actions: [{ id: 'z', text: 'Fourteen days' }] }
    ]
    const [p] = PF.portfolio(tasks, { today: TODAY, entries })
    expect(p).toMatchObject({ openActions: 2, staleActions: 1, oldestAction: '2026-09-14' })
  })
})

describe('this month', () => {
  it('counts per stage, moves and overdue in the last 30 days, and decisions of entries that name an I-code', () => {
    const list = [
      proj({ code: 'I-1001', stage: 0, stageName: 'Concept', moves: [{ date: '2026-08-30', from: 'Concept', to: 'Concept' }] }),
      proj({ code: 'I-1002', stage: 3, stageName: 'Testing', overdue: 2, moves: [{ date: '2026-08-31', from: 'Procurement', to: 'Testing' }] }),
      proj({ code: 'I-1003', stage: 3, stageName: 'Testing', moves: [{ date: '2026-09-02', from: 'Concept', to: 'Development' }, { date: '2026-09-20', from: 'Development', to: 'Testing' }] }),
      proj({ code: 'I-1004', stage: -1, stageName: null }),
      proj({ code: 'I-1005', done: true, stage: 4, moves: [{ date: '2026-09-25', from: 'Testing', to: 'Production' }] })
    ]
    const entries = [
      { id: 'a', title: 'Weekly I-1002', date: '2026-09-28', decisions: ['Go with the 50 kg cell', 'I-1003 waits for the frame'] },
      { id: 'b', title: 'Team lunch', date: '2026-09-27', decisions: ['Pizza on Fridays'] },
      { id: 'c', title: 'Review', date: '2026-08-15', project: 'I-1001', decisions: ['Too old'] },
      { id: 'd', title: 'Gate', date: '2026-09-10', tags: ['i-1001'], decisions: [] }
    ]
    const s = PF.summary(list, { today: TODAY, entries })
    expect(s.stages.map(x => x.count)).toEqual([1, 0, 0, 2, 0])
    expect(s).toMatchObject({ open: 4, other: 1, overdue: 1, movedProjects: 2, from: '2026-08-31' })
    expect(s.moved.map(m => [m.code, m.date])).toEqual([['I-1003', '2026-09-20'], ['I-1003', '2026-09-02'], ['I-1002', '2026-08-31']])
    expect(s.decisions).toEqual([
      { date: '2026-09-28', code: 'I-1002', text: 'Go with the 50 kg cell', entry: 'Weekly I-1002' },
      { date: '2026-09-28', code: 'I-1003', text: 'I-1003 waits for the frame', entry: 'Weekly I-1002' }
    ])
    expect(s.attention.map(a => a.code)).toEqual(['I-1002'])
  })
})

describe('the portfolio report (roadmap 162)', () => {
  const list = [
    proj({ code: 'I-1050', name: 'Handgrip <strength> & "grip"', stage: 3, stageName: 'Testing', stageSince: '2026-09-17', daysInStage: 12, due: '2026-09-20', overdue: 9, daysToDue: -9, openActions: 2 }),
    proj({ code: 'I-2001', name: 'Calibration scale', stage: 1, stageName: 'Development', stageSince: '2026-06-01', stageSinceExact: false, daysInStage: 120, due: '2026-11-02', daysToDue: 34 }),
    proj({ code: 'I-3000', name: 'Old one', done: true })
  ]
  const moves = [{ code: 'I-1050', name: 'Handgrip <strength> & "grip"', date: '2026-09-17', from: 'Procurement', to: 'Testing' }]
  const decisions = [{ date: '2026-09-28', code: 'I-1050', text: 'Use the <b>50 kg</b> cell', entry: 'Weekly' }]
  it('has the header, the stage counts, every section, and escapes what it prints', () => {
    const html = portfolioReport(list, { today: TODAY, author: 'Noël <N>', moves, decisions })
    expect(html).toContain('<title>Innovation portfolio</title>')
    expect(html).toContain('Prepared by Noël &lt;N&gt; · 29 Sep 2026')
    for (const h of ['Needs attention', 'Open projects', 'Moved this month', 'Decisions this month']) expect(html).toContain(`<h2>${h}</h2>`)
    expect(html).toContain('<div class="on"><b>1</b><span>Testing</span></div>')
    expect(html).toContain('<div class=""><b>0</b><span>Concept</span></div>')
    expect(html).toContain('Handgrip &lt;strength&gt; &amp; &quot;grip&quot;')
    expect(html).not.toContain('<strength>')
    expect(html).toContain('Use the &lt;b&gt;50 kg&lt;/b&gt; cell')
    expect(html).toContain('9 days late')
    expect(html).toContain('34 days of room')
    expect(html).toContain('by 1 Jun 2026')
    expect(html).toContain('17 Sep 2026')
    expect(html).toContain('9 days past its due date')
    expect(html).toContain('in Development for at least 120 days')
    expect(html).not.toContain('Old one')                     // open projects only
    expect(html).not.toContain('print()')
    expect(html).not.toMatch(/—/)                         // no em dash
    expect(portfolioReport(list, { today: TODAY, print: true })).toContain('print()')
  })
  it('says so when a section is empty', () => {
    const html = portfolioReport([], { today: TODAY })
    expect(html).toContain('No open innovation project.')
    expect(html).toContain('No project changed stage in the last 30 days.')
    expect(html).toContain('No Logbook decision in the last 30 days names an I-code.')
    expect(html).toContain('Nothing stands out')
    expect(html).not.toContain('Prepared by')
    expect(html).not.toContain('<table')
  })
  it('keeps decisions short and says how many more there are', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ date: '2026-09-28', code: 'I-1050', text: 'x'.repeat(300) + i, entry: 'Weekly' }))
    const html = portfolioReport(list, { today: TODAY, decisions: many })
    expect(html).toContain('And 2 more decisions in the Logbook.')
    expect(html).not.toContain('x'.repeat(200))
  })
})
