import { describe, expect, it } from 'vitest';
import { isTypingTarget, SHORTCUT_HELP, shortcutFor, shortcutsEnabled } from './shortcuts.js';
import { RATING_ORDER } from '$lib/types.js';

/**
 * @param {string} key
 * @param {Record<string, boolean>} [modifiers]
 * @returns {any}
 */
function keydown(key, modifiers = {}) {
	return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers };
}

/**
 * @param {string|null} [match] - What `querySelector` should find.
 * @returns {any}
 */
function documentStub(match = null) {
	return { querySelector: () => match };
}

describe('shortcutFor', () => {
	it.each(RATING_ORDER)('maps %s to rating that tier', (rating) => {
		expect(shortcutFor(keydown(rating.toLowerCase()))).toEqual({ type: 'rate', rating });
		expect(shortcutFor(keydown(rating))).toEqual({ type: 'rate', rating });
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

describe('SHORTCUT_HELP', () => {
	it('documents every tier key', () => {
		expect(SHORTCUT_HELP[0].keys).toEqual(RATING_ORDER);
	});

	it('has a description for every entry', () => {
		for (const entry of SHORTCUT_HELP) {
			expect(entry.keys.length).toBeGreaterThan(0);
			expect(entry.description).not.toBe('');
		}
	});
});
