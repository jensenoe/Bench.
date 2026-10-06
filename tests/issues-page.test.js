import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-issues-page-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const { mapPageTickets, pageScript, PROBE } = await import('../server/sources/issues.js')
const me = s => /no[eë]l jensen/i.test(s)

const tickets = [
  { id: 'a1', number: '480', title: 'Unwucht Aussendurchmesser', status: 'New', priority: 'low', issueType: 'Hardware', machine: '000 030', location: 'Oetwil (CH)', reporter: 'Robert Kocher', assignedTo: 'Burak Türkeş' },
  { id: 'a2', number: '309', title: 'Soundbar with  niose', status: 'Resolved', priority: 'normal', location: 'Oetwil (CH)', reporter: 'Robert Kocher', assignedTo: 'Noël Jensen' },
  { id: 'a3', number: '500', title: 'Seat motor', status: 'In Progress', priority: 'high', machine: '000 041', location: 'Tiefenbrunnen (CH)', reporter: 'Jacob Anz', assignedTo: 'Burak Türkeş, Noël Jensen' },
  { id: '', title: 'broken row' }
]

describe('issue tickets from the tool\'s own page (roadmap 167)', () => {
  const r = mapPageTickets(tickets, me)
  it('counts every ticket and returns the ones in your charge, shared ones included', () => {
    expect(r.total).toBe(3)
    expect(r.items.map(i => i.sourceId)).toEqual(['309', '500'])
  })
  it('maps number, status, done, link and the people', () => {
    const [done, open] = r.items
    expect(done.title).toBe('#309  Soundbar with niose')
    expect(done.done).toBe(true)
    expect(open.done).toBe(false)
    expect(open.url).toBe('https://issues.tom.fit/#ticket/500')
    expect(open.meta).toMatchObject({ machine: '000 041', priority: 'high', from: 'Jacob Anz', with: ['Burak Türkeş'] })
    expect(open.subgroup).toBe('Tiefenbrunnen (CH)')
  })
  it('the page script and the sign-in probe only read', () => {
    for (const js of [pageScript, PROBE]) expect(js).not.toMatch(/localStorage\.setItem|\.save\(|fetch\(|innerHTML\s*=/)
    expect(pageScript).toContain('allTickets')
  })
})
