# yt-playlist-tierlist

Rank the videos of a YouTube playlist into tiers (S/A/B/C/D/F).

Point it at a playlist, and it pulls in every video with its title, channel,
thumbnail and duration. **Browse** is the library: filter by tier, search, sort,
shuffle, and rate any card in place. **Rate** is the focused loop — the video
plays, you press a key, the next one starts. Ratings persist in the browser and
can be exported to a JSON file and restored on another device.

The app is a pure client-side SPA: no server, no account, no database. Your API
key and your ratings never leave the browser, and it installs as a PWA on
desktop and phone.

## Getting a YouTube Data API key

Importing a playlist calls the YouTube Data API v3, which needs your own key.
It is free, takes a few minutes and does not require billing.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create
   a project (or pick an existing one).
2. Go to **APIs & Services → Library**, search for **YouTube Data API v3** and
   press **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key** and
   copy the key.
4. Press **Restrict key** and, under **Application restrictions**, choose
   **Websites** (HTTP referrers). Add the origins you serve the app from — e.g.
   `http://localhost:5173/*` for development and `https://your-host/*` for the
   deployed copy. Under **API restrictions**, restrict the key to
   **YouTube Data API v3**.
5. Paste the key into the import dialog on the Browse page. It is stored under
   `ytpt:v1:settings` in your browser and sent only to `googleapis.com`.

A referrer-restricted key is visible to anyone using the app — that is inherent
to a browser-only app, and the restriction is what keeps it from being usable
elsewhere. Importing a playlist of _n_ videos costs roughly `1 + ceil(n/50) * 2`
quota units against the default 10 000 units per day, so several hundred imports
a day fit comfortably.

A `quotaExceeded`, `keyInvalid` or `playlistNotFound` answer is reported in the
dialog in plain words; nothing else in the app needs the API, so an existing
library keeps working without a key.

## Commands

```bash
npm install         # install dependencies
npm run dev         # dev server on http://localhost:5173
npm run build       # static build into build/ (index.html + _app/)
npm run preview     # serve the production build locally
npm run check       # svelte-check (JSDoc types)
npm run lint        # prettier --check + eslint
npm run format      # prettier --write
npm test            # vitest run
npm run test:watch  # vitest in watch mode
npm run icons       # re-rasterize the app icons into static/ (needs sharp)
```

`npx knip` reports unreachable files and unused dependencies; it runs against
this project without extra configuration.

## Keyboard shortcuts

They apply on `/rate` and stand down while a dialog or popover is open or the
focus is in a text field.

| Keys                    | Action                                    |
| ----------------------- | ----------------------------------------- |
| `S` `A` `B` `C` `D` `F` | Rate the current video with that tier     |
| `N` or `→`              | Next video                                |
| `P` or `←`              | Previous video                            |
| `R` or `0`              | Replay from the start                     |
| `Space`                 | Play / pause (without scrolling the page) |
| `Shift`+`F`             | Fullscreen                                |
| `?`                     | Show the shortcut list                    |

`F` stays the F tier; only `Shift`+`F` goes fullscreen. The mapping lives in
`src/lib/components/rate/shortcuts.js` and the tier keys come from
`src/lib/tiers.js`, so the help list can never disagree with the bindings.

## Install as an app (PWA)

The build ships a web app manifest and a service worker, so the app installs and
starts offline. There is no service worker in `npm run dev` — use
`npm run build && npm run preview` to exercise it.

- **Chrome / Edge on desktop** — open the app and use the install icon in the
  address bar, or ⋮ → _Cast, save and share_ → _Install page as app_ (Chrome) /
  ⋯ → _Apps_ → _Install this site as an app_ (Edge).
- **Android (Chrome)** — ⋮ → _Add to Home screen_ → _Install_.
- **iOS / iPadOS (Safari)** — Share → _Add to Home Screen_. Safari only installs
  from Safari itself, not from Chrome or Firefox on iOS. Fullscreen playback is
  handled by iOS' own video player there, so the Fullscreen shortcut may be
  refused; playback stays inline.

Installed or not, the shell, the icons and already-seen thumbnails are cached, so
the library renders offline. Playback and playlist imports need the network — the
header shows an offline badge while there is none. When a new version has been
downloaded, a small "Update available" prompt appears instead of reloading the
page under you mid-video.

## Your data

Everything lives in your browser's `localStorage`, under two keys:

| Key                | Contents                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `ytpt:v1:library`  | Every imported playlist, its videos, their tiers and the shuffle order |
| `ytpt:v1:settings` | API key, _skip rated_, _auto-advance_, _fullscreen on play_            |

Both payloads carry a `version` field so a future format change can migrate
instead of discarding ratings. `src/lib/storage.js` is the only module that
touches storage; reads never throw, so private-browsing mode or a disabled
storage quota degrades to "nothing saved" rather than a crash.

Clearing site data, "clear cookies and site data" or an incognito window ends
the session and loses the ratings — so:

- **Export** (playlist card on Browse) downloads
  `{ version, exportedAt, playlists }` as JSON. That file is the backup and the
  way to move a library to another browser or device.
- **Import JSON** merges such a file back in. It never overwrites a tier you
  already gave a video; it only fills in the blanks. The empty state offers the
  same restore, so a backup gets you back in without an API key.
- A bare array of `{ videoId, title, rating }` — the export format of the
  original vanilla-JS prototype — is also accepted. Its ratings are applied to
  matching videos of the playlists you already have; entries matching nothing
  land in a local `legacy-import` playlist.
- **Re-importing the same playlist is the refresh path**: new videos are added,
  metadata is updated, and your tiers (and any video you marked unavailable) are
  kept.

## Stack

- [SvelteKit 2](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/docs/svelte) (runes, JavaScript + JSDoc)
- [Tailwind CSS 4](https://tailwindcss.com) (CSS-first config in `src/app.css`)
- [shadcn-svelte](https://shadcn-svelte.com) components (`src/lib/components/ui/`) on [bits-ui](https://bits-ui.com) 2
- [`@sveltejs/adapter-static`](https://svelte.dev/docs/kit/adapter-static) with an `index.html` fallback
- [`@vite-pwa/sveltekit`](https://vite-pwa-org.netlify.app/frameworks/sveltekit) for the web app manifest and service worker
- [Vitest](https://vitest.dev) for unit tests

## Deployment

`npm run build` produces a fully static `build/` folder. Serve it from any static
host, with a rewrite of unknown paths to `index.html` (SPA fallback) — `/rate` is
a client route and must not 404 on a cold load.

The manifest's `scope` and `start_url` assume the app lives at the site root.

## Adding UI components

```bash
npx shadcn-svelte@latest add <component>
```

Components are written to `src/lib/components/ui/` and are meant to be edited in
place; the configuration lives in `components.json`.

## Code map

### Domain and state

- `src/lib/types.js` — the domain model (`Rating`, `Video`, `Playlist`, `Settings`) as
  JSDoc typedefs, plus `RATING_ORDER`, `isRating`, `isBetterOrEqual` and
  `normalizeRatings` (the one place an untrusted tier list is cleaned up).
- `src/lib/tiers.js` — the single source of truth for the six tiers: order,
  labels, keyboard keys, colours and the shared tier-button chrome.
- `src/lib/storage.js` — the only place that touches `localStorage`; every key is
  namespaced `ytpt:v1:<name>`.
- `src/lib/youtube/api.js` — pure YouTube Data API calls (`parsePlaylistInput`,
  `fetchPlaylistMeta`, `fetchPlaylistVideos`) that fail with a typed `YouTubeApiError`.
- `src/lib/youtube/iframe-api.js` — loads the IFrame Player API once per page and
  maps its error codes to `unavailable` / `other`.
- `src/lib/playlist.js` — pure playlist operations (normalising untrusted data,
  reconciling the playback order, merging a re-import) that the state modules build on.
- `src/lib/state/*.svelte.js` — rune-based singletons: `settings`, `library`
  (playlists, ratings, import/export) and `session` (the rating queue).
- `src/lib/format.js` — display helpers (`formatDuration`, `formatDate`,
  `exportFileName`); `src/lib/youtube/urls.js` — the youtube.com links and the
  thumbnail fallback. Both are total: unusable input becomes an empty string.

### Pages and shell

- `src/routes/+layout.svelte` owns the chrome: a sticky header (wordmark, desktop
  nav, offline badge, theme toggle) and, below `md`, a bottom tab bar. Both render
  from `src/lib/components/shell/nav.js`, so a destination is added once. The
  layout already reserves `--app-tab-bar-inset` below page content, so pages need
  no bottom padding of their own; anything a page pins to the bottom of the
  viewport itself offsets by that variable.
- `/browse` is the library view: stats, a filterable, sortable video grid that pages
  in 60 cards at a time, and the playlist card with import/export. Its rules live in
  `src/lib/components/browse/filters.js` (bucket filter, search, sort) and its error
  copy in `errors.js`, both unit-tested; the components next to them render only.
- `/rate` is the rating session. `?v=<videoId>` starts it at a video — even one
  the filter excludes, which is what a card's "Rate" button links to. `?tiers=S,A`
  and `?unrated=0` mirror the queue filter and stay in sync with the toolbar.
- `src/lib/components/Player.svelte` wraps the YouTube IFrame Player API: it takes
  a `videoId` plus callbacks and exposes `play`, `pause`, `seekTo`, `replay`,
  `getCurrentTime` and `requestFullscreen` via `bind:this`.
- Two tier controls, both driven by `src/lib/tiers.js`:
  `components/TierPicker.svelte` (compact, on a Browse card, with a clear button)
  and `components/rate/TierBar.svelte` (thumb-sized, sticky, with key hints).

The icons in `static/` are committed, so the build never needs `sharp`. Re-run
`npm run icons` only after editing the motif in `scripts/generate-icons.mjs`.

The original vanilla-JS prototype (`index.html`, `index.js`, `start-server.sh`) was
removed once its logic had been ported into these modules.
