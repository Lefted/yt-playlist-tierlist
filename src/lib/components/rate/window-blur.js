/**
 * What a `window` blur means on the Rate page.
 *
 * The video is a cross-origin iframe: not one event inside it reaches us. The
 * single trace a tap or click on it leaves is the focus moving into that frame,
 * which makes our window lose the focus — and that we can hear. Everything the page
 * does about a tap on the video is therefore decided from one `blur`, and this
 * module is that decision, away from the DOM and from the clock.
 *
 * Two things hang off it:
 *
 * - **The overlay.** On a touch device a tap toggles it, the way YouTube's own
 *   mobile player hides its controls when you tap a video that is showing them. On a
 *   mouse setup the same click is play/pause and nothing else, so it only wakes the
 *   overlay — hiding the controls out from under a mouse that is about to use them
 *   would be its own bug, and the mouse has `PointerWake` to bring them back.
 * - **The keyboard.** Whoever put the focus into the iframe has to hand it back, or
 *   every key after that goes to a document that is not ours (issue #9) — and with
 *   `disablekb: 1` it goes nowhere at all. Handing it back is also what makes the
 *   *next* tap produce a fresh blur; without it only the first one would count.
 *
 * A window blurs for other reasons too — switching tab or app, most of all. Those
 * are not taps on the video: `document.activeElement` is still ours, so nothing is
 * toggled and no focus is taken. See issue #23.
 */

/**
 * A device where a tap is the only gesture there is: no hover, no fine pointer.
 *
 * The inverse of `PointerWake`'s query, and deliberately the same shape, so the two
 * halves of "who is driving this session" cannot drift apart.
 */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * How long to wait before taking the keyboard back from the iframe.
 *
 * Not zero: a tap on the embed may be opening one of YouTube's own menus, and
 * pulling the focus out while that is happening closes it again — which is what
 * issue #9 already learned the hard way. Long enough for the menu to settle, short
 * enough that the next keystroke is ours.
 */
export const FOCUS_HANDBACK_MS = 250;

/**
 * Is the focus now in the player's iframe?
 *
 * The guard on `iframe` is the point of the function and not defensive padding:
 * before the player is up there is no iframe, `document.activeElement` can be
 * `null` too, and `null === null` would hand the focus to the player on every blur
 * from anywhere.
 *
 * @param {{ activeElement?: unknown }|null|undefined} doc - Usually `document`.
 * @param {unknown} iframe - The embed's iframe, or `null` while there is none.
 * @returns {boolean}
 */
export function focusEnteredPlayer(doc, iframe) {
	return Boolean(iframe) && doc?.activeElement === iframe;
}

/**
 * @typedef {Object} BlurSituation
 * @property {boolean} intoPlayer - The focus landed in the embed's iframe; see
 *   {@link focusEnteredPlayer}.
 * @property {boolean} touch - {@link TOUCH_QUERY} matches.
 * @property {boolean} fullscreen - Our wrapper is the fullscreen element, which is
 *   the only time the overlay exists at all.
 */

/**
 * @typedef {Object} BlurResponse
 * @property {'wake'|'toggle'|null} overlay - The event to feed the overlay's state
 *   machine, or `null` when there is no overlay on screen to feed.
 * @property {boolean} recoverFocus - Take the keyboard back, after
 *   {@link FOCUS_HANDBACK_MS}.
 */

/**
 * @param {BlurSituation} situation
 * @returns {BlurResponse}
 */
export function blurResponse({ intoPlayer, touch, fullscreen }) {
	return {
		// The tap-to-hide half needs both: a touch device, and a tap that actually
		// landed on the video rather than the user leaving for another tab.
		overlay: fullscreen ? (intoPlayer && touch ? 'toggle' : 'wake') : null,
		// In and out of fullscreen. Outside it the page still owns the keyboard — the
		// tier bar, undo, the rating keys — and the iframe is the only thing we ever
		// take it back from.
		recoverFocus: intoPlayer
	};
}
