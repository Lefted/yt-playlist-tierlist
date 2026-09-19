import { describe, expect, it } from 'vitest';
import { ConfigError, readConfig } from './config.js';

/** The smallest environment that is allowed to boot. */
const MINIMAL = { DATABASE_URL: 'postgres://amv:amv@localhost:5432/amv' };

/** The same, plus everything production insists on. */
const PRODUCTION = {
	...MINIMAL,
	NODE_ENV: 'production',
	YOUTUBE_API_KEY: 'AIza-test',
	ORIGIN: 'https://amv.lefted.dev'
};

/**
 * @param {Record<string, string | undefined>} source
 * @returns {string[]}
 */
function problems(source) {
	try {
		readConfig(source);
	} catch (error) {
		if (error instanceof ConfigError) return error.problems;
		throw error;
	}
	return [];
}

describe('readConfig', () => {
	it('accepts a development environment with nothing but a database', () => {
		const config = readConfig(MINIMAL);

		expect(config.databaseUrl).toBe(MINIMAL.DATABASE_URL);
		expect(config.youtubeApiKey).toBeNull();
		expect(config.port).toBe(3000);
		expect(config.isProduction).toBe(false);
	});

	it('falls back to `unknown` provenance outside a container build', () => {
		const config = readConfig(MINIMAL);

		expect(config.gitSha).toBe('unknown');
		expect(config.buildTime).toBe('unknown');
	});

	it('takes the provenance the image build injected', () => {
		const config = readConfig({
			...MINIMAL,
			GIT_SHA: 'abc1234',
			BUILD_TIME: '2026-09-19T10:00:00Z'
		});

		expect(config.gitSha).toBe('abc1234');
		expect(config.buildTime).toBe('2026-09-19T10:00:00Z');
	});

	it('refuses to start without a database', () => {
		expect(problems({})).toEqual([expect.stringContaining('DATABASE_URL')]);
	});

	it('treats a blank variable as an absent one', () => {
		expect(problems({ DATABASE_URL: '   ' })).toEqual([expect.stringContaining('DATABASE_URL')]);
		expect(readConfig({ ...MINIMAL, YOUTUBE_API_KEY: '' }).youtubeApiKey).toBeNull();
	});

	it('rejects a database URL that is not postgres', () => {
		expect(problems({ DATABASE_URL: 'mysql://amv@localhost/amv' })).toEqual([
			expect.stringContaining('postgres://')
		]);
		expect(problems({ DATABASE_URL: 'localhost:5432' })).toHaveLength(1);
	});

	it('accepts both postgres:// and postgresql://', () => {
		expect(problems({ DATABASE_URL: 'postgresql://amv:amv@amv-db:5432/amv' })).toEqual([]);
	});

	it('reports every problem at once instead of one per restart', () => {
		const found = problems({ NODE_ENV: 'production', PORT: 'http' });

		expect(found).toHaveLength(4);
		expect(found.join(' ')).toMatch(/DATABASE_URL/);
		expect(found.join(' ')).toMatch(/YOUTUBE_API_KEY/);
		expect(found.join(' ')).toMatch(/ORIGIN/);
		expect(found.join(' ')).toMatch(/PORT/);
	});

	describe('production', () => {
		it('accepts a complete production environment', () => {
			const config = readConfig(PRODUCTION);

			expect(config.isProduction).toBe(true);
			expect(config.origin).toBe('https://amv.lefted.dev');
			expect(config.youtubeApiKey).toBe('AIza-test');
		});

		it('requires the YouTube key, which development may go without', () => {
			expect(problems({ ...PRODUCTION, YOUTUBE_API_KEY: undefined })).toEqual([
				expect.stringContaining('YOUTUBE_API_KEY')
			]);
			expect(problems({ ...MINIMAL, YOUTUBE_API_KEY: undefined })).toEqual([]);
		});

		it('requires an origin, because form posts are rejected without one', () => {
			expect(problems({ ...PRODUCTION, ORIGIN: undefined })).toEqual([
				expect.stringContaining('ORIGIN')
			]);
		});
	});

	describe('ORIGIN', () => {
		it('rejects anything that is not a bare http(s) origin', () => {
			for (const origin of [
				'amv.lefted.dev',
				'https://amv.lefted.dev/',
				'https://amv.lefted.dev/app'
			]) {
				expect(problems({ ...MINIMAL, ORIGIN: origin })).toEqual([
					expect.stringContaining('ORIGIN')
				]);
			}
		});

		it('accepts a host with a port, as used in local runs', () => {
			expect(problems({ ...MINIMAL, ORIGIN: 'http://localhost:3000' })).toEqual([]);
		});
	});

	describe('the admin bootstrap pair', () => {
		it('accepts both halves together', () => {
			const config = readConfig({
				...MINIMAL,
				ADMIN_EMAIL: 'me@example.com',
				ADMIN_PASSWORD: 'hunter2'
			});

			expect(config.adminEmail).toBe('me@example.com');
			expect(config.adminPassword).toBe('hunter2');
		});

		it('rejects half of it, which would silently create no admin', () => {
			expect(problems({ ...MINIMAL, ADMIN_EMAIL: 'me@example.com' })).toEqual([
				expect.stringContaining('ADMIN_EMAIL')
			]);
			expect(problems({ ...MINIMAL, ADMIN_PASSWORD: 'hunter2' })).toHaveLength(1);
		});
	});

	describe('PORT', () => {
		it('defaults to 3000, the port the image exposes', () => {
			expect(readConfig(MINIMAL).port).toBe(3000);
		});

		it('takes a valid port', () => {
			expect(readConfig({ ...MINIMAL, PORT: '8080' }).port).toBe(8080);
		});

		it('rejects a port that is not a whole number in range', () => {
			for (const port of ['0', '70000', '-1', '80.5', 'http']) {
				expect(problems({ ...MINIMAL, PORT: port })).toEqual([expect.stringContaining('PORT')]);
			}
		});
	});
});
