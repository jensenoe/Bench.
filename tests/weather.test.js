import { describe as suite, it, expect } from 'vitest'
import { describe, shape, current } from '../server/weather.js'

suite('describe', () => {
  it('maps the common WMO codes to words', () => {
    expect(describe(0)).toBe('clear')
    expect(describe(3)).toBe('overcast')
    expect(describe(45)).toBe('fog')
    expect(describe(61)).toBe('light rain')
    expect(describe(63)).toBe('rain')
    expect(describe(75)).toBe('heavy snow')
    expect(describe(95)).toBe('a thunderstorm')
    expect(describe('81')).toBe('showers')
  })
  it('never throws on something it does not know', () => {
    expect(describe(42)).toBe('changeable')
    expect(describe(undefined)).toBe('changeable')
    expect(describe('rain')).toBe('changeable')
  })
})

const SAMPLE = {
  current: { time: '2026-09-23T12:15', temperature_2m: 9.46, precipitation: 0, weather_code: 3 },
  hourly: { time: ['2026-09-23T11:00', '2026-09-23T12:00', '2026-09-23T13:00', '2026-09-23T14:00'], precipitation_probability: [10, 20, 30, 40] },
  daily: { sunrise: ['2026-09-23T07:18'], sunset: ['2026-09-23T19:24'] }
}

suite('shape', () => {
  it('reads temperature to one decimal, words, the coming hour and the sun', () => {
    const w = shape(SAMPLE)
    expect(w.ok).toBe(true)
    expect(w.temp).toBe(9.5)
    expect(w.words).toBe('overcast')
    expect(w.rainNextHour).toBe(30)   // 13:00 is the first hour after the 12:15 reading
    expect(w.sunrise).toBe('07:18')
    expect(w.sunset).toBe('19:24')
  })
  it('falls back to the last hour when the reading is the last of the day', () => {
    const w = shape({ ...SAMPLE, current: { ...SAMPLE.current, time: '2026-09-23T23:30' } })
    expect(w.rainNextHour).toBe(40)
  })
})

suite('current', () => {
  const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })
  it('is ok:false and does not throw when offline', async () => {
    const w = await current({ force: true, fetchImpl: async () => { throw new Error('ENOTFOUND') } })
    expect(w.ok).toBe(false)
    expect(w.reason).toBe('offline')
  })
  it('caches a good answer between calls', async () => {
    let calls = 0
    const a = await current({ force: true, fetchImpl: async () => { calls++; return res(200, SAMPLE) } })
    const b = await current({ fetchImpl: async () => { calls++; return res(200, SAMPLE) } })
    expect(a.ok).toBe(true)
    expect(b).toBe(a)
    expect(calls).toBe(1)
  })
})
