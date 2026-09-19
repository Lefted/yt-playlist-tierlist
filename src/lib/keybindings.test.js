import { describe, expect, it } from 'vitest';
import {
	BINDABLE_ACTIONS,
	DEFAULT_KEYBINDINGS,
	ariaKeyshortcuts,
	bindingIndex,
	chordFor,
	chordLabel,
	formatChord,
	normalizeChord,
	normalizeKeybindings,
	parseChord,
	ratingOf,
	withChord,
	withoutChord
} from './keybindings.js';

/**
 * @param {string} key
 * @param {Record<string, boolean>} [modifiers]
 * @returns {any}
 */
function keydown(key, modifiers = {}) {
	return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers };
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
		// Both undo chords: whichever the keyboard has is the one the hand reaches for.
		expect(DEFAULT_KEYBINDINGS.undo).toEqual(['u', 'Backspace', 'Ctrl+z', 'Meta+z']);
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
		expect(normalizeKeybindings({}).undo).toEqual(['u', 'Backspace', 'Ctrl+z', 'Meta+z']);
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

	it('lets a stored chord beat a default, whichever way round they sit', () => {
		// The user moved fullscreen onto `s`; the S tier's default must give way, not
		// the other way round — a default is a guess, a stored chord is a decision.
		const moved = normalizeKeybindings({ fullscreen: ['s'] });
		expect(moved.fullscreen).toEqual(['s']);
		expect(moved.rateS).toEqual([]);

		// And the same the other way: the F tier takes `f` back, fullscreen loses it.
		const taken = normalizeKeybindings({ rateF: ['f'] });
		expect(taken.rateF).toEqual(['f']);
		expect(taken.fullscreen).toEqual([]);
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

	it('refuses to steal a chord from another action', () => {
		// The invariant lives here, not only in the dialog's conflict message: a swap
		// is made by removing first, and no caller can shortcut that.
		const bindings = normalizeKeybindings({});
		const attempt = withChord(bindings, 'next', 's');
		expect(attempt.next).toEqual(['n']);
		expect(attempt.rateS).toEqual(['s']);

		const after = withChord(withoutChord(bindings, 'rateS', 's'), 'next', 's');
		expect(after.next).toEqual(['n', 's']);
		expect(after.rateS).toEqual([]);
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

describe('ariaKeyshortcuts', () => {
	it('spells the key names assistive technology expects, not the key caps', () => {
		expect(ariaKeyshortcuts(['Shift+f'])).toBe('Shift+F');
		expect(ariaKeyshortcuts(['Ctrl+z'])).toBe('Control+Z');
		expect(ariaKeyshortcuts(['Backspace', 'ArrowRight'])).toBe('Backspace ArrowRight');
	});

	it('is nothing at all for an unbound action, so the attribute is left off', () => {
		expect(ariaKeyshortcuts([])).toBeUndefined();
		expect(ariaKeyshortcuts(['Nope+z'])).toBeUndefined();
	});
});

describe('ratingOf', () => {
	it('answers the tier of a rating action and nothing for the rest', () => {
		expect(ratingOf('rateS')).toBe('S');
		expect(ratingOf('rateF')).toBe('F');
		expect(ratingOf('next')).toBeNull();
	});
});

describe('the closed action list', () => {
	it('is exactly these ids, in this order', () => {
		// Spelled out on purpose: `ActionId` in types.js, the Rate page's intents and
		// this list are three things that have to stay in step, and a literal list is
		// what makes adding an action a deliberate edit in all three.
		expect(BINDABLE_ACTIONS.map((action) => action.id)).toEqual([
			'rateS',
			'rateA',
			'rateB',
			'rateC',
			'rateD',
			'rateF',
			'next',
			'previous',
			'replay',
			'undo',
			'loop',
			'fullscreen'
		]);
	});

	it('gives every one of them a default', () => {
		for (const { id } of BINDABLE_ACTIONS) {
			expect(DEFAULT_KEYBINDINGS[id], id).toBeDefined();
		}
	});
});
