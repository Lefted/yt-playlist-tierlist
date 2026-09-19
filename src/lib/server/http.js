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

/**
 * The JSON body of a request, or `undefined` when there is none to be had.
 *
 * `Request.json()` throws on an empty or malformed body, and an endpoint that lets
 * that through answers with SvelteKit's own 500 instead of this envelope. Callers
 * validate the shape themselves — this only promises that something was parsed.
 *
 * @param {Request} request
 * @returns {Promise<unknown>} `undefined` when the body was empty or not JSON.
 */
export async function readJson(request) {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

/**
 * Wrap an API handler so an unexpected throw is still an `{ error: … }` answer.
 *
 * Everything below is written to return failures rather than throw them; this is
 * for the ones nobody planned — a dropped database connection in the middle of a
 * statement, a bug. Without it SvelteKit answers with its own JSON shape, and a
 * client that only knows this envelope reads that as an unexplained failure.
 *
 * @template {(event: any) => Promise<Response>} H
 * @param {H} handler
 * @returns {H}
 */
export function apiHandler(handler) {
	return /** @type {H} */ (
		async (/** @type {any} */ event) => {
			try {
				return await handler(event);
			} catch (error) {
				// A redirect (or any other SvelteKit control-flow throw) is not a failure.
				if (error instanceof Response) return error;
				console.error(`[api] ${event?.request?.method} ${event?.url?.pathname} failed:`, error);
				return jsonError(
					500,
					'internal_error',
					'Something went wrong on the server. Try again in a moment.'
				);
			}
		}
	);
}

/** Methods that cannot change anything, and so need no cross-site protection. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses a JSON mutation that did not come from this app.
 *
 * SvelteKit's own CSRF protection covers *form* posts (it compares `Origin` for
 * `application/x-www-form-urlencoded`, `multipart/form-data` and `text/plain` — the
 * three content types a cross-origin `<form>` can produce). It deliberately leaves
 * `application/json` alone, because a cross-origin `fetch` cannot send that content
 * type without a CORS preflight the browser would then have to be told to allow.
 *
 * That is true, and it is one browser bug away from not being true, so the API
 * checks for itself. Two conditions, both cheap:
 *
 * - **`Content-Type: application/json`.** A `<form>` can never produce it, so
 *   insisting on it is what keeps a cross-site form post out — and every client of
 *   this API sends JSON anyway.
 * - **`Origin` equals `ORIGIN`**, when the server was told what it is. Browsers
 *   attach `Origin` to every mutating request and a page cannot forge it. When
 *   `ORIGIN` is unset (development), the header is not compared — there is nothing
 *   to compare it against, and production requires the variable (#15).
 *
 * Safe methods pass untouched: `GET` changes nothing, and #17's reads should not
 * have to carry a content type.
 *
 * @param {Request} request
 * @param {string | null} allowedOrigin - `serverConfig().origin`.
 * @returns {Response | null} A ready-to-return failure, or `null` to proceed.
 */
export function jsonMutationGuard(request, allowedOrigin) {
	if (SAFE_METHODS.has(request.method)) return null;

	const contentType = request.headers.get('content-type') ?? '';
	if (!/^application\/json\s*(;|$)/i.test(contentType.trim())) {
		return jsonError(
			415,
			'unsupported_media_type',
			'This endpoint takes a JSON body; send Content-Type: application/json.'
		);
	}

	const origin = request.headers.get('origin');
	if (allowedOrigin && origin !== allowedOrigin) {
		return jsonError(
			403,
			'cross_origin',
			'This request did not come from the app, so it was refused.'
		);
	}

	return null;
}
