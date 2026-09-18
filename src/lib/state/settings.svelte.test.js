import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_PREFIX } from '../storage.js';
import { createLocalStorageStub } from '../testing/fixtures.js';

/** @type {ReturnType<typeof createLocalStorageStub>} */
let store;

const KEY = `${STORAGE_PREFIX}settings`;

/**
 * A settings store built from scratch on top of the given storage contents.
 *
 * @param {Record<string, string>} [initial]
 * @returns {Promise<import('./settings.svelte.js')>}
 */
async function boot(initial = {}) {
	vi.resetModules();
	store = createLocalStorageStub(initial);
	vi.stubGlobal('localStorage', store);
	return await import('./settings.svelte.js');
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('defaults', () => {
	it('starts with an empty key, skipping rated videos and auto-advancing', async () => {
		const { settings } = await boot();
		expect(settings.toJSON()).toEqual({
			apiKey: '',
			skipRated: true,
			autoAdvance: true,
			fullscreenOnPlay: false,
			shortcuts: 'letters'
		});
	});
});

describe('persistence', () => {
	it('writes through on every change', async () => {
		const { settings } = await boot();
		settings.apiKey = 'AIza-test';
		settings.skipRated = false;

		expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY)))).toEqual({
			version: 1,
			apiKey: 'AIza-test',
			skipRated: false,
			autoAdvance: true,
			fullscreenOnPlay: false,
			shortcuts: 'letters'
		});
	});

	it('reads the stored settings on startup', async () => {
		const { settings } = await boot({
			[KEY]: JSON.stringify({
				version: 1,
				apiKey: 'stored',
				skipRated: false,
				autoAdvance: false,
				fullscreenOnPlay: true,
				shortcuts: 'digits'
			})
		});

		expect(settings.toJSON()).toEqual({
			apiKey: 'stored',
			skipRated: false,
			autoAdvance: false,
			fullscreenOnPlay: true,
			shortcuts: 'digits'
		});
	});

	it('falls back to the defaults for corrupted storage', async () => {
		const { settings } = await boot({ [KEY]: 'not json' });
		expect(settings.skipRated).toBe(true);
	});

	it('ignores stored values of the wrong type', async () => {
		const { settings } = await boot({
			[KEY]: JSON.stringify({ apiKey: 42, skipRated: 'nope', extra: true })
		});
		expect(settings.apiKey).toBe('');
		expect(settings.skipRated).toBe(true);
	});
});

describe('coercion', () => {
	it('trims the API key', async () => {
		const { settings } = await boot();
		settings.apiKey = '  AIza-test  ';
		expect(settings.apiKey).toBe('AIza-test');
	});

	it('coerces the flags to booleans', async () => {
		const { settings } = await boot();
		settings.autoAdvance = /** @type {any} */ (0);
		expect(settings.autoAdvance).toBe(false);
	});
});

describe('shortcut mode', () => {
	it('starts on the letter keys', async () => {
		const { settings } = await boot();
		expect(settings.shortcuts).toBe('letters');
	});

	it('takes the three modes and persists them', async () => {
		const { settings } = await boot();
		for (const mode of ['digits', 'off', 'letters']) {
			settings.shortcuts = /** @type {any} */ (mode);
			expect(settings.shortcuts).toBe(mode);
			expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY))).shortcuts).toBe(mode);
		}
	});

	it('falls back to letters for anything else, stored or assigned', async () => {
		const { settings } = await boot({ [KEY]: JSON.stringify({ shortcuts: 'emoji' }) });
		expect(settings.shortcuts).toBe('letters');

		settings.shortcuts = /** @type {any} */ (null);
		expect(settings.shortcuts).toBe('letters');
	});
});
