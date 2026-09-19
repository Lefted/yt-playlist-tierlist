import { apiHandler, json, jsonError, readJson } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { playlistNotFound, readOrder } from '$lib/server/library/protocol.js';
import { setPlaylistOrder } from '$lib/server/library/store.js';
import { requireUser } from '$lib/server/library/session.js';

/**
 * The playback order of a playlist — what "Shuffle" and "Original order" write.
 *
 * The whole order is sent rather than a move: it is one value the user replaced, and
 * a shuffle changes every position anyway. The server reconciles it against the
 * videos that are actually in the playlist, so a stale list cannot hide a video.
 *
 * @type {import('./$types').RequestHandler}
 */
export const PUT = apiHandler(async ({ locals, params, request }) => {
	const order = readOrder(await readJson(request));
	if (order === null) {
		return jsonError(400, 'invalid_body', 'Send { "order": ["<video id>", …] }.');
	}

	const stored = await setPlaylistOrder(getDb(), requireUser(locals).id, params.playlistId, order);
	if (stored === null) return playlistNotFound();

	return json({ order: stored });
});
