<script>
	/**
	 * A thin, prop-driven wrapper around the YouTube IFrame Player API.
	 *
	 * The component owns exactly one `YT.Player`: it is created when the first
	 * `videoId` arrives and afterwards fed through `loadVideoById`, so switching
	 * videos never rebuilds the iframe (which would cost a fresh connection and,
	 * on mobile, the user's autoplay gesture).
	 */
	import Film from '@lucide/svelte/icons/film';
	import {
		enterFullscreen,
		FULLSCREEN_EVENTS,
		hasForeignFullscreen,
		isFullscreenElement,
		leaveFullscreen,
		lockLandscape,
		unlockOrientation
	} from '$lib/fullscreen.js';
	import { errorReasonFor, loadIframeApi, PLAYER_STATE } from '$lib/youtube/iframe-api.js';
	import { playerVarsFor } from '$lib/youtube/player-vars.js';
	import { cn } from '$lib/utils.js';

	/** @typedef {import('$lib/youtube/iframe-api.js').YouTubePlayer} YouTubePlayer */

	/** How far {@link seekBy} stays clear of the end, so a seek never ends the video. */
	const END_MARGIN_SECONDS = 0.5;

	/**
	 * @typedef {Object} Props
	 * @property {string|null} [videoId] - `null` renders the placeholder and tears the player down.
	 * @property {boolean} [autoplay] - Play on load; `false` only cues the video.
	 * @property {() => void} [onended] - The video played to its end.
	 * @property {(reason: import('$lib/youtube/iframe-api.js').PlayerErrorReason) => void} [onerror]
	 * @property {(state: number) => void} [onstatechange] - See `PLAYER_STATE`.
	 * @property {() => void} [onready] - The player is up and accepts commands.
	 * @property {() => void} [onforeignfullscreen] - The embed took fullscreen for
	 *   itself and has just been thrown out of it again; say so, because from the
	 *   user's side a fullscreen simply flashed past.
	 * @property {boolean} [fullscreen] - Bindable, read-only in practice: whether the
	 *   wrapper is the browser's fullscreen element. Set it through
	 *   {@link requestFullscreen}, not by assignment.
	 * @property {import('svelte').Snippet} [children] - Rendered over the video, inside
	 *   the element that goes fullscreen — that is what an overlay has to be part of.
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let {
		videoId = null,
		autoplay = true,
		onended,
		onerror,
		onstatechange,
		onready,
		onforeignfullscreen,
		fullscreen = $bindable(false),
		children,
		class: className
	} = $props();

	/** @type {HTMLDivElement|undefined} The box the API's iframe is mounted into. */
	let host = $state();

	/**
	 * @type {HTMLDivElement|undefined} The wrapper: what goes fullscreen, and what
	 * {@link focus} hands the keyboard back to.
	 */
	let surface = $state();

	/** @type {boolean} The player exists and accepts commands. */
	let ready = $state(false);

	/**
	 * @type {YouTubePlayer|null} Deliberately not `$state`: a `$state` class instance
	 * would be handed to the API as a proxy.
	 */
	let player = null;

	/** @type {string|null} The video the player was last told to play. */
	let loadedId = null;

	/**
	 * @type {boolean} Whether there is anything to play. A derived (rather than
	 * `videoId` itself) so the creation effect below only re-runs when the answer
	 * flips, not on every video change.
	 */
	const hasVideo = $derived(Boolean(videoId));

	/** @type {boolean} Keeps the placeholder up until there is something to see. */
	const showPlaceholder = $derived(!hasVideo || !ready);

	/**
	 * Create the player once per "there is a video" phase.
	 *
	 * The effect deliberately depends on `host` and on *whether* there is a video,
	 * not on which one — that is what keeps rapid `videoId` changes from spawning a
	 * second iframe.
	 */
	$effect(() => {
		const node = host;
		if (!node || !hasVideo) return;

		let cancelled = false;
		/** @type {YouTubePlayer|null} */
		let created = null;

		// The API replaces the element it is given with its iframe, so it gets a node
		// Svelte does not own; Svelte would otherwise try to remove a node that is no
		// longer there.
		const target = document.createElement('div');
		target.className = 'h-full w-full';
		node.appendChild(target);

		loadIframeApi()
			.then((YT) => {
				if (cancelled) return;
				// Reads after the await are outside the effect's tracking scope, so this
				// picks up the newest id without re-running the effect.
				const initialId = videoId;
				created = new YT.Player(target, {
					videoId: initialId ?? undefined,
					// Every parameter and its reason live in `youtube/player-vars.js`; `fs: 0`
					// is the load-bearing one — see {@link requestFullscreen}.
					playerVars: playerVarsFor({ autoplay, origin: location.origin }),
					events: {
						onReady: () => {
							if (cancelled) return;
							loadedId = initialId;
							ready = true;
							onready?.();
						},
						onStateChange: handleStateChange,
						onError: handleError
					}
				});
				player = created;
			})
			.catch(() => {
				if (!cancelled) onerror?.('other');
			});

		return () => {
			cancelled = true;
			ready = false;
			player = null;
			loadedId = null;
			try {
				created?.destroy();
			} catch {
				// A player whose iframe is already gone throws on destroy; nothing to do.
			}
			node.replaceChildren();
		};
	});

	/**
	 * Keep {@link fullscreen} in step with the browser, whoever changed it — our own
	 * button, `Escape`, or the window manager.
	 *
	 * Only *our* wrapper counts. The embed has no fullscreen button of its own any
	 * more (`fs: 0`) and no keyboard either (`disablekb: 1`), but a gesture we did not
	 * anticipate could still put the cross-origin iframe in fullscreen: the overlay
	 * would not be on screen and the keys would not reach us, so that is not our
	 * fullscreen — and it is not one to live with either. It is left again right away,
	 * which needs no gesture of its own, and the page is told so it can say where the
	 * fullscreen the user wanted actually is (issue #23).
	 *
	 * Leaving is also where the orientation lock is given back — whoever ended it,
	 * our button or `Escape`.
	 */
	$effect(() => {
		const node = surface;
		if (!node) return;

		/** @type {boolean} What the last sync saw; `unlock` is only for the way out. */
		let was = false;

		const sync = () => {
			const now = isFullscreenElement(document, node);
			if (was && !now) unlockOrientation(window.screen);
			was = now;
			fullscreen = now;

			// Not `else`: this is a *different* element being fullscreen, not the absence
			// of ours. Leaving it fires another `sync`, which finds nothing to do.
			if (!hasForeignFullscreen(document, node)) return;
			void leaveFullscreen(document);
			onforeignfullscreen?.();
		};

		sync();
		for (const event of FULLSCREEN_EVENTS) document.addEventListener(event, sync);
		return () => {
			for (const event of FULLSCREEN_EVENTS) document.removeEventListener(event, sync);
			// Torn down while still fullscreen — navigating away mid-video. Nobody will
			// report the way out after this, so the rotation is given back here.
			if (was) unlockOrientation(window.screen);
		};
	});

	/** Feed a new video into the existing player. */
	$effect(() => {
		const id = videoId;
		if (!ready || !player || !id || id === loadedId) return;

		loadedId = id;
		if (autoplay) player.loadVideoById(id);
		else player.cueVideoById(id);
	});

	/**
	 * @param {{ data?: unknown }} event
	 * @returns {void}
	 */
	function handleStateChange(event) {
		const state = Number(event?.data);
		onstatechange?.(state);
		if (state === PLAYER_STATE.ENDED) onended?.();
	}

	/**
	 * @param {{ data?: unknown }} event
	 * @returns {void}
	 */
	function handleError(event) {
		onerror?.(errorReasonFor(event?.data));
	}

	/**
	 * The player, but only once it answers commands.
	 *
	 * `player` is assigned as soon as the API hands the instance over, which is
	 * before `onReady`; its methods do not exist yet at that point, and the page's
	 * keyboard is live from the first paint.
	 *
	 * @returns {YouTubePlayer|null}
	 */
	function api() {
		return ready ? player : null;
	}

	/** @returns {void} */
	export function play() {
		api()?.playVideo();
	}

	/** @returns {void} */
	export function pause() {
		api()?.pauseVideo();
	}

	/**
	 * @param {number} seconds
	 * @returns {void}
	 */
	export function seekTo(seconds) {
		api()?.seekTo(seconds, true);
	}

	/**
	 * Start the current video over.
	 * @returns {void}
	 */
	export function replay() {
		const instance = api();
		if (!instance) return;
		instance.seekTo(0, true);
		instance.playVideo();
	}

	/**
	 * Jump forwards or backwards from where playback is now — what `←`/`→` and
	 * `j`/`l` do on YouTube, proxied because the keys reach our page, not the
	 * iframe (issue #11).
	 *
	 * @param {number} seconds - Negative seeks backwards. Clamped to the video.
	 * @returns {void}
	 */
	export function seekBy(seconds) {
		const instance = api();
		if (!instance) return;

		const target = instance.getCurrentTime() + seconds;
		const duration = instance.getDuration();
		// Short of the very end: seeking exactly there ends the video, and "forward
		// 5 s" must not advance the session.
		const last = duration > 0 ? duration - END_MARGIN_SECONDS : target;
		instance.seekTo(Math.max(0, Math.min(target, last)), true);
	}

	/** @returns {void} */
	export function mute() {
		api()?.mute();
	}

	/** @returns {void} */
	export function unMute() {
		api()?.unMute();
	}

	/** @returns {boolean} `false` while there is no player to ask. */
	export function isMuted() {
		return Boolean(api()?.isMuted());
	}

	/**
	 * Move the volume, what `↑`/`↓` do on YouTube — proxied because the embed answers
	 * no key of its own any more (`disablekb: 1`, issue #23).
	 *
	 * Raising it also unmutes, as YouTube's own arrow does: a volume key that leaves a
	 * muted player silent is a key that did nothing as far as anyone can hear.
	 *
	 * @param {number} percent - Negative turns it down. Clamped to 0–100.
	 * @returns {void}
	 */
	export function changeVolume(percent) {
		const instance = api();
		if (!instance) return;

		instance.setVolume(Math.max(0, Math.min(100, instance.getVolume() + percent)));
		if (percent > 0 && instance.isMuted()) instance.unMute();
	}

	/**
	 * The embed's iframe, for the one question only the page can ask: whether the
	 * focus has just moved into it (issue #23). Nothing is done *to* it here — a
	 * cross-origin frame has nothing to offer but its identity.
	 *
	 * @returns {HTMLIFrameElement|null} `null` until the player is up.
	 */
	export function iframe() {
		try {
			return api()?.getIframe() ?? null;
		} catch {
			// A player mid-teardown throws rather than answering; there is no iframe then.
			return null;
		}
	}

	/** @returns {number} Playback position in seconds, `0` while there is no player. */
	export function getCurrentTime() {
		return api()?.getCurrentTime() ?? 0;
	}

	/**
	 * Pull the keyboard out of the iframe and back into our document.
	 *
	 * Everything the iframe swallows — the rating keys, undo, the tier bar — is on
	 * our side of the origin boundary, so whoever puts focus into the player (a
	 * click, `loadVideoById`, entering fullscreen) has to hand it back.
	 *
	 * @returns {void}
	 */
	export function focus() {
		surface?.focus({ preventScroll: true });
	}

	/**
	 * Put the player into fullscreen — the wrapper, not the iframe.
	 *
	 * Fullscreening the iframe would make a cross-origin document the fullscreen
	 * element, and every key would go to YouTube instead of to us (issue #9). The
	 * wrapper is ours, so the overlay stays on screen and the shortcuts keep working;
	 * focus is pulled back out of the iframe right away. This is the *only* way into
	 * fullscreen from here: the embed is created with `fs: 0`, which takes YouTube's
	 * own button and its double-tap away (issue #20).
	 *
	 * A phone is asked to stay in landscape while it lasts — not awaited, because the
	 * answer changes nothing: a device that refuses simply keeps rotating.
	 *
	 * Awaits the browser's answer instead of only the call, because a refusal
	 * usually arrives as a rejected promise: iOS Safari allows fullscreen on a
	 * `<video>` element only, which is out of reach inside a cross-origin iframe,
	 * and every browser rejects a request that did not come from a user gesture.
	 *
	 * @returns {Promise<boolean>} `false` when the browser refused, so callers can
	 *   say "not available here".
	 */
	export async function requestFullscreen() {
		if (!(await enterFullscreen(surface))) return false;
		void lockLandscape(window.screen);
		focus();
		return true;
	}

	/**
	 * Leave fullscreen again, if this player is what is in it.
	 * @returns {Promise<boolean>} Whether there was anything to leave.
	 */
	export async function exitFullscreen() {
		if (!fullscreen) return false;
		return await leaveFullscreen(document);
	}
</script>

<!--
	`tabindex="-1"` is not decoration: it makes the wrapper focusable, which is what
	{@link focus} needs to take the keyboard back from the iframe. `.player-surface`
	is styled in `app.css` for the fullscreen case — see the comment there.
-->
<div
	bind:this={surface}
	tabindex="-1"
	class={cn(
		'player-surface bg-muted relative aspect-video w-full overflow-hidden rounded-xl border',
		'focus-visible:outline-none',
		'[&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0',
		className
	)}
>
	<div bind:this={host} class="absolute inset-0"></div>

	{#if showPlaceholder}
		<div
			class="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center"
			role="status"
		>
			<Film class="size-10 animate-pulse" aria-hidden="true" />
			<span class="sr-only">{videoId ? 'Loading the player…' : 'No video selected'}</span>
		</div>
	{/if}

	{@render children?.()}
</div>
