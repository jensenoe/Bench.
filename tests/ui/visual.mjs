/**
 * Visual regression (roadmap 93). Like the smoke test: the server on a free port with scratch data,
 * the same seed, headless Chromium. Every page at 1440x900 and 2560x1440 in dark and light (28 shots,
 * viewport only) is compared pixel by pixel with tests/ui/baseline/<name>.png. A pixel counts as
 * changed when any channel moves more than 24; a shot fails when more than 0.6 percent of its pixels
 * changed. The photographs are hidden before each shot (they change with the slot), the browser clock
 * is fixed and Math.random is seeded, so only the interface is compared.
 *
 *   npm run test:visual                        compare
 *   UPDATE_BASELINE=1 node tests/ui/visual.mjs rewrite the baselines
 *
 * On failure the current shot and a diff (changed pixels in red) land in tests/ui/visual-out/, which
 * is not committed. Needs `npm run build` first and Chromium for Playwright.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASELINE = path.join(root, 'tests', 'ui', 'baseline')
const OUT = path.join(root, 'tests', 'ui', 'visual-out')
const UPDATE = process.env.UPDATE_BASELINE === '1'
const PAGES = [['home', ''], ['board', 'board'], ['procurement', 'procurement'], ['tools', 'tools'], ['logbook', 'logbook'], ['napkin', 'napkin'], ['hours', 'hours']]
const VIEWPORTS = [[1440, 900], [2560, 1440]]
const THEMES = ['dark', 'light']
const CHANNEL = 24          // a channel has to move more than this for the pixel to count
const MAX_RATIO = 0.006     // 0.6 percent of the pixels may differ
const FROZEN = new Date(2026, 8, 23, 10, 30, 0)   // a Wednesday in September, mid-morning, so the greeting and the scene hold still
const MASK = '.photo, .grade, .grain { visibility: hidden !important; }'

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('dist/ missing: run npm run build first'); process.exit(2) }
const port = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-visual-'))
const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { env: { ...process.env, BENCH_DATA_DIR: path.join(dir, 'data'), BENCH_USER_DIR: path.join(dir, 'user'), BENCH_SECRETS_DIR: path.join(dir, 'user'), PORT: String(port), SYNC_INTERVAL_MINUTES: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''; server.stdout.on('data', d => { serverLog += d }); server.stderr.on('data', d => { serverLog += d })
const BASE = `http://127.0.0.1:${port}`
const J = { 'Content-Type': 'application/json' }
const api = async (m, u, b) => { const r = await fetch(BASE + u, { method: m, headers: J, body: b && JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) } }
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/settings')).ok) break } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)) }

const failures = []
const say = (ok, name, detail = '') => console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`)

/**
 * Runs in the browser: both PNGs into canvases, count the pixels whose channels differ by more than
 * `channel`, and paint a diff (changed pixels in red over a faded copy of the baseline).
 */
const compareInPage = async ({ a, b, channel }) => {
  const load = src => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('bad png')); img.src = src })
  const [ia, ib] = await Promise.all([load(a), load(b)])
  if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` }
  const w = ia.width, h = ia.height
  const canvas = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const ca = canvas(), cb = canvas(), cd = canvas()
  const ga = ca.getContext('2d', { willReadFrequently: true }), gb = cb.getContext('2d', { willReadFrequently: true }), gd = cd.getContext('2d')
  ga.drawImage(ia, 0, 0); gb.drawImage(ib, 0, 0)
  const A = ga.getImageData(0, 0, w, h).data, B = gb.getImageData(0, 0, w, h).data
  const D = gd.createImageData(w, h), O = D.data
  let count = 0
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]))
    if (d > channel) { count++; O[i] = 255; O[i + 1] = 40; O[i + 2] = 40; O[i + 3] = 255 }
    else { const l = Math.round((A[i] * .3 + A[i + 1] * .59 + A[i + 2] * .11) * .35 + 40); O[i] = l; O[i + 1] = l; O[i + 2] = l; O[i + 3] = 255 }
  }
  gd.putImageData(D, 0, 0)
  return { count, total: w * h, diff: cd.toDataURL('image/png') }
}
const toDataUrl = (buf) => `data:image/png;base64,${buf.toString('base64')}`
const fromDataUrl = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')

let browser
try {
  // the same seed as the smoke test, plus a pinned scene so the picture set (masked anyway) never moves
  // the morning brief and the evening close are dialogs over the page; the pages themselves are what is compared
  await api('PUT', '/api/settings', { name: 'Test Person', email: 'test@example.com', setupDone: true, sceneOverride: 'day', pictureMinutes: 20, morningBrief: false, eveningClose: false })
  for (let i = 0; i < 5; i++) await api('POST', '/api/tasks', { title: `Today ${i + 1}`, lane: 'today' })
  await api('POST', '/api/tasks', { title: 'Parked one', lane: 'parked' })
  await api('POST', '/api/tasks', { title: 'Order the rails', lane: 'active', orderBy: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) })
  await api('POST', '/api/logbook', { title: 'Weekly', attendees: ['A', 'B'] })
  await api('POST', '/api/napkin', { title: 'Map' })

  browser = await chromium.launch()
  const judge = await (await browser.newContext()).newPage()   // where the comparison runs
  await judge.goto('about:blank')

  if (UPDATE) fs.rmSync(BASELINE, { recursive: true, force: true })
  fs.mkdirSync(BASELINE, { recursive: true })
  let written = 0, outWritten = false
  const writeOut = (name, buf) => { if (!outWritten) { fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); outWritten = true } fs.writeFileSync(path.join(OUT, name), buf) }

  for (const [w, h] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: 1 })
    // Deterministic randomness: the greeting picks a line at random, so give it the same dice every run.
    await context.addInitScript(() => { let s = 20260923; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 } })
    const page = await context.newPage()
    page.on('pageerror', e => console.log(`     page error: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') console.log(`     console: ${m.text().slice(0, 160)}`) })
    await page.clock.setFixedTime(FROZEN)
    for (const theme of THEMES) {
      await api('PUT', '/api/settings', { theme })
      await page.goto('about:blank')   // a hash change is a same-document navigation; the theme needs a fresh load
      for (const [name, r] of PAGES) {
        const shot = `${name}-${w}x${h}-${theme}`
        // a fresh load for every shot: a hash change would be a same-document navigation, with the previous page's
        // exit in the way and the theme read only once. Then wait for the page's heading and the skeleton to go.
        await page.goto('about:blank')
        await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('main h1, header h1, h1', { timeout: 15000 }).catch(() => {})
        await page.waitForFunction(() => !document.querySelector('.skel'), null, { timeout: 15000 }).catch(() => {})
        await page.addStyleTag({ content: MASK })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(900)
        await page.evaluate(() => window.scrollTo(0, 0))
        const png = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' })
        const file = path.join(BASELINE, `${shot}.png`)
        if (UPDATE) { fs.writeFileSync(file, png); written++; say(true, shot, `${(png.length / 1024).toFixed(0)} KB written`); continue }
        if (!fs.existsSync(file)) { failures.push(shot); say(false, shot, 'no baseline; run UPDATE_BASELINE=1 node tests/ui/visual.mjs'); writeOut(`${shot}.png`, png); continue }
        const res = await judge.evaluate(compareInPage, { a: toDataUrl(fs.readFileSync(file)), b: toDataUrl(png), channel: CHANNEL })
        if (res.size) { failures.push(shot); say(false, shot, `size differs: ${res.size}`); writeOut(`${shot}.png`, png); continue }
        const ratio = res.count / res.total
        const ok = ratio <= MAX_RATIO
        say(ok, shot, `${(ratio * 100).toFixed(2)} percent of pixels changed`)
        if (!ok) { failures.push(shot); writeOut(`${shot}.png`, png); writeOut(`${shot}.diff.png`, fromDataUrl(res.diff)) }
      }
    }
    await context.close()
  }
  if (UPDATE) {
    const total = fs.readdirSync(BASELINE).reduce((s, f) => s + fs.statSync(path.join(BASELINE, f)).size, 0)
    console.log(`\n${written} baselines written, ${(total / 1048576).toFixed(1)} MB in ${path.relative(root, BASELINE)}`)
  }
} catch (err) {
  failures.push('exception'); console.error(err)
} finally {
  await browser?.close()
  server.kill()
  fs.rmSync(dir, { recursive: true, force: true })
}
if (failures.length) { console.error(`\n${failures.length} failed: ${failures.join(', ')}\ncurrent shots and diffs: ${path.relative(root, OUT)}\n--- server ---\n${serverLog.slice(-1500)}`); process.exit(1) }
console.log(UPDATE ? '\nbaselines updated' : '\nall shots match')
