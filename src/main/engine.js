// Engine = the external tools that do the real work:
//   yt-dlp  - downloaded from the official GitHub release, SHA-256 verified, kept in userData/bin
//   ffmpeg  - ffmpeg + ffprobe bundled via ffmpeg-ffprobe-static (merging, audio, embedding)
//   deno    - bundled via the official `deno` npm package (YouTube JS challenges)
import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const nodeRequire = createRequire(__filename)

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'

const ASSET_BY_PLATFORM = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos',
  linux: 'yt-dlp_linux'
}

// Paths inside app.asar cannot be executed; packaged builds unpack binaries next to it.
const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)

export function binDir() {
  return path.join(app.getPath('userData'), 'bin')
}

export function ytdlpPath() {
  return path.join(binDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

// yt-dlp looks for ffprobe next to ffmpeg, so hand it the directory holding both.
export function ffmpegDir() {
  const { ffmpegPath, ffprobePath } = nodeRequire('ffmpeg-ffprobe-static')
  if (!ffmpegPath || !ffprobePath) return null
  if (!fs.existsSync(unpacked(ffmpegPath)) || !fs.existsSync(unpacked(ffprobePath))) return null
  return path.dirname(unpacked(ffmpegPath))
}

export function denoPath() {
  const key = {
    'win32-x64': 'win32-x64',
    'win32-arm64': 'win32-arm64',
    'darwin-x64': 'darwin-x64',
    'darwin-arm64': 'darwin-arm64',
    'linux-x64': 'linux-x64-glibc',
    'linux-arm64': 'linux-arm64-glibc'
  }[`${process.platform}-${process.arch}`]
  if (!key) return null
  try {
    const dir = path.dirname(nodeRequire.resolve(`@deno/${key}/package.json`))
    const exe = path.join(dir, process.platform === 'win32' ? 'deno.exe' : 'deno')
    return fs.existsSync(unpacked(exe)) ? unpacked(exe) : null
  } catch {
    return null
  }
}

// Arguments every yt-dlp call gets: ignore any user config so behaviour is predictable,
// and point it at the bundled ffmpeg + deno.
export function baseArgs() {
  const args = ['--ignore-config', '--no-color', '--encoding', 'utf-8']
  const ff = ffmpegDir()
  if (ff) args.push('--ffmpeg-location', ff)
  const deno = denoPath()
  if (deno) args.push('--js-runtimes', `deno:${deno}`)
  return args
}

export function runYtdlp(args, { onLine, signal } = {}) {
  const child = spawn(ytdlpPath(), [...baseArgs(), ...args], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  })
  if (signal) signal.addEventListener('abort', () => killTree(child), { once: true })
  let stdout = ''
  let stderr = ''
  let partial = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    if (!onLine) {
      stdout += chunk
      return
    }
    partial += chunk
    const lines = partial.split(/\r?\n/)
    partial = lines.pop()
    for (const line of lines) onLine(line)
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    if (stderr.length > 64_000) stderr = stderr.slice(-32_000)
  })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (onLine && partial) onLine(partial)
      resolve({ code, stdout, stderr })
    })
  })
  return { child, done }
}

// yt-dlp spawns ffmpeg; on Windows a plain kill leaves it running.
export function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}

export function lastError(stderr) {
  const lines = stderr.split(/\r?\n/).filter(Boolean)
  const err = [...lines].reverse().find((l) => l.startsWith('ERROR:'))
  return (err || lines.at(-1) || 'yt-dlp failed')
    .replace(/^ERROR:\s*/, '')
    .replace(/^\[[^\]]+\]\s*[^\s:]+:\s*/, '') // "[youtube] abc123: " prefix
    .replace(/\s*\(caused by .*\)$/, '')
}

export async function installedVersion() {
  if (!fs.existsSync(ytdlpPath())) return null
  try {
    const { code, stdout } = await runYtdlp(['--version']).done
    return code === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

async function fetchOk(url, opts) {
  const res = await net.fetch(url, opts)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res
}

// Download the latest official yt-dlp build, verify it against the release's
// SHA2-256SUMS, and swap it in atomically. Skips the download when already current.
// Returns the installed version tag.
export async function installLatest(onProgress = () => {}, currentVersion = null) {
  const assetName = ASSET_BY_PLATFORM[process.platform]
  if (!assetName) throw new Error(`No yt-dlp build for ${process.platform}`)

  onProgress({ phase: 'checking', percent: 0 })
  const release = await (
    await fetchOk(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  ).json()
  if (currentVersion && currentVersion === release.tag_name) {
    onProgress({ phase: 'done', percent: 100 })
    return release.tag_name
  }
  const asset = release.assets.find((a) => a.name === assetName)
  const sums = release.assets.find((a) => a.name === 'SHA2-256SUMS')
  if (!asset || !sums) throw new Error('Release is missing the expected files')

  const sumsText = await (await fetchOk(sums.browser_download_url)).text()
  const expected = sumsText
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .find(([, name]) => name === assetName)?.[0]
  if (!expected) throw new Error(`No checksum listed for ${assetName}`)

  const res = await fetchOk(asset.browser_download_url)
  const total = Number(res.headers.get('content-length')) || asset.size || 0
  const hash = createHash('sha256')
  const chunks = []
  let received = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    hash.update(value)
    chunks.push(value)
    received += value.length
    onProgress({ phase: 'downloading', percent: total ? (received / total) * 100 : 0 })
  }

  const actual = hash.digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('Downloaded yt-dlp failed its checksum; nothing was installed')
  }

  fs.mkdirSync(binDir(), { recursive: true })
  const tmp = `${ytdlpPath()}.download`
  fs.writeFileSync(tmp, Buffer.concat(chunks), { mode: 0o755 })
  fs.renameSync(tmp, ytdlpPath())
  onProgress({ phase: 'done', percent: 100 })
  return release.tag_name
}
