import { useCallback, useEffect, useState } from 'react'
import Field from './components/Field'
import LinkBar from './components/LinkBar'
import Picker from './components/Picker'
import Queue from './components/Queue'
import Engine from './components/Engine'
import ErrorNotice from './components/ErrorNotice'
import { explain, stripIpc } from './errors'

export default function App() {
  const [engine, setEngine] = useState(null)
  const [settings, setSettings] = useState(null)
  const [items, setItems] = useState([])
  const [probing, setProbing] = useState(false)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    window.iv.engine.status().then(setEngine)
    window.iv.settings.get().then(setSettings)
    window.iv.queue.list().then(setItems)
    return window.iv.queue.onChange(setItems)
  }, [])

  const [lastUrl, setLastUrl] = useState('')

  const fetchLink = useCallback(async (url) => {
    setLastUrl(url)
    setProbing(true)
    setError(null)
    setInfo(null)
    try {
      setInfo(await window.iv.probe(url))
    } catch (err) {
      setError(explain(stripIpc(err), url))
    } finally {
      setProbing(false)
    }
  }, [])

  const enqueue = useCallback(async (requests) => {
    try {
      await window.iv.queue.add(requests)
      setInfo(null)
    } catch (err) {
      setError(explain(stripIpc(err), requests[0]?.url))
    }
  }, [])

  const ready = Boolean(engine?.ytdlp)
  const active = items.filter((i) => ['queued', 'downloading', 'processing'].includes(i.status)).length

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">IV</span>
          <span className="mono">Infinite Variance</span>
          <span className="mono dim">/ Downloader</span>
        </div>
      </header>

      <main className="layout">
        <section className="stage">
          <Field />
          <div className="stage-inner">
            <p className="mono label">01 / The link</p>
            <h1 className="headline">
              Keep it<span className="accent">.</span>
            </h1>
            <p className="lede">Paste a link. Pick a format. Keep what moves you.</p>

            <LinkBar disabled={!ready} busy={probing} onSubmit={fetchLink} />

            {error && (
              <ErrorNotice
                key={error.detail}
                error={error}
                settings={settings}
                onSettings={setSettings}
                onRetry={() => fetchLink(lastUrl)}
              />
            )}

            {probing && <Scanning />}

            {info && settings && (
              <Picker
                info={info}
                settings={settings}
                onSettings={async (patch) => setSettings(await window.iv.settings.set(patch))}
                onAdd={enqueue}
                onDismiss={() => setInfo(null)}
              />
            )}
          </div>
        </section>

        <Queue
          items={items}
          active={active}
          settings={settings}
          onSettings={setSettings}
        />
      </main>

      <Engine engine={engine} onEngine={setEngine} />
    </div>
  )
}

function Scanning() {
  return (
    <div className="scanning">
      <span className="pulse" />
      <span className="mono">Reading the signal…</span>
    </div>
  )
}
