import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryPayload, makePlaylist, makeVideo, stubApi } from '../testing/fixtures.js';

/** The library announces a rolled-back write; the toaster is not this suite's business. */
const notifyError = vi.hoisted(() => vi.fn());
vi.mock('../notify.js', () => ({ notifyError }));

/** @typedef {import('./library.svelte.js')} LibraryModule */
/** @typedef {import('../types.js').Playlist} Playlist */

/** Whoever is signed in; only its identity matters. */
const USER = 'user-1';

/**
 * A playlist with three videos, one of them already rated.
 * @returns {Playlist}
 */
function seedPlaylist() {
	return makePlaylist({
		id: 'PL1',
		videos: [
			makeVideo({ id: 'v1', position: 0 }),
			makeVideo({ id: 'v2', position: 1, rating: 'S' }),
			makeVideo({ id: 'v3', position: 2 })
		]
	});
}

/**
 * A fresh library module, loaded from a stubbed API.
 *
 * @param {Record<string, any>} [handlers] - Merged over a `GET /library` that
 *   answers with `playlists`.
 * @param {Playlist[]} [playlists]
 * @returns {Promise<{ library: LibraryModule['library'], calls: import('../testing/fixtures.js').ApiCall[] }>}
 */
async function boot(handlers = {}, playlists = []) {
	vi.resetModules();
	const { calls } = stubApi({ 'GET /library': libraryPayload(playlists), ...handlers });
	const { library } = await import('./library.svelte.js');
	await library.ensureLoaded(USER);
	return { library, calls };
}

/**
 * @param {import('../testing/fixtures.js').ApiCall[]} calls
 * @param {string} method
 * @param {string} path
 * @returns {import('../testing/fixtures.js').ApiCall|undefined}
 */
function callTo(calls, method, path) {
	return calls.find((call) => call.method === method && call.path === path);
}

beforeEach(() => {
	notifyError.mockClear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('loading', () => {
	it('reads the library once per account and reports what it got', async () => {
		const { library, calls } = await boot({}, [seedPlaylist()]);

		expect(library.loading).toBe(false);
		expect(library.error).toBeNull();
		expect(library.playlists).toHaveLength(1);
		expect(library.activePlaylistId).toBe('PL1');

		await library.ensureLoaded(USER);
		expect(calls.filter((call) => call.path === '/library')).toHaveLength(1);
	});

	it('reads again for another account', async () => {
		const { library, calls } = await boot({}, [seedPlaylist()]);
		await library.ensureLoaded('somebody-else');
		expect(calls.filter((call) => call.path === '/library')).toHaveLength(2);
	});

	it('keeps the failure instead of looking like an empty library', async () => {
		const { library } = await boot({
			'GET /library': {
				status: 503,
				body: { error: { code: 'db_unavailable', message: 'The database is unreachable.' } }
			}
		});

		expect(library.error).toBe('The database is unreachable.');
		expect(library.playlists).toEqual([]);
		expect(library.isEmpty).toBe(false);
	});

	it('drops a playlist the server described in a way we cannot use', async () => {
		const { library } = await boot({
			'GET /library': {
				activePlaylistId: 'PL1',
				playlists: [{ id: '', videos: [] }, seedPlaylist(), { id: 'PL2' }]
			}
		});

		expect(library.playlists.map((playlist) => playlist.id)).toEqual(['PL1']);
	});

	it('falls back to the first playlist when the active one is unknown', async () => {
		const { library } = await boot({
			'GET /library': libraryPayload([seedPlaylist()], 'gone')
		});
		expect(library.activePlaylistId).toBe('PL1');
	});

	it('forgets everything on clear, without asking the server', async () => {
		const { library, calls } = await boot({}, [seedPlaylist()]);
		const before = calls.length;

		library.clear();
		expect(library.playlists).toEqual([]);
		expect(library.activePlaylistId).toBeNull();
		expect(calls).toHaveLength(before);
	});
});

describe('ratings and stats', () => {
	it('counts per tier, rated, unrated and available videos', async () => {
		const { library } = await boot({}, [
			makePlaylist({
				id: 'PL1',
				videos: [
					makeVideo({ id: 'v1', position: 0 }),
					makeVideo({ id: 'v2', position: 1, rating: 'S' }),
					makeVideo({ id: 'v3', position: 2, unavailable: true }),
					makeVideo({ id: 'v4', position: 3, rating: 'F' })
				]
			})
		]);

		expect(library.counts).toEqual({ S: 1, A: 0, B: 0, C: 0, D: 0, F: 1 });
		expect(library.availableCount).toBe(3);
		expect(library.ratedCount).toBe(2);
		expect(library.unratedCount).toBe(1);
	});

	it('rates immediately and sends the change', async () => {
		const { library, calls } = await boot({ 'PATCH /playlists/PL1/videos/v1': {} }, [
			seedPlaylist()
		]);

		expect(library.rate('v1', 'B')).toBe(true);
		expect(library.counts.B).toBe(1);

		await vi.waitFor(() => {
			expect(callTo(calls, 'PATCH', '/playlists/PL1/videos/v1')?.body).toEqual({ rating: 'B' });
		});
		expect(notifyError).not.toHaveBeenCalled();
	});

	it('puts the old rating back when the server refuses', async () => {
		const { library } = await boot(
			{
				'PATCH /playlists/PL1/videos/v2': {
					status: 500,
					body: { error: { code: 'internal_error', message: 'Something went wrong.' } }
				}
			},
			[seedPlaylist()]
		);

		expect(library.rate('v2', 'F')).toBe(true);
		expect(library.activePlaylist?.videos[1].rating).toBe('F');

		await vi.waitFor(() => {
			expect(library.activePlaylist?.videos[1].rating).toBe('S');
		});
		expect(notifyError).toHaveBeenCalledWith(
			'That rating could not be saved.',
			expect.objectContaining({ description: 'Something went wrong.' })
		);
	});

	it('refuses a value that is not a tier, and a video that is not there', async () => {
		const { library } = await boot({}, [seedPlaylist()]);

		expect(() => library.rate('v1', /** @type {any} */ ('X'))).toThrow(TypeError);
		expect(library.rate('nope', 'B')).toBe(false);
	});

	it('marks a video unavailable and back, without touching its rating', async () => {
		const { library, calls } = await boot({ 'PATCH /playlists/PL1/videos/v2': {} }, [
			seedPlaylist()
		]);

		expect(library.markUnavailable('v2')).toBe(true);
		expect(library.activePlaylist?.videos[1]).toMatchObject({ rating: 'S', unavailable: true });
		expect(library.availableCount).toBe(2);

		expect(library.markAvailable('v2')).toBe(true);
		expect(library.activePlaylist?.videos[1].unavailable).toBe(false);

		await vi.waitFor(() => {
			expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
		});
		expect(calls.filter((call) => call.method === 'PATCH').map((call) => call.body)).toEqual([
			{ unavailable: true },
			{ unavailable: false }
		]);
	});
});

describe('order', () => {
	it('shuffles, sends the new order, and reverts it if that fails', async () => {
		const { library, calls } = await boot(
			{
				'PUT /playlists/PL1/order': {
					status: 503,
					body: { error: { code: 'db_unavailable', message: 'The database is unreachable.' } }
				}
			},
			[seedPlaylist()]
		);

		// Fisher-Yates with a random() that always picks index 0.
		expect(library.shuffle(() => 0)).toBe(true);
		expect(library.activeVideos.map((video) => video.id)).toEqual(['v2', 'v3', 'v1']);

		await vi.waitFor(() => {
			expect(library.activeVideos.map((video) => video.id)).toEqual(['v1', 'v2', 'v3']);
		});
		expect(callTo(calls, 'PUT', '/playlists/PL1/order')?.body).toEqual({
			order: ['v2', 'v3', 'v1']
		});
		expect(notifyError).toHaveBeenCalled();
	});

	it('restores the playlist order', async () => {
		const { library } = await boot({ 'PUT /playlists/PL1/order': {} }, [seedPlaylist()]);

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
	it('activates a playlist and tells the server', async () => {
		const { library, calls } = await boot({ 'PUT /library/active': {} }, [
			makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1' })] }),
			makePlaylist({ id: 'PL2', videos: [makeVideo({ id: 'v2' })] })
		]);

		expect(library.activePlaylistId).toBe('PL1');
		expect(library.setActive('PL2')).toBe(true);
		expect(library.activePlaylist?.id).toBe('PL2');
		expect(library.setActive('nope')).toBe(false);

		await vi.waitFor(() => {
			expect(callTo(calls, 'PUT', '/library/active')?.body).toEqual({ playlistId: 'PL2' });
		});
	});

	it('removes a playlist and moves on to the next one', async () => {
		const { library, calls } = await boot({ 'DELETE /playlists/PL2': {} }, [
			makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1' })] }),
			makePlaylist({ id: 'PL2', videos: [makeVideo({ id: 'v2' })] })
		]);

		library.setActive('PL2');
		expect(library.removePlaylist('PL2')).toBe(true);
		expect(library.playlists).toHaveLength(1);
		expect(library.activePlaylistId).toBe('PL1');
		expect(library.removePlaylist('PL2')).toBe(false);

		await vi.waitFor(() => {
			expect(callTo(calls, 'DELETE', '/playlists/PL2')).toBeDefined();
		});
		expect(notifyError).not.toHaveBeenCalled();
	});

	it('puts a playlist back when the server refuses to remove it', async () => {
		const { library } = await boot(
			{
				'DELETE /playlists/PL1': {
					status: 503,
					body: { error: { code: 'db_unavailable', message: 'The database is unreachable.' } }
				}
			},
			[seedPlaylist()]
		);

		expect(library.removePlaylist('PL1')).toBe(true);
		expect(library.playlists).toHaveLength(0);

		await vi.waitFor(() => {
			expect(library.playlists.map((playlist) => playlist.id)).toEqual(['PL1']);
		});
		expect(library.activePlaylistId).toBe('PL1');
	});
});

describe('importPlaylist', () => {
	it('posts the raw input and adopts the playlist the server stored', async () => {
		const imported = makePlaylist({
			id: 'PL9',
			videos: [makeVideo({ id: 'n1' }), makeVideo({ id: 'n2', position: 1 })]
		});
		const { library, calls } = await boot({
			'POST /playlists/import': { playlist: imported, activePlaylistId: 'PL9' }
		});

		const playlist = await library.importPlaylist('https://youtube.com/playlist?list=PL9');

		expect(callTo(calls, 'POST', '/playlists/import')?.body).toEqual({
			input: 'https://youtube.com/playlist?list=PL9'
		});
		expect(playlist.videos.map((video) => video.id)).toEqual(['n1', 'n2']);
		expect(library.activePlaylistId).toBe('PL9');
		expect(library.playlists).toHaveLength(1);
	});

	it('replaces a playlist that was already there', async () => {
		const refreshed = makePlaylist({
			id: 'PL1',
			videos: [makeVideo({ id: 'v1', rating: 'S' }), makeVideo({ id: 'v9', position: 1 })]
		});
		const { library } = await boot(
			{ 'POST /playlists/import': { playlist: refreshed, activePlaylistId: 'PL1' } },
			[seedPlaylist()]
		);

		await library.importPlaylist('PL1');

		expect(library.playlists).toHaveLength(1);
		expect(library.activeVideos.map((video) => video.id)).toEqual(['v1', 'v9']);
	});

	it('throws the server’s code so the dialog can explain it', async () => {
		const { library } = await boot({
			'POST /playlists/import': {
				status: 503,
				body: { error: { code: 'quotaExceeded', message: 'Out of quota.' } }
			}
		});

		await expect(library.importPlaylist('PL1')).rejects.toMatchObject({
			code: 'quotaExceeded',
			status: 503
		});
	});
});

describe('exportJson / importJson', () => {
	it('exports what is on screen', async () => {
		const { library } = await boot({}, [seedPlaylist()]);
		const payload = JSON.parse(library.exportJson());

		expect(payload).toMatchObject({ version: 1, playlists: expect.any(Array) });
		expect(payload.playlists[0].videos).toHaveLength(3);
		expect(payload.exportedAt).toEqual(expect.any(String));
	});

	it('posts the file and adopts the library that comes back', async () => {
		const merged = makePlaylist({
			id: 'PL1',
			videos: [makeVideo({ id: 'v1', rating: 'A' }), makeVideo({ id: 'v2', position: 1 })]
		});
		const { library, calls } = await boot({
			'POST /library/import-json': {
				summary: { playlists: 1, videos: 2, ratingsApplied: 1 },
				library: libraryPayload([merged])
			}
		});

		const summary = await library.importJson(
			JSON.stringify({
				version: 1,
				playlists: [{ id: 'PL1', videos: [{ id: 'v1', rating: 'A' }] }]
			})
		);

		expect(summary).toEqual({ playlists: 1, videos: 2, ratingsApplied: 1 });
		expect(callTo(calls, 'POST', '/library/import-json')?.body).toMatchObject({ version: 1 });
		expect(library.activePlaylistId).toBe('PL1');
		expect(library.activeVideos.map((video) => video.rating)).toEqual(['A', null]);
	});

	it('sends a file that is not JSON as it is, so the server writes the message', async () => {
		const { library, calls } = await boot({
			'POST /library/import-json': {
				status: 400,
				body: { error: { code: 'invalid_export', message: 'That file is not valid JSON.' } }
			}
		});

		await expect(library.importJson('{not json')).rejects.toMatchObject({
			code: 'invalid_export',
			message: 'That file is not valid JSON.'
		});
		expect(callTo(calls, 'POST', '/library/import-json')?.body).toBe('{not json');
	});
});
