import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle, DeviceMobile, MagnifyingGlass, X } from '@phosphor-icons/react'
import { KINDS, KIND_LABEL, MAX, needsStock, progress, itemDone, findItems, nextOpen, inKindOrder } from '../../server/kitting-rules.js'
import { addKitPhoto, addKitPhotoSmall, removeKitPhoto, kitPhotoUrl, getPhoneInfo } from '../api/kitting.js'
import { ask } from './Confirm.jsx'

/**
 * Workshop mode of the Rüsten tab (roadmap 176): one machine at a time, large type, big ticks, and a Find field
 * that a USB or Bluetooth barcode scanner can type into from anywhere on the page. Enter finds the item by part
 * number or name (findItems, the same function the phone uses), scrolls to it and puts focus on "Tick kitted",
 * so a second Enter ticks it; the next scan goes back to Find. Ticks go one item at a time (onFlip, PATCH
 * /api/kitting/tick). Photos go to the machine's folder in the shared data folder, reduced here first.
 * The camera scanner lives on the phone page only; Windows has no BarcodeDetector.
 */
const btn = 'pill inline-flex min-h-[40px] items-center gap-2 px-4 py-2 text-[14.5px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', ghost = btn + ' btn-ghost', primary = btn + ' btn-primary'
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const qtyText = i => i.unit ? `${String(i.qty).replace('.', ',')} ${i.unit}` : `Qty ${String(i.qty).replace('.', ',')}`
const VERB = { kitted: 'Tick kitted', checked: 'Tick checked', stockUpdated: 'Tick stock updated' }
const firstMissing = i => !i.kitted ? 'kitted' : !i.checked ? 'checked' : needsStock(i) && !i.stockUpdated ? 'stockUpdated' : null
const inField = el => Boolean(el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable))
/** Within 350 ms of a find: the scanner's own Enter arriving late, not a person pressing the button. */
const tooSoon = at => Date.now() - at < 350
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))

/** A photo made smaller in the browser: a JPEG at most `max` px on the long side, or null when it cannot be read. */
async function shrink(file, max, quality) {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s))
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close?.()
    return await new Promise(r => c.toBlob(r, 'image/jpeg', quality))
  } catch { return null }
}

/** One big tick: a 52 px pill with its drawn box and its word; the functional green once it is on. */
function BigTick({ on, label, name, onFlip }) {
  return (
    <button type="button" aria-pressed={on} aria-label={`${label}: ${name}`} onClick={onFlip}
      className="pill inline-flex h-[52px] w-[128px] shrink-0 items-center justify-center gap-2.5 text-[15px] font-medium"
      style={on ? { background: 'color-mix(in srgb, var(--ok) 16%, transparent)', color: 'var(--ok)' } : { background: 'var(--wash)', color: 'var(--ink)' }}>
      <span aria-hidden="true" className="grid h-[18px] w-[18px] place-items-center rounded-[4px] border-2" style={{ borderColor: 'currentColor', background: on ? 'var(--ok)' : 'transparent' }}>
        {on && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      {label}
    </button>
  )
}

function WorkItem({ item, hit, onFlip }) {
  const done = itemDone(item)
  return (
    <li id={`ws-${item.id}`} className="rule grid scroll-mt-48 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 py-3.5"
      style={hit ? { outline: '3px solid var(--accent)', outlineOffset: 4, borderRadius: 12 } : undefined}>
      <div className="min-w-0 pl-1">
        <p className="flex items-center gap-2 text-[18px] font-medium leading-snug" style={{ color: 'var(--ink)' }}>
          {done && <CheckCircle size={20} weight="regular" style={{ color: 'var(--ok)' }} role="img" aria-label="Done" />}
          <span className="min-w-0 break-words">{item.name}</span>
        </p>
        <p className="tnum mt-0.5 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          {item.partNumber ? <span style={{ color: 'var(--ink)' }}>{item.partNumber}</span> : <span style={{ color: 'var(--ink-3)' }}>No part number</span>}
          <span className="ml-4">{qtyText(item)}</span>
        </p>
        {item.note && <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-3)' }}>{item.note}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <BigTick on={item.kitted} label="Kitted" name={item.name} onFlip={() => onFlip(item, 'kitted')} />
        <BigTick on={item.checked} label="Checked" name={item.name} onFlip={() => onFlip(item, 'checked')} />
        {needsStock(item) ? <BigTick on={item.stockUpdated} label="Stock" name={item.name} onFlip={() => onFlip(item, 'stockUpdated')} />
          : <span className="inline-flex h-[52px] w-[128px] items-center justify-center text-[14px]" style={{ color: 'var(--ink-3)' }}>No stock</span>}
      </div>
    </li>
  )
}

function Bars({ p }) {
  const one = (label, v, t) => {
    const full = t > 0 && v >= t
    return (
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-[14px]"><span style={{ color: 'var(--ink-2)' }}>{label}</span><span className="tnum" style={{ color: full ? 'var(--ok)' : 'var(--ink)' }}>{v}/{t}</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--wash-2)' }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={t} aria-valuenow={v}>
          <span className="block h-full rounded-full" style={{ width: `${t ? Math.round(v / t * 100) : 0}%`, background: full ? 'var(--ok)' : 'rgba(var(--ink-rgb),.55)' }} />
        </div>
      </div>
    )
  }
  return <div className="mt-4 grid max-w-[640px] grid-cols-3 gap-6">{one('Kitted', p.kitted, p.total)}{one('Checked', p.checked, p.total)}{one('Stock', p.stock, p.stockNeeded)}</div>
}

/** The machine's photos: Add photo (reduced here to 1600 px, and 480 px for the handover), the grid, Remove. */
function Photos({ projectKey, m, onChanged }) {
  const [pick, setPick] = useState(null)   // { file, url }
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const capId = useId()
  useEffect(() => () => { if (pick) URL.revokeObjectURL(pick.url) }, [pick])
  const full = m.photos.length >= MAX.photos
  const save = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      const big = (await shrink(pick.file, 1600, 0.82)) || pick.file
      const r = await addKitPhoto(projectKey, m.id, big, { caption: caption.trim() })
      const small = await shrink(pick.file, 480, 0.72)
      if (small) await addKitPhotoSmall(projectKey, m.id, r.photo.id, small).catch(() => {})
      setPick(null); setCaption('')
      toast(`Photo saved on ${m.number}.`)
      onChanged()
    } catch (err) { toast('The photo did not save.', err.message) } finally { setBusy(false) }
  }
  const remove = async p => {
    if (!(await ask(`Remove this photo of ${m.number}? The file in the shared folder goes too.`, { yes: 'Remove' }))) return
    try { await removeKitPhoto(projectKey, m.id, p.id); onChanged() } catch (err) { toast('The photo was not removed.', err.message) }
  }
  return (
    <section aria-label={`Photos of ${m.number}`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[16px] font-medium">Photos <span className="tnum font-normal" style={{ color: 'var(--ink-3)' }}>{m.photos.length}</span></h4>
        <label className={`${quiet} relative cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2`} style={{ outlineColor: 'var(--accent)' }}>
          <Camera size={17} weight="regular" />Add photo
          <input type="file" accept="image/*" disabled={full} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Add a photo of ${m.number}`}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPick({ file: f, url: URL.createObjectURL(f) }) }} />
        </label>
      </div>
      {pick && (
        <form onSubmit={save} className="row mt-3 p-3" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPick(null) } }}>
          <img src={pick.url} alt="The photo to save" className="max-h-[200px] w-full rounded-[12px] object-contain" />
          <label htmlFor={capId} className="mt-2 block text-[13px]" style={{ color: 'var(--ink-3)' }}>Caption for Service, if it helps</label>
          <input id={capId} value={caption} onChange={e => setCaption(e.target.value)} maxLength={MAX.caption} autoFocus autoComplete="off" className="field mt-1 h-10 w-full px-3 text-[14.5px]" />
          <div className="mt-2 flex gap-2"><button type="submit" disabled={busy} className={primary}>Save photo</button><button type="button" onClick={() => setPick(null)} className={ghost}>Cancel</button></div>
        </form>
      )}
      {full && <p className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>{MAX.photos} photos is the most one machine holds.</p>}
      {m.photos.length ? (
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {m.photos.map(p => {
            const item = p.itemId ? m.items.find(i => i.id === p.itemId) : null
            const cap = p.caption || (item ? item.name : `Machine ${m.number}`)
            return (
              <li key={p.id} className="relative min-w-0">
                <a href={kitPhotoUrl(projectKey, m.id, p.file)} target="_blank" rel="noreferrer" className="block">
                  <img src={kitPhotoUrl(projectKey, m.id, p.small || p.file)} alt={cap} loading="lazy" className="aspect-[4/3] w-full rounded-[12px] object-cover" style={{ background: 'var(--wash)' }} />
                </a>
                <p className="mt-1 truncate text-[13px]" style={{ color: 'var(--ink-2)' }} title={cap}>{cap}</p>
                <button type="button" onClick={() => remove(p)} aria-label={`Remove the photo ${cap}`} title="Remove" className="pill absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center" style={{ background: 'var(--panel)', color: 'var(--ink)' }}><X size={14} weight="bold" /></button>
              </li>
            )
          })}
        </ul>
      ) : !pick && <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>None yet. Photos go into the handover for Service.</p>}
    </section>
  )
}

/** How to open Rüsten on the phone: the address from GET /api/phone, never the PIN. */
function PhoneHint() {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let on = true
    const load = () => getPhoneInfo().then(i => on && setInfo(i)).catch(() => on && setInfo(null))
    load(); const id = setInterval(load, 30_000)
    return () => { on = false; clearInterval(id) }
  }, [])
  return (
    <section className="rule mt-6 pt-5" aria-label="On your phone">
      <h4 className="flex items-center gap-2 text-[16px] font-medium"><DeviceMobile size={18} weight="regular" />On your phone.</h4>
      <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {info?.on && info.url ? <>Open <span className="tnum" style={{ color: 'var(--ink)' }}>{info.url}/kit</span> on a phone on the same network and type the PIN from Settings. Ticks and photos land here within seconds.</>
          : info?.configured ? <>The phone view is on and a PIN is set, but it is not running yet. Bench. picks it up within half a minute; if not, port 5199 is taken or the firewall said no.</>
            : <>Switch on the phone view in Settings, Tools, and set a PIN. Rüsten then opens on the phone under /kit, with the same ticks, a find field for a scanner, and photos.</>}
      </p>
    </section>
  )
}

/**
 * The workshop view of one kit. `doc` is the tab's document, `onFlip(machineId, itemId, field)` ticks one item
 * (a promise), `onReload()` reads the kit again after a photo changed.
 */
export default function KitWorkshop({ projectKey, doc, onFlip, onReload }) {
  const [mid, setMid] = useState(() => {
    try { const v = sessionStorage.getItem(`bench:kit-machine:${projectKey}`); if (v && doc.machines.some(m => m.id === v)) return v } catch { /* none */ }
    return (doc.machines.find(m => !progress(m).complete) || doc.machines[0])?.id || null
  })
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [hitIx, setHitIx] = useState(0)
  const [hit, setHit] = useState(null)
  const [miss, setMiss] = useState(null)
  const [openOnly, setOpenOnly] = useState(false)
  const findRef = useRef(null), actRef = useRef(null), foundAt = useRef(0)
  const findId = useId()
  const m = doc.machines.find(x => x.id === mid) || doc.machines[0]
  useEffect(() => { try { if (m) sessionStorage.setItem(`bench:kit-machine:${projectKey}`, m.id) } catch { /* fine */ } }, [m, projectKey])
  const list = useMemo(() => m ? inKindOrder(m.items) : [], [m])
  const hitItem = hit ? list.find(i => i.id === hit) : null

  // A barcode scanner types like a keyboard: a character typed outside a field goes to Find, fresh, so the
  // scan's own Enter finds the item. ? still opens the key sheet; overlays keep their keys.
  useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' || e.key === '?') return
      if (inField(document.activeElement) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const f = findRef.current
      if (!f) return
      setQ(''); f.value = ''; f.focus({ preventScroll: true })
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [])

  const [seq, setSeq] = useState(0)   // bumps on every find, so the effect below runs after the found box is drawn
  const show = it => { setHit(it.id); setMiss(null); setSeq(n => n + 1) }
  useEffect(() => {
    if (!seq || !hit) return
    foundAt.current = Date.now()
    document.getElementById(`ws-${hit}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (actRef.current) actRef.current.focus({ preventScroll: true }); else findRef.current?.select()
  }, [seq])   // eslint-disable-line react-hooks/exhaustive-deps
  const find = e => {
    e?.preventDefault()
    const text = q.trim()
    if (!text || !m) return
    const found = findItems(list, text)
    setHits(found); setHitIx(0)
    if (!found.length) { setHit(null); setMiss(text); findRef.current?.select(); return }
    show(found[0])
  }
  const next = () => {
    const n = nextOpen(list, hit, itemDone)
    if (!n) { toast(list.length ? `Every item on ${m.number} is done.` : 'No items on this machine yet.'); return }
    setHits([n]); setHitIx(0); show(n)
  }
  const tickFound = async f => {
    if (tooSoon(foundAt.current) || !hitItem) return   // the scanner's own Enter, not a person
    await onFlip(m.id, hitItem.id, f)
    findRef.current?.focus({ preventScroll: true }); findRef.current?.select()
  }
  const pickMachine = id => { setMid(id); setHit(null); setHits([]); setMiss(null); setQ('') }

  if (!m) return <p className="mt-5 text-[15px]" style={{ color: 'var(--ink-3)' }}>Add a machine number below the Workshop switch first; workshop mode shows one machine at a time.</p>
  const p = progress(m)
  const groups = KINDS.map(k => [k, list.filter(i => i.kind === k)]).filter(([, l]) => l.length)
  const shown = it => !openOnly || !itemDone(it) || it.id === hit
  const action = hitItem ? firstMissing(hitItem) : null
  const facts = [m.bundle ? `Bundle ${m.bundle}` : 'No bundle', m.label].filter(Boolean).join(', ')

  return (
    <div className="mt-5">
      <div role="group" aria-label="Machine" className="flex flex-wrap gap-2">
        {doc.machines.map(x => {
          const px = progress(x), on = x.id === m.id
          return (
            <button key={x.id} type="button" aria-pressed={on} onClick={() => pickMachine(x.id)} className="pill inline-flex min-h-[44px] items-center gap-2 px-4 text-[15px]"
              style={{ background: on ? 'var(--wash-2)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-2)' }}>
              <span className="tnum font-medium">{x.number}</span>
              {px.complete ? <CheckCircle size={17} weight="regular" style={{ color: 'var(--ok)' }} role="img" aria-label="complete" />
                : <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{px.total ? `${px.open} open` : 'empty'}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <h3 className="display tnum text-[34px] font-semibold leading-none">Machine {m.number}.</h3>
          <p className="mt-2.5 text-[16px]" style={{ color: 'var(--ink-2)' }}>
            {facts}. {p.complete ? <span style={{ color: 'var(--ok)' }}>Complete. Every item is kitted, checked and booked.</span> : p.total ? `${plural(p.open, 'item')} open.` : 'No items yet; add them with Workshop off.'}
          </p>
          <Bars p={p} />

          <div className="sticky top-[104px] z-20 -mx-2 mt-6 px-2 pb-3 pt-2" style={{ background: 'var(--panel)' }}>
            <form onSubmit={find} role="search" className="flex flex-wrap items-center gap-2">
              <label htmlFor={findId} className="sr-only">Find an item by part number or name</label>
              <span className="relative min-w-[280px] flex-1">
                <MagnifyingGlass size={20} weight="regular" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }} />
                <input ref={findRef} id={findId} value={q} onChange={e => setQ(e.target.value)} placeholder="Scan or type a part number or name" autoComplete="off" spellCheck={false}
                  onKeyDown={e => { if (e.key === 'Escape' && (q || hit || miss)) { e.stopPropagation(); setQ(''); setHit(null); setMiss(null) } }}
                  className="field h-12 w-full pl-11 pr-3 text-[18px]" />
              </span>
              <button type="submit" className={primary + ' min-h-12'} disabled={!q.trim()}>Find</button>
              <button type="button" onClick={next} className={quiet + ' min-h-12'}>Next open item</button>
              <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly(v => !v)} className={ghost + ' min-h-12'} style={openOnly ? { background: 'var(--wash-2)', color: 'var(--ink)' } : undefined}>Open items only</button>
            </form>
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>A USB or Bluetooth scanner works anywhere on this page: scan, and Enter finds the item; Enter again ticks it.</p>
            {(hitItem || miss) && (
              <div role="status" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] px-4 py-3" style={{ border: '2px solid var(--accent)', background: 'var(--row)' }}>
                {miss ? <p className="text-[16px]">Nothing on {m.number} matches <b>{miss}</b>.</p> : (
                  <>
                    <p className="min-w-0 flex-1 text-[16px]"><b>{hitItem.name}</b>{hitItem.partNumber && <span className="tnum ml-2" style={{ color: 'var(--ink-2)' }}>{hitItem.partNumber}</span>}
                      {hits.length > 1 && <span className="ml-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>{plural(hits.length - 1, 'more item')} match.</span>}</p>
                    {action ? <button ref={actRef} type="button" onClick={() => tickFound(action)} className={primary + ' min-h-12 text-[16px]'}>{VERB[action]}</button>
                      : <span className="text-[15px] font-medium" style={{ color: 'var(--ok)' }}>Done: kitted, checked{needsStock(hitItem) ? ', booked' : ''}.</span>}
                    {hits.length > 1 && <button type="button" onClick={() => { const i = (hitIx + 1) % hits.length; setHitIx(i); show(hits[i]) }} className={quiet + ' min-h-12'}>Next match</button>}
                  </>
                )}
              </div>
            )}
          </div>

          {groups.map(([k, items]) => {
            const vis = items.filter(shown)
            if (!vis.length) return null
            return (
              <div key={k} className="mt-6">
                <h4 className="pb-1.5 text-[17px] font-medium" style={{ color: 'var(--ink-2)' }}>{KIND_LABEL[k]} <span className="tnum font-normal" style={{ color: 'var(--ink-3)' }}>{items.length}</span></h4>
                <ul>{vis.map(it => <WorkItem key={it.id} item={it} hit={it.id === hit} onFlip={(i, f) => onFlip(m.id, i.id, f)} />)}</ul>
              </div>
            )
          })}
          {openOnly && list.length > 0 && !list.some(shown) && <p className="mt-6 text-[15px]" style={{ color: 'var(--ok)' }}>Every item on {m.number} is done.</p>}
        </div>

        <aside className="min-w-0">
          <Photos projectKey={projectKey} m={m} onChanged={onReload} />
          <PhoneHint />
        </aside>
      </div>
    </div>
  )
}
