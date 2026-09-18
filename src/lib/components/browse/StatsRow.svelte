<script>
	/**
	 * The four numbers that describe an imported playlist at a glance.
	 * Everything is read straight off the library, so it updates with every rating.
	 */
	import * as Card from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import TierBadge from '$lib/components/TierBadge.svelte';
	import { percentOf } from './format.js';

	/**
	 * @typedef {Object} Props
	 * @property {number} total - Videos in the playlist, unavailable ones included.
	 * @property {number} rated - Playable videos that carry a tier.
	 * @property {number} available - Playable videos.
	 * @property {number} sTier - Videos in the top tier.
	 */

	/** @type {Props} */
	let { total, rated, available, sTier } = $props();

	const unavailable = $derived(Math.max(0, total - available));
	const ratedPercent = $derived(percentOf(rated, available));
	const sTierPercent = $derived(percentOf(sTier, available));
</script>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Card.Root class="gap-2">
		<Card.Header>
			<Card.Description>Videos</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{total}</Card.Title>
		</Card.Header>
		<Card.Content class="text-muted-foreground text-xs">
			{available} playable
		</Card.Content>
	</Card.Root>

	<Card.Root class="gap-2">
		<Card.Header>
			<Card.Description>Rated</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{rated}</Card.Title>
		</Card.Header>
		<Card.Content>
			<Progress
				value={ratedPercent}
				class="h-1.5"
				aria-label={`${ratedPercent}% of the playable videos are rated`}
			/>
			<p class="text-muted-foreground mt-2 text-xs">
				{ratedPercent}% of {available}
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root class="gap-2">
		<Card.Header>
			<Card.Description class="flex items-center gap-1.5">
				<TierBadge rating="S" size="sm" />
				Top tier
			</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{sTier}</Card.Title>
		</Card.Header>
		<Card.Content class="text-muted-foreground text-xs">
			{sTierPercent}% of the playable videos
		</Card.Content>
	</Card.Root>

	<Card.Root class="gap-2">
		<Card.Header>
			<Card.Description>Unavailable</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{unavailable}</Card.Title>
		</Card.Header>
		<Card.Content class="text-muted-foreground text-xs">
			{unavailable === 0 ? 'Nothing is missing' : 'private, deleted or unembeddable'}
		</Card.Content>
	</Card.Root>
</div>
