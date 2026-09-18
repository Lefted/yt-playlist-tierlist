<script>
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * Registers the service worker and exposes its lifecycle.
	 *
	 * With `registerType: 'autoUpdate'` a new worker normally takes over on its
	 * own, but the browser can keep the old one alive (e.g. while another tab is
	 * open) — `needRefresh` covers that case and lets the user reload on demand.
	 */
	const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

	function dismiss() {
		needRefresh.set(false);
		offlineReady.set(false);
	}
</script>

{#if $needRefresh || $offlineReady}
	<div
		role="status"
		aria-live="polite"
		class="bg-card fixed right-4 bottom-[calc(var(--app-tab-bar-inset)+1rem)] left-4 z-50 flex items-center gap-3 rounded-lg border p-3 shadow-lg md:left-auto md:w-96"
	>
		<p class="flex-1 text-sm">
			{#if $needRefresh}
				A new version is available.
			{:else}
				The app is ready to work offline.
			{/if}
		</p>

		{#if $needRefresh}
			<Button size="sm" onclick={() => updateServiceWorker(true)}>
				<RefreshCw class="size-3.5" aria-hidden="true" />
				Reload
			</Button>
		{/if}

		<Button size="icon-sm" variant="ghost" onclick={dismiss}>
			<X class="size-3.5" aria-hidden="true" />
			<span class="sr-only">Dismiss</span>
		</Button>
	</div>
{/if}
