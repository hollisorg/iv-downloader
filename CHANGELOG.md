# Changelog

## Unreleased

- New: macOS app for Apple Silicon and Intel Macs (macOS 12 or later). It isn't signed with an Apple
  Developer ID yet, so macOS asks you to approve it once, and new versions are offered as a download
  link rather than installed automatically.
- New: Safari sign-in on macOS.
- The engine install no longer fails when GitHub's API limit is reached on a busy shared network;
  it falls back to GitHub's plain download links.
- Fixed: a narrow window showed a sideways scrollbar.
- Fixed (macOS): cancelling a download now also stops the ffmpeg step behind it.

## 0.1.2 (2026-10-19, unsigned test release)

- Fixed: Windows showed a blank app icon. The icon is now a classic Windows .ico that Explorer can read.

## 0.1.1 (2026-10-19, unsigned test release)

- New Infinite Variance app icon.
- The release workflow creates the draft before uploading, so every installer file lands in one release.

## 0.1.0 (2026-10-19, unsigned test release)

First release of IV Downloader, the Infinite Variance video downloader.

- Paste a link from YouTube, Vimeo, X, TikTok, Instagram and the other sites yt-dlp supports.
- Pick a format: Best quality, 2160p–360p, MP3, M4A or any specific stream. Video prefers H.264 MP4
  so it opens in editors like Premiere.
- Download whole playlists or channels, choosing which videos to include.
- Download queue with progress, cancel, retry and show in folder; it's saved and resumes after a restart.
- Optional sign-in through Firefox, Chrome, Edge, Brave, Opera, Vivaldi or a cookies.txt file, for
  private and members-only videos.
- Embedded subtitles, thumbnails and metadata.
- yt-dlp is downloaded from its official release and verified; **Update engine** keeps it current.
- The app updates itself from GitHub Releases.
