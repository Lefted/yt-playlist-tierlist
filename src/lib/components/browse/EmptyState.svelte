<script>
	/**
	 * What the Browse page shows before anything has been imported: what the app
	 * does, what it needs, and the two ways in (fetch from YouTube, or restore a
	 * previous export).
	 */
	import ListVideo from '@lucide/svelte/icons/list-video';
	import Upload from '@lucide/svelte/icons/upload';

	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import TierBadge from '$lib/components/TierBadge.svelte';
	import { TIERS } from '$lib/tiers.js';
	import { library } from '$lib/state/library.svelte.js';
	import { importErrorMessage } from './errors.js';

	/**
	 * @typedef {Object} Props
	 * @property {() => void} onimport - Opens the import dialog.
	 */

	/** @type {Props} */
	let { onimport } = $props();

	/** @type {HTMLInputElement | null} */
	let fileInput = $state(null);
	/** @type {string} */
	let error = $state('');

	/**
	 * @param {Event} event
	 * @returns {Promise<void>}
	 */
	async function restore(event) {
		const target = /** @type {HTMLInputElement} */ (event.currentTarget);
		const file = target.files?.[0];
		target.value = '';
		if (!file) return;

		error = '';
		try {
			library.importJson(await file.text());
		} catch (cause) {
			error = importErrorMessage(cause);
		}
	}
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

			{#if error}
				<p
					class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-xs"
					role="alert"
				>
					{error}
				</p>
			{/if}
		</Card.Content>

		<Card.Footer class="flex flex-wrap gap-2">
			<Button onclick={onimport}>Import playlist</Button>
			<Button variant="outline" onclick={() => fileInput?.click()}>
				<Upload class="size-4" />
				Restore from JSON
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={restore}
			/>
		</Card.Footer>
	</Card.Root>
</div>
