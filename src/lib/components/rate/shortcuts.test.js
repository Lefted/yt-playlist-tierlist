import { describe, expect, it } from 'vitest';
import {
	BINDABLE_ACTIONS,
	DEFAULT_KEYBINDINGS,
	bindingIndex,
	chordConflict,
	chordFor,
	chordLabel,
	formatChord,
	isActivationTarget,
	isTypingTarget,
	normalizeChord,
	normalizeKeybindings,
	parseChord,
	shortcutFor,
	shortcutKeys,
	shortcutTable,
	shortcutsEnabled,
	tierKeys,
	withChord,
	withoutChord
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
 * @param {string|null} [match] - What `querySelector` should find.
 * @returns {any}
 */
function documentStub(match = null) {
	return { querySelector: () => match };
}

describe('chords', () => {
	it('spells the modifiers in one canonical order, whatever order they came in', () => {
		expect(normalizeChord('Shift+Ctrl+z')).toBe('Ctrl+Shift+z');
		expect(normalizeChord('Meta+Alt+Ctrl+Shift+a')).toBe('Ctrl+Alt+Shift+Meta+a');
	});

	it('stores a single character lower-case, with Shift spelled out', () => {
		expect(normalizeChord('F')).toBe('f');
		expect(normalizeChord('Shift+F')).toBe('Shift+f');
		expect(chordFor(keydown('F', { shiftKey: true }))).toBe('Shift+f');
		expect(chordFor(keydown('f'))).toBe('f');
	});

	it('accepts the spellings a person would type', () => {
		expect(normalizeChord('CTRL+Z')).toBe('Ctrl+z');
		expect(normalizeChord('cmd+z')).toBe('Meta+z');
		expect(normalizeChord('  Control + Z  ')).toBe('Ctrl+z');
		expect(normalizeChord('backspace')).toBe('Backspace');
	});

	it('round-trips through parse and format', () => {
		for (const chord of [
			's',
			'Shift+f',
			'Ctrl+z',
			'Backspace',
			'ArrowLeft',
			'Ctrl+Alt+Shift+Meta+q'
		]) {
			expect(formatChord(parseChord(chord))).toBe(chord);
			expect(normalizeChord(chord)).toBe(chord);
		}
	});

	it('calls the space bar Space, whatever the browser calls it', () => {
		expect(chordFor(keydown(' '))).toBe('Space');
		expect(chordFor(keydown('Spacebar'))).toBe('Space');
		expect(normalizeChord('space')).toBe('Space');
	});

	it('treats + as a key, not only as the separator', () => {
		expect(normalizeChord('+')).toBe('+');
		expect(normalizeChord('Ctrl++')).toBe('Ctrl++');
		expect(parseChord('Ctrl++')).toEqual({
			Ctrl: true,
			Alt: false,
			Shift: false,
			Meta: false,
			key: '+'
		});
	});

	it('refuses anything that is not a chord', () => {
		for (const text of ['', '   ', 'Ctrl+', 'Nope+z', 'Shift', 'Control', null, 42, {}]) {
			expect(normalizeChord(/** @type {any} */ (text))).toBeNull();
		}
	});

	it('is not a chord while only a modifier is down', () => {
		expect(chordFor(keydown('Shift', { shiftKey: true }))).toBeNull();
		expect(chordFor(keydown('Control', { ctrlKey: true }))).toBeNull();
		expect(chordFor(null)).toBeNull();
	});

	it('reads back as a key cap, not as storage', () => {
		expect(chordLabel('s')).toBe('S');
		expect(chordLabel('Shift+f')).toBe('Shift+F');
		expect(chordLabel('Ctrl+z')).toBe('Ctrl+Z');
		expect(chordLabel('Backspace')).toBe('⌫');
		expect(chordLabel('ArrowRight')).toBe('→');
		expect(chordLabel('Space')).toBe('Space');
		expect(chordLabel('nonsense+')).toBe('');
	});
});

describe('the default bindings', () => {
	it('keeps every YouTube key: f is fullscreen and the F tier moves to Shift+F', () => {
		expect(DEFAULT_KEYBINDINGS.fullscreen).toEqual(['f']);
		expect(DEFAULT_KEYBINDINGS.rateF).toEqual(['Shift+f']);
	});

	it('is the letters for the other five tiers', () => {
		expect(DEFAULT_KEYBINDINGS.rateS).toEqual(['s']);
		expect(DEFAULT_KEYBINDINGS.rateA).toEqual(['a']);
		expect(DEFAULT_KEYBINDINGS.rateB).toEqual(['b']);
		expect(DEFAULT_KEYBINDINGS.rateC).toEqual(['c']);
		expect(DEFAULT_KEYBINDINGS.rateD).toEqual(['d']);
	});

	it('keeps the queue, replay, undo and loop keys of #11', () => {
		expect(DEFAULT_KEYBINDINGS.next).toEqual(['n']);
		expect(DEFAULT_KEYBINDINGS.previous).toEqual(['p']);
		expect(DEFAULT_KEYBINDINGS.replay).toEqual(['r']);
		expect(DEFAULT_KEYBINDINGS.undo).toEqual(['u', 'Backspace', 'Ctrl+z']);
		expect(DEFAULT_KEYBINDINGS.loop).toEqual(['Shift+l']);
	});

	it('binds every bindable action and nothing else', () => {
		expect(Object.keys(normalizeKeybindings(DEFAULT_KEYBINDINGS))).toEqual(
			BINDABLE_ACTIONS.map((action) => action.id)
		);
	});

	it('never gives one chord to two actions', () => {
		const chords = Object.values(DEFAULT_KEYBINDINGS).flat();
		expect(new Set(chords).size).toBe(chords.length);
	});

	it('leaves `?` out — it is fixed, so it cannot be rebound', () => {
		expect(BINDABLE_ACTIONS.map((action) => action.id)).not.toContain('help');
	});
});

describe('normalizeKeybindings', () => {
	it('fills a missing action from the defaults', () => {
		expect(normalizeKeybindings({ next: ['x'] }).rateS).toEqual(['s']);
		expect(normalizeKeybindings({}).undo).toEqual(['u', 'Backspace', 'Ctrl+z']);
	});

	it('drops an action nobody knows', () => {
		const bindings = normalizeKeybindings({ rateZ: ['z'], noSuchThing: ['q'] });
		expect(bindings.rateZ).toBeUndefined();
		expect(bindings.noSuchThing).toBeUndefined();
	});

	it('drops a malformed chord and keeps the rest of the row', () => {
		expect(normalizeKeybindings({ undo: ['u', 'Nope+z', '', 42, null] }).undo).toEqual(['u']);
	});

	it('canonicalises what it keeps', () => {
		expect(normalizeKeybindings({ rateF: ['SHIFT+F'], undo: ['CTRL+Z'] })).toMatchObject({
			rateF: ['Shift+f'],
			undo: ['Ctrl+z']
		});
	});

	it('keeps an action the user unbound entirely', () => {
		expect(normalizeKeybindings({ loop: [] }).loop).toEqual([]);
	});

	it('leaves a chord with the first action that claims it', () => {
		// Hand-edited storage could otherwise make one keystroke ambiguous.
		const bindings = normalizeKeybindings({ rateS: ['q'], next: ['q'] });
		expect(bindings.rateS).toEqual(['q']);
		expect(bindings.next).toEqual([]);
	});

	it('collapses a chord repeated inside one action', () => {
		expect(normalizeKeybindings({ replay: ['r', 'R', 'r'] }).replay).toEqual(['r']);
	});

	it('survives anything at all', () => {
		for (const raw of [null, undefined, 'nope', 42, []]) {
			expect(normalizeKeybindings(raw).rateS).toEqual(['s']);
		}
	});

	it('hands back a fresh table, never the one it was given', () => {
		const source = { rateS: ['s'] };
		const bindings = normalizeKeybindings(source);
		bindings.rateS.push('q');
		expect(source.rateS).toEqual(['s']);
	});
});

describe('withChord / withoutChord', () => {
	it('adds and removes without touching the table it was given', () => {
		const before = normalizeKeybindings({});
		const added = withChord(before, 'rateS', 'Q');
		expect(added.rateS).toEqual(['s', 'q']);
		expect(before.rateS).toEqual(['s']);

		expect(withoutChord(added, 'rateS', 's').rateS).toEqual(['q']);
	});

	it('ignores a chord an action already has, and a malformed one', () => {
		const bindings = normalizeKeybindings({});
		expect(withChord(bindings, 'rateS', 's').rateS).toEqual(['s']);
		expect(withChord(bindings, 'rateS', 'Nope+z').rateS).toEqual(['s']);
	});

	it('lets the last chord of an action go', () => {
		expect(withoutChord(normalizeKeybindings({}), 'loop', 'Shift+l').loop).toEqual([]);
	});
});

describe('bindingIndex', () => {
	it('answers chord → action', () => {
		const index = bindingIndex(DEFAULT_KEYBINDINGS);
		expect(index.get('s')).toBe('rateS');
		expect(index.get('Shift+f')).toBe('rateF');
		expect(index.get('f')).toBe('fullscreen');
		expect(index.get('k')).toBeUndefined();
	});
});

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

	it('maps ? to the help list', () => {
		expect(shortcutFor(keydown('?', { shiftKey: true }))).toEqual({ type: 'help' });
		expect(shortcutFor(keydown('?'))).toEqual({ type: 'help' });
	});

	it('maps u, Backspace and ctrl/cmd+z to undo', () => {
		expect(shortcutFor(keydown('u'))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('Backspace'))).toEqual({ type: 'undo' });
		expect(shortcutFor(keydown('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
	});

	it('leaves redo and every unbound modifier combination to the browser', () => {
		expect(shortcutFor(keydown('z', { ctrlKey: true, shiftKey: true }))).toBeNull();
		expect(shortcutFor(keydown('y', { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(keydown('s', { ctrlKey: true }))).toBeNull();
		expect(shortcutFor(keydown('s', { metaKey: true }))).toBeNull();
		expect(shortcutFor(keydown('n', { altKey: true }))).toBeNull();
		expect(shortcutFor(keydown('z', { ctrlKey: true, altKey: true }))).toBeNull();
		// `Cmd+Z` is only undo because someone bound it; by default it is not.
		expect(shortcutFor(keydown('Z', { metaKey: true }))).toBeNull();
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
		expect(keys.undo).toEqual(['U', '⌫', 'Ctrl+Z']);
		expect(keys.loop).toEqual(['Shift+L']);
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

describe('tierKeys', () => {
	it('is the tier letters while the rating keys are on', () => {
		expect(tierKeys()).toEqual({
			S: ['S'],
			A: ['A'],
			B: ['B'],
			C: ['C'],
			D: ['D'],
			F: ['Shift+F']
		});
	});

	it('follows a rebinding', () => {
		expect(tierKeys({ bindings: bound({ rateS: ['k'] }) }).S).toEqual(['K']);
	});

	it('is nothing at all while they are off', () => {
		expect(tierKeys({ ratingKeys: false })).toBeNull();
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

	it('keeps only the player group while the rating keys are off', () => {
		const { rating, player } = shortcutTable({ ratingKeys: false });
		// `?` still works, but a Rating group holding nothing but "show this list"
		// reads like a mistake; the popover says so in words instead.
		expect(rating).toEqual([]);
		expect(player.length).toBeGreaterThan(0);
	});
});
