import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Copy, Check, ArrowSquareOut } from '@phosphor-icons/react'
import * as api from '../api.js'
import { ALL_SCENES, COLLECTIONS, CADENCES, credits, libraryFor, libraryLabel } from '../scenes.js'
import { ABOUT } from '../copy.js'
import Connect from './Connect.jsx'

const Sec = ({ title, children }) => (
    <section className="py-5" style={{ borderTop: '1px solid var(--line)' }}>
      <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{title}</h3>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
)
const Chips = ({ items, value, onPick, multi }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map(it => {
        const on = multi ? value.includes(it.key) : value === it.key
        return <button key={String(it.key)} onClick={(e) => onPick(it.key, e)} className="pill px-3 py-1.5 text-[13.5px] transition-colors"
          style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'rgba(var(--ink-rgb),.1)' : 'transparent', border: '1px solid var(--line)' }}>{it.label}</button>
      })}
    </div>
)
const Field = ({ label, k, type = 'text', placeholder, hint, mono, draft, set, save }) => (
    <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}
      <input type={type} value={draft[k] ?? ''} placeholder={placeholder} onChange={e => set(k, e.target.value)} onBlur={() => save(k)}
        onKeyDown={e => { if (e.key === 'Enter') { save(k); e.target.blur() } }}
        className={`field mt-1 w-full px-2.5 py-2 text-[13px] ${mono ? 'tnum' : ''}`} style={{ color: 'var(--ink)' }} />
      {hint && <span className="mt-1 block text-[12.5px] leading-relaxed">{hint}</span>}
    </label>
)
const Toggle = ({ on, onChange, label }) => (
    <button onClick={onChange} className="flex items-center gap-2.5 text-[13px]">
      <span className="inline-block h-[18px] w-[30px] rounded-full p-[2px] transition-colors" style={{ background: on ? 'var(--accent)' : 'rgba(var(--ink-rgb),.14)' }}>
        <span className="block h-[14px] w-[14px] rounded-full transition-transform" style={{ background: on ? 'var(--accent-ink)' : 'var(--ink-3)', transform: on ? 'translateX(12px)' : 'none' }} />
      </span>{label}
    </button>
)


/**
 * Everything adjustable, in one panel off the gear. Saves as you go.
 * Sections read top to bottom in the order you are likely to need them:
 * look, you, hours, where the board lives, connections, about.
 */
export default function Settings({ open, onClose, settings, onSave, auth, timeclock, onRefresh }) {
  const [info, setInfo] = useState(null)
  const [startup, setStartup] = useState(null)
  const [draft, setDraft] = useState(settings)
  const [needsRelaunch, setNeedsRelaunch] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [probe, setProbe] = useState(null)      // result of the workbook check
  const [upd, setUpd] = useState(null)          // result of the update check
  const [imported, setImported] = useState(null)
  const panel = useRef(null)
  const checkWorkbook = async () => { setProbe({ busy: true }); try { setProbe(await api.probeWorkbook()) } catch (e) { setProbe({ ok: false, message: e.message }) } }
  const checkUpdates = async () => { setUpd({ busy: true }); try { setUpd(await api.checkUpdates(true)) } catch (e) { setUpd({ reason: e.message }) } }
  const copyLink = async (t) => { try { await navigator.clipboard.writeText(t); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500) } catch { /* clipboard blocked */ } }

  useEffect(() => { setDraft(settings) }, [settings])
  useEffect(() => {
    if (!open) return
    window.bench?.info?.().then(setInfo).catch(() => {})
    window.bench?.startup?.().then(setStartup).catch(() => {})
    const onKey = e => { if (e.key === 'Escape') onClose() }
    const onClick = e => { if (panel.current && !panel.current.contains(e.target)) onClose() }
    addEventListener('keydown', onKey); setTimeout(() => addEventListener('mousedown', onClick), 0)
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onClick) }
  }, [open, onClose])

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

  return (
    <AnimatePresence>
      {open && (
        <motion.aside ref={panel} key="settings" role="dialog" aria-label="Settings"
          initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }}
          transition={{ duration: .22, ease: [0.16, 1, 0.3, 1] }}
          className="panel fixed right-4 top-[84px] z-[60] w-[min(420px,calc(100vw-2rem))] overflow-y-auto px-6 pb-6 pt-5"
          style={{ maxHeight: 'calc(100vh - 100px)', boxShadow: 'var(--shadow-panel)' }}>
          <div className="flex items-center justify-between">
            <h2 className="display text-[22px] font-semibold leading-none">Settings.</h2>
            <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><X size={14} weight="bold" /></button>
          </div>

          <Sec title="Look">
            <Chips items={[{ key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' }]} value={draft.theme} onPick={v => saveNow({ theme: v })} />
            <div>
              <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Time of day</span>
              <div className="mt-1.5"><Chips items={[{ key: null, label: 'Follow the clock' }, ...ALL_SCENES.map(s => ({ key: s.key, label: s.label }))]} value={draft.sceneOverride ?? null} onPick={v => saveNow({ sceneOverride: v })} /></div>
            </div>
            <div>
              <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Pictures. One library, or everything. Shift-click to mix. Every picture on screen follows one library at a time; right now <span style={{ color: 'var(--ink-2)' }}>{libraryLabel(libraryFor())}</span>.</span>
              <div className="mt-1.5"><Chips multi items={[{ key: 'all', label: 'Everything' }, ...COLLECTIONS]} value={collValue === 'all' ? ['all'] : collValue} onPick={pickColl} /></div>
            </div>
            <div>
              <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>New picture every</span>
              <div className="mt-1.5"><Chips items={CADENCES.map(m => ({ key: m, label: m === 60 ? 'hour' : `${m} min` }))} value={draft.pictureMinutes || 20} onPick={v => saveNow({ pictureMinutes: v })} /></div>
            </div>
          </Sec>

          <Sec title="You">
            <Field draft={draft} set={set} save={save} label="Name, as the tools spell it" k="name" placeholder="Noël Jensen" hint="Used for the greeting and to find what Issues, QMS and the BOM assign to you." />
            <Field draft={draft} set={set} save={save} label="Work email" k="email" type="email" placeholder="name@tom.fit" hint="Some tools list people by address." />
          </Sec>

          <Sec title="Hours">
            <Field draft={draft} set={set} save={save} label="Workbook in your OneDrive" k="timesheetPath" mono placeholder="Documents/TomFit_Zeiterfassung_{year}_{name}.xlsx"
              hint={<>Path from the OneDrive root, same shape as the Excel file name. <span className="tnum">{'{year}'}</span> and <span className="tnum">{'{name}'}</span> are filled in for you{clock ? <>, currently <span className="tnum">{clock.workbook}</span></> : ''}.</>} />
            <Field draft={draft} set={set} save={save} label="Or a sharing link to the workbook" k="timesheetUrl" mono placeholder="https://…sharepoint.com/:x:/…" hint="Wins over the path when set. Leave empty to use the path." />
            <div className="grid grid-cols-3 gap-2">
              <Field draft={draft} set={set} save={save} label="Lunch reminder" k="lunchAt" mono placeholder="12:00" />
              <Field draft={draft} set={set} save={save} label="Lunch ends" k="lunchEnds" mono placeholder="12:30" />
              <Field draft={draft} set={set} save={save} label="Round down, min" k="roundMinutes" type="number" mono />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
              <button onClick={checkWorkbook} disabled={probe?.busy} className="pill px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50" style={{ border: '1px solid var(--line-2)' }}>{probe?.busy ? 'Looking' : 'Check the workbook'}</button>
              <a href="#/hours" onClick={onClose} className="underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>This month's hours</a>
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
                {clock.events.length > 0 && <button onClick={() => { if (confirm("Forget today's punches here? The sheet keeps what was written.")) timeclock.reset() }} className="underline underline-offset-2">Reset today</button>}
              </p>
            )}
          </Sec>

          {info && (
            <Sec title="This machine">
              <div className="text-[13.5px]">
                <div style={{ color: 'var(--ink-3)' }}>The board lives in</div>
                <div className="tnum mt-0.5 break-all">{info.dataDir}</div>
                <div className="mt-2 flex items-center gap-4">
                  <button onClick={async () => { const r = await window.bench.chooseDataFolder(); if (r.changed) setNeedsRelaunch(true) }} className="underline underline-offset-2">Choose a shared folder</button>
                  <button onClick={() => window.bench.openDataFolder()} className="underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Open</button>
                </div>
                {needsRelaunch && <p className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>Takes effect after a restart. <button onClick={() => window.bench.relaunch()} className="underline underline-offset-2">Restart now</button></p>}
              </div>
              {startup !== null && <Toggle on={startup} onChange={async () => setStartup(await window.bench.startup(!startup))} label="Starts with Windows" />}
              <Toggle on={draft.nudges !== false} onChange={() => saveNow({ nudges: draft.nudges === false })} label="Water and coffee reminders after a task" />
              <div className="flex flex-wrap items-center gap-4 text-[13px]">
                <a href="/api/settings/export" download="bench-settings.json" className="underline underline-offset-2">Export settings</a>
                <label className="cursor-pointer underline underline-offset-2">Import settings
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
          )}

          <Sec title="Microsoft 365">
            {auth.signedIn ? (
              <>
                <div className="flex items-center justify-between text-[13.5px]">
                  <span>Connected as <span className="tnum">{auth.username}</span></span>
                  <button onClick={async () => { await api.signOut(); onRefresh() }} className="underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Disconnect</button>
                </div>
                <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Planner and the hours workbook are on.</p>
                {auth.extra?.granted ? (
                  <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Issue list and calendar are on too.</p>
                ) : (
                  <div className="row p-4 text-[13.5px]">
                    <p className="leading-relaxed">The issue-ticket list and today's meetings need a one-time approval from a tom.fit admin. Send them the link, and once they have clicked it press Grant.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button onClick={() => copyLink(auth.adminConsentUrl)} className="pill inline-flex items-center gap-1.5 px-3.5 py-2 text-[13.5px]" style={{ border: '1px solid var(--line-2)' }}>
                        {linkCopied ? <><Check size={12} weight="bold" /> Copied</> : <><Copy size={12} /> Copy the approval link</>}
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

          <Sec title="Introductions">
            <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>The short walk-throughs on the Board, Procurement, Logbook and Napkin show once. <button onClick={() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('bench.coach.')) localStorage.removeItem(k) } catch { /* ignore */ } }} className="underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Show them again</button>.</p>
          </Sec>

          <Sec title="About">
            <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{ABOUT.long}</p>
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Photographs from Pexels and Unsplash, free licences. {credits().slice(0, 12).join(', ')} and others.{info ? ` Bench. v${String(info.version).replace(/-beta\.(\d+)/, ' beta $1')}.` : ''}
            </p>
            {info?.logFile && <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Something went wrong? <button onClick={() => window.bench.openLog()} className="underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Open bench.log</button> and send it along.</p>}
            <div className="row p-4 text-[13.5px]">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={checkUpdates} disabled={upd?.busy} className="pill px-3.5 py-1.5 text-[13.5px] font-medium disabled:opacity-50" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{upd?.busy ? 'Asking GitHub' : 'Check for updates'}</button>
                <button onClick={() => api.openExternal(upd?.url || 'https://github.com/jensenoe/Bench./releases')} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Releases page <ArrowSquareOut size={11} /></button>
              </div>
              {upd && !upd.busy && (
                <p className="mt-2 leading-relaxed" style={{ color: upd.newer ? 'var(--accent)' : 'var(--ink-3)' }}>
                  {upd.newer ? <>Bench {upd.latest} is out; you have {upd.current}. <button onClick={() => api.openExternal(upd.download || upd.url)} className="underline underline-offset-2" style={{ color: 'var(--ink)' }}>Download the installer</button>.</>
                    : upd.reason === 'private' ? 'The repository is private, so GitHub will not say without a token. Paste one below, or open the releases page.'
                    : upd.reason === 'bad-token' ? 'GitHub did not accept the token.'
                    : upd.reason === 'offline' ? 'Could not reach GitHub.'
                    : upd.reason === 'no-release' ? 'No release has been published yet.'
                    : upd.reason ? `Could not check: ${upd.reason}.`
                    : `You have the latest, ${upd.current}.`}
                </p>
              )}
              <Field draft={draft} set={set} save={save} label="GitHub token for the update check" k="updateToken" type="password" mono placeholder={settings.hasUpdateToken ? 'A token is saved. Paste a new one to replace it.' : 'github_pat_… with read access to the repo'} hint="Optional. Stays in your own profile. Without it the button only opens the releases page." />
            </div>
          </Sec>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
