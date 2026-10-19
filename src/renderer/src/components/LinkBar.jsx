import { useEffect, useRef, useState } from 'react'
import { hostOf } from '../format'

export default function LinkBar({ disabled, busy, onSubmit }) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(null)
  const inputRef = useRef(null)

  // Offer whatever link is on the clipboard when the window gets focus.
  useEffect(() => {
    const check = async () => {
      const found = await window.iv.clipboardUrl()
      setCopied(found && found !== url ? found : null)
    }
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [url])

  const submit = (value = url) => {
    const v = value.trim()
    if (!v || disabled || busy) return
    setUrl(v)
    onSubmit(v)
  }

  return (
    <div className="linkbar-wrap">
      <form
        className="linkbar"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link — YouTube, Vimeo, X, TikTok, Instagram…"
          spellCheck={false}
          autoFocus
          disabled={disabled}
          aria-label="Video link"
        />
        <button className="btn btn-primary" type="submit" disabled={disabled || busy || !url.trim()}>
          {busy ? 'Reading' : 'Fetch'} <span aria-hidden>↗</span>
        </button>
      </form>
      {copied && !busy && (
        <button
          className="chip chip-ghost copied"
          onClick={() => {
            setUrl(copied)
            submit(copied)
          }}
          disabled={disabled}
        >
          <span className="mono">Use copied link</span>
          <span className="copied-host">{hostOf(copied)}</span>
        </button>
      )}
    </div>
  )
}
