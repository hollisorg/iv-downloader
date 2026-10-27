// App self-updates from GitHub Releases (latest.yml published next to the installer).
// Updates download in the background; installing waits for the user, or happens on quit.
import { app, shell } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

const SIX_HOURS = 6 * 60 * 60 * 1000

// macOS only installs updates into an app signed with an Apple Developer ID. Until the Mac build is
// signed, it reports new versions and sends people to the release page instead.
const MANUAL = process.platform === 'darwin'
const RELEASES = 'https://github.com/hollisorg/iv-downloader/releases/latest'

let state = { status: 'idle', version: app.getVersion(), available: null, percent: null, error: null }

export function updateState() {
  return state
}

export function initUpdater(onChange) {
  const set = (patch) => {
    state = { ...state, ...patch }
    onChange(state)
  }

  // Development builds have no app-update.yml; only packaged builds check.
  if (!app.isPackaged) {
    set({ status: 'dev' })
    return { check: async () => state, install: () => {} }
  }

  autoUpdater.autoDownload = !MANUAL
  autoUpdater.autoInstallOnAppQuit = !MANUAL

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
  autoUpdater.on('update-not-available', () => set({ status: 'current', available: null }))
  autoUpdater.on('update-available', (info) =>
    set(MANUAL ? { status: 'available', available: info.version } : { status: 'downloading', available: info.version, percent: 0 })
  )
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', available: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => {
    const message = String(err?.message || err)
    // Before the first release is published (drafts only), GitHub has no "latest" to report.
    if (/Unable to find latest version/i.test(message)) return set({ status: 'current', error: null })
    set({ status: 'error', error: message.split('\n')[0] })
  })

  const check = async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* reported through the error event */
    }
    return state
  }

  setTimeout(check, 10_000)
  setInterval(check, SIX_HOURS)

  return {
    check,
    // The download queue is saved first, so anything in progress resumes after the restart.
    install: () => (MANUAL ? shell.openExternal(RELEASES) : autoUpdater.quitAndInstall(false, true))
  }
}
