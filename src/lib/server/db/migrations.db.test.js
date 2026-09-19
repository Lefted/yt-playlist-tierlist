/**
 * Integration test for the migration path, against a real Postgres.
 *
 * Runs only when `TEST_DATABASE_URL` points at a database it may **wipe** — see
 * the "Running the server" section of the README for the compose one-liner. Without
 * it the suite skips, so `npm test` stays a no-dependency command on any machine.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { buildMeta } from '../meta.js';
import {
	applyMigrations,
	countAppliedMigrations,
	countShippedMigrations,
	MIGRATION_LOCK_KEY
} from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
	console.log(
		'[db] TEST_DATABASE_URL is not set — skipping the database integration tests. ' +
			'Start deploy/docker-compose.yml and set TEST_DATABASE_URL to run them.'
	);
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb('migrations against a real database', () => {
	const client = postgres(databaseUrl ?? '', { max: 2, onnotice: () => {} });

	/** Puts the database back to "never migrated". */
	async function reset() {
		await client`drop table if exists app_meta cascade`;
		await client`drop schema if exists drizzle cascade`;
	}

	beforeEach(reset);

	afterAll(async () => {
		await client.end();
	});

	it('starts from nothing on an empty database', async () => {
		expect(await countAppliedMigrations(client)).toBe(0);
	});

	it('applies every shipped migration', async () => {
		await applyMigrations(/** @type {string} */ (databaseUrl));

		const shipped = await countShippedMigrations();
		expect(shipped).toBeGreaterThan(0);
		expect(await countAppliedMigrations(client)).toBe(shipped);
	});

	it('creates the table the schema describes', async () => {
		await applyMigrations(/** @type {string} */ (databaseUrl));

		await client`insert into app_meta ${client({ key: 'test', value: 'ok' })}`;
		const [row] = await client`select key, value, updated_at from app_meta where key = 'test'`;

		expect(row.value).toBe('ok');
		expect(row.updated_at).toBeInstanceOf(Date);
	});

	it('is a no-op the second time and leaves the data alone', async () => {
		await applyMigrations(/** @type {string} */ (databaseUrl));
		await client`insert into app_meta ${client({ key: 'kept', value: 'across boots' })}`;

		await applyMigrations(/** @type {string} */ (databaseUrl));

		expect(await countAppliedMigrations(client)).toBe(await countShippedMigrations());
		const [row] = await client`select value from app_meta where key = 'kept'`;
		expect(row.value).toBe('across boots');
	});

	it('serialises two boots racing for the same empty database', async () => {
		await Promise.all([
			applyMigrations(/** @type {string} */ (databaseUrl)),
			applyMigrations(/** @type {string} */ (databaseUrl))
		]);

		expect(await countAppliedMigrations(client)).toBe(await countShippedMigrations());
	});

	it('releases the advisory lock, so the next boot is not stuck behind it', async () => {
		await applyMigrations(/** @type {string} */ (databaseUrl));

		const [lock] = await client`
			select count(*)::int as count from pg_locks
			where locktype = 'advisory' and objid = ${MIGRATION_LOCK_KEY}
		`;
		expect(lock.count).toBe(0);
	});

	it('reports agreeing schema versions to /api/v1/meta once migrated', async () => {
		await applyMigrations(/** @type {string} */ (databaseUrl));

		const meta = buildMeta({
			dbSchemaVersion: await countAppliedMigrations(client),
			binarySchemaVersion: await countShippedMigrations()
		});

		expect(meta.dbSchemaVersion).toBe(meta.binarySchemaVersion);
		expect(meta.dbSchemaVersion).toBeGreaterThan(0);
	});
});
