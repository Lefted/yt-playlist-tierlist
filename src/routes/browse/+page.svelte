<script>
	/**
	 * Browse: the library view. Stats and the filterable video list in the main
	 * column, the playlist itself in the side column (below the list on mobile).
	 *
	 * The page owns the filter values; `components/browse/filters.js` owns the rules
	 * and `$lib/state/library.svelte.js` owns the data.
	 */
	import Plus from '@lucide/svelte/icons/plus';

	import { Button } from '$lib/components/ui/button/index.js';
	import EmptyState from '$lib/components/browse/EmptyState.svelte';
	import ImportDialog from '$lib/components/browse/ImportDialog.svelte';
	import LocalImportPrompt from '$lib/components/browse/LocalImportPrompt.svelte';
	import Notice from '$lib/components/browse/Notice.svelte';
	import PlaylistCard from '$lib/components/browse/PlaylistCard.svelte';
	import StatsRow from '$lib/components/browse/StatsRow.svelte';
	import Toolbar from '$lib/components/browse/Toolbar.svelte';
	import VideoCard from '$lib/components/browse/VideoCard.svelte';
	import {
		DEFAULT_SORT,
		PAGE_SIZE,
		createFilter,
		filterVideos,
		sortVideos
	} from '$lib/components/browse/filters.js';
	import { hasLocalLibrary, shouldOfferLocalImport } from '$lib/components/browse/local-import.js';
	import { library } from '$lib/state/library.svelte.js';

	let importOpen = $state(false);
	let importInput = $state('');

	/**
	 * Read once: `localStorage` is not reactive, and the only thing that can change it
	 * while this page is open is the import below, which says so itself.
	 */
	let localLibraryPresent = $state(hasLocalLibrary());
	let localOfferDismissed = $state(false);

	const offerLocalImport = $derived(
		!localOfferDismissed &&
			shouldOfferLocalImport({
				hasLocal: localLibraryPresent,
				loading: library.loading,
				error: library.error,
				playlistCount: library.playlists.length
			})
	);

	/** @type {import('$lib/components/browse/filters.js').BrowseFilter} */
	let filter = $state(createFilter());
	/** @type {import('$lib/components/browse/filters.js').SortKey} */
	let sort = $state(DEFAULT_SORT);
	let visibleCount = $state(PAGE_SIZE);

	const playlist = $derived(library.activePlaylist);
	const videos = $derived(library.activeVideos);
	const matches = $derived(sortVideos(filterVideos(videos, filter), sort));
	const visible = $derived(matches.slice(0, visibleCount));
	const hasMore = $derived(matches.length > visible.length);

	/** Identity of everything that narrows the list — rating a video is not part of it. */
	const filterKey = $derived(JSON.stringify([playlist?.id ?? null, filter, sort]));

	$effect(() => {
		// A different filter shows a different set, so the paging starts over.
		// Reading `filterKey` is the only subscription here: `visibleCount` is
		// written but never read, so "Show more" does not re-trigger this.
		filterKey;
		visibleCount = PAGE_SIZE;
	});

	/**
	 * @param {string} [prefill] - Playlist id to refresh; empty for a fresh import.
	 * @returns {void}
	 */
	function openImport(prefill = '') {
		importInput = prefill;
		importOpen = true;
	}

	/**
	 * Shuffle and reset only show in the playlist order, so both switch back to it.
	 * @returns {void}
	 */
	function shuffle() {
		sort = DEFAULT_SORT;
		library.shuffle();
	}

	/** @returns {void} */
	function resetOrder() {
		sort = DEFAULT_SORT;
		library.resetOrder();
	}
</script>

<svelte:head>
	<title>Browse · YT Tierlist</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-[1536px] flex-1 flex-col gap-4 p-4 sm:px-6 md:gap-6">
	{#if library.loading}
		<!-- The shape of the page that is coming, so the layout does not jump into place. -->
		<div class="grid items-start gap-4 md:gap-6 lg:grid-cols-3" aria-busy="true">
			<span class="sr-only" aria-live="polite">Loading your library…</span>
			<div class="grid min-w-0 auto-rows-max gap-4 md:gap-6 lg:col-span-2">
				<div class="bg-muted h-24 animate-pulse rounded-xl"></div>
				<div class="bg-muted h-10 animate-pulse rounded-xl"></div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each [0, 1, 2, 3, 4, 5] as slot (slot)}
						<div class="bg-muted h-40 animate-pulse rounded-xl"></div>
					{/each}
				</div>
			</div>
			<div class="bg-muted h-64 animate-pulse rounded-xl"></div>
		</div>
	{:else if library.error}
		<div class="flex flex-1 items-center justify-center py-8">
			<div class="grid w-full max-w-lg gap-3">
				<Notice tone="error">{library.error}</Notice>
				<div>
					<Button variant="outline" onclick={() => library.reload()}>Try again</Button>
				</div>
			</div>
		</div>
	{:else if !playlist}
		{#if offerLocalImport}
			<LocalImportPrompt ondone={() => (localOfferDismissed = true)} />
		{/if}
		<EmptyState onimport={() => openImport()} />
	{:else}
		<div class="grid items-start gap-4 md:gap-6 lg:grid-cols-3">
			<div class="grid min-w-0 auto-rows-max gap-4 md:gap-6 lg:col-span-2">
				<StatsRow
					total={videos.length}
					rated={library.ratedCount}
					available={library.availableCount}
					sTier={library.counts.S}
				/>

				<div class="grid gap-3">
					<Toolbar bind:filter bind:sort onshuffle={shuffle} onresetorder={resetOrder} />

					<p class="text-muted-foreground text-xs" aria-live="polite">
						Showing {visible.length} of {matches.length}
						{matches.length === 1 ? 'video' : 'videos'}
						{#if matches.length !== videos.length}
							(filtered from {videos.length})
						{/if}
					</p>
				</div>

				{#if matches.length === 0}
					<p class="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
						No video matches these filters.
					</p>
				{:else}
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each visible as video (video.id)}
							<VideoCard {video} onrate={(rating) => library.rate(video.id, rating)} />
						{/each}
					</div>
				{/if}

				{#if hasMore}
					<div class="flex justify-center">
						<Button variant="outline" onclick={() => (visibleCount += PAGE_SIZE)}>
							Show more ({matches.length - visible.length} left)
						</Button>
					</div>
				{/if}
			</div>

			<!-- DOM order puts this after the list, so on mobile it lands below it. -->
			<div class="grid min-w-0 auto-rows-max gap-4">
				<PlaylistCard {playlist} onreimport={() => openImport(playlist.id)} />
				<Button variant="outline" onclick={() => openImport()}>
					<Plus class="size-4" />
					Import another playlist
				</Button>
			</div>
		</div>
	{/if}
</main>

<ImportDialog bind:open={importOpen} initialInput={importInput} />
