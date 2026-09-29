import { describe, it, expect } from 'vitest'
import { composeHero, nextMeeting } from '../server/hero.js'

const at = (h, m = 0, day = 23) => new Date(2026, 8, day, h, m, 0)   // Wed 23 Sep 2026 unless day says otherwise
const base = { status: 'in', hoursIn: 2, outAt: null, tickedToday: 0, tickedYesterday: 3, workedYesterday: 7 * 3600000 + 40 * 60000, todayOpen: 2, todayDone: 1, arrivals: [], deliveries: [], meetings: [], weekWorked: 21 * 3600000 + 10 * 60000, lastDecision: null, lunchAt: '12:00' }
const text = r => r.lines.map(l => l.text).join(' ')

describe('the hero briefing', () => {
  it('a late clock is the whole line', () => {
    const r = composeHero({ ...base, hoursIn: 11 }, at(19, 40))
    expect(r.variant).toBe('late')
    expect(text(r)).toBe('Still on the clock at 19:40, 11 hours in. Close the day.')
  })
  it('a weekend off the clock says so and nothing else', () => {
    const r = composeHero({ ...base, status: 'off' }, at(10, 0, 26))   // Saturday
    expect(r.variant).toBe('weekend')
    expect(text(r)).toBe('Saturday. The bench can wait.')
  })
  it('a meeting inside 45 minutes comes first', () => {
    const r = composeHero({ ...base, meetings: [{ subject: 'Weekly', start: '10:20', location: 'Sitzungszimmer' }] }, at(10, 0))
    expect(r.lines[0]).toEqual({ kind: 'meeting', text: 'Weekly in 20 minutes, Sitzungszimmer.' })
  })
  it('the morning looks back at yesterday and at what arrived overnight', () => {
    const r = composeHero({ ...base, arrivals: [{ title: 'Ticket', tool: 'Issues' }, { title: 'Ticket 2', tool: 'Issues' }] }, at(8, 15))
    expect(text(r)).toBe('Yesterday: three ticked, 7:40 on the clock. Two new from Issues overnight.')
  })
  it('the morning counts the meetings when nothing arrived', () => {
    const r = composeHero({ ...base, meetings: [{ subject: 'Weekly', start: '09:30' }, { subject: 'Review', start: '14:00' }] }, at(8, 0))
    expect(r.lines[1].text).toBe('Two meetings today, the first at 09:30.')
  })
  it('a delivery today is good news, said in one line', () => {
    const r = composeHero({ ...base, deliveries: [{ title: 'The linear rails', arrived: false }] }, at(14, 0))
    expect(r.lines[0].text).toBe('The linear rails arrives today.'.replace('arrives', 'arrives'))
  })
  it('half an hour before lunch it says so', () => {
    const r = composeHero(base, at(11, 40))
    expect(r.lines[0]).toEqual({ kind: 'lunch', text: 'Lunch at twelve.' })
  })
  it('lunch in the calendar is said once, not twice (roadmap 156)', () => {
    const r = composeHero({ ...base, meetings: [{ subject: 'Lunch', start: '12:00', end: '13:00' }] }, at(11, 54))
    expect(r.lines.filter(l => /lunch/i.test(l.text))).toHaveLength(1)
    expect(r.lines[0].kind).toBe('meeting')
  })
  it('the afternoon is progress and the week on the clock', () => {
    const r = composeHero(base, at(14, 30))
    expect(text(r)).toBe('One of three ticked. 21:10 on the clock this week.')
    expect(composeHero({ ...base, todayOpen: 0, todayDone: 3 }, at(15, 0)).lines[0].text).toBe('Three of three ticked. Today is clear.')
  })
  it('the evening closes the day, and Friday points at the review', () => {
    expect(composeHero({ ...base, tickedToday: 4 }, at(17, 30)).lines[0].text).toBe('Four ticked today. Time to close the day.')
    const out = composeHero({ ...base, status: 'out', outAt: '17:05', tickedToday: 4 }, at(17, 30, 25))   // Friday
    expect(text(out)).toBe("Clocked out at 17:05. Four ticked today. The week's review is ready.")
  })
  it('with nothing to say, the last decision; with none, quiet', () => {
    const quiet = { ...base, status: 'off', tickedYesterday: 0, workedYesterday: 0, weekWorked: 0, todayOpen: 0, todayDone: 0 }
    expect(composeHero(quiet, at(15, 0)).variant).toBe('quiet')
    const r = composeHero({ ...quiet, lastDecision: { text: 'Use the 24 V relay', entry: 'Weekly', date: '2026-09-22' } }, at(15, 0))
    expect(r.lines[0].text).toBe('Last decision: Use the 24 V relay (Weekly, Tue 22 Sep).')
  })
  it('never mentions an order date', () => {
    for (const h of [8, 11, 14, 18]) expect(text(composeHero(base, at(h)))).not.toMatch(/order|due|slip/i)
  })
  it('nextMeeting ignores all-day and past meetings', () => {
    const m = [{ subject: 'All day', allDay: true, start: '00:00' }, { subject: 'Past', start: '09:00' }, { subject: 'Soon', start: '10:30' }]
    expect(nextMeeting(m, at(10, 0)).subject).toBe('Soon')
    expect(nextMeeting(m, at(12, 0))).toBeNull()
  })
})
