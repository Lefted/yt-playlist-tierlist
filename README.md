# yt-playlist-tierlist

Rank the videos of a YouTube playlist into tiers (S/A/B/C/D/F). The app is a pure
client-side SPA — no server, no database, everything lives in the browser.

## Stack

- [SvelteKit 2](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/docs/svelte) (runes, JavaScript + JSDoc)
- [Tailwind CSS 4](https://tailwindcss.com) (CSS-first config in `src/app.css`)
- [shadcn-svelte](https://shadcn-svelte.com) components (`src/lib/components/ui/`) on [bits-ui](https://bits-ui.com) 2
- [`@sveltejs/adapter-static`](https://svelte.dev/docs/kit/adapter-static) with an `index.html` fallback
- [`@vite-pwa/sveltekit`](https://vite-pwa-org.netlify.app/frameworks/sveltekit) for the web app manifest and service worker
- [Vitest](https://vitest.dev) for unit tests

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

## PWA

The manifest, the icons and the service worker are generated at build time by
`SvelteKitPWA` in `vite.config.js`. The worker precaches the app shell and the
`index.html` fallback, so the library renders offline; the YouTube player and
playlist imports do not, and the header shows an offline badge instead.

There is no service worker in `npm run dev` — use `npm run build && npm run preview`
to exercise it.

The icons in `static/` are committed, so the build never needs `sharp`. Re-run
`npm run icons` only after editing the motif in `scripts/generate-icons.mjs`.

## App shell

`src/routes/+layout.svelte` owns the chrome: a sticky header (wordmark, desktop
nav, offline badge, theme toggle) and, below `md`, a bottom tab bar. Both render
from `src/lib/components/shell/nav.js`, so add a destination there once.

The layout already reserves `--app-tab-bar-inset` below page content, so pages
need no bottom padding of their own. Anything a page pins to the bottom of the
viewport itself should offset by that variable.

## Rating session

`/rate` is the focused loop: watch, press a tier, the next video starts.

- `s a b c d f` rate, `n`/`→` next, `p`/`←` previous, `r`/`0` replay, `space`
  play/pause, `shift+f` fullscreen, `?` shows the list. They stand down while a
  popover is open or the focus is in a field.
- `?v=<videoId>` starts the session at a video — even one the filter excludes.
  `?tiers=S,A` and `?unrated=0` mirror the queue filter and stay in sync with the
  toolbar.
- `src/lib/components/Player.svelte` wraps the YouTube IFrame Player API: it takes
  a `videoId` plus callbacks and exposes `play`, `pause`, `seekTo`, `replay`,
  `getCurrentTime` and `requestFullscreen` via `bind:this`.

## Deployment

`npm run build` produces a fully static `build/` folder. Serve it from any static
host, with a rewrite of unknown paths to `index.html` (SPA fallback).

## Adding UI components

```bash
npx shadcn-svelte@latest add <component>
```

Components are written to `src/lib/components/ui/` and are meant to be edited in
place; the configuration lives in `components.json`.

## Domain and state

- `src/lib/types.js` — the domain model (`Rating`, `Video`, `Playlist`, `Settings`) as
  JSDoc typedefs, plus `RATING_ORDER` and `isBetterOrEqual`.
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

The original vanilla-JS prototype (`index.html`, `index.js`, `start-server.sh`) was
removed once its logic had been ported into these modules.
