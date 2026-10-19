// Turn a choice from the format picker into yt-dlp arguments.
// The renderer only sends a choice description; arguments are always built here.

const HEIGHTS = [2160, 1440, 1080, 720, 480, 360]

export function describeChoice(choice) {
  if (choice.type === 'format') return `Format ${choice.formatId}`
  if (choice.preset === 'best') return 'Best video'
  if (choice.preset === 'mp3') return 'Audio · MP3'
  if (choice.preset === 'm4a') return 'Audio · M4A'
  const h = Number(String(choice.preset).replace(/^h/, ''))
  return `${h}p video`
}

export function argsForChoice(choice, options = {}) {
  const args = []
  let audioOnly = false

  if (choice.type === 'format') {
    if (!/^[\w.+-]{1,64}$/.test(String(choice.formatId))) throw new Error('Bad format id')
    const id = choice.formatId
    if (choice.kind === 'video') {
      // Video-only stream: pair it with the best audio, keeping mp4 when the codecs allow.
      args.push('-f', `${id}+ba/${id}`, '--merge-output-format', 'mp4/mkv')
    } else if (choice.kind === 'audio') {
      args.push('-f', id)
      audioOnly = true
    } else {
      args.push('-f', id)
    }
  } else if (choice.preset === 'best') {
    // Highest resolution first; at equal resolution prefer H.264 + mp4/m4a so files open in editors like Premiere.
    args.push('-f', 'bv*+ba/b', '-S', 'res,vcodec:h264,ext:mp4:m4a', '--merge-output-format', 'mp4/mkv')
  } else if (choice.preset === 'mp3') {
    args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0')
    audioOnly = true
  } else if (choice.preset === 'm4a') {
    args.push('-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a')
    audioOnly = true
  } else {
    const h = Number(String(choice.preset).replace(/^h/, ''))
    if (!HEIGHTS.includes(h)) throw new Error('Unknown preset')
    // Prefer the tallest stream at or under h, then H.264 + mp4/m4a so the result plays everywhere.
    args.push('-f', 'bv*+ba/b', '-S', `res:${h},vcodec:h264,ext:mp4:m4a`, '--merge-output-format', 'mp4/mkv')
  }

  if (options.subtitles && !audioOnly) {
    // --embed-subs on its own fetches the subtitles and removes the loose file after embedding.
    args.push('--sub-langs', 'en.*,en', '--embed-subs')
  }
  if (options.embedMeta) {
    args.push('--embed-metadata', '--embed-thumbnail')
  }
  return args
}
