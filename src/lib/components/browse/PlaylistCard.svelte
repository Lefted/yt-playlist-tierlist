<script>
	/**
	 * The side column: which playlist is being rated, where it came from, and
	 * everything that acts on the playlist as a whole (refresh, export, import,
	 * remove) plus the switcher between several imported playlists.
	 */
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Download from '@lucide/svelte/icons/download';
	import HardDriveDownload from '@lucide/svelte/icons/hard-drive-download';
	import Upload from '@lucide/svelte/icons/upload';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	import { library } from '$lib/state/library.svelte.js';
	import { exportFileName, formatDate } from '$lib/format.js';
	import { playlistUrl } from '$lib/youtube/urls.js';
	import JsonFileInput from './JsonFileInput.svelte';
	import { hasLocalLibrary, importLocalLibrary } from './local-import.js';
	import Notice from './Notice.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Playlist} playlist
	 * @property {() => void} onreimport - Opens the import dialog, pre-filled with this playlist.
	 */

	/** @type {Props} */
	let { playlist, onreimport } = $props();

	/** @type {JsonFileInput | null} */
	let picker = $state(null);
	let confirmRemove = $state(false);
	/** @type {import('./json-file.js').Notice | null} */
	let notice = $state(null);

	/**
	 * Whether this browser still carries the pre-accounts library. Read once — the
	 * menu item below is the only thing that changes it, and it reports that itself.
	 */
	let localLibraryPresent = $state(hasLocalLibrary());

	// Empty for the local `legacy-import` collection: YouTube never had that
	// playlist, so neither the link nor a refresh could work.
	const url = $derived(playlistUrl(playlist.id));
	const onYouTube = $derived(url !== '');

	const playlistOptions = $derived(
		library.playlists.map((entry) => ({ value: entry.id, label: entry.title || entry.id }))
	);

	/**
	 * Hand the export to the browser as a download. Blob + object URL rather than a
	 * `data:` URL, which some browsers cap at a few megabytes — a 1000-video library
	 * is well past that.
	 *
	 * @returns {void}
	 */
	function exportJson() {
		/** @type {string} */
		let href = '';
		try {
			const blob = new Blob([library.exportJson()], { type: 'application/json' });
			href = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = href;
			anchor.download = exportFileName();
			anchor.click();
			notice = { tone: 'ok', text: `Exported ${library.playlists.length} playlist(s).` };
		} catch {
			notice = { tone: 'error', text: 'The export could not be written. Try again.' };
		} finally {
			// Not synchronous: Firefox and Safari can still be reading the blob when
			// the click returns, and revoking here would abort the download.
			if (href) setTimeout(() => URL.revokeObjectURL(href), 60_000);
		}
	}

	/**
	 * The same one-time migration the empty state offers, for an account that already
	 * has playlists and therefore never sees that offer.
	 *
	 * @returns {Promise<void>}
	 */
	async function importLocal() {
		notice = { tone: 'ok', text: 'Importing this device’s stored tier list…' };
		notice = await importLocalLibrary();
		localLibraryPresent = hasLocalLibrary();
	}

	/** @returns {void} */
	function removePlaylist() {
		library.removePlaylist(playlist.id);
		confirmRemove = false;
		notice = null;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Description>Playlist</Card.Description>
		<Card.Title class="text-lg leading-snug break-words">
			{playlist.title || playlist.id}
		</Card.Title>
		<Card.Action>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="icon-sm" variant="outline">
							<EllipsisVertical class="size-4" />
							<span class="sr-only">Playlist actions</span>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-56">
					{#if onYouTube}
						<DropdownMenu.Item onSelect={onreimport}>
							<RefreshCw class="size-4" />
							Re-import / refresh
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item onSelect={exportJson}>
						<Download class="size-4" />
						Export JSON
					</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => picker?.pick()}>
						<Upload class="size-4" />
						Import JSON
					</DropdownMenu.Item>
					{#if localLibraryPresent}
						<DropdownMenu.Item onSelect={importLocal}>
							<HardDriveDownload class="size-4" />
							Import from this device
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onSelect={() => (confirmRemove = true)}>
						<Trash2 class="size-4" />
						Remove playlist
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</Card.Action>
	</Card.Header>

	<Card.Content class="grid gap-4">
		{#if playlist.channelTitle}
			<p class="text-muted-foreground text-sm break-words">{playlist.channelTitle}</p>
		{/if}

		<dl class="grid gap-2 text-sm">
			<div class="flex items-center justify-between gap-4">
				<dt class="text-muted-foreground">Imported</dt>
				<dd>{formatDate(playlist.importedAt) || 'unknown'}</dd>
			</div>
			<div class="flex items-center justify-between gap-4">
				<dt class="text-muted-foreground">Updated</dt>
				<dd>{formatDate(playlist.updatedAt) || 'unknown'}</dd>
			</div>
			<div class="flex items-center justify-between gap-4">
				<dt class="text-muted-foreground">Videos</dt>
				<dd class="tabular-nums">{playlist.videos.length}</dd>
			</div>
		</dl>

		{#if onYouTube}
			<Button href={url} target="_blank" rel="noreferrer" variant="outline" class="w-full">
				<ExternalLink class="size-4" />
				Open in YouTube
			</Button>
		{/if}

		{#if playlistOptions.length > 1}
			<div class="grid gap-1.5">
				<span class="text-muted-foreground text-xs" id="playlist-switcher-label">
					Switch playlist
				</span>
				<Select.Root
					type="single"
					value={playlist.id}
					onValueChange={(value) => library.setActive(value)}
				>
					<Select.Trigger class="w-full" aria-labelledby="playlist-switcher-label">
						{playlist.title || playlist.id}
					</Select.Trigger>
					<Select.Content>
						{#each playlistOptions as option (option.value)}
							<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}

		{#if notice}
			<Notice tone={notice.tone} icon={false}>{notice.text}</Notice>
		{/if}
	</Card.Content>
</Card.Root>

<!-- Outside the menu: the dropdown unmounts its content on select, which would take the picker with it. -->
<JsonFileInput bind:this={picker} onresult={(result) => (notice = result)} />

<AlertDialog.Root bind:open={confirmRemove}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove "{playlist.title || playlist.id}"?</AlertDialog.Title>
			<AlertDialog.Description>
				This deletes the playlist and all {playlist.videos.filter((video) => video.rating !== null)
					.length} ratings it holds from your account, on every device. Export a JSON backup first if
				you want to keep them.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={removePlaylist}>
				Remove playlist
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
