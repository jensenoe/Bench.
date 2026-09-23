import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-lead-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
let lt

beforeAll(async () => { lt = await import('../server/leadtimes.js') })

const tasks = [
  { id: 'a', title: 'rails', supplier: 'Bosch', orderedOn: '2026-08-01', deliveredOn: '2026-08-11' },          // 10
  { id: 'b', title: 'bearings', supplier: ' bosch ', orderedOn: '2026-08-10', deliveredOn: '2026-08-24' },     // 14
  { id: 'c', title: 'belt', supplier: 'BOSCH', orderedOn: '2026-09-01', deliveredOn: '2026-09-07' },           // 6
  { id: 'd', title: 'motor', supplier: 'Maxon', orderedOn: '2026-09-01', deliveredOn: null },                 // open, no sample
  { id: 'e', title: 'typo', supplier: 'Maxon', orderedOn: '2026-09-10', deliveredOn: '2026-09-01' },           // negative, dropped
  { id: 'f', title: 'BOM part', meta: { supplier: 'Igus', orderedOn: '2026-07-01', deliveryDate: '2026-07-22' } }  // 21, from the BOM sync
]

describe('stats', () => {
  it('groups samples per supplier, case and spaces ignored, BOM meta included', () => {
    const s = lt.stats(tasks)
    expect(s.map(x => x.supplier)).toEqual(['Bosch', 'Igus'])
    const bosch = s.find(x => x.key === 'bosch')
    expect(bosch.samples).toEqual([10, 14, 6])
    expect(bosch.median).toBe(10)
    expect(bosch.last).toBe(6)
    expect(bosch.count).toBe(3)
    expect(s.find(x => x.key === 'igus')).toMatchObject({ median: 21, count: 1 })
  })
  it('median of an even count is the mean of the middle two', () => {
    expect(lt.median([4, 10, 6, 20])).toBe(8)
    expect(lt.median([])).toBeNull()
  })
})

describe('suggest', () => {
  it('uses the learned median for a known supplier', () => {
    const r = lt.suggest({ supplier: 'bosch', needBy: '2026-10-16' }, tasks)   // a Friday
    expect(r.basis).toBe('learned')
    expect(r.orderBy).toBe('2026-10-06')
    expect(r.days).toBe(10)
    expect(r.samples).toEqual([10, 14, 6])
  })
  it('falls back to ten working days for an unknown supplier', () => {
    const r = lt.suggest({ supplier: 'Nobody', needBy: '2026-10-16' }, tasks)
    expect(r.basis).toBe('default')
    expect(r.orderBy).toBe('2026-10-02')   // ten working days before Fri 16 Oct is Fri 2 Oct
    expect(r.days).toBe(14)
    expect(r.samples).toEqual([])
  })
  it('never lands an order date on a weekend', () => {
    const r = lt.suggest({ supplier: 'Igus', needBy: '2026-10-24' }, tasks)   // Sat 24 Oct minus 21 = Sat 3 Oct
    expect(r.orderBy).toBe('2026-10-02')
  })
  it('copes without a need-by date', () => {
    const r = lt.suggest({ supplier: 'bosch' }, tasks)
    expect(r.orderBy).toBeNull()
    expect(r.days).toBe(10)
  })
})
