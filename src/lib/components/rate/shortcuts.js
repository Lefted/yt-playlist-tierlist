/**
 * Keyboard shortcuts of the rating session.
 *
 * Pure mapping from a keyboard event to an intent, so the Rate page only has to
 * decide what each intent does — and so the mapping can be unit tested without a
 * DOM.
 *
 * Everything is a function of the {@link ShortcutMode} the user picked, and every
 * key hint in the UI (the tier bar's `<kbd>`s, the button tooltips, the help list)
 * is generated from the very same tables: a mode can therefore never be shown a
 * binding it does not have.
 */

import { RATING_BY_KEY, TIERS } from '$lib/tiers.js';
import { DEFAULT_SHORTCUT_MODE, RATING_ORDER } from '$lib/types.js';

/** @typedef {import('$lib/types.js').Rating} Rating */
/** @typedef {import('$lib/types.js').ShortcutMode} ShortcutMode */

/**
 * What the user asked for.
 * @typedef {{ type: 'rate', rating: Rating }
 *   | { type: 'next' | 'previous' | 'replay' | 'playPause' | 'fullscreen' | 'undo' | 'loop' | 'help' }} ShortcutAction
 */

/**
 * Elements that swallow the shortcuts because the user is typing into them.
 * `<select>` is included: it answers the letter keys itself.
 */
const TYPING_TAGS = ['input', 'textarea', 'select'];

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

/**
 * The tier keys per mode, in `RATING_ORDER`.
 *
 * `digits` exists because `f` is fullscreen everywhere on YouTube and gave people
 * an F rating here (issue #11); `1`–`6` collide with none of `f`, `k`, `j`, `l`.
 *
 * @type {Record<string, Record<Rating, string>>}
 */
const TIER_KEYS = {
	letters: Object.fromEntries(TIERS.map((tier) => [tier.rating, tier.key])),
	digits: Object.fromEntries(RATING_ORDER.map((rating, index) => [rating, String(index + 1)]))
};

/** @type {Record<string, Record<string, Rating>>} The same tables, key → rating. */
const RATINGS_BY_KEY = {
	letters: RATING_BY_KEY,
	digits: Object.fromEntries(Object.entries(TIER_KEYS.digits).map(([rating, key]) => [key, rating]))
};

/**
 * The tier keys of a mode: rating → the key that assigns it.
 *
 * @param {ShortcutMode} mode
 * @returns {Record<Rating, string>|null} `null` while shortcuts are off — there is
 *   no key to show and none to press.
 */
export function tierKeysFor(mode) {
	return TIER_KEYS[mode] ?? null;
}

/**
 * Which tier a key stands for in this mode.
 *
 * @param {ShortcutMode} mode
 * @param {string} key - Lower-cased `KeyboardEvent.key`.
 * @returns {Rating|null}
 */
export function ratingForKey(mode, key) {
	return RATINGS_BY_KEY[mode]?.[key] ?? null;
}

/**
 * What each action is labelled with, for the help list and the button tooltips —
 * one table, so a rebinding cannot leave a stale hint behind.
 *
 * These are display labels ('→', '⇧'), not `KeyboardEvent.key` values;
 * {@link shortcutFor} below owns the matching.
 *
 * @param {ShortcutMode} [mode]
 * @returns {Record<string, string[]>} Every list is empty while shortcuts are off,
 *   so a `{#each}` over it renders nothing.
 */
export function shortcutKeys(mode = DEFAULT_SHORTCUT_MODE) {
	const tiers = tierKeysFor(mode);
	// Off keeps the shape and empties it, so a `{#each}` over any entry renders
	// nothing and no caller has to know which mode it is looking at.
	if (!tiers) {
		return Object.fromEntries(
			Object.keys(shortcutKeys(DEFAULT_SHORTCUT_MODE)).map((action) => [action, []])
		);
	}

	return {
		rate: RATING_ORDER.map((rating) => tiers[rating].toUpperCase()),
		next: ['N', '→'],
		previous: ['P', '←'],
		// `0` is a tier key's neighbour in digits mode and would read like a seventh
		// tier, so only `R` survives there.
		replay: mode === 'digits' ? ['R'] : ['R', '0'],
		playPause: ['Space'],
		fullscreen: ['⇧', 'F'],
		undo: ['U', '⌫', 'Ctrl+Z'],
		loop: ['L'],
		help: ['?']
	};
}

/**
 * The shortcut list for the help popover, in the order it is shown.
 *
 * @param {ShortcutMode} [mode]
 * @returns {{ keys: string[], description: string }[]} Empty while shortcuts are
 *   off; the popover says so instead of listing keys nobody can press.
 */
export function shortcutTable(mode = DEFAULT_SHORTCUT_MODE) {
	if (mode === 'off') return [];

	const keys = shortcutKeys(mode);
	return [
		{ keys: keys.rate, description: 'Rate the current video' },
		{ keys: keys.next, description: 'Next video' },
		{ keys: keys.previous, description: 'Previous video' },
		{ keys: keys.replay, description: 'Replay from the start' },
		{ keys: keys.playPause, description: 'Play / pause' },
		{ keys: keys.undo, description: 'Undo the last rating' },
		{ keys: keys.loop, description: 'Loop the current video' },
		{ keys: keys.fullscreen, description: 'Fullscreen' },
		{ keys: keys.help, description: 'Show this list' }
	];
}

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
 * Should this keydown reach the session at all?
 *
 * @param {{ target?: EventTarget|null }} event
 * @param {{ querySelector?: (selector: string) => unknown }|null} [doc] - Usually `document`.
 * @param {ShortcutMode} [mode] - `'off'` answers `false` to everything.
 * @returns {boolean}
 */
export function shortcutsEnabled(event, doc, mode = DEFAULT_SHORTCUT_MODE) {
	if (mode === 'off') return false;
	if (isTypingTarget(event?.target ?? null)) return false;
	return !doc?.querySelector?.(OVERLAY_SELECTOR);
}

/**
 * Translate a keydown into the action it stands for.
 *
 * `Shift` is only ever a modifier for fullscreen and the help list, so in letters
 * mode `F` keeps meaning the F tier while `Shift+F` goes fullscreen.
 * `Ctrl`/`Cmd`+`Z` is the one combination we claim, because that is where every
 * user's hand goes to undo; any other modifier belongs to the browser or the OS
 * and is left alone.
 *
 * A held key repeats, and a repeat has never been meant as a second verdict — one
 * `f` too long must not rate two videos — so repeats are dropped here rather than
 * at each call site.
 *
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, repeat?: boolean }} event
 * @param {ShortcutMode} [mode]
 * @returns {ShortcutAction|null} `null` when the key means nothing in this mode.
 */
export function shortcutFor(event, mode = DEFAULT_SHORTCUT_MODE) {
	if (!event || event.repeat || mode === 'off') return null;

	const key = typeof event.key === 'string' ? event.key : '';
	const lower = key.toLowerCase();

	// `Shift+Ctrl+Z` is redo, which we do not have — leave it to the browser.
	if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && lower === 'z') {
		return { type: 'undo' };
	}
	if (event.ctrlKey || event.metaKey || event.altKey) return null;

	if (event.shiftKey) {
		if (lower === 'f') return { type: 'fullscreen' };
		if (key === '?') return { type: 'help' };
		return null;
	}

	const rating = ratingForKey(mode, lower);
	if (rating) return { type: 'rate', rating };

	switch (key) {
		case 'ArrowRight':
			return { type: 'next' };
		case 'ArrowLeft':
			return { type: 'previous' };
		case ' ':
		case 'Spacebar': // older WebKit
			return { type: 'playPause' };
		case 'Backspace':
			return { type: 'undo' };
		case '?':
			return { type: 'help' };
		case '0':
			return mode === 'digits' ? null : { type: 'replay' };
	}

	switch (lower) {
		case 'n':
			return { type: 'next' };
		case 'p':
			return { type: 'previous' };
		case 'u':
			return { type: 'undo' };
		case 'l':
			return { type: 'loop' };
		case 'r':
			return { type: 'replay' };
		default:
			return null;
	}
}
