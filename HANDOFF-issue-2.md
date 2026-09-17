# Handoff — issue #2 (stack upgrade)

Branch: `worktree-agent-ae44ebc37a171ebaa`
Worktree: `C:\Users\Moritz.Gartner\repos\yt-playlist-tierlist\.claude\worktrees\agent-ae44ebc37a171ebaa`
Base: `main` @ `02871bb`

Work was paused on request. The branch is in a **complete and green** state — everything in
the issue's scope is implemented; only the hand-off comment on the issue was still open.

## Status per scope item

| #   | Item                 | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Upgrade dependencies | done   | svelte 5.57.0, @sveltejs/kit 2.70.3, @sveltejs/vite-plugin-svelte 7.3.0, vite 8.3.0, svelte-check 4.7.6, eslint 10.10.0 + eslint-plugin-svelte 3.23.0, prettier 3.9.7 + prettier-plugin-svelte 4.1.1 + prettier-plugin-tailwindcss 0.8.1, typescript 6.0.3. Removed: svelte-radix, lucide-svelte, postcss, autoprefixer, clsx, tailwind-merge (the last two are replaced by the `cn` package shadcn-svelte 1.x uses). `tailwind-variants` stays — shadcn-svelte 1.x components still use it. |
| 2   | Tailwind 4           | done   | `@tailwindcss/vite` in `vite.config.js`; `src/app.css` is CSS-first (`@import 'tailwindcss'`, `@custom-variant dark`, tokens, `@theme inline`). `tailwind.config.js` and `postcss.config.js` deleted. Colour tokens are zinc + the original orange accent (light `oklch(0.705 0.213 47.604)` = orange-500, dark `oklch(0.646 0.222 41.116)` = orange-600, `--ring` = the same orange, `--radius: 0.5rem`) — identical to the previous HSL values.                                            |
| 3   | shadcn-svelte 1.x    | done   | `components.json` regenerated; button, card, dropdown-menu, progress, separator, sheet, toggle, toggle-group re-added; all 0.x files gone; icons via `@lucide/svelte` 1.47; mode-watcher 1.1. **Deviation:** style `new-york` no longer exists in shadcn-svelte 1.7 — the default style is now `nova` (see below).                                                                                                                                                                           |
| 4   | Static SPA           | done   | `@sveltejs/adapter-static` with `fallback: 'index.html'`; `src/routes/+layout.js` exports `ssr = false` and `prerender = false`; `npm run build` writes `build/index.html` + `build/_app`.                                                                                                                                                                                                                                                                                                   |
| 5   | Runes migration      | done   | Navbar, Player, `+layout.svelte`, `browse/+page.svelte`, `state/Playlist.svelte.js`. No `on:click`, `asChild`, `let:`, `$app/stores`, `svelte-radix` or `lucide-svelte` left in `src/`.                                                                                                                                                                                                                                                                                                      |
| 6   | Vitest               | done   | `npm test` = `vitest run`, `npm run test:watch` = `vitest`; tests in `src/lib/utils.test.js` and `src/lib/state/Playlist.svelte.test.js` (runes modules run fine under vitest).                                                                                                                                                                                                                                                                                                              |
| 7   | Lint/format          | done   | `eslint.config.js` flat config for eslint-plugin-svelte 3 (passes `svelteConfig` to the parser); `.editorconfig` added; the legacy root `index.js` / `index.html` are excluded from eslint and prettier instead of being reformatted.                                                                                                                                                                                                                                                        |
| 8   | README               | done   | Boilerplate replaced with the real stack, commands, deployment note and a note on the legacy prototype.                                                                                                                                                                                                                                                                                                                                                                                      |

Out of scope and untouched, as required: root `index.html`, `index.js`, `start-server.sh`;
the placeholder dashboard content on `/browse`; `/` still shows the create-svelte page
(the redirect to `/browse` belongs to the routing ticket).

## Quality gate (last run, all on the current HEAD)

| Command         | Result                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `npm run check` | **pass** — `COMPLETED 763 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS` |
| `npm run lint`  | **pass** — `All matched files use Prettier code style!`, eslint silent     |
| `npm test`      | **pass** — `Test Files 2 passed (2)`, `Tests 3 passed (3)`                 |
| `npm run build` | **pass** — `built in 7.14s`, `Wrote site to "build"` (index.html present)  |

Manual check: `npx vite dev --port 5180 --strictPort` → `GET /browse` = 200 HTML, no
warnings in the Vite log; in the browser the theme toggle switches dark/light, the filter
dropdown opens, the tier toggle group toggles, and the mobile sheet opens with both nav
links. The dev server was stopped again.

```
npm ls svelte @sveltejs/kit bits-ui tailwindcss vite --depth=0
├── @sveltejs/kit@2.70.3
├── bits-ui@2.19.2
├── svelte@5.57.0
├── tailwindcss@4.3.3
└── vite@8.3.0
```

No peer-dependency warnings (`npm ls` shows no `invalid`/`UNMET`/peer entries).

## Toolchain commands that worked

The shadcn-svelte 1.7 CLI is interactive and **cannot** finish `init` without a TTY: it stops
at the "Updates to your src/app.css are required … Continue?" prompt (piping newlines or
`yes ''` does not answer a clack prompt, and winpty has no console to attach to). `add`,
however, takes `--overwrite`, which skips exactly that prompt. Working sequence:

```bash
# 1. Tailwind 4 + an app.css containing only `@import 'tailwindcss';` must exist first.
# 2. Create components.json (init gets far enough to write it before the CSS prompt):
npx shadcn-svelte@1.7.0 init --preset b3QwSmN2e --base-color zinc --css src/app.css \
  --components-alias '$lib/components' --lib-alias '$lib' --utils-alias '$lib/utils' \
  --hooks-alias '$lib/hooks' --ui-alias '$lib/components/ui' --no-deps-install < /dev/null

# 3. Install the design system (theme tokens, utils, style) via `add` with --overwrite:
npx shadcn-svelte@1.7.0 add "https://shadcn-svelte.com/init?preset=b3QwSmN2e" -y -o --no-deps-install

# 4. Components:
npx shadcn-svelte@1.7.0 add button card dropdown-menu progress separator sheet toggle toggle-group -y -o --no-deps-install

# 5. npm install
```

`--preset` is a base62-encoded design-system config, not a name. `b3QwSmN2e` =
`{style: 'nova', baseColor: 'zinc', theme: 'orange', iconLibrary: 'lucide', radius: 'default',
font: 'inter', fontHeading: 'inherit', menuColor: 'default', menuAccent: 'subtle'}`. Generate
another one with `encodePreset()` from the CLI's `shadcn-svelte/preset` entry point. The
preset endpoint is `https://shadcn-svelte.com/init?preset=<code>`; items live under
`https://shadcn-svelte.com/registry/styles/<style>/<item>.json`.

## Known problems / deliberate deviations

1. **Style `nova`, not `new-york`.** shadcn-svelte 1.7 replaced the old style names; `nova`
   is the current default (the successor to new-york). The 1.x components are visually a bit
   tighter than the 0.x ones (e.g. default button height h-8 instead of h-9) — unavoidable
   when regenerating on the new design system.
2. **Inline empty PostCSS config in `vite.config.js`** (`css: { postcss: { plugins: [] } }`).
   This worktree lives _inside_ the main checkout, which still has the old
   `postcss.config.js`; without the inline config Vite walks up, finds it and fails the build
   with "`@layer base` is used but no matching `@tailwind base` directive". Once this branch
   is merged and the parent's `postcss.config.js` is gone, the three lines can be dropped —
   they are harmless either way and also protect against monorepo/worktree setups.
3. **`@internationalized/date`** sits in devDependencies without being imported: it is a
   required peer dependency of bits-ui 2 and was added by the CLI. Keep it.
4. **Navbar uses `resolve()` from `$app/paths`.** eslint-plugin-svelte 3 enforces
   `svelte/no-navigation-without-resolve`, so plain `href="/browse"` fails `npm run lint`.
   The nav entries are typed as `import('$app/types').RouteId`. The rule is switched off for
   the vendored `src/lib/components/ui/**` components, whose `href` prop is generic.
5. **Player is a placeholder.** The old code built an iframe imperatively (which
   `svelte/no-dom-manipulating` rejects) and called `new YT.Player(...)` from a
   `<svelte:head>` script tag that Svelte never executes. It now renders the embed
   declaratively and shows the loading placeholder while no video is selected. The previous
   `currentVideo === {}` check was always false, so the placeholder never appeared. The real
   YouTube iframe API integration belongs to the rating ticket.
6. **`src/lib/state/Playlist.svelte.js`** still carries the _old_ JSDoc shape (with every
   field optional, `export const` instead of the `export let` Svelte 5 rejects). The epic's
   domain model (`RATING_ORDER`, `durationSeconds`, `channelTitle`, `src/lib/types.js`) is
   deliberately left to the state/domain ticket.
7. The first dev-server page load logs one
   `Failed to fetch dynamically imported module: /.svelte-kit/generated/client/nodes/0.js`
   in the browser console — that is Vite's dependency pre-bundling reload, gone on reload.

## Code review

`/polarkings-engineering:code-review` ran (standards + spec axes, against `main`). Findings
implemented: orange accent/radius restored, Inter web font dropped, dead `YT.Player` hookup
removed, duplicated placeholder condition collapsed, tier items iterated instead of
copy-pasted, `cn` moved to dependencies, vendor-contract assertions replaced with a test of
the state module, and a stray unformatted `src/routes/rate/+page.svelte` (a `git checkout`
had reverted the prettier pass) re-formatted so `npm run lint` is green.
Findings skipped, with reason: placeholder dashboard content and the future domain model are
explicitly out of scope for this ticket; `@internationalized/date` and the inline PostCSS
config are needed (see above).

## Next steps, in order

1. Post the hand-off comment on issue #2 (this file) — **done as part of the pause**.
2. Optional: re-run `npm run check && npm run lint && npm test && npm run build` to confirm
   nothing rotted, then merge the branch into `main` locally.
3. After merging, delete the now-obsolete `postcss.config.js` guard in `vite.config.js`
   if the parent checkout no longer carries a `postcss.config.js`.
4. Continue with the follow-up tickets: `/` → `/browse` redirect, domain model in
   `src/lib/types.js`, rune-based state modules plus `src/lib/storage.js`, then the real
   browse/rate UI.
