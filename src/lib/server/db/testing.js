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
 * Take the test database back to nothing at all: no tables, no enums, no migration
 * bookkeeping.
 *
 * Every `*.db.test.js` suite starts from here and then applies the migrations, which
 * is what makes each of them independent of whichever ran before it.
 *
 * @param {import('postgres').Sql} client
 * @returns {Promise<void>}
 */
export async function emptyTestDatabase(client) {
	// Enumerated rather than listed: a hand-kept `drop table a, b, c` is one migration
	// away from leaving a table behind, and the next `applyMigrations` then fails with
	// "relation already exists" in whichever suite happens to run second. That is
	// exactly how #17's three new tables broke #15's and #16's suites.
	await client.unsafe(`
		do $$
		declare name text;
		begin
			for name in select tablename from pg_tables where schemaname = 'public' loop
				execute format('drop table if exists public.%I cascade', name);
			end loop;
			for name in
				select t.typname
				from pg_type t
				join pg_namespace n on n.oid = t.typnamespace
				where n.nspname = 'public' and t.typtype = 'e'
			loop
				execute format('drop type if exists public.%I cascade', name);
			end loop;
		end $$;
	`);
	// Drizzle's own bookkeeping, which lives outside `public` and would otherwise
	// claim every migration had already been applied.
	await client`drop schema if exists drizzle cascade`;
}

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
