import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-clock2-'))
process.env.BENCH_USER_DIR = dir
process.env.BENCH_DATA_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null }))

let tc
const local = (y, m, d, h, min) => new Date(y, m - 1, d, h, min, 0, 0)
beforeAll(async () => { vi.useFakeTimers(); vi.setSystemTime(local(2026, 9, 21, 8, 0)); tc = await import('../server/timeclock.js') })
afterAll(() => vi.useRealTimers())

describe('plainError', () => {
  it('translates the common Graph failures', () => {
    expect(tc.plainError(new Error('Graph 401 on /me/drive/root:/x:/workbook/worksheets'))).toMatch(/Not signed in/)
    expect(tc.plainError(new Error('Graph 404 on /me/drive/root:/Documents/x.xlsx:/workbook/worksheets?$select=name itemNotFound'))).toMatch(/Workbook not found/)
    expect(tc.plainError(new Error("Graph 404 on /worksheets('September')/range(address='C29')"))).toMatch(/sheet or the cell/)
    expect(tc.plainError(new Error('No sheet for September in the 2026 workbook'))).toMatch(/named differently/)
    expect(tc.plainError(new Error('fetch failed'))).toMatch(/Offline/)
    expect(tc.plainError(new Error('something else'))).toBe('something else')
  })
})

describe('an open day', () => {
  it('is closed after the fact with an out punch on that date', async () => {
    await tc.punch('in')                                 // Mon 21 Sep 08:00
    vi.setSystemTime(local(2026, 9, 22, 7, 45))          // Tue
    let s = tc.snapshot()
    expect(s.unclosed).toEqual({ date: '2026-09-21', status: 'in' })
    s = tc.closeUnclosed('17:30')
    expect(s.unclosed).toBeNull()
    const mon = tc.days(3).find(d => d.date === '2026-09-21')
    expect(mon.open).toBe(false)
    expect(Math.round(mon.worked / 60000)).toBe(9 * 60 + 30)
    expect(s.pending).toBe(2)                            // Monday's in and its late out both wait for a token
    const m = tc.month('2026-09')
    expect(m.sheet).toBe('September')
    expect(m.days).toHaveLength(30)
    const row = m.days.find(d => d.date === '2026-09-21')
    expect(row.pending).toBe(2)
    expect(row.worked).toBe(mon.worked)
    expect(m.days.find(d => d.date === '2026-09-22').today).toBe(true)
    expect(m.days.find(d => d.date === '2026-09-30').future).toBe(true)
  })
  it('a day left on lunch gets its lunch-in as well', async () => {
    await tc.punch('in')
    vi.setSystemTime(local(2026, 9, 22, 12, 5))
    await tc.punch('lunchOut')
    vi.setSystemTime(local(2026, 9, 23, 9, 0))
    expect(tc.snapshot().unclosed).toEqual({ date: '2026-09-22', status: 'lunch' })
    tc.closeUnclosed('16:00')
    const kinds = tc.snapshot().pending
    expect(kinds).toBeGreaterThanOrEqual(5)              // in, lunchOut, lunchIn, pause, out from Tuesday plus Monday's two
    expect(tc.snapshot().unclosed).toBeNull()
  })
  it('can also be waved away', async () => {
    await tc.punch('in')
    vi.setSystemTime(local(2026, 9, 24, 9, 0))
    expect(tc.snapshot().unclosed?.date).toBe('2026-09-23')
    expect(tc.dismissUnclosed().unclosed).toBeNull()
  })
})
