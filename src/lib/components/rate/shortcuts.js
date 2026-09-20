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
 * The bindings themselves — the chord grammar, the bindable actions, the defaults
 * and the editing operations — are `$lib/keybindings.js`, because
 * `state/settings.svelte.js` needs the same vocabulary to load and persist them.
 * What lives here is everything that only makes sense on the Rate page: the player
 * layer, the matching, the conflict notes and the hints.
 *
 * Every key hint in the UI (the tier bar's `<kbd>`s, the button tooltips, the help
 * list, the settings copy) is generated from the same bindings, so the page can
 * never promise a key it does not answer.
 */

import {
	BINDABLE_ACTIONS,
	DEFAULT_KEYBINDINGS,
	bindingIndex,
	chordFor,
	chordLabel,
	chordsOf,
	parseChord
} from '$lib/keybindings.js';
import { TIERS } from '$lib/tiers.js';

/** @typedef {import('$lib/types.js').Rating} Rating */
/** @typedef {import('$lib/types.js').ActionId} ActionId */
/** @typedef {import('$lib/types.js').Keybindings} Keybindings */

/**
 * What the user asked for.
 * @typedef {{ type: 'rate', rating: Rating }
 *   | { type: 'seekBy', seconds: number }
 *   | { type: 'next' | 'previous' | 'replay' | 'playPause' | 'muteToggle'
 *       | 'fullscreen' | 'undo' | 'loop' | 'toggleOverlay' | 'help' }} ShortcutAction
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
 * @param {ActionId} id
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
 * The chords bound to each tier, rating → canonical chords.
 *
 * Chords, not labels: the tier bar needs both a `<kbd>` a human reads and an
 * `aria-keyshortcuts` a screen reader does, and formatting is the caller's job.
 *
 * @param {ShortcutOptions} [options]
 * @returns {Record<Rating, string[]>|null} `null` while the rating keys are off:
 *   there is no key to show and none to press.
 */
export function tierChords(options = {}) {
	const { bindings = DEFAULT_KEYBINDINGS, ratingKeys = true } = options;
	if (!ratingKeys) return null;
	return /** @type {Record<Rating, string[]>} */ (
		Object.fromEntries(
			TIERS.map((tier) => [
				tier.rating,
				[...chordsOf(bindings, /** @type {ActionId} */ (`rate${tier.rating}`))]
			])
		)
	);
}

/**
 * What each action is labelled with, for the help list and the button tooltips —
 * generated from the live bindings, so a rebinding cannot leave a stale hint behind.
 *
 * These are display labels ('→', 'Shift+F'), not `KeyboardEvent.key` values;
 * {@link shortcutFor} owns the matching. An empty list means "this action has no
 * key right now", so a `{#each}` over it renders nothing.
 *
 * The player rows lose every chord a rating binding has taken from them: `k` shown
 * next to "play / pause" while `k` rates would be exactly the promise the page no
 * longer keeps.
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

	// The player layer, which stays either way — minus whatever shadows it.
	const shadowed = ratingKeys ? bindingIndex(bindings) : new Map();
	for (const row of PLAYER_ROWS) {
		keys[row.id] = row.keys
			.filter(([chord]) => !shadowed.has(chord))
			.map(([chord]) => chordLabel(chord));
	}

	return keys;
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
 * What each bindable action means, once a key has been matched to it.
 *
 * A total table rather than a cast from the id: `ActionId` and `ShortcutAction` are
 * two lists that have to stay in step, and this is the one place that says how. The
 * suite walks every entry of `BINDABLE_ACTIONS` through it, so an action added
 * without an intent fails a test rather than silently doing nothing.
 *
 * @type {Record<ActionId, ShortcutAction>}
 */
const INTENTS = {
	.../** @type {Record<ActionId, ShortcutAction>} */ (
		Object.fromEntries(
			TIERS.map((tier) => [`rate${tier.rating}`, { type: 'rate', rating: tier.rating }])
		)
	),
	next: { type: 'next' },
	previous: { type: 'previous' },
	replay: { type: 'replay' },
	undo: { type: 'undo' },
	loop: { type: 'loop' },
	fullscreen: { type: 'fullscreen' },
	// Meaningful only while the player is fullscreen — outside it there is no overlay
	// to tuck away. The page is what knows that; the mapping stays unconditional, so
	// the help list and the editor can still name the key (#19).
	'toggle-overlay': { type: 'toggleOverlay' }
};

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
	// what everything else is bound to. Plain `?` only — `Shift` is how the character
	// is typed at all, but `Ctrl+?`, `Alt+?` and `Cmd+?` (the macOS Help menu) belong
	// to the browser and the OS, and the page must not swallow them.
	if (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey) {
		return { type: 'help' };
	}

	const chord = chordFor(event);
	if (!chord) return null;

	if (ratingKeys) {
		const id = bindingIndex(bindings).get(chord);
		// A copy: the caller gets a value, not a handle on the table.
		if (id) return { ...INTENTS[id] };
	}

	if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;

	const player = PLAYER_KEYS.get(chord);
	// A copy: the caller gets a value, not a handle on the table.
	return player ? { ...player.action } : null;
}
