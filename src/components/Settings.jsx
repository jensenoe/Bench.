import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, ArrowSquareOut } from '@phosphor-icons/react'
import * as api from '../api.js'
import { getBackups, backupNow, restoreBackup, downloadUpdate, toast, refresh as askRefresh } from '../api/extras.js'
import { ALL_SCENES, COLLECTIONS, CADENCES, credits, libraryFor, libraryLabel, nextLibrary } from '../scenes.js'
import { ABOUT } from '../copy.js'
import { fmtDate } from '../lanes.js'
import Connect from './Connect.jsx'
import Health from './Health.jsx'
import { MailReading, PhoneView, StorageLine, DriveHome, AdminApproval } from './SettingsIntegrations.jsx'
import { ask } from './Confirm.jsx'
import { Bar } from './Skeleton.jsx'

const TABS = [
  { key: 'you', label: 'You' },
  { key: 'look', label: 'Look' },
  { key: 'hours', label: 'Hours' },
  { key: 'tools', label: 'Tools' },
  { key: 'machine', label: 'This machine' },
  { key: 'about', label: 'About' }
]
const TAB_KEY = 'bench.settings.tab'
const readTab = () => { try { const t = localStorage.getItem(TAB_KEY); return TABS.some(x => x.key === t) ? t : 'you' } catch { return 'you' } }

const Sec = ({ title, children, first = false }) => (
    <section className={first ? 'pb-5' : 'py-5'} style={first ? undefined : { borderTop: '1px solid var(--line)' }}>
      {title && <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{title}</h3>}
      <div className={`${title ? 'mt-3' : ''} flex flex-col gap-3`}>{children}</div>
    </section>
)
const Chips = ({ items, value, onPick, multi }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map(it => {
        const on = multi ? value.includes(it.key) : value === it.key
        return <button key={String(it.key)} onClick={(e) => onPick(it.key, e)} aria-pressed={on} className="pill px-3 py-1.5 text-[13.5px] transition-colors"
          style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'var(--wash-2)' : 'transparent' }}>{it.label}</button>
      })}
    </div>
)
/**
 * What the server would quietly refuse or bend (it skips a time it cannot read and clamps the numbers), so
 * the field says so under itself instead, and keeps what was typed until it reads right.
 */
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/
const time = v => TIME.test(v) ? null : 'Use hh:mm, for example 19:00.'
const between = (lo, hi, words, whole = false) => v => v === '' || (Number(v) >= lo && Number(v) <= hi && (!whole || Number.isInteger(Number(v)))) ? null : words
const CHECK = {
  email: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'That does not read as an email address.',
  quietFrom: time, quietTo: time, lunchAt: time, lunchEnds: time,
  workdayHours: between(1, 14, 'Between 1 and 14 hours.'),
  roundMinutes: between(1, 30, 'A whole number of minutes, 1 to 30.', true),
  hourlyRate: between(0, 1000, 'Between 0 and 1000 CHF.')
}
const Field = ({ label, k, type = 'text', placeholder, hint, mono, step, draft, set, save, errs = {} }) => (
    <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}
      <input type={type} step={step} value={draft[k] ?? ''} placeholder={placeholder} onChange={e => set(k, e.target.value)} onBlur={() => save(k)}
        aria-invalid={errs[k] ? true : undefined} aria-describedby={errs[k] ? `settings-${k}-err` : undefined}
        onKeyDown={e => { if (e.key === 'Enter') { save(k); e.target.blur() } }}
        className={`field mt-1 w-full px-2.5 py-2 text-[13px] ${mono ? 'tnum' : ''}`} style={{ color: 'var(--ink)' }} />
      {errs[k] && <span id={`settings-${k}-err`} role="alert" className="mt-1 block text-[12.5px] leading-relaxed" style={{ color: 'var(--caution)' }}>{errs[k]}</span>}
      {hint && <span className="mt-1 block text-[12.5px] leading-relaxed">{hint}</span>}
    </label>
)
const Toggle = ({ on, onChange, label, hint }) => (
    <button onClick={onChange} role="switch" aria-checked={on} className="flex min-h-6 items-start gap-2.5 text-left text-[13px]">
      <span className="mt-[1px] inline-block h-[18px] w-[30px] shrink-0 rounded-full p-[2px] transition-colors" style={{ background: on ? 'var(--accent)' : 'rgba(var(--ink-rgb),.14)' }}>
        <span className="block h-[14px] w-[14px] rounded-full transition-transform" style={{ background: on ? 'var(--accent-ink)' : 'var(--ink-3)', transform: on ? 'translateX(12px)' : 'none' }} />
      </span>
      <span>{label}{hint && <span className="mt-0.5 block text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{hint}</span>}</span>
    </button>
)
const Note = ({ children }) => <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{children}</span>
const kb = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
const hhmm = (iso) => new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

/**
 * Everything adjustable, in one panel off the gear, in sections (roadmap 92). Saves as you go.
 * You, Look, Hours, Tools, This machine, About: tabs along the top, arrow keys move between them,
 * the last one you were on is remembered. Every panel stays in the tree so a field keeps its
 * draft while you look elsewhere; only the current one is shown.
 */
export default function Settings({ open, onClose, settings, onSave, auth, timeclock, onRefresh }) {
  const [tab, setTab] = useState(readTab)
  const [info, setInfo] = useState(null)
  const [startup, setStartup] = useState(null)
  const [draft, setDraft] = useState(settings)
  const [needsRelaunch, setNeedsRelaunch] = useState(false)
  const [probe, setProbe] = useState(null)      // result of the workbook check
  const [upd, setUpd] = useState(null)          // result of the update check
  const [dl, setDl] = useState(null)            // the background download: { busy } or { error }
  const [imported, setImported] = useState(null)
  const [backups, setBackups] = useState(null)  // null until asked; [] when there are none
  const [backupNote, setBackupNote] = useState(null)
  const [errs, setErrs] = useState({})             // field key -> the line under it
  const [backupsErr, setBackupsErr] = useState(null)
  const [backingUp, setBackingUp] = useState(false)
  const panel = useRef(null)
  const tabRefs = useRef({})
  const importRef = useRef(null)
  const fail = (text) => (e) => toast(text, e?.message ? `${e.message}. Try again.` : 'Try again.')
  const checkWorkbook = async () => { setProbe({ busy: true }); try { setProbe(await api.probeWorkbook()) } catch (e) { setProbe({ ok: false, message: e.message }) } }
  const checkUpdates = async () => { setUpd({ busy: true }); try { setUpd(await api.checkUpdates(true)) } catch (e) { setUpd({ reason: e.message }) } }
  // /api/backups answers { dir, files, mirror }; the list is what the panel shows. A list that did not load
  // is not "no copies yet": it says so and offers Try again.
  const loadBackups = async () => { try { const r = await getBackups(); setBackups(Array.isArray(r) ? r : (r?.files || [])); setBackupsErr(null) } catch (e) { setBackups([]); setBackupsErr(e.message) } }
  const doBackup = async () => {
    if (backingUp) return
    setBackingUp(true); setBackupNote('Writing.')
    try { await backupNow(); await loadBackups(); setBackupNote('Done. Today has a fresh copy.') } catch (e) { setBackupNote(`Not written: ${e.message}`) } finally { setBackingUp(false) }
  }
  const importFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    e.target.value = ''
    if (!(await ask(`Import the settings in ${f.name}? Look, hours and pictures follow the file and replace what is set here; the sign-in stays.`, { yes: 'Import', title: 'Import.' }))) return
    try { const j = JSON.parse(await f.text()); await api.importSettings(j); onRefresh(); setImported('Imported. Look, hours and pictures follow the file; the sign-in does not.') }
    catch (err) { setImported(`Not imported: ${err.message}`) }
  }
  const disconnect = async () => {
    if (!(await ask('Disconnect Microsoft 365? Planner, the hours workbook and the calendar stop until you connect again. The board stays.', { yes: 'Disconnect', title: 'Disconnect.' }))) return
    try { await api.signOut(); onRefresh(); toast('Disconnected.', 'Tools > Microsoft 365 connects again.') } catch (e) { fail('Still connected.')(e) }
  }
  const doRestore = async (b) => {
    if (!(await ask(`Restore ${b.name} from ${fmtDate(b.at)}? The board goes back to that copy. Everything changed since then is lost.`, { yes: 'Restore' }))) return
    setBackupNote('Restoring.')
    try { await restoreBackup(b.file); askRefresh(); onRefresh?.(); toast('Restored.', `${b.name} from ${fmtDate(b.at)}.`); setBackupNote(`Restored ${b.name} from ${fmtDate(b.at)}.`) }
    catch (e) { setBackupNote(`Not restored: ${e.message}`) }
  }
  const download = async () => {
    setDl({ busy: true })
    try { const r = await downloadUpdate(); setUpd(u => ({ ...(u || {}), downloaded: { version: r.version, path: r.path, at: new Date().toISOString() } })); setDl(null) }
    catch (e) { setDl({ error: e.message }) }
  }

  useEffect(() => { setDraft(settings); setErrs({}) }, [settings])   // a fresh copy from the server drops any line about the old draft
  useEffect(() => {
    if (!open) return
    window.bench?.info?.().then(setInfo).catch(() => {})
    window.bench?.startup?.().then(setStartup).catch(() => {})
    loadBackups()
    api.checkUpdates().then(u => { if (u?.downloaded) setUpd(u) }).catch(() => {})
    // Escape a confirm has already answered stays with the confirm; a click on the confirm or a toast is not "outside".
    const onKey = e => { if (e.key === 'Escape' && !e.defaultPrevented) onClose() }
    const onClick = e => { if (panel.current && !panel.current.contains(e.target) && !e.target.closest?.('[role="alertdialog"], [role="status"], [role="alert"]')) onClose() }
    addEventListener('keydown', onKey); setTimeout(() => addEventListener('mousedown', onClick), 0)
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onClick) }
  }, [open, onClose])

  // Opening puts focus on the chosen tab; closing gives it back to what had it (the gear), unless it moved on.
  useEffect(() => {
    if (!open) return
    const before = document.activeElement
    const box = panel.current
    const t = setTimeout(() => panel.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus(), 30)
    return () => {
      clearTimeout(t)
      setTimeout(() => {
        const now = document.activeElement
        if (before?.isConnected && before !== document.body && (!now || now === document.body || box?.contains(now))) before.focus({ preventScroll: true })
      }, 0)
    }
  }, [open])

  const pickTab = (key, focus = false) => {
    setTab(key)
    try { localStorage.setItem(TAB_KEY, key) } catch { /* private mode */ }
    if (focus) tabRefs.current[key]?.focus()
  }
  const onTabKey = (e) => {
    const i = TABS.findIndex(t => t.key === tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pickTab(TABS[(i + 1) % TABS.length].key, true) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pickTab(TABS[(i - 1 + TABS.length) % TABS.length].key, true) }
    else if (e.key === 'Home') { e.preventDefault(); pickTab(TABS[0].key, true) }
    else if (e.key === 'End') { e.preventDefault(); pickTab(TABS.at(-1).key, true) }
  }

  const set = (k, v) => { setDraft(d => ({ ...d, [k]: v })); if (errs[k]) setErrs(x => ({ ...x, [k]: null })) }
  const save = (k) => {
    const e = CHECK[k]?.(String(draft[k] ?? '').trim()) || null
    setErrs(x => x[k] === e ? x : { ...x, [k]: e })
    if (e) return
    if (String(draft[k] ?? '') !== String(settings[k] ?? '')) onSave({ [k]: draft[k] })
  }
  const saveNow = (patch) => { setDraft(d => ({ ...d, ...patch })); onSave(patch) }
  // One library, or all of them. Shift-click adds a library to the current mix.
  const pickColl = (key, e) => {
    if (key === 'all') return saveNow({ collections: COLLECTIONS.map(c => c.key) })
    const cur = new Set(draft.collections || [])
    const all = cur.size >= COLLECTIONS.length
    if (e?.shiftKey && !all) { cur.has(key) ? cur.delete(key) : cur.add(key); if (!cur.size) cur.add(key); return saveNow({ collections: [...cur] }) }
    saveNow({ collections: [key] })
  }
  const collValue = (draft.collections || []).length >= COLLECTIONS.length ? 'all' : (draft.collections || [])
  const clock = timeclock?.clock
  const panelProps = (key) => ({ role: 'tabpanel', id: `settings-panel-${key}`, 'aria-labelledby': `settings-tab-${key}`, hidden: tab !== key, tabIndex: 0, className: 'outline-none' })
  const link = 'underline underline-offset-2 -my-[3px] py-[3px]'   // 13 px text plus this is a 24 px hit area

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={panel} key="settings" role="dialog" aria-label="Settings"
          initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }}
          transition={{ duration: .22, ease: [0.16, 1, 0.3, 1] }}
          className="panel fixed right-4 top-[84px] z-[60] w-[min(420px,calc(100vw-2rem))] overflow-y-auto px-6 pb-6 pt-5"
          style={{ maxHeight: 'calc(100vh - 100px)', boxShadow: 'var(--shadow-panel)' }}>
          <div className="flex items-center justify-between">
            <h2 className="display text-[22px] font-semibold leading-none">Settings.</h2>
            <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><X size={14} weight="bold" /></button>
          </div>

          <div role="tablist" aria-label="Settings sections" onKeyDown={onTabKey} className="mt-4 flex flex-wrap gap-1.5 pb-4" style={{ borderBottom: '1px solid var(--line)' }}>
            {TABS.map(t => {
              const on = t.key === tab
              return <button key={t.key} ref={el => { tabRefs.current[t.key] = el }} role="tab" id={`settings-tab-${t.key}`} aria-selected={on} aria-controls={`settings-panel-${t.key}`} tabIndex={on ? 0 : -1}
                onClick={() => pickTab(t.key)} className="pill px-3 py-1.5 text-[13.5px] font-medium transition-colors"
                style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'var(--wash-2)' : 'transparent' }}>{t.label}</button>
            })}
          </div>

          {/* You */}
          <div {...panelProps('you')}>
            <Sec first>
              <Field draft={draft} set={set} save={save} errs={errs} label="Name, as the tools spell it" k="name" placeholder="Noël Jensen" hint="For the greeting, and to match what Issues, QMS and the BOM assign to you." />
              <Field draft={draft} set={set} save={save} errs={errs} label="Work email" k="email" type="email" placeholder="name@tom.fit" hint="Some tools list people by address." />
            </Sec>
            <Sec title="The day">
              <Toggle on={draft.morningBrief !== false} onChange={() => saveNow({ morningBrief: draft.morningBrief === false })} label="Morning brief" hint="The first start of the day opens with what is due, what is waiting and what is cold." />
              <Toggle on={draft.eveningClose !== false} onChange={() => saveNow({ eveningClose: draft.eveningClose === false })} label="Evening close" hint="Clocking out offers a look back over the day before the screen goes." />
              <div>
                <Note>Focus timer</Note>
                <div className="mt-1.5"><Chips items={[15, 25, 50, 90].map(m => ({ key: m, label: `${m} min` }))} value={Number(draft.focusMinutes) || 25} onPick={v => saveNow({ focusMinutes: v })} /></div>
              </div>
              <Field draft={draft} set={set} save={save} errs={errs} label="Hours in a working day" k="workdayHours" type="number" step="0.1" mono placeholder="8.4" hint="Today's free hours are what is left of this after the cards on it." />
            </Sec>
            <Sec title="Quiet hours">
              <div className="grid grid-cols-2 gap-2">
                <Field draft={draft} set={set} save={save} errs={errs} label="Quiet from" k="quietFrom" mono placeholder="19:00" />
                <Field draft={draft} set={set} save={save} errs={errs} label="Quiet to" k="quietTo" mono placeholder="07:00" />
              </div>
              <Toggle on={draft.quietWeekends !== false} onChange={() => saveNow({ quietWeekends: draft.quietWeekends === false })} label="Quiet at the weekend" />
              <Note>No notification between these times or on a quiet weekend day, the lunch reminders included; the board itself keeps working.</Note>
            </Sec>
          </div>

          {/* Look */}
          <div {...panelProps('look')}>
            <Sec first>
              <Chips items={[{ key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' }]} value={draft.theme} onPick={v => saveNow({ theme: v })} />
              <div>
                <Note>Time of day</Note>
                <div className="mt-1.5"><Chips items={[{ key: null, label: 'Follow the clock' }, ...ALL_SCENES.map(s => ({ key: s.key, label: s.label }))]} value={draft.sceneOverride ?? null} onPick={v => saveNow({ sceneOverride: v })} /></div>
              </div>
              <div>
                <Note>Pictures. Everything, or one library; shift-click to mix a few.</Note>
                <div className="mt-1.5"><Chips multi items={[{ key: 'all', label: 'Everything' }, ...COLLECTIONS]} value={collValue === 'all' ? ['all'] : collValue} onPick={pickColl} /></div>
              </div>
              {(draft.collections || []).length !== 1 && (
                <div>
                  <Note>How the libraries take turns. One a day keeps every picture on every page in one library and moves on tomorrow; Random mixes them picture by picture.</Note>
                  <div className="mt-1.5"><Chips items={[{ key: 'daily', label: 'One library a day' }, { key: 'random', label: 'Random' }]} value={draft.pictureMode === 'random' ? 'random' : 'daily'} onPick={v => saveNow({ pictureMode: v })} /></div>
                  {draft.pictureMode !== 'random' && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
                      <span style={{ color: 'var(--ink-2)' }}>Today: {libraryLabel(libraryFor())}. Tomorrow: {libraryLabel(nextLibrary())}.</span>
                      <button onClick={() => { saveNow({ libraryShift: (Number(draft.libraryShift) || 0) + 1 }); toast(`Now: ${libraryLabel(nextLibrary())}.`, 'Every picture follows it until tomorrow.') }} className="pill btn-quiet px-3 py-1.5 text-[13px] font-medium">Next theme</button>
                    </div>
                  )}
                </div>
              )}
              <div>
                <Note>New picture every</Note>
                <div className="mt-1.5"><Chips items={CADENCES.map(m => ({ key: m, label: m === 60 ? 'hour' : `${m} min` }))} value={draft.pictureMinutes || 20} onPick={v => saveNow({ pictureMinutes: v })} /></div>
              </div>
            </Sec>
            <Sec title="Density">
              <Chips items={[{ key: 'comfortable', label: 'Comfortable' }, { key: 'compact', label: 'Compact' }]} value={draft.density === 'compact' ? 'compact' : 'comfortable'} onPick={v => saveNow({ density: v })} />
              <Note>Compact puts a card on one line on a wide screen, shows two chips until you hover, and keeps the introductions away.</Note>
            </Sec>
          </div>

          {/* Hours */}
          <div {...panelProps('hours')}>
            <Sec first>
              <Field draft={draft} set={set} save={save} errs={errs} label="Workbook in your OneDrive" k="timesheetPath" mono placeholder="Documents/TomFit_Zeiterfassung_{year}_{name}.xlsx"
                hint={<>Path from the OneDrive root, same shape as the Excel file name. <span className="tnum">{'{year}'}</span> and <span className="tnum">{'{name}'}</span> are filled in for you{clock ? <>, currently <span className="tnum">{clock.workbook}</span></> : ''}.</>} />
              <Field draft={draft} set={set} save={save} errs={errs} label="Or a sharing link to the workbook" k="timesheetUrl" mono placeholder="https://…sharepoint.com/:x:/…" hint="Wins over the path when set. Leave empty to use the path." />
              <div className="grid grid-cols-3 gap-2">
                <Field draft={draft} set={set} save={save} errs={errs} label="Lunch reminder" k="lunchAt" mono placeholder="12:00" />
                <Field draft={draft} set={set} save={save} errs={errs} label="Lunch ends" k="lunchEnds" mono placeholder="12:30" />
                <Field draft={draft} set={set} save={save} errs={errs} label="Round down, min" k="roundMinutes" type="number" mono />
              </div>
              <Field draft={draft} set={set} save={save} errs={errs} label="Hourly rate, CHF" k="hourlyRate" type="number" step="1" mono placeholder="0" hint="For the cost per machine on the Review page. Zero shows hours only." />
              <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
                <button onClick={checkWorkbook} disabled={probe?.busy} className="pill btn-quiet px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50">{probe?.busy ? 'Looking' : 'Check the workbook'}</button>
                <a href="#/hours" onClick={onClose} className={link} style={{ color: 'var(--ink-3)' }}>This month's hours</a>
              </div>
              {probe && !probe.busy && (
                <p className="text-[13.5px] leading-relaxed" style={{ color: probe.ok ? 'var(--ok)' : 'var(--caution)' }}>
                  {probe.ok ? <>Found it. Sheet <span className="tnum">{probe.sheet}</span>, today is row <span className="tnum">{probe.row}</span>.</> : probe.message}
                </p>
              )}
              {clock && (clock.events.length > 0 || clock.unclosed) && (
                <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  {clock.sheet && <>Today writes to {clock.sheet.name} row {clock.sheet.row}. </>}
                  {clock.unclosed && <span style={{ color: 'var(--caution)' }}>{clock.unclosed.date} was never clocked out. </span>}
                  {clock.events.length > 0 && <button onClick={() => ask("Forget today's punches here? The sheet keeps what was written.", { yes: 'Forget' }).then(ok => ok && timeclock.reset())} className={link}>Reset today</button>}
                </p>
              )}
            </Sec>
          </div>

          {/* Tools */}
          <div {...panelProps('tools')}>
            <Sec first title="Microsoft 365">
              {auth.signedIn ? (
                <>
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span>Connected as <span className="tnum">{auth.username}</span></span>
                    <button onClick={disconnect} className={link} style={{ color: 'var(--ink-3)' }}>Disconnect</button>
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Planner and the hours workbook are on.</p>
                  {auth.extra?.granted ? (
                    <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Issue list and calendar are on too.</p>
                  ) : (
                    <>
                      <AdminApproval auth={auth} name={draft.name} />
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                        <span>The calendar and the issue list: sign in once more and accept the two new permissions.</span>
                        <Connect auth={auth} onRefresh={onRefresh} tier="extra" label="Sign in again" quiet className="inline-block" />
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Connect auth={auth} onRefresh={onRefresh} />
                  <AdminApproval auth={auth} name={draft.name} />
                </>
              )}
            </Sec>
            <Sec title="Photographs from the phone">
              <Field draft={draft} set={set} save={save} errs={errs} label="Folder to watch" k="inboxDir" mono placeholder="C:\Users\you\OneDrive\Pictures\Camera Roll"
                hint="OneDrive's camera roll folder works well: the phone uploads a picture, Bench. sees it within half a minute and offers it on the Board, to go onto a task as a link. Pictures from the last fourteen days. Empty means off." />
              {info?.chooseFolder && <button onClick={async () => { try { const r = await window.bench.chooseFolder?.(); if (r?.path) saveNow({ inboxDir: r.path }) } catch (e) { fail('No folder picked.')(e) } }} className={`text-[13px] ${link}`}>Choose a folder</button>}
            </Sec>
            <Sec title="Order confirmations and delivery notes">
              <MailReading on={draft.mailRead === true} onToggle={() => saveNow({ mailRead: draft.mailRead !== true })} />
            </Sec>
            <Sec title="The phone">
              <PhoneView draft={draft} set={set} save={save} saveNow={saveNow} />
            </Sec>
            <Sec title="The drive home">
              <DriveHome draft={draft} set={set} save={save} settings={settings} />
            </Sec>
            <Sec title="Introductions">
              <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>The short walk-throughs on the Board, Procurement, Logbook, Napkin, Machines and Projects show once. <button onClick={() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('bench.coach.')) localStorage.removeItem(k); toast('The introductions are back.', 'Each page shows its own the next time you open it.') } catch { toast('The introductions stay hidden.', 'This window keeps no local storage. Try again after a restart.') } }} className={link} style={{ color: 'var(--ink-2)' }}>Show them again</button>.</p>
            </Sec>
          </div>

          {/* This machine */}
          <div {...panelProps('machine')}>
            <Sec first>
              {info && (
                <div className="text-[13.5px]">
                  <div style={{ color: 'var(--ink-3)' }}>The board lives in</div>
                  <div className="tnum mt-0.5 break-all">{info.dataDir}</div>
                  <div className="mt-2 flex items-center gap-4">
                    <button onClick={async () => { try { const r = await window.bench.chooseDataFolder(); if (r?.changed) setNeedsRelaunch(true) } catch (e) { fail('The board stays where it is.')(e) } }} className={link}>Choose a shared folder</button>
                    <button onClick={() => window.bench.openDataFolder()} className={link} style={{ color: 'var(--ink-3)' }}>Open</button>
                  </div>
                  {needsRelaunch && <p className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>Takes effect after a restart. <button onClick={() => window.bench.relaunch()} className={link}>Restart now</button></p>}
                </div>
              )}
              {startup !== null && <Toggle on={startup} onChange={async () => { try { setStartup(await window.bench.startup(!startup)) } catch (e) { fail('Windows did not take the change.')(e) } }} label="Starts with Windows" />}
              <Toggle on={draft.nudges !== false} onChange={() => saveNow({ nudges: draft.nudges === false })} label="Water and coffee nudges" />
              <p className="-mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>At natural pauses: a ticked task, the end of a focus session, before a long meeting, after ninety minutes without a break. Coffee in the morning and the early-afternoon dip, none after three; water only on a warm day. At most four a day, never off the clock, in a meeting or in the quiet hours. Not now pushes the next one back an hour.</p>
              <div className="flex flex-wrap items-center gap-4 text-[13px]">
                <a href="/api/settings/export" download="bench-settings.json" className={link}>Export settings</a>
                {/* A button, so the keyboard reaches it: a label around a hidden file input is not a Tab stop. */}
                <button type="button" onClick={() => importRef.current?.click()} className={`cursor-pointer ${link}`}>Import settings</button>
                <input ref={importRef} type="file" accept="application/json,.json" tabIndex={-1} aria-hidden="true" className="hidden" onChange={importFile} />
                {imported && <span role="status" style={{ color: 'var(--ink-3)' }}>{imported}</span>}
              </div>
            </Sec>
            <Sec title="Storage.">
              <StorageLine />
            </Sec>
            <Sec title="Backups.">
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>A copy of the board, once a day before the first write, kept thirty days. Restore puts one back in place of what is there now.</p>
              {backups === null ? <Bar w="62%" h={12} />
                : backupsErr ? <Note>The list of copies did not load: {backupsErr}. <button onClick={loadBackups} className={link} style={{ color: 'var(--ink-2)' }}>Try again</button></Note>
                : backups.length === 0 ? <Note>No copies yet. Bench. writes the first one the first time the board changes on a new day.</Note>
                : (
                  <ul className="flex flex-col gap-1.5 text-[13px]">
                    {backups.slice(0, 12).map(b => (
                      <li key={b.file} className="row flex items-center gap-3 px-3 py-2">
                        <span className="tnum shrink-0" data-volatile style={{ color: 'var(--ink-2)' }}>{fmtDate(b.at)} {hhmm(b.at)}</span>
                        <span className="min-w-0 flex-1 truncate" title={b.file}>{b.name}</span>
                        <span className="tnum shrink-0" style={{ color: 'var(--ink-3)' }}>{kb(b.size)}</span>
                        <button onClick={() => doRestore(b)} className={`shrink-0 ${link}`} style={{ color: 'var(--ink-2)' }}>Restore</button>
                      </li>
                    ))}
                    {backups.length > 12 && <li><Note>{backups.length - 12} older copies in the backups folder.</Note></li>}
                  </ul>
                )}
              <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
                <button onClick={doBackup} disabled={backingUp} aria-busy={backingUp || undefined} className="pill btn-quiet px-3.5 py-1.5 text-[13.5px] font-medium">Back up now</button>
                {backupNote && <span role="status" className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{backupNote}</span>}
              </div>
            </Sec>
            <Sec title="Health.">
              <Health />
            </Sec>
          </div>

          {/* About */}
          <div {...panelProps('about')}>
            <Sec first>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{ABOUT.long}</p>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                Photographs from Pexels and Unsplash, free licences. {credits().slice(0, 12).join(', ')} and others.{info ? ` Bench. v${String(info.version).replace(/-beta\.(\d+)/, ' beta $1')}.` : ''}
              </p>
              {info?.logFile && <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>If something broke, <button onClick={() => window.bench.openLog()} className={link} style={{ color: 'var(--ink-2)' }}>open bench.log</button> and send it along.</p>}
              <div className="row p-4 text-[13.5px]">
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={checkUpdates} disabled={upd?.busy} className="pill btn-quiet px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50">{upd?.busy ? 'Asking GitHub' : 'Check for updates'}</button>
                  <button onClick={() => api.openExternal(upd?.url || 'https://github.com/jensenoe/Bench./releases')} className={`inline-flex items-center gap-1 ${link}`} style={{ color: 'var(--ink-3)' }}>Releases page <ArrowSquareOut size={11} weight="bold" /></button>
                </div>
                {upd && !upd.busy && !upd.downloaded && (
                  <p className="mt-2 leading-relaxed" style={{ color: upd.newer ? 'var(--accent)' : 'var(--ink-3)' }}>
                    {upd.newer ? <>Bench. {upd.latest} is out; you have {upd.current}. {upd.download && <><button onClick={download} disabled={dl?.busy} className={`${link} disabled:opacity-50`} style={{ color: 'var(--ink)' }}>{dl?.busy ? 'Downloading' : 'Download it here'}</button> or </>}<button onClick={() => api.openExternal(upd.download || upd.url)} className={link} style={{ color: 'var(--ink)' }}>open the installer page</button>.{dl?.error && <span style={{ color: 'var(--caution)' }}> Download failed: {dl.error}.</span>}</>
                      : upd.reason === 'private' ? 'The repository is private, so GitHub will not say without a token. Paste one below, or open the releases page.'
                      : upd.reason === 'bad-token' ? 'GitHub did not accept the token.'
                      : upd.reason === 'offline' ? 'Could not reach GitHub.'
                      : upd.reason === 'no-release' ? 'No release yet.'
                      : upd.reason ? `Could not check: ${upd.reason}.`
                      : `You have the latest, ${upd.current}.`}
                  </p>
                )}
                {upd?.downloaded && (
                  <p className="mt-2 leading-relaxed" style={{ color: 'var(--accent)' }}>
                    Bench. {upd.downloaded.version} is downloaded.{' '}
                    <button onClick={() => window.bench?.installUpdateNow?.(upd.downloaded.path)} className={link} style={{ color: 'var(--ink)' }}>Install now</button>
                    <span style={{ color: 'var(--ink-3)' }}> or </span>
                    <button onClick={() => window.bench?.installUpdate?.(upd.downloaded.path)} className={link} style={{ color: 'var(--ink)' }}>Installs when you quit</button>
                  </p>
                )}
                <Field draft={draft} set={set} save={save} errs={errs} label="GitHub token for the update check" k="updateToken" type="password" mono placeholder={settings.hasUpdateToken ? 'A token is saved. Paste a new one to replace it.' : 'github_pat_… with read access to the repo'} hint="Optional. Stays in your own profile. Without it the button only opens the releases page." />
              </div>
            </Sec>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
