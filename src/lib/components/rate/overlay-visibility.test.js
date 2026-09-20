import { describe, expect, it } from 'vitest';
import { canHide, OVERLAY_IDLE_MS, OVERLAY_SHOWN, overlayAfter } from './overlay-visibility.js';

/** @typedef {import('./overlay-visibility.js').OverlayVisibility} OverlayVisibility */
/** @typedef {import('./overlay-visibility.js').OverlayEvent} OverlayEvent */

/** Every state the machine can be in, for the rules that hold across all of them. */
const STATES = [
	{ visible: true, hovering: false },
	{ visible: true, hovering: true },
	{ visible: false, hovering: false },
	{ visible: false, hovering: true }
];

/**
 * Replay a session: the events in order, from a fresh fullscreen.
 *
 * @param {OverlayEvent[]} events
 * @param {import('./overlay-visibility.js').OverlayContext} [context]
 * @returns {OverlayVisibility}
 */
function after(events, context = {}) {
	return events.reduce(
		(state, event) => overlayAfter(state, event, context),
		/** @type {OverlayVisibility} */ ({ ...OVERLAY_SHOWN })
	);
}

describe('OVERLAY_IDLE_MS', () => {
	it('matches YouTube’s own autohide, so the two go together', () => {
		expect(OVERLAY_IDLE_MS).toBe(3000);
	});
});

describe('canHide', () => {
	it('is the countdown: only a visible, unheld, unhovered overlay can fade', () => {
		expect(canHide({ visible: true, hovering: false })).toBe(true);

		// Already gone.
		expect(canHide({ visible: false, hovering: false })).toBe(false);
		// The pointer is on the box.
		expect(canHide({ visible: true, hovering: true })).toBe(false);
		// A video ended unrated, or a menu of ours is open on top.
		expect(canHide({ visible: true, hovering: false }, { held: true })).toBe(false);
	});
});

describe('overlayAfter', () => {
	it('starts fullscreen with the controls up', () => {
		expect(OVERLAY_SHOWN.visible).toBe(true);
		expect(OVERLAY_SHOWN.hovering).toBe(false);
	});

	it('hides after the countdown and comes back on the next sign of life', () => {
		expect(after(['idle']).visible).toBe(false);
		expect(after(['idle', 'wake']).visible).toBe(true);
		// …and it can go again after that, for as long as the session lasts.
		expect(after(['idle', 'wake', 'idle']).visible).toBe(false);
	});

	it('stays up while the pointer is on the box', () => {
		const hovering = after(['enter', 'idle', 'idle']);
		expect(hovering).toEqual({ visible: true, hovering: true });

		// Leaving it does not bring anything back, it only starts the clock again.
		expect(after(['enter', 'leave']).visible).toBe(true);
		expect(after(['enter', 'leave', 'idle']).visible).toBe(false);
		expect(after(['idle', 'leave']).visible).toBe(false);
	});

	it('toggles on a tap, the way YouTube’s mobile player hides its own controls', () => {
		expect(after(['toggle']).visible).toBe(false);
		expect(after(['toggle', 'toggle']).visible).toBe(true);
		expect(after(['toggle', 'toggle', 'toggle']).visible).toBe(false);

		// And a tap on a faded overlay is the way back, without waiting for anything.
		expect(after(['idle', 'toggle']).visible).toBe(true);
	});

	it('lets a tap put away an overlay the countdown may not touch', () => {
		// A hold means "do not fade away on your own", not "the user may not put you
		// away": the tap is deliberate, and a video that ended unrated is still on the
		// tier bar underneath.
		const held = { held: true };
		expect(after(['idle'], held).visible).toBe(true);
		expect(after(['toggle'], held).visible).toBe(false);
		expect(after(['toggle', 'toggle'], held).visible).toBe(true);
	});

	it('leaves the pointer flag alone, in both directions', () => {
		for (const state of STATES) {
			expect(overlayAfter(state, 'toggle')).toEqual({
				visible: !state.visible,
				hovering: state.hovering
			});
		}
	});

	it('takes the pointer onto a faded overlay as a reason to show it', () => {
		// Hidden means `opacity-0`, not gone: the box still notices the pointer, which
		// is the mouse user's way back to it.
		expect(after(['idle', 'enter'])).toEqual({ visible: true, hovering: true });
	});

	it('never hides while something is holding it up', () => {
		// A video that ended unrated: the prompt is the overlay, so the overlay stays.
		const held = { held: true };
		expect(after(['idle'], held).visible).toBe(true);
		expect(after(['idle', 'idle', 'idle'], held).visible).toBe(true);

		// And it fades again as soon as nothing does — the rating that clears the hold
		// is itself a wake, so the countdown starts from there.
		expect(overlayAfter(after(['idle'], held), 'idle')).toEqual({
			visible: false,
			hovering: false
		});
	});

	it('hides on idle exactly when the countdown was allowed to run', () => {
		for (const state of STATES) {
			for (const held of [false, true]) {
				const next = overlayAfter(state, 'idle', { held });
				expect(next.visible, JSON.stringify({ state, held })).toBe(!canHide(state, { held }));
				expect(next.hovering).toBe(state.hovering);
			}
		}
	});

	it('resets to shown, so the next fullscreen does not start mid-fade', () => {
		expect(after(['idle', 'enter', 'reset'])).toEqual({ visible: true, hovering: false });
		// The pointer goes with it: `leave` never fires for an element that stopped
		// being rendered.
		expect(after(['enter', 'reset', 'idle']).visible).toBe(false);
	});

	it('answers with a new object every time, so a wake restarts the countdown', () => {
		// The caller hangs its `setTimeout` off this value: a wake that changes nothing
		// still has to mean "three more seconds".
		const state = { visible: true, hovering: false };
		const woken = overlayAfter(state, 'wake');

		expect(woken).toEqual(state);
		expect(woken).not.toBe(state);
	});

	it('leaves the state it was given alone', () => {
		const state = { visible: true, hovering: true };
		for (const event of /** @type {OverlayEvent[]} */ ([
			'wake',
			'toggle',
			'enter',
			'leave',
			'idle',
			'reset'
		])) {
			overlayAfter(state, event);
		}

		expect(state).toEqual({ visible: true, hovering: true });
		// `OVERLAY_SHOWN` is shared and frozen; `reset` must hand out a copy.
		expect(overlayAfter(state, 'reset')).not.toBe(OVERLAY_SHOWN);
	});
});
