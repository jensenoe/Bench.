import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CaretRight, Check, CheckCircle, Circle, CopySimple, FilePdf, ArrowSquareOut, Plus, TreeStructure, X } from '@phosphor-icons/react'
import { getKit, saveKit, applyKitTemplate, getBom, fillKitFromBom, handoverRoute } from '../api/kitting.js'
import { KINDS, KIND_LABEL, KIND_ONE, MAX, needsStock, normNumber, cleanItem, cleanMachine, mergeItems, planProgress, kitCompleteDoc, bundleCheck, parsePaste } from '../../server/kitting-rules.js'
import { exportReport, openLink } from '../api.js'
import DateField from './DateField.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { ask } from './Confirm.jsx'
import { fmtDate } from '../lanes.js'

/**
 * Rüsten per machine number (roadmap 171), one tab of a plan. The kit is defined once as a template and copied
 * onto every machine number; each item is ticked kitted, checked and (for Teile, Kabel and Schrauben) booked
 * out of stock. A machine is marked presented and handed over; the handover report goes to Service as a PDF.
 * The rules (progress, merging, the paste format) come from server/kitting-rules.js, so the counts here and on
 * the report agree. Every change saves 600 ms after the last one.
 */
const SAVE_MS = 600
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', ghost = btn + ' btn-ghost', primary = btn + ' btn-primary'
const iconBtn = 'pill btn-ghost inline-flex h-7 w-7 shrink-0 items-center justify-center'
const INP = 'field h-9 min-w-0 px-3 text-[13.5px]'
const LABEL = 'text-[12.5px]'
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
/** After a kit change: the Paket flow on the plan page reads kitComplete again. */
const refreshAll = () => window.dispatchEvent(new Event('bench:refresh'))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const qtyText = i => `${String(i.qty).replace('.', ',')}${i.unit ? ` ${i.unit}` : ''}`
const COLS_TICKS = 'grid-cols-[repeat(3,60px)_minmax(0,1fr)_minmax(0,170px)_76px_64px]'
const COLS_PLAIN = 'grid-cols-[minmax(0,1fr)_minmax(0,170px)_76px_64px]'

const STATUS_TEXT = { idle: '', pending: 'Saving.', saving: 'Saving.', saved: 'Saved.', failed: 'Not saved. The next change tries again.' }

// ── small pieces ──────────────────────────────────────────────────────
/** A tick: the drawn square is 16 px, the button 24. Space or Enter flips it, as on any button. */
function Tick({ on, label, onFlip }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} title={label} onClick={onFlip} className="mx-auto grid h-7 w-7 place-items-center rounded-[4px]">
      <span className="grid h-4 w-4 place-items-center rounded-[4px] border transition-colors" style={{ borderColor: on ? 'var(--ok)' : 'var(--line-2)', background: on ? 'var(--ok)' : 'transparent' }}>
        {on && <Check size={10} weight="bold" color="var(--bg)" />}
      </span>
    </button>
  )
}

/** A slim bar with its label and count; the functional green once everything is there. */
function Bar({ label, value, total }) {
  const full = total > 0 && value >= total
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span style={{ color: 'var(--ink-3)' }}>{label}</span>
        <span className="tnum" style={{ color: full ? 'var(--ok)' : 'var(--ink-2)' }}>{value}/{total}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: 'var(--wash-2)' }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: full ? 'var(--ok)' : 'rgba(var(--ink-rgb),.5)' }} />
      </div>
    </div>
  )
}

/** Presented or handed over, with the day: the one tinted chip on a machine's line. */
function Mark({ label, iso }) {
  return <span className="tag tnum rounded-[4px] px-1.5 py-0.5 text-[12.5px] font-medium" style={{ color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 12%, transparent)' }}>{label} {fmtDate(iso)}</span>
}

function KindSelect({ value, onChange, id, label = 'Kind' }) {
  return (
    <select id={id} aria-label={id ? undefined : label} value={value} onChange={e => onChange(e.target.value)} className={`${INP} w-[136px] pr-2`}>
      {KINDS.map(k => <option key={k} value={k}>{KIND_ONE[k]}</option>)}
    </select>
  )
}

/** Every field of one item, in place of its line. Enter saves, Escape leaves it as it was. */
function ItemEditor({ item, onSave, onCancel }) {
  const [f, setF] = useState(() => ({ ...item, qty: String(item.qty ?? 1) }))
  const ids = { kind: useId(), name: useId(), part: useId(), qty: useId(), unit: useId(), link: useId(), note: useId() }
  const nameRef = useRef(null)
  useEffect(() => { nameRef.current?.focus(); nameRef.current?.select() }, [])
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const submit = e => { e.preventDefault(); const it = cleanItem({ ...item, ...f }); if (it) onSave(it) }
  const field = (k, label, props = {}) => (
    <label htmlFor={ids[k]} className="block min-w-0"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>{label}</span>
      <input id={ids[k]} value={f[k === 'part' ? 'partNumber' : k] ?? ''} onChange={e => set(k === 'part' ? 'partNumber' : k, e.target.value)} className={`${INP} mt-1 w-full`} autoComplete="off" {...props} /></label>
  )
  return (
    <form onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }} className="row my-1.5 px-4 py-3.5" aria-label={`Edit ${item.name}`}>
      <div className="grid gap-3 sm:grid-cols-[136px_minmax(0,2fr)_minmax(0,1fr)_88px_88px]">
        <label htmlFor={ids.kind} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Kind</span><span className="mt-1 block"><KindSelect id={ids.kind} value={f.kind} onChange={v => set('kind', v)} /></span></label>
        <label htmlFor={ids.name} className="block min-w-0"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Item</span>
          <input ref={nameRef} id={ids.name} value={f.name} onChange={e => set('name', e.target.value)} maxLength={MAX.name} required className={`${INP} mt-1 w-full`} autoComplete="off" /></label>
        {field('part', 'Part number', { maxLength: MAX.partNumber })}
        {field('qty', 'Qty', { inputMode: 'decimal' })}
        {field('unit', 'Unit', { maxLength: MAX.unit, placeholder: 'pcs, m' })}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field('link', 'Link or path', { maxLength: MAX.link, placeholder: 'https://… or \\\\server\\share\\drawing.pdf' })}
        {field('note', 'Note', { maxLength: MAX.note })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" className={quiet} disabled={!f.name.trim()}>Save</button>
        <button type="button" onClick={onCancel} className={ghost}>Cancel</button>
      </div>
    </form>
  )
}

/** One item as a ledger line: the three ticks (on a machine), the name to edit, part number, quantity, link. */
function ItemLine({ item, ticks, onFlip, onEdit, onRemove }) {
  const stock = needsStock(item)
  return (
    <li className={`rule grid min-h-11 items-center gap-x-3 py-1.5 ${ticks ? COLS_TICKS : COLS_PLAIN}`}>
      {ticks && <>
        <Tick on={item.kitted} label={`Kitted: ${item.name}`} onFlip={() => onFlip('kitted')} />
        <Tick on={item.checked} label={`Checked: ${item.name}`} onFlip={() => onFlip('checked')} />
        {stock ? <Tick on={item.stockUpdated} label={`Stock updated: ${item.name}`} onFlip={() => onFlip('stockUpdated')} />
          : <span className="text-center text-[12px]" style={{ color: 'var(--ink-3)' }} title="Not a stock item">n/a</span>}
      </>}
      <div className="min-w-0">
        <button type="button" onClick={onEdit} title={`${item.name}. Click to edit.`} className="block min-h-6 max-w-full truncate text-left text-[13.5px]" style={{ color: 'var(--ink)' }}>{item.name}</button>
        {item.note && <p className="truncate text-[12.5px]" style={{ color: 'var(--ink-3)' }} title={item.note}>{item.note}</p>}
      </div>
      <span className="tnum truncate text-[13px]" style={{ color: 'var(--ink-2)' }} title={item.partNumber}>{item.partNumber}</span>
      <span className="tnum truncate text-right text-[13px]" style={{ color: 'var(--ink-2)' }}>{qtyText(item)}</span>
      <span className="flex items-center justify-end gap-0.5">
        {item.link && <button type="button" onClick={() => openLink(item.link)?.then?.(r => typeof r === 'string' && r && toast(r))} aria-label={`Open the link of ${item.name}`} title={item.link} className={iconBtn}><ArrowSquareOut size={14} weight="bold" /></button>}
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`} title="Remove" className={iconBtn}><X size={14} weight="bold" /></button>
      </span>
    </li>
  )
}

/** Kind, name, part number and quantity on one line; Enter adds and the name field is ready for the next. */
function AddItem({ onAdd, full }) {
  const [kind, setKind] = useState('teil')
  const [name, setName] = useState('')
  const [part, setPart] = useState('')
  const [qty, setQty] = useState('')
  const ref = useRef(null)
  const submit = e => {
    e.preventDefault()
    const it = cleanItem({ kind, name, partNumber: part, qty })
    if (!it || !onAdd(it)) return
    setName(''); setPart(''); setQty(''); ref.current?.focus()
  }
  return (
    <form onSubmit={submit} className="rule flex flex-wrap items-center gap-2 pt-3">
      <KindSelect value={kind} onChange={setKind} label="Kind of the new item" />
      <input ref={ref} value={name} onChange={e => setName(e.target.value)} aria-label="New item" placeholder="Add an item, e.g. USB-C cable 2 m" maxLength={MAX.name} autoComplete="off" className={`${INP} w-[280px] flex-1`} disabled={full} />
      <input value={part} onChange={e => setPart(e.target.value)} aria-label="Part number of the new item" placeholder="Part number" maxLength={MAX.partNumber} autoComplete="off" className={`${INP} w-[150px]`} disabled={full} />
      <input value={qty} onChange={e => setQty(e.target.value)} aria-label="Quantity of the new item" placeholder="Qty" inputMode="decimal" autoComplete="off" className={`${INP} w-[72px]`} disabled={full} />
      <button type="submit" disabled={full || !name.trim()} className={quiet}><Plus size={14} weight="bold" />Add</button>
      {full && <span className="text-[13px]" style={{ color: 'var(--caution)' }}>{MAX.items} items is the most one list holds.</span>}
    </form>
  )
}

/** The items of a machine or the template, grouped by kind in the fixed order, with the column heads once. */
function ItemList({ items, ticks, editing, onEdit, onSave, onCancel, onFlip, onRemove, onAdd }) {
  const groups = KINDS.map(k => [k, items.filter(i => i.kind === k)]).filter(([, l]) => l.length)
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="min-w-[640px]">
        {items.length > 0 && (
          <div aria-hidden="true" className={`grid items-end gap-x-3 pb-1.5 text-[12.5px] ${ticks ? COLS_TICKS : COLS_PLAIN}`} style={{ color: 'var(--ink-3)' }}>
            {ticks && <><span className="text-center">Kitted</span><span className="text-center">Checked</span><span className="text-center">Stock</span></>}
            <span>Item</span><span>Part number</span><span className="text-right">Qty</span><span />
          </div>
        )}
        {groups.map(([k, list]) => (
          <div key={k} className="mt-2.5 first:mt-0">
            <h3 className="pb-1 text-[13px] font-medium" style={{ color: 'var(--ink-2)' }}>{KIND_LABEL[k]} <span className="tnum font-normal" style={{ color: 'var(--ink-3)' }}>{list.length}</span></h3>
            <ul>
              {list.map(item => editing === item.id
                ? <li key={item.id}><ItemEditor item={item} onSave={onSave} onCancel={onCancel} /></li>
                : <ItemLine key={item.id} item={item} ticks={ticks} onFlip={f => onFlip(item, f)} onEdit={() => onEdit(item.id)} onRemove={() => onRemove(item)} />)}
            </ul>
          </div>
        ))}
        <AddItem onAdd={onAdd} full={items.length >= MAX.items} />
      </div>
    </div>
  )
}

/** Pick a machine of the Structured BOM and one of its assemblies; the parts below land on this machine. */
function BomFill({ onFill, onClose }) {
  const [machines, setMachines] = useState(null)
  const [err, setErr] = useState(null)
  const [bomId, setBomId] = useState('')
  const [tree, setTree] = useState(null)
  const [rootId, setRootId] = useState('')
  const [busy, setBusy] = useState(false)
  const idM = useId(), idN = useId()
  useEffect(() => { let on = true; getBom().then(r => on && setMachines(r.machines || [])).catch(e => on && setErr(e.message)); return () => { on = false } }, [])
  useEffect(() => {
    if (!bomId) { setTree(null); return }
    let on = true
    setTree(null); setRootId('')
    getBom(bomId).then(r => on && setTree(r)).catch(e => on && setErr(e.message))
    return () => { on = false }
  }, [bomId])
  const go = async () => { setBusy(true); try { await onFill({ bomMachine: bomId, rootId: rootId || null }) } finally { setBusy(false) } }
  return (
    <div className="row mt-3 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-medium">Fill from the BOM.</h3>
        <button type="button" onClick={onClose} className={ghost}>Close</button>
      </div>
      {err ? <p className="mt-1 text-[13px]" style={{ color: 'var(--caution)' }}>{err}</p> : machines === null ? <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>Asking the Structured BOM.</p> : (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label htmlFor={idM} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>BOM machine</span>
            <select id={idM} value={bomId} onChange={e => setBomId(e.target.value)} className={`${INP} mt-1 block w-[220px]`}>
              <option value="">Pick one</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></label>
          <label htmlFor={idN} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Assembly</span>
            <select id={idN} value={rootId} onChange={e => setRootId(e.target.value)} disabled={!tree} className={`${INP} mt-1 block w-[320px]`}>
              <option value="">The whole machine</option>
              {(tree?.branches || []).map(b => <option key={b.id} value={b.id}>{`${'  '.repeat(b.depth)}${b.label} (${plural(b.parts, 'part')})`}</option>)}
            </select></label>
          <button type="button" onClick={go} disabled={!tree || busy} className={quiet}><TreeStructure size={14} weight="bold" />Add the parts</button>
        </div>
      )}
      <p className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Parts already on the machine are left as they are; the BOM is read, never written.</p>
    </div>
  )
}

function DateMark({ label, value, onChange }) {
  return (
    <div className="block">
      <span className={LABEL} style={{ color: 'var(--ink-3)' }}>{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <DateField value={value || ''} onChange={v => onChange(v || null)} placeholder="Not yet" className="w-[150px]" />
        {!value && <button type="button" onClick={() => onChange(localToday())} className={ghost} aria-label={`${label} today`}>Today</button>}
      </div>
    </div>
  )
}

/** What opens under a machine's line: its facts and dates, its tools, and every item. */
function MachineDetail({ m, others, editing, setEditing, onMachine, onItems, onRemoveItem, onRenumber, onCopyFrom, onAddToTemplate, onRemove, onFill }) {
  const [number, setNumber] = useState(m.number)
  const [numberNote, setNumberNote] = useState(null)
  const [from, setFrom] = useState('')
  const [bom, setBom] = useState(false)
  const ids = { number: useId(), bundle: useId(), label: useId(), notes: useId(), from: useId() }
  useEffect(() => setNumber(m.number), [m.number])
  const commitNumber = () => { const note = onRenumber(number); setNumberNote(note); if (note) setNumber(m.number) }
  return (
    <div className="pb-5 pl-0 sm:pl-9">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label htmlFor={ids.number} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Machine number</span>
          <input id={ids.number} value={number} onChange={e => setNumber(e.target.value)} onBlur={commitNumber} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitNumber() } }}
            maxLength={MAX.number} autoComplete="off" className={`${INP} tnum mt-1 block w-[120px]`} /></label>
        <label htmlFor={ids.bundle} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Bundle</span>
          <select id={ids.bundle} value={m.bundle ?? ''} onChange={e => onMachine(x => ({ ...x, bundle: e.target.value ? Number(e.target.value) : null }))} className={`${INP} mt-1 block w-[120px]`}>
            <option value="">None</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Bundle {n}</option>)}
          </select></label>
        <label htmlFor={ids.label} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Label</span>
          <input id={ids.label} defaultValue={m.label} key={m.label} onBlur={e => e.target.value.trim() !== m.label && onMachine(x => ({ ...x, label: e.target.value.trim() }))}
            placeholder="e.g. showcase unit" maxLength={MAX.label} autoComplete="off" className={`${INP} mt-1 block w-[200px]`} /></label>
        <DateMark label="Presented" value={m.presentedOn} onChange={v => onMachine(x => ({ ...x, presentedOn: v }))} />
        <DateMark label="Handed over" value={m.handedOverOn} onChange={v => onMachine(x => ({ ...x, handedOverOn: v }))} />
      </div>
      {numberNote && <p className="mt-1.5 text-[13px]" style={{ color: 'var(--caution)' }}>{numberNote}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {others.length > 0 && (
          <span className="flex items-center gap-2">
            <label htmlFor={ids.from} className="sr-only">Copy the items of</label>
            <select id={ids.from} value={from} onChange={e => setFrom(e.target.value)} className={`${INP} w-[200px]`}>
              <option value="">Copy from machine</option>
              {others.map(o => <option key={o.id} value={o.id}>{o.number}</option>)}
            </select>
            <button type="button" disabled={!from} onClick={() => { onCopyFrom(from); setFrom('') }} className={quiet}><CopySimple size={14} weight="bold" />Copy</button>
          </span>
        )}
        <button type="button" onClick={() => setBom(v => !v)} aria-expanded={bom} className={quiet}><TreeStructure size={14} weight="bold" />Fill from the BOM</button>
        <button type="button" onClick={onAddToTemplate} disabled={!m.items.length} className={ghost}>Add to the template</button>
        <button type="button" onClick={onRemove} className={`${ghost} ml-auto`}>Remove machine</button>
      </div>
      {bom && <BomFill onFill={onFill} onClose={() => setBom(false)} />}

      <div className="mt-4">
        {m.items.length === 0 && <p className="mb-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>No items yet. Add them below, copy them from another machine, or apply the template.</p>}
        <ItemList items={m.items} ticks editing={editing} onEdit={setEditing} onCancel={() => setEditing(null)}
          onSave={it => { onItems(list => list.map(x => x.id === it.id ? it : x)); setEditing(null) }}
          onFlip={(item, f) => onItems(list => list.map(x => x.id === item.id ? { ...x, [f]: !x[f] } : x))}
          onRemove={onRemoveItem}
          onAdd={it => { onItems(list => list.length >= MAX.items ? list : [...list, it]); return true }} />
      </div>

      <label htmlFor={ids.notes} className="mt-4 block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Notes for Service</span>
        <textarea id={ids.notes} defaultValue={m.notes} key={m.id + m.notes} rows={2} maxLength={MAX.notes} onBlur={e => e.target.value.trim() !== m.notes && onMachine(x => ({ ...x, notes: e.target.value.trim() }))}
          className="field mt-1 block w-full px-3 py-2 text-[13.5px]" placeholder="What Service should know about this machine" /></label>
    </div>
  )
}

/** One machine number as a line: open it, its bundle, three bars, and the presented and handed-over marks. */
function MachineRow({ m, p, open, onToggle, children }) {
  return (
    <li className="rule">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[32px] w-[260px] min-w-0 shrink-0 items-center gap-2 text-left">
          <CaretRight size={14} weight="bold" className="shrink-0 transition-transform" style={{ color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : 'none' }} />
          <span className="tnum shrink-0 whitespace-nowrap text-[15px] font-medium" style={{ color: 'var(--ink)' }}>{m.number}</span>
          <span className="truncate text-[13px]" style={{ color: 'var(--ink-3)' }}>{m.bundle ? `Bundle ${m.bundle}` : 'No bundle'}{m.label ? `, ${m.label}` : ''}</span>
        </button>
        <div className="grid min-w-[280px] flex-1 grid-cols-3 gap-5" aria-label={`Machine ${m.number}`} role="group">
          <Bar label="Kitted" value={p.kitted} total={p.total} />
          <Bar label="Checked" value={p.checked} total={p.total} />
          <Bar label="Stock" value={p.stock} total={p.stockNeeded} />
        </div>
        <div className="flex w-[260px] shrink-0 flex-wrap items-center justify-end gap-1.5">
          {p.complete && <span className="inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: 'var(--ok)' }}><CheckCircle size={15} weight="bold" />Kitted</span>}
          {m.presentedOn && <Mark label="Presented" iso={m.presentedOn} />}
          {m.handedOverOn && <Mark label="Handed over" iso={m.handedOverOn} />}
          {!p.complete && !m.presentedOn && !m.handedOverOn && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{p.total ? plural(p.open, 'item') + ' open' : 'No items yet'}</span>}
        </div>
      </div>
      {open && children}
    </li>
  )
}

/** A machine by number and bundle, or a pasted list of them. */
function AddMachines({ onAdd, full }) {
  const [number, setNumber] = useState('')
  const [bundle, setBundle] = useState('')
  const [paste, setPaste] = useState(false)
  const [list, setList] = useState('')
  const [note, setNote] = useState(null)
  const ids = { number: useId(), bundle: useId(), list: useId() }
  const add = e => { e.preventDefault(); const r = onAdd([{ number, bundle: bundle ? Number(bundle) : null }]); setNote(r.note); if (r.added) setNumber('') }
  const addList = () => { const r = onAdd(parsePaste(list)); setNote(r.note); if (r.added) { setList(''); setPaste(false) } }
  return (
    <div className="rule mt-1 pt-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label htmlFor={ids.number} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Machine number</span>
          <input id={ids.number} value={number} onChange={e => setNumber(e.target.value)} placeholder="000 030" maxLength={MAX.number} autoComplete="off" className={`${INP} tnum mt-1 block w-[140px]`} disabled={full} /></label>
        <label htmlFor={ids.bundle} className="block"><span className={LABEL} style={{ color: 'var(--ink-3)' }}>Bundle</span>
          <select id={ids.bundle} value={bundle} onChange={e => setBundle(e.target.value)} className={`${INP} mt-1 block w-[120px]`} disabled={full}>
            <option value="">None</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Bundle {n}</option>)}
          </select></label>
        <button type="submit" disabled={full || !normNumber(number)} className={primary}><Plus size={14} weight="bold" />Add machine</button>
        <button type="button" onClick={() => setPaste(v => !v)} aria-expanded={paste} className={ghost}>Paste a list</button>
      </form>
      {paste && (
        <div className="mt-3">
          <label htmlFor={ids.list} className={LABEL} style={{ color: 'var(--ink-3)' }}>One machine per line: number, then the bundle.</label>
          <textarea id={ids.list} value={list} onChange={e => setList(e.target.value)} rows={4} placeholder={'000 030, Bundle 2\n000 031, Bundle 2\n000 052, Bundle 6'} className="field tnum mt-1 block w-full max-w-[420px] px-3 py-2 text-[13.5px]" />
          <button type="button" onClick={addList} disabled={!parsePaste(list).length || full} className={`${quiet} mt-2`}>Add {parsePaste(list).length ? plural(parsePaste(list).length, 'machine') : 'these'}</button>
        </div>
      )}
      {note && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }} role="status">{note}</p>}
      {full && <p className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>{MAX.machines} machines is the most one kit holds.</p>}
    </div>
  )
}

function Presentation({ b }) {
  const fact = (label, numbers) => (
    <span className="inline-flex items-center gap-1.5">
      {numbers.length ? <CheckCircle size={16} weight="regular" style={{ color: 'var(--ok)' }} /> : <Circle size={16} weight="regular" style={{ color: 'var(--ink-3)' }} />}
      <span style={{ color: numbers.length ? 'var(--ink)' : 'var(--ink-3)' }}>{label} {numbers.length ? `presented: ${numbers.join(', ')}` : 'not presented yet'}</span>
    </span>
  )
  return <p className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13.5px]">{fact('Bundle 1 to 5', b.bundle1to5)}{fact('Bundle 6', b.bundle6)}</p>
}

// ── the tab ───────────────────────────────────────────────────────────
export default function KittingTab({ projectKey }) {
  const [doc, setDoc] = useState(null)
  const [plan, setPlan] = useState(null)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState('idle')
  const [open, setOpen] = useState(() => new Set())
  const [editing, setEditing] = useState(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const latest = useRef(null)     // the document as the screen shows it, for the save
  const ver = useRef(0)           // bumps on every change; a save that comes back late does not undo newer ones
  const timer = useRef(null)
  const inflight = useRef(null)
  const keyRef = useRef(projectKey)

  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null
    const v = ver.current, key = keyRef.current, body = latest.current
    if (!body) return
    setStatus('saving')
    const p = saveKit(key, body)
    inflight.current = p
    try {
      const r = await p
      if (keyRef.current !== key) return
      if (ver.current === v) { latest.current = r.doc; setDoc(r.doc); setStatus('saved') }
      refreshAll()
    } catch (e) {
      if (keyRef.current !== key) return
      setStatus('failed')
      toast('The kit did not save.', e.message)
    } finally { if (inflight.current === p) inflight.current = null }
  }, [])

  useEffect(() => {
    keyRef.current = projectKey
    let live = true
    setDoc(null); setErr(null); setEditing(null)
    getKit(projectKey).then(r => {
      if (!live) return
      latest.current = r.doc; setDoc(r.doc); setPlan(r.plan)
      setStatus(r.doc.updatedAt ? 'stored' : 'idle')
    }).catch(e => live && setErr(e.message))
    return () => {
      live = false
      if (timer.current) {   // leaving with a change not yet sent: send it now
        clearTimeout(timer.current); timer.current = null
        saveKit(projectKey, latest.current).then(refreshAll).catch(e => toast('The kit did not save.', e.message))
      }
    }
  }, [projectKey, tick])

  const change = useCallback(fn => {
    const next = fn(latest.current)
    if (next === latest.current) return
    latest.current = next; ver.current++
    setDoc(next); setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_MS)
  }, [flush])

  /** Something the server does on the stored kit: send what is pending first, then take its answer. */
  const onServer = async (call, said) => {
    setBusy(true)
    try {
      if (timer.current) await flush()
      if (inflight.current) await inflight.current.catch(() => {})
      const r = await call()
      ver.current++; latest.current = r.doc; setDoc(r.doc); setStatus('saved'); refreshAll()
      toast(said(r))
    } catch (e) { toast('That did not work.', e.message) } finally { setBusy(false) }
  }

  const prog = useMemo(() => doc ? planProgress(doc) : null, [doc])
  if (err && !doc) return <LoadFailed title="The kit did not load." message={`${err}. Try again asks once more.`} onRetry={() => setTick(t => t + 1)} />
  if (!doc) return <PanelSkeleton rows={4} />

  const b = bundleCheck(doc), complete = kitCompleteDoc(doc), o = prog.overall
  const name = plan?.name || ''
  const statusText = status === 'stored' ? `Saved ${fmtDate(doc.updatedAt)}${doc.by ? ` by ${doc.by.split(' ')[0]}` : ''}.` : STATUS_TEXT[status]

  const onMachine = (id, fn) => change(d => ({ ...d, machines: d.machines.map(x => x.id === id ? fn(x) : x) }))
  const onItems = (id, fn) => onMachine(id, x => ({ ...x, items: fn(x.items) }))
  const onTemplate = fn => change(d => ({ ...d, template: fn(d.template) }))
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const addMachines = list => {
    const d = latest.current, have = new Set(d.machines.map(x => fold(x.number)))
    const fresh = [], there = []
    for (const r of list) {
      const n = normNumber(r.number)
      if (!n) continue
      if (have.has(fold(n))) { there.push(n); continue }
      if (d.machines.length + fresh.length >= MAX.machines) break
      const m = cleanMachine({ number: n, bundle: r.bundle, items: [] })
      m.items = mergeItems([], d.template, { fromTemplate: true }).items
      have.add(fold(n)); fresh.push(m)
    }
    if (fresh.length) change(x => ({ ...x, machines: [...x.machines, ...fresh] }))
    const note = [fresh.length ? `Added ${fresh.length === 1 ? fresh[0].number : plural(fresh.length, 'machine')}${d.template.length ? ` with the ${plural(d.template.length, 'template item')}` : ''}.` : null,
      there.length ? `${there.join(', ')} ${there.length === 1 ? 'is' : 'are'} on the kit already.` : null].filter(Boolean).join(' ')
    return { added: fresh.length, note: note || 'No machine number in that.' }
  }
  const renumber = (m, v) => {
    const n = normNumber(v)
    if (!n) return 'A machine needs its number.'
    if (n === m.number) return null
    if (latest.current.machines.some(x => x.id !== m.id && fold(x.number) === fold(n))) return `${n} is on the kit already.`
    onMachine(m.id, x => ({ ...x, number: n }))
    return null
  }
  const copyFrom = (m, fromId) => {
    const src = latest.current.machines.find(x => x.id === fromId)
    if (!src) return
    const r = mergeItems(m.items, src.items)
    if (r.added) onItems(m.id, () => r.items)
    toast(r.added ? `Copied ${plural(r.added, 'item')} from ${src.number}, every tick off.` : `${m.number} has every item of ${src.number} already.`)
  }
  const addToTemplate = m => {
    const r = mergeItems(latest.current.template, m.items)
    if (r.added) onTemplate(() => r.items)
    toast(r.added ? `Added ${plural(r.added, 'item')} of ${m.number} to the template.` : 'The template has every item already.')
  }
  const removeMachine = async m => {
    if (!(await ask(`Remove machine ${m.number} and its ${plural(m.items.length, 'item')}? The other machines and the template stay.`, { yes: 'Remove' }))) return
    change(d => ({ ...d, machines: d.machines.filter(x => x.id !== m.id) }))
  }
  const removeItem = async (where, item) => {
    if ((item.kitted || item.checked || item.stockUpdated) && !(await ask(`Remove ${item.name}? Its ticks go with it.`, { yes: 'Remove' }))) return
    if (where === 'template') onTemplate(list => list.filter(x => x.id !== item.id)); else onItems(where, list => list.filter(x => x.id !== item.id))
  }
  const exportPdf = async () => {
    try {
      if (timer.current) await flush()
      if (inflight.current) await inflight.current.catch(() => {})
      const at = await exportReport(handoverRoute(projectKey), `Übergabe ${name || 'Kit'} - ${localToday()}.pdf`)
      if (at) toast('Handover saved.', at)
    } catch (e) { toast('The handover did not export.', e.message) }
  }

  return (
    <>
      <section className="panel p-6 sm:p-7" aria-label="Rüsten">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 className="display text-[22px] font-semibold leading-none">Rüsten.</h2>
          <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
            {o.machines ? `${plural(o.machines, 'machine')}, ${o.complete === o.machines ? 'all' : o.complete} complete` : 'No machines yet'}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px]" role="status" style={{ color: status === 'failed' ? 'var(--caution)' : 'var(--ink-3)' }}>{statusText}</span>
            {status === 'failed' && <button type="button" onClick={flush} className={ghost}>Try again</button>}
            <button type="button" onClick={exportPdf} className={quiet} disabled={!o.machines}><FilePdf size={15} weight="bold" />Export handover PDF</button>
          </div>
        </div>
        <p className="mt-2 max-w-[65ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Every cable, connection, screw, part, parts list and schematic, per machine number: kitted, checked, and booked out of stock. Then one machine from Bundle 1 to 5 and one from Bundle 6 are presented, and the kit goes to Service.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Presentation b={b} />
          {complete !== null && (
            <span className="text-[13.5px] font-medium" style={{ color: complete ? 'var(--ok)' : 'var(--ink-2)' }}>
              {complete ? 'The kit is complete. Ready to build.' : `${plural(o.open, 'item')} open on ${plural(prog.machines.filter(x => !x.complete).length, 'machine')}.`}
            </span>
          )}
        </div>

        <ul className="mt-5">
          {doc.machines.map(m => (
            <MachineRow key={m.id} m={m} p={prog.machines.find(x => x.id === m.id)} open={open.has(m.id)} onToggle={() => toggle(m.id)}>
              <MachineDetail m={m} others={doc.machines.filter(x => x.id !== m.id)} editing={editing} setEditing={setEditing}
                onMachine={fn => onMachine(m.id, fn)} onItems={fn => onItems(m.id, fn)} onRemoveItem={item => removeItem(m.id, item)}
                onRenumber={v => renumber(m, v)} onCopyFrom={id => copyFrom(m, id)} onAddToTemplate={() => addToTemplate(m)} onRemove={() => removeMachine(m)}
                onFill={body => onServer(() => fillKitFromBom(projectKey, m.id, body), r => r.added ? `Added ${plural(r.added, 'part')} from the BOM to ${m.number}.` : 'Every part of that node is on the machine already.')} />
            </MachineRow>
          ))}
        </ul>
        {!doc.machines.length && <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Add the first machine number below, or paste a list. Each new machine gets the template.</p>}
        <AddMachines onAdd={addMachines} full={doc.machines.length >= MAX.machines} />
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Template">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 className="display text-[22px] font-semibold leading-none">Template.</h2>
          <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(doc.template.length, 'item')}</span>
          <button type="button" onClick={() => onServer(() => applyKitTemplate(projectKey), r => r.added ? `Added ${plural(r.added, 'item')} across the machines.` : 'Every machine has the whole template already.')}
            disabled={busy || !doc.template.length || !doc.machines.length} className={`${quiet} ml-auto`}>Apply to all machines</button>
        </div>
        <p className="mt-2 max-w-[65ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          The kit every machine number gets{name ? ` on ${name}` : ''}. Define it once; applying adds what a machine is missing and never removes or unticks anything.
        </p>
        <div className="mt-4">
          {!doc.template.length && <p className="mb-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>No items yet. Add the first below, or add a machine's items with Add to the template.</p>}
          <ItemList items={doc.template} ticks={false} editing={editing} onEdit={setEditing} onCancel={() => setEditing(null)}
            onSave={it => { onTemplate(list => list.map(x => x.id === it.id ? it : x)); setEditing(null) }}
            onFlip={() => {}} onRemove={item => removeItem('template', item)}
            onAdd={it => { onTemplate(list => list.length >= MAX.items ? list : [...list, it]); return true }} />
        </div>
      </section>
    </>
  )
}
