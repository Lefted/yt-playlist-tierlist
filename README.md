# yt-playlist-tierlist

Rank the videos of a YouTube playlist into tiers (S/A/B/C/D/F).

Point it at a playlist, and it pulls in every video with its title, channel,
thumbnail and duration. **Browse** is the library: filter by tier, search, sort,
shuffle, and rate any card in place. **Rate** is the focused loop — the video
plays, you press a key, the next one starts. Ratings live with your account, so
they follow you to the next device, and can still be exported to a JSON file.

Every page is rendered in the browser (`ssr = false`), but the app is served by
its own small Node server and you sign in to reach it: invite-only accounts,
sessions and the whole library live in Postgres. It installs as a PWA on desktop
and phone.

## Getting a YouTube Data API key

Importing a playlist calls the YouTube Data API v3. **The key belongs to the
installation, not to the user**: it is `YOUTUBE_API_KEY` in the server's
environment, the server makes the call, and nobody signing in ever sees or types
one. Only whoever runs the server needs the steps below; it is free, takes a few
minutes and does not require billing.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create
   a project (or pick an existing one).
2. Go to **APIs & Services → Library**, search for **YouTube Data API v3** and
   press **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key** and
   copy the key.
4. Press **Restrict key**. Under **Application restrictions** choose **None** or
   an IP restriction naming the server — an HTTP-referrer restriction is for keys
   used by a browser, and this one is not. Under **API restrictions**, restrict
   the key to **YouTube Data API v3**.
5. Put it in `.env` (development) or in the `amv-env` Secret (production) as
   `YOUTUBE_API_KEY`. It never leaves the server.

Importing a playlist of _n_ videos costs roughly `1 + ceil(n/50) * 2` quota units
against the default 10 000 units per day, so several hundred imports a day fit
comfortably — shared by everyone with an account, which is the trade for nobody
having to make a key.

A `quotaExceeded`, `keyInvalid`, `keyMissing` or `playlistNotFound` answer is
reported in the import dialog in plain words; nothing else in the app needs the
API, so an existing library keeps working without a key.

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
npm run user:set-password -- <email>   # give an account a new password
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
| `/api/v1/me`   | `{ user: { id, email, displayName, role } }` for the signed-in account, 401 without a session                |

`dbSchemaVersion` counts the migrations the database has recorded,
`binarySchemaVersion` the ones this build ships: equal after a healthy deploy.

The library API, all of it scoped to the signed-in account:

| Route                                            | Does                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `GET /api/v1/library`                            | `{ activePlaylistId, playlists }` — the whole library                            |
| `PUT /api/v1/library/active`                     | `{ playlistId }` (or `null`) — which playlist is being worked on                 |
| `POST /api/v1/library/import-json`               | Body is an export file; merges it in and answers `{ summary, library }`          |
| `GET /api/v1/library/export`                     | The backup file, byte for byte what the Browse page downloads                    |
| `POST /api/v1/playlists/import`                  | `{ input }` — reads the playlist from YouTube and stores it; re-import refreshes |
| `DELETE /api/v1/playlists/:playlistId`           | Removes a playlist and its ratings                                               |
| `PUT /api/v1/playlists/:playlistId/order`        | `{ order }` — the playback order (shuffle, reset)                                |
| `PATCH /api/v1/playlists/:playlistId/videos/:id` | `{ rating }` and/or `{ unavailable }`                                            |

`:playlistId` and `:id` are the **YouTube** ids, which is what the browser holds;
they are unique per account, and a video is addressed through its playlist because
the same video in two playlists carries two ratings. Every lookup is
`(user_id, youtube_id)`, so another account's id simply finds nothing.

Failures everywhere under `/api/v1` share one shape, `{ error: { code, message } }`
(`src/lib/server/http.js`). Mutations must be `Content-Type: application/json` and
carry a matching `Origin`; a read needs neither. An import reports YouTube's own
vocabulary as its `code` (`quotaExceeded`, `keyInvalid`, `keyMissing`, `network`,
`playlistNotFound`, `unknown`), which is what the dialog turns into a sentence.

### Database integration tests

The `*.db.test.js` suites need a real Postgres and **wipe** the database they are
given, so they only run when `TEST_DATABASE_URL` is set; otherwise `npm test`
skips them and says why (`npx vitest run --reporter=verbose` shows the line).

```bash
TEST_DATABASE_URL=postgres://amv:amv@localhost:5432/amv npm test
```

Each suite empties the database first (`emptyTestDatabase` in
`src/lib/server/db/testing.js` drops every table and enum it finds, rather than a
hand-kept list) and then applies the migrations, so they are independent of each
other and of whatever was in there before. They queue on an advisory lock, because
Vitest runs files in parallel and they all want the same database.

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

## Accounts

The deployed app is **invite-only**: there is no public sign-up form, and every
page except the ones below needs a session.

| Public                                | Everything else                                    |
| ------------------------------------- | -------------------------------------------------- |
| `/login`, `/invite/<token>`           | redirected to `/login?redirectTo=…` for a page,    |
| `/healthz`, `/api/v1/meta`            | answered with `401` JSON for anything under `/api` |
| the client bundle and `static/` files |                                                    |

### The first admin

On boot, if the `users` table is **empty** and `ADMIN_EMAIL` / `ADMIN_PASSWORD`
are both set, the server creates that admin and says so once
(`[boot] created the first admin account: …`). From the second boot on the two
variables are ignored — they cannot resurrect a password that has since been
changed, and they cannot re-enable a disabled account. Set them in the Secret
for the first rollout and leave them there; they are inert afterwards.

```bash
DATABASE_URL=… ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='at least ten chars' node build
```

### Inviting someone

`/admin` (admins only) mints an invite link, valid for 7 days by default. The
link carries a 256-bit token; the database keeps only its SHA-256, so **the page
shows it exactly once** — copy it before reloading. A link with an email address
on it pins the sign-up to that address; one without lets the recipient choose.
Open invites can be revoked; used ones stay in the list as a record of who joined.

`/admin` also disables and re-enables accounts. Disabling deletes that user's
sessions, so it takes effect on their very next request rather than in thirty
days; their library is kept, and enabling them again restores everything. The
last admin who can still sign in cannot be disabled.

### Passwords and sessions

Passwords are hashed with **Argon2id** (`@node-rs/argon2`, m=19456 KiB, t=2, p=1
— the library's defaults, recorded in each hash). The only rule is a minimum of
10 characters. A failed login always says "That email or password is wrong",
whether the address exists, the password is wrong or the account is disabled, and
takes the same time in all three cases. Logins are rate-limited to 10 attempts
per 15 minutes per address and per client address, in memory — a brake on
guessing, not a security boundary (see `src/lib/server/auth/rate-limit.js`).

**Behind a reverse proxy, set `ADDRESS_HEADER` and `XFF_DEPTH`** (adapter-node's
own variables; `deploy/k8s/app.yaml` does). Without them every request appears to
come from the proxy, the per-IP bucket becomes one global bucket, and ten failed
logins anywhere lock the whole installation out for fifteen minutes. `sessions.ip`
is the place to check: it should hold real client addresses.

The session cookie is `amv_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Secure` under `NODE_ENV=production`, 30 days, slid forward once a day of use.
It carries a random token; `sessions.id` is its SHA-256, so a database dump
cannot be replayed as a login.

### Resetting a password

There is no reset by email (out of scope for #16). The script below prompts twice,
without echoing, writes a new Argon2id hash and signs that account out everywhere:

```bash
npm run user:set-password -- someone@example.com
```

It runs from a checkout, against whatever `DATABASE_URL` points at — the image
carries only `build/`, so for the deployed copy, tunnel to the database first:

```bash
kubectl -n amv port-forward svc/amv-db 55432:5432 &
DATABASE_URL=postgres://amv:…@localhost:55432/amv npm run user:set-password -- someone@example.com
```

## Keyboard shortcuts

They apply on `/rate` and stand down while a dialog or popover is open or the
focus is in a text field.

Two sets of keys meet on that page. YouTube's own player would answer `k`, `m`,
the arrows and `j`/`l` — but only while the iframe has the focus, and a key that
means one thing or another depending on a focus you cannot see is a trap. The
embed is therefore created without a keyboard of its own (`disablekb: 1`), and the
app **proxies** every one of those keys through the IFrame API instead. They work
even when the rating keys are switched off, and they no longer depend on where the
focus is: a click or tap on the video hands the keyboard back to the page a quarter
of a second later.

The arrows belong to the player on this page, so they do not scroll it.

### Player

| Keys           | Action              |
| -------------- | ------------------- |
| `K` or `Space` | Play / pause        |
| `M`            | Mute / unmute       |
| `↑` / `↓`      | Volume ±5 %         |
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
| `F`                                     | Fullscreen on / off (as on YouTube)   |
| `N`                                     | Next video                            |
| `P`                                     | Previous video                        |
| `R`                                     | Replay from the start                 |
| `U`, `Backspace`, `Ctrl`+`Z` or `⌘`+`Z` | Undo the last rating                  |
| `Shift`+`L`                             | Loop the current video                |
| `Shift`+`H`                             | Hide / show the fullscreen controls   |
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
YouTube, and shadowing it is enough — though a shadowed player key is one the
embed no longer answers either, so it is gone rather than moved.

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
iframe — that is what keeps the keyboard on our side of the origin boundary. It
is also the only fullscreen on offer: the embed is created without a fullscreen
button of its own (`fs: 0`) and without a keyboard (`disablekb: 1`), because
YouTube's button and YouTube's `f` fullscreen the iframe, and then the keyboard
and the whole screen belong to YouTube and there is no way left to rate the video.
Should the embed get into fullscreen by some path anyway, the app leaves it again
at once and says where the fullscreen it has is. The ways in are the Fullscreen
button under the player, the `F` key and _fullscreen on play_. On a phone the app
also asks to stay in landscape while it lasts, and gives the rotation back on the
way out; devices that refuse simply keep rotating.

A compact overlay (tiers, previous/skip, undo, leave fullscreen) sits in the top
left — clear of the browser's "exit full screen" pill and of the embed's own
volume, captions and settings buttons, which stay clickable. It comes and goes
with YouTube's own controls: after about three seconds of nothing happening it
fades out, and it is back on the next mouse movement over the video or the next
shortcut. It never fades while the pointer is on it, and never while a
video has ended unrated.

**On a touch screen a tap on the video toggles it**, exactly as a tap hides
YouTube's own controls when they are showing: tap to put it away, tap again to
bring it back, and the three-second fade still runs in between. Taps on the
overlay itself are not taps on the video, so its own buttons never hide it — nor
does the video change that a rating or a skip sets off, even though the embed
grabs the keyboard when it loads. On a mouse setup the same click stays
play/pause and only wakes the overlay. Switching tab or app leaves the overlay
exactly as it was.

The eye button at its left edge (or `Shift`+`H`) is the
other, lasting way to get it out of the picture: it shrinks the box down to just
that button and back, and which of the two it is on is remembered on the device,
across videos and reloads.

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

Your library lives in the server's Postgres, one library per account. Only the
preferences of the machine in front of you stay in `localStorage`:

| Where                                     | Contents                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `playlists` (Postgres)                    | One row per imported playlist per account: its YouTube id, title, channel, thumbnail and the playback order      |
| `videos` (Postgres)                       | One row per video of a playlist: title, channel, duration, its tier, whether it is unplayable, when it was rated |
| `user_state` (Postgres)                   | Which playlist the account is working on                                                                         |
| `users`, `sessions`, `invites` (Postgres) | The account itself (see [Accounts](#accounts))                                                                   |
| `ytpt:v1:settings`                        | _skip rated_, _auto-advance_, _fullscreen on play_, _loop_, _overlay collapsed_, _shortcuts_ and the keybindings |
| `ytpt:v1:library.migrated`                | Nothing the app reads — a copy of the pre-accounts library, kept after it was imported (see below)               |

That split is deliberate: ratings are about the playlist and should follow you to
the next device; which key rates an S and whether a video should go fullscreen are
about the machine and should not. `ytpt:v1:library` is gone — nothing writes it any
more, and the settings loader ignores a stored `apiKey` from an older version.

`src/lib/storage.js` is still the only module that touches `localStorage`; reads
never throw, so private-browsing mode or a disabled storage quota degrades to
"nothing saved" rather than a crash.

### Bringing a library off this device

A browser that used the app before it had accounts still has `ytpt:v1:library`.
The first time you sign in on it with an account that has nothing imported, Browse
offers to import it; an account that already has playlists finds the same action
in the playlist card's menu ("Import from this device"). Either way it goes through
the ordinary backup path, so nothing is overwritten — and on success the key is
**renamed** to `ytpt:v1:library.migrated` rather than deleted, so a migration you
have second thoughts about is still recoverable by hand.

### Backups

Clearing site data ends the session but no longer loses ratings — they are on the
server. Losing the server is a different matter, so:

- **Export** (playlist card on Browse) downloads
  `{ version, exportedAt, playlists }` as JSON; `GET /api/v1/library/export`
  produces the same file for a script. That is the backup, and the way to move a
  library to another installation.
- **Import JSON** merges such a file back in. It never overwrites a tier you
  already gave a video; it only fills in the blanks. The empty state offers the
  same restore.
- A bare array of `{ videoId, title, rating }` — the export format of the
  original vanilla-JS prototype — is also accepted. Its ratings are applied to
  matching videos of the playlists you already have; entries matching nothing
  land in a `legacy-import` playlist.
- **Re-importing the same playlist is the refresh path**: new videos are added,
  metadata is updated, and your tiers (and any video you marked unavailable) are
  kept.

Writes are applied on screen before the server has agreed to them, so rating feels
like pressing a key rather than submitting a form. If the write then fails — the
usual reason is being offline — the change is taken back and a message says so.
There is no offline write queue; API requests are `NetworkOnly` for the service
worker, and an offline library is a read-only one.

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
  namespaced `ytpt:v1:<name>`. Settings and the one-time migration marker, nothing else.
- `src/lib/api.js` — the browser's side of `/api/v1`: one `apiFetch`, and an
  `ApiError` carrying the server's `code` and sentence, so no caller looks at a
  status.
- `src/lib/youtube/api.js` — the pure half of the YouTube vocabulary
  (`parsePlaylistInput`, `parseIsoDuration`, the closed list of failure reasons).
  The calls themselves are the server's (`src/lib/server/youtube.js`).
- `src/lib/library-io.js` — the backup format: what an export looks like, what an
  import does to a library. Shared, because the browser writes the download and the
  server writes `GET /library/export` and applies `POST /library/import-json`.
- `src/lib/notify.js` — how non-component code raises a message; the library uses
  it when an optimistic write has to be rolled back.
- `src/lib/youtube/iframe-api.js` — loads the IFrame Player API once per page and
  maps its error codes to `unavailable` / `other`.
- `src/lib/playlist.js` — pure playlist operations (normalising untrusted data,
  reconciling the playback order, merging a re-import) that the state modules build on.
- `src/lib/state/*.svelte.js` — rune-based singletons: `settings` (local),
  `library` (the account's playlists and ratings, read from and written to the API,
  applied on screen first and rolled back on refusal) and `session` (the rating
  queue, in memory).
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
  `local-import.js` next to them owns the one-time migration off this device — when
  to offer it, what to post, and the rename afterwards — and `LocalImportPrompt.svelte`
  is the card that asks.
- `/rate` is the rating session. `?v=<videoId>` starts it at a video — even one
  the filter excludes, which is what a card's "Rate" button links to. `?tiers=S,A`
  and `?unrated=0` mirror the queue filter and stay in sync with the toolbar.
- `src/lib/components/Player.svelte` wraps the YouTube IFrame Player API: it takes
  a `videoId` plus callbacks and exposes `play`, `pause`, `seekTo`, `seekBy`,
  `replay`, `mute`, `unMute`, `isMuted`, `changeVolume`, `getCurrentTime`, `focus`,
  `iframe`, `requestFullscreen` and `exitFullscreen` via `bind:this` — the seek,
  mute and volume calls are what the proxied player keys drive, and `iframe` is
  there for the one question only the page can ask: whether the focus has just
  moved into the embed. Fullscreen goes to its own wrapper (`src/lib/fullscreen.js` hides
  the prefixes, the refusals and the orientation lock), and anything rendered into
  the component shows up inside that wrapper — which is how
  `components/rate/PlayerOverlay.svelte` gets on screen while fullscreen. How the
  embed itself is configured is `youtube/player-vars.js`, one decision per line.
- The Rate page's rules are pure modules next to it:
  `components/rate/shortcuts.js` (the key mapping of both layers, the hints and the
  conflict notes, over `$lib/keybindings.js`; `components/rate/ShortcutsDialog.svelte`
  is the editor),
  `components/rate/playback.js` (what the end of a video means, loop included),
  `components/rate/overlay-visibility.js` (when the fullscreen overlay is up: the
  whole idle-hide rule minus the clock and minus the DOM, so the page only owns the
  `setTimeout` and the signals that count as a sign of life),
  `components/rate/window-blur.js` (what a `window` blur is worth — the only trace a
  tap on the cross-origin video ever leaves: a toggle on touch, a wake on a mouse,
  the keyboard back out of the iframe, or nothing at all, because a tab switch and a
  video change of our own blur the window too)
  and `components/rate/undo.js` (how a reversible step reads).
- `src/lib/media.svelte.js` answers "who is driving this session" as reactive state:
  the mouse query `PointerWake` needs and the touch query the blur rule needs, in one
  place so the two cannot drift apart.
- Three tier controls, all driven by `src/lib/tiers.js`:
  `components/TierPicker.svelte` (compact, on a Browse card, with a clear button),
  `components/rate/TierBar.svelte` (thumb-sized, sticky, with the bound key as a
  hint while the rating keys are on) and the row inside `components/rate/PlayerOverlay.svelte`, which
  is the only one that is on screen while the player is fullscreen. That overlay
  shares the screen with the browser's and YouTube's own controls, so what it may
  cover is a contract rather than taste: `PlayerOverlay.test.js` renders it through
  `svelte/server` and holds that structure down.
- `components/rate/PointerWake.svelte` is the other half of that bargain: while the
  overlay has faded out, it covers the player with a transparent layer so that the
  first mouse movement — which the cross-origin iframe would otherwise keep to
  itself — can bring the overlay back. It exists only on mouse setups and only while
  the overlay is away; on a touch screen it would swallow the tap the embed needs,
  which is why its render test pins that it paints nothing until `matchMedia` says
  there is a mouse. Tests elsewhere stick to the pure modules — a render test earns
  its place only where the markup, or its absence, _is_ the behaviour.

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
  landed; `db/testing.js` — the advisory lock the `*.db.test.js` suites queue on so
  two of them never wipe one database at the same time.
- `src/lib/server/http.js` — `json` / `jsonError`, the one response shape the API
  uses, `readJson` and `apiHandler` (an unplanned throw is still that shape), and
  `jsonMutationGuard`, the cross-site check every JSON mutation passes through;
  `src/lib/server/meta.js` — the `/api/v1/meta` payload and this process' start time.
- `src/lib/server/youtube.js` — the Data API calls, with the installation's key and
  a typed `YouTubeApiError`; the browser never talks to Google.
- `src/lib/server/library/` — the library API in three layers: `store.js` is the
  only module that knows the tables exist and **every one of its functions takes a
  `user_id` and puts it in the `where`**; `service.js` is import, import-json,
  export and removal with the HTTP left out; `http.js` is the body validation and
  the YouTube-reason-to-status mapping, both pure; `session.js` turns the hook's
  promise of a session into a check. `library.db.test.js` drives `service.js` and
  `store.js` against a real Postgres, including a second account trying every route
  into the first one's data.
- `src/lib/server/auth/` — accounts, one module per noun: `password.js` (Argon2id,
  and the decoy hash that makes an unknown address cost the same as a wrong
  password), `tokens.js` (32 random bytes out, a SHA-256 into the database),
  `sessions.js` (the `amv_session` cookie, the sliding expiry, `startSession` /
  `endSession`), `login.js` (`authenticate`, the whole decision a sign-in makes, so
  it can be tested against a database without a request), `invites.js`, `users.js`
  (validation, the bootstrap admin, `isDuplicateEmail`) and `rate-limit.js`.
- `src/lib/auth/routes.js` is deliberately **not** server-only: `hooks.server.js`,
  `src/routes/+layout.js` and `vite.config.js` all need the same lists of paths,
  because with `ssr = false` a navigation inside the SPA never reaches the server and
  the service worker's `navigateFallbackDenylist` has to agree with both.
  `src/lib/auth/enhance.js` is the one `use:enhance` handler the three account forms
  share; `src/lib/components/auth/AuthCard.svelte` is the frame they are drawn in.
- `src/routes/healthz/+server.js` (no database), `src/routes/api/v1/meta/+server.js`
  (needs one, 503 without it) and `src/routes/api/v1/me/+server.js` (the signed-in
  account).
- `/login`, `/logout`, `/invite/[token]` and `/admin` are form-action routes: the
  password is posted by the browser and never touched by client code, and
  SvelteKit's own origin check is the CSRF protection. `src/lib/state/auth.svelte.js`
  is the browser's copy of "who is signed in", filled from `/api/v1/me`.

The icons in `static/` are committed, so the build never needs `sharp`. Re-run
`npm run icons` only after editing the motif in `scripts/generate-icons.mjs`.

The original vanilla-JS prototype (`index.html`, `index.js`, `start-server.sh`) was
removed once its logic had been ported into these modules.
