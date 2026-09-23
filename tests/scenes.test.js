import { describe, it, expect, beforeEach } from 'vitest'
import { sunTimes, keyFor, isDark, setCadence, getCadence, nextChange, setCollections, getCollections, libraryFor, imageFor, sceneFor, sceneAt, lunchScene, cockpitCover, credits, COLLECTIONS, DEFAULT_COLLECTIONS, setPictureMode, setLibraryShift, nextLibrary } from '../src/scenes.js'

// vitest.config.js pins TZ to Europe/Zurich; these are local wall-clock times in Oetwil am See.
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0, 0)
const minutes = d => d.getHours() * 60 + d.getMinutes()

describe('sunTimes', () => {
  it('midsummer: sun up around half past five, down around half past nine', () => {
    const { sunrise, sunset } = sunTimes(local(2026, 6, 21))
    expect(minutes(sunrise)).toBeGreaterThan(5 * 60 + 15)
    expect(minutes(sunrise)).toBeLessThan(5 * 60 + 50)
    expect(minutes(sunset)).toBeGreaterThan(21 * 60 + 10)
    expect(minutes(sunset)).toBeLessThan(21 * 60 + 45)
  })
  it('midwinter: sun up around eight, down before five', () => {
    const { sunrise, sunset } = sunTimes(local(2026, 12, 21))
    expect(minutes(sunrise)).toBeGreaterThan(7 * 60 + 50)
    expect(minutes(sunrise)).toBeLessThan(8 * 60 + 25)
    expect(minutes(sunset)).toBeGreaterThan(16 * 60 + 25)
    expect(minutes(sunset)).toBeLessThan(16 * 60 + 55)
  })
  it('returns the same calendar day', () => {
    const d = local(2026, 9, 22)
    const { sunrise, sunset } = sunTimes(d)
    expect(sunrise.getDate()).toBe(22)
    expect(sunset.getDate()).toBe(22)
    expect(sunrise < sunset).toBe(true)
  })
})

describe('keyFor', () => {
  it('maps bare hours to the four scenes', () => {
    expect(keyFor(4)).toBe('night')
    expect(keyFor(5)).toBe('dawn')
    expect(keyFor(8)).toBe('dawn')
    expect(keyFor(9)).toBe('day')
    expect(keyFor(16)).toBe('day')
    expect(keyFor(17)).toBe('dusk')
    expect(keyFor(20)).toBe('dusk')
    expect(keyFor(21)).toBe('night')
  })
  it('follows the real sun for dates', () => {
    const d = local(2026, 9, 22)
    const { sunrise, sunset } = sunTimes(d)
    const m = 60000
    expect(keyFor(new Date(sunrise.getTime() - 50 * m))).toBe('night')
    expect(keyFor(new Date(sunrise.getTime() - 30 * m))).toBe('dawn')
    expect(keyFor(new Date(sunrise.getTime() + 59 * m))).toBe('dawn')
    expect(keyFor(new Date(sunrise.getTime() + 61 * m))).toBe('day')
    expect(keyFor(local(2026, 9, 22, 12, 0))).toBe('day')
    expect(keyFor(new Date(sunset.getTime() - 30 * m))).toBe('dusk')
    expect(keyFor(new Date(sunset.getTime() + 39 * m))).toBe('dusk')
    expect(keyFor(new Date(sunset.getTime() + 41 * m))).toBe('night')
    expect(keyFor(local(2026, 9, 22, 3, 0))).toBe('night')
    expect(isDark(local(2026, 9, 22, 3, 0))).toBe(true)
    expect(isDark(local(2026, 9, 22, 12, 0))).toBe(false)
  })
})

describe('slots', () => {
  beforeEach(() => { setCadence(20); setCollections(DEFAULT_COLLECTIONS) })

  it('accepts only the known cadences', () => {
    setCadence(30); expect(getCadence()).toBe(30)
    setCadence(7); expect(getCadence()).toBe(20)
    setCadence('60'); expect(getCadence()).toBe(60)
  })
  it('nextChange lands on the next cadence boundary', () => {
    expect(minutes(nextChange(local(2026, 9, 22, 10, 7)))).toBe(10 * 60 + 20)
    expect(minutes(nextChange(local(2026, 9, 22, 10, 59)))).toBe(11 * 60)
    expect(minutes(nextChange(local(2026, 9, 22, 10, 20)))).toBe(10 * 60 + 40)
    setCadence(60)
    expect(minutes(nextChange(local(2026, 9, 22, 10, 20)))).toBe(11 * 60)
  })
  it('a single enabled library is always the answer; unknown keys fall back', () => {
    setCollections(['alps'])
    expect(libraryFor(local(2026, 9, 22, 10, 0))).toBe('alps')
    expect(libraryFor(local(2026, 9, 23, 15, 0), 4)).toBe('alps')
    setCollections(['nope'])
    expect(getCollections()).toEqual(DEFAULT_COLLECTIONS)
    setCollections([])
    expect(getCollections()).toEqual(DEFAULT_COLLECTIONS)
  })
  it('the picture is stable inside a slot and moves between slots', () => {
    setCollections(['alps'])
    const a = imageFor('day', local(2026, 9, 22, 10, 0))
    const b = imageFor('day', local(2026, 9, 22, 10, 19))
    const c = imageFor('day', local(2026, 9, 22, 10, 20))
    expect(a).toBe(b)
    expect(a).toMatch(/^\/terrain\/alps-day-\d+\.jpg$/)
    expect(c).toMatch(/^\/terrain\/alps-day-\d+\.jpg$/)
    // 8 alps day pictures, step 5: consecutive slots never repeat
    expect(c).not.toBe(a)
  })
  it('the same wall-clock time shows a different picture on another day', () => {
    setCollections(['alps'])
    const mon = imageFor('day', local(2026, 9, 21, 10, 0))
    const tue = imageFor('day', local(2026, 9, 22, 10, 0))
    expect(mon).not.toBe(tue)
  })
  it('a shift moves along the pool so two headers never share a picture', () => {
    setCollections(['alps'])
    const d = local(2026, 9, 22, 10, 0)
    expect(sceneAt('dusk', d, 3).terrain).not.toBe(sceneAt('dusk', d).terrain)
  })
  it('one library a day: the same library all day, the next one tomorrow, Next theme skips ahead', () => {
    setCollections(DEFAULT_COLLECTIONS); setPictureMode('daily'); setLibraryShift(0)
    const morning = libraryFor(local(2026, 9, 22, 8, 0)), evening = libraryFor(local(2026, 9, 22, 21, 0), 5)
    expect(evening).toBe(morning)
    const tomorrow = libraryFor(local(2026, 9, 23, 8, 0))
    expect(tomorrow).not.toBe(morning)
    expect(nextLibrary(local(2026, 9, 22, 8, 0))).toBe(tomorrow)
    setLibraryShift(1)
    expect(libraryFor(local(2026, 9, 22, 8, 0))).toBe(tomorrow)
    setLibraryShift(0)
  })
  it('random: the library changes with the slot', () => {
    setCollections(DEFAULT_COLLECTIONS); setPictureMode('random')
    const d = local(2026, 9, 22, 14, 0)
    const libs = new Set(Array.from({ length: 12 }, (_, shift) => libraryFor(d, shift)))
    expect(libs.size).toBeGreaterThan(1)
    setPictureMode('daily')
  })
  it('every slot picture belongs to the slot library', () => {
    const d = local(2026, 9, 22, 14, 0)
    for (let shift = 0; shift < 12; shift++) {
      const lib = libraryFor(d, shift)
      expect(imageFor('day', d, shift)).toMatch(new RegExp(`^/terrain/${lib}-day-`))
    }
  })
  it('sceneFor carries sky colours, library and a fallback render', () => {
    const s = sceneFor(local(2026, 9, 22, 12, 0))
    expect(s.key).toBe('day')
    expect(s.skyTop).toMatch(/^#/)
    expect(s.fallback).toBe('/terrain/day.jpg')
    expect(COLLECTIONS.map(c => c.key)).toContain(s.library)
  })
})

describe('covers', () => {
  it('lunch changes with the day, cockpit with the week', () => {
    expect(lunchScene(local(2026, 9, 22)).terrain).toMatch(/^\/terrain\/lunch-\d+\.jpg$/)
    expect(lunchScene(local(2026, 9, 22)).terrain).toBe(lunchScene(local(2026, 9, 22, 18)).terrain)
    expect(cockpitCover(local(2026, 9, 22)).src).toMatch(/^\/terrain\/cockpit-\d+\.jpg$/)
    expect(cockpitCover(local(2026, 9, 22, 8)).src).toBe(cockpitCover(local(2026, 9, 22, 18)).src)
    // seven-day buckets from 1 January: a run of seven days touches at most two covers
    const week = new Set(Array.from({ length: 7 }, (_, i) => cockpitCover(local(2026, 9, 20 + i)).src))
    expect(week.size).toBeLessThanOrEqual(2)
  })
  it('credits name people, not the stock site', () => {
    const c = credits()
    expect(c.length).toBeGreaterThan(50)
    expect(c).not.toContain('Pexels')
    expect(new Set(c).size).toBe(c.length)
  })
})
