/**
 * Keyboard shortcuts of the rating session.
 *
 * Pure mapping from a keyboard event to an intent, so the Rate page only has to
 * decide what each intent does — and so the mapping can be unit tested without a
 * DOM.
 */

import { RATING_BY_KEY, TIERS } from '$lib/tiers.js';

/** @typedef {import('$lib/types.js').Rating} Rating */

/**
 * What the user asked for.
 * @typedef {{ type: 'rate', rating: Rating }
 *   | { type: 'next' | 'previous' | 'replay' | 'playPause' | 'fullscreen' | 'undo' | 'help' }} ShortcutAction
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
 * What each action is labelled with, for the help list and the button tooltips —
 * one table, so a rebinding cannot leave a stale hint behind.
 *
 * These are display labels ('→', '⇧'), not `KeyboardEvent.key` values;
 * {@link shortcutFor} below owns the matching.
 *
 * @type {Record<string, string[]>}
 */
export const SHORTCUT_KEYS = {
	rate: TIERS.map((tier) => tier.key.toUpperCase()),
	next: ['N', '→'],
	previous: ['P', '←'],
	replay: ['R', '0'],
	playPause: ['Space'],
	fullscreen: ['⇧', 'F'],
	undo: ['U', '⌫', 'Ctrl+Z'],
	help: ['?']
};

/**
 * The shortcut list for the help popover, in the order it is shown.
 * @type {{ keys: string[], description: string }[]}
 */
export const SHORTCUT_HELP = [
	{ keys: SHORTCUT_KEYS.rate, description: 'Rate the current video' },
	{ keys: SHORTCUT_KEYS.next, description: 'Next video' },
	{ keys: SHORTCUT_KEYS.previous, description: 'Previous video' },
	{ keys: SHORTCUT_KEYS.replay, description: 'Replay from the start' },
	{ keys: SHORTCUT_KEYS.playPause, description: 'Play / pause' },
	{ keys: SHORTCUT_KEYS.undo, description: 'Undo the last rating' },
	{ keys: SHORTCUT_KEYS.fullscreen, description: 'Fullscreen' },
	{ keys: SHORTCUT_KEYS.help, description: 'Show this list' }
];

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
 * @returns {boolean}
 */
export function shortcutsEnabled(event, doc) {
	if (isTypingTarget(event?.target ?? null)) return false;
	return !doc?.querySelector?.(OVERLAY_SELECTOR);
}

/**
 * Translate a keydown into the action it stands for.
 *
 * `Shift` is only ever a modifier for fullscreen and the help list, so `F` keeps
 * meaning the F tier while `Shift+F` goes fullscreen. `Ctrl`/`Cmd`+`Z` is the one
 * combination we claim, because that is where every user's hand goes to undo; any
 * other modifier belongs to the browser or the OS and is left alone.
 *
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @returns {ShortcutAction|null} `null` when the key means nothing here.
 */
export function shortcutFor(event) {
	if (!event) return null;

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

	const rating = RATING_BY_KEY[lower];
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
	}

	switch (lower) {
		case 'n':
			return { type: 'next' };
		case 'p':
			return { type: 'previous' };
		case 'u':
			return { type: 'undo' };
		case 'r':
		case '0':
			return { type: 'replay' };
		default:
			return null;
	}
}
