# Solstice TV for LG webOS

An Apple TV–style IPTV client for LG smart TVs (webOS 3.0 and newer). Bring your own
Xtream Codes portal — the app adds the interface: Live TV with EPG and catch-up,
Movies, Series, TMDB/IMDb metadata, Multi-View and more.

> The app ships with **no content**. You need an Xtream Codes portal from your
> IPTV provider (server URL + username + password).

## Features

**Live TV**
- **Timeline TV guide** — channels down the left, time across the top, red now-line,
  on-now highlighting, past programs playable as catch-up, extendable time window
- Channel logo grid view (toggle with the Channels chip)
- Now/Next EPG in a preview panel; full XMLTV guide (`xmltv.php`, gzip via pako)
- Channel zapping (CH+/CH−, up/down, number keys), favorites (RED button)
- Catch-up: pick any past program in the guide (YELLOW) and play it (`?utc=…` retry)
- In-player channel sidebar with per-channel now-playing (OK button)

**Movies & Series (VOD)**
- Virtualized poster grids that stay smooth with 10 000+ titles
- Sort by recently added / name / rating; category chips; favorites filter
- Detail pages: backdrop, poster, cast, similar titles, trailer (YouTube)
- Series: season chips, per-episode stills/progress, watched checkmarks,
  *Play Next Unwatched*, next-episode autoplay with countdown
- Resume: continue watching across movies and episodes (auto mark-watched at 90 %)

**Metadata (IMDb etc.)**
- TMDB integration (free key): backdrops, posters, logo art, cast, similar, trailers
- OMDb integration (free key): real IMDb / Rotten Tomatoes / Metacritic badges
- OpenSubtitles integration (free key): subtitle search inside the player (SRT→VTT)
- All optional — without keys the app falls back to provider artwork + Xtream metadata

**Player**
- Prefers the webOS native media pipeline (hardware decode of HLS/TS), falls back
  to hls.js; automatic `.ts` ↔ `.m3u8` retry on stream errors
- Netflix-style controls: left/right scrubbing with acceleration, transport row
  (subtitles, next episode, quality/audio tracks), live EPG bar, stall watchdog
- Buffer target configurable, keep-screen-on while playing

**More**
- Multi-View: up to 4 live channels at once, audio follows the highlighted tile (BLUE)
- Multi-profile support with per-profile favorites/history/progress
- Parental control: PIN gate on launch, hide adult categories
- Settings: playback, EPG timezone offset, appearance (accent color, ambient light),
  cache management, on-screen diagnostics with an error log
- **Edit on Mobile**: Settings shows a QR code — scan it with an iPhone on the same WiFi
  to edit settings from a companion web page; changes apply to the TV live (accent,
  playback, EPG offset, API keys, parental toggles). Requires the app to be served over
  the LAN via the bundled sync server (`npm run serve`); on packaged installs the pane
  explains this.
- **Demo Mode** — explore the full UI with a fictional provider and test streams,
  no credentials needed (also works in a desktop browser)

## Install

### Option A — webOS Homebrew Channel (rooted TVs)
1. Install the [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).
2. Grab `dist/com.stewart.solstice_1.0.0_all.ipk` and sideload it through the
   Homebrew Channel's device manager (`webosbrew dev-manager` → Device → Package install),
   or host it in your own repo using `webosbrew/manifest.json` as a template.

### Option B — Developer Mode (no root)
1. Install LG's **Developer Mode** app from the Content Store on the TV, enable it
   and the key server (TV must stay in Developer Mode for sideloaded apps to run).
2. On your Mac: `npm install` once, then put the TV's IP in `~/.weboswebos/`
   config via `ares-setup-device` (or use the LG **Dev Manager** desktop app / VS Code extension).
3. Package & install:
   ```bash
   npm run package          # creates dist/com.stewart.solstice_1.0.0_all.ipk
   npm run install:tv       # ares-install (needs Dev Mode pairing)
   ```

### Desktop preview (no TV required)
```bash
npm run serve              # http://localhost:8642 → click "Explore Demo Mode"
```
This starts the bundled sync server (stdlib Python) which serves the app over your LAN
*and* relays settings for the mobile companion. Open `http://<mac-ip>:8642` on the TV-side,
then Settings → Edit on Mobile → scan the QR with an iPhone on the same WiFi.

Real portals can't be reached from a desktop browser (CORS); installed webOS apps
are not subject to it. Demo mode covers full UI testing on the desktop.

## Getting free API keys
| Key | Get it at | Unlocks |
|---|---|---|
| TMDB v3 | https://www.themoviedb.org/settings/api | Artwork, cast, similar, trailers |
| OMDb | https://www.omdbapi.com/apikey.aspx | IMDb / Rotten Tomatoes / Metacritic badges |
| OpenSubtitles | https://www.opensubtitles.com/en/consumers | Subtitle search in the player |

Enter them under **Settings → Integrations**.

## Project layout
```
app/
  appinfo.json          webOS app manifest
  index.html            script order matters (classic ES5, no build step)
  styles/app.css        Apple TV-style theme (1920×1080 design space)
  vendor/               hls.light.min.js, pako.min.js
  js/
    polyfills.js        Chromium 38 shims + XHR net layer
    util.js store.js idb.js
    xtream.js           Xtream Codes client (+catalog cache)
    metadata.js         TMDB / OMDb / OpenSubtitles
    epg.js              short EPG + full XMLTV guide
    focus.js            spatial navigation engine (D-pad)
    ui.js               cards, rows, virtual grid, modals, keyboard, PIN pad
    player.js           playback engine + overlay
    demo.js             demo provider
    app.js              shell: tabs, router, key routing, ambient light
    screens/            login, home, live, browse, detail, search, settings, multiview
scripts/gen_icons.py   regenerates icons/splash (pure Python, no deps)
dist/                  packaged .ipk
```

## Remote control map
| Key | Action |
|---|---|
| D-pad / OK | Navigate / select (Netflix-style seeking inside the player) |
| BACK | Back / close / exit |
| RED | Toggle favorites filter (Live TV) |
| YELLOW | Jump to now in the guide / channel guide (Live TV) |
| BLUE | Multi-View |
| 0–9 | Direct channel entry |
| CH+/− | Zap channels (also up/down while controls hidden) |
| Play/Pause/FF/RW | Transport |

## Notes & limits
- The TV must remain in Developer Mode for sideloaded apps (LG restriction), unless
  you're rooted with the Homebrew Channel.
- `preferNative` (default on) uses webOS' hardware pipeline; software hls.js is the
  fallback and the desktop path.
- Episodes/providers vary: if a stream fails, the player retries the alternate
  container (m3u8 ↔ ts / mp4 ↔ mkv) automatically before showing an error.
