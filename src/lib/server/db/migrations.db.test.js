/**
 * Integration test for the migration path, against a real Postgres.
 *
 * Runs only when `TEST_DATABASE_URL` points at a database it may **wipe** — see
 * the "Running the server" section of the README for the compose one-liner. Without
 * it the suite skips, so `npm test` stays a no-dependency command on any machine.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildMeta } from '../meta.js';
import { createDb } from './index.js';
import {
	applyMigrations,
	countAppliedMigrations,
	countShippedMigrations,
	MIGRATION_LOCK_KEY
} from './migrations.js';
import { appMeta } from './schema.js';
import { claimTestDatabase, DB_LOCK_TIMEOUT_MS } from './testing.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
	console.log(
		'[db] TEST_DATABASE_URL is not set — skipping the database integration tests. ' +
			'Start deploy/docker-compose.yml and set TEST_DATABASE_URL to run them.'
	);
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb('migrations against a real database', () => {
	/** A handle of its own, so nothing here touches the process-wide pool. */
	const { client, db } = createDb(databaseUrl ?? '', { max: 3 });

	/** @type {() => Promise<void>} */
	let release;

	/**
	 * Puts the database back to "never migrated" — every object any migration
	 * creates, not just this file's, because another `*.db.test.js` suite may have
	 * left the later ones behind.
	 */
	async function reset() {
		await client`drop table if exists invites, sessions, users, app_meta cascade`;
		await client`drop type if exists user_role cascade`;
		await client`drop schema if exists drizzle cascade`;
	}

	/** @returns {Promise<void>} */
	function migrateOnce() {
		return applyMigrations(/** @type {string} */ (databaseUrl));
	}

	// One suite at a time: every `*.db.test.js` file wipes this database, and Vitest
	// runs files in parallel. The generous timeout is the whole point — this hook is
	// *meant* to wait out the other suite, and Vitest's 10s default would call that
	// a failure.
	beforeAll(async () => {
		release = await claimTestDatabase(client);
	}, DB_LOCK_TIMEOUT_MS);

	beforeEach(reset);

	afterAll(async () => {
		await release();
		await client.end();
	});

	it('starts from nothing on an empty database', async () => {
		expect(await countAppliedMigrations(client)).toBe(0);
	});

	it('applies every shipped migration', async () => {
		await migrateOnce();

		const shipped = await countShippedMigrations();
		expect(shipped).toBeGreaterThan(0);
		expect(await countAppliedMigrations(client)).toBe(shipped);
	});

	it('creates the table schema.js describes, as Drizzle sees it', async () => {
		await migrateOnce();

		await db.insert(appMeta).values({ key: 'test', value: 'ok' });
		const [row] = await db.select().from(appMeta);

		expect(row.key).toBe('test');
		expect(row.value).toBe('ok');
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it('is a no-op the second time and leaves the data alone', async () => {
		await migrateOnce();
		await db.insert(appMeta).values({ key: 'kept', value: 'across boots' });

		await migrateOnce();

		expect(await countAppliedMigrations(client)).toBe(await countShippedMigrations());
		const [row] = await db.select().from(appMeta);
		expect(row.value).toBe('across boots');
	});

	it('serialises two boots racing for the same empty database', async () => {
		await Promise.all([migrateOnce(), migrateOnce()]);

		expect(await countAppliedMigrations(client)).toBe(await countShippedMigrations());
	});

	it('releases the advisory lock, so the next boot is not stuck behind it', async () => {
		await migrateOnce();

		const [lock] = await client`
			select count(*)::int as count from pg_locks
			where locktype = 'advisory' and objid = ${MIGRATION_LOCK_KEY}
		`;
		expect(lock.count).toBe(0);
	});

	it('reports agreeing schema versions to /api/v1/meta once migrated', async () => {
		await migrateOnce();

		const meta = buildMeta({
			dbSchemaVersion: await countAppliedMigrations(client),
			binarySchemaVersion: await countShippedMigrations()
		});

		expect(meta.dbSchemaVersion).toBe(meta.binarySchemaVersion);
		expect(meta.dbSchemaVersion).toBeGreaterThan(0);
	});
});
