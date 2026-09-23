import { describe, it, expect, beforeEach } from 'vitest'

// A stand-in for the browser's localStorage, so the store's persistence can be checked in Node.
const mem = new Map()
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) }
const focus = await import('../src/focus.js')

const T0 = 1_700_000_000_000
const MIN = 60_000

describe('focus store', () => {
  beforeEach(() => { focus.stop(); mem.clear() })

  it('starts with the full length and counts down from startedAt', () => {
    focus.start({ taskId: 'a', title: 'Wire the panel', minutes: 25 }, T0)
    expect(focus.remaining(focus.get(), T0)).toBe(25 * MIN)
    expect(focus.remaining(focus.get(), T0 + 10 * MIN)).toBe(15 * MIN)
    expect(focus.remaining(focus.get(), T0 + 40 * MIN)).toBe(0)
    expect(focus.isRunning()).toBe(true)
  })

  it('pauses, holds, resumes from where it stopped', () => {
    focus.start({ taskId: 'a', title: 't', minutes: 25 }, T0)
    focus.pause(T0 + 5 * MIN)
    expect(focus.get().pausedAt).toBe(T0 + 5 * MIN)
    expect(focus.get().remainingMs).toBe(20 * MIN)
    expect(focus.remaining(focus.get(), T0 + 60 * MIN)).toBe(20 * MIN)   // time does not pass while paused
    expect(focus.isRunning()).toBe(false)
    focus.resume(T0 + 60 * MIN)
    expect(focus.get().pausedAt).toBeNull()
    expect(focus.remaining(focus.get(), T0 + 70 * MIN)).toBe(10 * MIN)
    focus.pause(T0 + 70 * MIN); focus.pause(T0 + 80 * MIN)   // a second pause changes nothing
    expect(focus.get().remainingMs).toBe(10 * MIN)
  })

  it('persists to localStorage and stop clears it', () => {
    focus.start({ taskId: 'a', title: 't', minutes: 50 }, T0)
    const saved = JSON.parse(mem.get('bench.focus'))
    expect(saved).toMatchObject({ taskId: 'a', title: 't', minutes: 50, startedAt: T0, pausedAt: null, remainingMs: 50 * MIN })
    const was = focus.stop()
    expect(was.taskId).toBe('a')
    expect(focus.get()).toBeNull()
    expect(mem.has('bench.focus')).toBe(false)
  })

  it('tells subscribers about every change and lets them leave', () => {
    const seen = []
    const off = focus.subscribe(s => seen.push(s ? s.taskId : null))
    focus.start({ taskId: 'b', title: 't', minutes: 15 }, T0)
    focus.pause(T0 + MIN)
    focus.stop()
    off()
    focus.start({ taskId: 'c', title: 't', minutes: 15 }, T0)
    expect(seen).toEqual(['b', 'b', null])
  })

  it('formats and rounds', () => {
    expect(focus.mmss(24 * MIN + 59_000)).toBe('24:59')
    expect(focus.mmss(0)).toBe('00:00')
    expect(focus.mmss(1500)).toBe('00:02')   // rounds up so the last second reads 00:01, not 00:00
    expect(focus.quarterHours(25 / 60)).toBe(0.5)
    expect(focus.quarterHours(15 / 60)).toBe(0.25)
    expect(focus.quarterHours(50 / 60)).toBe(0.75)
    expect(focus.quarterHours(90 / 60)).toBe(1.5)
    expect(focus.quarterHours(1 / 60)).toBe(0.25)   // a finished timer is never worth nothing
    expect(focus.addEffort(2, 25)).toBe(2.5)
    expect(focus.addEffort(null, 50)).toBe(0.75)
    expect(focus.addEffort('1.5', 90)).toBe(3)
  })
})
