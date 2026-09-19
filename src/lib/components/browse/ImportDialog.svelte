<script>
	/**
	 * Import (or refresh) a playlist: a link, a spinner, and a real error message for
	 * every code the server can answer with.
	 *
	 * The API key field is gone since #17 — the server holds one key for the whole
	 * installation and does the fetching, so there is nothing personal to type here
	 * and nothing to show progress for: the answer arrives when the import is done.
	 *
	 * Full-screen on mobile, a centred dialog from `sm` up.
	 */
	import { untrack } from 'svelte';
	import Loader from '@lucide/svelte/icons/loader-circle';

	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	import { library } from '$lib/state/library.svelte.js';
	import { parsePlaylistInput } from '$lib/youtube/api.js';
	import { importErrorMessage } from './errors.js';
	import Notice from './Notice.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {boolean} open - Bindable; the page owns it so the toolbar and the empty state can both open the dialog.
	 * @property {string} [initialInput] - Pre-filled playlist id, used by "Re-import / refresh".
	 */

	/** @type {Props} */
	let { open = $bindable(false), initialInput = '' } = $props();

	let input = $state('');
	let busy = $state(false);
	/** @type {string} */
	let error = $state('');
	/** Set once the user submitted, so nothing is flagged red while they are still typing. */
	let submitted = $state(false);

	// Reset whenever the dialog is (re)opened; the playlist field comes from whatever
	// opened it (empty, or the playlist to refresh). `untrack` keeps `open` the only
	// trigger, so nothing can wipe the form in the middle of an import.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			input = initialInput;
			error = '';
			submitted = false;
		});
	});

	const playlistId = $derived(parsePlaylistInput(input));
	const inputInvalid = $derived(submitted && input.trim() !== '' && playlistId === null);
	const known = $derived(
		playlistId === null ? null : (library.playlists.find((p) => p.id === playlistId) ?? null)
	);

	/**
	 * @returns {Promise<void>}
	 */
	async function submit() {
		submitted = true;
		error = '';

		if (playlistId === null) {
			error =
				'Paste a playlist link (any YouTube URL with "list=") or a playlist id starting with PL, UU, FL or LL.';
			return;
		}

		busy = true;
		try {
			await library.importPlaylist(input);
			open = false;
		} catch (cause) {
			error = importErrorMessage(cause);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="top-0 left-0 h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 content-start gap-4 overflow-y-auto rounded-none p-4 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6"
		interactOutsideBehavior={busy ? 'ignore' : 'close'}
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		showCloseButton={!busy}
	>
		<Dialog.Header>
			<Dialog.Title>{known ? 'Refresh playlist' : 'Import a playlist'}</Dialog.Title>
			<Dialog.Description>
				The server reads the playlist from YouTube and stores it with your account, so it is there
				on every device you sign in on.
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="grid content-start gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div class="grid gap-1.5">
				<Label for="import-playlist">Playlist URL or id</Label>
				<Input
					id="import-playlist"
					type="text"
					autocomplete="off"
					spellcheck="false"
					placeholder="https://www.youtube.com/playlist?list=PL…"
					aria-invalid={inputInvalid ? 'true' : undefined}
					aria-describedby="import-playlist-hint"
					disabled={busy}
					bind:value={input}
				/>
				<p id="import-playlist-hint" class="text-muted-foreground text-xs">
					{#if playlistId}
						Playlist <span class="font-mono">{playlistId}</span>
					{:else}
						Any YouTube link containing "list=" works, as does the bare playlist id.
					{/if}
				</p>
			</div>

			{#if known}
				<Notice>
					<span class="text-foreground font-medium">{known.title}</span> is already imported. Re-importing
					refreshes titles and adds new videos — your ratings are kept, and videos that disappeared from
					the playlist stay in the list, flagged as unavailable.
				</Notice>
			{/if}

			{#if busy}
				<p class="text-muted-foreground flex items-center gap-2 text-xs" aria-live="polite">
					<Loader class="size-3.5 animate-spin" />
					Reading the playlist from YouTube — a long one takes a moment.
				</p>
			{/if}

			{#if error}
				<Notice tone="error">{error}</Notice>
			{/if}

			<Dialog.Footer class="gap-2 sm:justify-end">
				<Button type="button" variant="outline" disabled={busy} onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={busy}>
					{#if busy}
						<Loader class="size-4 animate-spin" />
						Importing…
					{:else}
						{known ? 'Refresh' : 'Import'}
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
