import { apiHandler, json } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { loadLibrary } from '$lib/server/library/store.js';
import { requireUser } from '$lib/server/library/session.js';

/**
 * The signed-in account's whole library.
 *
 * The payload is exactly what `normalizePlaylist` takes — the same shape the browser
 * used to read out of `localStorage` — so the client keeps one normaliser and this
 * endpoint is a drop-in replacement for that read.
 *
 * @type {import('./$types').RequestHandler}
 */
export const GET = apiHandler(async ({ locals }) => {
	return json(await loadLibrary(getDb(), requireUser(locals).id));
});
