import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-nudges-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const N = await import('../server/nudges.js')
const A = await import('../server/auth.js')

// Tuesday 29 Sep 2026, local time
const at = (hm) => new Date(`2026-09-29T${hm}:00`)
const base = (over = {}) => ({ on: true, status: 'in', since: at('08:00').toISOString(), meetings: [], temp: 18, quietFrom: '19:00', quietTo: '07:00', quietWeekends: true, day: { count: 0 }, ...over })

describe('when a nudge fits (roadmap 139)', () => {
  it('stays quiet off the clock, at lunch, in a meeting, on a weekend, in the quiet hours and when switched off', () => {
    expect(N.decide(base({ on: false }), 'tick', at('09:00'))).toBe(null)
    expect(N.decide(base({ status: 'off' }), 'tick', at('09:00'))).toBe(null)
    expect(N.decide(base({ status: 'lunch' }), 'tick', at('12:15'))).toBe(null)
    expect(N.decide(base({ meetings: [{ subject: 'Review', start: '08:45', end: '09:30' }] }), 'tick', at('09:00'))).toBe(null)
    expect(N.decide(base(), 'tick', new Date('2026-10-03T10:00:00'))).toBe(null)   // a Saturday
    expect(N.decide(base(), 'tick', at('19:30'))).toBe(null)
    expect(N.inQuiet(at('06:30'), '19:00', '07:00')).toBe(true)
    expect(N.inQuiet(at('12:00'), '19:00', '07:00')).toBe(false)
  })
  it('holds the cap, the gap and Not now', () => {
    expect(N.decide(base({ day: { count: 4 } }), 'tick', at('11:00'))).toBe(null)
    expect(N.decide(base({ day: { count: 1, last: at('10:30').toISOString() } }), 'tick', at('11:00'))).toBe(null)
    expect(N.decide(base({ day: { count: 1, last: at('09:30').toISOString() } }), 'tick', at('11:00'))).not.toBe(null)
    expect(N.decide(base({ day: { count: 0, snoozeUntil: at('11:30').toISOString() } }), 'tick', at('11:00'))).toBe(null)
  })
  it('coffee in the morning and the dip, not twice in a row, never after three', () => {
    expect(N.decide(base(), 'tick', at('09:00')).kind).toBe('coffee')
    expect(N.decide(base({ day: { count: 1, lastKind: 'coffee', last: at('07:30').toISOString(), coffees: 1 } }), 'tick', at('09:00')).kind).toBe('water')
    expect(N.decide(base({ day: { count: 1, lastKind: 'water', last: at('11:00').toISOString(), coffees: 1 } }), 'tick', at('14:00')).kind).toBe('coffee')
    expect(N.decide(base({ day: { count: 2, lastKind: 'water', coffees: 2 } }), 'tick', at('14:00')).kind).toBe('water')
    for (const hm of ['15:10', '16:40', '18:20']) expect(['water', 'tea']).toContain(N.decide(base(), 'tick', at(hm)).kind)
  })
  it('a warm day is water only, and sooner', () => {
    const n = N.decide(base({ temp: 29 }), 'tick', at('09:00'))
    expect(n.kind).toBe('water')
    expect(N.decide(base({ temp: 29, day: { count: 1, last: at('08:05').toISOString() } }), 'tick', at('09:00'))).not.toBe(null)   // 55 minutes is enough when hot
  })
  it('before a long meeting, and after a long stretch', () => {
    const b = N.decide(base({ meetings: [{ subject: 'Design review', start: '10:10', end: '11:30' }] }), 'before', at('10:00'))
    expect(b.text).toContain('Design review')
    expect(b.text).toContain('10 minutes')
    expect(N.decide(base({ meetings: [{ subject: 'Standup', start: '10:10', end: '10:25' }] }), 'before', at('10:00'))).toBe(null)
    expect(N.decide(base(), 'stretch', at('09:00'))).toBe(null)
    const s = N.decide(base(), 'stretch', at('09:35'))
    expect(s.kind).toBe('pause')
  })
  it('records what it gave, and Not now pushes the next one back', async () => {
    const s = N.later(at('11:00'))
    expect(new Date(s.snoozeUntil).getTime()).toBe(at('12:00').getTime())
  })
})

describe('the admin approval link (roadmap 138)', () => {
  it('names the four permissions, never Mail.Read, and sends the admin back to the native reply address', () => {
    const u = decodeURIComponent(A.adminConsentUrl())
    expect(u).toContain('/v2.0/adminconsent?client_id=')
    for (const s of ['Tasks.ReadWrite', 'Files.ReadWrite', 'Calendars.Read', 'Sites.Read.All']) expect(u).toContain(`https://graph.microsoft.com/${s}`)
    expect(u).not.toContain('Mail.Read')
    expect(u).toContain('redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient')
    expect(A.approval().scopes.map(x => x.scope)).toEqual(['Tasks.ReadWrite', 'Files.ReadWrite', 'Calendars.Read', 'Sites.Read.All'])
    expect(A.scopes().some(s => s.endsWith('Mail.Read'))).toBe(true)   // still asked for, on its own
  })
})
