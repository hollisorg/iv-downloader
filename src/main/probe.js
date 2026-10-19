// Read a link's metadata (title, formats, playlist entries) without downloading anything.
import { runYtdlp, lastError } from './engine'

export function validateUrl(raw) {
  let url
  try {
    url = new URL(String(raw).trim())
  } catch {
    throw new Error('That does not look like a link')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https links are supported')
  }
  return url.toString()
}

function slimFormat(f) {
  const hasVideo = f.vcodec && f.vcodec !== 'none'
  const hasAudio = f.acodec && f.acodec !== 'none'
  return {
    id: f.format_id,
    ext: f.ext,
    kind: hasVideo && hasAudio ? 'av' : hasVideo ? 'video' : hasAudio ? 'audio' : 'other',
    width: f.width ?? null,
    height: f.height ?? null,
    fps: f.fps ?? null,
    vcodec: hasVideo ? f.vcodec : null,
    acodec: hasAudio ? f.acodec : null,
    abr: f.abr ?? null,
    tbr: f.tbr ?? null,
    hdr: f.dynamic_range && f.dynamic_range !== 'SDR' ? f.dynamic_range : null,
    size: f.filesize ?? f.filesize_approx ?? null,
    note: f.format_note ?? null,
    protocol: f.protocol ?? null
  }
}

function pickThumb(info) {
  if (info.thumbnail) return info.thumbnail
  const thumbs = (info.thumbnails || []).filter((t) => t.url)
  return thumbs.at(-1)?.url ?? null
}

export async function probe(rawUrl, extraArgs = []) {
  const url = validateUrl(rawUrl)
  const { code, stdout, stderr } = await runYtdlp([
    '-J',
    '--flat-playlist',
    '--no-warnings',
    ...extraArgs,
    '--',
    url
  ]).done
  if (code !== 0) throw new Error(lastError(stderr))

  const info = JSON.parse(stdout)
  const isPlaylist = info._type === 'playlist' || Array.isArray(info.entries)

  if (isPlaylist) {
    const entries = (info.entries || [])
      .filter((e) => e && (e.url || e.webpage_url))
      .map((e) => ({
        id: e.id,
        title: e.title || e.id || 'Untitled',
        url: e.webpage_url || e.url,
        duration: e.duration ?? null,
        thumbnail: pickThumb(e)
      }))
    return {
      kind: 'playlist',
      url,
      title: info.title || 'Playlist',
      uploader: info.uploader || info.channel || null,
      extractor: info.extractor_key || info.extractor || null,
      thumbnail: pickThumb(info) || entries[0]?.thumbnail || null,
      entries
    }
  }

  const formats = (info.formats || [])
    .filter((f) => f.format_id && !String(f.format_note || '').includes('storyboard'))
    .map(slimFormat)
    .filter((f) => f.kind !== 'other')

  return {
    kind: 'video',
    url: info.webpage_url || url,
    id: info.id,
    title: info.title || 'Untitled',
    uploader: info.uploader || info.channel || null,
    extractor: info.extractor_key || info.extractor || null,
    duration: info.duration ?? null,
    thumbnail: pickThumb(info),
    isLive: Boolean(info.is_live),
    maxHeight: Math.max(0, ...formats.map((f) => f.height || 0)),
    hasSubtitles: Object.keys(info.subtitles || {}).length > 0,
    formats
  }
}
