import { useEffect, useState } from 'react'
import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from '@phosphor-icons/react'
import { getHero } from '../api/day.js'
import { photoCredit } from '../scenes.js'

/**
 * Under the greeting on Home (roadmap 119): the weather in one line with a small icon, then the briefing
 * the server composes for this moment. Never a deadline; when there is nothing to say, the picture's
 * credit. Refreshed every five minutes. Both lines carry data-volatile so the visual test masks them.
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

export function heroText(hero, scene) {
  if (hero?.lines?.length) return hero.lines.map(l => l.text).join(' ')
  const c = photoCredit(scene?.terrain)
  if (c?.by) return `${c.library} at ${scene.label.toLowerCase()}, by ${c.by}.`
  return 'A quiet bench.'
}
