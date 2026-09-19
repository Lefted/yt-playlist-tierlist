import { apiHandler } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { exportLibraryJson } from '$lib/server/library/service.js';
import { requireUser } from '$lib/server/library/session.js';
import { exportFileName } from '$lib/format.js';

/**
 * The account's library as a backup file.
 *
 * Byte for byte what the Browse page's "Export JSON" writes — both go through
 * `serializeExport` — so a backup taken with `curl` and one taken with the button
 * are the same file, and either restores through `POST /library/import-json`.
 *
 * `Content-Disposition` because this one is meant to be saved: it is the only
 * endpoint in the API a person might open in a browser tab on purpose.
 *
 * @type {import('./$types').RequestHandler}
 */
export const GET = apiHandler(async ({ locals }) => {
	const body = await exportLibraryJson(getDb(), requireUser(locals).id);

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			'content-disposition': `attachment; filename="${exportFileName()}"`
		}
	});
});
