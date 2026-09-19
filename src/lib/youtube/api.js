/**
 * The parts of the YouTube Data API vocabulary that both sides of the app need.
 *
 * The calls themselves live in `src/lib/server/youtube.js` since #17 — the key is
 * one server-side secret now, and the browser never talks to Google. What is left
 * here is pure and shared: reading a playlist id out of whatever a user pasted (the
 * import dialog validates before it posts), reading a duration, and the closed list
 * of reasons an import can fail for.
 *
 * That list is the contract between the two sides: the server puts one of these in
 * `error.code`, and `src/lib/components/browse/errors.js` turns it into a sentence.
 */

import { PLAYLIST_ID_PREFIX } from './urls.js';

/**
 * Why an import failed.
 *
 * `keyMissing` is the only one that is about this installation rather than about
 * the request: the server was started without `YOUTUBE_API_KEY`.
 *
 * @typedef {'quotaExceeded'|'keyInvalid'|'keyMissing'|'playlistNotFound'|'network'|'unknown'} ApiErrorReason
 */

/**
 * Metadata of a playlist, without its videos.
 * @typedef {Object} PlaylistMeta
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} channelTitle
 * @property {string} thumbnail
 * @property {number} itemCount
 */

/** Every {@link ApiErrorReason}, so a test can walk them and `errors.js` can be held to them. */
export const API_ERROR_REASONS = /** @type {ApiErrorReason[]} */ ([
	'quotaExceeded',
	'keyInvalid',
	'keyMissing',
	'playlistNotFound',
	'network',
	'unknown'
]);

/**
 * @param {unknown} value
 * @returns {value is ApiErrorReason}
 */
export function isApiErrorReason(value) {
	return (
		typeof value === 'string' && API_ERROR_REASONS.includes(/** @type {ApiErrorReason} */ (value))
	);
}

/**
 * Extract a playlist id from anything a user might paste: a bare id, a playlist
 * URL, or a watch URL that carries `list=`.
 *
 * @param {unknown} input
 * @returns {string|null} The playlist id, or `null` when nothing usable was found.
 */
export function parsePlaylistInput(input) {
	if (typeof input !== 'string') return null;
	const trimmed = input.trim();
	if (trimmed === '') return null;

	const fromUrl = /[?&#]list=([^&#\s]+)/.exec(trimmed);
	if (fromUrl) {
		// `list=` already states the intent, so the value only has to be id-shaped.
		const id = safeDecode(fromUrl[1]);
		return ID_CHARACTERS.test(id) ? id : null;
	}

	return looksLikePlaylistId(trimmed) ? trimmed : null;
}

/** Characters a playlist id is made of. */
const ID_CHARACTERS = /^[A-Za-z0-9_-]{2,}$/;

/**
 * A bare token only counts as a playlist id when it carries one of YouTube's
 * playlist prefixes (shared with `youtube/urls.js`, so the two cannot drift) and
 * has the length of a real id — otherwise every word a user types would parse as
 * one. Anything behind `list=` is trusted without the length rule.
 */
const BARE_PLAYLIST_ID = new RegExp(`^${PLAYLIST_ID_PREFIX}[A-Za-z0-9_-]{11,}$`);

/**
 * @param {string} value
 * @returns {boolean}
 */
function looksLikePlaylistId(value) {
	return BARE_PLAYLIST_ID.test(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function safeDecode(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Seconds of an ISO 8601 duration as returned by `videos.contentDetails.duration`.
 *
 * @param {unknown} duration - e.g. `PT4M13S`, `P1DT2H`, `PT1M30.5S`.
 * @returns {number|null} `null` when the input is not a duration.
 */
export function parseIsoDuration(duration) {
	if (typeof duration !== 'string') return null;
	const match =
		/^P(?!$)(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?!$)(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
			duration.trim()
		);
	if (!match) return null;
	const [, weeks, days, hours, minutes, seconds] = match;
	const total =
		num(weeks) * 604800 + num(days) * 86400 + num(hours) * 3600 + num(minutes) * 60 + num(seconds);
	return Math.round(total);
}

/**
 * @param {string|undefined} value
 * @returns {number}
 */
function num(value) {
	return value === undefined ? 0 : Number(value);
}
