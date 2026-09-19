/**
 * Turns a failed import into something a user can act on.
 *
 * The machine-readable half is the `code` of `{ error: { code, message } }` — which
 * for an import is one of `ApiErrorReason`, the vocabulary the server's YouTube
 * module speaks (`src/lib/server/youtube.js`). This is the human half, and it lives
 * here, next to the dialog that shows it, so nothing in the app ever falls back to
 * `alert(error.message)`.
 *
 * Anything not listed here falls through to the server's own sentence, which is why
 * codes such as `invalid_export` or `playlist_not_found` need no entry: they arrive
 * with a message written for this exact situation.
 */

/** @typedef {import('$lib/youtube/api.js').ApiErrorReason} ApiErrorReason */

/** @type {Record<string, string>} */
const BY_REASON = {
	keyInvalid:
		'YouTube rejected this server\'s API key. Ask whoever runs this installation to check YOUTUBE_API_KEY and that "YouTube Data API v3" is enabled for the project it belongs to.',
	keyMissing:
		'This server has no YouTube API key configured, so it cannot import playlists. Ask whoever runs it to set YOUTUBE_API_KEY.',
	offline:
		'The server could not be reached. Check your connection — importing needs to be online — and try again.',
	quotaExceeded:
		'This installation is out of YouTube quota for today. The quota resets at midnight Pacific Time.',
	playlistNotFound:
		'No playlist found for that link or id. Private playlists are invisible to the API; the playlist has to be public or unlisted.',
	network:
		'Could not reach YouTube. Check your connection — the import needs to be online — and try again.',
	unknown: 'YouTube returned an error we do not recognise. Please try again in a moment.'
};

/** Shown when something that is not an `Error` at all reaches the dialog. */
const FALLBACK = 'The import failed for an unknown reason. Please try again.';

/**
 * @param {unknown} error - An `ApiError` from `$lib/api.js`, a plain `Error`, or
 *   anything else that was thrown.
 * @returns {string} A complete sentence, never empty.
 */
export function importErrorMessage(error) {
	const source = /** @type {{ code?: unknown, reason?: unknown }} */ (error ?? {});
	// `reason` as well as `code`, because the two are the same vocabulary: the server
	// throws a `YouTubeApiError` carrying a `reason` and answers with it as a `code`.
	const reason = source.code ?? source.reason;
	if (typeof reason === 'string' && reason in BY_REASON) return BY_REASON[reason];

	const message = /** @type {{ message?: unknown }} */ (error ?? {}).message;
	if (typeof message === 'string' && message.trim() !== '') return message;

	return FALLBACK;
}
