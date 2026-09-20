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
 * The hard part is that a blur is not proof of a tap. Three other things produce
 * one, and each is told apart by a different signal:
 *
 * - **Switching tab or app** — the document is hidden. Nobody is looking, so nothing
 *   moves and no focus is taken.
 * - **The focus leaving for the address bar, devtools, another window** —
 *   `document.activeElement` is not the iframe.
 * - **Us** — the page loads the next video and the embed takes the focus along with
 *   it. That blur is indistinguishable from a tap by any signal the browser offers,
 *   so the page has to remember: it stamps the moment it did something that moves
 *   the focus, and a blur within {@link OUR_OWN_FOCUS_MS} of that stamp is ours.
 *   Without the stamp, rating a video with the overlay's own tier button would load
 *   the next one and take the overlay away with it.
 *
 * All of them are only distinguishable a tick after the event — the focus has not
 * settled while `blur` is being dispatched — which is why the page asks this from a
 * `setTimeout` rather than in the handler. See issue #23.
 */

/**
 * How long after the page moved the focus itself a blur still counts as ours.
 *
 * Generous on purpose: what has to happen in between is the IFrame API loading a
 * video. The only cost of being too generous is that a genuine tap within a second
 * of a video change does not toggle the overlay — one second during which the
 * overlay has just come back up anyway.
 */
export const OUR_OWN_FOCUS_MS = 1000;

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
 * Is the focus in the player's iframe?
 *
 * The guard on `iframe` is the point of the function and not defensive padding:
 * before the player is up there is no iframe, `document.activeElement` can be
 * `null` too, and `null === null` would report a tap on the video on every blur
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
 * @property {boolean} intoPlayer - The focus is in the embed's iframe; see
 *   {@link focusEnteredPlayer}, and ask a tick after the event.
 * @property {boolean} hidden - `document.visibilityState === 'hidden'`: the tab or
 *   the app went away.
 * @property {boolean} touch - A touch screen is driving this session.
 * @property {boolean} fullscreen - Our wrapper is the fullscreen element, which is
 *   the only time the overlay exists at all.
 * @property {number} sinceOurs - Milliseconds since the page last moved the focus
 *   itself; `Infinity` when it never has.
 */

/**
 * @typedef {Object} BlurResponse
 * @property {'wake'|'toggle'|null} overlay - The event to feed the overlay's state
 *   machine, or `null` to leave it exactly as it is.
 * @property {boolean} recoverFocus - Take the keyboard back, after
 *   {@link FOCUS_HANDBACK_MS}.
 */

/**
 * @param {BlurSituation} situation
 * @returns {BlurResponse}
 */
export function blurResponse({ intoPlayer, hidden, touch, fullscreen, sinceOurs }) {
	// Gone to another tab or another app. Waking an overlay nobody can see would spend
	// its three seconds while the screen is elsewhere, and there is no keyboard worth
	// fighting over until the page is back.
	if (hidden) return { overlay: null, recoverFocus: false };

	// The focus went somewhere that is not the video: the address bar, devtools,
	// another window. Nothing to take back, and in fullscreen it is still a sign of
	// life — the harmless half of the trade issue #20 settled on.
	if (!intoPlayer) return { overlay: fullscreen ? 'wake' : null, recoverFocus: false };

	// The embed has the focus and we are why. The keyboard still has to come back, but
	// the overlay must not move: the user pressed a button of ours, not the video.
	if (sinceOurs < OUR_OWN_FOCUS_MS) return { overlay: null, recoverFocus: true };

	return { overlay: fullscreen ? (touch ? 'toggle' : 'wake') : null, recoverFocus: true };
}
