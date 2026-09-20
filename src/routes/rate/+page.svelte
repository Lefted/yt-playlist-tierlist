<script>
	/**
	 * The rating session: watch an AMV, press a tier, the next one starts.
	 *
	 * The page owns the player and the keyboard; what the queue contains and where
	 * we are in it belongs to `session`, and every rating goes straight into
	 * `library`, which persists it.
	 */
	import { untrack } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';

	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Player from '$lib/components/Player.svelte';
	import EmptyLibrary from '$lib/components/rate/EmptyLibrary.svelte';
	import NowPlaying from '$lib/components/rate/NowPlaying.svelte';
	import PlaybackControls from '$lib/components/rate/PlaybackControls.svelte';
	import PlayerOverlay from '$lib/components/rate/PlayerOverlay.svelte';
	import PointerWake from '$lib/components/rate/PointerWake.svelte';
	import SessionSummary from '$lib/components/rate/SessionSummary.svelte';
	import SessionToolbar from '$lib/components/rate/SessionToolbar.svelte';
	import TierBar from '$lib/components/rate/TierBar.svelte';
	import { parseRateParams, rateQuery } from '$lib/components/rate/params.js';
	import {
		canHide,
		OVERLAY_IDLE_MS,
		OVERLAY_SHOWN,
		overlayAfter
	} from '$lib/components/rate/overlay-visibility.js';
	import { awaitsRating, endedAction } from '$lib/components/rate/playback.js';
	import { shortcutFor, shortcutKeys, shortcutsEnabled } from '$lib/components/rate/shortcuts.js';
	import { describeUndo } from '$lib/components/rate/undo.js';
	import {
		blurResponse,
		FOCUS_HANDBACK_MS,
		focusEnteredPlayer
	} from '$lib/components/rate/window-blur.js';
	import { matchesMedia, TOUCH_QUERY } from '$lib/media.svelte.js';
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

	/**
	 * Whether a finger is driving this session; it decides what a tap on the video
	 * means — see `window-blur.js`. `PointerWake` asks the other half of the question.
	 */
	const touch = matchesMedia(TOUCH_QUERY);

	/** @type {string|null} Video the fullscreen request was already made for. */
	let fullscreenFor = null;

	/**
	 * @type {import('$lib/components/rate/overlay-visibility.js').OverlayVisibility}
	 * Whether the fullscreen overlay is on screen, and whether the pointer is on it.
	 * `raw`, because the machine hands out a whole new state each time and the identity
	 * of that state is what re-arms the countdown below.
	 */
	let overlay = $state.raw(OVERLAY_SHOWN);

	/**
	 * @type {boolean} Something needs the overlay to stay up however long nothing
	 * happens: a video that ended unrated — the prompt to rate it *is* the overlay —
	 * or something of ours layered on top.
	 *
	 * The help list is the only layer the page can see as state; the toolbar's own
	 * popovers and the shortcut editor keep theirs. That is enough, because all of
	 * them are rendered *outside* the element that goes fullscreen and so are not on
	 * the screen the overlay is on.
	 */
	const overlayHeld = $derived(awaitingRating || helpOpen);

	const current = $derived(session.currentVideo);
	const playing = $derived(playerState === PLAYER_STATE.PLAYING);
	const undoLabel = $derived(describeUndo(session.lastUndo));

	// Read once, at setup: the parameters are a starting point, not state the page
	// keeps in sync with the session (see `rateQuery`). The filter has to be in place
	// before `jumpTo`, which pins its video past that filter.
	const initial = parseRateParams(page.url.searchParams);
	session.setFilter({ tiers: initial.tiers, includeUnrated: initial.includeUnrated });

	/** Whether `?v=` has been acted on; it is a starting point and gets exactly one go. */
	let jumped = false;

	// …but only once the library is actually here. A cold load of `/rate?v=abc` reaches
	// this component while the library is still being read, and jumping then would
	// announce that the video is missing from a playlist nobody has yet.
	$effect(() => {
		if (jumped || library.loading) return;
		jumped = true;
		if (initial.videoId && !session.jumpTo(initial.videoId)) {
			toast.warning('That video is not in the active playlist.');
		}
	});

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

	/**
	 * Entering fullscreen starts the overlay shown and counting; leaving puts it back
	 * to shown, so the next entry does not begin mid-fade.
	 *
	 * `untrack`, because the dispatch below both reads and writes `overlay`, and this
	 * effect is only ever about `fullscreen` changing.
	 */
	$effect(() => {
		const entered = fullscreen;
		untrack(() => overlayEvent(entered ? 'wake' : 'reset'));
	});

	/**
	 * The countdown that fades the overlay out, about when YouTube's own controls go.
	 *
	 * An effect rather than a `setTimeout` next to each wake, so that *every* input
	 * re-arms it on its own: a new state from any sign of life, the pointer arriving on
	 * the box, `awaitingRating` coming and going, fullscreen ending. There is no timer
	 * running while the overlay must stay up, so `idle` can never race a hold.
	 */
	$effect(() => {
		if (!fullscreen || !canHide(overlay, { held: overlayHeld })) return;

		const timer = setTimeout(() => overlayEvent('idle'), OVERLAY_IDLE_MS);
		return () => clearTimeout(timer);
	});

	/**
	 * A sign of life: show the fullscreen overlay and give it three more seconds.
	 *
	 * Guarded here rather than at each call site: outside fullscreen there is no
	 * overlay, and the signals that feed this — a keystroke, the end of a video, the
	 * pointer on the box — all happen there too. The one signal that does not come
	 * through here is the `blur`, which has a second meaning on a touch device and a
	 * module of its own (`window-blur.js`).
	 *
	 * @returns {void}
	 */
	function wake() {
		if (fullscreen) overlayEvent('wake');
	}

	/**
	 * Feed the overlay's state machine.
	 *
	 * @param {import('$lib/components/rate/overlay-visibility.js').OverlayEvent} event
	 * @returns {void}
	 */
	function overlayEvent(event) {
		overlay = overlayAfter(overlay, event, { held: overlayHeld });
	}

	/**
	 * The focus left our document.
	 *
	 * The only trace a tap or click on the video ever leaves: the iframe is
	 * cross-origin and swallows every event inside it, but the focus moving into it
	 * blurs our window, and that we can hear. What the blur is worth — a toggle, a
	 * wake, the keyboard back, nothing at all — is `window-blur.js`.
	 *
	 * Asked a tick later, because while `blur` is being dispatched the focus has not
	 * landed anywhere yet: neither `activeElement` nor `visibilityState` tells the
	 * truth about it before then.
	 *
	 * @returns {void}
	 */
	function handleWindowBlur() {
		clearTimeout(blurTick);
		blurTick = setTimeout(answerBlur);
	}

	/** @returns {void} */
	function answerBlur() {
		const answer = blurResponse({
			intoPlayer: focusEnteredPlayer(document, player?.iframe()),
			hidden: document.visibilityState === 'hidden',
			touch: touch.current,
			fullscreen,
			sinceOurs: Date.now() - ourFocusAt
		});

		if (answer.overlay) overlayEvent(answer.overlay);
		if (answer.recoverFocus) reclaimKeyboard(FOCUS_HANDBACK_MS);
	}

	/** @type {ReturnType<typeof setTimeout>|undefined} */
	let blurTick;

	/** @type {ReturnType<typeof setTimeout>|undefined} */
	let handBack;

	/** The page's own timers; both are about an event that has already happened. */
	$effect(() => () => {
		clearTimeout(blurTick);
		clearTimeout(handBack);
	});

	/**
	 * @type {number} When the page last did something that hands the embed the focus.
	 * A blur that follows within `OUR_OWN_FOCUS_MS` is ours, not a tap — see
	 * `window-blur.js`.
	 */
	let ourFocusAt = -Infinity;

	/** @returns {void} */
	function markOurFocus() {
		ourFocusAt = Date.now();
	}

	/**
	 * Take the keyboard back from the iframe — and only from it.
	 *
	 * The check is made on arrival rather than at the call: by then the user may have
	 * reached a popover, the tier bar or a dialog, and that focus is theirs. Anything
	 * but the cross-origin frame is left exactly where it is.
	 *
	 * @param {number} [delay] - Milliseconds to wait first. A tap on the embed may be
	 *   opening one of YouTube's own menus, and pulling the focus away while that
	 *   happens closes it again (issue #9), so the blur path waits
	 *   `FOCUS_HANDBACK_MS`; a video change has nothing to wait for.
	 * @returns {void}
	 */
	function reclaimKeyboard(delay = 0) {
		clearTimeout(handBack);
		handBack = setTimeout(() => {
			if (focusEnteredPlayer(document, player?.iframe())) player?.focus();
		}, delay);
	}

	/**
	 * Take the keyboard off the overlay button that was just pressed.
	 *
	 * The opposite errand to {@link reclaimKeyboard}: the focus is on a control of
	 * ours, and it has to move anyway, or the next `Space` presses that button again
	 * instead of playing the video. Fullscreen only — outside it the page's focus is
	 * the user's to keep.
	 *
	 * @returns {void}
	 */
	function takeKeyboardOffButton() {
		if (fullscreen) player?.focus();
	}

	/** A new video starts unjudged; drop the "it ended" highlight. */
	$effect(() => {
		void current?.id;
		awaitingRating = false;

		// The same change reaches the player as a `loadVideoById`, and the embed takes
		// the focus along with the video. The blur that follows is ours, not a tap on
		// the video, and the overlay must not toggle for it.
		markOurFocus();
	});

	/**
	 * Tuck the fullscreen overlay away, or bring it back (issue #19).
	 *
	 * Fullscreen only: outside it the overlay is not rendered at all, and flipping the
	 * setting from under a page that shows nothing of it would be a shortcut with no
	 * visible effect. The state itself lives in the device settings, so it survives
	 * the next video, the next fullscreen and a reload.
	 *
	 * @returns {void}
	 */
	function toggleOverlay() {
		if (!fullscreen) return;
		settings.overlayCollapsed = !settings.overlayCollapsed;
	}

	/**
	 * Run something the fullscreen overlay asked for and hand the keyboard back, so
	 * the next keystroke is a shortcut again and not something the button that was
	 * just clicked answers.
	 *
	 * Most of these load another video, which hands the embed the focus a moment
	 * later; the stamp is what keeps that blur from reading as a tap and taking the
	 * overlay away under the user's finger.
	 *
	 * @param {() => void} action
	 * @returns {void}
	 */
	function overlayAction(action) {
		markOurFocus();
		action();
		wake();
		takeKeyboardOffButton();
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
		wake();

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
		// while fullscreen that would leave us without a keyboard (issue #9). The blur
		// handler catches the same thing — this is the belt to its braces, for a grab
		// that arrives late enough to have been missed.
		if (state === PLAYER_STATE.PLAYING && fullscreen) reclaimKeyboard();

		if (state !== PLAYER_STATE.PLAYING || !settings.fullscreenOnPlay) return;
		if (!current || fullscreenFor === current.id) return;

		// Once per video: a second request per video would fight the user leaving it.
		fullscreenFor = current.id;
		player?.requestFullscreen();
	}

	/**
	 * The embed reached fullscreen by itself and has just been thrown out of it again.
	 *
	 * From the user's side a fullscreen flashed past, so the toast has to point at the
	 * one that works — by its live key, because `F` is rebindable and there is nothing
	 * to press at all while the rating keys are off (issue #12).
	 *
	 * @returns {void}
	 */
	function handleForeignFullscreen() {
		const [key] = shortcutKeys({
			bindings: settings.keybindings,
			ratingKeys: settings.shortcuts
		}).fullscreen;

		toast.info(
			key ? `Use the app's Fullscreen button or ${key}.` : "Use the app's Fullscreen button.",
			{
				duration: 4000
			}
		);
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

		const action = shortcutFor(event, {
			bindings: settings.keybindings,
			ratingKeys: settings.shortcuts
		});
		if (!action) return;

		// `shortcutsEnabled` is about the surroundings — a text field has the focus, or
		// something is layered over the page. The exception is `?`, which has to be
		// able to close the very list it opened.
		if (!shortcutsEnabled(event, document) && !(action.type === 'help' && helpOpen)) return;
		event.preventDefault();

		// Whatever the key does, pressing one is a sign of life — and a rating key has
		// feedback to show on the overlay it would otherwise be hidden behind.
		wake();

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
			case 'volumeBy':
				player?.changeVolume(action.percent);
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
			case 'toggleOverlay':
				toggleOverlay();
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

<svelte:window onkeydown={handleKeydown} onblur={handleWindowBlur} />

{#if library.loading}
	<div class="mx-auto flex w-full max-w-xl flex-1 items-center p-4">
		<div class="bg-muted h-48 w-full animate-pulse rounded-xl" aria-busy="true">
			<span class="sr-only" aria-live="polite">Loading your library…</span>
		</div>
	</div>
{:else if library.error}
	<div class="mx-auto flex w-full max-w-xl flex-1 items-center p-4">
		<Card.Root class="w-full">
			<Card.Header>
				<Card.Title>Your library could not be loaded</Card.Title>
				<Card.Description>{library.error}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button onclick={() => library.reload()}>Try again</Button>
			</Card.Content>
		</Card.Root>
	</div>
{:else if !library.activePlaylist}
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
					onforeignfullscreen={handleForeignFullscreen}
				>
					{#if fullscreen}
						<PlayerOverlay
							rating={current.rating}
							title={current.title}
							collapsed={settings.overlayCollapsed}
							visible={overlay.visible}
							shortcuts={settings.shortcuts}
							keybindings={settings.keybindings}
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
							ontoggle={() => overlayAction(toggleOverlay)}
							onactivity={wake}
							onpointerin={() => overlayEvent('enter')}
							onpointerout={() => overlayEvent('leave')}
						/>

						<!--
							The mouse user's way back to a faded overlay: moving over the video
							brings YouTube's controls back, and nothing of that movement reaches us
							through a cross-origin iframe. The layer is only there while the overlay
							is away, and never on a touch screen — see the component.
						-->
						{#if !overlay.visible}
							<PointerWake onwake={wake} />
						{/if}
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
					keybindings={settings.keybindings}
					canPrevious={session.hasPrevious}
					canNext={session.hasNext}
					onprevious={() => session.previous()}
					onnext={() => session.next()}
					onreplay={() => player?.replay()}
					onplaypause={togglePlay}
					onfullscreen={requestFullscreen}
					canUndo={session.canUndo}
					{undoLabel}
					onundo={() => undo()}
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
					shortcuts={settings.shortcuts}
					keybindings={settings.keybindings}
					rating={current.rating}
					onrate={rate}
					highlight={awaitingRating}
				/>
			</div>
		</div>
	</main>
{/if}
