<script>
	/**
	 * Import (or refresh) a playlist: API key, playlist link, progress, and a real
	 * error message for every `YouTubeApiError.reason`.
	 *
	 * Full-screen on mobile, a centred dialog from `sm` up.
	 */
	import { untrack } from 'svelte';
	import Loader from '@lucide/svelte/icons/loader-circle';

	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';

	import { library } from '$lib/state/library.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { parsePlaylistInput } from '$lib/youtube/api.js';
	import { percentOf } from '$lib/utils.js';
	import { importErrorMessage } from './errors.js';
	import Notice from './Notice.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {boolean} open - Bindable; the page owns it so the toolbar and the empty state can both open the dialog.
	 * @property {string} [initialInput] - Pre-filled playlist id, used by "Re-import / refresh".
	 */

	/** @type {Props} */
	let { open = $bindable(false), initialInput = '' } = $props();

	let apiKey = $state(settings.apiKey);
	let input = $state('');
	let busy = $state(false);
	/** @type {import('$lib/youtube/api.js').ImportProgress | null} */
	let progress = $state(null);
	/** @type {string} */
	let error = $state('');
	/** Set once the user submitted, so nothing is flagged red while they are still typing. */
	let submitted = $state(false);

	// Reset whenever the dialog is (re)opened: the key comes from settings, the
	// playlist field from whatever opened it (empty, or the playlist to refresh).
	// `untrack` keeps `open` the only trigger — submitting writes `settings.apiKey`,
	// and a reset in the middle of an import would wipe the form under the user.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			apiKey = settings.apiKey;
			input = initialInput;
			error = '';
			progress = null;
			submitted = false;
		});
	});

	const playlistId = $derived(parsePlaylistInput(input));
	const inputInvalid = $derived(submitted && input.trim() !== '' && playlistId === null);
	const known = $derived(
		playlistId === null ? null : (library.playlists.find((p) => p.id === playlistId) ?? null)
	);

	const progressPercent = $derived(progress ? percentOf(progress.loaded, progress.total) : 0);
	const progressLabel = $derived(
		progress
			? `${progress.phase === 'items' ? 'Loading videos' : 'Loading durations'} ${progress.loaded} of ${progress.total || '?'}`
			: 'Contacting YouTube…'
	);

	/**
	 * @returns {Promise<void>}
	 */
	async function submit() {
		submitted = true;
		error = '';

		if (apiKey.trim() === '') {
			error = 'Enter your YouTube Data API key first.';
			return;
		}
		if (playlistId === null) {
			error =
				'Paste a playlist link (any YouTube URL with "list=") or a playlist id starting with PL, UU, FL or LL.';
			return;
		}

		busy = true;
		progress = null;
		// Persist the key before the request: a quota error two minutes later should
		// not cost the user the key they just typed.
		settings.apiKey = apiKey;
		try {
			await library.importPlaylist(settings.apiKey, input, {
				onProgress: (next) => {
					progress = next;
				}
			});
			open = false;
		} catch (cause) {
			error = importErrorMessage(cause);
		} finally {
			busy = false;
			progress = null;
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
				Videos are read straight from YouTube with your own API key. Nothing leaves this browser.
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
				<Label for="import-api-key">YouTube Data API key</Label>
				<Input
					id="import-api-key"
					type="password"
					autocomplete="off"
					spellcheck="false"
					placeholder="AIza…"
					disabled={busy}
					bind:value={apiKey}
				/>
				<p class="text-muted-foreground text-xs">
					Create one in the
					<a
						class="underline underline-offset-4"
						href="https://console.cloud.google.com/apis/credentials"
						target="_blank"
						rel="noreferrer">Google Cloud console</a
					>, enable "YouTube Data API v3" for it, and paste it here. It is stored in this browser
					only.
				</p>
			</div>

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
				<div class="grid gap-2" aria-live="polite">
					<Progress value={progressPercent} aria-label={progressLabel} />
					<p class="text-muted-foreground flex items-center gap-2 text-xs">
						<Loader class="size-3.5 animate-spin" />
						{progressLabel}
					</p>
				</div>
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
