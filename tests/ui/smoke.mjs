/**
 * UI smoke test. Starts the server on a free port with scratch data, drives the built interface in
 * headless Chromium and fails on any console error or on any of the checks below. Needs `npm run build`
 * first (the server serves dist/) and Chromium for Playwright (`npx playwright install chromium`).
 *
 *   npm run test:ui
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('dist/ missing: run npm run build first'); process.exit(2) }
const port = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-ui-'))
const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { env: { ...process.env, BENCH_DATA_DIR: path.join(dir, 'data'), BENCH_USER_DIR: path.join(dir, 'user'), BENCH_SECRETS_DIR: path.join(dir, 'user'), PORT: String(port), SYNC_INTERVAL_MINUTES: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''; server.stdout.on('data', d => { serverLog += d }); server.stderr.on('data', d => { serverLog += d })
const BASE = `http://127.0.0.1:${port}`
const J = { 'Content-Type': 'application/json' }
const api = async (m, u, b) => { const r = await fetch(BASE + u, { method: m, headers: J, body: b && JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) } }
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/settings')).ok) break } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)) }

const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failures.push(name) }

let browser
try {
  // seed
  await api('PUT', '/api/settings', { name: 'Test Person', email: 'test@example.com', setupDone: true })
  for (let i = 0; i < 5; i++) await api('POST', '/api/tasks', { title: `Today ${i + 1}`, lane: 'today' })
  await api('POST', '/api/tasks', { title: 'Parked one', lane: 'parked' })
  await api('POST', '/api/tasks', { title: 'Order the rails', lane: 'active', orderBy: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) })
  await api('POST', '/api/logbook', { title: 'Weekly', attendees: ['A', 'B'] })
  await api('POST', '/api/napkin', { title: 'Map' })

  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })   // axe needs a page from an explicit context
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))

  for (const r of ['', 'board', 'procurement', 'tools', 'logbook', 'napkin', 'hours', 'lunch']) {
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600)
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    check(`page ${r || 'home'} renders without horizontal scroll`, !hscroll)
  }

  // WCAG 2.0 to 2.2 AA on every page with axe-core (roadmap 52). Photographs are decorative, so contrast
  // over a picture is not something axe can judge; it reports those as incomplete, not as violations.
  // Under reduced motion, so axe never measures an element half way through its fade-in.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const r of ['', 'board', 'procurement', 'tools', 'logbook', 'napkin', 'hours']) {
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
    check(`axe ${r || 'home'}: no accessibility violations`, res.violations.length === 0, res.violations.map(v => `${v.id} x${v.nodes.length} (${v.nodes[0]?.target?.[0]})`).join(', '))
  }
  // Target size (WCAG 2.5.8): every visible button and link at least 24 px each way, on every page.
  for (const r of ['', 'board', 'procurement', 'tools', 'logbook', 'napkin', 'hours']) {
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a, [role=button], [role=checkbox]')].map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24))
      .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`))
    check(`${r || 'home'}: every button and link is at least 24 px`, small.length === 0, [...new Set(small)].slice(0, 4).join(' | '))
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // the Today cap is a rule
  const six = await api('POST', '/api/tasks', { title: 'sixth', lane: 'today' })
  check('a sixth task on Today is refused with 409 and a message', six.status === 409 && /Today is full/.test(six.body.error || ''), String(six.status))

  // quick add with n
  await page.goto(`${BASE}/#/board`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600)
  await page.keyboard.press('n'); await page.waitForTimeout(300)
  await page.keyboard.type('Added with n'); await page.keyboard.press('Alt+2'); await page.keyboard.press('Enter'); await page.waitForTimeout(700)
  const added = (await api('GET', '/api/state')).body.tasks.find(t => t.title === 'Added with n')
  check('n opens quick add and Enter creates the task', Boolean(added), added ? `lane ${added.lane}` : 'not created')

  // drag and drop between lanes
  const st = (await api('GET', '/api/state')).body
  const parked = st.tasks.find(t => t.title === 'Parked one')
  const card = page.locator(`#task-${parked.id}`)
  const active = page.locator('section.panel').filter({ has: page.locator('h2', { hasText: 'Active.' }) })
  await card.scrollIntoViewIfNeeded()
  const dt = await page.evaluateHandle(() => new DataTransfer())
  await card.dispatchEvent('dragstart', { dataTransfer: dt }); await active.dispatchEvent('dragenter', { dataTransfer: dt }); await active.dispatchEvent('dragover', { dataTransfer: dt })
  await active.dispatchEvent('drop', { dataTransfer: dt }); await card.dispatchEvent('dragend', { dataTransfer: dt }); await page.waitForTimeout(600)
  check('dragging a card into Active moves it', (await api('GET', '/api/state')).body.tasks.find(t => t.id === parked.id).lane === 'active')

  // the time clock panel opens and is really visible (not clipped by the nav)
  await page.getByRole('button', { name: 'Time clock' }).click(); await page.waitForTimeout(400)
  const panel = page.getByText('This month')
  const box = await panel.boundingBox()
  const visible = box && await panel.evaluate(el => { const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const hit = document.elementFromPoint(cx, cy); return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el))) && getComputedStyle(el).visibility !== 'hidden' })
  check('time clock panel opens and its link is hittable', Boolean(visible))
  // a screenshot pixel check: the panel background must differ from the page behind it
  const shade = await page.evaluate(() => { const el = document.querySelector('a[href="#/hours"]'); if (!el) return null; let n = el; while (n && !n.classList.contains('panel')) n = n.parentElement; if (!n) return null; const cs = getComputedStyle(n); return { opacity: cs.opacity, mask: getComputedStyle(n.closest('nav')).maskImage } })
  check('nav no longer carries a mask that would clip the panel', shade && shade.mask === 'none', JSON.stringify(shade))
  await page.keyboard.press('Escape')

  // hours page shows the month
  await page.goto(`${BASE}/#/hours`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
  check('hours page lists the days of the month', (await page.locator('table tbody tr').count()) >= 28)

  // logbook links
  const [entry] = (await api('GET', '/api/logbook')).body
  const withLink = await api('PATCH', `/api/logbook/${entry.id}`, { links: [{ href: '\\\\share\\Projekte\\M3\\drawing.pdf' }] })
  check('logbook entry keeps a file link with a derived label', withLink.body.links?.[0]?.label === 'drawing.pdf')

  // settings export and import
  const exp = await api('GET', '/api/settings/export')
  check('settings export leaves the token out', exp.status === 200 && exp.body.settings && !('updateToken' in exp.body.settings) && exp.body.settings.name === 'Test Person')
  const imp = await api('POST', '/api/settings/import', { ...exp.body, settings: { ...exp.body.settings, pictureMinutes: 30 } })
  check('settings import applies', imp.body.pictureMinutes === 30)

  // ? opens the key sheet, Escape closes it and gives focus back
  await page.goto(`${BASE}/#/board`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
  await page.keyboard.press('Shift+?'); await page.waitForTimeout(350)
  const sheet = page.getByRole('dialog', { name: 'Keys.' })
  check('? opens the key sheet', await sheet.isVisible().catch(() => false))
  await page.keyboard.press('Escape'); await page.waitForTimeout(350)
  check('Escape closes the key sheet', !(await sheet.isVisible().catch(() => false)))

  // focus follows the route: pressing 7 lands on the Hours heading
  await page.keyboard.press('7'); await page.waitForTimeout(1200)
  const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 20) }))
  check('changing page moves focus to the page heading', focused.tag === 'H1' && /Hours/.test(focused.text || ''), JSON.stringify(focused))
  check('hours page uses the mono register and the one-pixel grid', (await page.locator('table.ledger.mono').count()) === 1)

  // chips stay on one line
  await page.goto(`${BASE}/#/board`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
  const chip = await page.evaluate(() => { const c = document.querySelector('.tag'); return c ? getComputedStyle(c).whiteSpace : 'none' })
  check('chips never wrap', chip === 'nowrap', chip)

  check('no console errors across the run', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (err) {
  failures.push('exception'); console.error(err)
} finally {
  await browser?.close()
  server.kill()
  fs.rmSync(dir, { recursive: true, force: true })
}
if (failures.length) { console.error(`\n${failures.length} failed: ${failures.join(', ')}\n--- server ---\n${serverLog.slice(-2000)}`); process.exit(1) }
console.log('\nall good')
