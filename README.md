# yt-playlist-tierlist

Rank the videos of a YouTube playlist into tiers (S/A/B/C/D/F).

Point it at a playlist, and it pulls in every video with its title, channel,
thumbnail and duration. **Browse** is the library: filter by tier, search, sort,
shuffle, and rate any card in place. **Rate** is the focused loop — the video
plays, you press a key, the next one starts. Ratings persist in the browser and
can be exported to a JSON file and restored on another device.

Every page is rendered in the browser (`ssr = false`), and your ratings still live
in `localStorage` — but the app is served by its own small Node server now, which
owns the database the accounts and the shared library are moving into (#14). It
installs as a PWA on desktop and phone.

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
npm run build       # build the node server into build/
npm start           # run that build: node build, port 3000
npm run preview     # serve the production build locally
npm run check       # svelte-check (JSDoc types)
npm run lint        # prettier --check + eslint
npm run format      # prettier --write
npm test            # vitest run
npm run test:watch  # vitest in watch mode
npm run icons       # re-rasterize the app icons into static/ (needs sharp)
npm run db:generate # write a migration for the current schema.js
npm run db:migrate  # apply pending migrations once, by hand
npm run db:studio   # drizzle studio against DATABASE_URL
```

`npx knip` reports unreachable files and unused dependencies; it runs against
this project without extra configuration.

## Running the server

The app is a SvelteKit build on
[`@sveltejs/adapter-node`](https://svelte.dev/docs/kit/adapter-node): `npm run
build` writes `build/`, and `node build` serves it on `PORT` (3000 by default).
It needs a Postgres.

### Environment

`.env.example` documents every variable; copy it and fill in what you need:

```bash
cp .env.example .env
```

`DATABASE_URL` is the only one development insists on. `NODE_ENV=production`
additionally requires `YOUTUBE_API_KEY` and `ORIGIN` — the server refuses to start
with a clear list of what is missing rather than failing on the first request that
needs it (`src/lib/server/config.js`).

`vite dev`, `vite build` and the `db:*` scripts read `.env`. **`node build` does
not** — give it a real environment (compose, Kubernetes, `VAR=… node build`).

### Postgres for development

```bash
podman compose -f deploy/docker-compose.yml up -d    # or: docker compose
```

Postgres 16, database/user/password `amv`, published on 5432 — the same triple the
cluster uses. If 5432 is taken on your machine, start it elsewhere with
`POSTGRES_PORT=55432 podman compose -f deploy/docker-compose.yml up -d` and put
that port in `DATABASE_URL`.

```bash
npm run dev     # http://localhost:5173, migrations applied on first request
npm run build && npm start   # http://localhost:3000
```

### Migrations

The schema is `src/lib/server/db/schema.js`; `npm run db:generate` diffs it and
writes SQL plus a journal entry into `drizzle/`. Commit both — they ship with the
image.

Migrations are applied **on boot**, in the SvelteKit `init` hook
(`src/hooks.server.js`), under a Postgres advisory lock so two replicas starting
together cannot race. A failure there exits the process non-zero, which is what
keeps a broken migration from rolling over pods that still work.
`npm run db:migrate` does the same by hand, e.g. against a database no app is
pointed at yet.

### Endpoints

| Route          | Answers                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `/healthz`     | `200 {"ok":true}`, without touching the database — the liveness probe                                        |
| `/api/v1/meta` | `{ commit, buildTime, startedAt, dbSchemaVersion, binarySchemaVersion }`, 503 if the database is unreachable |

`dbSchemaVersion` counts the migrations the database has recorded,
`binarySchemaVersion` the ones this build ships: equal after a healthy deploy.
Failures everywhere under `/api/v1` share one shape, `{ error: { code, message } }`
(`src/lib/server/http.js`).

### Database integration tests

The `*.db.test.js` suites need a real Postgres and **wipe** the database they are
given, so they only run when `TEST_DATABASE_URL` is set; otherwise `npm test`
skips them with a note.

```bash
TEST_DATABASE_URL=postgres://amv:amv@localhost:5432/amv npm test
```

### Container

```bash
podman build \
  --build-arg GIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t amv-tierlist:dev .

podman run --rm --network deploy_default -p 3000:3000 \
  -e DATABASE_URL=postgres://amv:amv@db:5432/amv \
  -e YOUTUBE_API_KEY=… -e ORIGIN=http://localhost:3000 \
  amv-tierlist:dev
```

`node:22.23-alpine`, two stages, runs as the unprivileged `node` user (uid 1000)
and writes nothing inside the image. The two build args are what `/api/v1/meta`
reports back as `commit` and `buildTime`; they default to `unknown`.

## Keyboard shortcuts

They apply on `/rate` and stand down while a dialog or popover is open or the
focus is in a text field.

Two sets of keys meet on that page. YouTube's own player answers `k`, `m`, the
arrows and `j`/`l` — but only while the iframe has the focus, and the Rate page
deliberately keeps the focus on its own side so that the rating keys work in
fullscreen. Those player keys are therefore **proxied by the app**, and they stay
even when the rating keys are switched off, so that no key means two different
things depending on a focus you cannot see.

### Player

| Keys           | Action              |
| -------------- | ------------------- |
| `K` or `Space` | Play / pause        |
| `M`            | Mute / unmute       |
| `←` / `→`      | Back / forward 5 s  |
| `J` / `L`      | Back / forward 10 s |

### Rating

These keys are yours: _Settings → Edit shortcuts_ (also reachable from the `?`
list) binds any action to any key, and the choice is remembered. _Settings →
Keyboard shortcuts_ still switches the whole set off (buttons only) and on; with
it off, the tier bar drops its `<kbd>` hints and the help popover says so.

Defaults — the letters, with `f` left to YouTube:

| Keys                                    | Action                                |
| --------------------------------------- | ------------------------------------- |
| `S` `A` `B` `C` `D`                     | Rate the current video with that tier |
| `Shift`+`F`                             | Rate it F                             |
| `F`                                     | Fullscreen (as on YouTube)            |
| `N`                                     | Next video                            |
| `P`                                     | Previous video                        |
| `R`                                     | Replay from the start                 |
| `U`, `Backspace`, `Ctrl`+`Z` or `⌘`+`Z` | Undo the last rating                  |
| `Shift`+`L`                             | Loop the current video                |
| `?`                                     | Show the shortcut list                |

Every YouTube key therefore keeps its meaning by default; the F tier is the one
letter that has to take a modifier, and `L` is the player's "forward 10 s", which
is why loop is `Shift`+`L`. A held key repeats only where that helps — seeking. A
rating, above all, means exactly once.

**Priority.** A key you bind wins over the proxied player key of the same name:
bind a tier to `K` and `K` rates, leaving play/pause on `Space`. `?` is the
exception — it always opens the shortcut list, because that list is how you find
out what everything else is bound to, so it cannot be rebound. The player layer
itself (`K`, `Space`, `M`, `J`, `L`, the arrows) is not rebindable; it mirrors
YouTube, and shadowing it is enough.

**Editing.** One row per action, each with its keys as removable chips and an
_Add key_ button that records the next keystroke (`Esc` cancels). A key can belong
to one action only — binding one that is taken is refused with a note saying where
it is taken, so swapping two keys means removing one first. Binding a key that the
YouTube layer uses is allowed and says what it overrides. _Reset to defaults_ puts
the table above back.

The bindings themselves are `src/lib/keybindings.js` (chord grammar, actions,
defaults, `normalizeKeybindings`, `withChord`/`withoutChord`); the Rate page's half
is `src/lib/components/rate/shortcuts.js` —
`shortcutFor(event, { bindings, ratingKeys })` for the matching, `chordConflict` for
the editor, and `shortcutKeys`/`shortcutTable`/`tierChords` for every hint the UI
shows. All of them read the same bindings, so no `<kbd>`, tooltip or help row can
promise a key the page does not answer — the player rows even drop the keys a
binding has taken from them, so `K` stops being offered for play/pause the moment a
tier claims it.

**Undo** takes back the last rating (and a manual _Mark unavailable_), restores
the previous tier and jumps back to that video, up to 50 steps back. It is also
the button next to the playback controls and an action on the toast that follows
a rating — that action undoes the step its own toast is about, never a newer one.
The stack lives in memory and belongs to the active playlist.

**Fullscreen** puts the app's own player wrapper on the screen, not the YouTube
iframe — that is what keeps the keyboard on our side of the origin boundary. A
compact overlay (tiers, previous/skip, undo, leave fullscreen) fades in and out
in the top left while it is up — clear of the browser's "exit full screen" pill
and of the embed's own volume, captions and settings buttons, which stay
clickable. Using YouTube's own fullscreen button instead fullscreens the iframe,
and then the shortcuts belong to YouTube again.

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

Everything still lives in your browser's `localStorage`, under two keys — the
server has a database, but nothing of yours is in it yet (that is #17):

| Key                | Contents                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `ytpt:v1:library`  | Every imported playlist, its videos, their tiers and the shuffle order                                                 |
| `ytpt:v1:settings` | API key, _skip rated_, _auto-advance_, _fullscreen on play_, _loop_, _keyboard shortcuts_ (on/off) and the keybindings |

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
- [`@sveltejs/adapter-node`](https://svelte.dev/docs/kit/adapter-node) — `node build` on port 3000, pages still client-rendered
- [Drizzle ORM](https://orm.drizzle.team) + [postgres.js](https://github.com/porsager/postgres) against Postgres 16, migrations applied on boot
- [`@vite-pwa/sveltekit`](https://vite-pwa-org.netlify.app/frameworks/sveltekit) for the web app manifest and service worker
- [Vitest](https://vitest.dev) for unit tests

## Deployment

The app is deployed as a container: `Dockerfile` builds it, `node build` serves it
on port 3000, and it needs `DATABASE_URL`, `YOUTUBE_API_KEY` and `ORIGIN` in its
environment (see [Running the server](#running-the-server)). Point a reverse proxy
at that port; the routes are real server routes, so nothing needs an SPA rewrite
rule any more.

The manifest's `scope` and `start_url` assume the app lives at the site root.

Production runs on a k3s VPS at `https://amv.lefted.dev`: manifests in
`deploy/k8s/`, the guarded deploy in `scripts/deploy.sh`. First-time setup is
[`docs/deploy/runbook.md`](docs/deploy/runbook.md), the deploy contract
[`docs/deploy/deploys.md`](docs/deploy/deploys.md).

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
  labels, colours and the shared tier-button chrome. The keys are not here: they
  are the user's, and live in `settings.keybindings`.
- `src/lib/keybindings.js` — the rating layer's keys as data: the chord grammar
  (`parseChord`/`formatChord`/`normalizeChord`/`chordLabel`/`ariaKeyshortcuts`), the
  bindable actions, `DEFAULT_KEYBINDINGS`, and the total operations a stored table is
  cleaned up (`normalizeKeybindings`) and edited (`withChord`/`withoutChord`) with. It
  sits here, not next to the Rate page, because `settings` needs the same vocabulary
  to load and persist the table.
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
  a `videoId` plus callbacks and exposes `play`, `pause`, `seekTo`, `seekBy`,
  `replay`, `mute`, `unMute`, `isMuted`, `getCurrentTime`, `focus`,
  `requestFullscreen` and `exitFullscreen` via `bind:this` — the seek and mute
  calls are what the proxied player keys drive. Fullscreen goes to its own wrapper (`src/lib/fullscreen.js` hides
  the prefixes and the refusals), and anything rendered into the component shows
  up inside that wrapper — which is how `components/rate/PlayerOverlay.svelte`
  gets on screen while fullscreen.
- The Rate page's rules are pure modules next to it:
  `components/rate/shortcuts.js` (the key mapping of both layers, the hints and the
  conflict notes, over `$lib/keybindings.js`; `components/rate/ShortcutsDialog.svelte`
  is the editor),
  `components/rate/playback.js` (what the end of a video means, loop included)
  and `components/rate/undo.js` (how a reversible step reads).
- Three tier controls, all driven by `src/lib/tiers.js`:
  `components/TierPicker.svelte` (compact, on a Browse card, with a clear button),
  `components/rate/TierBar.svelte` (thumb-sized, sticky, with the bound key as a
  hint while the rating keys are on) and the row inside `components/rate/PlayerOverlay.svelte`, which
  is the only one that is on screen while the player is fullscreen. That overlay
  shares the screen with the browser's and YouTube's own controls, so what it may
  cover is a contract rather than taste: `PlayerOverlay.test.js` renders it through
  `svelte/server` and holds that structure down. Tests elsewhere stick to the pure
  modules — a render test earns its place only where the markup _is_ the behaviour.

### Server

Everything under `src/lib/server/` is server-only — SvelteKit refuses to bundle it
into the client, which is what keeps the database URL and the YouTube key on this
side.

- `src/hooks.server.js` — boot: read the config, apply the migrations, then serve.
  Exits non-zero if either fails.
- `src/lib/server/config.js` — the environment as one validated, memoised object
  (`readConfig` is pure and is what the tests drive); `ConfigError` lists every
  offending variable at once.
- `src/lib/server/db/schema.js` — the Drizzle tables; `db/index.js` — the lazily
  opened postgres.js pool and Drizzle handle; `db/migrations.js` — applying the
  `drizzle/` folder under an advisory lock and counting what shipped versus what
  landed.
- `src/lib/server/http.js` — `json` / `jsonError`, the one response shape the API
  uses; `src/lib/server/meta.js` — the `/api/v1/meta` payload and this process'
  start time.
- `src/routes/healthz/+server.js` (no database) and
  `src/routes/api/v1/meta/+server.js` (needs one, 503 without it).

The icons in `static/` are committed, so the build never needs `sharp`. Re-run
`npm run icons` only after editing the motif in `scripts/generate-icons.mjs`.

The original vanilla-JS prototype (`index.html`, `index.js`, `start-server.sh`) was
removed once its logic had been ported into these modules.
