import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Copy, Check, ArrowSquareOut } from '@phosphor-icons/react'
import * as api from '../api.js'
import { getBackups, backupNow, restoreBackup, downloadUpdate, toast, refresh as askRefresh } from '../api/extras.js'
import { ALL_SCENES, COLLECTIONS, CADENCES, credits, libraryFor, libraryLabel, nextLibrary } from '../scenes.js'
import { ABOUT } from '../copy.js'
import { fmtDate } from '../lanes.js'
import Connect from './Connect.jsx'
import Health from './Health.jsx'
import { MailReading, PhoneView, StorageLine } from './SettingsIntegrations.jsx'

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
          style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'rgba(var(--ink-rgb),.1)' : 'transparent', border: '1px solid var(--line)' }}>{it.label}</button>
      })}
    </div>
)
const Field = ({ label, k, type = 'text', placeholder, hint, mono, step, draft, set, save }) => (
    <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}
      <input type={type} step={step} value={draft[k] ?? ''} placeholder={placeholder} onChange={e => set(k, e.target.value)} onBlur={() => save(k)}
        onKeyDown={e => { if (e.key === 'Enter') { save(k); e.target.blur() } }}
        className={`field mt-1 w-full px-2.5 py-2 text-[13px] ${mono ? 'tnum' : ''}`} style={{ color: 'var(--ink)' }} />
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
  const [linkCopied, setLinkCopied] = useState(false)
  const [probe, setProbe] = useState(null)      // result of the workbook check
  const [upd, setUpd] = useState(null)          // result of the update check
  const [dl, setDl] = useState(null)            // the background download: { busy } or { error }
  const [imported, setImported] = useState(null)
  const [backups, setBackups] = useState(null)  // null until asked; [] when there are none
  const [backupNote, setBackupNote] = useState(null)
  const panel = useRef(null)
  const tabRefs = useRef({})
  const checkWorkbook = async () => { setProbe({ busy: true }); try { setProbe(await api.probeWorkbook()) } catch (e) { setProbe({ ok: false, message: e.message }) } }
  const checkUpdates = async () => { setUpd({ busy: true }); try { setUpd(await api.checkUpdates(true)) } catch (e) { setUpd({ reason: e.message }) } }
  const copyLink = async (t) => { try { await navigator.clipboard.writeText(t); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500) } catch { /* clipboard blocked */ } }
  // /api/backups answers { dir, files, mirror }; the list is what the panel shows
  const loadBackups = async () => { try { const r = await getBackups(); setBackups(Array.isArray(r) ? r : (r?.files || [])) } catch { setBackups([]) } }
  const doBackup = async () => { setBackupNote('Writing.'); try { await backupNow(); await loadBackups(); setBackupNote('Done. Today has a fresh copy.') } catch (e) { setBackupNote(`Not written: ${e.message}`) } }
  const doRestore = async (b) => {
    if (!confirm(`Restore ${b.name} from ${fmtDate(b.at)}? The board goes back to that copy. Everything changed since then is lost.`)) return
    setBackupNote('Restoring.')
    try { await restoreBackup(b.file); askRefresh(); onRefresh?.(); toast('Restored.', `${b.name} from ${fmtDate(b.at)}.`); setBackupNote(`Restored ${b.name} from ${fmtDate(b.at)}.`) }
    catch (e) { setBackupNote(`Not restored: ${e.message}`) }
  }
  const download = async () => {
    setDl({ busy: true })
    try { const r = await downloadUpdate(); setUpd(u => ({ ...(u || {}), downloaded: { version: r.version, path: r.path, at: new Date().toISOString() } })); setDl(null) }
    catch (e) { setDl({ error: e.message }) }
  }

  useEffect(() => { setDraft(settings) }, [settings])
  useEffect(() => {
    if (!open) return
    window.bench?.info?.().then(setInfo).catch(() => {})
    window.bench?.startup?.().then(setStartup).catch(() => {})
    loadBackups()
    api.checkUpdates().then(u => { if (u?.downloaded) setUpd(u) }).catch(() => {})
    const onKey = e => { if (e.key === 'Escape') onClose() }
    const onClick = e => { if (panel.current && !panel.current.contains(e.target)) onClose() }
    addEventListener('keydown', onKey); setTimeout(() => addEventListener('mousedown', onClick), 0)
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onClick) }
  }, [open, onClose])

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

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const save = (k) => { if (String(draft[k] ?? '') !== String(settings[k] ?? '')) onSave({ [k]: draft[k] }) }
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
                style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'rgba(var(--ink-rgb),.1)' : 'transparent', border: `1px solid ${on ? 'var(--line-2)' : 'transparent'}` }}>{t.label}</button>
            })}
          </div>

          {/* You */}
          <div {...panelProps('you')}>
            <Sec first>
              <Field draft={draft} set={set} save={save} label="Name, as the tools spell it" k="name" placeholder="Noël Jensen" hint="Used for the greeting and to find what Issues, QMS and the BOM assign to you." />
              <Field draft={draft} set={set} save={save} label="Work email" k="email" type="email" placeholder="name@tom.fit" hint="Some tools list people by address." />
            </Sec>
            <Sec title="The day">
              <Toggle on={draft.morningBrief !== false} onChange={() => saveNow({ morningBrief: draft.morningBrief === false })} label="Morning brief" hint="The first start of the day opens with what is due, what is waiting and what is cold." />
              <Toggle on={draft.eveningClose !== false} onChange={() => saveNow({ eveningClose: draft.eveningClose === false })} label="Evening close" hint="Clocking out offers a look back over the day before the screen goes." />
              <div>
                <Note>Focus timer</Note>
                <div className="mt-1.5"><Chips items={[15, 25, 50, 90].map(m => ({ key: m, label: `${m} min` }))} value={Number(draft.focusMinutes) || 25} onPick={v => saveNow({ focusMinutes: v })} /></div>
              </div>
              <Field draft={draft} set={set} save={save} label="Hours in a working day" k="workdayHours" type="number" step="0.1" mono placeholder="8.4" hint="Today's free hours are what is left of this after the cards on it." />
            </Sec>
            <Sec title="Quiet hours">
              <div className="grid grid-cols-2 gap-2">
                <Field draft={draft} set={set} save={save} label="Quiet from" k="quietFrom" mono placeholder="19:00" />
                <Field draft={draft} set={set} save={save} label="Quiet to" k="quietTo" mono placeholder="07:00" />
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
                      <button onClick={() => { saveNow({ libraryShift: (Number(draft.libraryShift) || 0) + 1 }); toast(`Now: ${libraryLabel(nextLibrary())}.`, 'Every picture follows it until tomorrow.') }} className="pill px-3 py-1.5 text-[13px] font-medium" style={{ border: '1px solid var(--line-2)' }}>Next theme</button>
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
              <Field draft={draft} set={set} save={save} label="Workbook in your OneDrive" k="timesheetPath" mono placeholder="Documents/TomFit_Zeiterfassung_{year}_{name}.xlsx"
                hint={<>Path from the OneDrive root, same shape as the Excel file name. <span className="tnum">{'{year}'}</span> and <span className="tnum">{'{name}'}</span> are filled in for you{clock ? <>, currently <span className="tnum">{clock.workbook}</span></> : ''}.</>} />
              <Field draft={draft} set={set} save={save} label="Or a sharing link to the workbook" k="timesheetUrl" mono placeholder="https://…sharepoint.com/:x:/…" hint="Wins over the path when set. Leave empty to use the path." />
              <div className="grid grid-cols-3 gap-2">
                <Field draft={draft} set={set} save={save} label="Lunch reminder" k="lunchAt" mono placeholder="12:00" />
                <Field draft={draft} set={set} save={save} label="Lunch ends" k="lunchEnds" mono placeholder="12:30" />
                <Field draft={draft} set={set} save={save} label="Round down, min" k="roundMinutes" type="number" mono />
              </div>
              <Field draft={draft} set={set} save={save} label="Hourly rate, CHF" k="hourlyRate" type="number" step="1" mono placeholder="0" hint="For the cost per machine on the Review page. Zero shows hours only." />
              <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
                <button onClick={checkWorkbook} disabled={probe?.busy} className="pill px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50" style={{ border: '1px solid var(--line-2)' }}>{probe?.busy ? 'Looking' : 'Check the workbook'}</button>
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
                  {clock.events.length > 0 && <button onClick={() => { if (confirm("Forget today's punches here? The sheet keeps what was written.")) timeclock.reset() }} className={link}>Reset today</button>}
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
                    <button onClick={async () => { await api.signOut(); onRefresh() }} className={link} style={{ color: 'var(--ink-3)' }}>Disconnect</button>
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Planner and the hours workbook are on.</p>
                  {auth.extra?.granted ? (
                    <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Issue list and calendar are on too.</p>
                  ) : (
                    <div className="row p-4 text-[13.5px]">
                      <p className="leading-relaxed">The issue-ticket list and today's meetings need a one-time approval from a tom.fit admin. Send them the link, and once they have clicked it press Grant.</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button onClick={() => copyLink(auth.adminConsentUrl)} className="pill inline-flex items-center gap-1.5 px-3.5 py-2 text-[13.5px]" style={{ border: '1px solid var(--line-2)' }}>
                          {linkCopied ? <><Check size={12} weight="bold" /> Copied</> : <><Copy size={12} weight="bold" /> Copy the approval link</>}
                        </button>
                        <Connect auth={auth} onRefresh={onRefresh} tier="extra" label="Grant" quiet className="inline-block" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Connect auth={auth} onRefresh={onRefresh} />
              )}
            </Sec>
            <Sec title="Photographs from the phone">
              <Field draft={draft} set={set} save={save} label="Folder to watch" k="inboxDir" mono placeholder="C:\Users\you\OneDrive\Pictures\Camera Roll"
                hint="OneDrive's camera roll folder works well: the phone uploads a picture, Bench sees it within half a minute and offers it on the Board, to go onto a task as a link. Pictures from the last fourteen days. Empty means off." />
              {info?.chooseFolder && <button onClick={async () => { const r = await window.bench.chooseFolder?.(); if (r?.path) saveNow({ inboxDir: r.path }) }} className={`text-[13px] ${link}`}>Choose a folder</button>}
            </Sec>
            <Sec title="Order confirmations and delivery notes">
              <MailReading on={draft.mailRead === true} onToggle={() => saveNow({ mailRead: draft.mailRead !== true })} />
            </Sec>
            <Sec title="The phone">
              <PhoneView draft={draft} set={set} save={save} saveNow={saveNow} />
            </Sec>
            <Sec title="Introductions">
              <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>The short walk-throughs on the Board, Procurement, Logbook and Napkin show once. <button onClick={() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('bench.coach.')) localStorage.removeItem(k) } catch { /* ignore */ } }} className={link} style={{ color: 'var(--ink-2)' }}>Show them again</button>.</p>
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
                    <button onClick={async () => { const r = await window.bench.chooseDataFolder(); if (r.changed) setNeedsRelaunch(true) }} className={link}>Choose a shared folder</button>
                    <button onClick={() => window.bench.openDataFolder()} className={link} style={{ color: 'var(--ink-3)' }}>Open</button>
                  </div>
                  {needsRelaunch && <p className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>Takes effect after a restart. <button onClick={() => window.bench.relaunch()} className={link}>Restart now</button></p>}
                </div>
              )}
              {startup !== null && <Toggle on={startup} onChange={async () => setStartup(await window.bench.startup(!startup))} label="Starts with Windows" />}
              <Toggle on={draft.nudges !== false} onChange={() => saveNow({ nudges: draft.nudges === false })} label="Water and coffee reminders after a task" />
              <div className="flex flex-wrap items-center gap-4 text-[13px]">
                <a href="/api/settings/export" download="bench-settings.json" className={link}>Export settings</a>
                <label className={`cursor-pointer ${link}`}>Import settings
                  <input type="file" accept="application/json,.json" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return
                    try { const j = JSON.parse(await f.text()); await api.importSettings(j); onRefresh(); setImported('Imported. Look, hours and pictures follow the file; the sign-in does not.') }
                    catch (err) { setImported(`Not imported: ${err.message}`) }
                    e.target.value = ''
                  }} />
                </label>
                {imported && <span style={{ color: 'var(--ink-3)' }}>{imported}</span>}
              </div>
            </Sec>
            <Sec title="Storage.">
              <StorageLine />
            </Sec>
            <Sec title="Backups.">
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>A copy of the board, once a day before the first write, kept thirty days. Restore puts one back in place of what is there now.</p>
              {backups === null ? <Note>Looking.</Note>
                : backups.length === 0 ? <Note>No copies yet. The first one is written the first time the board changes on a new day.</Note>
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
                <button onClick={doBackup} className="pill px-3.5 py-1.5 text-[13.5px] font-medium" style={{ border: '1px solid var(--line-2)' }}>Back up now</button>
                {backupNote && <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{backupNote}</span>}
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
              {info?.logFile && <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Something went wrong? <button onClick={() => window.bench.openLog()} className={link} style={{ color: 'var(--ink-2)' }}>Open bench.log</button> and send it along.</p>}
              <div className="row p-4 text-[13.5px]">
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={checkUpdates} disabled={upd?.busy} className="pill px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{upd?.busy ? 'Asking GitHub' : 'Check for updates'}</button>
                  <button onClick={() => api.openExternal(upd?.url || 'https://github.com/jensenoe/Bench./releases')} className={`inline-flex items-center gap-1 ${link}`} style={{ color: 'var(--ink-3)' }}>Releases page <ArrowSquareOut size={11} weight="bold" /></button>
                </div>
                {upd && !upd.busy && !upd.downloaded && (
                  <p className="mt-2 leading-relaxed" style={{ color: upd.newer ? 'var(--accent)' : 'var(--ink-3)' }}>
                    {upd.newer ? <>Bench {upd.latest} is out; you have {upd.current}. {upd.download && <><button onClick={download} disabled={dl?.busy} className={`${link} disabled:opacity-50`} style={{ color: 'var(--ink)' }}>{dl?.busy ? 'Downloading' : 'Download it here'}</button> or </>}<button onClick={() => api.openExternal(upd.download || upd.url)} className={link} style={{ color: 'var(--ink)' }}>open the installer page</button>.{dl?.error && <span style={{ color: 'var(--caution)' }}> Download failed: {dl.error}.</span>}</>
                      : upd.reason === 'private' ? 'The repository is private, so GitHub will not say without a token. Paste one below, or open the releases page.'
                      : upd.reason === 'bad-token' ? 'GitHub did not accept the token.'
                      : upd.reason === 'offline' ? 'Could not reach GitHub.'
                      : upd.reason === 'no-release' ? 'No release has been published yet.'
                      : upd.reason ? `Could not check: ${upd.reason}.`
                      : `You have the latest, ${upd.current}.`}
                  </p>
                )}
                {upd?.downloaded && (
                  <p className="mt-2 leading-relaxed" style={{ color: 'var(--accent)' }}>
                    Bench {upd.downloaded.version} is downloaded.{' '}
                    <button onClick={() => window.bench?.installUpdateNow?.(upd.downloaded.path)} className={link} style={{ color: 'var(--ink)' }}>Install now</button>
                    <span style={{ color: 'var(--ink-3)' }}> or </span>
                    <button onClick={() => window.bench?.installUpdate?.(upd.downloaded.path)} className={link} style={{ color: 'var(--ink)' }}>Installs when you quit</button>
                  </p>
                )}
                <Field draft={draft} set={set} save={save} label="GitHub token for the update check" k="updateToken" type="password" mono placeholder={settings.hasUpdateToken ? 'A token is saved. Paste a new one to replace it.' : 'github_pat_… with read access to the repo'} hint="Optional. Stays in your own profile. Without it the button only opens the releases page." />
              </div>
            </Sec>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
