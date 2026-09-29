import { useEffect, useState } from 'react'
import { getAerials, clearAerials } from '../api/aerials.js'
import { toast } from '../api/extras.js'
import { CLIPS } from '../aerials.js'

const mb = (n) => `${Math.round((n || 0) / 1048576)} MB`

/**
 * The moving hero's cache, under its switch in Settings > Look: how much is on this machine, what is
 * downloading, and a way to empty it. Asks the server every few seconds while the Look tab shows.
 */
export default function AerialCache({ active }) {
  const [st, setSt] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!active) return
    let on = true
    const load = () => getAerials().then(s => { if (on) { setSt(s); setErr(null) } }).catch(e => { if (on) setErr(e.message) })
    load()
    const id = setInterval(load, 5000)
    return () => { on = false; clearInterval(id) }
  }, [active])

  const clear = async () => {
    setBusy(true)
    try { setSt(await clearAerials()); toast('Cache cleared.', 'The clips download again as the hero needs them.') }
    catch (e) { toast('Not cleared.', `${e.message}. Try again.`) }
    finally { setBusy(false) }
  }

  if (err) return <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>The cache did not answer: {err}.</p>
  if (!st) return null
  const ready = st.clips.filter(c => c.ready).length
  const now = st.busy ? CLIPS.find(c => st.busy.startsWith(`${c.id}.`)) : null
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <span className="tnum" style={{ color: 'var(--ink-2)' }}>
        {mb(st.cache.bytes)} of {mb(st.cache.cap)} cached, {ready} of {st.clips.length} clips ready.
        {now ? ` Downloading ${now.place}.` : ''}
        {!now && st.lastError ? ' The last download failed; it is tried again in ten minutes, and the cached clips keep playing.' : ''}
      </span>
      <button onClick={clear} disabled={busy || !st.cache.files} className="pill btn-quiet px-3 py-1.5 text-[13px] font-medium">Clear the cache</button>
    </div>
  )
}
