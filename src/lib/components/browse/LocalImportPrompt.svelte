<script>
	/**
	 * "This browser still has a tier list from before you had an account."
	 *
	 * Shown on Browse when `shouldOfferLocalImport` says so — a fresh account on a
	 * machine that used the app when the library lived in `localStorage`. Taking the
	 * offer posts the stored payload through the ordinary backup path and renames the
	 * key; declining hides the card for this visit and leaves the key alone, and the
	 * same action stays available from the playlist card's menu.
	 */
	import HardDriveDownload from '@lucide/svelte/icons/hard-drive-download';
	import Loader from '@lucide/svelte/icons/loader-circle';

	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { importLocalLibrary } from './local-import.js';
	import Notice from './Notice.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {() => void} [ondone] - Called once the offer has been taken or
	 *   declined, so the page can stop asking.
	 */

	/** @type {Props} */
	let { ondone } = $props();

	let busy = $state(false);
	/** @type {import('./json-file.js').Notice | null} */
	let notice = $state(null);

	/** @returns {Promise<void>} */
	async function run() {
		busy = true;
		try {
			notice = await importLocalLibrary();
			if (notice.tone === 'ok') ondone?.();
		} finally {
			busy = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<div
			class="bg-muted text-muted-foreground mb-2 flex size-10 items-center justify-center rounded-lg"
		>
			<HardDriveDownload class="size-5" />
		</div>
		<Card.Title class="text-lg">Import the tier list stored on this device?</Card.Title>
		<Card.Description>
			This browser still holds a library from before the app had accounts. Importing copies it into
			your account, where it follows you to other devices. Ratings are never overwritten, and this
			browser's copy is kept.
		</Card.Description>
	</Card.Header>

	{#if notice}
		<Card.Content>
			<Notice tone={notice.tone}>{notice.text}</Notice>
		</Card.Content>
	{/if}

	<Card.Footer class="flex flex-wrap gap-2">
		<Button disabled={busy} onclick={run}>
			{#if busy}
				<Loader class="size-4 animate-spin" />
				Importing…
			{:else}
				Import it
			{/if}
		</Button>
		<Button variant="ghost" disabled={busy} onclick={() => ondone?.()}>Not now</Button>
	</Card.Footer>
</Card.Root>
