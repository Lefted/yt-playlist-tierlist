import { describe, expect, it } from 'vitest';
import { buildMeta, STARTED_AT } from './meta.js';

const FULL = {
	commit: 'abc1234',
	buildTime: '2026-09-19T10:00:00.000Z',
	startedAt: '2026-09-19T10:05:00.000Z',
	dbSchemaVersion: 1,
	binarySchemaVersion: 1
};

describe('buildMeta', () => {
	it('carries exactly the five fields the deploy contract names', () => {
		expect(buildMeta(FULL)).toEqual(FULL);
		expect(Object.keys(buildMeta(FULL)).sort()).toEqual([
			'binarySchemaVersion',
			'buildTime',
			'commit',
			'dbSchemaVersion',
			'startedAt'
		]);
	});

	it('reports `unknown` provenance rather than null for a checkout-run build', () => {
		const meta = buildMeta({ dbSchemaVersion: 1, binarySchemaVersion: 1 });

		expect(meta.commit).toBe('unknown');
		expect(meta.buildTime).toBe('unknown');
	});

	it('treats a blank build argument as absent', () => {
		expect(buildMeta({ ...FULL, commit: '   ' }).commit).toBe('unknown');
	});

	it('falls back to this process’ start time', () => {
		const meta = buildMeta({ dbSchemaVersion: 0, binarySchemaVersion: 0 });

		expect(meta.startedAt).toBe(STARTED_AT);
		expect(Number.isNaN(Date.parse(meta.startedAt))).toBe(false);
	});

	it('reports a missing or nonsensical version as 0, never as null', () => {
		const meta = buildMeta({ dbSchemaVersion: undefined, binarySchemaVersion: -3 });

		expect(meta.dbSchemaVersion).toBe(0);
		expect(meta.binarySchemaVersion).toBe(0);
	});

	it('keeps a schema drift visible instead of smoothing it over', () => {
		const meta = buildMeta({ ...FULL, dbSchemaVersion: 1, binarySchemaVersion: 2 });

		expect(meta.dbSchemaVersion).toBe(1);
		expect(meta.binarySchemaVersion).toBe(2);
	});

	it('serialises to JSON without losing a field', () => {
		expect(JSON.parse(JSON.stringify(buildMeta(FULL)))).toEqual(FULL);
	});
});
