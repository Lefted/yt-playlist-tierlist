import { apiHandler, json, jsonError, readJson } from '$lib/server/http.js';
import { getDb } from '$lib/server/db/index.js';
import { ImportFormatError } from '$lib/library-io.js';
import { importLibraryJson } from '$lib/server/library/service.js';
import { requireUser } from '$lib/server/library/session.js';

/**
 * Merge an exported library into this account's.
 *
 * The body *is* the export file — `{ version, exportedAt, playlists }`, or the bare
 * array the vanilla prototype wrote. Both the one-time "bring my local data" flow
 * and restoring a backup post here, because they are the same operation: an import
 * never overwrites a tier that is already there, it only fills blanks.
 *
 * The whole library comes back with the summary, so the client does not have to
 * guess what the merge decided.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = apiHandler(async ({ locals, request }) => {
	const body = await readJson(request);
	if (body === undefined) {
		return jsonError(400, 'invalid_body', 'That file is not valid JSON.');
	}

	try {
		const { summary, library } = await importLibraryJson(getDb(), requireUser(locals).id, body);
		return json({ summary, library });
	} catch (error) {
		// A rejected payload is the only failure the caller can do anything about; a
		// dropped connection in the middle of the merge is not, and `apiHandler` turns
		// that into a 500 rather than blaming the file.
		if (!(error instanceof ImportFormatError)) throw error;
		return jsonError(400, 'invalid_export', error.message);
	}
});
