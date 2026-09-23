import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-drift-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => true }))
let drift

beforeAll(async () => { drift = await import('../server/drift.js') })

const at = (h, m) => new Date(2026, 8, 22, h, m).toISOString()
const frac = (h, m) => (h * 60 + m) / 1440
const day = { date: '2026-09-22', in: at(8, 5), out: at(17, 5), breakMs: 30 * 60000 }

describe('cellMinutes', () => {
  it('reads Excel fractions and typed text, and treats empty as nothing', () => {
    expect(drift.cellMinutes(frac(8, 5))).toBe(485)
    expect(drift.cellMinutes(45000 + frac(12, 30))).toBe(750)   // a date-time serial: only the time part counts
    expect(drift.cellMinutes('08:05')).toBe(485)
    expect(drift.cellMinutes('8.05')).toBe(485)
    expect(drift.cellMinutes('')).toBeNull()
    expect(drift.cellMinutes(null)).toBeNull()
  })
})

describe('compare', () => {
  it('is quiet when the sheet matches to the minute', () => {
    const rows = drift.compare([day], { '2026-09-22': [frac(8, 5), frac(12, 0), frac(12, 30), frac(17, 5), 0] })
    expect(rows).toEqual([])
    // one minute off is inside the tolerance
    expect(drift.compare([day], { '2026-09-22': [frac(8, 6), frac(12, 0), frac(12, 31), frac(17, 4), 0] })).toEqual([])
  })
  it('names the field, both values, and an empty sheet cell', () => {
    const rows = drift.compare([day], { '2026-09-22': [frac(8, 0), frac(12, 0), frac(12, 45), '', 0] })
    expect(rows).toEqual([
      { date: '2026-09-22', field: 'in', bench: '08:05', sheet: '08:00' },
      { date: '2026-09-22', field: 'out', bench: '17:05', sheet: '' },
      { date: '2026-09-22', field: 'break', bench: '00:30', sheet: '00:45' }
    ])
  })
  it('counts the Pause column into the break and skips days the sheet does not have', () => {
    const rows = drift.compare([day, { date: '2026-09-23', in: at(8, 0), out: null, breakMs: 0 }], { '2026-09-22': [frac(8, 5), '', '', frac(17, 5), frac(0, 30)] })
    expect(rows).toEqual([])
  })
  it('an open day only compares the in', () => {
    const rows = drift.compare([{ date: '2026-09-22', in: at(8, 5), out: null, breakMs: 0 }], { '2026-09-22': [frac(9, 0), '', '', '', ''] })
    expect(rows).toEqual([{ date: '2026-09-22', field: 'in', bench: '08:05', sheet: '09:00' }])
  })
})

describe('check', () => {
  it('needs a sign-in and never throws', async () => {
    const r = await drift.check('2026-09')
    expect(r).toMatchObject({ ok: false, rows: [], reason: 'needs-signin' })
    expect(r.checkedAt).toBeTruthy()
    expect(await drift.check('2026-09')).toBe(r)   // cached
    expect((await drift.check('2026-09', { force: true })).checkedAt >= r.checkedAt).toBe(true)
  })
})
