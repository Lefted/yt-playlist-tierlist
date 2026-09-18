/**
 * The query parameters of `/rate`, in both directions.
 *
 * `?v=<videoId>` starts the session at a video, `?tiers=S,A` and `?unrated=0`
 * mirror the queue filter so a filtered session can be bookmarked and shared.
 */

import { normalizeRatings } from '$lib/types.js';

/** @typedef {import('$lib/types.js').Rating} Rating */

/**
 * @typedef {Object} RateParams
 * @property {string|null} videoId - Video to start at, `null` when none was asked for.
 * @property {Rating[]} tiers - Selected tiers, best to worst; empty means "no filter".
 * @property {boolean} includeUnrated
 */

/** Values that read as "off"; anything else (including a bare `?unrated`) is on. */
const FALSY = ['0', 'false', 'no', 'off'];

/**
 * Read the session parameters out of a URL.
 *
 * Unknown tiers are dropped rather than rejected — a stale or hand-edited link
 * should still open a usable session.
 *
 * @param {URLSearchParams|null|undefined} searchParams
 * @returns {RateParams}
 */
export function parseRateParams(searchParams) {
	const videoId = searchParams?.get('v')?.trim() || null;

	const tiers = normalizeRatings(
		(searchParams?.get('tiers') ?? '').split(',').map((part) => part.trim().toUpperCase())
	);

	const unrated = searchParams?.get('unrated') ?? null;
	const includeUnrated = unrated === null || !FALSY.includes(unrated.toLowerCase());

	return { videoId, tiers, includeUnrated };
}

/**
 * The canonical query string for a filter — `''` for the default filter, so an
 * untouched session keeps a clean URL.
 *
 * `v` is deliberately not part of it: it is a starting point that is consumed on
 * load, not session state, and keeping it would make a reload jump backwards.
 *
 * @param {{ tiers: Iterable<Rating>, includeUnrated: boolean }} filter
 * @returns {string} Either `''` or a string starting with `?`.
 */
export function rateQuery(filter) {
	const tiers = normalizeRatings(filter.tiers);

	// Built by hand rather than with URLSearchParams, which would escape the
	// separating comma; every value here comes from a fixed, URL-safe alphabet.
	const parts = [];
	if (tiers.length > 0) parts.push(`tiers=${tiers.join(',')}`);
	if (!filter.includeUnrated) parts.push('unrated=0');

	return parts.length === 0 ? '' : `?${parts.join('&')}`;
}
