import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Paperclip, ArrowSquareOut } from '@phosphor-icons/react'
import { openLink } from '../api.js'
import { getInbox, attachInbox, dismissInbox, toast, refresh } from '../api/extras.js'
import { fmtDate } from '../lanes.js'

const MAX = 6
const hhmm = (iso) => new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

/** One photograph: a thumbnail, a task search and Attach, or Dismiss. */
function Shot({ file, tasks, onDone }) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    return tasks.filter(t => !t.done && (!s || t.title.toLowerCase().includes(s))).slice(0, 6)
  }, [q, tasks])
  const choose = (t) => { setPick(t); setQ(t.title); setOpen(false) }
  const attach = async () => {
    if (!pick) return
    setBusy(true); setErr(null)
    try { await attachInbox(file.name, pick.id); refresh(); toast(`Attached to ${pick.title}.`, file.name); onDone() }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  const dismiss = async () => {
    setBusy(true)
    try { await dismissInbox(file.name); onDone() } catch (e) { setErr(e.message); setBusy(false) }
  }
  useEffect(() => {
    if (!open) return
    const onClick = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    addEventListener('mousedown', onClick); return () => removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <li className="row flex gap-4 p-3">
      <button onClick={() => openLink(file.path || file.url)} aria-label={`Open ${file.name}`} title={file.name}
        className="relative block h-[88px] w-[88px] shrink-0 overflow-hidden rounded-md" style={{ background: 'var(--bg-2)' }}>
        <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
          <span className="truncate" title={file.name}>{file.name}</span>
          <span className="tnum shrink-0">{fmtDate(file.at)} {hhmm(file.at)}</span>
        </p>
        <div ref={box} className="relative mt-2">
          <input value={q} onChange={e => { setQ(e.target.value); setPick(null); setOpen(true) }} onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter' && hits[0] && !pick) choose(hits[0]); if (e.key === 'Escape') setOpen(false) }}
            placeholder="Which task?" aria-label={`Task for ${file.name}`} role="combobox" aria-expanded={open && hits.length > 0} aria-autocomplete="list"
            className="field w-full px-2.5 py-1.5 text-[13px]" />
          {open && hits.length > 0 && (
            <ul role="listbox" className="panel absolute inset-x-0 top-full z-20 mt-1 max-h-[200px] overflow-y-auto p-1" style={{ boxShadow: 'var(--shadow-panel)' }}>
              {hits.map(t => (
                <li key={t.id} role="option" aria-selected={pick?.id === t.id}>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => choose(t)} className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[rgba(var(--ink-rgb),.06)]">{t.title}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={attach} disabled={!pick || busy} className="pill inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Paperclip size={12} weight="bold" /> Attach</button>
          <button onClick={dismiss} disabled={busy} className="inline-flex h-6 items-center gap-1 text-[13px] underline-offset-2 hover:underline disabled:opacity-50" style={{ color: 'var(--ink-3)' }}><X size={11} weight="bold" /> Dismiss</button>
          {err && <span className="text-[13px]" style={{ color: 'var(--caution)' }}>{err}</span>}
        </div>
      </div>
    </li>
  )
}

/**
 * Photographs from the phone (roadmap 85). A panel on the Board that only appears when the watched
 * folder holds pictures from the last fortnight. Each one goes onto a task as a link, or away.
 */
export default function Inbox({ tasks = [] }) {
  const [data, setData] = useState(null)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    let on = true
    const load = () => getInbox().then(d => on && setData(d)).catch(() => on && setData(null))
    load()
    const id = setInterval(load, 30_000)
    addEventListener('bench:refresh', load)
    return () => { on = false; clearInterval(id); removeEventListener('bench:refresh', load) }
  }, [])
  const reload = () => getInbox().then(setData).catch(() => {})
  const files = data?.ok ? data.files : []
  if (!files.length) return null
  const shown = showAll ? files : files.slice(0, MAX)
  const rest = files.length - shown.length

  return (
    <section aria-labelledby="inbox-title" className="panel mb-4 p-6 sm:p-7">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="inbox-title" className="display text-[22px] font-semibold leading-none">From the phone.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{files.length} {files.length === 1 ? 'picture' : 'pictures'}</span>
      </header>
      <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Taken in the last fourteen days and not yet on a task. Pick the task, press Attach; the picture stays where it is and the card gets a link to it.
        <button onClick={() => openLink(data.dir)} className="ml-1.5 inline-flex h-6 items-center gap-1 underline underline-offset-2 align-baseline" style={{ color: 'var(--ink-2)' }}>Open the folder <ArrowSquareOut size={11} weight="bold" /></button>
      </p>
      <ul className="mt-4 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {shown.map(f => <Shot key={f.name} file={f} tasks={tasks} onDone={reload} />)}
      </ul>
      {rest > 0 && <button onClick={() => setShowAll(true)} className="pill mt-3 px-3.5 py-1.5 text-[13px] font-medium" style={{ border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>+{rest} more</button>}
    </section>
  )
}
