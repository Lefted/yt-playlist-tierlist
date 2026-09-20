/**
 * When the fullscreen rating overlay is up, and what takes it down again.
 *
 * The overlay shares the screen with YouTube's own controls, which fade out about
 * three seconds after the last sign of life and come back on the next movement or
 * tap. Ours should do the same — an overlay that stays on a video the user is
 * watching is in the way, and two sets of controls that appear and disappear on
 * different schedules read as a bug. We cannot see a single event inside the
 * cross-origin iframe, so "the same" is an approximation built from the signals we
 * do have, and each of them arrives here as one `wake`.
 *
 * This module is the whole rule, minus the clock and minus the DOM: the Rate page
 * feeds it events and owns the one `setTimeout`, which is what makes every
 * transition testable without either. The countdown and the `idle` transition ask
 * the same question ({@link canHide}), so a state that must stay up is a state
 * that is not counting down — there is no timer to lose a race with.
 *
 * Deliberately *not* here: whether the overlay is collapsed into its eye button.
 * That is the user's standing choice (issue #19), remembered across videos and
 * reloads, while this is about the last few seconds. Collapsed, the eye is what
 * fades out and comes back.
 */

/**
 * How long the overlay stays up after the last sign of life.
 *
 * YouTube's own controls autohide after about three seconds; matching it is the
 * point, so the two fade together rather than one after the other.
 */
export const OVERLAY_IDLE_MS = 3000;

/**
 * @typedef {Object} OverlayVisibility
 * @property {boolean} visible - Whether the overlay is on screen.
 * @property {boolean} hovering - The pointer is on the box itself.
 */

/**
 * What the overlay knows about the world outside this module.
 *
 * @typedef {Object} OverlayContext
 * @property {boolean} [held] - Something needs the overlay to stay up no matter how
 *   long nothing happens: a video that ended unrated (the prompt *is* the overlay),
 *   or a menu of ours layered on top.
 */

/**
 * Everything that counts as a sign of life reaches here as `wake`; where it came
 * from — the pointer on the box, a shortcut, a tap that moved the focus into the
 * iframe, the catch layer over the video — is the page's business, not ours.
 *
 * `toggle` is the deliberate one: a tap on the video of a touch device, which on
 * YouTube's mobile player takes the controls away again when they are showing
 * (issue #23). It is the only event that may *hide* an overlay something is holding
 * up — a hold means "do not let this fade away on its own", not "the user may not
 * put it away".
 *
 * `enter`/`leave` are the pointer arriving on and leaving the box, `idle` is the
 * countdown running out, and `reset` is fullscreen beginning or ending.
 *
 * @typedef {'wake'|'toggle'|'enter'|'leave'|'idle'|'reset'} OverlayEvent
 */

/** Where every fullscreen starts, and where leaving one puts it back. */
export const OVERLAY_SHOWN = Object.freeze({ visible: true, hovering: false });

/**
 * May the overlay go away from where it is now?
 *
 * The countdown is only run while this is true, and `idle` only hides while it is
 * still true — so "never hide while X" is stated once, here.
 *
 * @param {OverlayVisibility} state
 * @param {OverlayContext} [context]
 * @returns {boolean}
 */
export function canHide(state, { held = false } = {}) {
	return state.visible && !state.hovering && !held;
}

/**
 * The state after an event.
 *
 * **Always a new object**, even when nothing about it changed: that is how a wake
 * with nothing to show still restarts the countdown, and it is what lets the caller
 * hang the timer off this value alone.
 *
 * @param {OverlayVisibility} state
 * @param {OverlayEvent} event
 * @param {OverlayContext} [context]
 * @returns {OverlayVisibility}
 */
export function overlayAfter(state, event, context = {}) {
	switch (event) {
		case 'wake':
			return { visible: true, hovering: state.hovering };

		// A tap on the video, on a device where a tap is the only gesture there is: it
		// means the opposite of whatever is on screen. `canHide` is deliberately not
		// asked — that question is "may this fade out by itself", and this is the user
		// saying so. The hovering flag is carried along untouched; a touch screen has no
		// hover to lose, and a mouse setup never sends this event.
		case 'toggle':
			return { visible: !state.visible, hovering: state.hovering };

		// The pointer is on the box: it stays up until the pointer goes away again,
		// because hiding the thing somebody is reaching for is the one unforgivable
		// version of this.
		case 'enter':
			return { visible: true, hovering: true };

		case 'leave':
			// Not a wake: leaving the box is a sign of life like any other movement, but
			// it must not *show* an overlay the user has just watched fade out.
			return { visible: state.visible, hovering: false };

		case 'idle':
			return { visible: !canHide(state, context), hovering: state.hovering };

		// Leaving fullscreen: the next one starts shown rather than mid-fade. The
		// pointer is dropped too — `leave` does not fire when the element it was over
		// stops being rendered.
		case 'reset':
			return { ...OVERLAY_SHOWN };
	}
}
