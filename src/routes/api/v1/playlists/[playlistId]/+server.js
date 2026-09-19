import { apiHandler, json } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { playlistNotFound } from '$lib/server/library/protocol.js';
import { removePlaylist } from '$lib/server/library/service.js';
import { requireUser } from '$lib/server/library/session.js';

/**
 * Remove a playlist and its ratings.
 *
 * `:playlistId` is the YouTube id — the id the client already calls `playlist.id` —
 * and it is only ever looked up together with the account's own id, so a request
 * naming somebody else's playlist reads as "you have no such playlist".
 *
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = apiHandler(async ({ locals, params }) => {
	const result = await removePlaylist(getDb(), requireUser(locals).id, params.playlistId);
	if (!result.removed) return playlistNotFound();
	return json({ removed: true, activePlaylistId: result.activePlaylistId });
});
