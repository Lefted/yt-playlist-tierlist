<script>
	import '../app.css';
	import { base } from '$app/paths';
	import { ModeWatcher } from 'mode-watcher';
	import { pwaInfo } from 'virtual:pwa-info';

	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import BottomTabBar from '$lib/components/shell/BottomTabBar.svelte';
	import ReloadPrompt from '$lib/pwa/ReloadPrompt.svelte';
	import { network } from '$lib/pwa/network.svelte.js';

	let { children } = $props();

	/**
	 * The manifest is emitted by vite-plugin-pwa, so its location comes from
	 * `pwaInfo` rather than from `app.html`. `pwaInfo` is undefined during dev,
	 * where the PWA is disabled.
	 *
	 * The href it reports is page-relative (SvelteKit builds with relative asset
	 * paths), which would resolve to the wrong place on a nested route served
	 * through the SPA fallback — so pin it to the app root.
	 */
	const webManifest = pwaInfo?.webManifest;
	const manifestHref = webManifest
		? new URL(webManifest.href, `${location.origin}${base}/`).pathname
		: '';

	$effect(() => network.watch(window));
</script>

<svelte:head>
	{#if manifestHref}
		<link
			rel="manifest"
			href={manifestHref}
			crossorigin={webManifest?.useCredentials ? 'use-credentials' : undefined}
		/>
	{/if}
</svelte:head>

<ModeWatcher />

<div class="flex min-h-svh w-full flex-col">
	<AppHeader />

	<!--
		`--app-tab-bar-inset` (see src/app.css) is the height of the mobile bottom tab
		bar, and 0 from `md` up. Pages therefore never need their own bottom padding.
	-->
	<div class="flex flex-1 flex-col pb-(--app-tab-bar-inset)">
		{@render children()}
	</div>

	<BottomTabBar />
	<ReloadPrompt />
</div>
