import { bytes, duration } from '../format'

const isMac = window.iv.platform === 'darwin'

const BROWSERS = [
  ['firefox', 'Firefox'],
  ['chrome', 'Chrome'],
  ...(isMac ? [['safari', 'Safari']] : []),
  ['edge', 'Edge'],
  ['brave', 'Brave'],
  ['opera', 'Opera'],
  ['vivaldi', 'Vivaldi']
]

// Sign-in lets yt-dlp use your existing logins (private, age-gated or members-only videos).
// Cookies are read locally by yt-dlp; the app never stores or sends them anywhere.
function SignIn({ settings, onSettings }) {
  const signIn = settings.signIn || { mode: 'none' }
  const value = signIn.mode === 'browser' ? signIn.browser : signIn.mode
  const fileName = signIn.file ? signIn.file.split(/[\\/]/).pop() : null

  const change = async (v) => {
    if (v === 'file') return onSettings(await window.iv.settings.chooseCookies())
    if (v === 'none') return onSettings(await window.iv.settings.set({ signIn: { mode: 'none' } }))
    onSettings(await window.iv.settings.set({ signIn: { mode: 'browser', browser: v } }))
  }

  return (
    <label className="mono dim signin" title={fileName ? `Using ${fileName}` : undefined}>
      Sign-in
      <select value={value} onChange={(e) => change(e.target.value)}>
        <option value="none">Off</option>
        {BROWSERS.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
        <option value="file">{fileName ? `File: ${fileName}` : 'cookies.txt file…'}</option>
      </select>
    </label>
  )
}

function signInHint(signIn) {
  if (signIn?.mode !== 'browser' || signIn.browser === 'firefox') return null
  if (signIn.browser === 'safari') {
    return 'Safari keeps its cookies in a protected folder. Give IV Downloader Full Disk Access in System Settings → Privacy & Security, or use Firefox or a cookies.txt file.'
  }
  if (isMac) {
    return 'macOS will ask to let IV Downloader use the browser’s saved key in your keychain. Click Allow. If sign-in still fails, use Firefox or a cookies.txt file.'
  }
  return 'Chromium browsers lock their cookies while open and newer Chrome/Edge builds encrypt them. If sign-in fails, close the browser, or use Firefox or a cookies.txt file.'
}

const STATUS_LABEL = {
  queued: 'Waiting',
  downloading: 'Downloading',
  processing: 'Processing',
  done: 'Saved',
  error: 'Failed',
  canceled: 'Canceled'
}

export default function Queue({ items, active, settings, onSettings }) {
  const finished = items.some((i) => ['done', 'error', 'canceled'].includes(i.status))

  return (
    <aside className="queue">
      <div className="queue-head">
        <div>
          <p className="mono label">03 / The queue</p>
          <h2 className="queue-title">
            {active ? (
              <>
                {active} <span className="dim">in motion</span>
              </>
            ) : (
              'Queue'
            )}
          </h2>
        </div>
        {finished && (
          <button className="link-btn mono" onClick={() => window.iv.queue.clearFinished()}>
            Clear finished
          </button>
        )}
      </div>

      {settings && (
        <div className="queue-settings">
          <button
            className="folder"
            title="Change download folder"
            onClick={async () => onSettings(await window.iv.settings.chooseFolder())}
          >
            <span className="mono dim">Saving to</span>
            <span className="folder-path">{settings.downloadDir}</span>
          </button>
          <div className="queue-settings-row">
            <button className="link-btn mono" onClick={() => window.iv.openFolder()}>
              Open folder ↗
            </button>
            <SignIn settings={settings} onSettings={onSettings} />
            <label className="mono dim concurrency">
              At once
              <select
                value={settings.concurrency}
                onChange={async (e) =>
                  onSettings(await window.iv.settings.set({ concurrency: Number(e.target.value) }))
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {signInHint(settings.signIn) && <p className="hint">{signInHint(settings.signIn)}</p>}
        </div>
      )}

      {items.length === 0 ? (
        <div className="queue-empty">
          <span className="ring" aria-hidden />
          <p className="mono">Nothing queued yet.</p>
          <p className="dim">Paste a link to begin.</p>
        </div>
      ) : (
        <ul className="queue-list">
          {[...items].reverse().map((item) => (
            <QueueItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </aside>
  )
}

function QueueItem({ item }) {
  const { status, progress } = item
  const live = status === 'downloading' || status === 'processing'
  const percent = status === 'done' ? 100 : progress?.percent ?? null
  const indeterminate = status === 'processing' || (status === 'downloading' && percent == null)

  const detail = []
  if (status === 'downloading') {
    if (item.part > 1) detail.push(`Part ${item.part}`)
    if (percent != null) detail.push(`${percent.toFixed(0)}%`)
    if (progress?.speed) detail.push(`${bytes(progress.speed)}/s`)
    if (progress?.eta != null) detail.push(`${duration(progress.eta)} left`)
  } else if (status === 'processing') {
    detail.push(item.stage)
  } else if (status === 'done' && item.size) {
    detail.push(bytes(item.size))
  }

  return (
    <li className={`qitem qitem-${status}`}>
      <div className="qthumb">{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</div>
      <div className="qbody">
        <p className="qtitle" title={item.title}>
          {item.title}
        </p>
        <p className="qmeta mono">
          <span className={`qstatus s-${status}`}>
            {status === 'queued' && item.resumed ? 'Resuming' : STATUS_LABEL[status]}
          </span>
          <span className="dim">{item.label}</span>
          {detail.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </p>
        {(live || status === 'queued') && (
          <div className={`bar ${indeterminate ? 'bar-indeterminate' : ''}`}>
            <span style={{ width: `${percent ?? 0}%` }} />
          </div>
        )}
        {status === 'error' && <p className="qerror">{item.error}</p>}
        <div className="qactions">
          {(live || status === 'queued') && (
            <button className="link-btn mono" onClick={() => window.iv.queue.cancel(item.id)}>
              Cancel
            </button>
          )}
          {(status === 'error' || status === 'canceled') && (
            <button className="link-btn mono" onClick={() => window.iv.queue.retry(item.id)}>
              Retry
            </button>
          )}
          {status === 'done' && item.filepath && (
            <>
              <button className="link-btn mono" onClick={() => window.iv.open(item.filepath)}>
                Play
              </button>
              <button className="link-btn mono" onClick={() => window.iv.reveal(item.filepath)}>
                Show in folder
              </button>
            </>
          )}
          {!live && (
            <button className="link-btn mono dim" onClick={() => window.iv.queue.remove(item.id)}>
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
