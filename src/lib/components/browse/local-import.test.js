import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	hasLocalLibrary,
	importLocalLibrary,
	LOCAL_LIBRARY_KEY,
	localLibrary,
	markLocalLibraryMigrated,
	MIGRATED_LIBRARY_KEY,
	shouldOfferLocalImport
} from './local-import.js';
import {
	createLocalStorageStub,
	libraryPayload,
	makePlaylist,
	makeVideo,
	stubApi
} from '$lib/testing/fixtures.js';
import { STORAGE_PREFIX } from '$lib/storage.js';
import { library } from '$lib/state/library.svelte.js';

vi.mock('$lib/notify.js', () => ({ notifyError: vi.fn() }));

const KEY = `${STORAGE_PREFIX}${LOCAL_LIBRARY_KEY}`;
const MIGRATED = `${STORAGE_PREFIX}${MIGRATED_LIBRARY_KEY}`;

/** @type {ReturnType<typeof createLocalStorageStub>} */
let store;

/**
 * @param {Record<string, string>} [initial]
 * @returns {void}
 */
function withStorage(initial = {}) {
	store = createLocalStorageStub(initial);
	vi.stubGlobal('localStorage', store);
}

/** The payload a browser from before accounts would be carrying. */
const STORED = JSON.stringify({
	version: 1,
	activePlaylistId: 'PL1',
	playlists: [makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1', rating: 'S' })] })]
});

beforeEach(() => {
	library.clear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('localLibrary', () => {
	it('finds a stored library', () => {
		withStorage({ [KEY]: STORED });
		expect(hasLocalLibrary()).toBe(true);
		expect(/** @type {any} */ (localLibrary()).playlists).toHaveLength(1);
	});

	it('ignores nothing, rubbish and an empty library alike', () => {
		withStorage();
		expect(hasLocalLibrary()).toBe(false);

		withStorage({ [KEY]: 'not json' });
		expect(hasLocalLibrary()).toBe(false);

		withStorage({ [KEY]: '{"playlists":"nope"}' });
		expect(hasLocalLibrary()).toBe(false);

		withStorage({ [KEY]: '{"playlists":[]}' });
		expect(hasLocalLibrary()).toBe(false);
	});
});

describe('shouldOfferLocalImport', () => {
	const base = { hasLocal: true, loading: false, error: null, playlistCount: 0 };

	it('offers when this browser has one and the account has none', () => {
		expect(shouldOfferLocalImport(base)).toBe(true);
	});

	it('says nothing when there is nothing to offer', () => {
		expect(shouldOfferLocalImport({ ...base, hasLocal: false })).toBe(false);
	});

	it('waits until the library has actually been read', () => {
		expect(shouldOfferLocalImport({ ...base, loading: true })).toBe(false);
		expect(shouldOfferLocalImport({ ...base, error: 'The database is unreachable.' })).toBe(false);
	});

	it('leaves an account that already has playlists alone', () => {
		expect(shouldOfferLocalImport({ ...base, playlistCount: 1 })).toBe(false);
	});
});

describe('importLocalLibrary', () => {
	it('posts the stored payload and renames the key afterwards', async () => {
		withStorage({ [KEY]: STORED });
		const { calls } = stubApi({
			'POST /library/import-json': {
				summary: { playlists: 1, videos: 1, ratingsApplied: 1 },
				library: libraryPayload([
					makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1', rating: 'S' })] })
				])
			}
		});

		const notice = await importLocalLibrary();

		expect(notice.tone).toBe('ok');
		expect(notice.text).toContain('1 video(s)');
		expect(calls[0].body).toMatchObject({ playlists: expect.any(Array) });
		expect(store.entries.has(KEY)).toBe(false);
		expect(JSON.parse(/** @type {string} */ (store.entries.get(MIGRATED)))).toMatchObject({
			playlists: expect.any(Array)
		});
		expect(library.playlists).toHaveLength(1);
	});

	it('leaves the key where it is when the import fails', async () => {
		withStorage({ [KEY]: STORED });
		stubApi({
			'POST /library/import-json': {
				status: 503,
				body: { error: { code: 'db_unavailable', message: 'The database is unreachable.' } }
			}
		});

		const notice = await importLocalLibrary();

		expect(notice.tone).toBe('error');
		expect(notice.text).toBe('The database is unreachable.');
		expect(store.entries.has(KEY)).toBe(true);
		expect(store.entries.has(MIGRATED)).toBe(false);
	});

	it('says so when there is nothing stored', async () => {
		withStorage();
		const notice = await importLocalLibrary();
		expect(notice.tone).toBe('error');
		expect(notice.text).toMatch(/no stored tier list/i);
	});
});

describe('markLocalLibraryMigrated', () => {
	it('copies before it removes', () => {
		withStorage({ [KEY]: STORED });
		expect(markLocalLibraryMigrated()).toBe(true);
		expect(store.entries.get(MIGRATED)).toBe(JSON.stringify(JSON.parse(STORED)));
		expect(store.entries.has(KEY)).toBe(false);
	});

	it('does nothing when there is nothing to move', () => {
		withStorage();
		expect(markLocalLibraryMigrated()).toBe(false);
		expect(store.entries.has(MIGRATED)).toBe(false);
	});
});
