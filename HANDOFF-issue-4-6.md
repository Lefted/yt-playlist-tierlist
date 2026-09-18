# Hand-off: #4 (Player) and #6 (Rate page)

Branch `worktree-agent-a5626349632771ba5`, worktree
`C:\Users\Moritz.Gartner\repos\yt-playlist-tierlist\.claude\worktrees\agent-a5626349632771ba5`.
Paused at the coordinator's request. **Both tickets are implemented, reviewed and
green** — this is a pause, not an unfinished stretch of work. `main` (32cae39,
including #5 Browse) is merged in; the merge had no conflicts.

## Status of #4 — Player component

Done, every scope bullet:

- **Props** `videoId`, `autoplay`, `onended`, `onerror`, `onstatechange`, `onready`, `class` — done.
- **Load `iframe_api` once** — `src/lib/youtube/iframe-api.js` caches one module-level
  promise, resolves immediately when `window.YT.Player` already exists, chains any
  existing `onYouTubeIframeAPIReady`, injects at most one script tag, and lets a
  failed load be retried. No `<svelte:head>`. 11 unit tests.
- **Create the player once, then `loadVideoById`/`cueVideoById`** — done. The
  creation effect depends on _whether_ there is a video, not on which one, so rapid
  `videoId` changes cannot spawn a second iframe. Destroyed in the effect cleanup.
- **Player params** `playsinline`, `rel`, `modestbranding`, `enablejsapi`, `origin`,
  `autoplay` — done.
- **Imperative methods** — done (see the API below).
- **Error mapping** 100/101/150 → `'unavailable'`, everything else → `'other'` —
  done in `errorReasonFor`, unit-tested.
- **16:9 container + film-icon placeholder** — done (`aspect-video w-full`).
- **No `window` at module top level** — done; the loader only touches `globalThis`
  inside `loadIframeApi()`.

Deviation: the loader lives in its own module rather than inside `Player.svelte`.
The promise is still module-level; a separate module is what made it testable
without a DOM.

## Status of #6 — Rate page

Done, every scope bullet:

- `?v=` → `session.jumpTo`, `?tiers=`/`?unrated=` filter params kept in sync with
  the toolbar — done (details below).
- Player fills the width; title, channel, duration, `n / total` and the rating
  badge below it — done (`NowPlaying.svelte`).
- Tier bar: six buttons, ≥ 48 px (56 px on touch), coloured from `src/lib/tiers.js`,
  rates and auto-advances — done.
- Secondary actions Previous / Skip / Replay / Fullscreen / Mark unavailable /
  Shuffle — done (playback ones in the sticky bar, the rest in the toolbar).
- Keyboard shortcuts incl. the `?` help popover — done, unit-tested.
- Ended + unrated → tier bar highlights **and takes focus**; ended + already rated →
  advance — done.
- `onerror('unavailable')` → `library.markUnavailable(id)`, toast, advance — done.
  (Coordinator's question: **yes**, the Rate page calls `library.markUnavailable(videoId)`
  on 100/101/150, and Browse's assumption holds.)
- Session-end summary card with per-tier counts, "Browse results" and
  "Include rated videos" — done.
- Settings popover (skip rated, auto-advance, fullscreen on play) — done.
- Mobile: sticky tier bar above the tab bar, safe-area padding, landscape cap on
  the player — done.
- No playlist → empty state pointing at `/browse` — done.
- Unit tests for the keyboard mapping and the other pure logic — done.

## Player public API (for #8 and for Browse)

```svelte
<Player
  bind:this={player}
  videoId={string|null}          // null → placeholder, player torn down
  autoplay={boolean}             // default true; false cues instead of playing
  onended={() => void}
  onerror={(reason: 'unavailable'|'other') => void}
  onstatechange={(state: number) => void}   // PLAYER_STATE from $lib/youtube/iframe-api.js
  onready={() => void}
  class={string}
/>
```

Exported functions (via `bind:this`): `play()`, `pause()`, `seekTo(seconds)`,
`replay()`, `getCurrentTime()`, `requestFullscreen()`.
`requestFullscreen()` is **async** and resolves to `false` when the browser refuses
(iOS, or no user gesture) — await it if you want to tell the user.

`src/lib/youtube/iframe-api.js` also exports `PLAYER_STATE`, `errorReasonFor(code)`
and `loadIframeApi()`.

## Rate page query params and components

- `?v=<videoId>` — start at that video; it is pinned past the filter. Consumed on
  load and **not** written back (a reload should not jump backwards). An unknown id
  warns via toast.
- `?tiers=S,A` — tier filter, unescaped commas, always in `RATING_ORDER`.
- `?unrated=0` — leave unrated videos out (`0|false|no|off`; anything else is on).
- The canonical query is empty for the default filter, and is written with
  `replaceState` only after the user changes the filter.

Components under `src/lib/components/rate/`: `TierBar.svelte` (exports `focus()`),
`PlaybackControls.svelte`, `NowPlaying.svelte`, `SessionToolbar.svelte`
(bindable `helpOpen`), `SessionSummary.svelte`, `EmptyLibrary.svelte`, plus the
pure helpers `shortcuts.js` and `params.js`.

Additive state change: **`session.advancePast(videoId)`** (4 new tests) — "the video
left the queue, so do not advance on top of it". `rateCurrent` now uses it too; no
export was renamed or removed.

Shell/layout: one `<Toaster position="top-center" />` in `src/routes/+layout.svelte`,
as allowed. New shadcn components: `popover`, `switch`, `sonner`, `tooltip`
(`tooltip` had been removed by #5 as unused; the Rate page uses it again).

## Quality gate (after merging main 32cae39)

| command         | result                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| `npm run check` | 0 errors / 0 warnings, 4903 files                                       |
| `npm run lint`  | clean (prettier + eslint)                                               |
| `npm test`      | **254 passed**, 18 files                                                |
| `npm run build` | green (the known workbox `prerendered/**` glob warning from #7 remains) |

Browser-verified on `vite dev --port 5183` (server stopped, port free): the player
plays, `a`/`b`/`s` rate and advance, ratings survive a reload, the queue empties into
the summary card, "Include rated videos" refills it, an unplayable id is marked and
skipped automatically, a video that ends unrated highlights _and_ focuses the tier
bar, `space` toggles play/pause without scrolling, `?` opens and closes the help
list, the filter popover writes `?tiers=…`, and a deep link restores filter + video.
At 390×844 there is no horizontal scroll and the sticky bar sits directly above the
tab bar (56 px tier buttons); at 844×390 the whole 16:9 player stays visible.

## Known problems

- None blocking. The offscreen automation tab never paints, so CSS exit animations
  never finish there and a closed popover keeps its node — that is why the overlay
  check ignores `[data-state="closed"]`. Worth one click-through in a real window.
- No real iOS device was available: `playsinline`, the safe-area padding and the
  fullscreen refusal path are implemented per spec but only verified in Chrome.

## Review findings

Both axes of `polarkings-engineering:code-review` ran and **all valid findings are
implemented** (commit "Apply the code-review findings"). Deliberately not applied:

- `v` stays out of the canonical query — see above.
- The progress bar / "x / y rated" counter stays: `session.progress` exists for this
  page and has no other consumer.
- The shuffle, deep-link and non-`unavailable` toasts and the summary's
  "Clear the filter" button stay: each is the only feedback its action gets, and the
  last one only renders while a filter is active.
- `seekTo`, `getCurrentTime` and `onready` stay although the Rate page does not call
  them — ticket #4 lists them verbatim.

## Ordered next steps (for whoever resumes)

1. **Post the hand-off comments** — `gh issue comment 6 --body-file HANDOFF-issue-4-6.md`
   and a pointer on #4 (done as part of this pause; re-check they are there).
2. **Optional reuse from #5**, deliberately left undone at the pause:
   - `src/lib/components/TierPicker.svelte` could _not_ simply replace
     `rate/TierBar.svelte` — the tier bar is a thumb-sized, sticky, six-column grid
     with key hints and a highlight state; TierPicker is a compact inline control
     with a clear button. If one control is wanted, merge them deliberately (size
     variants + optional key hints) rather than swapping one for the other.
   - `src/lib/components/browse/Notice.svelte` could back `EmptyLibrary.svelte`, but
     it lives under the Browse folder this worker does not own.
   - `src/lib/youtube/urls.js` — the Rate page has no "open on YouTube" link yet;
     adding one is a nice small follow-up for #8.
     (`src/lib/format.js` and `percentOf` are already reused; the duplicate
     `rate/format.js` was deleted during the merge.)
3. **Delete this file** before the final merge, or fold it into the issue comments.
