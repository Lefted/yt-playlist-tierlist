/**
 * The protocol half of the library API: which request bodies are acceptable, what a
 * failed import looks like over HTTP, and the one refusal three routes share.
 *
 * Pure apart from that last one, and free of SvelteKit either way, so every one of
 * these decisions is a unit test rather than a request. The routes are left with
 * "read, call, serialise".
 *
 * Not to be confused with `src/lib/server/http.js`, which owns the response envelope
 * for the whole API; this file is only about the library's own endpoints.
 */

import { jsonError } from '../http.js';
import { isRating } from '../../types.js';

/** @typedef {import('../../youtube/api.js').ApiErrorReason} ApiErrorReason */
/** @typedef {import('../../types.js').Rating} Rating */

/**
 * @typedef {Object} ApiFailure
 * @property {number} status
 * @property {string} code
 * @property {string} message
 */

/**
 * Status per {@link ApiErrorReason}.
 *
 * The `code` handed to the client stays the reason itself: it is the vocabulary
 * `src/lib/components/browse/errors.js` has always turned into sentences, and the
 * import dialog gets to keep exactly one table of error copy whether the call failed
 * in the browser (it no longer does) or upstream of this server.
 *
 * Nothing here is 4xx except "no such playlist": a bad key, an exhausted quota and
 * an unreachable Google are all this installation's problem, not the caller's, and a
 * 4xx would tell a monitoring system the opposite.
 *
 * @type {Record<ApiErrorReason, number>}
 */
export const IMPORT_ERROR_STATUS = {
	playlistNotFound: 404,
	keyMissing: 503,
	quotaExceeded: 503,
	keyInvalid: 502,
	network: 502,
	unknown: 502
};

/**
 * Turn a thrown {@link import('../youtube.js').YouTubeApiError} — or anything else
 * the import threw — into a status, a code and a sentence.
 *
 * @param {unknown} error
 * @returns {ApiFailure}
 */
export function importFailure(error) {
	const reason = /** @type {{ reason?: unknown }} */ (error ?? {}).reason;
	const code = typeof reason === 'string' && reason in IMPORT_ERROR_STATUS ? reason : 'unknown';
	const message = messageOf(error) || 'The import failed for an unknown reason.';

	return {
		status: IMPORT_ERROR_STATUS[/** @type {ApiErrorReason} */ (code)],
		code,
		message
	};
}

/**
 * "You have no playlist with that id."
 *
 * The answer to a playlist id that belongs to nobody *and* to one that belongs to
 * somebody else — three routes give it, and they must give the same one: a 403 for
 * the second case would confirm that the playlist exists.
 *
 * @returns {Response}
 */
export function playlistNotFound() {
	return jsonError(404, 'playlist_not_found', 'You have no playlist with that id.');
}

/**
 * The `{ input }` of `POST /playlists/import`.
 *
 * @param {unknown} body
 * @returns {string|null} `null` when the body carries no usable input.
 */
export function readImportInput(body) {
	const input = field(body, 'input');
	return typeof input === 'string' && input.trim() !== '' ? input : null;
}

/**
 * The `{ playlistId }` of `PUT /library/active`, where `null` means "nothing
 * active" and is a legitimate value.
 *
 * @param {unknown} body
 * @returns {{ playlistId: string|null }|null} `null` when the body is unusable.
 */
export function readActivePlaylistId(body) {
	if (!body || typeof body !== 'object') return null;
	if (!('playlistId' in body)) return null;

	const value = /** @type {Record<string, unknown>} */ (body).playlistId;
	if (value === null) return { playlistId: null };
	if (typeof value !== 'string' || value.trim() === '') return null;
	return { playlistId: value };
}

/**
 * The `{ rating }` and/or `{ unavailable }` of a video PATCH.
 *
 * A key that is absent is not the same as a key that is `null`: `{ unavailable: true }`
 * must leave the tier alone, and `{ rating: null }` must clear it. That is why the
 * result only carries the keys the body actually mentioned.
 *
 * @param {unknown} body
 * @returns {{ rating?: Rating|null, unavailable?: boolean }|null} `null` when the
 *   body mentions nothing patchable, or mentions it with a value that is not one.
 */
export function readVideoPatch(body) {
	if (!body || typeof body !== 'object') return null;
	const source = /** @type {Record<string, unknown>} */ (body);

	/** @type {{ rating?: Rating|null, unavailable?: boolean }} */
	const patch = {};

	if ('rating' in source) {
		const rating = source.rating;
		if (rating !== null && !isRating(rating)) return null;
		patch.rating = /** @type {Rating|null} */ (rating);
	}

	if ('unavailable' in source) {
		if (typeof source.unavailable !== 'boolean') return null;
		patch.unavailable = source.unavailable;
	}

	return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The `{ order }` of `PUT /playlists/:id/order`.
 *
 * Only the shape is checked here; which ids are real is the store's business, and it
 * reconciles the list against the playlist it is about to write.
 *
 * @param {unknown} body
 * @returns {string[]|null}
 */
export function readOrder(body) {
	const order = field(body, 'order');
	if (!Array.isArray(order)) return null;
	if (order.some((id) => typeof id !== 'string')) return null;
	return /** @type {string[]} */ (order);
}

/**
 * @param {unknown} body
 * @param {string} name
 * @returns {unknown}
 */
function field(body, name) {
	if (!body || typeof body !== 'object') return undefined;
	return /** @type {Record<string, unknown>} */ (body)[name];
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
	const message = /** @type {{ message?: unknown }} */ (error ?? {}).message;
	return typeof message === 'string' ? message.trim() : '';
}
