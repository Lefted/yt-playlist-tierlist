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
 * Exported because two callers need a handle that is *not* the shared one: the
 * migration step, which has to keep its advisory lock and its DDL on a single
 * connection, and the integration tests, which point at `TEST_DATABASE_URL`.
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
 * The Drizzle instance request handlers query through — #16's users and sessions
 * and #17's library are its first callers; this ticket has no table to read.
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
