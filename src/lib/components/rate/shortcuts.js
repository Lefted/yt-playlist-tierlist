/**
 * Keyboard shortcuts of the rating session.
 *
 * Pure mapping from a keyboard event to an intent, so the Rate page only has to
 * decide what each intent does — and so the mapping can be unit tested without a
 * DOM.
 *
 * Three layers meet here, in this order:
 *
 * - **`?`** — the help list, and the one key nobody can take: it is how the user
 *   finds out what is bound, so it must answer whatever the bindings say.
 * - **Rating keys** — the tiers, the queue, undo, loop, replay, fullscreen. These
 *   are ours, the user binds them (issue #12) and can switch the whole layer off
 *   (issue #11). **A user binding wins over the player keys below**: bind a tier to
 *   `k` and `k` rates, leaving play/pause on `Space` alone.
 * - **Player keys** — `k`/`Space`, `m`, the arrows and `j`/`l`. YouTube's own
 *   player answers these, but only while the iframe has the focus, and the Rate
 *   page deliberately keeps the focus on our side (issue #9). They are therefore
 *   proxied here whether the rating keys are on or off: a key that does something
 *   different depending on a focus you cannot see is a trap. They are not
 *   rebindable — they mirror YouTube — but a rating binding may shadow one.
 *
 * A **chord** is one key plus its modifiers, stored as a canonical string:
 * modifiers in `Ctrl+Alt+Shift+Meta` order, then the key. Single-character keys are
 * stored lower-case (`s`, `Shift+f`, `Ctrl+z`) so that one chord has exactly one
 * spelling; {@link chordLabel} is what turns that into the `Shift+F` a `<kbd>`
 * shows. Named keys keep their `KeyboardEvent.key` spelling (`Backspace`,
 * `ArrowLeft`), with the space bar written `Space`.
 *
 * Every key hint in the UI (the tier bar's `<kbd>`s, the button tooltips, the help
 * list, the settings copy) is generated from the same bindings, so the page can
 * never promise a key it does not answer.
 */

import { TIERS } from '$lib/tiers.js';

/** @typedef {import('$lib/types.js').Rating} Rating */
/** @typedef {import('$lib/types.js').Keybindings} Keybindings */

/**
 * What the user asked for.
 * @typedef {{ type: 'rate', rating: Rating }
 *   | { type: 'seekBy', seconds: number }
 *   | { type: 'next' | 'previous' | 'replay' | 'playPause' | 'muteToggle'
 *       | 'fullscreen' | 'undo' | 'loop' | 'help' }} ShortcutAction
 */

/**
 * One key plus its modifiers, as {@link parseChord} reads a chord string.
 * @typedef {{ Ctrl: boolean, Alt: boolean, Shift: boolean, Meta: boolean, key: string }} Chord
 */

/** How far `←`/`→` and `j`/`l` jump, as YouTube does it. */
const SMALL_SEEK_SECONDS = 5;
const LARGE_SEEK_SECONDS = 10;

/**
 * Elements that swallow the shortcuts because the user is typing into them.
 * `<select>` is included: it answers the letter keys itself.
 */
const TYPING_TAGS = ['input', 'textarea', 'select'];

/** Elements that `Space` presses; the page must leave that key to them. */
const ACTIVATION_TAGS = ['button', 'a', 'summary'];

/**
 * Anything layered over the page takes the keyboard.
 *
 * bits-ui popover content carries no ARIA role (it is not a dialog), hence the
 * `data-slot` shadcn-svelte puts on it. An overlay that is animating out keeps its
 * node until the animation ends, but is already closed as far as the keyboard is
 * concerned — `data-state="closed"` is how it says so.
 */
const OVERLAY_SELECTOR = [
	'[role="dialog"]',
	'[role="alertdialog"]',
	'[role="menu"]',
	'[role="listbox"]',
	'[data-slot="popover-content"]'
]
	.map((selector) => `${selector}:not([data-state="closed"])`)
	.join(', ');

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
const MODIFIER_ALIASES = /** @type {Record<string, typeof MODIFIERS[number]>} */ ({
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

/* -------------------------------------------------------------------------- */
/* Actions and their default bindings                                          */
/* -------------------------------------------------------------------------- */

/**
 * The action id of a tier. One flat id per tier (`rateS`) rather than a nested
 * map keeps the stored bindings a plain `action → chords` table, which is all the
 * loader and the conflict check ever have to walk.
 *
 * @param {Rating} rating
 * @returns {string}
 */
function rateAction(rating) {
	return `rate${rating}`;
}

/**
 * The tier an action rates, or `null` when it is not a rating action.
 *
 * @param {string} id
 * @returns {Rating|null}
 */
function ratingOf(id) {
	const tier = TIERS.find((entry) => rateAction(entry.rating) === id);
	return tier ? tier.rating : null;
}

/**
 * Every action the user can bind, in the order the help list and the edit dialog
 * show them. `help` is deliberately absent: `?` is fixed.
 *
 * @type {{ id: string, label: string }[]}
 */
export const BINDABLE_ACTIONS = [
	...TIERS.map((tier) => ({ id: rateAction(tier.rating), label: tier.label })),
	{ id: 'next', label: 'Next video' },
	{ id: 'previous', label: 'Previous video' },
	{ id: 'replay', label: 'Replay from the start' },
	{ id: 'undo', label: 'Undo the last rating' },
	{ id: 'loop', label: 'Loop the current video' },
	{ id: 'fullscreen', label: 'Fullscreen' }
];

/**
 * The bindings a fresh install starts from.
 *
 * The letters, with one swap against #11: `f` keeps YouTube's meaning
 * (fullscreen), so the F tier is the single letter that needs a modifier. Every
 * other YouTube key is either a key we proxy (`k`, `m`, `j`, `l`, the arrows) or
 * one the rating layer never claimed.
 *
 * @type {Readonly<Keybindings>}
 */
export const DEFAULT_KEYBINDINGS = Object.freeze({
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
});

/**
 * The proxied player keys, grouped the way the help list shows them.
 *
 * One table for three jobs: what a key does, what the help list promises, and how
 * a conflict note names the thing a user binding would shadow.
 *
 * @type {{ id: string, description: string, shadows: string, keys: [string, ShortcutAction][] }[]}
 */
const PLAYER_ROWS = [
	{
		id: 'playPause',
		description: 'Play / pause',
		shadows: 'play / pause',
		keys: [
			['k', { type: 'playPause' }],
			['Space', { type: 'playPause' }]
		]
	},
	{
		id: 'mute',
		description: 'Mute / unmute',
		shadows: 'mute',
		keys: [['m', { type: 'muteToggle' }]]
	},
	{
		id: 'seekBack',
		description: `Back ${SMALL_SEEK_SECONDS} s / ${LARGE_SEEK_SECONDS} s`,
		shadows: 'seek back',
		keys: [
			['ArrowLeft', { type: 'seekBy', seconds: -SMALL_SEEK_SECONDS }],
			['j', { type: 'seekBy', seconds: -LARGE_SEEK_SECONDS }]
		]
	},
	{
		id: 'seekForward',
		description: `Forward ${SMALL_SEEK_SECONDS} s / ${LARGE_SEEK_SECONDS} s`,
		shadows: 'seek forward',
		keys: [
			['ArrowRight', { type: 'seekBy', seconds: SMALL_SEEK_SECONDS }],
			['l', { type: 'seekBy', seconds: LARGE_SEEK_SECONDS }]
		]
	}
];

/** @type {Map<string, { action: ShortcutAction, shadows: string }>} chord → player key */
const PLAYER_KEYS = new Map(
	PLAYER_ROWS.flatMap((row) =>
		row.keys.map(
			(/** @type {[string, ShortcutAction]} */ [chord, action]) =>
				/** @type {[string, { action: ShortcutAction, shadows: string }]} */ ([
					chord,
					{ action, shadows: row.shadows }
				])
		)
	)
);

/* -------------------------------------------------------------------------- */
/* The stored bindings                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Clean up whatever came out of storage.
 *
 * Unknown actions are dropped (they are simply never read), a missing action falls
 * back to its default, a malformed chord is dropped, and a chord claimed twice
 * stays with the first action that claims it — a chord belongs to one action, and
 * hand-edited storage must not be able to make a keystroke ambiguous.
 *
 * An action bound to an empty list is kept empty: unbinding everything is a choice,
 * not a gap.
 *
 * @param {unknown} raw
 * @returns {Keybindings} A fresh, plain object — never shared with the input.
 */
export function normalizeKeybindings(raw) {
	const stored = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};

	/** @type {Keybindings} */
	const bindings = {};
	/** @type {Set<string>} */
	const taken = new Set();

	for (const { id } of BINDABLE_ACTIONS) {
		const value = stored[id];
		const chords = Array.isArray(value) ? value : DEFAULT_KEYBINDINGS[id];
		bindings[id] = [];
		for (const entry of chords ?? []) {
			const chord = normalizeChord(entry);
			if (!chord || taken.has(chord)) continue;
			taken.add(chord);
			bindings[id].push(chord);
		}
	}
	return bindings;
}

/**
 * The chords of one action, defensively: a binding table straight out of a hand
 * edit may be missing the action entirely.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {string} id
 * @returns {string[]}
 */
function chordsOf(bindings, id) {
	const chords = bindings?.[id];
	return Array.isArray(chords) ? chords : [];
}

/**
 * chord → action, the direction a keydown asks in.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @returns {Map<string, string>}
 */
export function bindingIndex(bindings) {
	/** @type {Map<string, string>} */
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
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {string} id
 * @param {string} chord
 * @returns {Keybindings} A fresh table; the input is left alone.
 */
export function withChord(bindings, id, chord) {
	const next = normalizeKeybindings(bindings);
	const normalized = normalizeChord(chord);
	if (normalized && !next[id]?.includes(normalized)) next[id] = [...(next[id] ?? []), normalized];
	return next;
}

/**
 * The same bindings with one chord removed from one action.
 *
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {string} id
 * @param {string} chord
 * @returns {Keybindings} A fresh table; the input is left alone.
 */
export function withoutChord(bindings, id, chord) {
	const next = normalizeKeybindings(bindings);
	next[id] = (next[id] ?? []).filter((entry) => entry !== chord);
	return next;
}

/**
 * What stands in the way of binding `chord` to `id`.
 *
 * Two different answers, because two different things are wrong:
 *
 * - **blocked** — the chord already belongs to another rating action (or to this
 *   one). A chord means one thing; the swap has to be made by removing first, and
 *   the message says where from.
 * - **a note** — the chord shadows something outside the rating layer: a proxied
 *   player key (allowed, that is the point of the priority rule) or `?` (allowed,
 *   but pointless, because the help list answers first).
 *
 * @param {string} chord
 * @param {Keybindings|Readonly<Keybindings>} bindings
 * @param {string} id
 * @returns {{ blocked: boolean, message: string }|null} `null` when the chord is free.
 */
export function chordConflict(chord, bindings, id) {
	const label = chordLabel(chord);
	const owner = bindingIndex(bindings).get(chord);

	if (owner === id) return { blocked: true, message: `${label} is already bound here.` };
	if (owner) {
		const action = BINDABLE_ACTIONS.find((entry) => entry.id === owner);
		return {
			blocked: true,
			message: `${label} is already ${action?.label ?? owner} — remove it there first.`
		};
	}

	if (parseChord(chord)?.key === '?') {
		return {
			blocked: false,
			message: `${label} always opens the shortcut list, so this never fires.`
		};
	}

	const player = PLAYER_KEYS.get(chord);
	if (player) return { blocked: false, message: `Overrides YouTube's ${player.shadows}.` };

	return null;
}

/* -------------------------------------------------------------------------- */
/* Hints                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} ShortcutOptions
 * @property {Keybindings|Readonly<Keybindings>} [bindings] - `settings.keybindings`.
 * @property {boolean} [ratingKeys] - `settings.shortcuts`; `false` silences the
 *   whole rating layer, hints included.
 */

/**
 * What each action is labelled with, for the help list, the tier bar and the button
 * tooltips — generated from the live bindings, so a rebinding cannot leave a stale
 * hint behind.
 *
 * These are display labels ('→', 'Shift+F'), not `KeyboardEvent.key` values;
 * {@link shortcutFor} owns the matching. An empty list means "this action has no
 * key right now", so a `{#each}` over it renders nothing.
 *
 * @param {ShortcutOptions} [options]
 * @returns {Record<string, string[]>}
 */
export function shortcutKeys(options = {}) {
	const { bindings = DEFAULT_KEYBINDINGS, ratingKeys = true } = options;

	/** @type {Record<string, string[]>} */
	const keys = {};
	for (const { id } of BINDABLE_ACTIONS) {
		keys[id] = ratingKeys ? chordsOf(bindings, id).map(chordLabel) : [];
	}

	// `?` survives the switch: it is how the user finds out what is left.
	keys.help = ['?'];

	// The player layer, which stays either way.
	for (const row of PLAYER_ROWS) keys[row.id] = row.keys.map(([chord]) => chordLabel(chord));

	return keys;
}

/**
 * The key that assigns each tier, rating → labels.
 *
 * @param {ShortcutOptions} [options]
 * @returns {Record<Rating, string[]>|null} `null` while the rating keys are off:
 *   there is no key to show and none to press.
 */
export function tierKeys(options = {}) {
	if (options.ratingKeys === false) return null;
	const keys = shortcutKeys(options);
	return /** @type {Record<Rating, string[]>} */ (
		Object.fromEntries(TIERS.map((tier) => [tier.rating, keys[rateAction(tier.rating)]]))
	);
}

/**
 * The shortcut list for the help popover, in the order it is shown and split the
 * way the user meets it: what the session does, and what the player does.
 *
 * Every tier gets its own row. With the keys rebindable, one merged "rate the
 * video" row could no longer say which key is which tier.
 *
 * @param {ShortcutOptions} [options]
 * @returns {{ rating: { keys: string[], description: string }[],
 *   player: { keys: string[], description: string }[] }} With the rating keys off
 *   that first list is empty, and the popover says so instead.
 */
export function shortcutTable(options = {}) {
	const ratingKeys = options.ratingKeys !== false;
	const keys = shortcutKeys(options);

	/**
	 * @param {[string[], string][]} rows
	 * @returns {{ keys: string[], description: string }[]}
	 */
	const table = (rows) =>
		rows
			.filter(([entry]) => entry.length > 0)
			.map(([entry, description]) => ({ keys: entry, description }));

	return {
		rating: table([
			...BINDABLE_ACTIONS.map(
				(action) => /** @type {[string[], string]} */ ([keys[action.id], action.label])
			),
			// `?` works either way, but with the rating keys off this list is all
			// that is left of the group, and a group of one reads like a mistake.
			[ratingKeys ? keys.help : [], 'Show this list']
		]),
		player: table(
			PLAYER_ROWS.map((row) => /** @type {[string[], string]} */ ([keys[row.id], row.description]))
		)
	};
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Is the user typing into this element?
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
	const element = /** @type {any} */ (target);
	if (!element || typeof element !== 'object') return false;
	if (element.isContentEditable) return true;

	const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
	return TYPING_TAGS.includes(tag);
}

/**
 * Is this element pressed with `Space`?
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isActivationTarget(target) {
	const element = /** @type {any} */ (target);
	if (!element || typeof element !== 'object') return false;
	if (element.getAttribute?.('role') === 'button') return true;

	const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
	return ACTIVATION_TAGS.includes(tag);
}

/**
 * Should this keydown reach the page at all?
 *
 * About the surroundings only — a text field has the focus, a button is waiting to
 * be pressed with `Space`, or something is layered over the page (the Edit
 * shortcuts dialog included, which is what keeps the page quiet while a row is
 * recording). Which keys exist is {@link shortcutFor}'s business, the user's
 * "shortcuts off" included: that silences the rating keys but keeps the player ones.
 *
 * @param {{ key?: string, target?: EventTarget|null }} event
 * @param {{ querySelector?: (selector: string) => unknown }|null} [doc] - Usually `document`.
 * @returns {boolean}
 */
export function shortcutsEnabled(event, doc) {
	if (isTypingTarget(event?.target ?? null)) return false;

	// A focused button is pressed with `Space`, and that is the only way a keyboard
	// user has of clicking it — play/pause must not swallow it.
	const space = event?.key === ' ' || event?.key === 'Spacebar';
	if (space && isActivationTarget(event?.target ?? null)) return false;

	return !doc?.querySelector?.(OVERLAY_SELECTOR);
}

/**
 * Translate a keydown into the action it stands for.
 *
 * `?` first, then the user's bindings, then the proxied player keys — see the
 * module comment for why that order. A chord carrying `Ctrl`, `Alt` or `Meta`, and
 * a `Shift` chord too, only ever matches a binding: unbound, those belong to the
 * browser and the OS (`Ctrl+Shift+Z` stays redo unless someone claims it).
 *
 * A held key repeats, and nothing here wants that: a rating means exactly once, and
 * a repeated seek would fire a request per repeat. Repeats are dropped.
 *
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, repeat?: boolean }} event
 * @param {ShortcutOptions} [options]
 * @returns {ShortcutAction|null} `null` when the key means nothing here.
 */
export function shortcutFor(event, options = {}) {
	if (!event || event.repeat) return null;
	const { bindings = DEFAULT_KEYBINDINGS, ratingKeys = true } = options;

	// The help list is the one key no binding can take: it is how the user finds out
	// what everything else is bound to.
	if (event.key === '?') return { type: 'help' };

	const chord = chordFor(event);
	if (!chord) return null;

	if (ratingKeys) {
		const id = bindingIndex(bindings).get(chord);
		if (id) {
			const rating = ratingOf(id);
			return rating
				? { type: 'rate', rating }
				: /** @type {ShortcutAction} */ ({ type: /** @type {any} */ (id) });
		}
	}

	if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;

	const player = PLAYER_KEYS.get(chord);
	// A copy: the caller gets a value, not a handle on the table.
	return player ? { ...player.action } : null;
}
