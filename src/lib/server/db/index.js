/**
 * The process-wide database handle: one postgres.js pool and the Drizzle instance
 * over it.
 *
 * Created lazily rather than at import time. Importing a module must not open
 * sockets — the `init` hook decides when the process is allowed to talk to the
 * database, and the unit tests import server code without a database at all.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverConfig } from '../config.js';
import * as schema from './schema.js';

/**
 * @typedef {object} DbHandle
 * @property {import('postgres').Sql} client - postgres.js pool, for raw SQL.
 * @property {import('drizzle-orm/postgres-js').PostgresJsDatabase<typeof schema>} db - Drizzle.
 */

/**
 * Opens a pool and wraps it in Drizzle.
 *
 * Exported so the integration tests can point a handle at `TEST_DATABASE_URL`
 * without touching the shared one.
 *
 * @param {string} databaseUrl
 * @param {import('postgres').Options<{}>} [options] - Merged over the defaults.
 * @returns {DbHandle}
 */
export function createDb(databaseUrl, options) {
	const client = postgres(databaseUrl, {
		// A single-replica app behind one ingress; ten connections is plenty and keeps
		// a restart loop from exhausting Postgres' 100 default slots.
		max: 10,
		// NOTICEs (`relation already exists`, …) are not this app's log lines.
		onnotice: () => {},
		...options
	});
	return { client, db: drizzle(client, { schema }) };
}

/** @type {DbHandle | undefined} */
let shared;

/** @returns {DbHandle} */
function handle() {
	return (shared ??= createDb(serverConfig().databaseUrl));
}

/**
 * The Drizzle instance every request handler queries through.
 *
 * @returns {DbHandle['db']}
 */
export function getDb() {
	return handle().db;
}

/**
 * The raw postgres.js client, for SQL that Drizzle has no vocabulary for
 * (advisory locks, `to_regclass`, …).
 *
 * @returns {import('postgres').Sql}
 */
export function getClient() {
	return handle().client;
}

/**
 * Closes the shared pool. Only the tests and a deliberate shutdown need this; the
 * node server lets the process exit take the sockets with it.
 *
 * @returns {Promise<void>}
 */
export async function closeDb() {
	const open = shared;
	shared = undefined;
	await open?.client.end();
}
