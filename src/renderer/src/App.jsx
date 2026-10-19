import { useCallback, useEffect, useState } from 'react'
import Field from './components/Field'
import LinkBar from './components/LinkBar'
import Picker from './components/Picker'
import Queue from './components/Queue'
import Engine from './components/Engine'

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

  const fetchLink = useCallback(async (url) => {
    setProbing(true)
    setError(null)
    setInfo(null)
    try {
      setInfo(await window.iv.probe(url))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setProbing(false)
    }
  }, [])

  const enqueue = useCallback(async (requests) => {
    try {
      await window.iv.queue.add(requests)
      setInfo(null)
    } catch (err) {
      setError(cleanError(err))
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
              <div className="notice" role="alert">
                <span className="mono">Signal lost</span>
                <p>{error}</p>
              </div>
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

function cleanError(err) {
  const msg = String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  if (/sign in|log ?in|private video|members|age[- ](restricted|gated)|confirm your age|cookies/i.test(msg)) {
    return `${msg} — turn on Sign-in in the queue panel to use your browser login.`
  }
  return msg
}
