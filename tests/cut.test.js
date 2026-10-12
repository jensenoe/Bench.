import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// settings.js keeps its file in BENCH_USER_DIR; point it at scratch before the import.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-cut-'))
process.env.BENCH_USER_DIR = dir
process.env.BENCH_DATA_DIR = dir

const settings = await import('../server/settings.js')
const pages = await import('../src/pages.js')

describe('the page cut (roadmap 173)', () => {
  it('lists no cut page, and the keys run 1 to 9 without a gap', () => {
    const ids = pages.PAGES.map(p => p.id)
    for (const gone of ['procurement', 'napkin', 'wall', 'lunch', 'cockpit']) expect(ids).not.toContain(gone)
    expect(Object.keys(pages.PAGE_KEYS).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(pages.PAGE_KEYS).toMatchObject({ 1: '', 2: 'board', 3: 'logbook', 4: 'projects' })
  })
  it('keeps no More group with a single entry (the TomFit tools group adds the tools themselves)', () => {
    for (const g of pages.GROUPS) expect(g.pages.length + (g.title === 'TomFit tools' ? pages.TOMFIT.length : 0), g.title).toBeGreaterThan(1)
  })
  it('sends every old link to a page that exists', () => {
    for (const [from, g] of Object.entries(pages.GONE)) {
      expect(pages.ROUTES.has(from), from).toBe(false)
      expect(pages.ROUTES.has(g.to), `${from} -> ${g.to}`).toBe(true)
    }
  })
})

describe('coachDone', () => {
  it('defaults to none and keeps the read introductions across a restart of the settings cache', () => {
    expect(settings.get().coachDone).toEqual([])
    settings.update({ coachDone: ['board', 'board', 'logbook'] })
    expect(settings.get().coachDone).toEqual(['board', 'logbook'])
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'))
    expect(onDisk.coachDone).toEqual(['board', 'logbook'])
  })
  it('refuses junk and keeps what it had', () => {
    settings.update({ coachDone: 'board' })
    expect(settings.get().coachDone).toEqual(['board', 'logbook'])
    settings.update({ coachDone: ['Board!', 42, 'projects'] })
    expect(settings.get().coachDone).toEqual(['projects'])
    settings.update({ coachDone: [] })
    expect(settings.get().coachDone).toEqual([])
  })
})
