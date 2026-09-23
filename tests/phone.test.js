import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-phone-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
let phone, server, port
let now = Date.parse('2026-09-23T08:00:00Z')
const clock = () => now

/** Plain http, no supertest: { status, headers, json, text }. */
const request = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const data = body === null ? null : Buffer.isBuffer(body) ? body : JSON.stringify(body)
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(data && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(data ? { 'Content-Length': data.length } : {}), ...headers } }, res => {
    let text = ''
    res.setEncoding('utf8'); res.on('data', c => { text += c }); res.on('end', () => { let json = null; try { json = JSON.parse(text) } catch { /* html */ } resolve({ status: res.statusCode, headers: res.headers, json, text }) })
  })
  req.on('error', reject)
  if (data) req.write(data)
  req.end()
})

beforeAll(async () => {
  phone = await import('../server/phone.js')
  const app = phone.createApp({ pin: '2468', mainBase: 'http://127.0.0.1:1', inboxDir: path.join(dir, 'inbox'), clock })
  server = http.createServer(app)
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
afterAll(() => new Promise(r => server.close(r)))

describe('pure parts', () => {
  it('knows which punches are valid from a status', () => {
    expect(phone.validPunches('off')).toEqual(['in'])
    expect(phone.validPunches('in')).toEqual(['lunchOut', 'out'])
    expect(phone.validPunches('lunch')).toEqual(['lunchIn', 'out'])
    expect(phone.validPunches('out')).toEqual(['in'])
    expect(phone.validPunches(undefined)).toEqual(['in'])
  })
  it('takes four to eight digits as a PIN and nothing else', () => {
    expect(phone.validPin('1234')).toBe(true)
    expect(phone.validPin('12345678')).toBe(true)
    expect(phone.validPin('123')).toBe(false)
    expect(phone.validPin('123456789')).toBe(false)
    expect(phone.validPin('12a4')).toBe(false)
    expect(() => phone.createApp({ pin: '12' })).toThrow(/four to eight/)
  })
  it('locks after ten wrong tries inside a minute and forgets after five', () => {
    let t = 0
    const l = phone.limiter({ clock: () => t })
    for (let i = 0; i < 9; i++) expect(l.wrong('a')).toBe(false)
    expect(l.locked('a')).toBe(0)
    expect(l.wrong('a')).toBe(true)
    expect(l.locked('a')).toBe(phone.LOCK_MS)
    t = phone.LOCK_MS - 1; expect(l.locked('a')).toBeGreaterThan(0)
    t = phone.LOCK_MS; expect(l.locked('a')).toBe(0)
    // old tries fall out of the window
    t = 10 * 60_000
    for (let i = 0; i < 9; i++) l.wrong('b')
    t += phone.WINDOW_MS + 1
    expect(l.wrong('b')).toBe(false)
    expect(l.locked('b')).toBe(0)
    l.right('b'); expect(l.size()).toBe(1)
  })
})

describe('the PIN gate', () => {
  it('serves the PIN form without a PIN and the page with one', async () => {
    const form = await request('GET', '/')
    expect(form.status).toBe(200)
    expect(form.text).toMatch(/PIN/)
    expect(form.text).not.toMatch(/Quick add/)
    const page = await request('GET', '/', { headers: { 'bench-pin': '2468' } })
    expect(page.text).toMatch(/Quick add to Today/)
    expect(page.text).toMatch(/Take a photo/)
  })
  it('refuses the API without a PIN, takes the header, and sets a cookie on POST /pin', async () => {
    expect((await request('GET', '/api/ping')).status).toBe(401)
    expect((await request('GET', '/api/ping', { headers: { 'bench-pin': '2468' } })).json.ok).toBe(true)
    const bad = await request('POST', '/pin', { body: { pin: '0000' } })
    expect(bad.status).toBe(401)
    expect(bad.json.error).toBe('Wrong PIN.')
    const good = await request('POST', '/pin', { body: { pin: '2468' } })
    expect(good.status).toBe(200)
    const cookie = good.headers['set-cookie'][0]
    expect(cookie).toMatch(/^pin=[0-9a-f]{64}; Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict$/)
    expect(cookie).not.toContain('2468')
    const withCookie = await request('GET', '/api/ping', { headers: { cookie: cookie.split(';')[0] } })
    expect(withCookie.status).toBe(200)
    expect((await request('GET', '/api/ping', { headers: { cookie: 'pin=nonsense' } })).status).toBe(401)
  })
  it('saves a photo into the inbox folder and refuses an empty one', async () => {
    const bytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3])
    const r = await request('POST', '/photo', { headers: { 'bench-pin': '2468', 'Content-Type': 'image/jpeg' }, body: bytes })
    expect(r.status).toBe(200)
    expect(r.json.name).toMatch(/^phone-\d{8}-\d{6}\.jpg$/)
    expect(fs.readFileSync(path.join(dir, 'inbox', r.json.name))).toEqual(bytes)
    expect((await request('POST', '/photo', { headers: { 'Content-Type': 'image/jpeg' }, body: bytes })).status).toBe(401)
    const empty = await request('POST', '/photo', { headers: { 'bench-pin': '2468', 'Content-Type': 'image/jpeg' }, body: Buffer.alloc(0) })
    expect(empty.status).toBe(400)
  })
  it('answers with the main app\'s failure when Bench is not there', async () => {
    const r = await request('POST', '/api/tick', { headers: { 'bench-pin': '2468' }, body: { id: 'x' } })
    expect(r.status).toBe(500)
    expect(r.json.error).toMatch(/fetch failed|ECONNREFUSED/i)
  })
})

describe('the rate limit', () => {
  it('locks the address after ten wrong PINs, for five minutes, then lets a right one through', async () => {
    for (let i = 0; i < 9; i++) expect((await request('GET', '/api/ping', { headers: { 'bench-pin': '1111' } })).status).toBe(401)
    const tenth = await request('POST', '/pin', { body: { pin: '1111' } })
    expect(tenth.status).toBe(429)
    const rightButLocked = await request('GET', '/api/ping', { headers: { 'bench-pin': '2468' } })
    expect(rightButLocked.status).toBe(429)
    expect(rightButLocked.json.retryAfter).toBe(300)
    expect((await request('GET', '/')).status).toBe(429)
    expect((await request('POST', '/pin', { body: { pin: '2468' } })).status).toBe(429)
    now += phone.LOCK_MS - 1000
    expect((await request('GET', '/api/ping', { headers: { 'bench-pin': '2468' } })).status).toBe(429)
    now += 1000
    expect((await request('GET', '/api/ping', { headers: { 'bench-pin': '2468' } })).status).toBe(200)
  })
})

describe('info', () => {
  it('reports off until Settings turn it on', () => {
    const i = phone.info()
    expect(i).toMatchObject({ on: false, port: 5199, url: null, configured: false })
    expect(Array.isArray(i.addresses)).toBe(true)
  })
})
