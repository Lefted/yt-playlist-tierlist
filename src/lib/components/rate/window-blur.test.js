import { describe, expect, it } from 'vitest';
import {
	blurResponse,
	FOCUS_HANDBACK_MS,
	focusEnteredPlayer,
	OUR_OWN_FOCUS_MS
} from './window-blur.js';

/** Stand-ins: the module only ever compares identities. */
const iframe = { name: 'the embed' };
const somethingElse = { name: 'a filter popover' };

/** A tap on the video, fullscreen, on a touch screen — the case the module is for. */
const TAP = {
	intoPlayer: true,
	hidden: false,
	touch: true,
	fullscreen: true,
	sinceOurs: Infinity
};

describe('focusEnteredPlayer', () => {
	it('is the iframe having the focus, and nothing else', () => {
		expect(focusEnteredPlayer({ activeElement: iframe }, iframe)).toBe(true);
		expect(focusEnteredPlayer({ activeElement: somethingElse }, iframe)).toBe(false);
	});

	it('says no while there is no player, whatever has the focus', () => {
		// The trap this guard exists for: with no iframe *and* no active element,
		// `null === null` would report a tap on the video on every blur from anywhere.
		expect(focusEnteredPlayer({ activeElement: null }, null)).toBe(false);
		expect(focusEnteredPlayer({ activeElement: undefined }, undefined)).toBe(false);
		expect(focusEnteredPlayer({ activeElement: somethingElse }, null)).toBe(false);
	});

	it('survives a missing document', () => {
		expect(focusEnteredPlayer(null, iframe)).toBe(false);
		expect(focusEnteredPlayer(undefined, iframe)).toBe(false);
	});
});

describe('blurResponse', () => {
	it('toggles the overlay when a finger taps the video', () => {
		expect(blurResponse(TAP)).toEqual({ overlay: 'toggle', recoverFocus: true });
	});

	it('only wakes it when a mouse clicks the video', () => {
		// A click on a desktop is play/pause; taking the controls away under a hand that
		// is about to use them would be its own bug.
		expect(blurResponse({ ...TAP, touch: false })).toEqual({
			overlay: 'wake',
			recoverFocus: true
		});
	});

	it('leaves the overlay alone when the page moved the focus itself', () => {
		// Rate with the overlay's own tier button: the next video loads, the embed takes
		// the focus with it, and the blur that follows is not a tap. Before this, the
		// overlay vanished on every rating made from it.
		for (const touch of [true, false]) {
			expect(blurResponse({ ...TAP, touch, sinceOurs: 0 })).toEqual({
				overlay: null,
				recoverFocus: true
			});
			expect(blurResponse({ ...TAP, touch, sinceOurs: OUR_OWN_FOCUS_MS - 1 }).overlay).toBeNull();
		}

		// …and a tap long enough afterwards is a tap again.
		expect(blurResponse({ ...TAP, sinceOurs: OUR_OWN_FOCUS_MS }).overlay).toBe('toggle');
	});

	it('does nothing at all for a tab or app switch', () => {
		// Nobody is looking: an overlay that woke here would spend its three seconds on
		// a screen that is somewhere else, and there is no keyboard to fight over.
		for (const intoPlayer of [true, false]) {
			expect(blurResponse({ ...TAP, hidden: true, intoPlayer })).toEqual({
				overlay: null,
				recoverFocus: false
			});
		}
	});

	it('takes no focus from anything that is not the iframe', () => {
		// The address bar, devtools, another window of ours — in fullscreen that is still
		// a sign of life, but never a reason to grab the keyboard.
		for (const touch of [true, false]) {
			expect(blurResponse({ ...TAP, intoPlayer: false, touch })).toEqual({
				overlay: 'wake',
				recoverFocus: false
			});
		}
	});

	it('has no overlay to speak of outside fullscreen', () => {
		for (const touch of [true, false]) {
			for (const intoPlayer of [true, false]) {
				expect(blurResponse({ ...TAP, fullscreen: false, intoPlayer, touch }).overlay).toBeNull();
			}
		}
	});

	it('takes the keyboard back from the iframe fullscreen or not', () => {
		// Outside fullscreen the page still owns the rating keys, and with `disablekb: 1`
		// a key pressed into the embed goes nowhere at all.
		expect(blurResponse({ ...TAP, fullscreen: false }).recoverFocus).toBe(true);
		expect(blurResponse({ ...TAP, fullscreen: false, sinceOurs: 0 }).recoverFocus).toBe(true);
	});
});

describe('the constants', () => {
	it('waits long enough for a YouTube menu to settle', () => {
		// Zero would pull the focus out from under a menu that is still opening, which
		// is what issue #9 ran into.
		expect(FOCUS_HANDBACK_MS).toBe(250);
	});

	it('gives a video change long enough to grab the focus', () => {
		expect(OUR_OWN_FOCUS_MS).toBe(1000);
		expect(OUR_OWN_FOCUS_MS).toBeGreaterThan(FOCUS_HANDBACK_MS);
	});
});
