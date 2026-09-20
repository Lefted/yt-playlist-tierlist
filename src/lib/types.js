/**
 * Domain model of the tier list.
 *
 * Plain data plus a few total helpers — no runes, no I/O — so this module can be
 * imported from state modules, components and tests alike.
 */

/**
 * A tier. `RATING_ORDER` lists them from best to worst.
 * @typedef {'S'|'A'|'B'|'C'|'D'|'F'} Rating
 */

/**
 * A single video of an imported playlist.
 * @typedef {Object} Video
 * @property {string} id - YouTube video id (falls back to the playlist-item id for
 *   entries that no longer expose a video id, so every video stays addressable).
 * @property {string} title
 * @property {string} description
 * @property {string} thumbnail - Best available thumbnail URL, `''` when there is none.
 * @property {string} channelTitle - Uploader of the video, not of the playlist.
 * @property {string} publishedAt - ISO timestamp, `''` when unknown.
 * @property {number} position - Zero-based position inside the playlist.
 * @property {number|null} durationSeconds - `null` while unknown or unavailable.
 * @property {Rating|null} rating - `null` means "not rated yet".
 * @property {boolean} unavailable - Private, deleted or otherwise unplayable.
 */

/**
 * An imported playlist together with its ratings.
 * @typedef {Object} Playlist
 * @property {string} id - YouTube playlist id, or `legacy-import` for legacy JSON.
 * @property {string} title
 * @property {string} description
 * @property {string} channelTitle
 * @property {string} thumbnail
 * @property {number} itemCount - Item count reported by the API at import time.
 * @property {string} importedAt - ISO timestamp of the first import.
 * @property {string} updatedAt - ISO timestamp of the last import/merge.
 * @property {Video[]} videos
 * @property {string[]} order - Video ids in playback order; survives reloads so a
 *   shuffle stays stable. Ids missing here are appended in `videos` order.
 */

/**
 * Everything of the rating layer the user can put on a key.
 *
 * The list is closed on purpose: `keybindings.js` builds `BINDABLE_ACTIONS` from
 * it, and the Rate page turns each id into an intent, so adding an action here is
 * what makes the page fail to type-check until it answers the new one. `help` is
 * not among them — `?` is fixed, because it is how the user finds out what the rest
 * is bound to.
 *
 * @typedef {'rateS'|'rateA'|'rateB'|'rateC'|'rateD'|'rateF'
 *   |'next'|'previous'|'replay'|'undo'|'loop'|'fullscreen'
 *   |'toggle-overlay'} ActionId
 */

/**
 * The keys of the rating layer: action → the chords bound to it, each a canonical
 * `Ctrl+Alt+Shift+Meta+key` string.
 *
 * `$lib/keybindings.js` owns the vocabulary — the chord grammar, the action list,
 * the defaults and the editing operations. This typedef is only the shape that goes
 * into storage.
 *
 * @typedef {Record<ActionId, string[]>} Keybindings
 */

/**
 * @typedef {Object} Settings
 * @property {boolean} skipRated
 * @property {boolean} autoAdvance
 * @property {boolean} fullscreenOnPlay
 * @property {boolean} shortcuts - Whether the rating keys are on at all; the player
 *   keys are proxied either way.
 * @property {Keybindings} keybindings - Which key each rating action answers to.
 * @property {boolean} loop
 * @property {boolean} overlayCollapsed - Whether the fullscreen overlay is tucked
 *   away into its eye button. A device preference like the rest of this file: it is
 *   about the screen in front of you, and it never reaches the server.
 */

/**
 * Number of videos per tier.
 * @typedef {Record<Rating, number>} RatingCounts
 */

/** @type {Rating[]} Best to worst. */
export const RATING_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'];

/**
 * @param {unknown} value
 * @returns {value is Rating}
 */
export function isRating(value) {
	return typeof value === 'string' && RATING_ORDER.includes(/** @type {Rating} */ (value));
}

/**
 * Is `a` at least as good as `b`? `false` when either side is not a rating, so
 * unrated videos never compare as "good enough".
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function isBetterOrEqual(a, b) {
	if (!isRating(a) || !isRating(b)) return false;
	return RATING_ORDER.indexOf(a) <= RATING_ORDER.indexOf(b);
}

/**
 * The tiers of an untrusted list — anything that is not a tier dropped, duplicates
 * collapsed, the rest in `RATING_ORDER`.
 *
 * Both the `?tiers=` query parameter and `session.setFilter` take a tier list from
 * outside, and both need exactly this; sharing it keeps a hand-edited URL and a
 * click in the filter popover from producing different queues.
 *
 * @param {Iterable<unknown>} values
 * @returns {Rating[]}
 */
export function normalizeRatings(values) {
	const selected = [...values].filter(isRating);
	return RATING_ORDER.filter((rating) => selected.includes(rating));
}

/**
 * A fresh counter object with every tier at zero.
 * @returns {RatingCounts}
 */
export function createRatingCounts() {
	const counts = /** @type {RatingCounts} */ ({});
	for (const rating of RATING_ORDER) counts[rating] = 0;
	return counts;
}
