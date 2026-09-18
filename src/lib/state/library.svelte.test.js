import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_PREFIX } from '../storage.js';
import {
	createLocalStorageStub,
	makePlaylist,
	makeVideo,
	storedLibrary
} from '../testing/fixtures.js';

/** @typedef {import('./library.svelte.js')} LibraryModule */

const KEY = `${STORAGE_PREFIX}library`;

/** @type {ReturnType<typeof createLocalStorageStub>} */
let store;

/**
 * A library built from scratch on top of the given storage contents.
 *
 * @param {Record<string, string>} [initial]
 * @returns {Promise<LibraryModule>}
 */
async function boot(initial = {}) {
	vi.resetModules();
	store = createLocalStorageStub(initial);
	vi.stubGlobal('localStorage', store);
	return await import('./library.svelte.js');
}

/**
 * Re-create the library from what is currently in storage — i.e. a page reload.
 * @returns {Promise<LibraryModule>}
 */
async function reload() {
	vi.resetModules();
	return await import('./library.svelte.js');
}

/**
 * `fetch` answering one playlist-meta call, one page of items and one duration call.
 *
 * @param {string[]} videoIds
 * @param {{ title?: string }} [options]
 * @returns {import('vitest').Mock}
 */
function mockPlaylistFetch(videoIds, options = {}) {
	/** @type {any[]} */
	const responses = [
		{
			items: [
				{
					id: 'PL1',
					snippet: { title: options.title ?? 'AMVs', description: '', channelTitle: 'Me' },
					contentDetails: { itemCount: videoIds.length }
				}
			]
		},
		{
			items: videoIds.map((id, index) => ({
				id: `item-${id}`,
				snippet: {
					title: `Title ${id}`,
					position: index,
					resourceId: { videoId: id },
					thumbnails: { high: { url: `${id}.jpg` } }
				},
				contentDetails: { videoPublishedAt: '2024-01-01T00:00:00Z' }
			}))
		},
		{ items: videoIds.map((id) => ({ id, contentDetails: { duration: 'PT1M' } })) }
	];

	const fetch = vi.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => responses.shift() ?? { items: [] }
	}));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('importPlaylist', () => {
	it('imports a playlist, makes it active and persists it', async () => {
		const { library } = await boot();
		mockPlaylistFetch(['v1', 'v2']);

		const playlist = await library.importPlaylist('KEY', 'https://youtube.com/playlist?list=PL1');

		expect(library.playlists).toHaveLength(1);
		expect(library.activePlaylistId).toBe('PL1');
		expect(library.activePlaylist?.title).toBe('AMVs');
		expect(playlist.videos.map((video) => video.id)).toEqual(['v1', 'v2']);
		expect(playlist.videos[0].durationSeconds).toBe(60);
		expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY))).playlists).toHaveLength(1);
	});

	it('rejects an unusable input before calling the API', async () => {
		const { library } = await boot();
		const fetch = mockPlaylistFetch([]);

		await expect(library.importPlaylist('KEY', 'not a playlist')).rejects.toMatchObject({
			reason: 'playlistNotFound'
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects a missing API key', async () => {
		const { library } = await boot();
		await expect(library.importPlaylist('  ', 'PL1')).rejects.toMatchObject({
			reason: 'keyInvalid'
		});
	});

	it('merges a re-import: ratings survive, new videos arrive, gone videos stay as unavailable', async () => {
		const { library } = await boot();
		mockPlaylistFetch(['v1', 'v2', 'v3']);
		await library.importPlaylist('KEY', 'PL1');
		const importedAt = /** @type {string} */ (library.activePlaylist?.importedAt);

		library.rate('v1', 'S');
		library.rate('v2', 'C');

		mockPlaylistFetch(['v1', 'v3', 'v4'], { title: 'AMVs (renamed)' });
		await library.importPlaylist('KEY', 'PL1');

		const playlist = /** @type {any} */ (library.activePlaylist);
		expect(library.playlists).toHaveLength(1);
		expect(playlist.title).toBe('AMVs (renamed)');
		expect(playlist.importedAt).toBe(importedAt);
		expect(playlist.videos.map((/** @type {any} */ v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
		expect(playlist.videos.map((/** @type {any} */ v) => v.rating)).toEqual(['S', 'C', null, null]);
		expect(playlist.videos.map((/** @type {any} */ v) => v.unavailable)).toEqual([
			false,
			true,
			false,
			false
		]);
		expect(playlist.order).toEqual(['v1', 'v2', 'v3', 'v4']);
	});
});

describe('ratings and stats', () => {
	/** @returns {Promise<LibraryModule>} */
	async function bootWithPlaylist() {
		return await boot(
			storedLibrary([
				makePlaylist({
					id: 'PL1',
					videos: [
						makeVideo({ id: 'v1', position: 0 }),
						makeVideo({ id: 'v2', position: 1, rating: 'S' }),
						makeVideo({ id: 'v3', position: 2, unavailable: true }),
						makeVideo({ id: 'v4', position: 3, rating: 'F' })
					]
				})
			])
		);
	}

	it('counts per tier, rated, unrated and available videos', async () => {
		const { library } = await bootWithPlaylist();

		expect(library.counts).toEqual({ S: 1, A: 0, B: 0, C: 0, D: 0, F: 1 });
		expect(library.availableCount).toBe(3);
		expect(library.ratedCount).toBe(2);
		expect(library.unratedCount).toBe(1);
	});

	it('rates, clears a rating and persists', async () => {
		const { library } = await bootWithPlaylist();

		expect(library.rate('v1', 'B')).toBe(true);
		expect(library.counts.B).toBe(1);
		expect(library.rate('v1', null)).toBe(true);
		expect(library.counts.B).toBe(0);
		expect(library.rate('nope', 'B')).toBe(false);

		const stored = JSON.parse(/** @type {string} */ (store.entries.get(KEY)));
		expect(stored.playlists[0].videos[1].rating).toBe('S');
	});

	it('refuses a value that is not a tier', async () => {
		const { library } = await bootWithPlaylist();
		expect(() => library.rate('v1', /** @type {any} */ ('X'))).toThrow(TypeError);
	});

	it('marks a video as unavailable without touching its rating', async () => {
		const { library } = await bootWithPlaylist();

		expect(library.markUnavailable('v2')).toBe(true);
		expect(library.activePlaylist?.videos[1]).toMatchObject({ rating: 'S', unavailable: true });
		expect(library.availableCount).toBe(2);
		expect(library.markUnavailable('nope')).toBe(false);
	});
});

describe('order', () => {
	/** @returns {Promise<LibraryModule>} */
	async function bootWithPlaylist() {
		return await boot(
			storedLibrary([
				makePlaylist({
					id: 'PL1',
					videos: [
						makeVideo({ id: 'v1', position: 0 }),
						makeVideo({ id: 'v2', position: 1 }),
						makeVideo({ id: 'v3', position: 2 })
					]
				})
			])
		);
	}

	it('shuffles in place and survives a reload', async () => {
		const { library } = await bootWithPlaylist();

		// Fisher-Yates with a random() that always picks index 0.
		expect(library.shuffle(() => 0)).toBe(true);
		expect(library.activePlaylist?.order).toEqual(['v2', 'v3', 'v1']);
		expect(library.activeVideos.map((video) => video.id)).toEqual(['v2', 'v3', 'v1']);

		const reloaded = await reload();
		expect(reloaded.library.activeVideos.map((video) => video.id)).toEqual(['v2', 'v3', 'v1']);
	});

	it('restores the playlist order', async () => {
		const { library } = await bootWithPlaylist();
		library.shuffle(() => 0);

		expect(library.resetOrder()).toBe(true);
		expect(library.activeVideos.map((video) => video.id)).toEqual(['v1', 'v2', 'v3']);
	});

	it('does nothing without an active playlist', async () => {
		const { library } = await boot();
		expect(library.shuffle()).toBe(false);
		expect(library.resetOrder()).toBe(false);
	});
});

describe('selection', () => {
	it('activates and removes playlists', async () => {
		const { library } = await boot(
			storedLibrary([
				makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1' })] }),
				makePlaylist({ id: 'PL2', videos: [makeVideo({ id: 'v2' })] })
			])
		);

		expect(library.activePlaylistId).toBe('PL1');
		expect(library.setActive('PL2')).toBe(true);
		expect(library.activePlaylist?.id).toBe('PL2');
		expect(library.setActive('nope')).toBe(false);

		expect(library.removePlaylist('PL2')).toBe(true);
		expect(library.playlists).toHaveLength(1);
		expect(library.activePlaylistId).toBe('PL1');
		expect(library.removePlaylist('PL2')).toBe(false);

		expect(library.setActive(null)).toBe(true);
		expect(library.activePlaylist).toBeNull();
		expect(library.activeVideos).toEqual([]);
	});

	it('clears everything', async () => {
		const { library } = await boot(
			storedLibrary([makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1' })] })])
		);

		library.clear();
		expect(library.playlists).toEqual([]);
		expect(library.activePlaylistId).toBeNull();
		expect(JSON.parse(/** @type {string} */ (store.entries.get(KEY))).playlists).toEqual([]);
	});
});

describe('hydration', () => {
	it('ignores an unusable stored shape', async () => {
		const { library } = await boot({ [KEY]: '{"playlists": "nope"}' });
		expect(library.playlists).toEqual([]);
	});

	it('drops playlist entries without an id or videos', async () => {
		const { library } = await boot({
			[KEY]: JSON.stringify({
				version: 1,
				activePlaylistId: 'gone',
				playlists: [{ id: '', videos: [] }, { id: 'PL1', videos: [{ id: 'v1' }] }, { id: 'PL2' }]
			})
		});

		expect(library.playlists.map((playlist) => playlist.id)).toEqual(['PL1']);
		// The stored active id no longer exists, so the first playlist takes over.
		expect(library.activePlaylistId).toBe('PL1');
	});

	it('translates the legacy "unavailable" rating into the flag', async () => {
		const { library } = await boot({
			[KEY]: JSON.stringify({
				version: 1,
				playlists: [{ id: 'PL1', videos: [{ id: 'v1', rating: 'unavailable' }] }]
			})
		});

		expect(library.activePlaylist?.videos[0]).toMatchObject({ rating: null, unavailable: true });
	});
});

describe('exportJson / importJson', () => {
	it('round-trips the library into an empty one', async () => {
		const source = await boot(
			storedLibrary([
				makePlaylist({
					id: 'PL1',
					videos: [makeVideo({ id: 'v1', rating: 'A' }), makeVideo({ id: 'v2', position: 1 })]
				})
			])
		);
		const json = source.library.exportJson();
		expect(JSON.parse(json)).toMatchObject({ version: 1, playlists: expect.any(Array) });

		const target = await boot();
		const summary = target.library.importJson(json);

		expect(summary).toEqual({ playlists: 1, videos: 2, ratingsApplied: 1 });
		expect(target.library.activePlaylistId).toBe('PL1');
		expect(target.library.activeVideos.map((video) => video.rating)).toEqual(['A', null]);
	});

	it('keeps local ratings when merging an import', async () => {
		const { library } = await boot(
			storedLibrary([makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1', rating: 'S' })] })])
		);

		library.importJson(
			JSON.stringify({
				version: 1,
				playlists: [{ id: 'PL1', videos: [{ id: 'v1', rating: 'F' }, { id: 'v2' }] }]
			})
		);

		expect(library.activeVideos.map((video) => video.id)).toEqual(['v1', 'v2']);
		expect(library.activeVideos[0].rating).toBe('S');
	});

	it('rejects invalid JSON and unknown shapes', async () => {
		const { library } = await boot();

		expect(() => library.importJson('{not json')).toThrow(/valid JSON/);
		expect(() => library.importJson('{"foo": 1}')).toThrow(/Unrecognised export/);
		expect(() => library.importJson('{"playlists": [{"title": "no id"}]}')).toThrow(
			/Unrecognised export/
		);
		expect(() => library.importJson('[]')).toThrow(/Unrecognised export/);
	});

	it('applies a legacy export to matching videos and keeps the rest', async () => {
		const { library, LEGACY_PLAYLIST_ID } = await boot(
			storedLibrary([
				makePlaylist({
					id: 'PL1',
					videos: [
						makeVideo({ id: 'v1', position: 0 }),
						makeVideo({ id: 'v2', position: 1 }),
						makeVideo({ id: 'v3', position: 2, rating: 'S' })
					]
				})
			])
		);

		const summary = library.importJson(
			JSON.stringify([
				{ videoId: 'v1', title: 'one', rating: 'A' },
				{ videoId: 'v2', title: 'two', rating: 'unavailable' },
				{ videoId: 'v3', title: 'three', rating: 'F' },
				{ videoId: 'v9', title: 'nine', rating: 'B' }
			])
		);

		const playlist = /** @type {any} */ (library.playlists.find((p) => p.id === 'PL1'));
		expect(playlist.videos[0].rating).toBe('A');
		expect(playlist.videos[1]).toMatchObject({ rating: null, unavailable: true });
		// A local rating is never overwritten by an import.
		expect(playlist.videos[2].rating).toBe('S');

		const legacy = /** @type {any} */ (library.playlists.find((p) => p.id === LEGACY_PLAYLIST_ID));
		expect(legacy.videos).toHaveLength(1);
		expect(legacy.videos[0]).toMatchObject({ id: 'v9', title: 'nine', rating: 'B' });
		expect(summary).toEqual({ playlists: 2, videos: 4, ratingsApplied: 2 });
	});

	it('rejects a legacy array without video ids', async () => {
		const { library } = await boot();
		expect(() => library.importJson('[{"title": "no id"}]')).toThrow(/Unrecognised export/);
	});
});
