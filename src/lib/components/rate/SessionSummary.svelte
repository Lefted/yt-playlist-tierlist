<script>
	/**
	 * Shown when the queue has run dry: what the session produced, and the two ways
	 * on from here — look at the result, or widen the queue and keep going.
	 */
	import { resolve } from '$app/paths';
	import Trophy from '@lucide/svelte/icons/trophy';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import TierBadge from '$lib/components/TierBadge.svelte';
	import { TIERS } from '$lib/tiers.js';
	import { library } from '$lib/state/library.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';

	const counts = $derived(library.counts);
	const filtered = $derived(session.filter.tiers.size > 0 || !session.includeUnrated);
</script>

<div class="mx-auto flex w-full max-w-xl flex-1 items-center p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Trophy class="text-primary size-5" aria-hidden="true" />
				Nothing left to rate
			</Card.Title>
			<Card.Description>
				{library.ratedCount} of {library.availableCount} playable videos in
				<span class="font-medium">{library.activePlaylist?.title ?? 'this playlist'}</span> carry a tier.
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			<dl class="grid grid-cols-6 gap-1.5 sm:gap-2">
				{#each TIERS as tier (tier.rating)}
					<div class="flex flex-col items-center gap-1">
						<dt><TierBadge rating={tier.rating} size="md" /></dt>
						<dd class="text-sm font-semibold tabular-nums">{counts[tier.rating]}</dd>
					</div>
				{/each}
			</dl>

			<div class="flex flex-wrap gap-2">
				<Button href={resolve('/browse')} size="lg">Browse results</Button>

				{#if settings.skipRated}
					<Button variant="outline" size="lg" onclick={() => (settings.skipRated = false)}>
						Include rated videos
					</Button>
				{/if}

				{#if filtered}
					<Button variant="ghost" size="lg" onclick={() => session.clearFilter()}>
						Clear the filter
					</Button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
</div>
