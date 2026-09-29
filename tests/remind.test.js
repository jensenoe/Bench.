import { describe, it, expect } from 'vitest'
import { presets, remindLabel, toLocalInput, fromLocalInput } from '../src/remind.js'

const WED_10 = new Date(2026, 8, 30, 10, 0)

describe('Remind me presets', () => {
  it('in an hour, this afternoon at 14:00, tomorrow at 08:30', () => {
    const p = presets(WED_10)
    expect(p.map(x => x.key)).toEqual(['hour', 'afternoon', 'tomorrow'])
    expect(p[0].iso).toBe(new Date(2026, 8, 30, 11, 0).toISOString())
    expect(p[1].iso).toBe(new Date(2026, 8, 30, 14, 0).toISOString())
    expect(p[2].iso).toBe(new Date(2026, 9, 1, 8, 30).toISOString())
  })
  it('drops this afternoon once 14:00 has passed', () => {
    expect(presets(new Date(2026, 8, 30, 14, 0)).map(x => x.key)).toEqual(['hour', 'tomorrow'])
  })
  it('reads the card chip short', () => {
    expect(remindLabel(new Date(2026, 8, 30, 14, 0).toISOString(), WED_10)).toBe('14:00')
    expect(remindLabel(new Date(2026, 9, 1, 8, 30).toISOString(), WED_10)).toBe('tomorrow 08:30')
    expect(remindLabel(new Date(2026, 9, 5, 9, 0).toISOString(), WED_10)).toBe('Mon 5 Oct 09:00')
    expect(remindLabel(new Date(2026, 8, 30, 9, 0).toISOString(), WED_10)).toBe('now')
    expect(remindLabel('nonsense', WED_10)).toBe('')
  })
  it('goes to and from the picker in local time', () => {
    const iso = new Date(2026, 9, 2, 16, 45).toISOString()
    expect(toLocalInput(iso)).toBe('2026-10-02T16:45')
    expect(fromLocalInput('2026-10-02T16:45')).toBe(iso)
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('2 Oct')).toBeNull()
  })
})
