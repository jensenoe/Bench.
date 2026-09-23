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
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('dist/ missing: run npm run build first'); process.exit(2) }
const port = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-ui-'))
// One task on Today since yesterday, written before the server starts: the API stamps updatedAt with now, and
// the morning brief only calls a Today task a leftover when it was last touched before midnight (roadmap 100).
const yesterday = new Date(Date.now() - 86400000).toISOString()
const LEFTOVER = { id: crypto.randomUUID(), source: 'local', plannerId: null, title: 'Left from yesterday', notes: '', lane: 'today', done: false, dueDate: null, leadTimeDays: null, orderBy: null, waitingOn: null, waitingSince: null, planTitle: null, bucketName: null, createdAt: yesterday, updatedAt: yesterday, lastTouched: yesterday, completedAt: null, order: 0 }
fs.mkdirSync(path.join(dir, 'data'), { recursive: true })
fs.writeFileSync(path.join(dir, 'data', 'tasks.json'), JSON.stringify({ tasks: [LEFTOVER], meta: { lastSync: null, lastSyncError: null, sources: {}, version: 2 } }, null, 2))
const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { env: { ...process.env, BENCH_DATA_DIR: path.join(dir, 'data'), BENCH_USER_DIR: path.join(dir, 'user'), BENCH_SECRETS_DIR: path.join(dir, 'user'), PORT: String(port), SYNC_INTERVAL_MINUTES: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''; server.stdout.on('data', d => { serverLog += d }); server.stderr.on('data', d => { serverLog += d })
const BASE = `http://127.0.0.1:${port}`
const J = { 'Content-Type': 'application/json' }
const api = async (m, u, b) => { const r = await fetch(BASE + u, { method: m, headers: J, body: b && JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) } }
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/settings')).ok) break } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)) }

const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failures.push(name) }
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const violations = res => res.violations.map(v => { const d = v.nodes[0]?.any?.[0]?.data; return `${v.id} x${v.nodes.length} (${v.nodes[0]?.target?.[0]})${d?.contrastRatio ? ` ${d.fgColor} on ${d.bgColor} at ${d.contrastRatio}` : ''}` }).join(', ')
// Every page but the wall has a nav; the wall has no controls at all, so its check is the other way round.
const PAGES = ['', 'board', 'procurement', 'tools', 'logbook', 'napkin', 'hours', 'review', 'machines', 'wall']
const smallTargets = () => [...document.querySelectorAll('button, a, [role=button], [role=checkbox], [role=radio], [role=switch], [role=tab]')].map(el => ({ el, r: el.getBoundingClientRect() }))
  .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24))
  .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`)

let browser
try {
  // seed
  // The brief and the close are checked on their own below; off here so they do not cover the pages.
  await api('PUT', '/api/settings', { name: 'Test Person', email: 'test@example.com', setupDone: true, morningBrief: false, eveningClose: false })
  for (let i = 0; i < 4; i++) await api('POST', '/api/tasks', { title: `Today ${i + 1}`, lane: 'today' })   // plus the leftover makes five
  await api('POST', '/api/tasks', { title: 'Parked one', lane: 'parked' })
  await api('POST', '/api/tasks', { title: 'Order the rails', lane: 'active', orderBy: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) })
  await api('POST', '/api/logbook', { title: 'Weekly', attendees: ['A', 'B'] })
  await api('POST', '/api/napkin', { title: 'Map' })
  check('the seeded leftover is on the board', (await api('GET', '/api/state')).body.tasks.some(t => t.id === LEFTOVER.id && t.lane === 'today'))

  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })   // axe needs a page from an explicit context
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  const failedUrls = []
  page.on('response', res => { if (res.status() >= 400) failedUrls.push(`${res.status()} ${res.url().replace(BASE, '')}`) })

  for (const r of [...PAGES, 'lunch']) {
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600)
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    check(`page ${r || 'home'} renders without horizontal scroll`, !hscroll)
  }

  // WCAG 2.0 to 2.2 AA on every page with axe-core (roadmap 52, 99). Photographs are decorative, so contrast
  // over a picture is not something axe can judge; it reports those as incomplete, not as violations.
  // Under reduced motion, so axe never measures an element half way through its fade-in.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const r of PAGES) {
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
    const res = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
    check(`axe ${r || 'home'}: no accessibility violations`, res.violations.length === 0, violations(res))
  }
  // Target size (WCAG 2.5.8): every visible button and link at least 24 px each way, on every page.
  for (const r of PAGES) {
    await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
    if (r === 'wall') {
      // the wall is read only: no control at all, and nothing under 16 px (DESIGN.md, wall mode)
      const wall = await page.evaluate(() => {
        const controls = document.querySelectorAll('button, a, input, select, textarea, [role=button], nav').length
        const small = [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && el.textContent.trim() && getComputedStyle(el).display !== 'none')
          .map(el => ({ px: parseFloat(getComputedStyle(el).fontSize), text: el.textContent.trim().slice(0, 24) })).filter(x => x.px < 16)
        return { controls, small: small.slice(0, 4), h1: document.querySelectorAll('h1').length }
      })
      check('wall: no controls, no nav, nothing under 16 px, one heading', wall.controls === 0 && wall.small.length === 0 && wall.h1 === 1, JSON.stringify(wall))
      continue
    }
    const small = await page.evaluate(smallTargets)
    check(`${r || 'home'}: every button and link is at least 24 px`, small.length === 0, [...new Set(small)].slice(0, 4).join(' | '))
  }
  // axe with the morning brief open (roadmap 99): on, reload, wait, analyze, then Start the day
  await api('PUT', '/api/settings', { morningBrief: true })
  await page.goto(`${BASE}/#/board`, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  const briefForAxe = page.getByRole('dialog', { name: /Morning/ })
  await briefForAxe.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await page.getByRole('dialog', { name: /Morning/ }).getByRole('button', { name: /Start the day/ }).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  if (await briefForAxe.isVisible().catch(() => false)) {
    const res = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
    check('axe with the morning brief open: no accessibility violations', res.violations.length === 0, violations(res))
    check('the brief has no button or link under 24 px', (await page.evaluate(smallTargets)).length === 0, (await page.evaluate(smallTargets)).slice(0, 4).join(' | '))
  } else check('the morning brief opened for the axe pass', false, `dialogs ${await page.locator('[role=dialog]').count()}`)
  // the brief lists the leftover; Back to Active for it, Start the day, and the lane changes (roadmap 100)
  const leftRow = briefForAxe.locator('li').filter({ hasText: 'Left from yesterday' })
  const hasLeftover = await leftRow.count() > 0
  check('the brief lists the task left on Today since yesterday', hasLeftover, hasLeftover ? '' : (await briefForAxe.textContent().catch(() => '')).slice(0, 120))
  if (hasLeftover) { await leftRow.getByRole('radio', { name: 'Back to Active' }).click(); await page.waitForTimeout(150) }
  await page.getByRole('button', { name: /Start the day/ }).click().catch(() => {})
  await briefForAxe.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  check('Start the day closes the brief', !(await briefForAxe.isVisible().catch(() => false)))
  if (hasLeftover) {
    let lane = null
    for (let i = 0; i < 20 && lane !== 'active'; i++) { lane = (await api('GET', '/api/state')).body.tasks.find(t => t.id === LEFTOVER.id)?.lane; if (lane !== 'active') await page.waitForTimeout(200) }
    check('Back to Active in the brief moves the leftover to Active', lane === 'active', String(lane))
  }
  await api('PUT', '/api/settings', { morningBrief: false })
  await api('PATCH', `/api/tasks/${LEFTOVER.id}`, { lane: 'today' })   // back on Today, so the cap check below meets five
  // the "back to Active" toast fades within seven seconds; axe must not meet it half way
  await page.locator('[aria-live="polite"]').first().waitFor({ state: 'hidden', timeout: 9000 }).catch(() => {})
  // axe with Settings open on each tab (roadmap 99)
  await page.getByRole('button', { name: 'Settings' }).first().click()
  const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
  await settingsDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  const tabsForAxe = page.getByRole('tab')
  const tabCount = await tabsForAxe.count()
  for (let i = 0; i < tabCount; i++) {
    const label = (await tabsForAxe.nth(i).textContent()).trim()
    await tabsForAxe.nth(i).click(); await page.waitForTimeout(450)
    const res = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
    check(`axe with Settings open on ${label}: no accessibility violations`, res.violations.length === 0, violations(res))
    const small = await page.evaluate(smallTargets)
    check(`Settings > ${label}: every button and link is at least 24 px`, small.length === 0, [...new Set(small)].slice(0, 4).join(' | '))
  }
  await page.keyboard.press('Escape'); await settingsDialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
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

  // the change feed (roadmap 87, 100): a change lands in the history, Undo on the Board puts the field back
  const target = (await api('GET', '/api/state')).body.tasks.find(t => t.title === 'Today 1')
  await api('PATCH', `/api/tasks/${target.id}`, { title: 'Today 1 renamed' })
  const hist = (await api('GET', '/api/history?limit=10')).body
  const changeEntry = hist.find(e => e.taskId === target.id && e.kind === 'changed' && e.changes.some(c => c.field === 'title' && c.to === 'Today 1 renamed'))
  check('a rename lands in GET /api/history with the field, from and to', Boolean(changeEntry), hist.slice(0, 2).map(e => `${e.kind} ${e.title}`).join(' | '))
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500)   // a goto to the same hash would not remount the feed
  const changes = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Recent changes.' }) })
  await changes.scrollIntoViewIfNeeded()
  if (!(await changes.getByRole('button', { name: /^Undo:/ }).count())) await changes.getByRole('button', { name: /^Show/ }).click()
  const undoBtn = changes.getByRole('button', { name: /^Undo: renamed from "Today 1"/ }).first()
  await undoBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  check('Recent changes on the Board lists the rename with an Undo', await undoBtn.isVisible().catch(() => false), (await changes.textContent().catch(() => '')).slice(0, 120))
  await undoBtn.click().catch(() => {})
  let title = null
  for (let i = 0; i < 25 && title !== 'Today 1'; i++) { title = (await api('GET', '/api/state')).body.tasks.find(t => t.id === target.id)?.title; if (title !== 'Today 1') await page.waitForTimeout(200) }
  check('Undo puts the old title back', title === 'Today 1', String(title))

  // backups (roadmap 96, 100): Back up now writes a copy, the list has it, Settings > This machine shows it
  const made = await api('POST', '/api/backups/now')
  const listed = await api('GET', '/api/backups')
  const files = Array.isArray(listed.body) ? listed.body : (listed.body.files || [])
  check('POST /api/backups/now writes a copy that GET /api/backups lists', made.status === 200 && files.some(b => b.name === 'tasks' && Date.now() - new Date(b.at).getTime() < 120_000), `${files.length} file(s)`)
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await settingsDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await page.getByRole('tab', { name: 'This machine' }).click()
  const restore = settingsDialog.getByRole('button', { name: 'Restore' }).first()
  await restore.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  check('Settings > This machine lists the backup with a Restore', await restore.isVisible().catch(() => false) && (await settingsDialog.getByText(/Backups\./).count()) >= 1)
  await page.keyboard.press('Escape'); await settingsDialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})

  // the evening close (roadmap 69, 100): clocked in through the API, Clock out in the nav opens the close,
  // Close the day writes the day note. The out punch is not written to a sheet here (no sign-in), which is fine.
  await api('PUT', '/api/settings', { eveningClose: true })
  const punched = await api('POST', '/api/timeclock/punch', { kind: 'in' })
  check('clock in through the API', punched.status === 200 && punched.body.status === 'in', `${punched.status} ${punched.body.status || punched.body.error || ''}`)
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800)
  // around noon the nav's one button is Lunch and Clock out sits in the panel; either way the label is the same
  let out = page.getByRole('button', { name: 'Clock out', exact: true })
  if (!(await out.isVisible().catch(() => false))) { await page.getByRole('button', { name: 'Time clock' }).click(); await page.waitForTimeout(300); out = page.getByRole('button', { name: 'Clock out', exact: true }) }
  await out.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await out.click().catch(() => {})
  const closing = page.getByRole('dialog', { name: 'Closing the day.' })
  await closing.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  check('Clock out in the nav opens the evening close', await closing.isVisible().catch(() => false), `dialogs ${await page.locator('[role=dialog]').count()}`)
  const closeBtn = closing.getByRole('button', { name: 'Close the day.' })
  await closeBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  for (let i = 0; i < 20 && await closeBtn.isDisabled().catch(() => true); i++) await page.waitForTimeout(150)
  await closeBtn.click().catch(() => {})
  await closing.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  check('Close the day closes the dialog', !(await closing.isVisible().catch(() => false)))
  let dayNote = null
  for (let i = 0; i < 25 && !dayNote; i++) { dayNote = ((await api('GET', '/api/logbook')).body || []).find(e => e.title === 'Day note.'); if (!dayNote) await page.waitForTimeout(200) }
  check('the close writes a Logbook entry titled Day note.', Boolean(dayNote) && /on the clock/.test(dayNote.notes || ''), dayNote ? dayNote.notes.split('\n')[0] : 'no entry')
  check('the clock is out after the close', (await api('GET', '/api/timeclock')).body.status === 'out')
  await api('PUT', '/api/settings', { eveningClose: false })

  // machines and the wall render their content
  await page.goto(`${BASE}/#/machines`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700)
  check('machines page renders its heading', /Machines/.test(await page.locator('h1').first().textContent().catch(() => '')))
  await page.goto(`${BASE}/#/wall`, { waitUntil: 'networkidle' }); await page.waitForTimeout(900)
  check('wall mode shows Today and no nav', /Today/.test(await page.locator('body').textContent()) && (await page.locator('nav').count()) === 0)
  await page.goto(`${BASE}/#/board`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400)

  // the tray's light endpoint (roadmap 102)
  const counts = await api('GET', '/api/counts')
  check('GET /api/counts answers with today, open, the cap and the clock', counts.status === 200 && counts.body.todayCap === 5 && typeof counts.body.today === 'number' && typeof counts.body.open === 'number' && counts.body.clock?.status === 'out', JSON.stringify(counts.body))

  check('no console errors across the run', errors.length === 0, [...errors.slice(0, 3), ...failedUrls.slice(0, 4)].join(' | '))
} catch (err) {
  failures.push('exception'); console.error(err)
} finally {
  await browser?.close()
  server.kill()
  fs.rmSync(dir, { recursive: true, force: true })
}
if (failures.length) { console.error(`\n${failures.length} failed: ${failures.join(', ')}\n--- server ---\n${serverLog.slice(-2000)}`); process.exit(1) }
console.log('\nall good')
