/**
 * Keyboard shortcuts of the rating session.
 *
 * Pure mapping from a keyboard event to an intent, so the Rate page only has to
 * decide what each intent does — and so the mapping can be unit tested without a
 * DOM.
 *
 * Two layers live here:
 *
 * - **Player keys** — `k`/`Space`, `m`, the arrows and `j`/`l`. YouTube's own
 *   player answers these, but only while the iframe has the focus, and the Rate
 *   page deliberately keeps the focus on our side (issue #9). They are therefore
 *   proxied here whether the rating keys are on or off: a key that does something
 *   different depending on a focus you cannot see is a trap.
 * - **Rating keys** — the tiers, the queue, undo, loop, replay, fullscreen, help.
 *   These are ours, and the user can switch them off entirely (issue #11).
 *
 * Every key hint in the UI (the tier bar's `<kbd>`s, the button tooltips, the help
 * list) is generated from the same tables, so the page can never promise a key it
 * does not answer.
 */

import { RATING_BY_KEY, TIERS } from '$lib/tiers.js';

/** @typedef {import('$lib/types.js').Rating} Rating */

/**
 * What the user asked for.
 * @typedef {{ type: 'rate', rating: Rating }
 *   | { type: 'seekBy', seconds: number }
 *   | { type: 'next' | 'previous' | 'replay' | 'playPause' | 'muteToggle'
 *       | 'fullscreen' | 'undo' | 'loop' | 'help' }} ShortcutAction
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

/**
 * The key that assigns each tier, rating → key, straight from `tiers.js`.
 *
 * @param {boolean} [ratingKeys] - `false` while the rating keys are off: there is
 *   no key to show and none to press.
 * @returns {Record<Rating, string>|null}
 */
export function tierKeys(ratingKeys = true) {
	if (!ratingKeys) return null;
	return Object.fromEntries(TIERS.map((tier) => [tier.rating, tier.key]));
}

/**
 * What each action is labelled with, for the help list and the button tooltips —
 * one table, so a rebinding cannot leave a stale hint behind.
 *
 * These are display labels ('→', '⇧'), not `KeyboardEvent.key` values;
 * {@link shortcutFor} below owns the matching. An empty list means "this key does
 * not exist right now", so a `{#each}` over it renders nothing.
 *
 * @param {boolean} [ratingKeys]
 * @returns {Record<string, string[]>}
 */
export function shortcutKeys(ratingKeys = true) {
	const tiers = tierKeys(ratingKeys);

	return {
		// The rating layer, which the user can switch off.
		rate: tiers ? TIERS.map((tier) => tiers[tier.rating].toUpperCase()) : [],
		next: ratingKeys ? ['N'] : [],
		previous: ratingKeys ? ['P'] : [],
		replay: ratingKeys ? ['R'] : [],
		undo: ratingKeys ? ['U', '⌫', 'Ctrl+Z'] : [],
		loop: ratingKeys ? ['⇧', 'L'] : [],
		fullscreen: ratingKeys ? ['⇧', 'F'] : [],
		help: ['?'],

		// The player layer, which stays either way.
		playPause: ['K', 'Space'],
		mute: ['M'],
		seekBack: ['←', 'J'],
		seekForward: ['→', 'L']
	};
}

/**
 * The shortcut list for the help popover, in the order it is shown and split the
 * way the user meets it: what the session does, and what the player does.
 *
 * @param {boolean} [ratingKeys]
 * @returns {{ rating: { keys: string[], description: string }[],
 *   player: { keys: string[], description: string }[] }} With the rating keys off
 *   that list is empty, and the popover says so instead.
 */
export function shortcutTable(ratingKeys = true) {
	const keys = shortcutKeys(ratingKeys);

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
			[keys.rate, 'Rate the current video'],
			[keys.next, 'Next video'],
			[keys.previous, 'Previous video'],
			[keys.replay, 'Replay from the start'],
			[keys.undo, 'Undo the last rating'],
			[keys.loop, 'Loop the current video'],
			[keys.fullscreen, 'Fullscreen'],
			// `?` works either way, but with the rating keys off this list is all
			// that is left of the group, and a group of one reads like a mistake.
			[ratingKeys ? keys.help : [], 'Show this list']
		]),
		player: table([
			[keys.playPause, 'Play / pause'],
			[keys.mute, 'Mute / unmute'],
			[keys.seekBack, `Back ${SMALL_SEEK_SECONDS} s / ${LARGE_SEEK_SECONDS} s`],
			[keys.seekForward, `Forward ${SMALL_SEEK_SECONDS} s / ${LARGE_SEEK_SECONDS} s`]
		])
	};
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
 * be pressed with `Space`, or something is layered over the page. Which keys exist
 * is {@link shortcutFor}'s business, the user's "shortcuts off" included: that
 * silences the rating keys but keeps the player ones.
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
 * `Shift` marks the two keys a tier would otherwise swallow: `Shift+F` for
 * fullscreen (plain `f` is the F tier) and `Shift+L` for loop (plain `l` is the
 * player's "forward 10 s"). `Ctrl`/`Cmd`+`Z` is the one combination we claim,
 * because that is where every user's hand goes to undo; any other modifier belongs
 * to the browser or the OS and is left alone.
 *
 * A held key repeats, and nothing here wants that: a rating means exactly once,
 * and a repeated seek would fire a request per repeat. Repeats are dropped.
 *
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, repeat?: boolean }} event
 * @param {boolean} [ratingKeys] - `settings.shortcuts`.
 * @returns {ShortcutAction|null} `null` when the key means nothing here.
 */
export function shortcutFor(event, ratingKeys = true) {
	if (!event) return null;

	if (event.repeat) return null;
	return actionFor(event, ratingKeys);
}

/**
 * @param {{ key?: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @param {boolean} ratingKeys
 * @returns {ShortcutAction|null}
 */
function actionFor(event, ratingKeys) {
	const key = typeof event.key === 'string' ? event.key : '';
	const lower = key.toLowerCase();

	// `Shift+Ctrl+Z` is redo, which we do not have — leave it to the browser.
	if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && lower === 'z') {
		return ratingKeys ? { type: 'undo' } : null;
	}
	if (event.ctrlKey || event.metaKey || event.altKey) return null;

	// The help list is the one rating-layer key that survives the switch: it is how
	// the user finds out what is still bound.
	if (key === '?') return { type: 'help' };

	if (event.shiftKey) {
		if (!ratingKeys) return null;
		if (lower === 'f') return { type: 'fullscreen' };
		if (lower === 'l') return { type: 'loop' };
		return null;
	}

	// The tiers first: `f` rates F here, which is exactly why fullscreen moved to
	// `Shift+F`.
	if (ratingKeys) {
		const rating = RATING_BY_KEY[lower];
		if (rating) return { type: 'rate', rating };
	}

	// The player layer, which stays either way — see the module comment.
	switch (key) {
		case ' ':
		case 'Spacebar': // older WebKit
			return { type: 'playPause' };
		case 'ArrowRight':
			return { type: 'seekBy', seconds: SMALL_SEEK_SECONDS };
		case 'ArrowLeft':
			return { type: 'seekBy', seconds: -SMALL_SEEK_SECONDS };
	}
	switch (lower) {
		case 'k':
			return { type: 'playPause' };
		case 'm':
			return { type: 'muteToggle' };
		case 'l':
			return { type: 'seekBy', seconds: LARGE_SEEK_SECONDS };
		case 'j':
			return { type: 'seekBy', seconds: -LARGE_SEEK_SECONDS };
	}

	if (!ratingKeys) return null;

	if (key === 'Backspace') return { type: 'undo' };

	switch (lower) {
		case 'n':
			return { type: 'next' };
		case 'p':
			return { type: 'previous' };
		case 'u':
			return { type: 'undo' };
		case 'r':
			return { type: 'replay' };
		default:
			return null;
	}
}
