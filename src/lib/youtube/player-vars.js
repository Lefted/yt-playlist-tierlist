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
		// No keyboard inside the embed either.
		//
		// One click on the video puts the focus into the iframe, and from then on every
		// keystroke belongs to a cross-origin document: `f` fullscreens the *iframe*
		// (the very thing `fs: 0` is here to prevent), and nothing reaches the rate
		// page's handler, because a keydown in another browsing context does not
		// propagate out of it. Turning YouTube's own handling off means a stray key
		// does nothing at all rather than something we cannot see or undo, and the Rate
		// page hands the focus back a moment after every tap (issue #23), which is what
		// makes the keys ours again.
		//
		// The price is the embed's own shortcuts, so the page has to pay it back: `k`
		// and `Space`, `m`, the arrows and `j`/`l` — volume included — are proxied
		// through the IFrame API in `components/rate/shortcuts.js`. That parity is what
		// makes this acceptable; a key added here without a proxy there is a key the
		// user simply loses.
		disablekb: 1,
		autoplay: autoplay ? 1 : 0,
		origin
	};
}
