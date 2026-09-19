/**
 * The keys of the rating layer, as data: which action answers to which chord.
 *
 * Domain only — the chord grammar, the bindable actions, the defaults, and the
 * total functions a stored table is cleaned up and edited with. Nothing here knows
 * about keyboard events reaching a page, about the player keys the Rate page
 * proxies, or about how a key is drawn; that is
 * `components/rate/shortcuts.js`, which builds on this. `state/settings.svelte.js`
 * needs the same vocabulary to load and persist the table, which is why it lives
 * down here in `$lib` rather than next to the page that matches against it.
 *
 * A **chord** is one key plus its modifiers, stored as a canonical string:
 * modifiers in `Ctrl+Alt+Shift+Meta` order, then the key. Single-character keys are
 * stored lower-case (`s`, `Shift+f`, `Ctrl+z`) so that one chord has exactly one
 * spelling; {@link chordLabel} is what turns that into the `Shift+F` a `<kbd>`
 * shows, and {@link ariaKeyshortcuts} into what `aria-keyshortcuts` wants. Named
 * keys keep their `KeyboardEvent.key` spelling (`Backspace`, `ArrowLeft`), with the
 * space bar written `Space`.
 *
 * One invariant runs through the whole module: **a chord belongs to at most one
 * action.** {@link normalizeKeybindings} enforces it on load and {@link withChord}
 * on every edit, so a keystroke can never be ambiguous — not even after a hand edit
 * of `localStorage`.
 */

import { TIERS } from '$lib/tiers.js';

/** @typedef {import('$lib/types.js').Rating} Rating */
/** @typedef {import('$lib/types.js').ActionId} ActionId */
/** @typedef {import('$lib/types.js').Keybindings} Keybindings */

/**
 * One key plus its modifiers, as {@link parseChord} reads a chord string.
 * @typedef {{ Ctrl: boolean, Alt: boolean, Shift: boolean, Meta: boolean, key: string }} Chord
 */

/* -------------------------------------------------------------------------- */
/* Chords                                                                      */
/* -------------------------------------------------------------------------- */

/** The modifiers a chord can carry, in the order it spells them. */
const MODIFIERS = /** @type {const} */ (['Ctrl', 'Alt', 'Shift', 'Meta']);

/**
 * Keys that are *only* a modifier. Holding one is not a chord yet — the recorder
 * keeps waiting for the key it modifies.
 */
const MODIFIER_KEYS = new Set([
	'Shift',
	'Control',
	'Alt',
	'Meta',
	'AltGraph',
	'CapsLock',
	'OS',
	'Hyper',
	'Super'
]);

/** Every spelling we accept for a modifier, lower-case → canonical. */
const MODIFIER_ALIASES = /** @type {Record<string, (typeof MODIFIERS)[number]>} */ ({
	ctrl: 'Ctrl',
	control: 'Ctrl',
	alt: 'Alt',
	option: 'Alt',
	shift: 'Shift',
	meta: 'Meta',
	cmd: 'Meta',
	command: 'Meta',
	super: 'Meta',
	win: 'Meta'
});

/** What `aria-keyshortcuts` calls each modifier — key names, not key caps. */
const ARIA_MODIFIERS = /** @type {Record<(typeof MODIFIERS)[number], string>} */ ({
	Ctrl: 'Control',
	Alt: 'Alt',
	Shift: 'Shift',
	Meta: 'Meta'
});

/**
 * Named keys whose spelling we pin down, so `backspace` out of hand-edited storage
 * and `Backspace` out of a real event end up as the same chord. Anything else
 * multi-character (`F5`, `AudioVolumeUp`, …) is kept as the browser spells it.
 */
const NAMED_KEYS = [
	'Space',
	'Backspace',
	'Delete',
	'Enter',
	'Escape',
	'Tab',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	'Insert',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown'
];
const NAMED_BY_LOWER = new Map(NAMED_KEYS.map((key) => [key.toLowerCase(), key]));

/** How a key reads in a `<kbd>`; everything else is shown as it is stored. */
const KEY_LABELS = /** @type {Record<string, string>} */ ({
	Backspace: '⌫',
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓',
	Escape: 'Esc'
});

/**
 * Canonical spelling of one key, or `null` when there is no key at all (an empty
 * string, a lone modifier, a non-string).
 *
 * @param {unknown} key - A `KeyboardEvent.key`, or the key part of a stored chord.
 * @returns {string|null}
 */
function normalizeKey(key) {
	if (typeof key !== 'string') return null;
	// ' ' is the space bar; 'Spacebar' is what older WebKit calls it.
	if (key === ' ' || key === 'Spacebar') return 'Space';
	if (key === '' || MODIFIER_KEYS.has(key)) return null;
	if (key.length === 1) return key.toLowerCase();
	return NAMED_BY_LOWER.get(key.toLowerCase()) ?? key;
}

/**
 * Split a chord into its segments, key last.
 *
 * `+` is both the separator and a bindable key. A chord whose key is `+` is the
 * only one that ends in a separator, so `'+'` and `'Ctrl++'` are read specially —
 * while `'Ctrl+'`, which is a modifier and no key, stays the nonsense it is.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitChord(text) {
	if (text === '+' || text.endsWith('++')) {
		const modifiers = text.slice(0, -2);
		return [...(modifiers === '' ? [] : modifiers.split('+')), '+'];
	}
	return text.split('+');
}

/**
 * Read a chord string.
 *
 * @param {unknown} text - e.g. `Shift+f`; spelling and case of the modifiers are
 *   forgiving, so `SHIFT+F` and `Cmd+z` parse too.
 * @returns {Chord|null} `null` for anything that is not a chord.
 */
export function parseChord(text) {
	if (typeof text !== 'string') return null;
	const segments = splitChord(text.trim());
	// Every segment is trimmed: `Control + Z` out of a hand-edited store is the same
	// chord as `Ctrl+z`. The space bar is written `Space`, so nothing is lost.
	const key = normalizeKey(segments.pop()?.trim());
	if (!key) return null;

	const chord = /** @type {Chord} */ ({ Ctrl: false, Alt: false, Shift: false, Meta: false, key });
	for (const segment of segments) {
		const modifier = MODIFIER_ALIASES[segment.trim().toLowerCase()];
		if (!modifier) return null;
		chord[modifier] = true;
	}
	return chord;
}

/**
 * The canonical string of a chord: `Ctrl+Alt+Shift+Meta+key`, always in that order.
 *
 * @param {Chord|null} chord
 * @returns {string} `''` for nothing — never a half-formed chord.
 */
export function formatChord(chord) {
	if (!chord?.key) return '';
	return [...MODIFIERS.filter((modifier) => chord[modifier]), chord.key].join('+');
}

/**
 * The canonical spelling of a stored chord.
 *
 * @param {unknown} text
 * @returns {string|null} `null` when it is malformed, which is how the loader drops it.
 */
export function normalizeChord(text) {
	return formatChord(parseChord(text)) || null;
}

/**
 * The chord a keydown stands for.
 *
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }|null|undefined} event
 * @returns {string|null} `null` while only a modifier is down — that is not a chord
 *   yet, and the recorder keeps waiting.
 */
export function chordFor(event) {
	const key = normalizeKey(event?.key);
	if (!key) return null;
	return formatChord({
		Ctrl: Boolean(event?.ctrlKey),
		Alt: Boolean(event?.altKey),
		Shift: Boolean(event?.shiftKey),
		Meta: Boolean(event?.metaKey),
		key
	});
}

/**
 * How a chord reads in a `<kbd>`: `Shift+F`, `Ctrl+Z`, `⌫`, `→`.
 *
 * Storage is lower-case so that one chord has one spelling; a key hint is read, not
 * parsed, and `F` reads better than `f` on a key cap.
 *
 * @param {string} text
 * @returns {string} `''` for a malformed chord, so a `{#each}` over the labels of a
 *   broken binding renders nothing rather than junk.
 */
export function chordLabel(text) {
	const chord = parseChord(text);
	if (!chord) return '';
	const key =
		KEY_LABELS[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
	return [...MODIFIERS.filter((modifier) => chord[modifier]), key].join('+');
}

/**
 * The same chords as `aria-keyshortcuts` wants them: key *names* (`Control+Z`,
 * `Backspace`, `ArrowRight`), space-separated. Assistive technology reads this
 * attribute out; the arrows and `⌫` of {@link chordLabel} are key caps for eyes.
 *
 * @param {string[]} chords
 * @returns {string|undefined} `undefined` for an unbound action, so the attribute
 *   is left off rather than set to an empty promise.
 */
export function ariaKeyshortcuts(chords) {
	const value = chords
		.map((text) => {
			const chord = parseChord(text);
			if (!chord) return '';
			const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
			return [
				...MODIFIERS.filter((modifier) => chord[modifier]).map((m) => ARIA_MODIFIERS[m]),
				key
			].join('+');
		})
		.filter(Boolean)
		.join(' ');
	return value || undefined;
}

/* -------------------------------------------------------------------------- */
/* Actions and their default bindings                                          */
/* -------------------------------------------------------------------------- */

/**
 * The action id of a tier. One flat id per tier (`rateS`) rather than a nested map
 * keeps the stored bindings a plain `action → chords` table, which is all the
 * loader and the conflict check ever have to walk.
 *
 * @param {Rating} rating
 * @returns {ActionId}
 */
function rateAction(rating) {
	return /** @type {ActionId} */ (`rate${rating}`);
}

/**
 * The tier an action rates, or `null` when it is not a rating action.
 *
 * @param {ActionId} id
 * @returns {Rating|null}
 */
export function ratingOf(id) {
	const tier = TIERS.find((entry) => rateAction(entry.rating) === id);
	return tier ? tier.rating : null;
}

/**
 * Every action the user can bind, in the order the help list and the edit dialog
 * show them. `help` is deliberately absent: `?` is fixed.
 *
 * Adding one here means adding it to `ActionId` in `types.js` (which is what makes
 * the Rate page's handler fail to type-check until it answers the new intent) and
 * to {@link DEFAULT_KEYBINDINGS}.
 *
 * @type {{ id: ActionId, label: string }[]}
 */
export const BINDABLE_ACTIONS = [
	...TIERS.map((tier) => ({ id: rateAction(tier.rating), label: tier.label })),
	{ id: /** @type {ActionId} */ ('next'), label: 'Next video' },
	{ id: /** @type {ActionId} */ ('previous'), label: 'Previous video' },
	{ id: /** @type {ActionId} */ ('replay'), label: 'Replay from the start' },
	{ id: /** @type {ActionId} */ ('undo'), label: 'Undo the last rating' },
	{ id: /** @type {ActionId} */ ('loop'), label: 'Loop the current video' },
	{ id: /** @type {ActionId} */ ('fullscreen'), label: 'Fullscreen' }
];

/**
 * The bindings a fresh install starts from.
 *
 * The letters, with one swap against #11: `f` keeps YouTube's meaning
 * (fullscreen), so the F tier is the single letter that needs a modifier. Every
 * other YouTube key is either a key the Rate page proxies (`k`, `m`, `j`, `l`, the
 * arrows) or one the rating layer never claimed.
 *
 * `Cmd+Z` is deliberately not here: the ticket's table says `u`, `Backspace`,
 * `Ctrl+Z`, and anyone who wants the fourth can bind it in the editor.
 *
 * @type {Readonly<Keybindings>}
 */
export const DEFAULT_KEYBINDINGS = Object.freeze(
	/** @type {Keybindings} */ ({
		...Object.fromEntries(
			TIERS.map((tier) => {
				const letter = tier.rating.toLowerCase();
				return [rateAction(tier.rating), Object.freeze(letter === 'f' ? ['Shift+f'] : [letter])];
			})
		),
		next: Object.freeze(['n']),
		previous: Object.freeze(['p']),
		replay: Object.freeze(['r']),
		undo: Object.freeze(['u', 'Backspace', 'Ctrl+z']),
		loop: Object.freeze(['Shift+l']),
		fullscreen: Object.freeze(['f'])
	})
);

/* -------------------------------------------------------------------------- */
/* The stored table                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The chords of one action, defensively: a table straight out of a hand edit may be
 * missing the action entirely.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {ActionId} id
 * @returns {string[]}
 */
export function chordsOf(bindings, id) {
	const chords = bindings?.[id];
	return Array.isArray(chords) ? chords : [];
}

/**
 * Clean up whatever came out of storage.
 *
 * Unknown actions are dropped (they are simply never read), a missing action falls
 * back to its default, and a malformed chord is dropped. An action stored as an
 * empty list stays empty: unbinding everything is a choice, not a gap.
 *
 * The one-action-per-chord invariant is settled in two passes, because **what the
 * user stored outranks a default**. A table saying `rateS: ['f']` therefore keeps
 * `f` on the S tier and leaves fullscreen — whose only default that was — unbound,
 * rather than the other way round. The editor shows such a row with no keys at all,
 * which is the honest answer: the page really does not answer that action any more.
 *
 * @param {unknown} raw
 * @returns {Keybindings} A fresh, plain object — never shared with the input.
 */
export function normalizeKeybindings(raw) {
	const stored = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};

	const bindings = /** @type {Keybindings} */ ({});
	/** @type {Set<string>} */
	const taken = new Set();

	/**
	 * @param {ActionId} id
	 * @param {unknown[]} chords
	 * @returns {void}
	 */
	const claim = (id, chords) => {
		for (const entry of chords) {
			const chord = normalizeChord(entry);
			if (!chord || taken.has(chord)) continue;
			taken.add(chord);
			bindings[id].push(chord);
		}
	};

	for (const { id } of BINDABLE_ACTIONS) bindings[id] = [];

	// First pass: what the user actually stored. Second pass: the defaults of the
	// actions the store said nothing about — and only the chords still free.
	for (const { id } of BINDABLE_ACTIONS) {
		if (Array.isArray(stored[id])) claim(id, /** @type {unknown[]} */ (stored[id]));
	}
	for (const { id } of BINDABLE_ACTIONS) {
		if (!Array.isArray(stored[id])) claim(id, chordsOf(DEFAULT_KEYBINDINGS, id));
	}

	return bindings;
}

/**
 * chord → action, the direction a keydown asks in.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @returns {Map<string, ActionId>}
 */
export function bindingIndex(bindings) {
	/** @type {Map<string, ActionId>} */
	const index = new Map();
	for (const { id } of BINDABLE_ACTIONS) {
		for (const chord of chordsOf(bindings, id)) {
			if (!index.has(chord)) index.set(chord, id);
		}
	}
	return index;
}

/**
 * The same bindings with one chord added to one action.
 *
 * A chord another action already holds is refused rather than stolen: the swap has
 * to be made by removing it there first, which is what `chordConflict` tells the
 * user before they get here. Enforcing it here as well is what keeps the invariant
 * true for every caller, not only the dialog.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {ActionId} id
 * @param {string} chord
 * @returns {Keybindings} A fresh table; the input is left alone.
 */
export function withChord(bindings, id, chord) {
	const next = normalizeKeybindings(bindings);
	const normalized = normalizeChord(chord);
	if (!normalized || bindingIndex(next).has(normalized)) return next;
	next[id] = [...chordsOf(next, id), normalized];
	return next;
}

/**
 * The same bindings with one chord removed from one action.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {ActionId} id
 * @param {string} chord
 * @returns {Keybindings} A fresh table; the input is left alone.
 */
export function withoutChord(bindings, id, chord) {
	const next = normalizeKeybindings(bindings);
	next[id] = chordsOf(next, id).filter((entry) => entry !== chord);
	return next;
}
