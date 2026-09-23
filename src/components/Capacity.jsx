import { useEffect, useState } from 'react'
import * as day from '../api/day.js'

/**
 * One line under the Today blurb: the hours still free in the workday against what Today holds
 * (roadmap 72). Meetings and clocked hours come off the workday; tasks without a size are counted.
 * Refetches when the lane changes and once a minute, since the clock keeps running.
 */
const h = n => Number.isInteger(n) ? String(n) : n.toFixed(1)

export default function Capacity({ refreshKey }) {
  const [c, setC] = useState(null)
  useEffect(() => {
    let on = true
    const go = () => day.getCapacity().then(x => on && setC(x)).catch(() => {})
    go()
    const id = setInterval(go, 60_000)
    return () => { on = false; clearInterval(id) }
  }, [refreshKey])
  if (!c) return null
  const text = `${h(c.freeHours)} free ${c.freeHours === 1 ? 'hour' : 'hours'}, Today holds ${h(c.todayHours)}${c.unsized ? `, ${c.unsized} unsized` : ''}.`
  return <p className="tnum mt-1.5 text-[13px]" style={{ color: c.over ? 'var(--caution)' : 'var(--ink-3)' }} title={`${h(c.workdayHours)} hour workday, ${h(c.meetingHours)} in meetings, ${h(c.clockedHours)} on the clock`}>{text}</p>
}
