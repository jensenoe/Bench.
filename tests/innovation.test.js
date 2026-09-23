import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-innovation-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir

// The desktop bridge, faked: runInSite answers the page script's result, fetchWithSession the endpoints.
const fake = { desktop: true, page: null, answers: {}, calls: [] }
vi.mock('../server/bridge.js', () => ({
  bridge: {
    get desktop() { return fake.desktop },
    runInSite: async (url, js) => { fake.calls.push(['run', url, js.length]); if (fake.page instanceof Error) throw fake.page; return fake.page },
    fetchWithSession: async (url) => {
      fake.calls.push(['fetch', url])
      const a = fake.answers[url]
      if (!a) return { ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => null }
      return { ok: true, status: 200, headers: { get: () => a.type || 'application/json' }, json: async () => a.body }
    },
    hasSession: async () => true, openSignIn: null, notify: null
  }
}))

let inno
const USER = { name: 'Noël Jensen', email: 'noel@tom.fit' }
beforeAll(async () => { inno = await import('../server/sources/innovation.js') })

describe('matchesUser', () => {
  it('matches the full name, the surname, the email and the local part, diacritics aside', () => {
    expect(inno.matchesUser('Noel Jensen', USER)).toBe(true)
    expect(inno.matchesUser('jensen, noël', USER)).toBe(true)
    expect(inno.matchesUser('NOEL@TOM.FIT', USER)).toBe(true)
    expect(inno.matchesUser('noel', USER)).toBe(true)
    expect(inno.matchesUser('Noël J.', USER)).toBe(true)
    expect(inno.matchesUser('Tom Meier', USER)).toBe(false)
    expect(inno.matchesUser('Jensenville', USER)).toBe(false)
    expect(inno.matchesUser('', USER)).toBe(false)
    expect(inno.matchesUser('anyone', {})).toBe(false)
  })
  it('looks inside people objects and arrays', () => {
    expect(inno.matchesUser({ id: 7, displayName: 'Noël Jensen' }, USER)).toBe(true)
    expect(inno.matchesUser([{ email: 'tom@tom.fit' }, { email: 'noel@tom.fit' }], USER)).toBe(true)
    expect(inno.matchesUser(['Tom', 'Anna'], USER)).toBe(false)
  })
})

describe('extractArray and mapApi', () => {
  it('finds the array at the top or under a container key', () => {
    expect(inno.extractArray([{ a: 1 }, 'x', null])).toEqual([{ a: 1 }])
    expect(inno.extractArray({ data: [{ a: 1 }] })).toEqual([{ a: 1 }])
    expect(inno.extractArray({ meta: {}, value: [{ a: 2 }] })).toEqual([{ a: 2 }])
    expect(inno.extractArray({ whatever: [{ a: 3 }] })).toEqual([{ a: 3 }])
    expect(inno.extractArray({ count: 3 })).toEqual([])
    expect(inno.extractArray(null)).toEqual([])
  })
  it('maps objects with a title-like and an assignee-like field that name the user', () => {
    const json = { items: [
      { id: 12, title: 'Cobot cell', status: 'In progress', assignee: 'Noël Jensen', due_date: '2026-10-15T00:00:00Z', url: '/idea/12', budget: 12000, owner_notes: 'x'.repeat(300) },
      { id: 13, title: 'Vision check', status: 'Done', assigned_to: { name: 'Noel Jensen', id: 3 } },
      { id: 14, title: 'Someone else', status: 'Open', assignee: 'Tom Meier' },
      { id: 15, name: 'No assignee at all', status: 'Open' }
    ] }
    const r = inno.mapApi(json, USER, 'https://innovation.tom.fit/api/ideas')
    expect(r.fits).toBe(true)
    expect(r.total).toBe(4)
    expect(r.keys).toEqual(['assigned_to', 'assignee', 'budget', 'due_date', 'id', 'name', 'owner_notes', 'status', 'title', 'url'])
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({ sourceId: '12', title: 'Cobot cell', status: 'In progress', done: false, dueDate: '2026-10-15', url: 'https://innovation.tom.fit/idea/12', group: 'Innovation', subgroup: 'In progress' })
    expect(r.items[0].meta).toMatchObject({ id: 12, status: 'In progress', assignee: 'Noël Jensen', budget: 12000, endpoint: 'https://innovation.tom.fit/api/ideas' })
    expect(r.items[0].meta.owner_notes).toBeUndefined()   // too long for meta
    expect(r.items[1]).toMatchObject({ sourceId: '13', title: 'Vision check', done: true, url: 'https://innovation.tom.fit/dashboard.html' })
  })
  it('reports fits: false when the fields are not there, so the DOM fallback runs', () => {
    expect(inno.mapApi({ data: [{ id: 1, count: 2 }] }, USER)).toMatchObject({ fits: false, items: [], total: 1, keys: ['count', 'id'] })
    expect(inno.mapApi({ ok: true }, USER)).toMatchObject({ fits: false, total: 0 })
    expect(inno.mapApi([{ title: 'Has title, no assignee' }], USER).fits).toBe(false)
  })
  it('handles German field names and a status that means done', () => {
    const r = inno.mapApi([{ nr: 'I-7', bezeichnung: 'Greifer', zustand: 'erledigt', verantwortlich: 'Jensen', termin: '2026-11-01' }], USER, 'https://innovation.tom.fit/api/x')
    expect(r.items[0]).toMatchObject({ sourceId: 'I-7', title: 'Greifer', status: 'erledigt', done: true, dueDate: '2026-11-01' })
  })
})

describe('mapDom', () => {
  it('turns the page rows into items with the page as fallback link', () => {
    const items = inno.mapDom({ rows: [
      { text: 'Cobot cell Noël Jensen In progress', href: 'https://innovation.tom.fit/idea/12', id: 'row-12', title: 'Cobot cell' },
      { text: 'Loose mention of noel', href: null, id: null, title: '' },
      null
    ] })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ sourceId: 'row-12', title: 'Cobot cell', url: 'https://innovation.tom.fit/idea/12', group: 'Innovation', meta: { text: 'Cobot cell Noël Jensen In progress', from: 'page' } })
    expect(items[1]).toMatchObject({ sourceId: 'dom#1:Loose mention of noel', title: 'Loose mention of noel', url: 'https://innovation.tom.fit/dashboard.html' })
    expect(inno.mapDom(null)).toEqual([])
  })
})

describe('fetchInnovation', () => {
  it('is desktop-only', async () => {
    fake.desktop = false
    expect(await inno.fetchInnovation({ user: USER })).toEqual({ ok: false, reason: 'desktop-only' })
    fake.desktop = true
  })
  it('asks for a sign-in when the page is the login form', async () => {
    fake.page = { url: 'https://login.microsoftonline.com/x', title: 'Sign in', endpoints: [], rows: [], loginForm: true }
    expect((await inno.fetchInnovation({ user: USER })).reason).toBe('needs-signin')
    fake.page = new Error('runInSite timeout after 20s')
    expect((await inno.fetchInnovation({ user: USER })).reason).toBe('timeout')
  })
  it('takes the API when an endpoint fits and reports keys and endpoints', async () => {
    fake.calls = []
    fake.page = { url: 'https://innovation.tom.fit/dashboard.html', title: 'Innovation', loginForm: false,
      endpoints: ['https://innovation.tom.fit/api/me', 'https://innovation.tom.fit/api/ideas'],
      rows: [{ text: 'Cobot cell Noël Jensen', href: null, id: 'r1', title: 'Cobot cell' }] }
    fake.answers = {
      'https://innovation.tom.fit/api/me': { body: { id: 3, name: 'Noël Jensen' } },
      'https://innovation.tom.fit/api/ideas': { body: [{ id: 12, title: 'Cobot cell', status: 'In progress', assignee: 'Noël Jensen' }, { id: 14, title: 'Other', status: 'Open', assignee: 'Tom' }] }
    }
    const r = await inno.fetchInnovation({ user: USER })
    expect(r.ok).toBe(true)
    expect(r.via).toBe('api')
    expect(r.items.map(x => x.sourceId)).toEqual(['12'])
    expect(r.total).toBe(1)
    expect(r.endpoints).toEqual(['https://innovation.tom.fit/api/me', 'https://innovation.tom.fit/api/ideas'])
    expect(r.keys).toEqual(['assignee', 'id', 'status', 'title'])
    expect(r.tried[1]).toMatchObject({ ok: true, fits: true, rows: 2 })
    expect(r.domRows).toBe(1)
    expect(fake.calls[0][0]).toBe('run')
    expect(fake.calls[0][1]).toBe('https://innovation.tom.fit/dashboard.html')
    expect(fake.calls.filter(c => c[0] === 'fetch')).toHaveLength(2)
  })
  it('falls back to the page rows when no endpoint fits', async () => {
    fake.page = { url: 'https://innovation.tom.fit/dashboard.html', title: 'Innovation', loginForm: false,
      endpoints: ['https://innovation.tom.fit/api/stats', 'https://innovation.tom.fit/api/broken'],
      rows: [{ text: 'Cobot cell Noël Jensen', href: 'https://innovation.tom.fit/idea/12', id: null, title: 'Cobot cell' }] }
    fake.answers = { 'https://innovation.tom.fit/api/stats': { body: { open: 4, closed: 2 } } }
    const r = await inno.fetchInnovation({ user: USER })
    expect(r.ok).toBe(true)
    expect(r.via).toBe('page')
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ sourceId: 'https://innovation.tom.fit/idea/12', title: 'Cobot cell' })
    expect(r.tried).toEqual([{ url: 'https://innovation.tom.fit/api/stats', ok: true, fits: false, rows: 0 }, { url: 'https://innovation.tom.fit/api/broken', ok: false, status: 404 }])
  })
  it('is registered as a site source next to the others', async () => {
    const { SOURCES } = await import('../server/sources/index.js')
    expect(SOURCES.innovation).toMatchObject({ label: 'Innovation dashboard', origin: 'https://innovation.tom.fit', kind: 'site' })
    expect(typeof SOURCES.innovation.probe).toBe('string')
    expect(SOURCES.planner.origin).toBe('https://innovation.tom.fit')   // Phase Gate stays
  })
})

describe('pageScript', () => {
  it('carries the user in and is one self-invoking expression', () => {
    const js = inno.pageScript(USER)
    expect(js.startsWith('(() => {')).toBe(true)
    expect(js.trim().endsWith('})()')).toBe(true)
    expect(js).toContain('"name":"Noël Jensen"')
    expect(js).toContain("performance.getEntriesByType('resource')")
    expect(js).toContain('tr, li, article, [role=row], .card')
    // it must at least parse
    expect(() => new Function(js)).not.toThrow()
  })
})
