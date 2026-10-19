import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ffmpegDir, denoPath, installedVersion, installLatest } from './engine'
import { probe } from './probe'
import { DownloadQueue } from './queue'
import { initUpdater, updateState } from './updater'

// ---------- settings ----------

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

const BROWSERS = ['firefox', 'chrome', 'edge', 'brave', 'opera', 'vivaldi', 'chromium']

const defaults = () => ({
  downloadDir: path.join(app.getPath('downloads'), 'IV Downloads'),
  concurrency: 2,
  subtitles: false,
  embedMeta: true,
  // Sign-in for private / members-only videos: yt-dlp reads cookies locally; nothing leaves the machine.
  signIn: { mode: 'none', browser: 'firefox', file: null }
})

let settings

function loadSettings() {
  try {
    settings = { ...defaults(), ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }
  } catch {
    settings = defaults()
  }
}

function saveSettings(patch) {
  const next = { ...settings }
  if (typeof patch.downloadDir === 'string' && path.isAbsolute(patch.downloadDir)) {
    next.downloadDir = patch.downloadDir
  }
  if (Number.isInteger(patch.concurrency)) {
    next.concurrency = Math.min(5, Math.max(1, patch.concurrency))
  }
  if (typeof patch.subtitles === 'boolean') next.subtitles = patch.subtitles
  if (typeof patch.embedMeta === 'boolean') next.embedMeta = patch.embedMeta
  if (patch.signIn && typeof patch.signIn === 'object') {
    const s = { ...next.signIn }
    if (['none', 'browser', 'file'].includes(patch.signIn.mode)) s.mode = patch.signIn.mode
    if (BROWSERS.includes(patch.signIn.browser)) s.browser = patch.signIn.browser
    if (patch.signIn.file === null || (typeof patch.signIn.file === 'string' && path.isAbsolute(patch.signIn.file))) {
      s.file = patch.signIn.file
    }
    if (s.mode === 'file' && !s.file) s.mode = 'none'
    next.signIn = s
  }
  settings = next
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
  return settings
}

// ---------- window ----------

// yt-dlp arguments for the chosen sign-in method.
function signInArgs() {
  const { mode, browser, file } = settings.signIn || {}
  if (mode === 'browser' && BROWSERS.includes(browser)) return ['--cookies-from-browser', browser]
  if (mode === 'file' && file) {
    if (!fs.existsSync(file)) throw new Error('The cookies file in Sign-in settings no longer exists')
    return ['--cookies', file]
  }
  return []
}

let win
let updater = null
const queue = new DownloadQueue({
  getSettings: () => settings,
  extraArgs: signInArgs,
  storePath: path.join(app.getPath('userData'), 'queue.json')
})

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

queue.on('change', (items) => send('queue:changed', items))

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    show: false,
    backgroundColor: '#100c0e',
    title: 'IV Downloader',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#100c0e', symbolColor: '#f1ede5', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // The UI never navigates; external links open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ---------- IPC ----------

async function engineStatus() {
  return {
    ytdlp: await installedVersion(),
    ffmpeg: Boolean(ffmpegDir()),
    deno: Boolean(denoPath())
  }
}

let installing = null
function installEngine() {
  // Windows can't replace yt-dlp.exe while it is running.
  if (queue.running.size > 0) {
    return Promise.reject(new Error('Let the current downloads finish, then update the engine'))
  }
  installing ??= (async () => {
    queue.setReady(false)
    try {
      const current = await installedVersion()
      await installLatest((p) => send('engine:progress', p), current)
    } finally {
      queue.setReady(Boolean(await installedVersion()))
      installing = null
    }
  })()
  return installing.then(engineStatus)
}

function registerIpc() {
  ipcMain.handle('update:state', () => updateState())
  ipcMain.handle('update:check', () => updater?.check())
  ipcMain.handle('update:install', () => {
    queue.shutdown()
    updater?.install()
  })

  ipcMain.handle('engine:status', engineStatus)
  ipcMain.handle('engine:install', installEngine)

  ipcMain.handle('probe', (_e, url) => probe(url, signInArgs()))

  ipcMain.handle('queue:list', () => queue.snapshot())
  ipcMain.handle('queue:add', (_e, requests) => {
    if (!Array.isArray(requests) || requests.length === 0) throw new Error('Nothing to add')
    queue.add(requests.slice(0, 500))
  })
  ipcMain.handle('queue:cancel', (_e, id) => queue.cancel(id))
  ipcMain.handle('queue:retry', (_e, id) => queue.retry(id))
  ipcMain.handle('queue:remove', (_e, id) => queue.remove(id))
  ipcMain.handle('queue:clear', () => queue.clearFinished())

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, patch) => saveSettings(patch || {}))
  ipcMain.handle('settings:chooseFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose where downloads are saved',
      defaultPath: settings.downloadDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || !filePaths[0]) return settings
    return saveSettings({ downloadDir: filePaths[0] })
  })
  ipcMain.handle('settings:chooseCookies', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose a cookies.txt file (Netscape format)',
      properties: ['openFile'],
      filters: [{ name: 'Cookies', extensions: ['txt'] }]
    })
    if (canceled || !filePaths[0]) return settings
    return saveSettings({ signIn: { mode: 'file', file: filePaths[0] } })
  })

  ipcMain.handle('clipboard:readUrl', async () => {
    // readText is async in newer Electron releases; await works for both.
    const text = String((await clipboard.readText()) ?? '').trim()
    return /^https?:\/\/\S+$/i.test(text) ? text : null
  })

  // Only reveal/open files this app downloaded.
  const known = (p) => queue.items.some((i) => i.filepath && i.filepath === p)
  ipcMain.handle('file:reveal', (_e, p) => {
    if (known(p)) shell.showItemInFolder(p)
  })
  ipcMain.handle('file:open', (_e, p) => (known(p) ? shell.openPath(p) : null))
  ipcMain.handle('about:licenses', () => {
    const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
    return shell.openPath(path.join(base, 'THIRD_PARTY_NOTICES.txt'))
  })
  ipcMain.handle('folder:open', () => {
    fs.mkdirSync(settings.downloadDir, { recursive: true })
    return shell.openPath(settings.downloadDir)
  })
}

// ---------- lifecycle ----------

app.whenReady().then(async () => {
  loadSettings()
  queue.load()
  registerIpc()
  createWindow()
  updater = initUpdater((state) => send('update:changed', state))
  // Resume saved downloads once the engine is known to be there (first run installs it first).
  queue.setReady(Boolean(await installedVersion()))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => queue.shutdown())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
