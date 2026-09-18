/**
 * Turns a failed import into something a user can act on.
 *
 * `YouTubeApiError.reason` is the machine-readable half of the API module; this is
 * the human half. It lives here, next to the dialog that shows it, so nothing in
 * the app ever falls back to `alert(error.message)`.
 */

/** @typedef {import('$lib/youtube/api.js').ApiErrorReason} ApiErrorReason */

/** @type {Record<string, string>} */
const BY_REASON = {
	keyInvalid:
		'YouTube rejected this API key. Check that you copied it completely and that "YouTube Data API v3" is enabled for the project the key belongs to.',
	quotaExceeded:
		'This API key is out of quota for today. The quota resets at midnight Pacific Time — until then, use a key from another project.',
	playlistNotFound:
		'No playlist found for that link or id. Private playlists are invisible to the API; the playlist has to be public or unlisted.',
	network:
		'Could not reach YouTube. Check your connection — the import needs to be online — and try again.',
	unknown: 'YouTube returned an error we do not recognise. Please try again in a moment.'
};

/** Shown when something that is not an `Error` at all reaches the dialog. */
const FALLBACK = 'The import failed for an unknown reason. Please try again.';

/**
 * @param {unknown} error - A {@link YouTubeApiError}, a plain `Error` (e.g. from
 *   `library.importJson`) or anything else that was thrown.
 * @returns {string} A complete sentence, never empty.
 */
export function importErrorMessage(error) {
	const reason = /** @type {{ reason?: unknown }} */ (error ?? {}).reason;
	if (typeof reason === 'string' && reason in BY_REASON) return BY_REASON[reason];

	const message = /** @type {{ message?: unknown }} */ (error ?? {}).message;
	if (typeof message === 'string' && message.trim() !== '') return message;

	return FALLBACK;
}
