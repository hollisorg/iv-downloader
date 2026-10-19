import { useMemo, useState } from 'react'
import { bytes, codec, duration, hostOf } from '../format'

const HEIGHTS = [2160, 1440, 1080, 720, 480, 360]

function videoPresets(maxHeight) {
  const heights = maxHeight ? HEIGHTS.filter((h) => h <= maxHeight) : HEIGHTS
  return [
    { key: 'best', label: 'Best', hint: maxHeight ? `${maxHeight}p` : 'max' },
    ...heights.map((h) => ({ key: `h${h}`, label: `${h}p`, hint: h >= 2160 ? '4K' : h >= 1440 ? '2K' : null }))
  ]
}

// yt-dlp extractor keys are internal names ("YoutubeTab"); show something friendlier.
function siteName(key) {
  if (!key) return null
  const base = key.replace(/(Tab|Playlist|User|Channel|Search)$/, '')
  return { Youtube: 'YouTube', Twitter: 'X', TikTok: 'TikTok', Vimeo: 'Vimeo' }[base] || base
}

const AUDIO_PRESETS = [
  { key: 'mp3', label: 'MP3', hint: 'audio' },
  { key: 'm4a', label: 'M4A', hint: 'audio' }
]

export default function Picker({ info, settings, onSettings, onAdd, onDismiss }) {
  const [choice, setChoice] = useState({ type: 'preset', preset: 'best' })
  const [showAll, setShowAll] = useState(false)
  const isPlaylist = info.kind === 'playlist'
  // Pre-select short playlists; for big channels, let the user choose rather than queue hundreds.
  const [picked, setPicked] = useState(
    () => new Set(isPlaylist && info.entries.length <= 50 ? info.entries.map((e) => e.url) : [])
  )

  const options = { subtitles: settings.subtitles, embedMeta: settings.embedMeta }
  const presets = videoPresets(isPlaylist ? 0 : info.maxHeight)

  const add = () => {
    if (isPlaylist) {
      const entries = info.entries.filter((e) => picked.has(e.url))
      onAdd(entries.map((e) => ({ url: e.url, title: e.title, thumbnail: e.thumbnail, choice, options })))
    } else {
      onAdd([{ url: info.url, title: info.title, thumbnail: info.thumbnail, choice, options }])
    }
  }

  const count = isPlaylist ? picked.size : 1

  return (
    <article className="picker">
      <div className="picker-head">
        <div className="thumb">
          {info.thumbnail ? <img src={info.thumbnail} alt="" /> : <div className="thumb-empty" />}
          {!isPlaylist && duration(info.duration) && <span className="thumb-time mono">{duration(info.duration)}</span>}
          {isPlaylist && <span className="thumb-time mono">{info.entries.length} items</span>}
        </div>
        <div className="picker-meta">
          <p className="mono label">
            {siteName(info.extractor) || hostOf(info.url)} {isPlaylist ? '/ Playlist' : info.isLive ? '/ Live' : ''}
          </p>
          <h2 className="title">{info.title}</h2>
          {info.uploader && <p className="by">{info.uploader}</p>}
        </div>
        <button className="icon-btn" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>

      <p className="mono label">02 / The format</p>

      <div className="preset-groups">
        <PresetGroup name="Video" presets={presets} choice={choice} onChoose={setChoice} />
        <PresetGroup name="Audio" presets={AUDIO_PRESETS} choice={choice} onChoose={setChoice} />
      </div>

      {!isPlaylist && info.formats.length > 0 && (
        <>
          <button className="link-btn mono" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '− Hide' : '+ All'} formats ({info.formats.length})
          </button>
          {showAll && <FormatTable formats={info.formats} choice={choice} onChoose={setChoice} />}
        </>
      )}

      {isPlaylist && <EntryList entries={info.entries} picked={picked} setPicked={setPicked} />}

      <div className="picker-foot">
        <div className="toggles">
          <Toggle
            label="Subtitles"
            checked={settings.subtitles}
            disabled={!isPlaylist && !info.hasSubtitles}
            onChange={(v) => onSettings({ subtitles: v })}
          />
          <Toggle
            label="Thumbnail + metadata"
            checked={settings.embedMeta}
            onChange={(v) => onSettings({ embedMeta: v })}
          />
        </div>
        <button className="btn btn-primary btn-lg" onClick={add} disabled={count === 0}>
          Add {count > 1 ? `${count} ` : ''}to queue <span aria-hidden>↓</span>
        </button>
      </div>
    </article>
  )
}

function PresetGroup({ name, presets, choice, onChoose }) {
  return (
    <div className="preset-group">
      <span className="mono dim">{name}</span>
      <div className="chips">
        {presets.map((p) => {
          const on = choice.type === 'preset' && choice.preset === p.key
          return (
            <button
              key={p.key}
              className={`chip ${on ? 'chip-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChoose({ type: 'preset', preset: p.key })}
            >
              {p.label}
              {p.hint && <span className="chip-hint">{p.hint}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FormatTable({ formats, choice, onChoose }) {
  const sorted = useMemo(
    () =>
      [...formats].sort(
        (a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || b.abr || 0) - (a.tbr || a.abr || 0)
      ),
    [formats]
  )
  return (
    <div className="ftable" role="listbox" aria-label="All formats">
      <div className="frow fhead mono">
        <span>ID</span>
        <span>Type</span>
        <span>Quality</span>
        <span>Codecs</span>
        <span>Ext</span>
        <span>Size</span>
      </div>
      {sorted.map((f) => {
        const on = choice.type === 'format' && choice.formatId === f.id
        const quality =
          f.kind === 'audio'
            ? f.abr
              ? `${Math.round(f.abr)} kbps`
              : f.note || '—'
            : `${f.height ? `${f.height}p` : f.note || '—'}${f.fps && f.fps > 30 ? f.fps : ''}${f.hdr ? ` ${f.hdr}` : ''}`
        return (
          <button
            key={f.id}
            className={`frow ${on ? 'frow-on' : ''}`}
            role="option"
            aria-selected={on}
            onClick={() => onChoose({ type: 'format', formatId: f.id, kind: f.kind })}
          >
            <span className="mono">{f.id}</span>
            <span>{f.kind === 'av' ? 'Video + audio' : f.kind === 'video' ? 'Video only' : 'Audio only'}</span>
            <span>{quality}</span>
            <span className="dim">{[codec(f.vcodec), codec(f.acodec)].filter(Boolean).join(' + ')}</span>
            <span className="mono">{f.ext}</span>
            <span className="mono">{f.size ? bytes(f.size) : '—'}</span>
          </button>
        )
      })}
      <p className="ftable-note mono dim">Video-only formats are paired with the best audio automatically.</p>
    </div>
  )
}

function EntryList({ entries, picked, setPicked }) {
  const all = picked.size === entries.length
  const toggle = (url) =>
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  return (
    <div className="entries">
      <div className="entries-head">
        <span className="mono dim">
          {picked.size} of {entries.length} selected
        </span>
        <button
          className="link-btn mono"
          onClick={() => setPicked(all ? new Set() : new Set(entries.map((e) => e.url)))}
        >
          {all ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ol className="entry-list">
        {entries.map((e, i) => (
          <li key={e.url}>
            <label className="entry">
              <input type="checkbox" checked={picked.has(e.url)} onChange={() => toggle(e.url)} />
              <span className="mono dim entry-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="entry-title">{e.title}</span>
              <span className="mono dim">{duration(e.duration) || ''}</span>
            </label>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Toggle({ label, checked, disabled, onChange }) {
  return (
    <label className={`toggle ${disabled ? 'toggle-off' : ''}`}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  )
}
