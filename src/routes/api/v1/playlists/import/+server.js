import { apiHandler, json, jsonError, readJson } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { importFailure, readImportInput } from '$lib/server/library/protocol.js';
import { importPlaylist } from '$lib/server/library/service.js';
import { requireUser } from '$lib/server/library/session.js';
import { YouTubeApiError } from '$lib/server/youtube.js';

/**
 * Import a playlist from YouTube, or refresh one already imported.
 *
 * The body is `{ input }` — whatever the user pasted; the server parses it, so the
 * dialog's own check is a courtesy and not the rule. The key is this installation's
 * (`YOUTUBE_API_KEY`), which is the point of the endpoint: the browser no longer
 * holds one.
 *
 * A YouTube failure comes back as its reason (`quotaExceeded`, `keyInvalid`, …) in
 * `error.code`, which is the vocabulary the import dialog has always rendered.
 *
 * Note that this route shadows `DELETE /api/v1/playlists/import` — SvelteKit prefers
 * the static segment. No playlist id can read `import` (`parsePlaylistInput` requires
 * a YouTube prefix and eleven more characters), so nothing real is out of reach.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = apiHandler(async ({ locals, request }) => {
	const input = readImportInput(await readJson(request));
	if (input === null) {
		return jsonError(400, 'invalid_body', 'Send { "input": "<playlist link or id>" }.');
	}

	try {
		const result = await importPlaylist(getDb(), requireUser(locals).id, input);
		return json(result);
	} catch (error) {
		// Anything else — the database, a bug — is not YouTube's fault and must not be
		// reported as though the user's link were the problem.
		if (!(error instanceof YouTubeApiError)) throw error;
		const failure = importFailure(error);
		return jsonError(failure.status, failure.code, failure.message);
	}
});
