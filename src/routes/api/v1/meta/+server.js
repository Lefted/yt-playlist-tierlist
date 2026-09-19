import { serverConfig } from '$lib/server/config.js';
import { getClient } from '$lib/server/db/index.js';
import { countAppliedMigrations, countShippedMigrations } from '$lib/server/db/migrations.js';
import { json, jsonError } from '$lib/server/http.js';
import { buildMeta } from '$lib/server/meta.js';

/**
 * What is running here, and did its migrations land?
 *
 * Unlike `/healthz` this one touches the database on purpose — it is the readiness
 * and post-deploy check, so an unreachable database has to show up as 503 rather
 * than as a cheerful 200.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET() {
	const config = serverConfig();

	// Read from disk, and kept out of the try below: a journal this process cannot
	// read is a broken image, not an outage, and answering 503 for it would send
	// whoever deployed it (or `scripts/deploy.sh`) after the database for nothing.
	let binarySchemaVersion;
	try {
		binarySchemaVersion = await countShippedMigrations();
	} catch (error) {
		console.error('[meta] could not read the shipped migrations:', error);
		return jsonError(
			500,
			'migrations_unreadable',
			'This build cannot read its own migration journal; the image is incomplete.'
		);
	}

	try {
		const dbSchemaVersion = await countAppliedMigrations(getClient());

		return json(
			buildMeta({
				commit: config.gitSha,
				buildTime: config.buildTime,
				dbSchemaVersion,
				binarySchemaVersion
			})
		);
	} catch (error) {
		console.error('[meta] could not read the applied migrations:', error);
		return jsonError(
			503,
			'db_unavailable',
			'The database is not reachable, so the schema versions are unknown.'
		);
	}
}
