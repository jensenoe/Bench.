import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// State file lives in BENCH_USER_DIR; no token means punches stay queued and nothing touches Graph.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-clock-'))
process.env.BENCH_USER_DIR = dir
process.env.BENCH_DATA_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null }))

let tc
const local = (y, m, d, h, min) => new Date(y, m - 1, d, h, min, 0, 0)

beforeAll(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(local(2026, 9, 22, 8, 0))   // Tuesday
  tc = await import('../server/timeclock.js')
})
afterAll(() => vi.useRealTimers())

describe('roundFor', () => {
  it('rounds in down, out up, lunch exact', () => {
    const at = (h, m) => local(2026, 9, 22, h, m)
    const hm = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(hm(tc.roundFor('in', at(8, 8)))).toBe('8:05')
    expect(hm(tc.roundFor('in', at(8, 5)))).toBe('8:05')
    expect(hm(tc.roundFor('out', at(17, 1)))).toBe('17:05')
    expect(hm(tc.roundFor('out', at(17, 0)))).toBe('17:00')
    expect(hm(tc.roundFor('out', at(17, 58)))).toBe('18:00')   // rolls the hour
    expect(hm(tc.roundFor('lunchOut', at(12, 7)))).toBe('12:07')
    expect(hm(tc.roundFor('lunchIn', at(12, 43)))).toBe('12:43')
    expect(tc.roundFor('in', new Date(2026, 8, 22, 8, 8, 59, 900)).getSeconds()).toBe(0)
  })
})

describe('summarize', () => {
  const ev = (kind, h, m) => ({ kind, at: local(2026, 9, 22, h, m).toISOString() })
  it('is empty without an in punch', () => {
    expect(tc.summarize([])).toEqual({ worked: 0, breakMs: 0, in: null, out: null, open: false })
  })
  it('counts a full day with a break', () => {
    const s = tc.summarize([ev('in', 8, 0), ev('lunchOut', 12, 0), ev('lunchIn', 12, 30), ev('out', 17, 0)])
    expect(s.worked / 3600000).toBe(8.5)
    expect(s.breakMs / 60000).toBe(30)
    expect(s.open).toBe(false)
  })
  it('measures an open day up to asOf, and an open break as break', () => {
    const s = tc.summarize([ev('in', 8, 0)], local(2026, 9, 22, 10, 30))
    expect(s.worked / 3600000).toBe(2.5)
    expect(s.open).toBe(true)
    const b = tc.summarize([ev('in', 8, 0), ev('lunchOut', 12, 0)], local(2026, 9, 22, 12, 20))
    expect(b.worked / 3600000).toBe(4)
    expect(b.breakMs / 60000).toBe(20)
  })
  it('never goes negative', () => {
    expect(tc.summarize([ev('in', 9, 0), ev('out', 8, 0)]).worked).toBe(0)
  })
})

describe('punch', () => {
  it('walks in, lunch out, lunch in, out and writes the pause column once', async () => {
    vi.setSystemTime(local(2026, 9, 22, 8, 8))
    let s = await tc.punch('in')
    expect(s.status).toBe('in')
    expect(s.events.at(-1)).toMatchObject({ kind: 'in', col: 'C', label: '08:05', written: false })
    expect(s.pending).toBe(1)

    await expect(tc.punch('in')).rejects.toThrow(/cannot in while in/)
    await expect(tc.punch('lunchIn')).rejects.toThrow()

    vi.setSystemTime(local(2026, 9, 22, 12, 3))
    s = await tc.punch('lunchOut')
    expect(s.status).toBe('lunch')
    expect(s.events.at(-1)).toMatchObject({ kind: 'lunchOut', col: 'D', label: '12:03' })
    expect(s.lunch.autoEnd).toBe(true)

    vi.setSystemTime(local(2026, 9, 22, 12, 41))
    s = await tc.punch('lunchIn')
    expect(s.status).toBe('in')
    const kinds = s.events.map(e => e.kind)
    expect(kinds).toEqual(['in', 'lunchOut', 'lunchIn', 'pause'])
    expect(s.events.find(e => e.kind === 'pause')).toMatchObject({ col: 'G', value: 0, auto: true })

    await expect(tc.punch('lunchOut')).rejects.toThrow(/already recorded/)

    vi.setSystemTime(local(2026, 9, 22, 17, 1))
    s = await tc.punch('out')
    expect(s.status).toBe('out')
    expect(s.events.at(-1)).toMatchObject({ kind: 'out', col: 'F', label: '17:05' })
    expect(s.events.at(-1).value).toBeCloseTo((17 * 60 + 5) / 1440, 6)
    expect(fs.existsSync(path.join(dir, 'timeclock.json'))).toBe(true)
  })

  it('rolls over at midnight: yesterday goes to history, unwritten punches carry over', async () => {
    vi.setSystemTime(local(2026, 9, 23, 7, 30))
    const s = tc.snapshot()
    expect(s.date).toBe('2026-09-23')
    expect(s.status).toBe('off')
    expect(s.events).toEqual([])
    expect(s.unclosed).toBeNull()          // yesterday was closed properly
    expect(s.pending).toBe(5)              // 5 punches from yesterday still wait for a token
    const week = tc.days(7)
    expect(week).toHaveLength(7)
    expect(week.at(-1)).toMatchObject({ date: '2026-09-23', today: true, worked: 0 })
    const y = week.at(-2)
    expect(y.date).toBe('2026-09-22')
    expect(y.open).toBe(false)
    expect(Math.round(y.worked / 60000)).toBe((12 * 60 + 3 - (8 * 60 + 5)) + (17 * 60 + 5 - (12 * 60 + 41)))
  })

  it('flags a day left open and closes the afternoon when clocking out mid-break', async () => {
    vi.setSystemTime(local(2026, 9, 23, 8, 0))
    await tc.punch('in')
    vi.setSystemTime(local(2026, 9, 24, 9, 0))
    const s = tc.snapshot()
    expect(s.unclosed).toEqual({ date: '2026-09-23', status: 'in' })
    const hist = tc.days(3).find(d => d.date === '2026-09-23')
    expect(hist.open).toBe(true)

    await tc.punch('in')
    vi.setSystemTime(local(2026, 9, 24, 12, 10))
    await tc.punch('lunchOut')
    vi.setSystemTime(local(2026, 9, 24, 12, 20))
    const out = await tc.punch('out')
    const kinds = out.events.map(e => e.kind)
    expect(kinds).toEqual(['in', 'lunchOut', 'out', 'lunchIn', 'pause'])
    expect(out.events.find(e => e.kind === 'lunchIn').label).toBe('12:20')
  })

  it('resetToday wipes the punches but keeps the open-day warning', () => {
    const s = tc.resetToday()
    expect(s.events).toEqual([])
    expect(s.status).toBe('off')
    expect(s.unclosed).toEqual({ date: '2026-09-23', status: 'in' })
  })
})
