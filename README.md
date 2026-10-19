# IV Downloader

An Infinite Variance desktop app for saving videos and audio from YouTube, Vimeo, X, TikTok,
Instagram and the other sites [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports.

It replaces iTubeGo, which turned out to be a Qt shell around yt-dlp + Deno + ffmpeg. This app uses
the same open-source engine directly and keeps it current with one click, which is what iTubeGo
stopped doing.

## Run it

```bash
npm install
npm run dev
```

Run these from your own terminal. Apps started from the Claude desktop app's shell have their
AppData redirected into Claude's package folder.

On first launch the app downloads the latest official `yt-dlp.exe` from GitHub (about 18 MB),
checks it against the release's `SHA2-256SUMS` and keeps it in `%APPDATA%\IV Downloader\bin`.
**Update engine** in the status bar repeats that check and only downloads when a newer release exists.

## What's in it

- **Paste a link**: Fetch reads the title, thumbnail and formats without downloading anything.
  A link already on the clipboard is offered as a one-click chip.
- **Format picker**: Best, 2160p–360p (only the heights the video has), MP3 and M4A presets, plus
  every raw format. Video presets prefer H.264/MP4 at the chosen height so files drop straight into
  Premiere. Toggles embed English subtitles and the thumbnail and metadata.
- **Playlists and channels**: choose which entries to queue. Lists of 50 or fewer start fully selected.
- **Queue**: 1–5 downloads at once, live progress/speed/ETA, merge/convert stages, cancel, retry,
  play and show in folder. Saves to `Downloads\IV Downloads` by default.
- **Queue survives restarts**: the list is saved to `%APPDATA%\IV Downloader\queue.json`. Anything
  that was downloading when the app closed shows as "Resuming" and continues from its `.part` file.
- **Sign-in** (queue panel): lets yt-dlp use an existing login for private, age-restricted or
  members-only videos, either from a browser (Firefox is the most reliable; Chrome and Edge lock and
  encrypt their cookies) or from a `cookies.txt` file. Cookies are read locally by yt-dlp and never
  stored or sent anywhere by the app.

## Build the installer

```bash
npm run dist
```

This writes `dist\IV-Downloader-Setup-<version>.exe`, a per-user NSIS installer (no admin needed,
install folder can be changed, Start menu + desktop shortcuts). ffmpeg/ffprobe and Deno are unpacked
next to `app.asar`; yt-dlp is fetched on first run. The installer is about 210 MB, mostly ffmpeg,
ffprobe and Deno.

Before sharing it:

- **Code signing.** The installer is unsigned, so Windows SmartScreen will show "Windows protected
  your PC" (people click *More info → Run anyway*). Signing removes that. Azure Trusted Signing is the
  cheapest route; set it up in electron-builder's `win.azureSignOptions` once you have an account.
- **Licences.** `THIRD_PARTY_NOTICES.txt` and `build/licenses/` ship in the installer and open from
  **Licenses** in the status bar. The bundled ffmpeg is a GPLv3 build; the notices link its exact
  source. Keep that link valid (or host the matching source tarball yourself) for as long as you
  distribute this build.
- **Usage note.** The status bar reminds people to download only what they have the right to.

## Layout

```
src/main/engine.js    yt-dlp install/verify/update, bundled ffmpeg+ffprobe and deno paths, process runner
src/main/probe.js     link metadata (yt-dlp -J --flat-playlist)
src/main/formats.js   picker choice -> yt-dlp arguments (built only in the main process)
src/main/queue.js     download queue, progress parsing, cancel (kills ffmpeg too), save/resume
src/main/index.js     window, settings (incl. sign-in), IPC
build/                app icon (icon.svg -> icon.png) and bundled licence texts
src/preload/index.js  window.iv API exposed to the UI
src/renderer/src/     React UI (Infinite Variance palette: ink, paper, pink, red; Barlow, DM Sans, JetBrains Mono)
```

The renderer is sandboxed with context isolation and never builds command lines. It sends a format
choice, and the main process turns that choice into yt-dlp arguments. URLs must be http(s) and are
passed after `--`.

## Not supported

DRM-protected streaming services (Netflix, Prime Video, Disney+, Spotify and similar). iTubeGo ships
Widevine-stripping tools for those; this app does not, and won't.

## Not done yet

- Code signing (needs a certificate or Azure Trusted Signing account).
- Auto-updates for the app itself (electron-updater + GitHub Releases or another host). Updating
  yt-dlp already works in-app.
- macOS/Linux builds.
