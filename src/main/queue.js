// Download queue: runs up to `concurrency` yt-dlp processes, reports progress,
// and saves itself to disk so the list survives restarts.
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { runYtdlp, killTree, lastError } from './engine'
import { argsForChoice, describeChoice } from './formats'
import { validateUrl } from './probe'

const PROGRESS = 'IVPROG '
const POSTPROC = 'IVPOST '
const FILE = 'IVFILE '

const MAX_SAVED = 500
const STATUSES = ['queued', 'downloading', 'processing', 'done', 'error', 'canceled']

export class DownloadQueue extends EventEmitter {
  constructor({ getSettings, extraArgs = () => [], storePath }) {
    super()
    this.items = []
    this.running = new Map() // id -> { child, controller }
    this.getSettings = getSettings
    this.extraArgs = extraArgs
    this.storePath = storePath
    this.ready = false // set once the engine is installed
    this.emitTimer = null
    this.saveTimer = null
  }

  snapshot() {
    return this.items.map(({ choice, options, ...item }) => item)
  }

  // Coalesce progress updates so the renderer gets at most ~8 per second.
  changed(immediate = false) {
    this.scheduleSave()
    if (immediate) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
      this.emit('change', this.snapshot())
      return
    }
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('change', this.snapshot())
    }, 125)
  }

  // ---------- persistence ----------

  scheduleSave() {
    if (!this.storePath || this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 800)
  }

  save() {
    if (!this.storePath) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    const items = this.items.slice(-MAX_SAVED).map((i) => ({ ...i, progress: null }))
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true })
      const tmp = `${this.storePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }))
      fs.renameSync(tmp, this.storePath)
    } catch (err) {
      console.error('Could not save queue:', err)
    }
  }

  load() {
    if (!this.storePath) return
    let data
    try {
      data = JSON.parse(fs.readFileSync(this.storePath, 'utf8'))
    } catch {
      return // first run, or unreadable: start empty
    }
    for (const raw of Array.isArray(data?.items) ? data.items : []) {
      try {
        const item = {
          id: typeof raw.id === 'string' ? raw.id : randomUUID(),
          url: validateUrl(raw.url),
          title: String(raw.title || raw.url).slice(0, 300),
          thumbnail: typeof raw.thumbnail === 'string' ? raw.thumbnail : null,
          choice: raw.choice,
          options: raw.options || {},
          label: describeChoice(raw.choice),
          outDir: String(raw.outDir),
          status: STATUSES.includes(raw.status) ? raw.status : 'error',
          stage: null,
          part: 0,
          progress: null,
          filepath: typeof raw.filepath === 'string' ? raw.filepath : null,
          size: Number.isFinite(raw.size) ? raw.size : null,
          error: typeof raw.error === 'string' ? raw.error : null,
          resumed: false,
          addedAt: Number(raw.addedAt) || Date.now()
        }
        argsForChoice(item.choice, item.options) // drop entries this version can't run
        if (!path.isAbsolute(item.outDir)) continue
        // Anything mid-download when the app closed picks up where it left off (.part files resume).
        if (item.status === 'downloading' || item.status === 'processing') {
          item.status = 'queued'
          item.resumed = true
        }
        if (item.status === 'done') item.progress = { percent: 100 }
        this.items.push(item)
      } catch {
        /* skip malformed entry */
      }
    }
  }

  // ---------- queue ----------

  add(requests) {
    const settings = this.getSettings()
    for (const req of requests) {
      const url = validateUrl(req.url)
      const options = { subtitles: Boolean(req.options?.subtitles), embedMeta: Boolean(req.options?.embedMeta) }
      argsForChoice(req.choice, options) // throws on a bad choice before anything is queued
      this.items.push({
        id: randomUUID(),
        url,
        title: String(req.title || url).slice(0, 300),
        thumbnail: typeof req.thumbnail === 'string' ? req.thumbnail : null,
        choice: req.choice,
        options,
        label: describeChoice(req.choice),
        outDir: settings.downloadDir,
        status: 'queued',
        stage: null,
        part: 0,
        progress: null,
        filepath: null,
        size: null,
        error: null,
        resumed: false,
        addedAt: Date.now()
      })
    }
    this.changed(true)
    this.pump()
  }

  setReady(ready) {
    this.ready = ready
    if (ready) this.pump()
  }

  pump() {
    if (!this.ready) return
    const { concurrency } = this.getSettings()
    for (const item of this.items) {
      if (this.running.size >= concurrency) break
      if (item.status === 'queued') this.start(item)
    }
  }

  start(item) {
    item.status = 'downloading'
    item.stage = 'Starting'
    item.part = 0
    item.progress = null
    item.error = null
    const controller = new AbortController()

    let args
    try {
      args = [
        ...argsForChoice(item.choice, item.options),
        ...this.extraArgs(),
        '--newline',
        '--progress',
        '--no-warnings',
        '--progress-template', `download:${PROGRESS}%(progress)j`,
        '--progress-template', `postprocess:${POSTPROC}%(progress)j`,
        '--print', `after_move:${FILE}%(filepath)s`,
        '--no-mtime',
        '-P', item.outDir,
        '-o', '%(title).150B [%(id)s].%(ext)s',
        '--',
        item.url
      ]
    } catch (err) {
      item.status = 'error'
      item.stage = null
      item.error = err.message
      this.changed(true)
      return
    }

    const { child, done } = runYtdlp(args, {
      signal: controller.signal,
      onLine: (line) => this.onLine(item, line)
    })
    this.running.set(item.id, { child, controller })
    this.changed(true)

    done
      .then(({ code, stderr }) => {
        // A cancel that lands after yt-dlp already finished still leaves a complete file.
        if (code === 0) {
          item.status = 'done'
          item.stage = 'Saved'
          item.resumed = false
          item.progress = { ...(item.progress || {}), percent: 100 }
          // Progress totals are per stream; report the size of the finished file instead.
          try {
            if (item.filepath) item.size = fs.statSync(item.filepath).size
          } catch {
            /* file moved or renamed */
          }
        } else if (item.status !== 'canceled') {
          item.status = 'error'
          item.stage = null
          item.error = lastError(stderr)
        }
      })
      .catch((err) => {
        item.status = 'error'
        item.error = err.message
      })
      .finally(() => {
        this.running.delete(item.id)
        this.changed(true)
        this.pump()
      })
  }

  onLine(item, line) {
    if (line.startsWith(PROGRESS)) {
      let p
      try {
        p = JSON.parse(line.slice(PROGRESS.length))
      } catch {
        return
      }
      const total = p.total_bytes || p.total_bytes_estimate || null
      // Separate video and audio streams are downloaded one after another.
      if (p.status === 'downloading' && item.stage !== 'Downloading') {
        item.part += 1
        item.stage = 'Downloading'
      }
      item.progress = {
        percent: total ? Math.min(100, (p.downloaded_bytes / total) * 100) : null,
        downloaded: p.downloaded_bytes ?? null,
        total,
        speed: p.speed ?? null,
        eta: p.eta ?? null
      }
      if (p.status === 'finished') item.stage = 'Downloaded'
      this.changed()
    } else if (line.startsWith(POSTPROC)) {
      try {
        const p = JSON.parse(line.slice(POSTPROC.length))
        item.status = 'processing'
        item.stage = postprocessorLabel(p.postprocessor)
        this.changed()
      } catch {
        /* ignore */
      }
    } else if (line.startsWith(FILE)) {
      item.filepath = path.normalize(line.slice(FILE.length).trim())
      this.changed()
    }
  }

  cancel(id) {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    if (item.status === 'queued') {
      item.status = 'canceled'
    } else if (item.status === 'downloading' || item.status === 'processing') {
      item.status = 'canceled'
      const run = this.running.get(id)
      if (run) killTree(run.child)
    }
    item.stage = null
    item.resumed = false
    this.changed(true)
  }

  retry(id) {
    const item = this.items.find((i) => i.id === id)
    if (!item || !['error', 'canceled'].includes(item.status)) return
    item.status = 'queued'
    item.error = null
    item.outDir = this.getSettings().downloadDir
    this.changed(true)
    this.pump()
  }

  remove(id) {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    if (this.running.has(id)) this.cancel(id)
    this.items = this.items.filter((i) => i.id !== id)
    this.changed(true)
  }

  clearFinished() {
    this.items = this.items.filter((i) => !['done', 'canceled', 'error'].includes(i.status))
    this.changed(true)
  }

  // On quit: save the list as it is (running items stay "downloading" so they resume),
  // then stop the processes.
  shutdown() {
    this.save()
    for (const { child } of this.running.values()) killTree(child)
  }
}

function postprocessorLabel(name = '') {
  if (/Merger/i.test(name)) return 'Merging'
  if (/ExtractAudio/i.test(name)) return 'Converting audio'
  if (/EmbedThumbnail/i.test(name)) return 'Embedding thumbnail'
  if (/Metadata/i.test(name)) return 'Writing metadata'
  if (/EmbedSubtitle/i.test(name)) return 'Embedding subtitles'
  if (/MoveFiles/i.test(name)) return 'Finishing'
  return 'Processing'
}
