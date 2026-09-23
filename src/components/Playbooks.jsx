import { useCallback, useEffect, useState } from 'react'
import { Play, Plus, Trash } from '@phosphor-icons/react'
import { getPlaybooks, applyPlaybook, removePlaybook, playbookFromMachine } from '../api/playbooks.js'
import { getMachines } from '../api/machines.js'
import { PanelSkeleton } from './Skeleton.jsx'
import { LANES } from '../copy.js'

/**
 * Commissioning playbooks (roadmap 114). Each template is a panel with its task list; Apply to a machine
 * creates the tasks with that project set, New from machine turns a machine's current tasks into the next
 * template. The page owns nothing else: templates live on the server next to the board.
 */
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = { background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }
const primary = { background: 'var(--accent)', color: 'var(--accent-ink)' }

function TaskLine({ t }) {
  const meta = [LANES[t.lane]?.label || t.lane, t.effortHours ? `${t.effortHours} h` : null, t.orderBy ? `order by day ${t.orderBy}` : null, t.supplier].filter(Boolean)
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="min-w-[200px] flex-1 text-[14px]">{t.title}</span>
      <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{meta.join(', ')}</span>
      {t.checklist?.length > 0 && <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }} title={t.checklist.join('\n')}>{plural(t.checklist.length, 'step')}</span>}
    </li>
  )
}

/** One template: its tasks, and the Apply row with a project input that suggests the known machines. */
function Playbook({ p, machines, onChanged }) {
  const [project, setProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const listId = `machines-${p.id}`
  const hours = p.tasks.reduce((s, t) => s + (Number(t.effortHours) || 0), 0)
  const apply = async (e) => {
    e.preventDefault()
    const proj = project.trim(); if (!proj) return
    setBusy(true)
    try {
      const r = await applyPlaybook(p.id, proj)
      toast(`${plural(r.created.length, 'task')} on ${proj}.`, `From ${p.name}.`)
      setProject(''); setOpen(false); refresh()
    } catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirm(`Delete the playbook "${p.name}"? Tasks already created stay on the board.`)) return
    setBusy(true)
    try { await removePlaybook(p.id); toast('Deleted.', p.name); onChanged() }
    catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  return (
    <section className="panel p-6 sm:p-7" aria-label={p.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] font-semibold leading-none">{p.name}.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(p.tasks.length, 'task')}{hours ? `, ${hours} h` : ''}{p.machineType && p.machineType !== 'any' ? `, ${p.machineType}` : ''}</span>
      </div>
      <ul className="mt-4 flex flex-col">{p.tasks.map((t, i) => <TaskLine key={i} t={t} />)}</ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!open && <button onClick={() => setOpen(true)} className={btn} style={primary}><Play size={13} weight="bold" /> Apply to…</button>}
        {open && (
          <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
              <span>Machine or project</span>
              <input list={listId} value={project} onChange={e => setProject(e.target.value)} autoFocus disabled={busy} placeholder="Machine 14" className="field min-h-[32px] w-[240px] px-2.5 py-1.5 text-[13.5px]" />
              <datalist id={listId}>{machines.map(m => <option key={m.key} value={m.name} />)}</datalist>
            </label>
            <button type="submit" disabled={busy || !project.trim()} className={btn} style={primary}>Create {plural(p.tasks.length, 'task')}</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-6 px-2 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Not now</button>
          </form>
        )}
        <button onClick={remove} disabled={busy} className={`${btn} ml-auto`} style={quiet} aria-label={`Delete ${p.name}`}><Trash size={13} weight="bold" /> Delete</button>
      </div>
    </section>
  )
}

/** New from machine: pick a machine, name the template, and its current tasks become the next standard. */
function FromMachine({ machines, onChanged }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const pick = machines.find(m => m.key === key)
  const submit = async (e) => {
    e.preventDefault()
    if (!key) return
    setBusy(true)
    try {
      const p = await playbookFromMachine(key, name.trim() || undefined)
      toast('Playbook made.', `${p.name}, ${plural(p.tasks.length, 'task')}.`)
      setOpen(false); setKey(''); setName(''); onChanged()
    } catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  if (!open) return <button onClick={() => setOpen(true)} className={btn} style={quiet}><Plus size={13} weight="bold" /> New from machine…</button>
  return (
    <form onSubmit={submit} className="panel flex flex-wrap items-end gap-3 p-5">
      <label className="flex flex-col gap-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        <span>Machine</span>
        <select value={key} onChange={e => setKey(e.target.value)} disabled={busy} autoFocus className="field min-h-[32px] px-2.5 py-1.5 text-[13.5px]">
          <option value="">pick one</option>
          {machines.map(m => <option key={m.key} value={m.key}>{m.name} ({m.open + m.done} tasks)</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        <span>Call it</span>
        <input value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder={pick ? `${pick.name}, as built` : 'Commissioning, type X'} className="field min-h-[32px] w-[260px] px-2.5 py-1.5 text-[13.5px]" />
      </label>
      <button type="submit" disabled={busy || !key} className={btn} style={primary}>Make the playbook</button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-6 px-2 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Not now</button>
      <p className="basis-full text-[13px]" style={{ color: 'var(--ink-3)' }}>Titles, lanes, sizes and checklists are copied, unticked. Order dates become offsets from the earliest one. Tickets from the tools are left out.</p>
    </form>
  )
}

export default function Playbooks() {
  const [list, setList] = useState(null)
  const [machines, setMachines] = useState([])
  const load = useCallback(() => {
    getPlaybooks().then(setList).catch(() => setList([]))
    getMachines().then(setMachines).catch(() => setMachines([]))
  }, [])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])

  return (
    <main className="mx-auto col px-6">
      <div className="flex flex-col gap-4">
        {list === null && <><PanelSkeleton rows={5} /><PanelSkeleton rows={3} /></>}
        {list?.map(p => <Playbook key={p.id} p={p} machines={machines} onChanged={load} />)}
        {list?.length === 0 && <section className="panel p-7"><h2 className="display text-[24px] font-semibold leading-none">No playbooks.</h2><p className="mt-3 max-w-[60ch] text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Make one from a machine whose commissioning went well, and the next machine starts with its task list.</p></section>}
        <div className="flex flex-wrap items-center gap-3">
          <FromMachine machines={machines} onChanged={load} />
          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Playbooks live in playbooks.json next to the board, shared with whoever uses the same folder.</span>
        </div>
      </div>
    </main>
  )
}
