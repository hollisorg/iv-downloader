// Launches a packaged build with a debug port and drives it through window.iv:
// bundled tools present, yt-dlp installs, a link probes, and a real download lands on disk.
// Usage: node scripts/smoke-test.mjs "<path to app executable>" [screenshot.png]
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const [exe, shotPath] = process.argv.slice(2)
if (!exe) throw new Error('Pass the app executable path')

const PORT = 9333
// A small Blender open-movie trailer (CC BY) served directly, so the test doesn't depend on
// YouTube letting CI runners in.
const CLIP = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = spawn(exe, [`--remote-debugging-port=${PORT}`], { stdio: 'inherit' })
let failed = false

try {
  let page
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(1000)
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      page = targets.find((t) => t.type === 'page')
    } catch {
      /* not up yet */
    }
  }
  if (!page) throw new Error('App window never appeared')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.addEventListener('open', r)
    ws.addEventListener('error', j)
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const run = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'eval failed')
    return res.result.result.value
  }
  const check = (ok, what) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
    if (!ok) failed = true
  }

  await sleep(2000)
  check((await run('window.iv.platform')) === process.platform, `platform is ${process.platform}`)

  const status = await run('window.iv.engine.install()')
  console.log('engine:', JSON.stringify(status))
  check(Boolean(status.ytdlp), 'yt-dlp installed and runs')
  check(status.ffmpeg, 'bundled ffmpeg + ffprobe found')
  check(status.deno, 'bundled deno found')

  const info = await run(`window.iv.probe(${JSON.stringify(CLIP)})`)
  check(Boolean(info?.title), `probe read "${info?.title}"`)

  try {
    const yt = await run(`window.iv.probe('https://www.youtube.com/watch?v=aqz-KE-bpKQ')`)
    console.log(`INFO  YouTube probe: ${yt.title} (${yt.formats.length} formats)`)
  } catch (err) {
    console.log(`INFO  YouTube probe failed (CI runners are often blocked): ${err.message.split('\n')[0]}`)
  }

  await run(
    `window.iv.queue.add([{ url: ${JSON.stringify(CLIP)}, title: 'Smoke test', thumbnail: null,` +
      ` choice: { type: 'preset', preset: 'best' }, options: { subtitles: false, embedMeta: true } }])`
  )
  let item
  for (let i = 0; i < 180; i++) {
    await sleep(1000)
    item = (await run('window.iv.queue.list()')).at(-1)
    if (['done', 'error', 'canceled'].includes(item?.status)) break
  }
  console.log('download:', item?.status, item?.filepath, item?.error ?? '')
  check(item?.status === 'done' && fs.existsSync(item.filepath) && fs.statSync(item.filepath).size > 1e6, 'clip downloaded and merged')

  if (shotPath) {
    const res = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(shotPath, Buffer.from(res.result.data, 'base64'))
    console.log('screenshot:', shotPath)
  }
  ws.close()
} catch (err) {
  console.log('FAIL ', err.message)
  failed = true
} finally {
  app.kill()
}

process.exit(failed ? 1 : 0)
