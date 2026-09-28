import { useEffect, useState } from 'react'
import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from '@phosphor-icons/react'
import { getHero } from '../api/day.js'

/**
 * Under the greeting on Home (roadmap 119): the weather in one line with a small icon, then the briefing
 * the server composes for this moment. Never a deadline; when there is nothing to say, a quiet line for
 * the hour and the weather (the picture credits live in Settings). Refreshed every five minutes. Both lines carry data-volatile so the visual test masks them.
 */
const ICONS = { sun: Sun, moon: Moon, cloudSun: CloudSun, cloudMoon: CloudMoon, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning }
/** WMO weather codes, as Open-Meteo sends them, to one of a few icon keys. */
export function iconFor(code, night = false) {
  const c = Number(code)
  if (c === 0) return night ? 'moon' : 'sun'
  if (c === 1 || c === 2) return night ? 'cloudMoon' : 'cloudSun'
  if (c === 3) return 'cloud'
  if (c === 45 || c === 48) return 'fog'
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain'
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow'
  if (c >= 95) return 'storm'
  return 'cloud'
}
const isNight = (w, now = new Date()) => {
  const t = now.getHours() * 60 + now.getMinutes()
  const m = s => { const r = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return r ? Number(r[1]) * 60 + Number(r[2]) : null }
  const rise = m(w.sunrise), set = m(w.sunset)
  return rise !== null && set !== null ? (t < rise || t >= set) : false
}

export function HeroWeather({ weather }) {
  if (!weather?.ok) return null
  const night = isNight(weather)
  const Icon = ICONS[iconFor(weather.code, night)]
  const temp = Number.isFinite(Number(weather.temp)) ? `${Number(weather.temp).toFixed(0)} °C` : null
  return (
    <div data-volatile className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px]" style={{ color: 'var(--ink-2)', textShadow: 'var(--shadow-text-soft)' }}>
      <span className="inline-flex items-center gap-2"><Icon size={20} aria-hidden="true" />{temp ? `${temp}, ${weather.words}` : weather.words}</span>
      {weather.rainNextHour >= 30 && <span style={{ color: 'var(--ink-3)' }}>{weather.rainNextHour} percent rain in the next hour</span>}
      <span style={{ color: 'var(--ink-3)' }}>{night ? `Sunrise ${weather.sunrise}` : `Sunset ${weather.sunset}`}</span>
    </div>
  )
}

/** Fetches once and every five minutes; hands the weather up so the icon row can sit above the greeting. */
export function useHero() {
  const [hero, setHero] = useState(null)
  useEffect(() => {
    let on = true
    const load = () => getHero().then(h => on && setHero(h)).catch(() => {})
    load(); const id = setInterval(load, 5 * 60_000)
    return () => { on = false; clearInterval(id) }
  }, [])
  return hero
}

/**
 * When the briefing has nothing to say: one quiet line for the hour, or for the weather when it is worth a
 * word. Chosen by the day and the hour, so it holds still while you look and is a different one tomorrow.
 */
const QUIET = {
  dawn: ['The hall is cold and the light is coming. Nothing needs you yet.', 'Blue hour. The bench waits without asking.', 'First light finds the tools before it finds the work.', 'Quiet still. Let the coffee catch up.', 'The valley is asleep. You have the hall to yourself.'],
  day: ['Good light for fine work.', 'The board is where you left it. Nothing has caught fire.', 'One thing, then the next. The rest keeps.', 'A steady hum in the hall, and a bench that knows you.', 'Nothing here is urgent. Most things are simply next.', 'The hall smells of oil and coffee. A good sign.'],
  lunch: ['The bench keeps. Eat something warm.', 'Half the day is done. Sit down for the other half.', 'Tools down. The board will not notice.'],
  dusk: ['The last good light. Finish the cut, leave the rest.', 'Long shadows across the bench. Nothing here needs the night.', 'The hall is going quiet. So can you.', 'Low sun on the rails. A good hour to tidy the bench.'],
  night: ['Lamp on, the world off. The bench can hold what you leave on it.', 'Only the fans are running. Nothing here is urgent.', 'The night keeps its own hours. Yours ended a while ago.', 'The hall is dark and honest. Tomorrow is soon enough.']
}
const WEATHER = {
  rain: ['Rain on the roof, warm in the hall.', 'Wet outside. The bench is the dry place to be.'],
  snow: ['Snow outside. The hall is the best place to be.', 'Snow on the valley. Everything is quieter for it.'],
  fog: ['Fog on the valley. Everything close and quiet.', 'Grey and soft outside. Good light for the bench.'],
  storm: ['Weather out there. Not in here.', 'The sky is busy. The bench is not.']
}
const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
export function heroText(hero, scene, now = new Date()) {
  if (hero?.lines?.length) return hero.lines.map(l => l.text).join(' ')
  const salt = dayOfYear(now) * 7 + now.getHours()
  const w = hero?.weather?.ok ? WEATHER[iconFor(hero.weather.code)] : null
  if (w && salt % 2 === 0) return w[salt % w.length]
  const pool = QUIET[String(scene?.key || '').toLowerCase()] || QUIET.day
  return pool[salt % pool.length]
}
