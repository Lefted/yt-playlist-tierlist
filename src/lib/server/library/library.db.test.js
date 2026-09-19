/**
 * Integration test for the library, against a real Postgres.
 *
 * Runs only when `TEST_DATABASE_URL` points at a database it may **wipe** — see the
 * "Running the server" section of the README for the compose one-liner. Without it
 * the suite skips, so `npm test` stays a no-dependency command on any machine.
 *
 * What earns a real database here is what the unit tests cannot reach: the two
 * unique indexes the upserts lean on, the rating check constraint, the cascade that
 * takes videos with their playlist, the `on delete set null` behind the active
 * playlist — and, above all, that every one of these functions is scoped to the
 * account that asked. The last `describe` is that one, and it is the reason this file
 * exists rather than a mocked store.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportLibraryJson, importLibraryJson, importPlaylist, removePlaylist } from './service.js';
import {
	activePlaylistId,
	deletePlaylist,
	loadLibrary,
	loadPlaylist,
	savePlaylist,
	setActivePlaylist,
	setPlaylistOrder,
	updateVideo
} from './store.js';
import { LEGACY_PLAYLIST_ID } from '../../library-io.js';
import { createUser } from '../auth/users.js';
import { createDb } from '../db/index.js';
import { applyMigrations } from '../db/migrations.js';
import { claimTestDatabase, DB_LOCK_TIMEOUT_MS, emptyTestDatabase } from '../db/testing.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
	console.log(
		'[db] TEST_DATABASE_URL is not set — skipping the library integration tests. ' +
			'Start deploy/docker-compose.yml and set TEST_DATABASE_URL to run them.'
	);
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb('the library against a real database', () => {
	/** A handle of its own, so nothing here touches the process-wide pool. */
	const { client, db } = createDb(databaseUrl ?? '', { max: 3 });

	/** @type {() => Promise<void>} */
	let release;

	/** @type {string} */
	let userId;

	/** Puts the database back to a freshly migrated, empty installation. */
	async function reset() {
		await emptyTestDatabase(client);
		await applyMigrations(/** @type {string} */ (databaseUrl));
	}

	/**
	 * @param {string} email
	 * @returns {Promise<string>} The new account's id.
	 */
	async function account(email) {
		const user = await createUser(db, {
			email,
			displayName: email,
			password: 'a-perfectly-fine-password',
			role: 'user'
		});
		return user.id;
	}

	/**
	 * A YouTube import that never leaves the process.
	 *
	 * @param {string} playlistId
	 * @param {Array<{ id: string, title?: string, unavailable?: boolean }>} videos
	 * @param {{ title?: string }} [meta]
	 * @returns {{ apiKey: string, fetchMeta: any, fetchVideos: any }}
	 */
	function youtube(playlistId, videos, meta = {}) {
		return {
			apiKey: 'not-a-real-key',
			fetchMeta: async () => ({
				id: playlistId,
				title: meta.title ?? 'AMVs',
				description: 'desc',
				channelTitle: 'Me',
				thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg',
				itemCount: videos.length
			}),
			fetchVideos: async () =>
				videos.map((video, index) => ({
					id: video.id,
					title: video.title ?? `Title ${video.id}`,
					description: '',
					thumbnail: `https://i.ytimg.com/vi/${video.id}/hq.jpg`,
					channelTitle: 'Uploader',
					publishedAt: '2024-05-05T00:00:00Z',
					position: index,
					durationSeconds: 60,
					rating: null,
					unavailable: video.unavailable ?? false
				}))
		};
	}

	/**
	 * Import a playlist for an account, as the endpoint would, with YouTube stubbed.
	 *
	 * The input is always a URL: `PL1` and friends are too short to pass
	 * `parsePlaylistInput` as bare ids, and a link is what a user pastes anyway.
	 *
	 * @param {string} account
	 * @param {string} playlistId
	 * @param {Array<{ id: string, title?: string, unavailable?: boolean }>} videos
	 * @param {{ title?: string }} [meta]
	 * @returns {Promise<{ playlist: import('../../types.js').Playlist, activePlaylistId: string }>}
	 */
	function importIt(account, playlistId, videos, meta = {}) {
		return importPlaylist(
			db,
			account,
			`https://www.youtube.com/playlist?list=${playlistId}`,
			youtube(playlistId, videos, meta)
		);
	}

	beforeAll(async () => {
		release = await claimTestDatabase(client);
	}, DB_LOCK_TIMEOUT_MS);

	afterAll(async () => {
		await release?.();
		await client.end();
	});

	beforeEach(async () => {
		await reset();
		userId = await account('moritz@example.com');
	});

	describe('import, rate, export', () => {
		it('imports a playlist, rates a video and exports what was stored', async () => {
			const { playlist } = await importIt(userId, 'PL1', [
				{ id: 'v1' },
				{ id: 'v2' },
				{ id: 'v3' }
			]);

			expect(playlist.id).toBe('PL1');
			expect(playlist.videos.map((video) => video.id)).toEqual(['v1', 'v2', 'v3']);
			expect(playlist.order).toEqual(['v1', 'v2', 'v3']);
			expect(await activePlaylistId(db, userId)).toBe('PL1');

			const rated = await updateVideo(db, userId, 'PL1', 'v2', { rating: 'S' });
			expect(rated?.rating).toBe('S');

			const exported = JSON.parse(await exportLibraryJson(db, userId));
			expect(exported).toMatchObject({ version: 1, exportedAt: expect.any(String) });
			expect(exported.playlists[0].videos[1]).toMatchObject({ id: 'v2', rating: 'S' });

			// And the round trip: the export is a payload the import accepts.
			const second = await account('second@example.com');
			const { summary } = await importLibraryJson(db, second, exported);
			expect(summary).toEqual({ playlists: 1, videos: 3, ratingsApplied: 1 });
			const theirs = await loadLibrary(db, second);
			expect(theirs.playlists[0].videos[1].rating).toBe('S');
		});

		it('keeps ratings, adds new videos and retires gone ones on a re-import', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]);
			await updateVideo(db, userId, 'PL1', 'v1', { rating: 'S' });
			await updateVideo(db, userId, 'PL1', 'v2', { rating: 'C' });
			const first = await loadPlaylist(db, userId, 'PL1');

			const { playlist } = await importIt(
				userId,
				'PL1',
				[{ id: 'v1' }, { id: 'v3' }, { id: 'v4' }],
				{ title: 'AMVs (renamed)' }
			);

			expect(playlist.title).toBe('AMVs (renamed)');
			expect(playlist.importedAt).toBe(first?.importedAt);
			expect(playlist.videos.map((video) => video.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
			expect(playlist.videos.map((video) => video.rating)).toEqual(['S', 'C', null, null]);
			expect(playlist.videos.map((video) => video.unavailable)).toEqual([
				false,
				true,
				false,
				false
			]);
			// Still one playlist, because `(user_id, youtube_id)` is unique.
			expect((await loadLibrary(db, userId)).playlists).toHaveLength(1);
		});

		it('leaves rated_at alone for a rating a re-import merely carries forward', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }]);
			await updateVideo(db, userId, 'PL1', 'v1', { rating: 'A' });

			const [before] = await client`select rated_at from videos where youtube_id = 'v1'`;
			expect(before.rated_at).not.toBeNull();

			await importIt(userId, 'PL1', [{ id: 'v1' }]);
			const [after] = await client`select rated_at, rating from videos where youtube_id = 'v1'`;

			expect(after.rating).toBe('A');
			expect(after.rated_at).toEqual(before.rated_at);
		});

		it('refuses a rating the app does not have', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }]);
			await expect(client`update videos set rating = 'X' where youtube_id = 'v1'`).rejects.toThrow(
				/videos_rating_check/
			);
		});
	});

	describe('import-json', () => {
		it('applies a legacy payload to what is already there and keeps the rest', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }, { id: 'v2' }]);
			await updateVideo(db, userId, 'PL1', 'v2', { rating: 'S' });

			const { summary, library } = await importLibraryJson(db, userId, [
				{ videoId: 'v1', title: 'one', rating: 'A' },
				{ videoId: 'v2', title: 'two', rating: 'F' },
				{ videoId: 'v9', title: 'nine', rating: 'B' }
			]);

			expect(summary).toEqual({ playlists: 2, videos: 3, ratingsApplied: 2 });

			const imported = library.playlists.find((playlist) => playlist.id === 'PL1');
			expect(imported?.videos.map((video) => video.rating)).toEqual(['A', 'S']);

			const legacy = library.playlists.find((playlist) => playlist.id === LEGACY_PLAYLIST_ID);
			expect(legacy?.videos).toEqual([expect.objectContaining({ id: 'v9', rating: 'B' })]);
		});

		it('makes the first playlist active when the account had none', async () => {
			await importLibraryJson(db, userId, {
				version: 1,
				playlists: [{ id: 'PL7', videos: [{ id: 'v1' }] }]
			});
			expect(await activePlaylistId(db, userId)).toBe('PL7');
		});

		it('refuses a payload that is not an export', async () => {
			await expect(importLibraryJson(db, userId, { nope: true })).rejects.toThrow(
				/Unrecognised export/
			);
		});
	});

	describe('order, selection and removal', () => {
		it('stores a shuffled order and reconciles a stale one', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]);

			expect(await setPlaylistOrder(db, userId, 'PL1', ['v3', 'v1', 'v2'])).toEqual([
				'v3',
				'v1',
				'v2'
			]);
			expect((await loadPlaylist(db, userId, 'PL1'))?.order).toEqual(['v3', 'v1', 'v2']);

			// A video that is not there is dropped, and one the order forgot is appended.
			expect(await setPlaylistOrder(db, userId, 'PL1', ['v9', 'v2', 'v2'])).toEqual([
				'v2',
				'v1',
				'v3'
			]);
		});

		it('moves on to the next playlist when the active one is removed', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }]);
			await importIt(userId, 'PL2', [{ id: 'w1' }]);
			expect(await activePlaylistId(db, userId)).toBe('PL2');

			const result = await removePlaylist(db, userId, 'PL2');

			expect(result).toEqual({ removed: true, activePlaylistId: 'PL1' });
			// The videos went with it.
			const [{ count }] = await client`select count(*)::int as count from videos`;
			expect(count).toBe(1);
		});

		it('refuses to activate a playlist that is not there', async () => {
			expect(await setActivePlaylist(db, userId, 'PL-nope')).toBe(false);
			expect(await activePlaylistId(db, userId)).toBeNull();
		});
	});

	describe('one account cannot reach another', () => {
		/** @type {string} */
		let intruder;

		beforeEach(async () => {
			intruder = await account('intruder@example.com');
			await importIt(userId, 'PL1', [{ id: 'v1' }, { id: 'v2' }]);
			await updateVideo(db, userId, 'PL1', 'v1', { rating: 'S' });
		});

		it('cannot read it', async () => {
			expect(await loadLibrary(db, intruder)).toEqual({ activePlaylistId: null, playlists: [] });
			expect(await loadPlaylist(db, intruder, 'PL1')).toBeNull();
			expect(await activePlaylistId(db, intruder)).toBeNull();

			const exported = JSON.parse(await exportLibraryJson(db, intruder));
			expect(exported.playlists).toEqual([]);
		});

		it('cannot rate, reorder, activate or delete it', async () => {
			expect(await updateVideo(db, intruder, 'PL1', 'v1', { rating: 'F' })).toBeNull();
			expect(await setPlaylistOrder(db, intruder, 'PL1', ['v2', 'v1'])).toBeNull();
			expect(await setActivePlaylist(db, intruder, 'PL1')).toBe(false);
			expect(await deletePlaylist(db, intruder, 'PL1')).toBe(false);
			expect(await removePlaylist(db, intruder, 'PL1')).toEqual({
				removed: false,
				activePlaylistId: null
			});

			// Untouched, in every respect.
			const mine = await loadPlaylist(db, userId, 'PL1');
			expect(mine?.videos.map((video) => video.rating)).toEqual(['S', null]);
			expect(mine?.order).toEqual(['v1', 'v2']);
			expect(await activePlaylistId(db, userId)).toBe('PL1');
		});

		it('gets a library of its own when it imports the same playlist', async () => {
			const { playlist } = await importIt(intruder, 'PL1', [{ id: 'v1' }, { id: 'v2' }]);

			expect(playlist.videos.map((video) => video.rating)).toEqual([null, null]);
			const [{ count }] = await client`select count(*)::int as count from playlists`;
			expect(count).toBe(2);

			// And rating in one library says nothing about the other.
			await updateVideo(db, intruder, 'PL1', 'v1', { rating: 'F' });
			expect((await loadPlaylist(db, userId, 'PL1'))?.videos[0].rating).toBe('S');
		});

		it('cannot import a backup into somebody else’s library', async () => {
			await importLibraryJson(db, intruder, {
				version: 1,
				playlists: [{ id: 'PL1', videos: [{ id: 'v1', rating: 'D' }] }]
			});

			expect((await loadPlaylist(db, userId, 'PL1'))?.videos[0].rating).toBe('S');
			expect((await loadPlaylist(db, intruder, 'PL1'))?.videos[0].rating).toBe('D');
		});
	});

	describe('savePlaylist', () => {
		it('removes video rows the playlist no longer mentions', async () => {
			await importIt(userId, 'PL1', [{ id: 'v1' }, { id: 'v2' }]);
			const playlist = /** @type {any} */ (await loadPlaylist(db, userId, 'PL1'));

			await savePlaylist(db, userId, {
				...playlist,
				videos: playlist.videos.filter((/** @type {any} */ video) => video.id === 'v1'),
				order: ['v1']
			});

			expect((await loadPlaylist(db, userId, 'PL1'))?.videos.map((v) => v.id)).toEqual(['v1']);
		});

		it('survives a playlist whose timestamps are nonsense', async () => {
			const stored = await savePlaylist(db, userId, {
				id: 'PLx',
				title: 'Hand-edited',
				description: '',
				channelTitle: '',
				thumbnail: '',
				itemCount: 1,
				importedAt: '',
				updatedAt: 'not a date',
				videos: [
					{
						id: 'v1',
						title: 'One',
						description: '',
						thumbnail: '',
						channelTitle: '',
						publishedAt: '',
						position: 0,
						durationSeconds: null,
						rating: null,
						unavailable: false
					}
				],
				order: []
			});

			expect(Number.isNaN(new Date(stored.importedAt).getTime())).toBe(false);
			expect(Number.isNaN(new Date(stored.updatedAt).getTime())).toBe(false);
		});
	});
});
