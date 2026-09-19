import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEYBINDINGS, normalizeKeybindings } from '../keybindings.js';
import { STORAGE_PREFIX } from '../storage.js';
import { createLocalStorageStub } from '../testing/fixtures.js';

/** The defaults as a plain, comparable table. */
const DEFAULT_KEYS = normalizeKeybindings(DEFAULT_KEYBINDINGS);

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
			shortcuts: true,
			keybindings: DEFAULT_KEYS,
			loop: false
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
			shortcuts: true,
			keybindings: DEFAULT_KEYS,
			loop: false
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
				shortcuts: false,
				keybindings: { ...DEFAULT_KEYS, rateS: ['q'] },
				loop: true
			})
		});

		expect(settings.toJSON()).toEqual({
			apiKey: 'stored',
			skipRated: false,
			autoAdvance: false,
			fullscreenOnPlay: true,
			shortcuts: false,
			keybindings: { ...DEFAULT_KEYS, rateS: ['q'] },
			loop: true
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

describe('loop', () => {
	it('is off by default and persists once switched on', async () => {
		const { settings } = await boot();
		expect(settings.loop).toBe(false);

		settings.loop = true;
		expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY))).loop).toBe(true);
	});

	it('coerces to a boolean', async () => {
		const { settings } = await boot();
		settings.loop = /** @type {any} */ ('yes');
		expect(settings.loop).toBe(true);
	});
});

describe('shortcuts', () => {
	it('starts on', async () => {
		const { settings } = await boot();
		expect(settings.shortcuts).toBe(true);
	});

	it('persists being switched off', async () => {
		const { settings } = await boot();
		settings.shortcuts = false;
		expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY))).shortcuts).toBe(false);
	});

	it('falls back to on for anything that is not a boolean', async () => {
		// An older install stored the short-lived mode enum here.
		const { settings } = await boot({ [KEY]: JSON.stringify({ shortcuts: 'letters' }) });
		expect(settings.shortcuts).toBe(true);
	});
});

describe('keybindings', () => {
	it('starts on the defaults', async () => {
		const { settings } = await boot();
		expect(settings.keybindings).toEqual(DEFAULT_KEYS);
	});

	it('persists a rebinding', async () => {
		const { settings } = await boot();
		settings.keybindings = { ...DEFAULT_KEYS, rateS: ['k'] };

		expect(settings.keybindings.rateS).toEqual(['k']);
		expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY))).keybindings.rateS).toEqual([
			'k'
		]);
	});

	it('canonicalises what it is given', async () => {
		const { settings } = await boot();
		settings.keybindings = { ...DEFAULT_KEYS, rateS: ['SHIFT+Q'] };
		expect(settings.keybindings.rateS).toEqual(['Shift+q']);
	});

	it('keeps the stored table but fills a missing action from the defaults', async () => {
		const { settings } = await boot({
			[KEY]: JSON.stringify({ keybindings: { rateS: ['q'] } })
		});
		expect(settings.keybindings.rateS).toEqual(['q']);
		expect(settings.keybindings.undo).toEqual(DEFAULT_KEYS.undo);
	});

	it('drops an unknown action and a malformed chord', async () => {
		const { settings } = await boot({
			[KEY]: JSON.stringify({
				keybindings: { rateS: ['q', 'Nope+z'], somethingElse: ['x'] }
			})
		});
		expect(settings.keybindings.rateS).toEqual(['q']);
		expect(settings.keybindings.somethingElse).toBeUndefined();
	});

	it('falls back to the defaults for a table of the wrong type', async () => {
		const { settings } = await boot({ [KEY]: JSON.stringify({ keybindings: 'letters' }) });
		expect(settings.keybindings).toEqual(DEFAULT_KEYS);
	});

	it('hands out a table nobody can write through', async () => {
		const { settings } = await boot();
		const snapshot = settings.toJSON();
		snapshot.keybindings.rateS.push('q');
		expect(settings.keybindings.rateS).toEqual(['s']);
	});
});
