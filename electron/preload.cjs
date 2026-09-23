const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('bench', {
  desktop: true,
  info: () => ipcRenderer.invoke('bench:info'),
  openExternal: url => ipcRenderer.invoke('bench:open-external', url),
  /** open a file or folder path with whatever Windows uses for it; resolves to '' or an error text */
  openPath: p => ipcRenderer.invoke('bench:open-path', p),
  openDataFolder: () => ipcRenderer.invoke('bench:open-data-folder'),
  /** read (no arg) or set run-at-sign-in; false when not packaged */
  startup: (on) => ipcRenderer.invoke('bench:startup', on),
  notify: (payload) => ipcRenderer.invoke('bench:notify', payload),
  /** open a tom.fit tool in its own window on the shared, signed-in session */
  openTool: (url) => ipcRenderer.invoke('bench:open-tool', url),
  chooseDataFolder: () => ipcRenderer.invoke('bench:choose-data-folder'),
  relaunch: () => ipcRenderer.invoke('bench:relaunch'),
  /** append a line to bench.log in the profile; open the folder that holds it */
  log: (line) => ipcRenderer.invoke('bench:log', line),
  openLog: () => ipcRenderer.invoke('bench:open-log'),
  /** main asks the window to jump to a hash route (notification click) */
  onRoute: (cb) => { const h = (_e, r) => cb(r); ipcRenderer.on('bench:route', h); return () => ipcRenderer.removeListener('bench:route', h) },
  /** Ctrl+Alt+B anywhere on the desktop: main brings the window up and asks for quick add */
  onQuickAdd: (cb) => { const h = () => cb(); ipcRenderer.on('bench:quick-add', h); return () => ipcRenderer.removeListener('bench:quick-add', h) },
  /** a downloaded installer (path from GET /api/updates .downloaded) runs silently when Bench quits, or right now */
  installUpdate: (p) => ipcRenderer.invoke('bench:install-update', p),
  installUpdateNow: (p) => ipcRenderer.invoke('bench:install-update-now', p),
  /** versions, folders and the log tail for a bug report */
  diagnostics: () => ipcRenderer.invoke('bench:diagnostics')
})
