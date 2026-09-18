import { describe, expect, it } from 'vitest';
import {
	isTypingTarget,
	ratingForKey,
	shortcutFor,
	shortcutKeys,
	shortcutTable,
	shortcutsEnabled,
	tierKeysFor
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

describe('tier keys per mode', () => {
	it('maps the tiers to their letters by default', () => {
		expect(tierKeysFor('letters')).toEqual({ S: 's', A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' });
	});

	it('maps the tiers to 1-6 in digits mode', () => {
		expect(tierKeysFor('digits')).toEqual({ S: '1', A: '2', B: '3', C: '4', D: '5', F: '6' });
	});

	it('has no keys at all while off', () => {
		expect(tierKeysFor('off')).toBeNull();
	});

	it('looks a key back up per mode', () => {
		expect(ratingForKey('letters', 'c')).toBe('C');
		expect(ratingForKey('letters', '4')).toBeNull();
		expect(ratingForKey('digits', '4')).toBe('C');
		expect(ratingForKey('digits', 'c')).toBeNull();
		expect(ratingForKey('off', 'c')).toBeNull();
	});
});

describe('shortcutFor in letters mode', () => {
	it.each(RATING_ORDER)('maps %s to rating that tier', (rating) => {
		expect(shortcutFor(keydown(rating.toLowerCase()), 'letters')).toEqual({ type: 'rate', rating });
		expect(shortcutFor(keydown(rating), 'letters')).toEqual({ type: 'rate', rating });
	});

	it('defaults to letters when no mode is given', () => {
		expect(shortcutFor(keydown('s'))).toEqual({ type: 'rate', rating: 'S' });
	});

	it('maps n and ArrowRight to next', () => {
		expect(shortcutFor(keydown('n'))).toEqual({ type: 'next' });
		expect(shortcutFor(keydown('ArrowRight'))).toEqual({ type: 'next' });
	});

	it('maps p and ArrowLeft to previous', () => {
		expect(shortcutFor(keydown('p'))).toEqual({ type: 'previous' });
		expect(shortcutFor(keydown('ArrowLeft'))).toEqual({ type: 'previous' });
	});

	it('maps r and 0 to replay', () => {
		expect(shortcutFor(keydown('r'))).toEqual({ type: 'replay' });
		expect(shortcutFor(keydown('0'))).toEqual({ type: 'replay' });
	});

	it('maps space to play/pause', () => {
		expect(shortcutFor(keydown(' '))).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('Spacebar'))).toEqual({ type: 'playPause' });
	});

	it('maps shift+f to fullscreen while plain f still rates', () => {
		expect(shortcutFor(keydown('F', { shiftKey: true }))).toEqual({ type: 'fullscreen' });
		expect(shortcutFor(keydown('f'))).toEqual({ type: 'rate', rating: 'F' });
	});

	it('maps ? to the help list', () => {
		expect(shortcutFor(keydown('?', { shiftKey: true }))).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('?'))).toEqual({ type: 'help' });
	});

	it('maps l to the loop toggle', () => {
		expect(shortcutFor(keydown('l'))).toEqual({ type: 'loop' });
		expect(shortcutFor(keydown('l'), 'digits')).toEqual({ type: 'loop' });
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

	it('ignores a held key, so one f too long rates one video', () => {
		expect(shortcutFor(keydown('f', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('n', { repeat: true }))).toBeNull();
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

describe('shortcutFor in digits mode', () => {
	it.each(RATING_ORDER.map((rating, index) => [String(index + 1), rating]))(
		'rates with %s',
		(key, rating) => {
			expect(shortcutFor(keydown(key), 'digits')).toEqual({ type: 'rate', rating });
		}
	);

	it('leaves the tier letters alone — f is the YouTube habit, not an F rating', () => {
		for (const rating of RATING_ORDER) {
			expect(shortcutFor(keydown(rating.toLowerCase()), 'digits')).toBeNull();
		}
	});

	it('keeps every non-tier key', () => {
		expect(shortcutFor(keydown('n'), 'digits')).toEqual({ type: 'next' });
		expect(shortcutFor(keydown('p'), 'digits')).toEqual({ type: 'previous' });
		expect(shortcutFor(keydown('r'), 'digits')).toEqual({ type: 'replay' });
		expect(shortcutFor(keydown(' '), 'digits')).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('u'), 'digits')).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('l'), 'digits')).toEqual({ type: 'loop' });
		expect(shortcutFor(keydown('?'), 'digits')).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('F', { shiftKey: true }), 'digits')).toEqual({ type: 'fullscreen' });
	});

	it('drops 0 for replay, which would read like a seventh tier', () => {
		expect(shortcutFor(keydown('0'), 'digits')).toBeNull();
	});
});

describe('shortcutFor while off', () => {
	it('answers nothing at all', () => {
		for (const key of ['s', '1', 'n', 'p', 'r', ' ', 'u', 'l', 'Backspace', '?', '0']) {
			expect(shortcutFor(keydown(key), 'off')).toBeNull();
		}
		expect(shortcutFor(keydown('z', { ctrlKey: true }), 'off')).toBeNull();
		expect(shortcutFor(keydown('F', { shiftKey: true }), 'off')).toBeNull();
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

	it('is false in every case while the mode is off', () => {
		expect(shortcutsEnabled({ target: { tagName: 'BODY' } }, documentStub(), 'off')).toBe(false);
		expect(shortcutsEnabled({ target: null }, null, 'off')).toBe(false);
	});

	it('is true in digits mode under the same conditions as in letters mode', () => {
		expect(shortcutsEnabled({ target: { tagName: 'BODY' } }, documentStub(), 'digits')).toBe(true);
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

	it('survives a missing document', () => {
		expect(shortcutsEnabled({ target: null }, null)).toBe(true);
	});
});

describe('shortcutKeys', () => {
	it('shows the tier letters in letters mode and the digits in digits mode', () => {
		expect(shortcutKeys('letters').rate).toEqual(RATING_ORDER);
		expect(shortcutKeys('digits').rate).toEqual(['1', '2', '3', '4', '5', '6']);
	});

	it('drops 0 from the replay hint in digits mode', () => {
		expect(shortcutKeys('letters').replay).toEqual(['R', '0']);
		expect(shortcutKeys('digits').replay).toEqual(['R']);
	});

	it('promises no key at all while off', () => {
		for (const keys of Object.values(shortcutKeys('off'))) expect(keys).toEqual([]);
	});
});

describe('shortcutTable', () => {
	it('documents every tier key of the active mode', () => {
		expect(shortcutTable('letters')[0].keys).toEqual(RATING_ORDER);
		expect(shortcutTable('digits')[0].keys).toEqual(['1', '2', '3', '4', '5', '6']);
	});

	it('has a description and at least one key for every entry', () => {
		for (const mode of /** @type {const} */ (['letters', 'digits'])) {
			for (const entry of shortcutTable(mode)) {
				expect(entry.keys.length).toBeGreaterThan(0);
				expect(entry.description).not.toBe('');
			}
		}
	});

	it('lists undo and loop', () => {
		const descriptions = shortcutTable('letters').map((entry) => entry.description);
		expect(descriptions).toContain('Undo the last rating');
		expect(descriptions).toContain('Loop the current video');
	});

	it('is empty while off, so the popover can say so instead', () => {
		expect(shortcutTable('off')).toEqual([]);
	});
});
