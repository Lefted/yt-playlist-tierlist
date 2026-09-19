import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { countShippedMigrations, MIGRATION_LOCK_KEY } from './migrations.js';

describe('countShippedMigrations', () => {
	it('counts the migrations this checkout ships', async () => {
		// Zero would mean `/api/v1/meta` reports binarySchemaVersion 0 and
		// `scripts/deploy.sh` refuses to deploy at all.
		expect(await countShippedMigrations()).toBeGreaterThan(0);
	});

	it('agrees with the NNNN_*.sql files scripts/deploy.sh counts', async () => {
		// The app reads the journal, the deploy script reads the directory: two
		// definitions of the same number, and the gate the script builds on them is
		// only as good as their agreement. A generated migration always has both, so
		// a difference here means someone edited one half by hand.
		const files = (await readdir('drizzle')).filter((name) => /^\d+_.*\.sql$/.test(name));

		expect(await countShippedMigrations()).toBe(files.length);
	});
});

describe('MIGRATION_LOCK_KEY', () => {
	it('fits in an int4, so pg_advisory_lock takes it without a cast', () => {
		expect(Number.isInteger(MIGRATION_LOCK_KEY)).toBe(true);
		expect(MIGRATION_LOCK_KEY).toBeGreaterThan(0);
		expect(MIGRATION_LOCK_KEY).toBeLessThan(2 ** 31);
	});
});
