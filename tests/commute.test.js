import { describe, it, expect } from 'vitest'
import { reduceRoute, worstIncident, line, directionFor } from '../server/commute.js'

describe('the drive home', () => {
  it('reduces a TomTom route to minutes, the usual and the delay', () => {
    const r = reduceRoute({ routes: [{ summary: { lengthInMeters: 41200, travelTimeInSeconds: 41 * 60 + 20, noTrafficTravelTimeInSeconds: 26 * 60, trafficDelayInSeconds: 900 } }] })
    expect(r).toEqual({ minutes: 41, usual: 26, delay: 15, km: 41 })
    expect(reduceRoute({})).toBeNull()
  })
  it('picks the worst incident and names the road and the place', () => {
    const w = worstIncident({ incidents: [
      { properties: { delay: 120, from: 'Wallisellen', roadNumbers: ['A1'], events: [{ description: 'Stau' }] } },
      { properties: { delay: 600, from: 'Brüttisellen', to: 'Effretikon', roadNumbers: ['A53'], events: [{ description: 'Stockender Verkehr' }] } },
      { properties: { delay: 0, from: 'nowhere' } }
    ] })
    expect(w).toEqual({ road: 'A53', where: 'Brüttisellen', what: 'Stockender Verkehr', delayMin: 10 })
    expect(worstIncident({ incidents: [] })).toBeNull()
  })
  it('says clear roads under five minutes of delay, otherwise the extra and the spot', () => {
    expect(line({ minutes: 27, usual: 26, delay: 1 }, 'home')).toBe('Home in 27 minutes, clear roads.')
    expect(line({ minutes: 41, usual: 26, delay: 15, worst: { road: 'A1', where: 'Wallisellen', what: 'Stau' } }, 'home')).toBe('Home in 41 minutes, 15 more than usual: A1 at Wallisellen, stau.')
    expect(line({ minutes: 33, usual: 26, delay: 7, worst: null }, 'in')).toBe('The drive in: 33 minutes, 7 more than usual.')
    expect(line(null)).toBeNull()
  })
  it('knows which drive matters when', () => {
    const at = (h, m = 0) => new Date(2026, 8, 28, h, m)
    expect(directionFor(at(7, 30), 'off')).toBe('in')
    expect(directionFor(at(7, 30), 'in')).toBeNull()
    expect(directionFor(at(12, 0), 'in')).toBeNull()
    expect(directionFor(at(16, 10), 'in')).toBe('home')
    expect(directionFor(at(17, 30), 'out')).toBe('home')
    expect(directionFor(at(17, 30), 'off')).toBeNull()
  })
})
