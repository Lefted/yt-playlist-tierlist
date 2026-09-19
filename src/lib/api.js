/**
 * Talking to `/api/v1` from the browser.
 *
 * One place that knows the envelope (`{ error: { code, message } }`), so no caller
 * ever has to look at a status code or at `response.ok`: either it returns the body,
 * or it throws an {@link ApiError} carrying the server's own `code` and sentence.
 *
 * That `code` is the same vocabulary the import dialog has always rendered
 * (`components/browse/errors.js`), which is why a failed import reads the same now
 * that the call happens on the server.
 */

/** Everything the client calls lives under this prefix. */
export const API_BASE = '/api/v1';

/**
 * Methods that change nothing, and so carry no content type.
 *
 * The same list `jsonMutationGuard` in `src/lib/server/http.js` exempts; the two
 * sides of one rule, held together by `src/lib/api.test.js`.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** What a failed request throws. */
export class ApiError extends Error {
	/**
	 * @param {string} message - One sentence, from the server when it sent one.
	 * @param {string} code - Stable error code, e.g. `quotaExceeded`.
	 * @param {{ status?: number|null, cause?: unknown }} [options]
	 */
	constructor(message, code, options = {}) {
		super(message, { cause: options.cause });
		this.name = 'ApiError';
		/** @type {string} */
		this.code = code;
		/** @type {number|null} HTTP status, `null` when the request never completed. */
		this.status = options.status ?? null;
	}

	/**
	 * @returns {boolean} Whether the request never reached the server — the state a
	 * PWA is in whenever the device is offline.
	 */
	get offline() {
		return this.code === 'offline';
	}
}

/**
 * One call against the API.
 *
 * @param {string} path - Below {@link API_BASE}, e.g. `/library`.
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options] - A
 *   `body` is sent as JSON.
 * @returns {Promise<any>} The parsed body; `null` for a 204.
 * @throws {ApiError}
 */
export async function apiFetch(path, options = {}) {
	const { method = 'GET', body, signal } = options;

	/** @type {Record<string, string>} */
	const headers = { accept: 'application/json' };
	// The content type is about the *method*, not about the body: the server's
	// cross-site check refuses any mutation that does not declare JSON, and `DELETE`
	// has nothing to say in its body. Sending it only when there is a body is how
	// every `DELETE` in this app came back 415.
	if (!SAFE_METHODS.has(method.toUpperCase())) headers['content-type'] = 'application/json';

	/** @type {RequestInit} */
	const init = {
		method,
		headers,
		// The session cookie is same-origin anyway; being explicit keeps this working
		// if the API ever moves to another host.
		credentials: 'same-origin',
		signal
	};
	if (body !== undefined) init.body = JSON.stringify(body);

	/** @type {Response} */
	let response;
	try {
		response = await globalThis.fetch(`${API_BASE}${path}`, init);
	} catch (cause) {
		throw new ApiError(
			'The server could not be reached. Check your connection and try again.',
			'offline',
			{ cause }
		);
	}

	if (response.status === 204) return null;

	/** @type {any} */
	let payload = null;
	try {
		payload = await response.json();
	} catch (cause) {
		if (response.ok) {
			throw new ApiError('The server sent an answer we could not read.', 'unreadable', {
				status: response.status,
				cause
			});
		}
	}

	if (!response.ok) throw toApiError(payload, response.status);
	return payload;
}

/**
 * @param {any} payload - The parsed error body, may be `null`.
 * @param {number} status
 * @returns {ApiError}
 */
function toApiError(payload, status) {
	const error = payload?.error ?? {};
	const code = typeof error.code === 'string' && error.code !== '' ? error.code : 'unknown';
	const message =
		typeof error.message === 'string' && error.message.trim() !== ''
			? error.message
			: `The request failed (HTTP ${status}).`;
	return new ApiError(message, code, { status });
}
