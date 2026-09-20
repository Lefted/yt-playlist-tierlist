import { describe, expect, it } from 'vitest';
import { blurResponse, FOCUS_HANDBACK_MS, focusEnteredPlayer, TOUCH_QUERY } from './window-blur.js';

/** Stand-ins: the module only ever compares identities. */
const iframe = { name: 'the embed' };
const somethingElse = { name: 'a filter popover' };

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
		expect(blurResponse({ intoPlayer: true, touch: true, fullscreen: true })).toEqual({
			overlay: 'toggle',
			recoverFocus: true
		});
	});

	it('only wakes it when a mouse clicks the video', () => {
		// A click on a desktop is play/pause; taking the controls away under a hand that
		// is about to use them would be its own bug.
		expect(blurResponse({ intoPlayer: true, touch: false, fullscreen: true })).toEqual({
			overlay: 'wake',
			recoverFocus: true
		});
	});

	it('does not toggle for a blur that is not a tap on the video', () => {
		// Switching tab or app blurs the window too, and an overlay that vanished while
		// the user was away would be a mystery on the way back.
		expect(blurResponse({ intoPlayer: false, touch: true, fullscreen: true }).overlay).toBe('wake');
		expect(blurResponse({ intoPlayer: false, touch: false, fullscreen: true }).overlay).toBe(
			'wake'
		);
	});

	it('has no overlay to speak of outside fullscreen', () => {
		for (const touch of [true, false]) {
			for (const intoPlayer of [true, false]) {
				expect(blurResponse({ intoPlayer, touch, fullscreen: false }).overlay).toBeNull();
			}
		}
	});

	it('takes the keyboard back exactly when the iframe took it, fullscreen or not', () => {
		for (const fullscreen of [true, false]) {
			for (const touch of [true, false]) {
				expect(blurResponse({ intoPlayer: true, touch, fullscreen }).recoverFocus).toBe(true);
				// Never from anything of ours: a popover, the tier bar, a dialog.
				expect(blurResponse({ intoPlayer: false, touch, fullscreen }).recoverFocus).toBe(false);
			}
		}
	});
});

describe('the constants', () => {
	it('waits long enough for a YouTube menu to settle', () => {
		// Zero would pull the focus out from under a menu that is still opening, which
		// is what issue #9 ran into.
		expect(FOCUS_HANDBACK_MS).toBe(250);
	});

	it('asks for a touch screen the way `PointerWake` asks for a mouse', () => {
		expect(TOUCH_QUERY).toBe('(hover: none) and (pointer: coarse)');
	});
});
