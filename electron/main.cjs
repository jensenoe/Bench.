/**
 * Desktop shell.
 *
 *  - Runs the Express server in-process and points the window at it.
 *  - Holds one persistent browser session ("persist:tomfit") for the tom.fit
 *    tools: you sign in once per tool, SSO does the rest, cookies survive restarts.
 *  - Shared data (tasks.json) lives NEXT TO THE EXECUTABLE, so a copy in a shared
 *    folder is read by whoever opens it. Credentials (MSAL cache, cookies) live in
 *    per-user storage and never enter that folder.
 */
const { app, BrowserWindow, screen, session, shell, ipcMain, Notification, dialog, Tray, Menu, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')
const { pathToFileURL } = require('node:url')

// ESM imports need file:// URLs; a bare C:\ path is read as a URL scheme on Windows.
const esm = (...p) => import(pathToFileURL(path.join(__dirname, '..', ...p)).href)

const PARTITION = 'persist:tomfit'
const TOOL_HOSTS = ['tom.fit', 'vercel.app', 'login.microsoftonline.com', 'login.live.com', 'microsoft.com', 'sharepoint.com', 'graph.microsoft.com', 'msauth.net', 'msftauth.net', 'live.com']

// ── where things live ─────────────────────────────────────────────────
// Portable build: beside the exe (a copy on a share is the shared board).
// Installed build: the exe sits in Program Files, so data defaults to the user's profile
// until a shared folder is chosen in Settings. Either way a machine.json can point elsewhere.
const PORTABLE = Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
const EXE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..'))
const MACHINE_CFG = PORTABLE || !app.isPackaged ? path.join(EXE_DIR, 'settings.json') : path.join(app.getPath('userData'), 'machine.json')
function readMachineCfg() { try { return JSON.parse(fs.readFileSync(MACHINE_CFG, 'utf8')) } catch { return {} } }
function writeMachineCfg(patch) { const cfg = { ...readMachineCfg(), ...patch }; fs.mkdirSync(path.dirname(MACHINE_CFG), { recursive: true }); fs.writeFileSync(MACHINE_CFG, JSON.stringify(cfg, null, 2)); return cfg }
function resolveDataDir() {
  const cfg = readMachineCfg()
  if (cfg.dataDir) return path.isAbsolute(cfg.dataDir) ? cfg.dataDir : path.join(EXE_DIR, cfg.dataDir)
  return (PORTABLE || !app.isPackaged) ? path.join(EXE_DIR, 'data') : path.join(app.getPath('userData'), 'data')
}

const DATA_DIR = resolveDataDir()
const SECRETS_DIR = path.join(app.getPath('userData'), 'secrets')
const USER_DIR = path.join(app.getPath('userData'), 'user')      // one person's time clock, not for the share
fs.mkdirSync(DATA_DIR, { recursive: true }); fs.mkdirSync(SECRETS_DIR, { recursive: true }); fs.mkdirSync(USER_DIR, { recursive: true })
process.env.BENCH_DATA_DIR = DATA_DIR
process.env.BENCH_SECRETS_DIR = SECRETS_DIR
process.env.BENCH_USER_DIR = USER_DIR
app.setAppUserModelId('fit.tom.bench')   // Windows needs this for toast notifications to carry the app name
process.env.BENCH_EMBEDDED = '1'

// One log for the things that would otherwise vanish: renderer crashes, unhandled errors, notification
// failures. Settings > About shows where it is. Capped at ~1 MB by rewriting the tail.
const LOG_FILE = path.join(app.getPath('userData'), 'bench.log')
function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.map(x => typeof x === 'string' ? x : (x?.stack || JSON.stringify(x))).join(' ')}\n`
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1_000_000) fs.writeFileSync(LOG_FILE, fs.readFileSync(LOG_FILE, 'utf8').slice(-500_000))
    fs.appendFileSync(LOG_FILE, line)
  } catch { /* logging must never be the thing that fails */ }
  console.log(line.trim())
}
process.on('uncaughtException', err => log('[main] uncaught', err))
process.on('unhandledRejection', err => log('[main] unhandled rejection', err))
// The GPU process dying is the other way a window goes black, and render-process-gone does not see it.
app.on('child-process-gone', (_e, details) => log('[child] gone', details))
// Escape hatch while the black screen is investigated: { "hardwareAcceleration": false } in machine.json
// (installed: %APPDATA%\bench\machine.json; portable: settings.json beside the exe). Must run before ready.
if (readMachineCfg().hardwareAcceleration === false) { app.disableHardwareAcceleration(); log('[main] hardware acceleration off by machine config') }

// .env beside the exe (or in the project) carries the Planner app registration
for (const f of [path.join(EXE_DIR, '.env'), path.join(path.dirname(DATA_DIR), '.env'), path.join(app.getPath('userData'), '.env'), path.join(__dirname, '..', '.env')]) {
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
}

// ── free port ─────────────────────────────────────────────────────────
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })

// ── the tool session bridge ──────────────────────────────────────────
let toolSession
const allowed = url => { try { const h = new URL(url).hostname; return TOOL_HOSTS.some(d => h === d || h.endsWith('.' + d)) } catch { return false } }

async function fetchWithSession(url, init = {}) {
  if (!allowed(url)) throw new Error(`refusing to fetch ${url} with the tool session`)
  return toolSession.fetch(url, { ...init, redirect: 'follow' })
}

async function hasSession(origin) {
  const cookies = await toolSession.cookies.get({ url: origin })
  return cookies.length > 0
}

function hiddenWindow() {
  return new BrowserWindow({
    show: false, width: 1200, height: 800,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
}

/** Load a tool page invisibly and evaluate JS in it (used for issues.tom.fit). */
async function runInSite(url, js, { timeoutMs = 30000 } = {}) {
  if (!allowed(url)) throw new Error(`refusing to load ${url}`)
  const win = hiddenWindow()
  try {
    await win.loadURL(url)
    return await Promise.race([
      win.webContents.executeJavaScript(js, true),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ])
  } finally { if (!win.isDestroyed()) win.destroy() }
}

/**
 * Show a window so the user can sign in. Resolves when the tool reports itself signed in
 * (a probe evaluated in the page every 1.5 s), when the user closes the window, or after 5 min.
 * The old "closed when back on the origin" rule fired on the very first load, before the
 * Microsoft redirect had even happened, which is why sign-in looked broken.
 */
function openSignIn(origin, probeJs) {
  return new Promise(resolve => {
    const win = new BrowserWindow({
      width: 1000, height: 760, title: `Sign in: ${new URL(origin).hostname}`, backgroundColor: '#0A0A0B',
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    win.setMenuBarVisibility(false)
    // popups (Microsoft login sometimes opens one) stay on the same session
    win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } } }))
    let settled = false, leftOrigin = false, probes = 0
    const done = (how) => {
      if (settled) return; settled = true
      console.log(`[signin] ${new URL(origin).hostname}: ${how}`)
      setTimeout(() => { if (!win.isDestroyed()) win.close() }, 700)
      resolve(how)
    }
    const probe = async () => {
      if (settled || win.isDestroyed()) return
      const url = win.webContents.getURL()
      if (!url.startsWith(origin)) { leftOrigin = true; return }
      probes++
      try {
        const ok = probeJs ? await win.webContents.executeJavaScript(`(async () => { try { return await (${probeJs}) } catch { return false } })()`, true) : false
        if (ok) return done('probe says signed in')
      } catch { /* page mid-navigation */ }
      // came back from the identity provider onto the tool: give in-page MSAL a moment, then accept
      if (leftOrigin && probes >= 3) return done('returned from login')
    }
    const iv = setInterval(probe, 1500)
    const timeout = setTimeout(() => done('timeout'), 5 * 60_000)
    win.on('closed', () => { clearInterval(iv); clearTimeout(timeout); if (!settled) { settled = true; resolve('closed by user') } })
    win.loadURL(origin)
  })
}

// ── notifications ────────────────────────────────────────────────────
function notify({ title, body, route }) {
  try {
    if (!Notification.isSupported()) return log('[notify] not supported on this system')
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => {
      try {
        if (!mainWin || mainWin.isDestroyed()) return
        if (mainWin.isMinimized()) mainWin.restore()
        mainWin.show(); mainWin.focus()
        if (route) mainWin.webContents.send('bench:route', route)
      } catch (err) { log('[notify] click', err) }
    })
    n.on('failed', (_e, err) => log('[notify] failed', err))
    n.show()
  } catch (err) { log('[notify]', err) }
}

// ── run at sign-in ───────────────────────────────────────────────────
// Portable builds run from a temp extraction; PORTABLE_EXECUTABLE_FILE is the exe the user actually has.
const launchPath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
function startupEnabled() {
  if (!app.isPackaged) return false
  return app.getLoginItemSettings({ path: launchPath() }).openAtLogin
}
function setStartup(on) {
  if (!app.isPackaged) return false
  app.setLoginItemSettings({ openAtLogin: Boolean(on), path: launchPath(), args: [] })
  return startupEnabled()
}
/** machine config { "startup": false } opts out; default is on, applied once. */
function applyStartupDefault() {
  if (!app.isPackaged) return
  if (readMachineCfg().startup === false) return
  const marker = path.join(USER_DIR, '.startup-applied')
  if (fs.existsSync(marker)) return
  setStartup(true)
  fs.writeFileSync(marker, new Date().toISOString())
}

// ── tray ──────────────────────────────────────────────────────────────
// Closing the window hides it; the app, the server and the time clock keep running from the tray,
// so the 12:00 toast, the 12:30 auto-end and the morning digest fire with the window closed.
// Quit lives in the tray menu. machine config { "closeToTray": false } restores close-means-quit.
let tray = null, quitting = false
const closeToTray = () => readMachineCfg().closeToTray !== false
function showMain() {
  if (!mainWin || mainWin.isDestroyed()) return
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show(); mainWin.focus()
}
function makeTray() {
  try {
    // dist/icon.png ships inside the asar (build/ does not); the ico is only there in a dev checkout.
    const png = nativeImage.createFromPath(path.join(__dirname, '..', 'dist', 'icon.png'))
    const icon = png.isEmpty() ? nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.ico')) : png.resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('Bench.')
    const menu = Menu.buildFromTemplate([
      { label: 'Open Bench.', click: showMain },
      { label: 'Lunch screen', click: () => { showMain(); mainWin?.webContents.send('bench:route', '#/lunch') } },
      { type: 'separator' },
      { label: 'Quit Bench.', click: () => { quitting = true; app.quit() } }
    ])
    tray.setContextMenu(menu)
    tray.on('click', showMain)
    tray.on('double-click', showMain)
  } catch (err) { log('[tray]', err) }
}

// ── app ───────────────────────────────────────────────────────────────
let mainWin
async function start() {
  toolSession = session.fromPartition(PARTITION)
  // Ordinary links from the tool pages should open in the user's browser, not inside the app.
  toolSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  const { bridge } = await esm('server', 'bridge.js')
  Object.assign(bridge, { desktop: true, fetchWithSession, runInSite, openSignIn, hasSession, notify })
  applyStartupDefault()

  const port = await freePort()
  const server = await esm('server', 'index.js')
  await new Promise(res => { const h = server.listen(port); h.once('listening', res) })

  // The window comes back where you left it, at the size you left it, maximised if it was.
  const boundsFile = path.join(USER_DIR, 'window.json')
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(boundsFile, 'utf8')) } catch { /* first run */ }
  const onScreen = saved.x != null && screen.getAllDisplays().some(d => {
    const b = d.workArea; return saved.x >= b.x - 50 && saved.y >= b.y - 50 && saved.x < b.x + b.width - 100 && saved.y < b.y + b.height - 100
  })
  mainWin = new BrowserWindow({
    width: saved.width || 1380, height: saved.height || 900, ...(onScreen ? { x: saved.x, y: saved.y } : {}), minWidth: 1024, minHeight: 640,
    backgroundColor: '#0A0A0B', title: 'Bench.', autoHideMenuBar: true, icon: path.join(__dirname, '..', 'dist', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true }
  })
  if (saved.maximized) mainWin.maximize()
  let boundsTimer = null
  const rememberBounds = () => {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      try {
        const max = mainWin.isMaximized()
        const b = max ? (saved.width ? saved : mainWin.getNormalBounds()) : mainWin.getBounds()
        saved = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: max }
        fs.mkdirSync(USER_DIR, { recursive: true })
        fs.writeFileSync(boundsFile, JSON.stringify(saved))
      } catch { /* not worth a dialog */ }
    }, 400)
  }
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) mainWin.on(ev, rememberBounds)
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  mainWin.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); shell.openExternal(url) } })
  // A dead renderer is a black window. Log it and bring the page back instead of leaving it there.
  mainWin.webContents.on('render-process-gone', (_e, details) => {
    log('[renderer] gone', details)
    if (details.reason !== 'clean-exit' && !mainWin.isDestroyed()) setTimeout(() => { try { mainWin.webContents.reload() } catch (err) { log('[renderer] reload', err) } }, 800)
  })
  mainWin.webContents.on('unresponsive', () => log('[renderer] unresponsive'))
  mainWin.webContents.on('responsive', () => log('[renderer] responsive again'))
  mainWin.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 3) log('[renderer] error', `${message} (${source}:${line})`) })
  // The close button hides the window; Quit in the tray menu (or a real quit) ends the app.
  mainWin.on('close', e => { if (!quitting && closeToTray() && app.isPackaged) { e.preventDefault(); mainWin.hide() } })
  if (app.isPackaged) makeTray()
  await mainWin.loadURL(`http://127.0.0.1:${port}/`)
}
app.on('before-quit', () => { quitting = true })

ipcMain.handle('bench:info', () => ({ dataDir: DATA_DIR, secretsDir: SECRETS_DIR, logFile: LOG_FILE, version: app.getVersion(), portable: PORTABLE, machineCfg: MACHINE_CFG }))
ipcMain.handle('bench:open-external', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url) })
ipcMain.handle('bench:open-data-folder', () => shell.openPath(DATA_DIR))
/** A tool in its own window, on the shared tom.fit session, so SSO carries over. */
function openTool(url) {
  if (!allowed(url)) return shell.openExternal(url)
  const win = new BrowserWindow({
    width: 1400, height: 900, title: new URL(url).hostname, backgroundColor: '#0A0A0B', autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.webContents.setWindowOpenHandler(({ url: u }) => { if (allowed(u)) { win.loadURL(u) } else shell.openExternal(u); return { action: 'deny' } })
  win.loadURL(url)
}
ipcMain.handle('bench:open-tool', (_e, url) => { if (/^https?:/.test(url)) openTool(url) })

/** Pick the shared folder for tasks.json; takes effect after a relaunch. */
ipcMain.handle('bench:choose-data-folder', async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: 'Choose the folder that holds the board', defaultPath: DATA_DIR, properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled || !r.filePaths[0]) return { changed: false, dataDir: DATA_DIR }
  writeMachineCfg({ dataDir: r.filePaths[0] })
  return { changed: true, dataDir: r.filePaths[0] }
})
ipcMain.handle('bench:relaunch', () => { app.relaunch(); app.exit(0) })

ipcMain.handle('bench:startup', (_e, on) => on === undefined ? startupEnabled() : setStartup(on))
ipcMain.handle('bench:notify', (_e, payload) => notify(payload || {}))
ipcMain.handle('bench:log', (_e, line) => log('[app]', String(line).slice(0, 4000)))
ipcMain.handle('bench:open-log', () => shell.showItemInFolder(LOG_FILE))

// Started at sign-in: a second launch must not open a second instance (and a second server).
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', showMain)

app.whenReady().then(start).catch(err => {
  log('[main] start failed', err)
  dialog.showErrorBox('Bench could not start', `${err.stack || err.message}\n\nData folder: ${DATA_DIR}`)
  app.quit()
})
// With the tray, a closed window is hidden, not gone; only a real quit ends the process.
app.on('window-all-closed', () => { if (!app.isPackaged || !closeToTray()) app.quit() })
