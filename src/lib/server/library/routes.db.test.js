/**
 * The library endpoints themselves, against a real Postgres.
 *
 * `library.db.test.js` proves that the store and the service are scoped to one
 * account. This file proves that the *routes* are — that each one passes
 * `locals.user.id` down, and that a request naming another account's playlist comes
 * back 404 with the shared envelope rather than 200, 500, or a leak.
 *
 * The handlers are called directly with a hand-made event. What that skips is the
 * `handle` hook: the session lookup and the cross-site check are #16's, tested there
 * and in `http.test.js`, and the contract between the browser and that check is held
 * by `src/lib/api.test.js`.
 *
 * Runs only when `TEST_DATABASE_URL` is set; see the README.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../db/index.js';
import { applyMigrations } from '../db/migrations.js';
import { claimTestDatabase, DB_LOCK_TIMEOUT_MS, emptyTestDatabase } from '../db/testing.js';
import { createUser } from '../auth/users.js';
import { importPlaylist } from './service.js';
import { loadPlaylist } from './store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
	console.log(
		'[db] TEST_DATABASE_URL is not set — skipping the library endpoint tests. ' +
			'Start deploy/docker-compose.yml and set TEST_DATABASE_URL to run them.'
	);
}

const describeDb = databaseUrl ? describe : describe.skip;

/** @type {import('../db/index.js').DbHandle | undefined} */
let handle;

// The routes reach for the process-wide pool, which points at `DATABASE_URL`. Here
// they must reach for the one this suite owns and is allowed to wipe.
vi.mock('../db/index.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return { ...actual, getDb: () => /** @type {any} */ (handle).db };
});

// Only the key lookup, because it is the one thing in the import path that reads the
// process environment — there is no `DATABASE_URL` in a Vitest run, only a
// `TEST_DATABASE_URL`, and `serverConfig()` would refuse the whole environment before
// ever getting to the key. The refusal it stands in for is the real one.
vi.mock('../youtube.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return {
		...actual,
		requireApiKey: () => {
			throw new actual.YouTubeApiError(
				'This server has no YouTube API key configured, so it cannot import playlists.',
				'keyMissing'
			);
		}
	};
});

describeDb('the library endpoints against a real database', () => {
	/** @type {() => Promise<void>} */
	let release;

	/** @type {{ id: string }} */
	let owner;
	/** @type {{ id: string }} */
	let intruder;

	const PLAYLIST = 'PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc';
	const ORIGIN = 'http://localhost:3000';

	/**
	 * @param {string} email
	 * @returns {Promise<{ id: string }>}
	 */
	async function account(email) {
		return createUser(/** @type {any} */ (handle).db, {
			email,
			displayName: email,
			password: 'a-perfectly-fine-password',
			role: 'user'
		});
	}

	/**
	 * The event a route handler is given, with the session already resolved — which is
	 * exactly what `src/hooks.server.js` guarantees for anything under `/api`.
	 *
	 * @param {object} input
	 * @param {{ id: string }} input.user
	 * @param {string} input.path
	 * @param {string} [input.method]
	 * @param {unknown} [input.body]
	 * @param {Record<string, string>} [input.params]
	 * @returns {any}
	 */
	function event({ user, path, method = 'GET', body, params = {} }) {
		const url = new URL(`${ORIGIN}${path}`);
		return {
			locals: { user, session: { id: 'irrelevant', expiresAt: new Date() } },
			params,
			url,
			request: new Request(url, {
				method,
				headers: { 'content-type': 'application/json', origin: ORIGIN },
				body: body === undefined ? undefined : JSON.stringify(body)
			})
		};
	}

	/**
	 * @param {Response} response
	 * @returns {Promise<{ status: number, body: any }>}
	 */
	async function read(response) {
		return { status: response.status, body: await response.json() };
	}

	beforeAll(async () => {
		handle = createDb(databaseUrl ?? '', { max: 3 });
		release = await claimTestDatabase(handle.client);
	}, DB_LOCK_TIMEOUT_MS);

	afterAll(async () => {
		await release?.();
		await handle?.client.end();
	});

	beforeEach(async () => {
		await emptyTestDatabase(/** @type {any} */ (handle).client);
		await applyMigrations(/** @type {string} */ (databaseUrl));
		owner = await account('owner@example.com');
		intruder = await account('intruder@example.com');

		await importPlaylist(
			/** @type {any} */ (handle).db,
			owner.id,
			`https://www.youtube.com/playlist?list=${PLAYLIST}`,
			{
				apiKey: 'not-a-real-key',
				fetchMeta: async () => ({
					id: PLAYLIST,
					title: 'AMVs',
					description: '',
					channelTitle: 'Me',
					thumbnail: '',
					itemCount: 2
				}),
				fetchVideos: async () =>
					['v1', 'v2'].map((id, position) => ({
						id,
						title: `Title ${id}`,
						description: '',
						thumbnail: '',
						channelTitle: '',
						publishedAt: '',
						position,
						durationSeconds: 60,
						rating: null,
						unavailable: false
					}))
			}
		);
	});

	describe('GET /library', () => {
		it('answers with the caller’s own library, and only that', async () => {
			const { GET } = await import('../../../routes/api/v1/library/+server.js');

			const mine = await read(await GET(event({ user: owner, path: '/api/v1/library' })));
			expect(mine.status).toBe(200);
			expect(mine.body.activePlaylistId).toBe(PLAYLIST);

			const theirs = await read(await GET(event({ user: intruder, path: '/api/v1/library' })));
			expect(theirs.body).toEqual({ activePlaylistId: null, playlists: [] });
		});
	});

	describe('PATCH a video', () => {
		/** @param {{ id: string }} user @param {any} body @returns {Promise<any>} */
		async function patch(user, body) {
			const { PATCH } =
				await import('../../../routes/api/v1/playlists/[playlistId]/videos/[videoId]/+server.js');
			return read(
				await PATCH(
					event({
						user,
						method: 'PATCH',
						path: `/api/v1/playlists/${PLAYLIST}/videos/v1`,
						params: { playlistId: PLAYLIST, videoId: 'v1' },
						body
					})
				)
			);
		}

		it('rates the caller’s own video', async () => {
			expect(await patch(owner, { rating: 'S' })).toMatchObject({
				status: 200,
				body: { video: { id: 'v1', rating: 'S' } }
			});
		});

		it('is a 404 for somebody else’s, and changes nothing', async () => {
			await patch(owner, { rating: 'S' });

			const refused = await patch(intruder, { rating: 'F' });
			expect(refused.status).toBe(404);
			expect(refused.body.error.code).toBe('video_not_found');

			const playlist = await loadPlaylist(/** @type {any} */ (handle).db, owner.id, PLAYLIST);
			expect(playlist?.videos[0].rating).toBe('S');
		});

		it('refuses a body that is not a patch', async () => {
			expect(await patch(owner, { rating: 'X' })).toMatchObject({
				status: 400,
				body: { error: { code: 'invalid_body' } }
			});
		});
	});

	describe('PUT an order', () => {
		it('reorders the caller’s playlist and 404s on anybody else’s', async () => {
			const { PUT } =
				await import('../../../routes/api/v1/playlists/[playlistId]/order/+server.js');
			/** @param {{ id: string }} user @returns {Promise<any>} */
			const put = async (user) =>
				read(
					await PUT(
						event({
							user,
							method: 'PUT',
							path: `/api/v1/playlists/${PLAYLIST}/order`,
							params: { playlistId: PLAYLIST },
							body: { order: ['v2', 'v1'] }
						})
					)
				);

			expect(await put(owner)).toMatchObject({ status: 200, body: { order: ['v2', 'v1'] } });
			expect(await put(intruder)).toMatchObject({
				status: 404,
				body: { error: { code: 'playlist_not_found' } }
			});
		});
	});

	describe('PUT the active playlist', () => {
		it('accepts the caller’s own, null, and nothing else', async () => {
			const { PUT } = await import('../../../routes/api/v1/library/active/+server.js');
			/** @param {{ id: string }} user @param {any} body @returns {Promise<any>} */
			const put = async (user, body) =>
				read(await PUT(event({ user, method: 'PUT', path: '/api/v1/library/active', body })));

			expect(await put(owner, { playlistId: PLAYLIST })).toMatchObject({ status: 200 });
			expect(await put(owner, { playlistId: null })).toMatchObject({
				status: 200,
				body: { activePlaylistId: null }
			});
			expect(await put(intruder, { playlistId: PLAYLIST })).toMatchObject({
				status: 404,
				body: { error: { code: 'playlist_not_found' } }
			});
			expect(await put(owner, {})).toMatchObject({
				status: 400,
				body: { error: { code: 'invalid_body' } }
			});
		});
	});

	describe('DELETE a playlist', () => {
		it('is a 404 for somebody else’s', async () => {
			const { DELETE } = await import('../../../routes/api/v1/playlists/[playlistId]/+server.js');

			const refused = await read(
				await DELETE(
					event({
						user: intruder,
						method: 'DELETE',
						path: `/api/v1/playlists/${PLAYLIST}`,
						params: { playlistId: PLAYLIST }
					})
				)
			);
			expect(refused.status).toBe(404);
			expect(await loadPlaylist(/** @type {any} */ (handle).db, owner.id, PLAYLIST)).not.toBeNull();
		});

		it('removes the caller’s own and says what is active now', async () => {
			const { DELETE } = await import('../../../routes/api/v1/playlists/[playlistId]/+server.js');

			const removed = await read(
				await DELETE(
					event({
						user: owner,
						method: 'DELETE',
						path: `/api/v1/playlists/${PLAYLIST}`,
						params: { playlistId: PLAYLIST }
					})
				)
			);
			expect(removed).toEqual({ status: 200, body: { removed: true, activePlaylistId: null } });
			expect(await loadPlaylist(/** @type {any} */ (handle).db, owner.id, PLAYLIST)).toBeNull();
		});
	});

	describe('import-json and export', () => {
		it('merges into the caller’s library, never into another’s', async () => {
			const { POST } = await import('../../../routes/api/v1/library/import-json/+server.js');
			const backup = {
				version: 1,
				playlists: [{ id: PLAYLIST, videos: [{ id: 'v1', rating: 'D' }] }]
			};

			const answer = await read(
				await POST(
					event({
						user: intruder,
						method: 'POST',
						path: '/api/v1/library/import-json',
						body: backup
					})
				)
			);
			expect(answer.status).toBe(200);
			expect(answer.body.summary).toEqual({ playlists: 1, videos: 1, ratingsApplied: 1 });

			const mine = await loadPlaylist(/** @type {any} */ (handle).db, owner.id, PLAYLIST);
			expect(mine?.videos[0].rating).toBeNull();
		});

		it('refuses a payload that is not an export', async () => {
			const { POST } = await import('../../../routes/api/v1/library/import-json/+server.js');
			expect(
				await read(
					await POST(
						event({
							user: owner,
							method: 'POST',
							path: '/api/v1/library/import-json',
							body: { nope: true }
						})
					)
				)
			).toMatchObject({ status: 400, body: { error: { code: 'invalid_export' } } });
		});

		it('exports the caller’s library as a downloadable file', async () => {
			const { GET } = await import('../../../routes/api/v1/library/export/+server.js');

			const response = await GET(event({ user: owner, path: '/api/v1/library/export' }));
			expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="ytpt-/);

			const text = await response.text();
			expect(text).toContain('\n  "version": 1');
			expect(JSON.parse(text).playlists[0].id).toBe(PLAYLIST);

			const empty = await GET(event({ user: intruder, path: '/api/v1/library/export' }));
			expect(JSON.parse(await empty.text()).playlists).toEqual([]);
		});
	});

	describe('POST /playlists/import', () => {
		it('reports a missing server key as a 503 the dialog can explain', async () => {
			const { POST } = await import('../../../routes/api/v1/playlists/import/+server.js');

			// A server started without `YOUTUBE_API_KEY` — the state a development
			// checkout is in, and the one path through this endpoint that needs no network.
			expect(
				await read(
					await POST(
						event({
							user: owner,
							method: 'POST',
							path: '/api/v1/playlists/import',
							body: { input: `https://www.youtube.com/playlist?list=${PLAYLIST}` }
						})
					)
				)
			).toMatchObject({ status: 503, body: { error: { code: 'keyMissing' } } });
		});

		it('refuses a body without an input', async () => {
			const { POST } = await import('../../../routes/api/v1/playlists/import/+server.js');
			expect(
				await read(
					await POST(
						event({ user: owner, method: 'POST', path: '/api/v1/playlists/import', body: {} })
					)
				)
			).toMatchObject({ status: 400, body: { error: { code: 'invalid_body' } } });
		});
	});
});
