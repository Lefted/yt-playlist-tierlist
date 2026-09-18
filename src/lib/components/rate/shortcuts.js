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
 *   | { type: 'next' | 'previous' | 'replay' | 'playPause' | 'fullscreen' | 'help' }} ShortcutAction
 */

/**
 * Elements that swallow the shortcuts because the user is typing into them.
 * `<select>` is included: it answers the letter keys itself.
 */
const TYPING_TAGS = ['input', 'textarea', 'select'];

/**
 * Anything layered over the page takes the keyboard. bits-ui only renders these
 * while they are open, so their mere presence is the "is something open?" answer.
 *
 * Its popover content carries no ARIA role (it is not a dialog), hence the
 * `data-slot` shadcn-svelte puts on it.
 */
const OVERLAY_SELECTOR = [
	'[role="dialog"]',
	'[role="alertdialog"]',
	'[role="menu"]',
	'[role="listbox"]',
	'[data-slot="popover-content"]'
].join(', ');

/**
 * The shortcut list for the help popover, in the order it is shown.
 * @type {{ keys: string[], description: string }[]}
 */
export const SHORTCUT_HELP = [
	{ keys: TIERS.map((tier) => tier.key.toUpperCase()), description: 'Rate the current video' },
	{ keys: ['N', '→'], description: 'Next video' },
	{ keys: ['P', '←'], description: 'Previous video' },
	{ keys: ['R', '0'], description: 'Replay from the start' },
	{ keys: ['Space'], description: 'Play / pause' },
	{ keys: ['Shift', 'F'], description: 'Fullscreen' },
	{ keys: ['?'], description: 'Show this list' }
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
 * meaning the F tier while `Shift+F` goes fullscreen. Any other modifier belongs
 * to the browser or the OS and is left alone.
 *
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @returns {ShortcutAction|null} `null` when the key means nothing here.
 */
export function shortcutFor(event) {
	if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;

	const key = typeof event.key === 'string' ? event.key : '';
	const lower = key.toLowerCase();

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
		case '?':
			return { type: 'help' };
	}

	switch (lower) {
		case 'n':
			return { type: 'next' };
		case 'p':
			return { type: 'previous' };
		case 'r':
		case '0':
			return { type: 'replay' };
		default:
			return null;
	}
}
