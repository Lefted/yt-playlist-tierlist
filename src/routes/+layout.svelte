<script>
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { pwaInfo } from 'virtual:pwa-info';

	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import BottomTabBar from '$lib/components/shell/BottomTabBar.svelte';
	import ReloadPrompt from '$lib/pwa/ReloadPrompt.svelte';
	import { network } from '$lib/pwa/network.svelte.js';

	let { children } = $props();

	/**
	 * The plugin emits the manifest with a build-specific href, so the link tag has
	 * to come from `pwaInfo` rather than being hard-coded in `app.html`.
	 * Empty during dev, where the PWA is disabled.
	 */
	const webManifestLink = pwaInfo?.webManifest.linkTag ?? '';

	$effect(() => network.watch(window));
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- a build-time constant from vite-plugin-pwa, not user input -->
	{@html webManifestLink}
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
