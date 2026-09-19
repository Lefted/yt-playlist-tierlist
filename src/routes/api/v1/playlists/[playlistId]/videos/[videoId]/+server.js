import { apiHandler, json, jsonError, readJson } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { readVideoPatch } from '$lib/server/library/http.js';
import { updateVideo } from '$lib/server/library/store.js';
import { requireUser } from '$lib/server/library/session.js';

/**
 * Rate a video, clear its rating, or flag it as (un)playable.
 *
 * `{ "rating": "S" }`, `{ "rating": null }` and `{ "unavailable": true }` are the
 * three things the app does to a video; a body may carry both keys, and a key it
 * leaves out is left alone — marking a video unplayable never costs it its tier.
 *
 * The route is nested under its playlist because a YouTube video id is only unique
 * *inside* one: the same video in two playlists is two rows with two ratings, which
 * is what the app has always done. #17 spelled this `PATCH /videos/:id`, which would
 * mean putting database uuids into the browser's domain model and into every export;
 * addressing it by the two ids the client already holds keeps `normalizePlaylist` the
 * only normaliser there is.
 *
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = apiHandler(async ({ locals, params, request }) => {
	const patch = readVideoPatch(await readJson(request));
	if (patch === null) {
		return jsonError(
			400,
			'invalid_body',
			'Send { "rating": "S"|…|"F"|null } and/or { "unavailable": true|false }.'
		);
	}

	const video = await updateVideo(
		getDb(),
		requireUser(locals).id,
		params.playlistId,
		params.videoId,
		patch
	);
	if (!video) {
		return jsonError(404, 'video_not_found', 'You have no video with that id in that playlist.');
	}

	return json({ video });
});
