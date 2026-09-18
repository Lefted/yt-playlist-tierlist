<script>
	/**
	 * What the Browse page shows before anything has been imported: what the app
	 * does, what it needs, and the two ways in (fetch from YouTube, or restore a
	 * previous export — the playlist card's "Import JSON" is out of reach here).
	 */
	import ListVideo from '@lucide/svelte/icons/list-video';
	import Upload from '@lucide/svelte/icons/upload';

	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import TierBadge from '$lib/components/TierBadge.svelte';
	import { TIERS } from '$lib/tiers.js';
	import JsonFileInput from './JsonFileInput.svelte';
	import Notice from './Notice.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {() => void} onimport - Opens the import dialog.
	 */

	/** @type {Props} */
	let { onimport } = $props();

	/** @type {JsonFileInput | null} */
	let picker = $state(null);
	/** @type {import('./json-file.js').Notice | null} */
	let notice = $state(null);
</script>

<div class="flex flex-1 items-center justify-center py-8">
	<Card.Root class="w-full max-w-lg">
		<Card.Header>
			<div
				class="bg-muted text-muted-foreground mb-2 flex size-10 items-center justify-center rounded-lg"
			>
				<ListVideo class="size-5" />
			</div>
			<Card.Title class="text-xl">Rank a YouTube playlist</Card.Title>
			<Card.Description>
				Import any public playlist, watch the videos one by one and drop each into a tier from S
				down to F. Everything — the playlist, your ratings and your API key — stays in this browser.
			</Card.Description>
		</Card.Header>

		<Card.Content class="grid gap-4">
			<div class="flex flex-wrap items-center gap-1.5">
				{#each TIERS as tier (tier.rating)}
					<TierBadge rating={tier.rating} size="md" />
				{/each}
			</div>

			<p class="text-muted-foreground text-sm">
				You need a personal YouTube Data API key — the import dialog links to the page that creates
				one. Already have an export from an earlier session? Restore it instead.
			</p>

			{#if notice}
				<Notice tone={notice.tone}>{notice.text}</Notice>
			{/if}
		</Card.Content>

		<Card.Footer class="flex flex-wrap gap-2">
			<Button onclick={onimport}>Import playlist</Button>
			<Button variant="outline" onclick={() => picker?.pick()}>
				<Upload class="size-4" />
				Restore from JSON
			</Button>
			<JsonFileInput bind:this={picker} onresult={(result) => (notice = result)} />
		</Card.Footer>
	</Card.Root>
</div>
