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
