/**
 * Pure list operations behind the Browse toolbar: tier/availability filtering,
 * free-text search and the three sort orders.
 *
 * No runes and no state — the page owns the filter values and feeds them in, so
 * every rule here is directly testable.
 */

import { RATING_ORDER } from '$lib/types.js';

/** @typedef {import('$lib/types.js').Video} Video */
/** @typedef {import('$lib/types.js').Rating} Rating */

/**
 * @typedef {'playlist'|'rating'|'title'} SortKey
 */

/**
 * What the toolbar narrows the list down to. The four values travel together
 * everywhere (page state, toolbar binding, `filterVideos`), so they are one object.
 *
 * `tiers` and `unrated` together form one bucket selection: with nothing selected
 * every video passes, otherwise a video has to fall into one of the chosen buckets.
 *
 * @typedef {Object} BrowseFilter
 * @property {Rating[]} [tiers] - Selected tiers; empty means "no tier constraint".
 * @property {boolean} [unrated] - Whether the "Unrated" bucket is selected.
 * @property {string} [search] - Free text over title and channel.
 * @property {boolean} [hideUnavailable] - Drop videos the player cannot show.
 */

/**
 * The filter a freshly opened page starts from: nothing selected, no search, and
 * unavailable videos out of the way.
 *
 * @returns {Required<BrowseFilter>} A new object every call, safe to hand to `$state`.
 */
export function createFilter() {
	return { tiers: [], unrated: false, search: '', hideUnavailable: true };
}

/** @type {{ value: SortKey, label: string }[]} */
export const SORT_OPTIONS = [
	{ value: 'playlist', label: 'Playlist order' },
	{ value: 'rating', label: 'Rating (best first)' },
	{ value: 'title', label: 'Title (A–Z)' }
];

/** @type {SortKey} The order the playlist itself defines, including a shuffle. */
export const DEFAULT_SORT = 'playlist';

/** How many cards the list renders before the user asks for more. */
export const PAGE_SIZE = 60;

/**
 * @param {string} value
 * @returns {string[]} Lower-cased search terms, `[]` for a blank query.
 */
function termsOf(value) {
	return typeof value === 'string' ? value.toLowerCase().split(/\s+/).filter(Boolean) : [];
}

/**
 * Does a video match a free-text query? All terms have to appear (in any order)
 * in either the title or the channel name.
 *
 * @param {Video} video
 * @param {string} query
 * @returns {boolean} `true` for a blank query.
 */
export function matchesSearch(video, query) {
	const terms = termsOf(query);
	if (terms.length === 0) return true;
	const haystack = `${video.title ?? ''} ${video.channelTitle ?? ''}`.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

/**
 * Apply the toolbar filters. Order is preserved.
 *
 * @param {Video[]} videos
 * @param {BrowseFilter} [filter]
 * @returns {Video[]} A new array.
 */
export function filterVideos(videos, filter = {}) {
	const tiers = Array.isArray(filter.tiers) ? filter.tiers : [];
	const unrated = filter.unrated === true;
	const hideUnavailable = filter.hideUnavailable !== false;
	const query = filter.search ?? '';
	// Nothing selected means "no bucket constraint" rather than "nothing matches".
	const constrained = tiers.length > 0 || unrated;

	return videos.filter((video) => {
		if (hideUnavailable && video.unavailable) return false;
		if (constrained) {
			const inBucket = video.rating === null ? unrated : tiers.includes(video.rating);
			if (!inBucket) return false;
		}
		return matchesSearch(video, query);
	});
}

/**
 * Sort index of a rating: 0 for S … 5 for F, unrated last.
 *
 * @param {Rating|null} rating
 * @returns {number}
 */
function rankOf(rating) {
	const index = rating === null ? -1 : RATING_ORDER.indexOf(rating);
	return index === -1 ? RATING_ORDER.length : index;
}

/**
 * Sort a list of videos. `playlist` keeps the incoming order (which already is the
 * playlist's own, shuffle included); the other keys are stable, so videos that
 * compare equal stay in playlist order.
 *
 * @param {Video[]} videos
 * @param {SortKey|string} [sort]
 * @returns {Video[]} A new array; the input is never mutated.
 */
export function sortVideos(videos, sort = DEFAULT_SORT) {
	const result = [...videos];
	if (sort === 'rating') {
		return result.sort((a, b) => rankOf(a.rating) - rankOf(b.rating));
	}
	if (sort === 'title') {
		return result.sort((a, b) =>
			(a.title ?? '').localeCompare(b.title ?? '', 'en', { numeric: true, sensitivity: 'base' })
		);
	}
	return result;
}
