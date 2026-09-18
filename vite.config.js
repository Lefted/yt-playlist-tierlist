import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

/** zinc-950 — matches `--background` of the dark palette in `src/app.css`. */
const THEME_COLOR = '#09090b';

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
				// Mirrors `fallback: 'index.html'` in svelte.config.js. adapter-static runs
				// *after* this plugin, so the fallback page does not exist yet when the
				// precache manifest is built; `spa` adds it as an explicit entry, revisioned
				// from `_app/version.json`. `fallbackMapping` is the URL the server answers
				// it under, which has to be the `navigateFallback` below.
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
				runtimeCaching: [
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
