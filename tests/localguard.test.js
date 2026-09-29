import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import { refusal, hostnameOf, localGuard } from '../server/localguard.js'

describe('refusal', () => {
  it('lets Bench. itself through', () => {
    expect(refusal({ method: 'GET', path: '/api/state', host: '127.0.0.1:51234' })).toBeNull()
    expect(refusal({ method: 'POST', path: '/api/tasks', host: '127.0.0.1:51234', origin: 'http://127.0.0.1:51234', secFetchSite: 'same-origin' })).toBeNull()
    expect(refusal({ method: 'POST', path: '/api/tasks', host: 'localhost:5178', origin: 'http://localhost:5177', secFetchSite: 'same-site' })).toBeNull()   // Vite dev
    expect(refusal({ method: 'PUT', path: '/api/settings', host: '[::1]:5178' })).toBeNull()   // MCP script, phone proxy, curl
  })
  it('refuses a foreign Host (DNS rebinding)', () => {
    expect(refusal({ method: 'GET', path: '/api/state', host: 'attacker.example:51234' })).toBe('host')
    expect(refusal({ method: 'GET', path: '/', host: '192.168.1.20:5178' })).toBe('host')
    expect(refusal({ method: 'GET', path: '/api/state', host: undefined })).toBe('host')
    expect(refusal({ method: 'GET', path: '/api/state', host: '127.0.0.1.attacker.example' })).toBe('host')
  })
  it('refuses writes from a foreign origin', () => {
    expect(refusal({ method: 'POST', path: '/api/timeclock/reset', host: '127.0.0.1:5178', origin: 'https://evil.example' })).toBe('origin')
    expect(refusal({ method: 'POST', path: '/api/auth/signout', host: '127.0.0.1:5178', origin: 'null' })).toBe('origin')
    expect(refusal({ method: 'DELETE', path: '/api/tasks/1', host: '127.0.0.1:5178', origin: 'http://127.0.0.1.evil.example' })).toBe('origin')
  })
  it('refuses anything the browser labels cross-site on /api, even a GET', () => {
    expect(refusal({ method: 'GET', path: '/api/settings', host: '127.0.0.1:5178', secFetchSite: 'cross-site' })).toBe('cross-site')
    expect(refusal({ method: 'POST', path: '/api/sync', host: '127.0.0.1:5178', secFetchSite: 'cross-site' })).toBe('cross-site')
    expect(refusal({ method: 'GET', path: '/terrain/day.jpg', host: '127.0.0.1:5178', secFetchSite: 'cross-site' })).toBeNull()
  })
  it('reads hostnames the way the browser does', () => {
    expect(hostnameOf('LOCALHOST:5178')).toBe('localhost')
    expect(hostnameOf('http://127.0.0.1:5177', { origin: true })).toBe('127.0.0.1')
    expect(hostnameOf('')).toBeNull()
  })
})

describe('localGuard on a live server', () => {
  let server, port
  beforeAll(async () => {
    const app = express()
    app.use(localGuard({ log: () => {} }))
    app.post('/api/timeclock/reset', (_req, res) => res.json({ reset: true }))
    app.get('/api/state', (_req, res) => res.json({ ok: true }))
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r) })
    port = server.address().port
  })
  afterAll(() => new Promise(r => server.close(r)))
  const send = (method, path, headers) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', reject); req.end()
  })
  it('answers Bench. and refuses the two attacks', async () => {
    expect(await send('GET', '/api/state', { Host: `127.0.0.1:${port}` })).toBe(200)
    expect(await send('POST', '/api/timeclock/reset', { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}` })).toBe(200)
    expect(await send('GET', '/api/state', { Host: `attacker.example:${port}` })).toBe(403)
    expect(await send('POST', '/api/timeclock/reset', { Host: `127.0.0.1:${port}`, Origin: 'https://evil.example', 'Content-Type': 'text/plain' })).toBe(403)
  })
})
