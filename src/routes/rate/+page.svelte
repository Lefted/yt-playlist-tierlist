<script>
	/**
	 * The rating session: watch an AMV, press a tier, the next one starts.
	 *
	 * The page owns the player and the keyboard; what the queue contains and where
	 * we are in it belongs to `session`, and every rating goes straight into
	 * `library`, which persists it.
	 */
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';

	import Player from '$lib/components/Player.svelte';
	import EmptyLibrary from '$lib/components/rate/EmptyLibrary.svelte';
	import NowPlaying from '$lib/components/rate/NowPlaying.svelte';
	import PlaybackControls from '$lib/components/rate/PlaybackControls.svelte';
	import PlayerOverlay from '$lib/components/rate/PlayerOverlay.svelte';
	import SessionSummary from '$lib/components/rate/SessionSummary.svelte';
	import SessionToolbar from '$lib/components/rate/SessionToolbar.svelte';
	import TierBar from '$lib/components/rate/TierBar.svelte';
	import { parseRateParams, rateQuery } from '$lib/components/rate/params.js';
	import { awaitsRating, endedAction } from '$lib/components/rate/playback.js';
	import { shortcutFor, shortcutsEnabled } from '$lib/components/rate/shortcuts.js';
	import { describeUndo } from '$lib/components/rate/undo.js';
	import { library } from '$lib/state/library.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { PLAYER_STATE } from '$lib/youtube/iframe-api.js';

	/** @type {Player|null} */
	let player = $state(null);

	/** @type {TierBar|null} */
	let tierBar = $state(null);

	/** @type {number} Latest state reported by the player; drives the play/pause icon. */
	let playerState = $state(PLAYER_STATE.UNSTARTED);

	/** @type {boolean} The video ended unrated and the tier bar is waiting for a verdict. */
	let awaitingRating = $state(false);

	let helpOpen = $state(false);

	/** @type {boolean} The player's own wrapper is the browser's fullscreen element. */
	let fullscreen = $state(false);

	/** @type {boolean} Whether the fullscreen overlay is currently shown. */
	let overlayVisible = $state(true);

	/** @type {ReturnType<typeof setTimeout>|undefined} */
	let overlayTimer;

	/** How long the fullscreen overlay stays up after the last sign of life. */
	const OVERLAY_IDLE_MS = 2200;

	/** @type {string|null} Video the fullscreen request was already made for. */
	let fullscreenFor = null;

	const current = $derived(session.currentVideo);
	const playing = $derived(playerState === PLAYER_STATE.PLAYING);
	const undoLabel = $derived(describeUndo(session.lastUndo));

	// Read once, at setup: the parameters are a starting point, not state the page
	// keeps in sync with the session (see `rateQuery`). The filter has to be in place
	// before `jumpTo`, which pins its video past that filter.
	const initial = parseRateParams(page.url.searchParams);
	session.setFilter({ tiers: initial.tiers, includeUnrated: initial.includeUnrated });
	if (initial.videoId && !session.jumpTo(initial.videoId)) {
		toast.warning('That video is not in the active playlist.');
	}

	/**
	 * `?v=` is a starting point, consumed above. Drop it once the router is up, so a
	 * reload continues the session instead of jumping back to that video.
	 */
	afterNavigate(() => {
		if (!page.url.searchParams.has('v')) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(`${resolve('/rate')}${rateQuery(session.filter)}`, page.state);
	});

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

	/** @type {string|null} Playlist the undo stack in `session` belongs to. */
	let undoPlaylistId = library.activePlaylistId;

	/**
	 * A rating session belongs to one playlist: switching to another one ends the
	 * undo history, because its steps name videos the new playlist does not have.
	 */
	$effect(() => {
		const active = library.activePlaylistId;
		if (active === undoPlaylistId) return;
		undoPlaylistId = active;
		session.clearUndo();
	});

	/** A new video starts unjudged; drop the "it ended" highlight. */
	$effect(() => {
		void current?.id;
		awaitingRating = false;
	});

	/**
	 * Entering fullscreen shows the overlay and starts its idle countdown; leaving
	 * puts it back to "shown", so the next fullscreen does not start faded out.
	 */
	$effect(() => {
		if (fullscreen) keepOverlayUp();
		else {
			clearTimeout(overlayTimer);
			overlayVisible = true;
		}
	});

	$effect(() => () => clearTimeout(overlayTimer));

	/**
	 * Show the fullscreen overlay and restart the countdown that hides it again.
	 * @returns {void}
	 */
	function keepOverlayUp() {
		overlayVisible = true;
		clearTimeout(overlayTimer);
		overlayTimer = setTimeout(() => {
			overlayVisible = false;
		}, OVERLAY_IDLE_MS);
	}

	/**
	 * Take the keyboard back from the iframe.
	 *
	 * Only while fullscreen: outside it, the page keeps its own focus (a filter
	 * popover, the tier bar) and stealing it would be wrong.
	 *
	 * @returns {void}
	 */
	function recoverFocus() {
		if (fullscreen) player?.focus();
	}

	/**
	 * Run something the fullscreen overlay asked for: keep the controls up and hand
	 * the keyboard back, so the next keystroke is a shortcut again and not something
	 * the button that was just clicked answers.
	 *
	 * @param {() => void} action
	 * @returns {void}
	 */
	function overlayAction(action) {
		action();
		keepOverlayUp();
		recoverFocus();
	}

	/**
	 * @param {import('$lib/types.js').Rating} rating
	 * @returns {void}
	 */
	function rate(rating) {
		if (!current) return;
		const { title } = current;
		awaitingRating = false;
		if (!session.rateCurrent(rating)) return;

		// Short-lived by design: the toast is the fastest way back from a misclick,
		// not a log. The Undo button next to the tier bar is the lasting one.
		toast.success(`${title} → ${rating}`, { duration: 3000, action: undoAction() });
	}

	/**
	 * The "Undo" action of a toast, bound to the step that toast is about.
	 *
	 * Toasts stack and outlive the next rating; without the id, the Undo of an older
	 * toast would quietly take back the newest step instead of its own.
	 *
	 * @returns {{ label: string, onClick: () => void }}
	 */
	function undoAction() {
		const step = session.lastUndo;
		return { label: 'Undo', onClick: () => undo(step?.id) };
	}

	/**
	 * @param {number} [expectedId] - See `session.undo`.
	 * @returns {void}
	 */
	function undo(expectedId) {
		const entry = session.undo(expectedId);
		if (!entry) {
			toast.info(
				session.canUndo
					? 'Something happened after that one — undo takes back the last step.'
					: 'There is nothing to undo.'
			);
			return;
		}
		awaitingRating = false;
		toast.info(
			entry.kind === 'unavailable'
				? `"${entry.title}" is back in the queue.`
				: `Took back ${entry.rating ?? 'the cleared rating'} for "${entry.title}".`
		);
	}

	/** @returns {void} */
	function markUnavailable() {
		const flagged = session.markCurrentUnavailable();
		if (!flagged) return;
		toast.info(`Marked "${flagged.title}" as unavailable.`, { action: undoAction() });
	}

	/**
	 * Loop is a mode, not a property of one video: it stays on for the next one too.
	 * @returns {void}
	 */
	function toggleLoop() {
		settings.loop = !settings.loop;
		toast.info(settings.loop ? 'Looping the current video.' : 'Loop off.', { duration: 2000 });
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

	/**
	 * `m` on YouTube, proxied: the key reaches our page, not the iframe.
	 * @returns {void}
	 */
	function toggleMute() {
		if (!player) return;
		if (player.isMuted()) player.unMute();
		else player.mute();
	}

	/** @returns {Promise<void>} */
	async function requestFullscreen() {
		if (await player?.requestFullscreen()) return;
		toast.info('This browser will not put the player into fullscreen.');
	}

	/** @returns {void} */
	function handleEnded() {
		if (!current) return;
		if (fullscreen) keepOverlayUp();

		const rated = current.rating !== null;
		const action = endedAction({ loop: settings.loop, rated, autoAdvance: settings.autoAdvance });

		// An unrated video is the whole point of the session — the tier bar says so
		// even when loop sends the video round again.
		const wasAwaiting = awaitingRating;
		awaitingRating = awaitsRating({ action, rated });

		if (action === 'restart') player?.replay();
		else if (action === 'advance') session.next();

		// Only when it *becomes* true: a looping video ends over and over, and taking
		// the focus on every lap would pull it out of whatever the user is doing.
		if (!awaitingRating || wasAwaiting) return;

		// In fullscreen the tier bar is off screen; the overlay's buttons are the ones
		// on it, and the keyboard belongs to the wrapper.
		if (fullscreen) player?.focus();
		else tierBar?.focus();
	}

	/**
	 * @param {number} state
	 * @returns {void}
	 */
	function handleStateChange(state) {
		playerState = state;

		// Every video change runs through the iframe, which takes the focus with it;
		// while fullscreen that would leave us without a keyboard (issue #9).
		if (state === PLAYER_STATE.PLAYING) recoverFocus();

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
		session.advancePast(id);
	}

	/**
	 * @param {KeyboardEvent} event
	 * @returns {void}
	 */
	function handleKeydown(event) {
		if (!current) return;

		const action = shortcutFor(event, settings.shortcuts);
		if (!action) return;

		// `shortcutsEnabled` is about the surroundings — a text field has the focus, or
		// something is layered over the page. The exception is `?`, which has to be
		// able to close the very list it opened.
		if (!shortcutsEnabled(event, document) && !(action.type === 'help' && helpOpen)) return;
		event.preventDefault();
		if (fullscreen) keepOverlayUp();

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
			case 'muteToggle':
				toggleMute();
				break;
			case 'seekBy':
				player?.seekBy(action.seconds);
				break;
			case 'fullscreen':
				requestFullscreen();
				break;
			case 'undo':
				undo();
				break;
			case 'loop':
				toggleLoop();
				break;
			case 'help':
				helpOpen = !helpOpen;
				break;
		}
	}
</script>

<svelte:head>
	<title>Rate · YT Tierlist</title>
</svelte:head>

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
					bind:fullscreen
					videoId={current.id}
					onended={handleEnded}
					onerror={handlePlayerError}
					onstatechange={handleStateChange}
				>
					{#if fullscreen}
						<PlayerOverlay
							rating={current.rating}
							title={current.title}
							visible={overlayVisible}
							{awaitingRating}
							canPrevious={session.hasPrevious}
							canNext={session.hasNext}
							canUndo={session.canUndo}
							{undoLabel}
							onrate={(rating) => overlayAction(() => rate(rating))}
							onprevious={() => overlayAction(() => session.previous())}
							onnext={() => overlayAction(() => session.next())}
							onundo={() => overlayAction(undo)}
							onexit={() => player?.exitFullscreen()}
							onactivity={keepOverlayUp}
						/>
					{/if}
				</Player>
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
			class="bg-background/95 sticky bottom-(--app-tab-bar-inset) z-30 mt-3 border-t px-3 pt-1 pb-3 backdrop-blur sm:px-4 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
		>
			<div class="mx-auto flex w-full max-w-4xl flex-col gap-1.5">
				<PlaybackControls
					{playing}
					shortcuts={settings.shortcuts}
					canPrevious={session.hasPrevious}
					canNext={session.hasNext}
					onprevious={() => session.previous()}
					onnext={() => session.next()}
					onreplay={() => player?.replay()}
					onplaypause={togglePlay}
					onfullscreen={requestFullscreen}
					canUndo={session.canUndo}
					{undoLabel}
					onundo={undo}
					loop={settings.loop}
					onlooptoggle={toggleLoop}
				/>

				{#if awaitingRating}
					<p class="text-muted-foreground text-center text-xs" role="status">
						Finished — pick a tier.
					</p>
				{/if}

				<TierBar
					bind:this={tierBar}
					showKeys={settings.shortcuts}
					rating={current.rating}
					onrate={rate}
					highlight={awaitingRating}
				/>
			</div>
		</div>
	</main>
{/if}
