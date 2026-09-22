import { shortDate } from '../lanes.js'
import { sunTimes } from '../scenes.js'
/** Weekday and date, HH:MM with a beating seconds mark, and which light it is. */
export default function Clock({ now, scene }) {
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0')
  const [day, ...rest] = shortDate(now).split(' ')
  const date = rest.join(' ')
  const { sunrise, sunset } = sunTimes(now)
  const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sun = `Sunrise ${hm(sunrise)}, sunset ${hm(sunset)}. The pictures follow the sky.`
  return (
    <div className="flex items-baseline gap-2.5" title={now.toLocaleString('de-CH')}>
      <span className="hidden text-[13.5px] min-[1400px]:inline 2xl:text-[15px]" style={{ color: 'var(--ink-3)' }}>{day} <span className="tnum" style={{ color: 'var(--ink-2)' }}>{date}</span></span>
      <span className="display tnum text-[18px] font-semibold tracking-tight 2xl:text-[21px]">{hh}<span style={{ opacity: now.getSeconds() % 2 ? .35 : 1, transition: 'opacity .3s' }}>:</span>{mm}</span>
      <span className="hidden text-[13px] xl:inline 2xl:text-[14.5px]" style={{ color: 'var(--ink-3)' }} title={sun}>{scene.label}</span>
    </div>
  )
}
