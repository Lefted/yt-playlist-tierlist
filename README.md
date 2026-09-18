# yt-playlist-tierlist

Rank the videos of a YouTube playlist into tiers (S/A/B/C/D/F). The app is a pure
client-side SPA — no server, no database, everything lives in the browser.

## Stack

- [SvelteKit 2](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/docs/svelte) (runes, JavaScript + JSDoc)
- [Tailwind CSS 4](https://tailwindcss.com) (CSS-first config in `src/app.css`)
- [shadcn-svelte](https://shadcn-svelte.com) components (`src/lib/components/ui/`) on [bits-ui](https://bits-ui.com) 2
- [`@sveltejs/adapter-static`](https://svelte.dev/docs/kit/adapter-static) with an `index.html` fallback
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
```

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
- `src/lib/playlist.js` — pure playlist operations (normalising untrusted data,
  reconciling the playback order, merging a re-import) that the state modules build on.
- `src/lib/state/*.svelte.js` — rune-based singletons: `settings`, `library`
  (playlists, ratings, import/export) and `session` (the rating queue).

The original vanilla-JS prototype (`index.html`, `index.js`, `start-server.sh`) was
removed once its logic had been ported into these modules.
