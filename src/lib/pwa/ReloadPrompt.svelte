<script>
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import { serviceWorker } from './service-worker.svelte.js';

	$effect(() => serviceWorker.register());
</script>

{#if serviceWorker.updateReady || serviceWorker.offlineReady}
	<div
		role="status"
		aria-live="polite"
		class="bg-card fixed right-4 bottom-[calc(var(--app-tab-bar-inset)+1rem)] left-4 z-50 flex items-center gap-3 rounded-lg border p-3 shadow-lg md:left-auto md:w-96"
	>
		<p class="flex-1 text-sm">
			{#if serviceWorker.updateReady}
				Update available
			{:else}
				The app is ready to work offline.
			{/if}
		</p>

		{#if serviceWorker.updateReady}
			<Button size="sm" onclick={() => serviceWorker.applyUpdate()}>
				<RefreshCw class="size-3.5" aria-hidden="true" />
				Reload
			</Button>
		{/if}

		<Button size="icon-sm" variant="ghost" onclick={() => serviceWorker.dismiss()}>
			<X class="size-3.5" aria-hidden="true" />
			<span class="sr-only">Dismiss</span>
		</Button>
	</div>
{/if}
