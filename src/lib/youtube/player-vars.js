/**
 * How the embed itself is configured — the `playerVars` of `new YT.Player`.
 *
 * Its own module because every entry here is a decision with a reason, several of
 * them about what the embed must *not* do, and because that is what makes them
 * assertable without a browser.
 *
 * @see https://developers.google.com/youtube/player_parameters
 */

/**
 * @typedef {Object} PlayerVarsOptions
 * @property {boolean} [autoplay] - Play on load; `false` only cues the video.
 * @property {string} [origin] - `location.origin`; the API posts its messages there.
 */

/**
 * @param {PlayerVarsOptions} [options]
 * @returns {Record<string, string|number>} Ready for `new YT.Player(el, { playerVars })`.
 */
export function playerVarsFor({ autoplay = true, origin = '' } = {}) {
	return {
		// iOS plays inline instead of handing the video to its own full-screen player.
		playsinline: 1,
		rel: 0,
		modestbranding: 1,
		enablejsapi: 1,
		// No fullscreen button in the embed, and no double-tap to fullscreen either.
		//
		// YouTube's button fullscreens the *iframe*, which makes a cross-origin
		// document the fullscreen element: the keyboard goes to YouTube (issue #9) and
		// our overlay — the only way to rate a video from fullscreen — is not on screen
		// at all. On a phone that button is the obvious one to press, so the app's own
		// fullscreen has to be the only one on offer: the Fullscreen button under the
		// player, the `f` key, and "fullscreen on play" (issue #20).
		fs: 0,
		autoplay: autoplay ? 1 : 0,
		origin
	};
}
