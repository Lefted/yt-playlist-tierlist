/**
 * One shape for every JSON answer under `/api/v1` (and `/healthz`).
 *
 * Success bodies are whatever the endpoint has to say; failures are always
 * `{ error: { code, message } }` — `code` is the stable string a client may branch
 * on, `message` is one sentence a human can act on. The client's existing error
 * copy (`src/lib/components/browse/errors.js`) already works that way for the
 * YouTube API, so #16 and #17 get to reuse the habit instead of inventing a second
 * envelope.
 *
 * Nothing here is cached: all of these endpoints report the state of *this* moment.
 */

/**
 * @typedef {object} ApiError
 * @property {string} code - Stable, machine-readable, e.g. `db_unavailable`.
 * @property {string} message - One complete sentence for a human.
 */

/** @typedef {{ error: ApiError }} ApiErrorBody */

/** @type {Record<string, string>} */
const BASE_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store'
};

/**
 * A JSON response.
 *
 * @param {unknown} data - Serialised as the body.
 * @param {number} [status] - Defaults to 200.
 * @returns {Response}
 */
export function json(data, status = 200) {
	return new Response(JSON.stringify(data), { status, headers: BASE_HEADERS });
}

/**
 * A JSON failure in the shared envelope.
 *
 * @param {number} status - HTTP status, e.g. 503.
 * @param {string} code - Stable error code, e.g. `db_unavailable`.
 * @param {string} message - One complete sentence for a human.
 * @returns {Response}
 */
export function jsonError(status, code, message) {
	/** @type {ApiErrorBody} */
	const body = { error: { code, message } };
	return json(body, status);
}
