<script>
	/**
	 * The rating session: watch an AMV, press a tier, the next one starts.
	 *
	 * The page owns the player and the keyboard; what the queue contains and where
	 * we are in it belongs to `session`, and every rating goes straight into
	 * `library`, which persists it.
	 */
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';

	import Player from '$lib/components/Player.svelte';
	import EmptyLibrary from '$lib/components/rate/EmptyLibrary.svelte';
	import NowPlaying from '$lib/components/rate/NowPlaying.svelte';
	import PlaybackControls from '$lib/components/rate/PlaybackControls.svelte';
	import SessionSummary from '$lib/components/rate/SessionSummary.svelte';
	import SessionToolbar from '$lib/components/rate/SessionToolbar.svelte';
	import TierBar from '$lib/components/rate/TierBar.svelte';
	import { parseRateParams, rateQuery } from '$lib/components/rate/params.js';
	import { shortcutFor, shortcutsEnabled } from '$lib/components/rate/shortcuts.js';
	import { library } from '$lib/state/library.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { PLAYER_STATE } from '$lib/youtube/iframe-api.js';

	/** @type {Player|null} */
	let player = $state(null);

	/** @type {number} Latest state reported by the player; drives the play/pause icon. */
	let playerState = $state(PLAYER_STATE.UNSTARTED);

	/** @type {boolean} The video ended unrated and the tier bar is waiting for a verdict. */
	let awaitingRating = $state(false);

	let helpOpen = $state(false);

	/** @type {string|null} Video the fullscreen request was already made for. */
	let fullscreenFor = null;

	const current = $derived(session.currentVideo);
	const playing = $derived(playerState === PLAYER_STATE.PLAYING);

	// Read once, at setup: the parameters are a starting point, not state the page
	// keeps in sync with the session (see `rateQuery`). The filter has to be in place
	// before `jumpTo`, which pins its video past that filter.
	const initial = parseRateParams(page.url.searchParams);
	session.setFilter({ tiers: initial.tiers, includeUnrated: initial.includeUnrated });
	if (initial.videoId && !session.jumpTo(initial.videoId)) {
		toast.warning('That video is not in the active playlist.');
	}

	/** @type {boolean} Whether the filter has changed since the page was opened. */
	let filterTouched = false;

	/** Mirror the queue filter into the URL, so a filtered session can be shared. */
	$effect(() => {
		const target = `${resolve('/rate')}${rateQuery(session.filter)}`;

		// The first run only records where we started: the filter was just built from
		// this very URL, so there is nothing to write — and the router is not up yet
		// during the first round of effects, which would make `replaceState` throw.
		if (!filterTouched) {
			filterTouched = true;
			return;
		}
		if (`${page.url.pathname}${page.url.search}` === target) return;

		// The route *is* resolved; the rule only recognises a bare `resolve()` call as
		// the argument, not one with a query string appended to it.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(target, page.state);
	});

	/** A new video starts unjudged; drop the "it ended" highlight. */
	$effect(() => {
		void current?.id;
		awaitingRating = false;
	});

	/**
	 * @param {import('$lib/types.js').Rating} rating
	 * @returns {void}
	 */
	function rate(rating) {
		if (!current) return;
		awaitingRating = false;
		session.rateCurrent(rating);
	}

	/**
	 * Move on after the current video left the queue.
	 *
	 * Dropping out shifts the next video into the current index by itself, so
	 * advancing on top of that would skip one.
	 *
	 * @param {string} videoId
	 * @returns {void}
	 */
	function advancePast(videoId) {
		if (session.queue.some((video) => video.id === videoId)) session.next();
	}

	/** @returns {void} */
	function markUnavailable() {
		if (!current) return;
		const { id, title } = current;
		library.markUnavailable(id);
		toast.info(`Marked "${title}" as unavailable.`);
		advancePast(id);
	}

	/** @returns {void} */
	function shuffle() {
		if (library.shuffle()) toast.success('Shuffled the playlist.');
	}

	/** @returns {void} */
	function togglePlay() {
		if (playing) player?.pause();
		else player?.play();
	}

	/** @returns {void} */
	function requestFullscreen() {
		if (player?.requestFullscreen()) return;
		toast.info('This browser will not put the player into fullscreen.');
	}

	/** @returns {void} */
	function handleEnded() {
		if (!settings.autoAdvance) return;
		// An unrated video is the whole point of the session — wait for the verdict
		// instead of moving on.
		if (current?.rating !== null) session.next();
		else awaitingRating = true;
	}

	/**
	 * @param {number} state
	 * @returns {void}
	 */
	function handleStateChange(state) {
		playerState = state;
		if (state !== PLAYER_STATE.PLAYING || !settings.fullscreenOnPlay) return;
		if (!current || fullscreenFor === current.id) return;

		// Once per video: a second request per video would fight the user leaving it.
		fullscreenFor = current.id;
		player?.requestFullscreen();
	}

	/**
	 * @param {import('$lib/youtube/iframe-api.js').PlayerErrorReason} reason
	 * @returns {void}
	 */
	function handlePlayerError(reason) {
		if (!current) return;
		if (reason !== 'unavailable') {
			toast.error('The player could not play this video.');
			return;
		}

		const { id, title } = current;
		library.markUnavailable(id);
		toast.error(`"${title}" cannot be played — marked as unavailable and skipped.`);
		advancePast(id);
	}

	/**
	 * @param {KeyboardEvent} event
	 * @returns {void}
	 */
	function handleKeydown(event) {
		if (!current || event.repeat) return;
		if (!shortcutsEnabled(event, document)) return;

		const action = shortcutFor(event);
		if (!action) return;
		event.preventDefault();

		switch (action.type) {
			case 'rate':
				rate(action.rating);
				break;
			case 'next':
				session.next();
				break;
			case 'previous':
				session.previous();
				break;
			case 'replay':
				player?.replay();
				break;
			case 'playPause':
				togglePlay();
				break;
			case 'fullscreen':
				requestFullscreen();
				break;
			case 'help':
				helpOpen = !helpOpen;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !library.activePlaylist}
	<EmptyLibrary />
{:else if !current}
	<SessionSummary />
{:else}
	<main class="flex w-full flex-1 flex-col">
		<div
			class="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-3 pt-3 sm:gap-4 sm:px-4 sm:pt-4"
		>
			<!--
				In landscape the height, not the width, is what the 16:9 player runs out
				of: capping the width keeps it fully visible. On a roomy window the cap
				is larger than the column, so it changes nothing there.
			-->
			<div class="mx-auto w-full landscape:max-w-[calc((100svh-13rem)*16/9)]">
				<Player
					bind:this={player}
					videoId={current.id}
					onended={handleEnded}
					onerror={handlePlayerError}
					onstatechange={handleStateChange}
				/>
			</div>

			<NowPlaying
				video={current}
				position={session.index + 1}
				total={session.queue.length}
				progress={session.progress}
			/>

			<SessionToolbar
				bind:helpOpen
				onunavailable={markUnavailable}
				onshuffle={shuffle}
				class="justify-center sm:justify-start"
			/>
		</div>

		<!--
			The tier bar stays reachable while the metadata scrolls. `--app-tab-bar-inset`
			is the mobile bottom tab bar (0 from `md` up) and already carries the iOS
			home-indicator inset, so this lifts the bar clear of both.
		-->
		<div
			class="bg-background/95 sticky bottom-(--app-tab-bar-inset) z-30 mt-3 border-t px-3 pt-1 pb-3 backdrop-blur sm:px-4"
		>
			<div class="mx-auto flex w-full max-w-4xl flex-col gap-1.5">
				<PlaybackControls
					{playing}
					canPrevious={session.hasPrevious}
					canNext={session.hasNext}
					onprevious={() => session.previous()}
					onnext={() => session.next()}
					onreplay={() => player?.replay()}
					onplaypause={togglePlay}
					onfullscreen={requestFullscreen}
				/>

				{#if awaitingRating}
					<p class="text-muted-foreground text-center text-xs" role="status">
						Finished — pick a tier.
					</p>
				{/if}

				<TierBar rating={current.rating} onrate={rate} highlight={awaitingRating} />
			</div>
		</div>
	</main>
{/if}
