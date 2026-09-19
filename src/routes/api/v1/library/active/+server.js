import { apiHandler, json, jsonError, readJson } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { readActivePlaylistId } from '$lib/server/library/http.js';
import { setActivePlaylist } from '$lib/server/library/store.js';
import { requireUser } from '$lib/server/library/session.js';

/**
 * Which playlist the account is working on. `{ playlistId: null }` deselects.
 *
 * A playlist this account does not have is a 404 rather than a silent no-op: the
 * browser's own switcher can only offer playlists it was given, so an id that misses
 * means the two have drifted apart and the client should reload.
 *
 * @type {import('./$types').RequestHandler}
 */
export const PUT = apiHandler(async ({ locals, request }) => {
	const body = readActivePlaylistId(await readJson(request));
	if (!body) {
		return jsonError(
			400,
			'invalid_body',
			'Send { "playlistId": "<playlist id>" } or { "playlistId": null }.'
		);
	}

	const changed = await setActivePlaylist(getDb(), requireUser(locals).id, body.playlistId);
	if (!changed) {
		return jsonError(404, 'playlist_not_found', 'You have no playlist with that id.');
	}

	return json({ activePlaylistId: body.playlistId });
});
