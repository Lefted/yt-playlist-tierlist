import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';
import { SHELL_FREE_PREFIXES } from './src/lib/auth/routes.js';

/** zinc-950 — matches `--background` of the dark palette in `src/app.css`. */
const THEME_COLOR = '#09090b';

/**
 * Navigations the precached shell must never answer.
 *
 * The session-dependent pages come straight from the route policy, so adding one
 * there is enough (`src/lib/auth/routes.js`). The two below are not navigations at
 * all — but a client-side route change to one would be, and an HTML shell is a poor
 * answer to a JSON request.
 */
const NO_CACHED_SHELL = [
	...SHELL_FREE_PREFIXES.map((prefix) => new RegExp(`^${prefix}(/|$)`)),
	/^\/api\//,
	/^\/healthz$/
];

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			strategies: 'generateSW',
			// The service worker is registered by `src/lib/pwa/ReloadPrompt.svelte` through
			// `virtual:pwa-register/svelte`; injecting a second registration would race it.
			injectRegister: null,
			kit: {
				// Every page is client-rendered (`ssr = false`), so one precached shell serves
				// them all. The shell is not a file any more — adapter-node renders it per
				// request — so the two options below are what puts it in the precache manifest
				// anyway: `spa` adds an explicit entry, revisioned from `_app/version.json`,
				// and `fallbackMapping` is the URL the server answers it under, which has to
				// be the `navigateFallback` below. `adapterFallback` only names that entry;
				// the plugin requires it to be set for `spa` to take effect.
				adapterFallback: 'index.html',
				spa: { fallbackMapping: '/' }
			},
			manifest: {
				id: '/',
				name: 'YT Tierlist',
				short_name: 'Tierlist',
				description: 'Rank the videos of a YouTube playlist into S/A/B/C/D/F tiers.',
				lang: 'en',
				display: 'standalone',
				orientation: 'any',
				scope: '/',
				start_url: '/browse',
				theme_color: THEME_COLOR,
				background_color: THEME_COLOR,
				categories: ['entertainment', 'utilities'],
				icons: [
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{
						src: 'maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					},
					{ src: 'apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' }
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,html,ico,png,svg,webp,woff,woff2,webmanifest}'],
				cleanupOutdatedCaches: true,
				// Every route is served by the SPA shell, so unknown navigations resolve offline too.
				navigateFallback: '/',
				// …except the routes whose answer depends on the session: serving the
				// cached shell for `/login` would hand a signed-out visitor a page instead
				// of the server's redirect, and for `/invite/<token>` it would swallow the
				// token. The price is that a *cold* offline start at one of these URLs
				// gets the browser's own error page — an offline start at `/` or `/browse`
				// still works and lands on the login form from there.
				navigateFallbackDenylist: NO_CACHED_SHELL,
				runtimeCaching: [
					{
						// The library API, stated rather than left to the default, because the
						// default is what a future rule could quietly change. Nothing under
						// `/api/` may be answered from a cache: a stale `GET /library` would
						// show ratings that are no longer there, and a queued write would
						// apply a tier the user has since taken back. Offline means the
						// optimistic update rolls back and says so (#17).
						urlPattern: /\/api\/v1\//,
						handler: 'NetworkOnly'
					},
					{
						// YouTube thumbnails are immutable per video and dominate the Browse page.
						urlPattern: /^https:\/\/i\.ytimg\.com\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'ytimg-thumbnails',
							expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
							cacheableResponse: { statuses: [0, 200] }
						}
					}
					// Deliberately no rule for googleapis.com or youtube.com/iframe_api: without
					// a matching route the worker leaves them on the network, and quota errors,
					// availability and playback all depend on a live response.
				]
			},
			// Keep the dev server free of a service worker; a stale precache is a poor
			// trade for HMR. The PWA is verified against `npm run build && npm run preview`.
			devOptions: { enabled: false }
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,svelte.js}']
	}
});
