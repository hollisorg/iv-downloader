import { useEffect, useRef, useState } from 'react'

// Bottom status strip + first-run engine install.
export default function Engine({ engine, onEngine }) {
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const started = useRef(false)

  const [update, setUpdate] = useState(null)

  useEffect(() => window.iv.engine.onProgress(setProgress), [])
  useEffect(() => {
    window.iv.app.update().then(setUpdate)
    return window.iv.app.onUpdate(setUpdate)
  }, [])

  const install = async (isUpdate = false) => {
    setError(null)
    setNote(null)
    setProgress({ phase: 'checking', percent: 0 })
    const before = engine?.ytdlp
    try {
      const status = await window.iv.engine.install()
      onEngine(status)
      if (isUpdate) setNote(status.ytdlp === before ? 'Already current' : `Updated to ${status.ytdlp}`)
    } catch (err) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setProgress(null)
    }
  }

  // First run: fetch the engine automatically.
  useEffect(() => {
    if (engine && !engine.ytdlp && !started.current) {
      started.current = true
      install()
    }
  }, [engine])

  const missing = engine && !engine.ytdlp

  return (
    <>
      {missing && (
        <div className="engine-gate">
          <div className="engine-card">
            <p className="mono label">00 / The engine</p>
            <h2 className="title">Warming up.</h2>
            <p className="dim">
              Fetching the latest official yt-dlp build (about 18 MB) and verifying its checksum. This happens once.
            </p>
            {progress && (
              <div className="bar">
                <span style={{ width: `${progress.percent || 2}%` }} />
              </div>
            )}
            {error && (
              <>
                <p className="qerror">{error}</p>
                <button className="btn btn-primary" onClick={() => install()}>
                  Try again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="statusbar mono">
        <AppVersion update={update} />
        <span>
          Engine <b>{engine?.ytdlp ? `yt-dlp ${engine.ytdlp}` : '—'}</b>
        </span>
        <span className={engine?.ffmpeg ? '' : 'warn'}>ffmpeg {engine?.ffmpeg ? '✓' : '✕'}</span>
        <span className={engine?.deno ? '' : 'warn'}>deno {engine?.deno ? '✓' : '✕'}</span>
        <span className="spacer" />
        {note ? (
          <span className="dim">{note}</span>
        ) : (
          <span className="dim rights">Only download what you have the right to</span>
        )}
        <button className="link-btn mono" onClick={() => window.iv.openLicenses()}>
          Licenses
        </button>
        {engine?.ytdlp && (
          <button className="link-btn mono" onClick={() => install(true)} disabled={Boolean(progress)}>
            {progress ? 'Checking…' : 'Update engine'}
          </button>
        )}
      </footer>
    </>
  )
}

function AppVersion({ update }) {
  if (!update) return null
  if (update.status === 'ready') {
    return (
      <button className="link-btn mono update-ready" onClick={() => window.iv.app.installUpdate()}>
        Restart to update to v{update.available}
      </button>
    )
  }
  return (
    <span title={update.status === 'error' ? update.error : undefined}>
      App <b>v{update.version}</b>
      {update.status === 'downloading' && update.percent != null && (
        <span className="dim"> · getting v{update.available} {Math.round(update.percent)}%</span>
      )}
    </span>
  )
}
