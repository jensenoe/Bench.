import { useCallback, useEffect, useState } from 'react'
import * as api from '../api.js'

/** Today's punches, refreshed every 15s so the 12:30 auto-end shows up without a click. */
export default function useTimeclock() {
  const [clock, setClock] = useState(null)
  const [error, setError] = useState(null)
  const refresh = useCallback(async () => { try { setClock(await api.getTimeclock()); setError(null) } catch (e) { setError(e.message) } }, [])
  useEffect(() => { refresh(); const id = setInterval(refresh, 15_000); return () => clearInterval(id) }, [refresh])
  const punch = useCallback(async (kind) => {
    try { setClock(await api.punch(kind)); setError(null); return true }
    catch (e) { setError(e.message); return false }
  }, [])
  const reset = useCallback(async () => { try { setClock(await api.resetTimeclock()) } catch (e) { setError(e.message) } }, [])
  return { clock, error, punch, reset, refresh }
}

export const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
export const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
export const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }

/** Hours worked so far today, from the recorded punches and the live clock. */
export function workedMs(clock, now) {
  if (!clock) return 0
  const t = k => clock.events.filter(e => e.kind === k).at(-1)?.at
  const ms = iso => new Date(iso).getTime()
  const start = t('in'); if (!start) return 0
  let total = 0
  const lunchOut = t('lunchOut'), lunchIn = t('lunchIn'), out = t('out')
  if (lunchOut) {
    total += ms(lunchOut) - ms(start)
    if (lunchIn) total += (out ? ms(out) : now.getTime()) - ms(lunchIn)
  } else {
    total += (out ? ms(out) : now.getTime()) - ms(start)
  }
  return Math.max(0, total)
}
