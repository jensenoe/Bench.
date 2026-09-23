import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-cost-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
let cost

beforeAll(async () => { cost = await import('../server/cost.js') })

const NOW = new Date(2026, 8, 23, 10, 0)   // 23 Sep 2026
const t = (over = {}) => ({ id: Math.random().toString(36).slice(2), title: 'x', done: true, completedAt: '2026-09-10T08:00:00.000Z', effortHours: 1, project: 'Machine 14', ...over })

describe('monthsBack', () => {
  it('lists the months oldest first, ending with the current one, across a year boundary', () => {
    expect(cost.monthsBack(3, NOW)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(cost.monthsBack(4, new Date(2026, 0, 15))).toEqual(['2025-10', '2025-11', '2025-12', '2026-01'])
  })
})

describe('aggregate', () => {
  const tasks = [
    t({ effortHours: 2 }), t({ effortHours: 1.5, completedAt: '2026-08-30T22:30:00.000Z' }),   // 31 Aug 00:30 in Zurich: August
    t({ effortHours: 3, project: 'Machine 7', completedAt: '2026-07-02T08:00:00.000Z' }),
    t({ effortHours: 4, project: null }),
    t({ effortHours: 5, completedAt: '2026-06-30T08:00:00.000Z' }),                            // outside the window
    t({ effortHours: 6, done: false }),                                                          // not done
    t({ effortHours: null }), t({ effortHours: 0 }),                                             // unsized
    t({ effortHours: 0.25, project: '  Machine 14 ' })                                          // same machine, sloppy spelling
  ]
  it('sums sized, completed tasks by project and month inside the window', () => {
    const r = cost.aggregate(tasks, { months: 3, now: NOW, hourlyRate: 0 })
    expect(r.months).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(r.byMachine).toEqual([
      { project: 'Unassigned', hours: { '2026-07': 0, '2026-08': 0, '2026-09': 4 }, total: 4, cost: null },
      { project: 'Machine 14', hours: { '2026-07': 0, '2026-08': 1.5, '2026-09': 2.3 }, total: 3.8, cost: null },
      { project: 'Machine 7', hours: { '2026-07': 3, '2026-08': 0, '2026-09': 0 }, total: 3, cost: null }
    ])
    expect(r.byMonth).toEqual({ '2026-07': 3, '2026-08': 1.5, '2026-09': 6.3 })
    expect(r.totalHours).toBe(10.8)
    expect(r.totalCost).toBeNull()
    expect(r.hourlyRate).toBe(0)
  })
  it('puts a cost on every row when the rate is above zero', () => {
    const r = cost.aggregate(tasks, { months: 3, now: NOW, hourlyRate: 120 })
    expect(r.byMachine.find(x => x.project === 'Machine 14').cost).toBe(456)
    expect(r.totalCost).toBe(1296)
  })
  it('clamps the window and copes with nothing', () => {
    expect(cost.aggregate([], { months: 0, now: NOW }).months).toEqual(['2026-07', '2026-08', '2026-09'])   // 0 means the default
    expect(cost.aggregate([], { months: 1, now: NOW }).months).toEqual(['2026-09'])
    expect(cost.aggregate([], { months: 99, now: NOW }).months).toHaveLength(24)
    expect(cost.aggregate([], { months: 'x', now: NOW })).toMatchObject({ byMachine: [], totalHours: 0 })
  })
})

describe('toCsv', () => {
  it('writes a BOM, semicolons, decimal commas and a total row; the cost column only with a rate', () => {
    const data = cost.aggregate([t({ effortHours: 2.5 }), t({ effortHours: 1, project: 'Säge; groß' })], { months: 2, now: NOW, hourlyRate: 0 })
    const csv = cost.toCsv(data)
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Machine;2026-08;2026-09;Total hours')
    expect(lines[1]).toBe('Machine 14;0;2,5;2,5')
    expect(lines[2]).toBe('"Säge; groß";0;1;1')
    expect(lines[3]).toBe('Total;0;3,5;3,5')
    expect(lines[4]).toBe('')
    const withRate = cost.toCsv(cost.aggregate([t({ effortHours: 2 })], { months: 1, now: NOW, hourlyRate: 95.5 }))
    expect(withRate.slice(1).split('\r\n')[0]).toBe('Machine;2026-09;Total hours;Cost CHF at 95,5/h')
    expect(withRate.slice(1).split('\r\n')[1]).toBe('Machine 14;2;2;191')
  })
})

describe('the live routes', () => {
  it('read the store and the rate from Settings', async () => {
    const store = await import('../server/store.js')
    const settings = await import('../server/settings.js')
    const a = store.createTask({ title: 'Sized', project: 'Machine 99', effortHours: 2 })
    store.updateTask(a.id, { done: true })
    settings.update({ hourlyRate: 100 })
    const r = cost.cost(1)
    expect(r.hourlyRate).toBe(100)
    expect(r.byMachine.find(x => x.project === 'Machine 99')).toMatchObject({ total: 2, cost: 200 })
  })
})
