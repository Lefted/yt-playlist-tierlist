<script>
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { pwaInfo } from 'virtual:pwa-info';

	import { page } from '$app/state';

	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import BottomTabBar from '$lib/components/shell/BottomTabBar.svelte';
	import ReloadPrompt from '$lib/pwa/ReloadPrompt.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { isShellFreePath } from '$lib/auth/routes.js';
	import { network } from '$lib/pwa/network.svelte.js';

	let { children } = $props();

	/**
	 * `/login`, `/invite/*` and `/logout` are the pages you can reach without an
	 * account, and the chrome around them would only offer navigation that bounces
	 * straight back here.
	 */
	const showShell = $derived(!isShellFreePath(page.url.pathname));

	/**
	 * The manifest is emitted by vite-plugin-pwa, so its location comes from
	 * `pwaInfo` rather than from `app.html`. `pwaInfo` is undefined during dev,
	 * where the PWA is disabled.
	 *
	 * The href it reports is page-relative (SvelteKit builds with relative asset
	 * paths), which would resolve to the wrong place on a nested route served
	 * through the SPA fallback — so pin it to the site root, where the manifest's
	 * own `scope` and `start_url` (see vite.config.js) already assume the app lives.
	 */
	const webManifest = pwaInfo?.webManifest;
	const manifestHref = webManifest ? new URL(webManifest.href, location.origin).pathname : '';

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
	{#if showShell}
		<AppHeader />
	{/if}

	<!--
		`--app-tab-bar-inset` (see src/app.css) is the height of the mobile bottom tab
		bar, and 0 from `md` up. Pages therefore never need their own bottom padding.
	-->
	<div class="flex flex-1 flex-col {showShell ? 'pb-(--app-tab-bar-inset)' : ''}">
		{@render children()}
	</div>

	{#if showShell}
		<BottomTabBar />
	{/if}
	<ReloadPrompt />
	<!-- Top, because the bottom of small screens belongs to the tab bar and the Rate page's tier bar. -->
	<Toaster position="top-center" />
</div>
