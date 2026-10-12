import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-source-health-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
process.env.SYNC_INTERVAL_MINUTES = '2'
const account = { value: null }
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => account.value, isConfigured: () => true }))

let H, store, notify, bridge, settings, sources, policy
beforeAll(async () => {
  settings = await import('../server/settings.js')
  settings.update({ quietFrom: '19:00', quietTo: '07:00', quietWeekends: true, notifyModes: {} })
  H = await import('../server/source-health.js')
  store = await import('../server/store.js')
  notify = await import('../server/notify.js')
  sources = await import('../server/sources/index.js')
  policy = await import('../server/notify-policy.js')
  ;({ bridge } = await import('../server/bridge.js'))
})

// Wednesday 7 October 2026 and Monday 12 October 2026, local time
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m)
const NOW = at(12, 13, 30)
const iso = d => d.toISOString()
const site = (x = {}) => ({ label: 'Structured BOM', kind: 'site', available: true, ...x })
const graph = (x = {}) => ({ label: 'Phase Gate (Planner)', kind: 'graph', available: true, ...x })
const judge = (key, s, o = {}) => H.judge(key, s, { now: NOW, syncMinutes: 2, startedAt: iso(at(12, 7, 0)), ...o })

describe('the rules', () => {
  it('ok: read recently, with a count', () => {
    const r = judge('qms', site({ label: 'QMS', signedIn: true, lastSync: iso(at(12, 13, 28)), count: 12, total: 335, error: null }))
    expect(r).toMatchObject({ key: 'qms', state: 'ok', reason: '12 yours of 335.', action: null, since: null, lastSync: iso(at(12, 13, 28)) })
  })

  it('ok without a total says how many are yours', () => {
    expect(judge('bom', site({ signedIn: true, lastSync: iso(at(12, 13, 0)), count: 16, total: null })).reason).toBe('16 items yours.')
    expect(judge('bom', site({ signedIn: true, lastSync: iso(at(12, 13, 0)), count: 1, total: null })).reason).toBe('1 item yours.')
  })

  it('signin: needs-signin on the last read, since the last good one', () => {
    const r = judge('bom', site({ signedIn: false, error: 'needs-signin', lastSync: iso(at(7, 9, 12)), lastAttempt: iso(at(12, 13, 0)), count: 16 }))
    expect(r).toMatchObject({ state: 'signin', action: 'signin', since: iso(at(7, 9, 12)) })
    expect(r.reason).toMatch(/sign-in/)
  })

  it('signin: signedIn false alone is enough', () => {
    expect(judge('bom', site({ signedIn: false, lastSync: iso(at(12, 13, 0)) })).state).toBe('signin')
  })

  it('signin: the error alone is enough, and without a good read since is the first failed try', () => {
    const r = judge('issues', site({ label: 'Issue tickets', signedIn: true, error: 'needs-signin', lastAttempt: iso(at(12, 9, 0)) }))
    expect(r).toMatchObject({ state: 'signin', since: iso(at(12, 9, 0)) })
  })

  it('signin for Microsoft 365: no account any more, the action is connect', () => {
    const r = judge('planner', graph({ signedIn: false, lastSync: iso(at(11, 17, 0)) }))
    expect(r).toMatchObject({ state: 'signin', action: 'connect', reason: 'Microsoft 365 is not connected.' })
    expect(judge('planner', graph({ signedIn: true, error: 'needs-signin', lastSync: iso(at(12, 13, 0)) })).reason).toBe('The Microsoft 365 sign-in has expired.')
  })

  it('error: any other error, in plain words, with Sync now', () => {
    const r = judge('qms', site({ signedIn: true, error: 'timeout', lastSync: iso(at(12, 13, 0)) }))
    expect(r).toMatchObject({ state: 'error', action: 'sync', reason: 'The tool did not answer in time.', since: iso(at(12, 13, 0)) })
    expect(judge('qms', site({ signedIn: true, error: 'HTTP 502', lastSync: iso(at(12, 13, 0)) })).reason).toBe('The tool had a fault (HTTP 502).')
    expect(judge('qms', site({ signedIn: true, error: 'HTTP 404', lastSync: iso(at(12, 13, 0)) })).reason).toBe('The tool refused the read (HTTP 404).')
    expect(judge('qms', site({ signedIn: true, error: 'fetch failed', lastSync: iso(at(12, 13, 0)) })).reason).toBe('The tool could not be reached.')
    expect(judge('qms', site({ signedIn: true, error: 'Unexpected token < in JSON.', lastSync: iso(at(12, 13, 0)) })).reason).toBe('The last read failed: Unexpected token < in JSON.')
    expect(judge('planner', graph({ signedIn: true, error: 'Graph 500 boom', lastSync: iso(at(12, 13, 0)) })).state).toBe('error')
  })

  it('signin beats error beats stale', () => {
    const old = iso(at(7, 9, 0))
    expect(judge('bom', site({ signedIn: false, error: 'timeout', lastSync: old })).state).toBe('signin')
    expect(judge('bom', site({ signedIn: true, error: 'timeout', lastSync: old })).state).toBe('error')
    expect(judge('bom', site({ signedIn: true, error: null, lastSync: old })).state).toBe('stale')
  })

  it('stale: after two hours when syncs run every two minutes', () => {
    const s = (last) => judge('qms', site({ signedIn: true, lastSync: iso(last), count: 3, total: 10 }))
    expect(s(at(12, 11, 31)).state).toBe('ok')
    expect(s(at(12, 11, 29))).toMatchObject({ state: 'stale', action: 'sync', since: iso(at(12, 11, 29)), reason: 'No read since 11:29.' })
    expect(judge('qms', site({ signedIn: true, lastSync: iso(at(7, 9, 12)) }), { startedAt: null }).reason).toBe('No read since Wed 7 Oct.')
  })

  it('stale: three sync intervals when that is longer than two hours', () => {
    expect(H.staleAfterMs(2)).toBe(2 * 3600_000)
    expect(H.staleAfterMs(60)).toBe(3 * 3600_000)
    expect(H.staleAfterMs(0)).toBe(2 * 3600_000)
    const r = (last) => judge('qms', site({ signedIn: true, lastSync: iso(last) }), { syncMinutes: 60 })
    expect(r(at(12, 11, 0)).state).toBe('ok')
    expect(r(at(12, 10, 29)).state).toBe('stale')
  })

  it('stale counts from when Bench started or woke, not across a night with the laptop shut', () => {
    const last = iso(at(11, 18, 0))
    expect(judge('qms', site({ signedIn: true, lastSync: last }), { startedAt: iso(at(12, 13, 0)) }).state).toBe('ok')
    expect(judge('qms', site({ signedIn: true, lastSync: last }), { startedAt: iso(at(12, 11, 0)) }).state).toBe('stale')
  })

  it('suspect: reads hundreds of tickets and none are yours', () => {
    const r = judge('qms', site({ label: 'QMS', signedIn: true, lastSync: iso(at(12, 13, 9)), count: 0, total: 335 }))
    expect(r).toMatchObject({ state: 'suspect', reason: 'Reads 335 tickets but none are yours; the match may be wrong.', since: iso(at(12, 13, 9)) })
    expect(judge('issues', site({ signedIn: true, lastSync: iso(at(12, 13, 9)), count: 0, total: 416 })).reason).toBe('Reads 416 tickets but none are yours; the match may be wrong.')
  })

  it('not suspect at 50 or below, or with something yours', () => {
    expect(judge('qms', site({ signedIn: true, lastSync: iso(at(12, 13, 9)), count: 0, total: 50 })).state).toBe('ok')
    expect(judge('qms', site({ signedIn: true, lastSync: iso(at(12, 13, 9)), count: 1, total: 335 })).state).toBe('ok')
    expect(judge('qms', site({ signedIn: true, lastSync: iso(at(12, 13, 9)), count: 0, total: null })).state).toBe('ok')
  })

  it('suspect: the Innovation dashboard read through its page gives nothing', () => {
    const base = { label: 'Innovation dashboard', signedIn: true, lastSync: iso(at(12, 13, 9)), count: 0, total: 0 }
    expect(judge('innovation', site({ ...base, via: 'page' }))).toMatchObject({ state: 'suspect', reason: 'Reads the dashboard page but finds no items; the page may have changed.' })
    expect(judge('innovation', site({ ...base, via: 'api' })).state).toBe('ok')
    expect(judge('innovation', site({ ...base, via: 'page', count: 4, total: 4 })).state).toBe('ok')
  })

  it('a stale source is not called suspect: stale wins', () => {
    expect(judge('qms', site({ signedIn: true, lastSync: iso(at(7, 9, 0)), count: 0, total: 335 }), { startedAt: null }).state).toBe('stale')
  })

  it('off: never connected and never wanted', () => {
    expect(judge('bom', site({ signedIn: false }))).toMatchObject({ state: 'off', action: 'signin', reason: 'Not signed in.' })
    expect(judge('bom', site({ signedIn: false, error: 'needs-signin', lastAttempt: iso(at(12, 9, 0)) })).state).toBe('off')
    expect(judge('planner', graph({ signedIn: false }))).toMatchObject({ state: 'off', action: 'connect', reason: 'Not connected.' })
  })

  it('off: not available in this copy', () => {
    expect(judge('bom', site({ available: false, signedIn: false, lastSync: iso(at(7, 9, 0)), error: 'desktop-only' }))).toMatchObject({ state: 'off', action: null, reason: 'Reads only in the desktop app.' })
    expect(judge('planner', graph({ available: false })).reason).toBe('Microsoft 365 is not set up in this copy.')
  })

  it('signed in but not read yet is fine, with Sync now', () => {
    expect(judge('qms', site({ signedIn: true }))).toMatchObject({ state: 'ok', action: 'sync', reason: 'Signed in, not read yet.' })
  })
})

describe('health()', () => {
  it('lists every source in order with the worst state on top', () => {
    const h = H.health({
      planner: graph({ signedIn: true, lastSync: iso(at(12, 13, 28)), count: 4 }),
      issues: site({ label: 'Issue tickets', signedIn: false, error: 'needs-signin', lastSync: iso(at(10, 9, 0)) }),
      qms: site({ label: 'QMS', signedIn: true, lastSync: iso(at(12, 13, 9)), count: 0, total: 335 }),
      bom: site({ signedIn: false }),
      innovation: site({ label: 'Innovation dashboard', available: false })
    }, { now: NOW, syncMinutes: 2, startedAt: iso(at(12, 7, 0)) })
    expect(h.sources.map(s => [s.key, s.state])).toEqual([['planner', 'ok'], ['issues', 'signin'], ['qms', 'suspect'], ['bom', 'off'], ['innovation', 'off']])
    expect(h.state).toBe('signin')
    expect(h.staleAfterMinutes).toBe(120)
    expect(h.at).toBe(NOW.toISOString())
  })

  it('all off is off, ok and off is ok, suspect beats ok, stale beats suspect, error beats stale', () => {
    const ok = graph({ signedIn: true, lastSync: iso(at(12, 13, 28)) })
    const sus = site({ signedIn: true, lastSync: iso(at(12, 13, 28)), count: 0, total: 99 })
    const stale = site({ signedIn: true, lastSync: iso(at(7, 9, 0)) })
    const err = site({ signedIn: true, lastSync: iso(at(12, 13, 28)), error: 'timeout' })
    const off = site({ available: false })
    const o = { now: NOW, startedAt: null }
    expect(H.health({ a: off, b: off }, o).state).toBe('off')
    expect(H.health({ a: off, b: ok }, o).state).toBe('ok')
    expect(H.health({ a: ok, b: sus }, o).state).toBe('suspect')
    expect(H.health({ a: stale, b: sus }, o).state).toBe('stale')
    expect(H.health({ a: stale, b: err }, o).state).toBe('error')
    expect(H.health({}, o).state).toBe('off')
  })
})

describe('the note when a source drops', () => {
  it('reads like the BOM on 7 Oct', () => {
    const s = judge('bom', site({ signedIn: false, error: 'needs-signin', lastSync: iso(at(7, 9, 12)), cards: 16 }))
    expect(H.dropMessage(s, NOW)).toEqual({ title: 'Structured BOM needs a sign-in.', body: 'Its 16 cards stopped updating on Wed 7 Oct.', route: '#/tools', category: 'sources', key: 'bom' })
  })

  it('says the time when it stopped today, one card, no cards, and the error in plain words', () => {
    const one = judge('qms', site({ label: 'QMS', signedIn: true, error: 'timeout', lastSync: iso(at(12, 13, 9)), cards: 1 }))
    expect(H.dropMessage(one, NOW)).toMatchObject({ title: 'QMS stopped reading.', body: 'The tool did not answer in time. Its 1 card stopped updating at 13:09.' })
    const none = judge('qms', site({ label: 'QMS', signedIn: true, lastSync: iso(at(12, 9, 0)), cards: 0 }), { startedAt: null })
    expect(H.dropMessage(none, NOW)).toMatchObject({ title: 'QMS is out of date.', body: 'It stopped updating at 09:00.' })
  })

  it('has no em dashes', () => {
    const s = judge('bom', site({ signedIn: false, error: 'needs-signin', lastSync: iso(at(7, 9, 12)), cards: 16 }))
    const m = H.dropMessage(s, NOW)
    expect(`${m.title} ${m.body} ${s.reason}`).not.toMatch(/—/)
  })
})

describe('drops(): once per drop', () => {
  const row = (key, state, x = {}) => ({ key, label: key, state, since: iso(at(12, 9, 0)), lastSync: iso(at(12, 9, 0)), ...x })
  const o = { now: NOW, syncMinutes: 2, startedAt: iso(at(12, 7, 0)) }

  it('tells a source that went from reading to needs-signin, then stays quiet until it reads again', () => {
    let r = H.drops({ sources: [row('bom', 'ok')] }, {}, o)
    expect(r.tell).toEqual([]); expect(r.armed).toEqual({ bom: true })
    r = H.drops({ sources: [row('bom', 'signin')] }, r.armed, o)
    expect(r.tell.map(s => s.key)).toEqual(['bom']); expect(r.armed).toEqual({ bom: false })
    r = H.drops({ sources: [row('bom', 'signin')] }, r.armed, o)
    expect(r.tell).toEqual([])
    r = H.drops({ sources: [row('bom', 'ok')] }, r.armed, o)
    r = H.drops({ sources: [row('bom', 'stale')] }, r.armed, o)
    expect(r.tell.map(s => s.key)).toEqual(['bom'])
  })

  it('a source never seen counts as reading when it ever read: the BOM that dropped before Bench watched is told once', () => {
    expect(H.drops({ sources: [row('bom', 'signin')] }, {}, o).tell.map(s => s.key)).toEqual(['bom'])
    expect(H.drops({ sources: [row('bom', 'signin', { lastSync: null })] }, {}, o).tell).toEqual([])
  })

  it('off and suspect are not drops; suspect still arms', () => {
    let r = H.drops({ sources: [row('a', 'off'), row('b', 'suspect')] }, { a: true }, o)
    expect(r.tell).toEqual([]); expect(r.armed).toEqual({ a: true, b: true })
    r = H.drops({ sources: [row('b', 'error', { since: iso(at(12, 9, 0)) })] }, r.armed, o)
    expect(r.tell.map(s => s.key)).toEqual(['b'])
  })

  it('an error waits until it has lasted a few sync intervals', () => {
    const fresh = row('qms', 'error', { since: iso(at(12, 13, 25)) })
    let r = H.drops({ sources: [fresh] }, { qms: true }, o)
    expect(r.tell).toEqual([]); expect(r.armed.qms).toBe(true)
    r = H.drops({ sources: [fresh] }, r.armed, { ...o, now: at(12, 13, 36) })
    expect(r.tell.map(s => s.key)).toEqual(['qms'])
    // right after a start or a wake, the grace counts from then
    r = H.drops({ sources: [row('qms', 'error', { since: iso(at(11, 18, 0)) })] }, { qms: true }, { ...o, startedAt: iso(at(12, 13, 25)) })
    expect(r.tell).toEqual([])
  })
})

describe('the live picture and the tick', () => {
  const sent = []
  beforeEach(() => {
    notify._reset(); sent.length = 0
    bridge.notify = n => sent.push(n)
    settings.update({ notifyModes: {} })
    try { fs.rmSync(path.join(dir, 'source-health.json')) } catch { /* first run */ }
    const db = store.load()
    db.tasks = []; db.meta.sources = {}; db.meta.lastSyncError = null
    store.save()
    account.value = null
    bridge.desktop = true; bridge.hasSession = null
  })

  it('the sources category is a desktop one with no daily cap', () => {
    expect(policy.CATEGORIES.find(c => c.key === 'sources')).toMatchObject({ mode: 'desktop', cap: null })
    expect(policy.SNOOZABLE.has('sources')).toBe(false)
  })

  it('collect() gives Microsoft 365 its account and error, and every source its open cards', async () => {
    store.mergeSource('bom', [{ sourceId: 'p1', title: 'Frame' }, { sourceId: 'p2', title: 'Base', done: true }])
    store.setMeta({ lastSyncError: 'Graph 503' })
    account.value = { username: 'noel@tom.fit' }
    const c = await H.collect()
    expect(Object.keys(c)).toEqual(Object.keys(sources.SOURCES))
    expect(c.bom.cards).toBe(1)
    expect(c.planner).toMatchObject({ kind: 'graph', available: true, signedIn: true, error: 'Graph 503' })
  })

  it('watch() tells a drop once a day, on a working Monday at 13:30', async () => {
    store.patchSource('bom', { signedIn: false, error: 'needs-signin', lastSync: iso(at(7, 9, 12)) })
    store.mergeSource('qms', []); store.patchSource('qms', { signedIn: true })
    for (let i = 0; i < 16; i++) store.allTasks().push({ id: `b${i}`, source: 'bom', sourceId: `b${i}`, title: `Part ${i}`, done: false, lane: 'active' })
    H._setAwake(iso(at(12, 7, 0)), iso(at(12, 13, 29)))
    expect(await H.watch(NOW)).toBe(1)
    expect(sent).toEqual([{ title: 'Structured BOM needs a sign-in.', body: 'Its 16 cards stopped updating on Wed 7 Oct.', route: '#/tools' }])
    expect(await H.watch(at(12, 13, 31))).toBe(0)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'source-health.json'), 'utf8')).armed.bom).toBe(false)
  })

  it('a gap between ticks is a wake: the stale clock starts again', async () => {
    store.patchSource('qms', { signedIn: true, error: null, lastSync: iso(at(11, 18, 0)), count: 2, total: 9 })
    H._setAwake(iso(at(11, 7, 0)), iso(at(11, 18, 30)))
    expect(await H.watch(at(12, 8, 0))).toBe(0)
    expect((await H.current(at(12, 8, 1))).sources.find(s => s.key === 'qms').state).toBe('ok')
    expect((await H.current(at(12, 10, 1))).sources.find(s => s.key === 'qms').state).toBe('stale')
  })

  it('GET /api/sources/health answers the picture', async () => {
    const routes = {}
    H.registerRoutes({ get: (p, fn) => { routes[p] = fn } })
    let body = null
    await routes['/api/sources/health']({}, { json: b => { body = b }, status: () => ({ json: b => { body = b } }) })
    expect(body.sources.map(s => s.key)).toEqual(Object.keys(sources.SOURCES))
    expect(STATES_OK(body.state)).toBe(true)
  })
})

const STATES_OK = s => ['off', 'ok', 'suspect', 'stale', 'error', 'signin'].includes(s)

describe('silent renewal before needs-signin', () => {
  beforeEach(() => { bridge.desktop = false; bridge.refreshSession = null })

  it('only for a site tool that was signed in, on the desktop, at most every 30 minutes', async () => {
    const T0 = at(12, 13, 0).getTime()
    const calls = []
    expect(await sources.renewSession('bom', 0)).toBe(false)          // not the desktop
    bridge.desktop = true
    bridge.refreshSession = async (origin) => { calls.push(origin); return true }
    store.patchSource('bom', { signedIn: false })
    expect(await sources.renewSession('bom', T0)).toBe(false)  // never signed in: a person has to
    store.patchSource('bom', { signedIn: true })
    expect(await sources.renewSession('planner', T0)).toBe(false)
    expect(await sources.renewSession('bom', T0)).toBe(true)
    expect(await sources.renewSession('bom', T0 + 10 * 60_000)).toBe(false)
    expect(await sources.renewSession('bom', T0 + 31 * 60_000)).toBe(true)
    expect(calls).toEqual([sources.SOURCES.bom.origin, sources.SOURCES.bom.origin])
    bridge.refreshSession = async () => { throw new Error('gone') }
    expect(await sources.renewSession('qms', T0)).toBe(false)
  })
})
