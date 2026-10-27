import { useState } from 'react'
import { BROWSERS } from './Queue'

const nameOf = (id) => BROWSERS.find(([b]) => b === id)?.[1] || id

// A failed fetch, in plain words. Login problems get a one-click "use my browser login" fix.
export default function ErrorNotice({ error, settings, onSettings, onRetry }) {
  const signIn = settings?.signIn || { mode: 'none' }
  const [browser, setBrowser] = useState(signIn.mode === 'browser' ? signIn.browser : 'firefox')
  const login = error.kind === 'login' && settings
  const using = signIn.mode === 'browser' ? nameOf(signIn.browser) : signIn.mode === 'file' ? 'your cookies.txt file' : null

  const useLogin = async () => {
    onSettings(await window.iv.settings.set({ signIn: { mode: 'browser', browser } }))
    onRetry()
  }

  return (
    <div className="notice" role="alert">
      <span className="mono">Signal lost</span>
      <p className="notice-title">{error.title}</p>
      {login && using ? (
        <p>
          Sign-in is already using {using}, and it still said no. Open the video in that browser and check you’re
          logged in. Chrome and Edge lock their logins while they’re open: close them first, or switch to Firefox.
        </p>
      ) : (
        <p>{error.body}</p>
      )}

      {login && (
        <div className="notice-actions">
          <label className="mono dim signin">
            Use my login from
            <select value={browser} onChange={(e) => setBrowser(e.target.value)}>
              {BROWSERS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={useLogin}>
            Try again ↻
          </button>
        </div>
      )}
      {!login && error.kind !== 'link' && (
        <div className="notice-actions">
          <button className="link-btn mono" onClick={onRetry}>
            Try again ↻
          </button>
        </div>
      )}

      <details className="notice-detail">
        <summary className="mono dim">Technical details</summary>
        <p>{error.detail}</p>
      </details>
    </div>
  )
}
