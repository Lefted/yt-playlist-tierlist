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
	import { errorReasonFor, loadIframeApi, PLAYER_STATE } from '$lib/youtube/iframe-api.js';
	import { cn } from '$lib/utils.js';

	/** @typedef {import('$lib/youtube/iframe-api.js').YouTubePlayer} YouTubePlayer */

	/**
	 * @typedef {Object} Props
	 * @property {string|null} [videoId] - `null` renders the placeholder and tears the player down.
	 * @property {boolean} [autoplay] - Play on load; `false` only cues the video.
	 * @property {() => void} [onended] - The video played to its end.
	 * @property {(reason: import('$lib/youtube/iframe-api.js').PlayerErrorReason) => void} [onerror]
	 * @property {(state: number) => void} [onstatechange] - See `PLAYER_STATE`.
	 * @property {() => void} [onready] - The player is up and accepts commands.
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
		class: className
	} = $props();

	/** @type {HTMLDivElement|undefined} The box the API's iframe is mounted into. */
	let host = $state();

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
					playerVars: {
						playsinline: 1, // iOS plays inline instead of taking over the screen
						rel: 0,
						modestbranding: 1,
						enablejsapi: 1,
						autoplay: autoplay ? 1 : 0,
						origin: location.origin
					},
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

	/** @returns {void} */
	export function play() {
		player?.playVideo();
	}

	/** @returns {void} */
	export function pause() {
		player?.pauseVideo();
	}

	/**
	 * @param {number} seconds
	 * @returns {void}
	 */
	export function seekTo(seconds) {
		player?.seekTo(seconds, true);
	}

	/**
	 * Start the current video over.
	 * @returns {void}
	 */
	export function replay() {
		if (!player) return;
		player.seekTo(0, true);
		player.playVideo();
	}

	/** @returns {number} Playback position in seconds, `0` while there is no player. */
	export function getCurrentTime() {
		return player?.getCurrentTime() ?? 0;
	}

	/**
	 * Put the player's iframe into fullscreen.
	 *
	 * @returns {boolean} `false` when the browser refuses — iOS Safari only allows
	 *   fullscreen on a `<video>` element, which is out of reach inside a
	 *   cross-origin iframe, so callers should treat this as "not available here".
	 */
	export function requestFullscreen() {
		const frame = /** @type {any} */ (player?.getIframe() ?? null);
		if (!frame) return false;

		const request = frame.requestFullscreen ?? frame.webkitRequestFullscreen;
		if (typeof request !== 'function') return false;

		try {
			const result = request.call(frame);
			// Rejects when the call did not come from a user gesture; not worth surfacing.
			if (result && typeof result.catch === 'function') result.catch(() => {});
			return true;
		} catch {
			return false;
		}
	}
</script>

<div
	class={cn(
		'bg-muted relative aspect-video w-full overflow-hidden rounded-xl border',
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
</div>
