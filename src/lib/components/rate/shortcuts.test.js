import { describe, expect, it } from 'vitest';
import {
	BINDABLE_ACTIONS,
	DEFAULT_KEYBINDINGS,
	normalizeKeybindings,
	withoutChord
} from '$lib/keybindings.js';
import {
	chordConflict,
	isActivationTarget,
	isTypingTarget,
	shortcutFor,
	shortcutKeys,
	shortcutTable,
	shortcutsEnabled,
	tierChords
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
 * The defaults with a few actions rebound — what the user's table looks like after
 * a visit to the Edit shortcuts dialog.
 *
 * @param {Record<string, string[]>} overrides
 * @returns {import('$lib/types.js').Keybindings}
 */
function bound(overrides) {
	return normalizeKeybindings({ ...DEFAULT_KEYBINDINGS, ...overrides });
}

/**
 * The keydown that would produce a stored chord — the inverse of `chordFor`, near
 * enough for a test.
 *
 * @param {string} chord
 * @returns {any}
 */
function keydownFor(chord) {
	const segments = chord.split('+');
	const key = segments.pop() ?? '';
	return keydown(key === 'Space' ? ' ' : key, {
		ctrlKey: segments.includes('Ctrl'),
		altKey: segments.includes('Alt'),
		shiftKey: segments.includes('Shift'),
		metaKey: segments.includes('Meta')
	});
}

/**
 * @param {string|null} [match] - What `querySelector` should find.
 * @returns {any}
 */
function documentStub(match = null) {
	return { querySelector: () => match };
}

describe('chordConflict', () => {
	it('refuses a chord another action already has, and says which', () => {
		const conflict = chordConflict('s', DEFAULT_KEYBINDINGS, 'next');
		expect(conflict).toEqual({
			blocked: true,
			message: 'S is already S tier — remove it there first.'
		});
	});

	it('refuses a chord this very action already has', () => {
		expect(chordConflict('n', DEFAULT_KEYBINDINGS, 'next')?.blocked).toBe(true);
	});

	it('allows a player key but says what it shadows', () => {
		const conflict = chordConflict('k', DEFAULT_KEYBINDINGS, 'rateS');
		expect(conflict?.blocked).toBe(false);
		expect(conflict?.message).toContain('play / pause');
	});

	it('allows `?` but warns that the help list answers first', () => {
		const conflict = chordConflict('Shift+?', DEFAULT_KEYBINDINGS, 'rateS');
		expect(conflict?.blocked).toBe(false);
		expect(conflict?.message).toContain('shortcut list');
	});

	it('says nothing at all about a free chord', () => {
		expect(chordConflict('q', DEFAULT_KEYBINDINGS, 'rateS')).toBeNull();
	});

	it('frees a chord once it is removed — which is how a swap is made', () => {
		const freed = withoutChord(DEFAULT_KEYBINDINGS, 'fullscreen', 'f');
		expect(chordConflict('f', DEFAULT_KEYBINDINGS, 'rateF')?.blocked).toBe(true);
		expect(chordConflict('f', freed, 'rateF')).toBeNull();
	});
});

describe('the player keys, on or off', () => {
	it.each([true, false])('answers play/pause, mute and the seeks (rating keys: %s)', (on) => {
		const options = { ratingKeys: on };
		expect(shortcutFor(keydown('k'), options)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown(' '), options)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('Spacebar'), options)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('m'), options)).toEqual({ type: 'muteToggle' });
		expect(shortcutFor(keydown('ArrowRight'), options)).toEqual({ type: 'seekBy', seconds: 5 });
		expect(shortcutFor(keydown('ArrowLeft'), options)).toEqual({ type: 'seekBy', seconds: -5 });
		expect(shortcutFor(keydown('l'), options)).toEqual({ type: 'seekBy', seconds: 10 });
		expect(shortcutFor(keydown('j'), options)).toEqual({ type: 'seekBy', seconds: -10 });
	});

	it('ignores a held key — one f too long fullscreens twice, and seeks stay one jump', () => {
		expect(shortcutFor(keydown('ArrowRight', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('f', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('k', { repeat: true }))).toBeNull();
		expect(shortcutFor(keydown('n', { repeat: true }))).toBeNull();
	});

	it('leaves the number row alone — there is no percent-seek here', () => {
		expect(shortcutFor(keydown('0'))).toBeNull();
		expect(shortcutFor(keydown('5'))).toBeNull();
		expect(shortcutFor(keydown('5'), { ratingKeys: false })).toBeNull();
	});
});

describe('shortcutFor with the default bindings', () => {
	it.each(RATING_ORDER.filter((rating) => rating !== 'F'))(
		'maps %s to rating that tier',
		(rating) => {
			expect(shortcutFor(keydown(rating.toLowerCase()))).toEqual({ type: 'rate', rating });
		}
	);

	it('rates F on Shift+F and fullscreens on plain f, as YouTube does', () => {
		expect(shortcutFor(keydown('F', { shiftKey: true }))).toEqual({ type: 'rate', rating: 'F' });
		expect(shortcutFor(keydown('f'))).toEqual({ type: 'fullscreen' });
	});

	it('takes the tier keys back from the player: c rates', () => {
		expect(shortcutFor(keydown('c'))).toEqual({ type: 'rate', rating: 'C' });
	});

	it('maps n and p to the queue; the arrows seek instead', () => {
		expect(shortcutFor(keydown('n'))).toEqual({ type: 'next' });
		expect(shortcutFor(keydown('p'))).toEqual({ type: 'previous' });
		expect(shortcutFor(keydown('ArrowRight'))).toEqual({ type: 'seekBy', seconds: 5 });
	});

	it('maps r to replay', () => {
		expect(shortcutFor(keydown('r'))).toEqual({ type: 'replay' });
	});

	it('maps Shift+L to loop, past the player’s "forward 10 s"', () => {
		expect(shortcutFor(keydown('L', { shiftKey: true }))).toEqual({ type: 'loop' });
		expect(shortcutFor(keydown('l'))).toEqual({ type: 'seekBy', seconds: 10 });
	});

	it('maps Shift+H to the fullscreen overlay toggle, leaving plain h alone', () => {
		expect(shortcutFor(keydown('H', { shiftKey: true }))).toEqual({ type: 'toggleOverlay' });
		// `h` is nobody's: neither the player layer nor a default binding claims it.
		expect(shortcutFor(keydown('h'))).toBeNull();
	});

	it('maps ? to the help list — Shift is how the character is typed', () => {
		expect(shortcutFor(keydown('?', { shiftKey: true }))).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('?'))).toEqual({ type: 'help' });
	});

	it('leaves ? with a real modifier alone, macOS’ Cmd+? Help menu included', () => {
		expect(shortcutFor(keydown('?', { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(keydown('?', { metaKey: true, shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('?', { altKey: true }))).toBeNull();
	});

	it('maps u, Backspace and ctrl/cmd+z to undo', () => {
		expect(shortcutFor(keydown('u'))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('Backspace'))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('Z', { metaKey: true }))).toEqual({ type: 'undo' });
	});

	it('leaves redo and every unbound modifier combination to the browser', () => {
		expect(shortcutFor(keydown('z', { ctrlKey: true, shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('y', { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(keydown('s', { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(keydown('s', { metaKey: true }))).toBeNull();
		expect(shortcutFor(keydown('n', { altKey: true }))).toBeNull();
		expect(shortcutFor(keydown('z', { ctrlKey: true, altKey: true }))).toBeNull();
		// Both undo chords are exact: adding a modifier is no longer one of them.
		expect(shortcutFor(keydown('z', { metaKey: true, shiftKey: true }))).toBeNull();
	});

	it('ignores shift plus an unbound key', () => {
		expect(shortcutFor(keydown('S', { shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('N', { shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('K', { shiftKey: true }))).toBeNull();
	});

	it('ignores unknown keys and malformed events', () => {
		expect(shortcutFor(keydown('x'))).toBeNull();
		expect(shortcutFor(keydown('Enter'))).toBeNull();
		expect(shortcutFor(/** @type {any} */ ({}))).toBeNull();
		expect(shortcutFor(/** @type {any} */ (null))).toBeNull();
	});
});

describe('shortcutFor with the user’s own bindings', () => {
	it('beats the proxied player key: a tier bound to k rates', () => {
		const bindings = bound({ rateS: ['k'] });
		expect(shortcutFor(keydown('k'), { bindings })).toEqual({ type: 'rate', rating: 'S' });
		// Play/pause is then only on Space — which is the point of the priority rule.
		expect(shortcutFor(keydown(' '), { bindings })).toEqual({ type: 'playPause' });
		// And the letter it left behind means nothing any more.
		expect(shortcutFor(keydown('s'), { bindings })).toBeNull();
	});

	it('claims a modifier combination the browser would otherwise keep', () => {
		const bindings = bound({ next: ['Ctrl+Shift+z'] });
		expect(shortcutFor(keydown('Z', { ctrlKey: true, shiftKey: true }), { bindings })).toEqual({
			type: 'next'
		});
	});

	it('answers every chord of an action with several', () => {
		const bindings = bound({ replay: ['r', 'Space', 'Home'] });
		for (const event of [keydown('r'), keydown(' '), keydown('Home')]) {
			expect(shortcutFor(event, { bindings })).toEqual({ type: 'replay' });
		}
	});

	it('answers nothing for an action the user unbound', () => {
		expect(shortcutFor(keydown('r'), { bindings: bound({ replay: [] }) })).toBeNull();
	});

	it('cannot take `?` — the help list answers first', () => {
		const bindings = bound({ rateS: ['Shift+?'] });
		expect(shortcutFor(keydown('?', { shiftKey: true }), { bindings })).toEqual({ type: 'help' });
	});

	it('falls back to the defaults when it is handed nothing', () => {
		expect(shortcutFor(keydown('s'), {})).toEqual({ type: 'rate', rating: 'S' });
		expect(shortcutFor(keydown('s'))).toEqual({ type: 'rate', rating: 'S' });
	});

	it('answers something for every action the user can bind', () => {
		// The intent table and the action list are two lists that have to stay in step:
		// an action added without an intent would match its key and then do nothing.
		for (const { id } of BINDABLE_ACTIONS) {
			expect(shortcutFor(keydownFor(DEFAULT_KEYBINDINGS[id][0])), id).not.toBeNull();
		}
	});
});

describe('shortcutFor with the rating keys off', () => {
	const off = { ratingKeys: false };

	it('answers no rating key at all, bound or default', () => {
		for (const key of ['s', 'a', 'b', 'c', 'd', 'n', 'p', 'r', 'u', 'Backspace', 'f']) {
			expect(shortcutFor(keydown(key), off)).toBeNull();
		}
		expect(shortcutFor(keydown('z', { ctrlKey: true }), off)).toBeNull();
		expect(shortcutFor(keydown('F', { shiftKey: true }), off)).toBeNull();
		expect(shortcutFor(keydown('L', { shiftKey: true }), off)).toBeNull();
		expect(shortcutFor(keydown('H', { shiftKey: true }), off)).toBeNull();
	});

	it('silences a rebound key too — the switch is about the whole layer', () => {
		expect(
			shortcutFor(keydown('q'), { bindings: bound({ rateS: ['q'] }), ratingKeys: false })
		).toBeNull();
	});

	it('gives a shadowed player key back', () => {
		const bindings = bound({ rateS: ['k'] });
		expect(shortcutFor(keydown('k'), { bindings, ratingKeys: false })).toEqual({
			type: 'playPause'
		});
	});

	it('still lets the player be driven', () => {
		expect(shortcutFor(keydown('k'), off)).toEqual({ type: 'playPause' });
		expect(shortcutFor(keydown('m'), off)).toEqual({ type: 'muteToggle' });
		expect(shortcutFor(keydown('j'), off)).toEqual({ type: 'seekBy', seconds: -10 });
	});

	it('still opens the help list, which is how you find out what is left', () => {
		expect(shortcutFor(keydown('?'), off)).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('?', { shiftKey: true }), off)).toEqual({ type: 'help' });
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
		// The Edit shortcuts dialog is one of them: a row recording a key must not
		// rate the video at the same time.
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
	it('shows the tier letters, F on Shift, while the rating keys are on', () => {
		const keys = shortcutKeys();
		expect(keys.rateS).toEqual(['S']);
		expect(keys.rateF).toEqual(['Shift+F']);
		expect(keys.fullscreen).toEqual(['F']);
		expect(keys.undo).toEqual(['U', '⌫', 'Ctrl+Z', 'Meta+Z']);
		expect(keys.loop).toEqual(['Shift+L']);
		expect(keys.toggleOverlay).toEqual(['Shift+H']);
	});

	it('stops promising a player key a binding has taken', () => {
		const keys = shortcutKeys({ bindings: bound({ rateS: ['k'] }) });
		// `k` rates now, so only `Space` is left to play/pause.
		expect(keys.playPause).toEqual(['Space']);
		expect(keys.rateS).toEqual(['K']);
	});

	it('promises the shadowed key again once the rating keys are switched off', () => {
		const bindings = bound({ rateS: ['k'] });
		expect(shortcutKeys({ bindings, ratingKeys: false }).playPause).toEqual(['K', 'Space']);
	});

	it('follows a rebinding — a hint can never promise a key the page does not answer', () => {
		const keys = shortcutKeys({ bindings: bound({ rateS: ['k', 'Ctrl+Alt+s'] }) });
		expect(keys.rateS).toEqual(['K', 'Ctrl+Alt+S']);
	});

	it('promises nothing for an action the user unbound', () => {
		expect(shortcutKeys({ bindings: bound({ replay: [] }) }).replay).toEqual([]);
	});

	it('promises the player keys either way', () => {
		for (const ratingKeys of [true, false]) {
			const keys = shortcutKeys({ ratingKeys });
			expect(keys.playPause).toEqual(['K', 'Space']);
			expect(keys.mute).toEqual(['M']);
			expect(keys.seekForward).toEqual(['→', 'L']);
			expect(keys.seekBack).toEqual(['←', 'J']);
		}
	});

	it('promises no rating key while they are off, apart from the help list', () => {
		const keys = shortcutKeys({ ratingKeys: false });
		for (const action of BINDABLE_ACTIONS) {
			expect(keys[action.id]).toEqual([]);
		}
		expect(keys.help).toEqual(['?']);
	});
});

describe('tierChords', () => {
	it('is the bound chords, not the key caps — the caller formats', () => {
		expect(tierChords()).toEqual({
			S: ['s'],
			A: ['a'],
			B: ['b'],
			C: ['c'],
			D: ['d'],
			F: ['Shift+f']
		});
	});

	it('follows a rebinding', () => {
		expect(tierChords({ bindings: bound({ rateS: ['k'] }) })?.S).toEqual(['k']);
	});

	it('is nothing at all while they are off', () => {
		expect(tierChords({ ratingKeys: false })).toBeNull();
	});
});

describe('shortcutTable', () => {
	it('documents the tiers first, one row each, so a rebinding stays readable', () => {
		const { rating } = shortcutTable();
		expect(rating.slice(0, 6).map((entry) => entry.description)).toEqual(
			RATING_ORDER.map((tier) => `${tier} tier`)
		);
		expect(rating[5]).toEqual({ keys: ['Shift+F'], description: 'F tier' });
	});

	it('has a description and at least one key for every entry', () => {
		for (const ratingKeys of [true, false]) {
			const { rating, player } = shortcutTable({ ratingKeys });
			for (const entry of [...rating, ...player]) {
				expect(entry.keys.length).toBeGreaterThan(0);
				expect(entry.description).not.toBe('');
			}
		}
	});

	it('lists undo, loop and the player keys', () => {
		const { rating, player } = shortcutTable();
		const descriptions = [...rating, ...player].map((entry) => entry.description);
		expect(descriptions).toContain('Undo the last rating');
		expect(descriptions).toContain('Loop the current video');
		expect(descriptions).toContain('Mute / unmute');
	});

	it('drops an action the user unbound rather than showing an empty row', () => {
		const { rating } = shortcutTable({ bindings: bound({ loop: [] }) });
		expect(rating.map((entry) => entry.description)).not.toContain('Loop the current video');
	});

	it('drops a player row a binding has taken over entirely', () => {
		const { player } = shortcutTable({ bindings: bound({ rateS: ['m'] }) });
		// `m` was mute's only key; promising it here while `m` rates would be exactly
		// the promise the page no longer keeps.
		expect(player.map((entry) => entry.description)).not.toContain('Mute / unmute');
		expect(player.map((entry) => entry.description)).toContain('Play / pause');
	});

	it('keeps only the player group while the rating keys are off', () => {
		const { rating, player } = shortcutTable({ ratingKeys: false });
		// `?` still works, but a Rating group holding nothing but "show this list"
		// reads like a mistake; the popover says so in words instead.
		expect(rating).toEqual([]);
		expect(player.length).toBeGreaterThan(0);
	});
});
