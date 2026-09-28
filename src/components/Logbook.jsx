import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { toast } from '../api/extras.js'
import { motion, AnimatePresence } from 'motion/react'
import { Plus, X, ArrowRight, Check, MagnifyingGlass, CalendarBlank, Copy } from '@phosphor-icons/react'
import DateField from './DateField.jsx'
import { ask } from './Confirm.jsx'
import * as api from '../api.js'
import { fmtDate } from '../lanes.js'

/**
 * Logbook: one entry per meeting. The list on the left, the page on the right.
 * Actions can be sent to the board with one click and keep a link back here. The list has a second view,
 * Open actions (roadmap 135): every unticked action from every meeting, the dated ones first, each with the
 * meeting it came from and whether it sits on the board. Ticking one there ticks it in its entry.
 * Saves on blur; nothing to remember. A write that fails says so in a toast and leaves what you typed in
 * the field, so leaving it again tries again. Removing an action or a link, and ticking one from Open
 * actions, can be undone from the toast.
 */
/** The toast for a failed write: what did not happen, the server's reason, and what to do. */
const failed = (what) => (e) => toast(`${what} did not save.`, `${e?.message || 'No answer from Bench.'} What you typed is still here; try again.`)
const undoToast = (text, by, undo) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true, undo } }))
const TABS = [['entries', 'Entries'], ['actions', 'Open actions']]
const fmt = (d) => d ? fmtDate(d) : ''
const INP = 'field w-full px-2.5 py-2 text-[13px]'

export default function Logbook({ onRefresh, tasks = [] }) {
  const [view, setView] = useState('entries')   // 'entries' | 'actions'
  const [entries, setEntries] = useState(null)
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const [meetings, setMeetings] = useState(null)   // null = closed, [] = loading/none
  const [meetingsNote, setMeetingsNote] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const load = async () => { const e = await api.getLogbook(); setEntries(e); setLoadErr(null); return e }
  const first = () => load().then(e => {
    const wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('entry')
    if (wanted && e.some(x => x.id === wanted)) setSel(wanted)
    else if (e.length && !sel) setSel(e[0].id)
  }).catch(e => setLoadErr(e.message))
  useEffect(() => { first() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const fromCalendar = async () => {
    if (meetings) return setMeetings(null)
    setMeetings([]); setMeetingsNote('Looking at today')
    try {
      const r = await api.todaysMeetings()
      if (!r.ok) { setMeetingsNote(r.reason === 'needs-signin' ? 'Connect Microsoft 365 in Settings to see your calendar here.' : r.reason === 'needs-admin-consent' ? 'The calendar needs an admin to approve the app once. The link is in Settings.' : `Calendar not available: ${r.reason}`); return }
      setMeetings(r.events); setMeetingsNote(r.events.length ? null : 'Nothing in the calendar today.')
    } catch (e) { setMeetingsNote(`Calendar not available: ${e.message}`) }
  }
  const startFromMeeting = async (m) => {
    const notes = [m.start && m.end ? `${m.start} to ${m.end}` : null, m.location ? `At ${m.location}` : null, m.organizer ? `Organised by ${m.organizer}` : null].filter(Boolean).join('. ')
    const e = await api.createEntry({ title: m.subject, date: new Date().toISOString().slice(0, 10), attendees: m.attendees, notes: notes ? notes + '.\n\n' : '' })
    await load(); setSel(e.id); setMeetings(null)
  }
  /**
   * "Write it down?" (roadmap 73): the notification lands here as #/logbook?new=<subject>. Start an entry
   * with that title, with the attendees when today's calendar has the meeting, and drop the parameter from
   * the hash without a reload so a refresh does not start a second one.
   */
  const startFromTitle = async (title) => {
    let m = null
    try { const r = await api.todaysMeetings(); if (r.ok) m = r.events.find(x => (x.subject || '').trim().toLowerCase() === title.trim().toLowerCase()) || null } catch { /* no calendar: a plain entry */ }
    if (m) return startFromMeeting(m)
    const e = await api.createEntry({ title, date: new Date().toISOString().slice(0, 10) })
    await load(); setSel(e.id)
  }
  const handlingNew = useRef(false)
  useEffect(() => {
    const check = () => {
      const [, qs] = location.hash.split('?')
      const params = new URLSearchParams(qs || '')
      const title = params.get('new')
      if (!title || handlingNew.current) return
      handlingNew.current = true
      params.delete('new')
      const rest = params.toString()
      history.replaceState(null, '', `#/logbook${rest ? '?' + rest : ''}`)
      startFromTitle(title).catch(failed('The new entry')).finally(() => { handlingNew.current = false })
    }
    check()
    addEventListener('hashchange', check); return () => removeEventListener('hashchange', check)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!entries) return []
    const t = q.trim().toLowerCase()
    return t ? entries.filter(e => [e.title, e.project, e.notes, ...(e.attendees || []), ...(e.tags || [])].join(' ').toLowerCase().includes(t)) : entries
  }, [entries, q])
  const entry = entries?.find(e => e.id === sel) || null
  const openActions = useMemo(() => {
    if (!entries) return []
    const t = q.trim().toLowerCase()
    return entries.flatMap(e => (e.actions || []).filter(a => !a.done).map(a => ({ ...a, entryId: e.id, entryTitle: e.title, entryDate: e.date, project: e.project })))
      .filter(a => !t || [a.text, a.owner, a.entryTitle, a.project].join(' ').toLowerCase().includes(t))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.entryDate || '').localeCompare(a.entryDate || ''))
  }, [entries, q])
  const put = (saved) => setEntries(list => list.map(x => x.id === saved.id ? saved : x))
  // Ticked from Open actions, the row leaves the list; the toast says which one went and can bring it back.
  const tick = async (a) => {
    const e = entries.find(x => x.id === a.entryId); if (!e) return
    try {
      const saved = await api.patchEntry(e.id, { actions: e.actions.map(x => x.id === a.id ? { ...x, done: true } : x) })
      put(saved)
      undoToast('Ticked.', a.text, async () => put(await api.patchEntry(e.id, { actions: (saved.actions || []).map(x => x.id === a.id ? { ...x, done: false } : x) })))
    } catch (err) { failed('The tick')(err) }
  }
  const today = new Date().toISOString().slice(0, 10)

  const add = async () => { try { const e = await api.createEntry({ title: 'Meeting', date: new Date().toISOString().slice(0, 10) }); await load(); setSel(e.id) } catch (err) { failed('The new entry')(err) } }
  // Returns true when the write landed, so a caller can clear its field only then.
  const save = async (patch) => { if (!entry) return false; try { put(await api.patchEntry(entry.id, patch)); return true } catch (err) { failed('The change')(err); return false } }
  const remove = async () => {
    if (!entry || !(await ask(`Delete "${entry.title}"?`))) return
    try { await api.removeEntry(entry.id); toast('Deleted.', entry.title); const list = await load(); setSel(list[0]?.id || null) }
    catch (err) { toast('The entry is still there.', `${err.message}. Try again.`) }
  }
  /** A recurring meeting: a new entry with the same title, people, project and tags, dated today. */
  const template = async () => { if (!entry) return; try { const e = await api.duplicateEntry(entry.id); await load(); setSel(e.id) } catch (err) { failed('The copy')(err) } }

  // group the list by month
  const groups = useMemo(() => {
    const m = new Map()
    for (const e of filtered) { const k = (e.date || '').slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(e) }
    return [...m.entries()]
  }, [filtered])
  const monthLabel = (k) => k ? new Date(k + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Undated'

  if (!entries) return <main className="mx-auto col px-6">{loadErr
    ? <LoadFailed title="The logbook did not load." message={`${loadErr}. The entries are safe on disk; Try again asks for them once more.`} onRetry={() => { setLoadErr(null); first() }} />
    : <PanelSkeleton rows={4} />}</main>

  return (
    <main className="mx-auto col px-6">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="panel flex max-h-[78vh] flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-3">
            <div className="field flex flex-1 items-center gap-2 px-2.5 py-1.5"><MagnifyingGlass size={13} weight="bold" style={{ color: 'var(--ink-3)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes" aria-label="Search the logbook" className="w-full bg-transparent text-[13.5px] outline-none" /></div>
            <button onClick={fromCalendar} aria-label="From today's meetings" aria-expanded={meetings !== null} title="Start from today's meetings" className="pill btn-quiet grid h-8 w-8 place-items-center" style={{ color: meetings ? 'var(--ink)' : 'var(--ink-3)', background: meetings ? 'var(--wash-2)' : undefined }}><CalendarBlank size={13} weight="bold" /></button>
            <button onClick={add} aria-label="New entry" className="pill btn-primary grid h-8 w-8 place-items-center"><Plus size={13} weight="bold" /></button>
          </div>
          {meetings !== null && (
            <div className="p-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="px-3 pb-1 pt-1 text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>Today's meetings</div>
              {meetingsNote && <p role="status" className="px-3 pb-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>{meetingsNote}</p>}
              {meetings.map(m => (
                <button key={m.id} onClick={() => startFromMeeting(m).catch(failed('The new entry'))} className="block w-full rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[var(--wash)]">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px]">{m.subject}</span><span className="tnum shrink-0 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{m.allDay ? 'all day' : m.start}</span></div>
                  <div className="mt-0.5 truncate text-[13px]" style={{ color: 'var(--ink-3)' }}>{[m.location, m.attendees.slice(0, 3).join(', ')].filter(Boolean).join(' · ') || 'Start an entry from this'}</div>
                </button>
              ))}
            </div>
          )}
          <div role="tablist" aria-label="What the list shows" className="flex gap-1 px-3 pt-2" onKeyDown={e => {
            // Left and right move between the two tabs and show the one they land on (the ARIA tabs pattern).
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
            e.preventDefault()
            const next = e.key === 'Home' ? 'entries' : e.key === 'End' ? 'actions' : view === 'entries' ? 'actions' : 'entries'
            setView(next); document.getElementById(`logbook-tab-${next}`)?.focus()
          }}>
            {TABS.map(([k, name]) => [k, k === 'actions' && openActions.length ? `${name} ${openActions.length}` : name]).map(([k, label]) => (
              <button key={k} id={`logbook-tab-${k}`} role="tab" aria-selected={view === k} aria-controls={view === k ? `logbook-panel-${k}` : undefined} tabIndex={view === k ? 0 : -1} onClick={() => setView(k)} className="pill min-h-[28px] px-3 py-1 text-[12.5px] font-medium transition-colors"
                style={view === k ? { background: 'var(--wash-2)', color: 'var(--ink)' } : { color: 'var(--ink-3)' }}>{label}</button>
            ))}
          </div>
          {view === 'actions' ? (
            <div id="logbook-panel-actions" className="flex-1 overflow-y-auto p-2" role="tabpanel" aria-label="Open actions">
              {!openActions.length && <p className="px-3 py-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{q.trim() ? 'Nothing matches.' : 'Nothing open from any meeting.'}</p>}
              {openActions.map(a => {
                const task = a.taskId ? tasks.find(t => t.id === a.taskId) : null
                const late = a.due && a.due < today
                return (
                  <div key={a.id} className="flex items-start gap-1.5 rounded-[10px] px-1.5 py-1.5" style={{ background: a.entryId === sel ? 'var(--wash-2)' : 'transparent' }}>
                    <button role="checkbox" aria-checked="false" aria-label={`Tick ${a.text}`} onClick={() => tick(a)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full">
                      <span className="block h-3.5 w-3.5 rounded-full" style={{ border: '1.5px solid var(--ink-3)' }} />
                    </button>
                    <button onClick={() => setSel(a.entryId)} className="min-w-0 flex-1 py-0.5 text-left">
                      <span className="block text-[13px] leading-snug">{a.text}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: 'var(--ink-3)' }}>
                        {[a.entryTitle, a.owner].filter(Boolean).join(', ')}
                        {a.due && <span className="tnum" style={{ color: late ? 'var(--late)' : 'var(--ink-3)' }}>{`, due ${fmt(a.due)}`}</span>}
                        {task && <span style={{ color: task.done ? 'var(--ok)' : 'var(--ink-3)' }}>{task.done ? ', done on the board' : ', on the board'}</span>}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
          <div id="logbook-panel-entries" className="flex-1 overflow-y-auto p-2" role="tabpanel" aria-label="Entries">
            {!filtered.length && <p className="px-3 py-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{entries.length ? 'Nothing matches; try fewer words.' : 'Start the first entry with the plus above.'}</p>}
            {groups.map(([k, list]) => (
              <div key={k} className="mb-3">
                <div className="px-3 pb-1 pt-2 text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>{monthLabel(k)}</div>
                {list.map(e => {
                  const openActions = (e.actions || []).filter(a => !a.done).length
                  return (
                    <button key={e.id} onClick={() => setSel(e.id)} aria-current={e.id === sel ? 'true' : undefined} className="block w-full rounded-[10px] px-3 py-2 text-left transition-colors"
                      style={{ background: e.id === sel ? 'var(--wash-2)' : 'transparent' }}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px]">{e.title}</span>
                        <span className="tnum shrink-0 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{fmt(e.date)}</span>
                      </div>
                      <div className="mt-0.5 flex gap-x-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                        <span className="truncate">{[e.project, (e.attendees || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ') || 'No details yet'}</span>
                        {openActions ? <span className="shrink-0">{openActions} open</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          )}
        </aside>

        <AnimatePresence mode="wait">
          {entry ? (
            <motion.section key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .25 }} className="panel p-6 sm:p-8">
              <Entry entry={entry} save={save} remove={remove} template={template} onRefresh={onRefresh} setEntries={setEntries} />
            </motion.section>
          ) : (
            <section className="panel grid min-h-[320px] place-items-center p-8 text-center">
              <div>
                <h2 className="display text-[28px] font-semibold leading-none">Nothing open.</h2>
                <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>Pick an entry on the left, or start one.</p>
                <button onClick={add} className="pill btn-quiet mt-5 px-4 py-2 text-[13.5px] font-medium">New entry</button>
              </div>
            </section>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}

function Entry({ entry, save, remove, template, onRefresh, setEntries }) {
  const [f, setF] = useState(() => draft(entry))
  useEffect(() => { setF(draft(entry)) }, [entry.id, entry.updatedAt])
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const commit = (k) => {
    // An emptied title puts the old one back: an entry with no title is a blank line in the list.
    if (k === 'title' && !String(f.title || '').trim()) { set('title', entry.title || ''); return }
    const cur = k === 'attendees' || k === 'tags' || k === 'decisions' ? (entry[k] || []).join(k === 'decisions' ? '\n' : ', ') : (entry[k] ?? ''); if (String(f[k]) !== String(cur)) save({ [k]: f[k] })
  }
  const notesRef = useRef(null)
  useEffect(() => { const el = notesRef.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }, [f.notes])

  const [newAction, setNewAction] = useState('')
  const actions = entry.actions || []
  const setActions = (next) => save({ actions: next })
  // The field clears only once the action is saved, so a failed write does not eat what was typed.
  const addAction = async () => { if (!newAction.trim()) return; if (await setActions([...actions, { text: newAction.trim() }])) setNewAction('') }
  // Removing an action is one click; the toast can put the list back as it was, on this entry.
  const dropAction = async (a) => {
    const id = entry.id, before = actions
    if (await setActions(actions.filter(x => x.id !== a.id))) {
      undoToast('Action removed.', a.text, async () => { const e = await api.patchEntry(id, { actions: before }); setEntries(list => list.map(x => x.id === e.id ? e : x)) })
    }
  }
  const toBoard = async (a) => {
    try { const r = await api.actionToBoard(entry.id, a.id); setEntries(list => list.map(x => x.id === r.entry.id ? r.entry : x)); onRefresh?.(); toast('On the board.', a.text) }
    catch (err) { toast('Not on the board yet.', `${err.message}. Try again.`) }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <input value={f.title} onChange={e => set('title', e.target.value)} onBlur={() => commit('title')} onKeyDown={e => e.key === 'Enter' && e.target.blur()}
          className="display w-full max-w-[640px] bg-transparent text-[30px] font-semibold leading-none tracking-tight outline-none sm:text-[36px]" placeholder="Meeting" aria-label="Entry title" />
        <div className="flex items-center gap-1">
          <button onClick={template} title="New entry like this one, dated today" className="pill btn-quiet flex items-center gap-1.5 px-3 py-1.5 text-[13.5px]"><Copy size={12} weight="bold" /> Again today</button>
          <button onClick={remove} aria-label="Delete entry" title="Delete entry" className="grid h-7 w-7 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><X size={13} weight="bold" /></button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="block text-[12px]" style={{ color: 'var(--ink-3)' }}>Date<DateField className="mt-1" clearable={false} value={f.date} onChange={v => { set('date', v); if (v && v !== entry.date) save({ date: v }) }} /></label>
        <label className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Project<input value={f.project} onChange={e => set('project', e.target.value)} onBlur={() => commit('project')} placeholder="machine, build, programme" className={INP + ' mt-1'} /></label>
        <label className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Who was there<input value={f.attendees} onChange={e => set('attendees', e.target.value)} onBlur={() => commit('attendees')} placeholder="names, comma separated" className={INP + ' mt-1'} /></label>
      </div>

      <label className="mt-6 block text-[12px]" style={{ color: 'var(--ink-3)' }}>Notes
        <textarea ref={notesRef} value={f.notes} onChange={e => set('notes', e.target.value)} onBlur={() => commit('notes')} rows={6} placeholder="What was said. What was shown. What was left open."
          className={INP + ' mt-1 min-h-[160px] resize-none leading-relaxed'} />
      </label>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="display text-[18px] font-semibold leading-none">Decisions.</h3>
          <textarea value={f.decisions} onChange={e => set('decisions', e.target.value)} onBlur={() => commit('decisions')} rows={4} placeholder="One per line."
            className={INP + ' mt-3 resize-y leading-relaxed'} />
        </div>
        <div>
          <div className="flex items-baseline justify-between"><h3 className="display text-[18px] font-semibold leading-none">Actions.</h3>
            <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{actions.filter(a => a.done).length}/{actions.length}</span></div>
          <ul className="mt-3 flex flex-col">
            {actions.map(a => (
              <li key={a.id} className="rule py-2.5">
                <div className="flex items-center gap-2.5">
                  <button onClick={() => setActions(actions.map(x => x.id === a.id ? { ...x, done: !x.done } : x))} role="checkbox" aria-checked={a.done} aria-label={`${a.done ? 'Reopen' : 'Tick'} ${a.text}`}
                    className="-m-1 grid h-6 w-6 shrink-0 place-items-center">
                    <span className="grid h-[16px] w-[16px] place-items-center rounded-full border" style={{ borderColor: a.done ? 'var(--ok)' : 'var(--line-2)', background: a.done ? 'var(--ok)' : 'transparent' }}>
                    {a.done && <Check size={10} weight="bold" color="var(--bg)" />}</span></button>
                  <ActionText a={a} onCommit={text => setActions(actions.map(x => x.id === a.id ? { ...x, text } : x))} />
                  <button onClick={() => dropAction(a)} aria-label={`Remove ${a.text}`} className="-my-0.5 grid h-6 w-6 shrink-0 place-items-center rounded" style={{ color: 'var(--ink-3)' }}><X size={11} weight="bold" /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-3 pl-[26px]">
                  <Owner a={a} onCommit={owner => setActions(actions.map(x => x.id === a.id ? { ...x, owner } : x))} />
                  {a.taskId ? <a href="#/board" className="text-[12.5px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>on the board</a>
                    : <button onClick={() => toBoard(a)} title="Put this on the board" className="flex items-center gap-1 text-[12.5px]" style={{ color: 'var(--accent)' }}>to the board <ArrowRight size={11} weight="bold" /></button>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={newAction} onChange={e => setNewAction(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAction()} placeholder="Add an action" aria-label="New action" className={INP} />
            <button onClick={addAction} className="pill btn-quiet px-3.5 text-[13.5px] font-medium">Add</button>
          </div>
        </div>
      </div>
      <Links entry={entry} save={save} setEntries={setEntries} />
      <p className="mt-6 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Saves as you go. Last change {new Date(entry.updatedAt).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
    </>
  )
}

/**
 * Files and pages that belong to the meeting: a folder on the share, a drawing, a SharePoint page.
 * Paste a path or an address; the label is the file name unless you type one. Opening hands a path to
 * Windows and an address to the browser.
 */
function Links({ entry, save, setEntries }) {
  const links = entry.links || []
  const [href, setHref] = useState('')
  const [label, setLabel] = useState('')
  const [note, setNote] = useState(null)
  const add = async () => { if (!href.trim()) return; if (await save({ links: [...links, { href: href.trim(), label: label.trim() }] })) { setHref(''); setLabel('') } }
  const open = async (l) => {
    let r
    try { r = await api.openLink(l.href) } catch (e) { r = `${l.label || l.href} did not open: ${e.message}.` }
    if (r) { setNote(String(r)); setTimeout(() => setNote(null), 4000) }
  }
  const drop = async (l) => {
    const id = entry.id, before = links
    if (await save({ links: links.filter(x => x.id !== l.id) })) undoToast('Link removed.', l.label || l.href, () => api.patchEntry(id, { links: before }).then(e => setEntries(list => list.map(x => x.id === e.id ? e : x))))
  }
  return (
    <div className="mt-6">
      <h3 className="display text-[18px] font-semibold leading-none">Files and links.</h3>
      <ul className="mt-3 flex flex-col empty:hidden">
        {links.map(l => (
          <li key={l.id} className="rule flex items-center gap-3 py-2.5">
            <button onClick={() => open(l)} className="min-w-0 flex-1 text-left" title={l.href}>
              <span className="block truncate text-[13.5px]">{l.label}</span>
              <span className="tnum block truncate text-[12px]" style={{ color: 'var(--ink-3)' }}>{l.href}</span>
            </button>
            <button onClick={() => drop(l)} aria-label={`Remove ${l.label}`} className="grid h-6 w-6 shrink-0 place-items-center rounded" style={{ color: 'var(--ink-3)' }}><X size={11} weight="bold" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <input value={href} onChange={e => setHref(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="\\\\share\\Projekte\\M3\\… or https://…" aria-label="Path or address" className={INP + ' tnum'} />
        <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Label, optional" aria-label="Label, optional" className={INP} />
        <button onClick={add} className="pill btn-quiet px-3.5 text-[13px] font-medium">Add</button>
      </div>
      {note && <p role="status" className="mt-2 text-[12.5px]" style={{ color: 'var(--caution)' }}>{note}</p>}
    </div>
  )
}

/** Editable action text that only writes back on blur, so typing does not round-trip on every key. */
function ActionText({ a, onCommit }) {
  const [v, setV] = useState(a.text)
  useEffect(() => { setV(a.text) }, [a.text])
  return <input aria-label="Action" value={v} onChange={e => setV(e.target.value)} onBlur={() => v.trim() && v !== a.text && onCommit(v.trim())} onKeyDown={e => e.key === 'Enter' && e.target.blur()}
    className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" style={{ textDecoration: a.done ? 'line-through' : 'none' }} />
}

function Owner({ a, onCommit }) {
  const [v, setV] = useState(a.owner || '')
  useEffect(() => { setV(a.owner || '') }, [a.owner])
  return <input value={v} placeholder="owner" aria-label={`Owner of ${a.text}`} onChange={e => setV(e.target.value)} onBlur={() => v !== (a.owner || '') && onCommit(v)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} className="field w-28 px-2 py-1 text-[13px]" />
}

const draft = e => ({ title: e.title || '', date: e.date || '', project: e.project || '', attendees: (e.attendees || []).join(', '), notes: e.notes || '', decisions: (e.decisions || []).join('\n'), tags: (e.tags || []).join(', ') })
