import { serverConfig } from '$lib/server/config.js';
import { getClient } from '$lib/server/db/index.js';
import { countAppliedMigrations, countShippedMigrations } from '$lib/server/db/migrations.js';
import { json, jsonError } from '$lib/server/http.js';
import { buildMeta, STARTED_AT } from '$lib/server/meta.js';

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

	try {
		// The migration folder is read from disk, but boot already proved it is there:
		// `applyMigrations` reads the same journal, and a missing one kills the process.
		const [dbSchemaVersion, binarySchemaVersion] = await Promise.all([
			countAppliedMigrations(getClient()),
			countShippedMigrations()
		]);

		return json(
			buildMeta({
				commit: config.gitSha,
				buildTime: config.buildTime,
				startedAt: STARTED_AT,
				dbSchemaVersion,
				binarySchemaVersion
			})
		);
	} catch (error) {
		console.error('[meta] could not read the schema versions:', error);
		return jsonError(
			503,
			'db_unavailable',
			'The database is not reachable, so the schema versions are unknown.'
		);
	}
}
