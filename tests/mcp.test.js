import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The MCP server talks to Bench over HTTP only, so a fake fetch stands in for the whole app.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-mcp-'))
process.env.BENCH_USER_DIR = dir
let mcp

beforeAll(async () => { mcp = await import('../server/mcp.js') })

const TASKS = [
  { id: 'a', title: 'Replace belt', lane: 'today', done: false, project: 'Machine 14', notes: '', tags: [], checklist: [{ text: 'order', done: true }, { text: 'fit', done: false }] },
  { id: 'b', title: 'Order bearing', lane: 'active', done: false, project: 'Machine 14', supplier: 'SKF', poNumber: '4711' },
  { id: 'c', title: 'Old job', lane: 'active', done: true, project: 'Machine 7' }
]
const ENTRIES = [{ id: 'e1', title: 'Weekly', date: '2026-09-22', project: 'Machine 14', decisions: ['Buy the belt'], actions: [] }]

/** A fake Bench: records what was asked and answers the way the routes do. */
function fakeBench() {
  const calls = []
  const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })
  const fetch = async (url, init = {}) => {
    const u = new URL(url), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null
    calls.push({ method, path: u.pathname + u.search, body })
    if (u.pathname === '/api/state') return reply(200, { tasks: TASKS })
    if (u.pathname === '/api/logbook' && method === 'GET') return reply(200, ENTRIES)
    if (u.pathname === '/api/logbook' && method === 'POST') return reply(200, { id: 'e2', ...body, date: body.date || '2026-09-23' })
    if (u.pathname === '/api/napkin') return reply(200, [{ id: 'n1', title: 'Belt ideas', nodes: { r: { text: 'belt tensioner' } } }])
    if (u.pathname === '/api/tasks' && method === 'POST') {
      if (body.lane === 'today' && body.title === 'Sixth') return reply(409, { error: 'Today is full. Five is the rule; move something out before this comes in.' })
      return reply(200, { id: 'new', lane: 'active', ...body })
    }
    if (u.pathname.startsWith('/api/tasks/') && method === 'PATCH') {
      const id = u.pathname.split('/').pop()
      const t = TASKS.find(x => x.id === id)
      return t ? reply(200, { task: { ...t, ...body }, writeBack: null }) : reply(404, { error: 'not found' })
    }
    if (u.pathname === '/api/machines') return reply(200, [{ key: 'machine 14', name: 'Machine 14', open: 2, tasks: ['a', 'b'] }])
    if (u.pathname === '/api/machines/machine%2014') return reply(200, { machine: { key: 'machine 14', name: 'Machine 14' }, tasks: { today: [TASKS[0]], active: [TASKS[1]] }, procurement: [], bySource: {}, entries: [], maps: [], mentions: [] })
    if (u.pathname === '/api/review') return reply(200, { week: 39, text: 'Week 39.' })
    return reply(404, { error: `no route ${u.pathname}` })
  }
  return { fetch, calls }
}

const req = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })
const parse = (res) => JSON.parse(res.result.content[0].text)

describe('initialize and the method table', () => {
  it('answers initialize with the protocol version, tools capability and server info', async () => {
    const { handle } = mcp.createHandler({ fetch: fakeBench().fetch, base: 'http://127.0.0.1:1' })
    const res = await handle(req(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } }))
    expect(res.jsonrpc).toBe('2.0')
    expect(res.id).toBe(1)
    expect(res.result.protocolVersion).toBe('2025-03-26')
    expect(res.result.capabilities.tools).toBeDefined()
    expect(res.result.serverInfo.name).toBe('bench')
  })
  it('swallows notifications, answers ping, and says -32601 for anything else', async () => {
    const { handle, isInitialized } = mcp.createHandler({ fetch: fakeBench().fetch, base: 'http://127.0.0.1:1' })
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect(isInitialized()).toBe(true)
    expect((await handle(req(2, 'ping'))).result).toEqual({})
    const nope = await handle(req(3, 'resources/list'))
    expect(nope.error.code).toBe(-32601)
    const bad = await handle({ foo: 1 })
    expect(bad.error.code).toBe(-32600)
  })
})

describe('tools/list', () => {
  it('lists the twelve tools with a schema and a one-sentence description each', async () => {
    const { handle } = mcp.createHandler({ fetch: fakeBench().fetch, base: 'http://127.0.0.1:1' })
    const res = await handle(req(4, 'tools/list'))
    const names = res.result.tools.map(t => t.name)
    expect(names).toEqual(['list_tasks', 'create_task', 'update_task', 'complete_task', 'list_logbook', 'create_logbook_entry', 'list_machines', 'machine_detail', 'week_review', 'hours_month', 'day_brief', 'search'])
    for (const t of res.result.tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(t.description.endsWith('.')).toBe(true)
      expect(t.description.split('. ').length).toBeLessThanOrEqual(2)
    }
    expect(names.some(n => /delete|remove/.test(n))).toBe(false)
  })
})

describe('tools/call', () => {
  it('list_tasks reads /api/state and filters open tasks by project', async () => {
    const bench = fakeBench()
    const { handle } = mcp.createHandler({ fetch: bench.fetch, base: 'http://127.0.0.1:1' })
    const res = await handle(req(5, 'tools/call', { name: 'list_tasks', arguments: { project: 'machine 14' } }))
    expect(res.result.content[0].type).toBe('text')
    const out = parse(res)
    expect(out.count).toBe(2)
    expect(out.tasks.map(t => t.id)).toEqual(['a', 'b'])
    expect(out.tasks[0].checklist).toEqual(['[x] order', '[ ] fit'])
    expect(bench.calls).toEqual([{ method: 'GET', path: '/api/state', body: null }])
    const done = parse(await handle(req(6, 'tools/call', { name: 'list_tasks', arguments: { open: false } })))
    expect(done.tasks.map(t => t.id)).toEqual(['c'])
  })
  it('create_task posts the whitelisted fields and falls back to Active when Today is full', async () => {
    const bench = fakeBench()
    const { handle } = mcp.createHandler({ fetch: bench.fetch, base: 'http://127.0.0.1:1' })
    const res = parse(await handle(req(7, 'tools/call', { name: 'create_task', arguments: { title: 'New part', lane: 'active', project: 'Machine 14', orderBy: '2026-10-01', bogus: 'x' } })))
    expect(res.id).toBe('new')
    expect(bench.calls[0]).toEqual({ method: 'POST', path: '/api/tasks', body: { title: 'New part', lane: 'active', project: 'Machine 14', orderBy: '2026-10-01' } })
    const full = parse(await handle(req(8, 'tools/call', { name: 'create_task', arguments: { title: 'Sixth', lane: 'today' } })))
    expect(full.lane).toBe('active')
    expect(full.note).toMatch(/Today is full/)
  })
  it('complete_task patches done and a bad id is an isError result, not a JSON-RPC error', async () => {
    const bench = fakeBench()
    const { handle } = mcp.createHandler({ fetch: bench.fetch, base: 'http://127.0.0.1:1' })
    const ok = await handle(req(9, 'tools/call', { name: 'complete_task', arguments: { id: 'a' } }))
    expect(parse(ok).done).toBe(true)
    expect(bench.calls[0]).toEqual({ method: 'PATCH', path: '/api/tasks/a', body: { done: true } })
    const gone = await handle(req(10, 'tools/call', { name: 'complete_task', arguments: { id: 'zzz' } }))
    expect(gone.result.isError).toBe(true)
    expect(gone.result.content[0].text).toBe('not found')
    const unknown = await handle(req(11, 'tools/call', { name: 'delete_everything', arguments: {} }))
    expect(unknown.error.code).toBe(-32602)
  })
  it('search looks through tasks, entries and maps; machine_detail accepts the display name', async () => {
    const bench = fakeBench()
    const { handle } = mcp.createHandler({ fetch: bench.fetch, base: 'http://127.0.0.1:1' })
    const hits = parse(await handle(req(12, 'tools/call', { name: 'search', arguments: { q: 'belt' } })))
    expect(hits.tasks.map(t => t.id)).toEqual(['a'])
    expect(hits.entries.map(e => e.id)).toEqual(['e1'])
    expect(hits.maps[0].nodes).toEqual(['belt tensioner'])
    const d = parse(await handle(req(13, 'tools/call', { name: 'machine_detail', arguments: { key: 'Machine 14' } })))
    expect(d.machine.key).toBe('machine 14')
    expect(d.tasks.today[0].id).toBe('a')
  })
  it('says Bench is not running when the socket refuses', async () => {
    const { handle } = mcp.createHandler({ fetch: async () => { throw new Error('ECONNREFUSED') }, base: 'http://127.0.0.1:1' })
    const res = await handle(req(14, 'tools/call', { name: 'day_brief', arguments: {} }))
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).toMatch(/not running/)
  })
})

describe('the port file', () => {
  it('writes and reads the port; BENCH_PORT wins', () => {
    const file = mcp.writePort(51234)
    expect(fs.readFileSync(file, 'utf8')).toBe('51234')
    expect(mcp.readPort()).toBe(51234)
    process.env.BENCH_PORT = '6000'
    expect(mcp.readPort()).toBe(6000)
    delete process.env.BENCH_PORT
  })
})
