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
 * Which keys the Rate page listens to.
 *
 * `letters` is the original mapping (`s a b c d f`); `digits` moves the tiers to
 * `1`–`6` so YouTube habits like `f` for fullscreen cannot rate a video by
 * accident; `off` takes the page off the keyboard entirely.
 *
 * @typedef {'letters'|'digits'|'off'} ShortcutMode
 */

/**
 * @typedef {Object} Settings
 * @property {string} apiKey
 * @property {boolean} skipRated
 * @property {boolean} autoAdvance
 * @property {boolean} fullscreenOnPlay
 * @property {ShortcutMode} shortcuts
 * @property {boolean} loop
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

/** @type {ShortcutMode[]} In the order the settings control offers them. */
export const SHORTCUT_MODES = ['letters', 'digits', 'off'];

/** @type {ShortcutMode} What a fresh install and anything unrecognised fall back to. */
export const DEFAULT_SHORTCUT_MODE = 'letters';

/**
 * @param {unknown} value
 * @returns {value is ShortcutMode}
 */
export function isShortcutMode(value) {
	return typeof value === 'string' && SHORTCUT_MODES.includes(/** @type {ShortcutMode} */ (value));
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
