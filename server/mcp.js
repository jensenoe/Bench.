/**
 * Bench speaks MCP (roadmap 111). A Model Context Protocol server over stdio, JSON-RPC 2.0, written by
 * hand: newline-delimited JSON on stdin and stdout, no SDK. It never opens the data files itself; every
 * tool is an HTTP call to the running Bench on 127.0.0.1, so the board stays the one writer and the
 * Today cap, the history feed and the shared-folder discipline all apply to what Claude does too.
 *
 * Discovery: the desktop picks a free port at start, so the server writes it to BENCH_USER_DIR/port
 * (`writePort`, called from index.js's listen callback). The MCP process reads BENCH_PORT first, then
 * that file, then the installed default folder, then ./data for a dev checkout.
 *
 * Tools read and create; there is no delete. `scripts/mcp.mjs` is the executable Claude Code and Claude
 * Desktop point at; `createHandler` is what the tests drive in-process with a fake fetch.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const PROTOCOL_VERSION = '2025-03-26'
export const SERVER_INFO = { name: 'bench', version: readVersion() }
function readVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version } catch { return '0.0.0' }
}

// ── the port file ─────────────────────────────────────────────────────
const userDir = () => process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
/** Where the running server writes its port. The installed app keeps it under %APPDATA%/bench/user. */
export const portFile = (dir = userDir()) => path.join(dir, 'port')
export function writePort(port, dir = userDir()) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(portFile(dir), String(port), 'utf8')
    return portFile(dir)
  } catch (err) { console.warn('[mcp] could not write the port file:', err.message); return null }
}
/** The port to talk to: BENCH_PORT, else the first port file that exists, else the dev default 5178. */
export function readPort() {
  if (process.env.BENCH_PORT && Number(process.env.BENCH_PORT)) return Number(process.env.BENCH_PORT)
  const candidates = [userDir()]
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'bench', 'user'))
  candidates.push(path.join(__dirname, '..', 'data'))
  for (const dir of candidates) {
    try { const n = Number(fs.readFileSync(portFile(dir), 'utf8').trim()); if (n > 0) return n } catch { /* next */ }
  }
  return Number(process.env.PORT) || 5178
}

// ── the tools ─────────────────────────────────────────────────────────
const S = {
  str: (description) => ({ type: 'string', description }),
  num: (description) => ({ type: 'number', description }),
  bool: (description) => ({ type: 'boolean', description }),
  date: (description) => ({ type: 'string', description: `${description} (YYYY-MM-DD)` }),
  lane: { type: 'string', enum: ['today', 'active', 'waiting', 'innovation', 'parked'], description: 'Lane on the board' },
  strs: (description) => ({ type: 'array', items: { type: 'string' }, description })
}
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const TASK_FIELDS = {
  title: S.str('The task, one line'), lane: S.lane, project: S.str('Machine or programme it belongs to'),
  dueDate: S.date('When it must be done'), orderBy: S.date('Last day to place the order'), supplier: S.str('Supplier of the part'),
  poNumber: S.str('Purchase order number'), orderedOn: S.date('Day the order went out'), deliveredOn: S.date('Day the part arrived'),
  effortHours: S.num('Rough size in hours'), notes: S.str('Free text under the title'), checklist: S.strs('Steps inside the task'),
  tags: S.strs('Free labels'), priority: { type: 'integer', minimum: 1, maximum: 3, description: '1 now, 2 this week, 3 when there is room' },
  waitingOn: S.str('Who holds it while it sits in Waiting on'), lead: S.str('Who carries it when that is not you'), assignedBy: S.str('Who handed it over')
}
const { title: _t, ...UPDATE_FIELDS } = TASK_FIELDS

export const TOOLS = [
  { name: 'list_tasks', description: 'Lists tasks on the board, open ones by default, filtered by lane or project.',
    inputSchema: obj({ lane: S.lane, project: S.str('Project or machine name, matched case-insensitively'), open: S.bool('true for open tasks only (default), false for done ones') }) },
  { name: 'create_task', description: 'Creates one task on the board; Today is capped at five, so a sixth lands in Active.',
    inputSchema: obj(TASK_FIELDS, ['title']) },
  { name: 'update_task', description: 'Changes fields on an existing task; the id and at least one field are needed.',
    inputSchema: obj({ id: S.str('Task id'), title: TASK_FIELDS.title, ...UPDATE_FIELDS }, ['id']) },
  { name: 'complete_task', description: 'Ticks a task as done.', inputSchema: obj({ id: S.str('Task id') }, ['id']) },
  { name: 'list_logbook', description: 'Lists Logbook entries, newest first, optionally for one project or since a date.',
    inputSchema: obj({ project: S.str('Project or machine name'), since: S.date('Only entries on or after this day') }) },
  { name: 'create_logbook_entry', description: 'Writes a Logbook entry: a meeting or a decision with attendees, decisions and actions.',
    inputSchema: obj({ title: S.str('Title of the entry'), date: S.date('Day of the meeting, today when left out'), attendees: S.strs('People present'),
      project: S.str('Project or machine'), notes: S.str('The notes'), decisions: S.strs('Decisions taken, one per line'),
      actions: { type: 'array', description: 'Action items', items: obj({ text: S.str('What'), owner: S.str('Who'), due: S.date('By when') }, ['text']) } }, ['title']) },
  { name: 'list_machines', description: 'Lists the machines with their open, late, order and entry counts.', inputSchema: obj({}) },
  { name: 'machine_detail', description: 'One machine in full: open tasks by lane, orders, Logbook entries, maps and mentions.',
    inputSchema: obj({ key: S.str('Machine key or name, as list_machines shows it') }, ['key']) },
  { name: 'week_review', description: 'The weekly review as figures and short sentences for the week that holds the date.',
    inputSchema: obj({ start: S.date('Any day of the week; this week when left out') }) },
  { name: 'hours_month', description: 'The time clock for one month: days with in, out, break and worked time.',
    inputSchema: obj({ ym: S.str('Month as YYYY-MM; the current month when left out') }) },
  { name: 'day_brief', description: 'The morning brief: leftovers, arrivals from the tools, due today, order dates and meetings.', inputSchema: obj({}) },
  { name: 'search', description: 'Searches tasks, Logbook entries and napkin maps by text.', inputSchema: obj({ q: S.str('Words to look for') }, ['q']) }
]

// ── HTTP to the running Bench ─────────────────────────────────────────
class ToolError extends Error {}
const compactTask = t => ({
  id: t.id, title: t.title, lane: t.lane, done: !!t.done, project: t.project || null, source: t.source || 'local',
  dueDate: t.dueDate || null, orderBy: t.orderBy || null, supplier: t.supplier || null, poNumber: t.poNumber || null,
  orderedOn: t.orderedOn || null, deliveredOn: t.deliveredOn || null, effortHours: t.effortHours ?? null,
  priority: t.priority ?? null, tags: t.tags || [], waitingOn: t.waitingOn || null,
  checklist: (t.checklist || []).map(c => `${c.done ? '[x]' : '[ ]'} ${c.text}`), notes: t.notes || '', updatedAt: t.updatedAt || null
})
const compactEntry = e => ({ id: e.id, title: e.title, date: e.date, project: e.project || null, attendees: e.attendees || [], decisions: e.decisions || [],
  actions: (e.actions || []).map(a => ({ text: a.text, owner: a.owner || null, due: a.due || null, done: !!a.done })), notes: e.notes || '' })
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
const has = (hay, needle) => String(hay || '').toLowerCase().includes(needle)
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function makeApi(fetchImpl, base) {
  const call = async (method, url, body) => {
    let res
    try { res = await fetchImpl(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }) }
    catch (err) { throw new ToolError(`Bench is not running at ${base} (${err.message}). Start Bench first.`) }
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    if (!res.ok) throw new ToolError(json?.error || `Bench answered ${res.status}.`)
    return json
  }
  return { get: url => call('GET', url), post: (url, body) => call('POST', url, body), patch: (url, body) => call('PATCH', url, body) }
}

/** The tool implementations: args in, a plain value out. Anything thrown becomes an isError result. */
function implementations(api) {
  const pickTaskFields = (args, fields) => Object.fromEntries(Object.entries(args).filter(([k]) => k in fields))
  return {
    async list_tasks({ lane, project, open = true } = {}) {
      const { tasks } = await api.get('/api/state')
      const q = project ? String(project).trim().toLowerCase() : null
      const out = tasks.filter(t => !!t.done === !open && (!lane || t.lane === lane) && (!q || has(t.project, q))).map(compactTask)
      return { count: out.length, tasks: out.slice(0, 200) }
    },
    async create_task(args = {}) {
      if (!args.title?.trim()) throw new ToolError('A title is needed.')
      const body = pickTaskFields(args, TASK_FIELDS)
      for (const k of ['dueDate', 'orderBy', 'orderedOn', 'deliveredOn']) if (body[k] !== undefined && !isDate(body[k])) throw new ToolError(`${k} must be YYYY-MM-DD.`)
      try { return compactTask(await api.post('/api/tasks', body)) }
      catch (err) {
        // Today is full: the task still lands, in Active, and the answer says so.
        if (body.lane === 'today' && /Today is full/i.test(err.message)) { const t = await api.post('/api/tasks', { ...body, lane: 'active' }); return { ...compactTask(t), note: 'Today is full, so it landed in Active.' } }
        throw err
      }
    },
    async update_task({ id, ...rest } = {}) {
      if (!id) throw new ToolError('A task id is needed.')
      const patch = pickTaskFields(rest, { ...UPDATE_FIELDS, title: true })
      if (!Object.keys(patch).length) throw new ToolError('Nothing to change: give at least one field.')
      for (const k of ['dueDate', 'orderBy', 'orderedOn', 'deliveredOn']) if (patch[k] !== undefined && patch[k] !== null && !isDate(patch[k])) throw new ToolError(`${k} must be YYYY-MM-DD.`)
      const r = await api.patch(`/api/tasks/${encodeURIComponent(id)}`, patch)
      return compactTask(r.task || r)
    },
    async complete_task({ id } = {}) {
      if (!id) throw new ToolError('A task id is needed.')
      const r = await api.patch(`/api/tasks/${encodeURIComponent(id)}`, { done: true })
      return compactTask(r.task || r)
    },
    async list_logbook({ project, since } = {}) {
      const entries = await api.get('/api/logbook')
      const q = project ? String(project).trim().toLowerCase() : null
      const out = entries.filter(e => (!q || has(e.project, q) || has(e.title, q)) && (!since || (e.date || '') >= since)).map(compactEntry)
      return { count: out.length, entries: out.slice(0, 100) }
    },
    async create_logbook_entry(args = {}) {
      if (!args.title?.trim()) throw new ToolError('A title is needed.')
      const body = { title: args.title, date: args.date, attendees: args.attendees, project: args.project, notes: args.notes, decisions: args.decisions, actions: args.actions }
      if (body.date !== undefined && !isDate(body.date)) throw new ToolError('date must be YYYY-MM-DD.')
      return compactEntry(await api.post('/api/logbook', body))
    },
    async list_machines() {
      const list = await api.get('/api/machines')
      return list.map(({ tasks: _ids, ...m }) => m)
    },
    async machine_detail({ key } = {}) {
      if (!key) throw new ToolError('A machine key is needed.')
      let d
      try { d = await api.get(`/api/machines/${encodeURIComponent(key)}`) }
      catch (err) {
        // A display name instead of a key: look it up.
        const list = await api.get('/api/machines')
        const m = list.find(x => same(x.name, key) || same(x.key, key))
        if (!m) throw err
        d = await api.get(`/api/machines/${encodeURIComponent(m.key)}`)
      }
      const lanes = Object.fromEntries(Object.entries(d.tasks || {}).map(([lane, list]) => [lane, list.map(compactTask)]))
      return { machine: d.machine, tasks: lanes, orders: d.procurement, bySource: d.bySource, entries: d.entries, maps: d.maps, mentions: d.mentions }
    },
    async week_review({ start } = {}) {
      if (start !== undefined && !isDate(start)) throw new ToolError('start must be YYYY-MM-DD.')
      return api.get(`/api/review${start ? `?start=${encodeURIComponent(start)}` : ''}`)
    },
    async hours_month({ ym } = {}) {
      if (ym !== undefined && !/^\d{4}-\d{2}$/.test(ym)) throw new ToolError('ym must be YYYY-MM.')
      return api.get(`/api/timeclock/month?ym=${encodeURIComponent(ym || '')}`)
    },
    async day_brief() { return api.get('/api/day/brief') },
    async search({ q } = {}) {
      const s = String(q || '').trim().toLowerCase()
      if (!s) throw new ToolError('Give a word to look for.')
      const [{ tasks }, entries, maps] = await Promise.all([api.get('/api/state'), api.get('/api/logbook'), api.get('/api/napkin')])
      const taskHits = tasks.filter(t => has(t.title, s) || has(t.notes, s) || has(t.project, s) || has(t.supplier, s) || has(t.poNumber, s) || (t.tags || []).some(x => has(x, s)))
      const entryHits = entries.filter(e => has(e.title, s) || has(e.notes, s) || has(e.project, s) || (e.decisions || []).some(x => has(x, s)) || (e.actions || []).some(a => has(a.text, s)))
      const mapHits = maps.filter(m => has(m.title, s) || Object.values(m.nodes || {}).some(n => has(n.text, s)))
      return {
        tasks: taskHits.slice(0, 50).map(compactTask),
        entries: entryHits.slice(0, 30).map(compactEntry),
        maps: mapHits.slice(0, 20).map(m => ({ id: m.id, title: m.title, nodes: Object.values(m.nodes || {}).filter(n => has(n.text, s)).map(n => n.text).slice(0, 10) }))
      }
    }
  }
}

// ── JSON-RPC ──────────────────────────────────────────────────────────
const CODES = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 }
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } })
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] })

/**
 * One handler per connection. `handle(message)` takes a parsed request and resolves to the response, or to
 * null for a notification. `fetch` and `base` are injectable so the tests need no network and no Bench.
 */
export function createHandler({ fetch: fetchImpl = globalThis.fetch, base = `http://127.0.0.1:${readPort()}` } = {}) {
  const impl = implementations(makeApi(fetchImpl, base))
  let initialized = false
  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, CODES.invalidRequest, 'Invalid request.')
    const { id, method, params = {} } = msg
    const isNotification = id === undefined
    if (method === 'initialize') return rpcResult(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: 'Bench is a personal project board. Tools read and create; nothing is deleted. Dates are YYYY-MM-DD.' })
    if (method === 'notifications/initialized') { initialized = true; return null }
    if (method.startsWith('notifications/')) return null
    if (method === 'ping') return rpcResult(id, {})
    if (method === 'tools/list') return rpcResult(id, { tools: TOOLS })
    if (method === 'tools/call') {
      const name = params?.name, args = params?.arguments ?? {}
      if (!name || !impl[name]) return rpcError(id, CODES.invalidParams, `Unknown tool: ${name}`)
      if (args && typeof args !== 'object') return rpcError(id, CODES.invalidParams, 'arguments must be an object.')
      try { return rpcResult(id, text(await impl[name](args))) }
      catch (err) { return rpcResult(id, { ...text(err.message), isError: true }) }
    }
    if (isNotification) return null
    return rpcError(id, CODES.methodNotFound, `Method not found: ${method}`)
  }
  return { handle, tools: TOOLS, isInitialized: () => initialized, base }
}

/** stdio transport: one JSON message per line in, one per line out. Anything unparseable gets -32700. */
export function serve({ input = process.stdin, output = process.stdout, ...opts } = {}) {
  const { handle } = createHandler(opts)
  let buffer = ''
  let chain = Promise.resolve()
  const send = (obj) => { if (obj) output.write(JSON.stringify(obj) + '\n') }
  input.setEncoding('utf8')
  input.on('data', chunk => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { send(rpcError(null, CODES.parse, 'Parse error.')); continue }
      // Requests are answered in order, so a client that pipelines gets its answers back the way it asked.
      chain = chain.then(() => handle(msg)).then(send).catch(err => send(rpcError(msg?.id, CODES.internal, err.message)))
    }
  })
  input.on('end', () => chain.then(() => process.exit(0)))
}
