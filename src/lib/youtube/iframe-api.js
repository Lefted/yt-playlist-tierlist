/**
 * Loader for the YouTube IFrame Player API (`https://www.youtube.com/iframe_api`).
 *
 * The API is a singleton: it announces itself through the global
 * `window.onYouTubeIframeAPIReady` callback, which fires exactly once no matter
 * how many players want it. This module therefore caches one promise and hands
 * it to every caller, so a page full of players still loads a single script tag.
 *
 * Nothing here runs at import time — `window` is only touched inside
 * {@link loadIframeApi}, which is called from component effects.
 */

/** Player states as reported by `onStateChange` (`YT.PlayerState`). */
export const PLAYER_STATE = {
	UNSTARTED: -1,
	ENDED: 0,
	PLAYING: 1,
	PAUSED: 2,
	BUFFERING: 3,
	CUED: 5
};

/**
 * `onError` codes that mean "this video cannot be embedded here": removed,
 * private, or embedding disabled by its owner.
 * @see https://developers.google.com/youtube/iframe_api_reference#onError
 */
const UNAVAILABLE_CODES = [100, 101, 150];

/**
 * Why playback failed. `unavailable` is the actionable one — the video is gone or
 * refuses to embed, so it should be flagged in the library.
 * @typedef {'unavailable'|'other'} PlayerErrorReason
 */

/**
 * The subset of the `YT.Player` instance API this app uses.
 * @typedef {Object} YouTubePlayer
 * @property {(videoId: string) => void} loadVideoById - Load and play.
 * @property {(videoId: string) => void} cueVideoById - Load, but wait for a play.
 * @property {() => void} playVideo
 * @property {() => void} pauseVideo
 * @property {() => void} stopVideo
 * @property {(seconds: number, allowSeekAhead?: boolean) => void} seekTo
 * @property {() => number} getCurrentTime
 * @property {() => number} getDuration
 * @property {() => HTMLIFrameElement|null} getIframe
 * @property {() => void} destroy
 */

/**
 * @typedef {Object} YouTubeApi
 * @property {new (element: HTMLElement|string, options: Record<string, unknown>) => YouTubePlayer} Player
 */

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';
const SCRIPT_ID = 'youtube-iframe-api';

/** @type {Promise<YouTubeApi>|null} Shared across every caller; see module docs. */
let pending = null;

/**
 * Map an `onError` code to the reason the app cares about.
 *
 * @param {unknown} code - `event.data` of the IFrame API's `onError`.
 * @returns {PlayerErrorReason}
 */
export function errorReasonFor(code) {
	return UNAVAILABLE_CODES.includes(Number(code)) ? 'unavailable' : 'other';
}

/**
 * Load the IFrame API, at most once per page.
 *
 * Resolves immediately when the API is already there (a second player, a
 * client-side navigation back to the Rate page, or another script that pulled it
 * in first). Rejects when the script cannot be fetched — offline, or blocked.
 *
 * @returns {Promise<YouTubeApi>}
 */
export function loadIframeApi() {
	const win = /** @type {any} */ (globalThis);
	if (win.YT?.Player) return Promise.resolve(/** @type {YouTubeApi} */ (win.YT));
	if (pending) return pending;
	if (!win.document) return Promise.reject(new Error('The YouTube IFrame API needs a document.'));

	pending = new Promise((resolve, reject) => {
		// The API overwrites nothing, it just calls this global. Chain any existing
		// callback so we never silently disable another consumer.
		const previous = win.onYouTubeIframeAPIReady;
		win.onYouTubeIframeAPIReady = () => {
			if (typeof previous === 'function') previous();
			resolve(/** @type {YouTubeApi} */ (win.YT));
		};

		if (win.document.getElementById(SCRIPT_ID)) return; // already on its way

		const script = win.document.createElement('script');
		script.id = SCRIPT_ID;
		script.src = SCRIPT_SRC;
		script.async = true;
		script.onerror = () => {
			// Let the next caller retry instead of handing out a permanently failed promise.
			pending = null;
			script.remove();
			reject(new Error('Could not load the YouTube IFrame API.'));
		};
		win.document.head.appendChild(script);
	});

	return pending;
}
