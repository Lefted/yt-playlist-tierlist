<script>
	import WifiOff from '@lucide/svelte/icons/wifi-off';

	import { network } from './network.svelte.js';
</script>

{#if !network.online}
	<span
		class="border-border text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
		role="status"
		title="You are offline. Your library still works; playback and imports do not."
	>
		<WifiOff class="size-3.5" aria-hidden="true" />
		Offline
	</span>
{/if}
