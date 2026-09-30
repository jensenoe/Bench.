import { describe, it, expect } from 'vitest'
import { notAMeeting } from '../server/calendar.js'

describe('lunch in the calendar is not a meeting (roadmap 165)', () => {
  it('drops lunch blocks in English, German and Swiss German, whatever the case and punctuation', () => {
    for (const s of ['Lunch', 'lunch', ' LUNCH ', 'Lunch break', 'Lunch-Break', 'Lunch 🍽', 'Mittag', 'Mittagessen', 'Mittagspause', 'Zmittag', 'Zmittag esse', 'Lunch.']) expect(notAMeeting(s), s).toBe(true)
  })
  it('keeps real meetings that mention lunch', () => {
    for (const s of ['Lunch & Learn: CAD', 'Lunch with Jacob', 'Team lunch planning', 'I-1050 design review', '', null]) expect(notAMeeting(s), String(s)).toBe(false)
  })
})

describe('time in meetings counts overlaps once (roadmap 166)', async () => {
  const { busyMinutes } = await import('../server/calendar.js')
  const day = [
    { subject: 'DAILY', start: '09:00', end: '09:15' },
    { subject: 'Weekly Oetwil', start: '13:00', end: '17:00' },
    { subject: 'Innovation weekly', start: '13:30', end: '15:00' },
    { subject: 'Besprechung Stettbach', start: '14:00', end: '14:30' },
    { subject: 'Lunch', start: '12:00', end: '13:00' },
    { subject: 'Holiday', allDay: true }
  ]
  it('merges overlapping meetings and skips lunch and all-day events', () => {
    expect(busyMinutes(day)).toBe(255)   // 15 min + 4 h, not 6.3 h
  })
  it('counts only what is still ahead from a given time', () => {
    expect(busyMinutes(day, { from: 14 * 60 })).toBe(180)
    expect(busyMinutes(day, { from: 18 * 60 })).toBe(0)
  })
  it('handles back-to-back, empty and broken entries', () => {
    expect(busyMinutes([{ start: '10:00', end: '11:00' }, { start: '11:00', end: '12:00' }])).toBe(120)
    expect(busyMinutes([])).toBe(0)
    expect(busyMinutes([{ start: '', end: '10:00' }, { start: '11:00', end: '10:00' }])).toBe(0)
  })
})
