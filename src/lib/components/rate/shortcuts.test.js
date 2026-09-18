import { describe, expect, it } from 'vitest';
import {
	isActivationTarget,
	isTypingTarget,
	shortcutFor,
	shortcutKeys,
	shortcutTable,
	shortcutsEnabled,
	tierKeys
} from './shortcuts.js';
import { RATING_ORDER } from '$lib/types.js';

/**
 * @param {string} key
 * @param {Record<string, boolean>} [modifiers]
 * @returns {any}
 */
function keydown(key, modifiers = {}) {
	return {
		key,
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		repeat: false,
		...modifiers
	};
}

/**
 * @param {string|null} [match] - What `querySelector` should find.
 * @returns {any}
 */
function documentStub(match = null) {
	return { querySelector: () => match };
}

describe('tierKeys', () => {
	it('is the tier letters while the rating keys are on', () => {
		expect(tierKeys(true)).toEqual({ S: 's', A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' });
		expect(tierKeys()).toEqual(tierKeys(true));
	});

	it('is nothing at all while they are off', () => {
		expect(tierKeys(false)).toBeNull();
	});
});

describe('the player keys, on or off', () => {
	it.each([true, false])('answers play/pause, mute and the seeks (rating keys: %s)', (on) => {
		expect(shortcutFor(keydown('k'), on)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown(' '), on)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('Spacebar'), on)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('m'), on)).toEqual({ type: 'muteToggle' });
		expect(shortcutFor(keydown('ArrowRight'), on)).toEqual({ type: 'seekBy', seconds: 5 });
		expect(shortcutFor(keydown('ArrowLeft'), on)).toEqual({ type: 'seekBy', seconds: -5 });
		expect(shortcutFor(keydown('l'), on)).toEqual({ type: 'seekBy', seconds: 10 });
		expect(shortcutFor(keydown('j'), on)).toEqual({ type: 'seekBy', seconds: -10 });
	});

	it('ignores a held key — one f too long rates one video, and seeks stay one jump', () => {
		expect(shortcutFor(keydown('ArrowRight', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('f', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('k', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('n', { repeat: true }))).toBeNull();
	});

	it('leaves the number row alone — there is no percent-seek here', () => {
		expect(shortcutFor(keydown('0'))).toBeNull();
		expect(shortcutFor(keydown('5'))).toBeNull();
		expect(shortcutFor(keydown('5'), false)).toBeNull();
	});
});

describe('shortcutFor with the rating keys on', () => {
	it.each(RATING_ORDER)('maps %s to rating that tier', (rating) => {
		expect(shortcutFor(keydown(rating.toLowerCase()))).toEqual({ type: 'rate', rating });
		expect(shortcutFor(keydown(rating))).toEqual({ type: 'rate', rating });
	});

	it('takes the tier keys back from the player: c and f rate', () => {
		expect(shortcutFor(keydown('c'))).toEqual({ type: 'rate', rating: 'C' });
		expect(shortcutFor(keydown('f'))).toEqual({ type: 'rate', rating: 'F' });
	});

	it('maps n and p to the queue; the arrows seek instead', () => {
		expect(shortcutFor(keydown('n'))).toEqual({ type: 'next' });
		expect(shortcutFor(keydown('p'))).toEqual({ type: 'previous' });
		expect(shortcutFor(keydown('ArrowRight'))).toEqual({ type: 'seekBy', seconds: 5 });
	});

	it('maps r to replay', () => {
		expect(shortcutFor(keydown('r'))).toEqual({ type: 'replay' });
	});

	it('maps shift+f to fullscreen and shift+l to loop, past the tier and seek keys', () => {
		expect(shortcutFor(keydown('F', { shiftKey: true }))).toEqual({ type: 'fullscreen' });
		expect(shortcutFor(keydown('L', { shiftKey: true }))).toEqual({ type: 'loop' });
		expect(shortcutFor(keydown('f'))).toEqual({ type: 'rate', rating: 'F' });
		expect(shortcutFor(keydown('l'))).toEqual({ type: 'seekBy', seconds: 10 });
	});

	it('maps ? to the help list', () => {
		expect(shortcutFor(keydown('?', { shiftKey: true }))).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('?'))).toEqual({ type: 'help' });
	});

	it('maps u, Backspace and ctrl/cmd+z to undo', () => {
		expect(shortcutFor(keydown('u'))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('Backspace'))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('Z', { metaKey: true }))).toEqual({ type: 'undo' });
	});

	it('leaves redo to the browser', () => {
		expect(shortcutFor(keydown('z', { ctrlKey: true, shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('y', { ctrlKey: true }))).toBeNull();
	});

	it('ignores keys with ctrl, meta or alt', () => {
		expect(shortcutFor(keydown('s', { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(keydown('s', { metaKey: true }))).toBeNull();
		expect(shortcutFor(keydown('n', { altKey: true }))).toBeNull();
		expect(shortcutFor(keydown('z', { ctrlKey: true, altKey: true }))).toBeNull();
	});

	it('ignores shift plus an unrelated key', () => {
		expect(shortcutFor(keydown('S', { shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('N', { shiftKey: true }))).toBeNull();
	});

	it('ignores unknown keys and malformed events', () => {
		expect(shortcutFor(keydown('x'))).toBeNull();
		expect(shortcutFor(keydown('Enter'))).toBeNull();
		expect(shortcutFor(/** @type {any} */ ({}))).toBeNull();
		expect(shortcutFor(/** @type {any} */ (null))).toBeNull();
	});
});

describe('shortcutFor with the rating keys off', () => {
	it('answers no rating key at all', () => {
		for (const key of ['s', 'a', 'b', 'c', 'd', 'f', 'n', 'p', 'r', 'u', 'Backspace']) {
			expect(shortcutFor(keydown(key), false)).toBeNull();
		}
		expect(shortcutFor(keydown('z', { ctrlKey: true }), false)).toBeNull();
		expect(shortcutFor(keydown('F', { shiftKey: true }), false)).toBeNull();
		expect(shortcutFor(keydown('L', { shiftKey: true }), false)).toBeNull();
	});

	it('still lets the player be driven', () => {
		expect(shortcutFor(keydown('k'), false)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('m'), false)).toEqual({ type: 'muteToggle' });
		expect(shortcutFor(keydown('j'), false)).toEqual({ type: 'seekBy', seconds: -10 });
	});

	it('still opens the help list, which is how you find out what is left', () => {
		expect(shortcutFor(keydown('?'), false)).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('?', { shiftKey: true }), false)).toEqual({ type: 'help' });
	});
});

describe('isTypingTarget', () => {
	it.each(['INPUT', 'TEXTAREA', 'SELECT'])('is true for <%s>', (tagName) => {
		expect(isTypingTarget(/** @type {any} */ ({ tagName }))).toBe(true);
	});

	it('is true for contenteditable', () => {
		expect(isTypingTarget(/** @type {any} */ ({ tagName: 'DIV', isContentEditable: true }))).toBe(
			true
		);
	});

	it('is false for ordinary elements and for nothing', () => {
		expect(isTypingTarget(/** @type {any} */ ({ tagName: 'BUTTON' }))).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});

describe('isActivationTarget', () => {
	it.each(['BUTTON', 'A', 'SUMMARY'])('is true for <%s>', (tagName) => {
		expect(isActivationTarget(/** @type {any} */ ({ tagName }))).toBe(true);
	});

	it('is true for anything that says it is a button', () => {
		expect(
			isActivationTarget(/** @type {any} */ ({ tagName: 'DIV', getAttribute: () => 'button' }))
		).toBe(true);
	});

	it('is false for ordinary elements and for nothing', () => {
		expect(isActivationTarget(/** @type {any} */ ({ tagName: 'DIV' }))).toBe(false);
		expect(isActivationTarget(null)).toBe(false);
	});
});

describe('shortcutsEnabled', () => {
	it('is true on a plain page with nothing open', () => {
		expect(shortcutsEnabled({ target: { tagName: 'BODY' } }, documentStub())).toBe(true);
	});

	it('is false while typing', () => {
		expect(shortcutsEnabled({ target: { tagName: 'INPUT' } }, documentStub())).toBe(false);
	});

	it('is false while a dialog, menu or popover is open', () => {
		expect(shortcutsEnabled({ target: { tagName: 'BODY' } }, documentStub('dialog'))).toBe(false);
	});

	it('asks for open popover content, which carries no ARIA role', () => {
		/** @type {string[]} */
		const asked = [];
		shortcutsEnabled(
			{ target: null },
			{ querySelector: (selector) => asked.push(selector) && null }
		);

		// A popover is only an overlay until it starts animating out.
		expect(asked[0]).toContain('[data-slot="popover-content"]');
		expect(asked[0]).toContain(':not([data-state="closed"])');
	});

	it('leaves Space to a focused button, which has no other way of being pressed', () => {
		const button = { tagName: 'BUTTON' };
		expect(shortcutsEnabled({ key: ' ', target: button }, documentStub())).toBe(false);
		expect(shortcutsEnabled({ key: 'Spacebar', target: button }, documentStub())).toBe(false);

		// Every other key still reaches the page from a button.
		expect(shortcutsEnabled({ key: 'k', target: button }, documentStub())).toBe(true);
		// And Space itself does when nothing is focused.
		expect(shortcutsEnabled({ key: ' ', target: { tagName: 'BODY' } }, documentStub())).toBe(true);
	});

	it('survives a missing document', () => {
		expect(shortcutsEnabled({ target: null }, null)).toBe(true);
	});
});

describe('shortcutKeys', () => {
	it('shows the tier letters while the rating keys are on', () => {
		expect(shortcutKeys(true).rate).toEqual(RATING_ORDER);
	});

	it('promises the player keys either way', () => {
		for (const on of [true, false]) {
			expect(shortcutKeys(on).playPause).toEqual(['K', 'Space']);
			expect(shortcutKeys(on).mute).toEqual(['M']);
			expect(shortcutKeys(on).seekForward).toEqual(['→', 'L']);
			expect(shortcutKeys(on).seekBack).toEqual(['←', 'J']);
		}
	});

	it('promises no rating key while they are off, apart from the help list', () => {
		const keys = shortcutKeys(false);
		for (const action of ['rate', 'next', 'previous', 'replay', 'undo', 'loop', 'fullscreen']) {
			expect(keys[action]).toEqual([]);
		}
		expect(keys.help).toEqual(['?']);
	});

	it('keeps fullscreen and loop on Shift', () => {
		expect(shortcutKeys().fullscreen).toEqual(['⇧', 'F']);
		expect(shortcutKeys().loop).toEqual(['⇧', 'L']);
	});
});

describe('shortcutTable', () => {
	it('documents the tier keys first', () => {
		expect(shortcutTable(true).rating[0].keys).toEqual(RATING_ORDER);
	});

	it('has a description and at least one key for every entry', () => {
		for (const on of [true, false]) {
			const { rating, player } = shortcutTable(on);
			for (const entry of [...rating, ...player]) {
				expect(entry.keys.length).toBeGreaterThan(0);
				expect(entry.description).not.toBe('');
			}
		}
	});

	it('lists undo, loop and the player keys', () => {
		const { rating, player } = shortcutTable(true);
		const descriptions = [...rating, ...player].map((entry) => entry.description);
		expect(descriptions).toContain('Undo the last rating');
		expect(descriptions).toContain('Loop the current video');
		expect(descriptions).toContain('Mute / unmute');
	});

	it('keeps only the player group while the rating keys are off', () => {
		const { rating, player } = shortcutTable(false);
		// `?` still works, but a Rating group holding nothing but "show this list"
		// reads like a mistake; the popover says so in words instead.
		expect(rating).toEqual([]);
		expect(player.length).toBeGreaterThan(0);
	});
});
