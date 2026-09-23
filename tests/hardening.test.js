import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * The hardening batch (roadmap 101 and 102): quiet hours as a pure function the desktop shell requires,
 * and the light /api/counts answer the tray polls.
 */
const require = createRequire(import.meta.url)
const { isQuiet, minutes } = require('../electron/quiet.cjs')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-hardening-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => false, adminConsentUrl: () => null }))

// local times on a known week: Mon 21 Sep 2026 to Sun 27 Sep 2026
const at = (day, h, m = 0) => new Date(2026, 8, day, h, m, 0)
const QUIET = { quietFrom: '19:00', quietTo: '07:00', quietWeekends: true }

describe('isQuiet', () => {
  it('parses HH:MM and refuses the rest', () => {
    expect(minutes('07:30')).toBe(450)
    expect(minutes('7:05')).toBe(425)
    expect(minutes('24:00')).toBeNull()
    expect(minutes('19')).toBeNull()
    expect(minutes('')).toBeNull()
    expect(minutes(undefined)).toBeNull()
  })
  it('is quiet inside a range that crosses midnight, on both sides of it', () => {
    expect(isQuiet(at(22, 19, 0), QUIET)).toBe(true)     // the first quiet minute
    expect(isQuiet(at(22, 23, 59), QUIET)).toBe(true)
    expect(isQuiet(at(23, 0, 0), QUIET)).toBe(true)
    expect(isQuiet(at(23, 6, 59), QUIET)).toBe(true)
    expect(isQuiet(at(23, 7, 0), QUIET)).toBe(false)     // the first loud minute
    expect(isQuiet(at(23, 12, 30), QUIET)).toBe(false)
    expect(isQuiet(at(23, 18, 59), QUIET)).toBe(false)
  })
  it('handles a range inside one day', () => {
    const s = { quietFrom: '12:00', quietTo: '13:00', quietWeekends: false }
    expect(isQuiet(at(23, 11, 59), s)).toBe(false)
    expect(isQuiet(at(23, 12, 0), s)).toBe(true)
    expect(isQuiet(at(23, 12, 59), s)).toBe(true)
    expect(isQuiet(at(23, 13, 0), s)).toBe(false)
  })
  it('drops everything on Saturday and Sunday when quietWeekends is on, and only then', () => {
    expect(isQuiet(at(26, 10, 0), QUIET)).toBe(true)     // Saturday midday
    expect(isQuiet(at(27, 15, 0), QUIET)).toBe(true)     // Sunday afternoon
    expect(isQuiet(at(26, 10, 0), { ...QUIET, quietWeekends: false })).toBe(false)
    expect(isQuiet(at(25, 10, 0), QUIET)).toBe(false)    // Friday midday
  })
  it('is never quiet with no usable range and no quiet weekend', () => {
    expect(isQuiet(at(23, 3, 0), {})).toBe(false)
    expect(isQuiet(at(23, 3, 0), { quietFrom: '19:00', quietTo: '' })).toBe(false)
    expect(isQuiet(at(23, 3, 0), { quietFrom: '19:00', quietTo: '19:00' })).toBe(false)   // equal times: no range
    expect(isQuiet(at(23, 3, 0), { quietFrom: 'late', quietTo: 'early' })).toBe(false)
    expect(isQuiet(new Date('nonsense'), QUIET)).toBe(false)
  })
  it('takes an ISO string or a timestamp as well as a Date', () => {
    expect(isQuiet(at(23, 3, 0).toISOString(), QUIET)).toBe(true)
    expect(isQuiet(at(23, 12, 0).getTime(), QUIET)).toBe(false)
  })
})

describe('counts', () => {
  let core, store, timeclock
  beforeAll(async () => {
    store = await import('../server/store.js')
    timeclock = await import('../server/timeclock.js')
    core = await import('../server/core.js')
  })
  it('answers with Today against its cap, the open count and the clock, without touching auth', async () => {
    store.createTask({ title: 'a', lane: 'today' })
    store.createTask({ title: 'b', lane: 'today' })
    store.createTask({ title: 'c', lane: 'active' })
    const done = store.createTask({ title: 'd', lane: 'active' })
    store.updateTask(done.id, { done: true })
    const c = core.counts()
    expect(c).toMatchObject({ today: 2, open: 3, todayCap: 5 })
    expect(c.clock).toMatchObject({ status: 'off', in: null, since: null })
  })
  it('carries the time of the punch that set the status', async () => {
    await timeclock.punch('in', new Date(2026, 8, 23, 8, 2))
    let c = core.counts()
    expect(c.clock.status).toBe('in')
    expect(c.clock.in).toMatch(/^\d{2}:\d{2}$/)
    expect(c.clock.since).toBe(c.clock.in)
    await timeclock.punch('lunchOut', new Date(2026, 8, 23, 12, 0))
    c = core.counts()
    expect(c.clock.status).toBe('lunch')
    expect(c.clock.since).toBe('12:00')
    expect(c.clock.in).not.toBe('12:00')
  })
  it('is registered as GET /api/counts', () => {
    const routes = []
    const app = { get: (p) => routes.push(p), post: () => {}, put: () => {}, delete: () => {} }
    core.registerRoutes(app)
    expect(routes).toContain('/api/counts')
  })
})
