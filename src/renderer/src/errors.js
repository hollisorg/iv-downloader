// Turn yt-dlp's error text into a plain-language title and next step.
// The raw message is kept as `detail` for anyone who wants it.

const SITES = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'vimeo.com': 'Vimeo',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',
  'x.com': 'X',
  'twitter.com': 'X',
  'twitch.tv': 'Twitch',
  'patreon.com': 'Patreon',
  'reddit.com': 'Reddit'
}

export function siteName(url) {
  try {
    const host = new URL(url).hostname.replace(/^(www|m|player|music)\./, '')
    return SITES[host] || host
  } catch {
    return 'this site'
  }
}

export function stripIpc(err) {
  return String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

// kind 'login' gets a sign-in action in the UI; everything else is advice only.
export function explain(message, url) {
  const site = siteName(url)
  const m = String(message)
  const rule = (kind, title, body) => ({ kind, title, body, detail: m })

  if (/sign in|log ?in|logged-in|private video|members[- ]only|join this channel|age[- ](restricted|gated)|confirm your age|inappropriate|cookies|account credentials/i.test(m)) {
    return rule('login', `${site} wants you signed in for this one.`,
      `Log in to ${site} in your web browser, then let IV Downloader borrow that login. Your password never leaves your computer.`)
  }
  if (/unsupported url|no suitable extractor|not a valid url|does not look like a link|only http/i.test(m)) {
    return rule('link', 'That link isn’t a video we can read.',
      'Copy the link from the video’s own page (or its Share button) and paste it again.')
  }
  if (/not available in your country|geo[- ]?restrict|blocked in your/i.test(m)) {
    return rule('geo', `${site} doesn’t show this video in your country.`, 'There’s nothing to fix on your side. Try a different video.')
  }
  if (/\b429\b|too many requests|rate[- ]limit/i.test(m)) {
    return rule('busy', `${site} says you’re going too fast.`, 'Wait a few minutes, then try again. Fewer downloads at once helps.')
  }
  if (/premieres? in|live event will begin|this live event|is_upcoming/i.test(m)) {
    return rule('soon', 'This video hasn’t started yet.', 'Come back once it’s live or finished.')
  }
  if (/\b404\b|unavailable|has been removed|does not exist|no longer available|not found|deleted/i.test(m)) {
    return rule('gone', 'This video is gone or set to private.', `Check the link opens in your browser. If ${site} makes you log in to watch it, set Sign-in in the queue panel to that browser and try again.`)
  }
  if (/getaddrinfo|timed out|timeout|connection|network|unable to download webpage|ssl/i.test(m)) {
    return rule('network', `Can’t reach ${site} right now.`, 'Check your internet connection, then try again.')
  }
  if (/drm/i.test(m)) {
    return rule('drm', 'This video is copy-protected (DRM).', 'IV Downloader can’t save protected streams.')
  }
  return rule('other', 'Something went wrong reading that link.', 'Try again in a moment. If it keeps happening, update the engine at the bottom of the window.')
}
