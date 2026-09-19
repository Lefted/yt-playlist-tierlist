/**
 * Support for the `*.db.test.js` suites. Imported by tests only — nothing the server
 * serves reaches this file.
 *
 * Every one of those suites wipes the database it is given, and Vitest runs test
 * files in parallel, so two of them against one Postgres would tear each other's
 * schema down mid-assertion. They take an advisory lock instead: whoever gets there
 * first runs, the others wait. It is the same mechanism `migrations.js` uses to keep
 * two booting replicas from racing, which is fitting — it is the same race.
 */

/**
 * Lock id the `*.db.test.js` suites queue on.
 *
 * Deliberately *not* {@link import('./migrations.js').MIGRATION_LOCK_KEY}: a suite
 * holds this one for its whole run and still expects `applyMigrations` to take the
 * migration lock inside it.
 */
const DB_TEST_LOCK_KEY = 411_500_216;

/**
 * How long a suite may wait for its turn, as the `beforeAll` timeout.
 *
 * Vitest's default is ten seconds, which is *less* than a suite that hashes a few
 * Argon2 passwords takes to run — so the waiting suite would be failed for doing
 * exactly what it was told to do. Two minutes is longer than every `*.db.test.js`
 * suite put together and still fails rather than hanging if a lock is ever leaked.
 */
export const DB_LOCK_TIMEOUT_MS = 120_000;

/**
 * Runs a `*.db.test.js` suite with the test database to itself.
 *
 * Call it from `beforeAll` and call the returned function from `afterAll`. The lock
 * is session-scoped, so it needs a connection of its own held for the duration —
 * `reserve()` takes one out of the pool and gives it back on release.
 *
 * @param {import('postgres').Sql} client
 * @returns {Promise<() => Promise<void>>} Releases the lock and the connection.
 */
export async function claimTestDatabase(client) {
	const connection = await client.reserve();
	await connection`select pg_advisory_lock(${DB_TEST_LOCK_KEY})`;

	return async () => {
		await connection`select pg_advisory_unlock(${DB_TEST_LOCK_KEY})`;
		connection.release();
	};
}
