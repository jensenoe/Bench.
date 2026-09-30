import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-today-report-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const { todayReport, previousWorkday } = await import('../server/report.js')

const today = '2026-09-30'   // a Wednesday
const tasks = [
  { id: 'a', title: 'Torque test <frame>', lane: 'today', source: 'planner', planTitle: 'Test bench', priority: 1, dueDate: '2026-09-28', effortHours: 2, checklist: [{ done: true }, { done: false }], notes: 'secret note' },
  { id: 'b', title: 'I-1050 grip housing drawing', lane: 'today', source: 'local', dueDate: '2026-09-30' },
  { id: 'c', title: 'Sent the quote', lane: 'today', done: true, completedAt: '2026-09-30T09:12:00Z', project: 'M3' },
  { id: 'd', title: 'Old done card', lane: 'today', done: true, completedAt: '2026-09-20T09:12:00Z' },
  { id: 'e', title: 'Linear rails quote', lane: 'waiting', waitingOn: 'Jacob', waitingSince: '2026-09-24' },
  { id: 'f', title: 'Frame welded', lane: 'active', done: true, completedAt: '2026-09-29T15:00:00Z', project: 'Rig 3' },
  { id: 'g', title: 'Parked idea', lane: 'parked' }
]
const meetings = [
  { subject: 'Innovation weekly', start: '10:00', end: '11:00' },
  { subject: 'Holiday', allDay: true },
  { subject: 'Gate review', start: '14:00', end: '14:30' }
]

describe('Today as a report (roadmap 164)', () => {
  const html = todayReport({ tasks, meetings, yesterday: '2026-09-29' }, { today, author: 'Noël Jensen', workdayHours: 8.4 })
  it('lists what is on Today, done today last, and leaves notes and other lanes out', () => {
    expect(html).toContain('<title>Today, Wednesday 30 Sep 2026</title>')
    expect(html).toContain('Torque test &lt;frame&gt;')
    expect(html).toContain('I-1050')                 // the code stands in for a project
    expect(html).toContain('Sent the quote (done)')
    expect(html).not.toContain('Old done card')
    expect(html).not.toContain('secret note')
    expect(html).not.toContain('Parked idea')
    expect(html).toContain('1 of 2 steps')
    expect(html).toContain('class="late">28 Sep 2026')
    expect(html.indexOf('Torque test')).toBeLessThan(html.indexOf('I-1050 grip'))   // P1 first
  })
  it('counts hours, meetings, waiting and yesterday', () => {
    expect(html).toContain('6.9 h')                  // free: 8.4 h less 1.5 h of meetings; sizes are never summed (roadmap 166)
    expect(html).toContain('free after meetings')
    expect(html).toContain('>Effort<')
    expect(html).toContain('1.5 h')                  // two timed meetings; the all-day one is not a meeting hour
    expect(html).toContain('10:00 to 11:00')
    expect(html).not.toContain('Holiday')
    expect(html).toContain('Jacob')
    expect(html).toContain('Done on Tuesday, 29 Sep 2026')
    expect(html).toContain('Frame welded')
    expect(html).toContain('Noël Jensen')
  })
  it('says so when the day is empty', () => {
    const empty = todayReport({ tasks: [], meetings: [], yesterday: null }, { today })
    expect(empty).toContain('Nothing on Today yet.')
    expect(empty).toContain('No meetings on the calendar today.')
    expect(empty).not.toContain('Waiting on others')
  })
  it('the last working day skips weekends and days off', () => {
    const off = iso => [0, 6].includes(new Date(`${iso}T12:00:00`).getDay()) || iso === '2026-09-25'
    expect(previousWorkday('2026-09-28', off)).toBe('2026-09-24')   // Monday: back over the weekend and a Friday off
    expect(previousWorkday('2026-09-30', off)).toBe('2026-09-29')
  })
})

describe('done on the last workday counts real finishes only (roadmap 164)', async () => {
  const { finishedOn } = await import('../server/report.js')
  const at = (h) => new Date(2026, 8, 29, h).toISOString()
  const entries = [
    { kind: 'changed', taskId: 'a', at: at(10), changes: [{ field: 'done', from: false, to: true }] },     // ticked here
    { kind: 'synced', taskId: 'b', at: at(11), changes: [{ field: 'done', from: false, to: true }] },      // done in its tool
    { kind: 'synced', taskId: 'c', at: at(11), changes: [{ field: 'id', from: undefined, to: 'c' }, { field: 'done', from: undefined, to: true }] },   // arrived done: not a finish
    { kind: 'changed', taskId: 'd', at: at(12), undoneAt: at(13), changes: [{ field: 'done', from: false, to: true }] },   // undone
    { kind: 'changed', taskId: 'e', at: new Date(2026, 8, 28, 10).toISOString(), changes: [{ field: 'done', from: false, to: true }] }   // another day
  ]
  it('takes ticks and tool completions of that day, not cards that arrived done or undone ticks', () => {
    expect([...finishedOn('2026-09-29', entries)].sort()).toEqual(['a', 'b'])
    const html = todayReport({ tasks: [{ id: 'a', title: 'Ticked', done: true }, { id: 'c', title: 'Arrived done', done: true, completedAt: at(11) }], meetings: [], yesterday: '2026-09-29', doneIds: finishedOn('2026-09-29', entries) }, { today: '2026-09-30' })
    expect(html).toContain('Ticked')
    expect(html).not.toContain('Arrived done')
    expect(html).not.toContain('>Size<')
  })
})
