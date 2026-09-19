/**
 * Test-only helpers. Nothing in `src/routes` imports this module, so it never ends
 * up in the bundle.
 */

import { vi } from 'vitest';
import { API_BASE } from '../api.js';

/** @typedef {import('../types.js').Playlist} Playlist */
/** @typedef {import('../types.js').Video} Video */

/**
 * An in-memory `localStorage`, good enough for `vi.stubGlobal('localStorage', …)`.
 *
 * @param {Record<string, string>} [initial] - Raw, already prefixed entries.
 * @returns {Storage & { entries: Map<string, string> }}
 */
export function createLocalStorageStub(initial = {}) {
	const entries = new Map(Object.entries(initial));

	return {
		entries,
		get length() {
			return entries.size;
		},
		key(index) {
			return [...entries.keys()][index] ?? null;
		},
		getItem(key) {
			return entries.has(key) ? /** @type {string} */ (entries.get(key)) : null;
		},
		setItem(key, value) {
			entries.set(key, String(value));
		},
		removeItem(key) {
			entries.delete(key);
		},
		clear() {
			entries.clear();
		}
	};
}

/**
 * Stub `globalThis.fetch` so it answers with the given bodies, in order.
 *
 * @param {Array<{ body: any, status?: number, ok?: boolean }>} responses
 * @returns {import('vitest').Mock} The stub, for asserting on the requested URLs.
 */
export function stubFetch(responses) {
	const queue = [...responses];
	const fetch = vi.fn(async () => {
		const next = queue.shift();
		if (!next) throw new Error('fetch was called more often than the test set up');
		const status = next.status ?? 200;
		return {
			ok: next.ok ?? status < 400,
			status,
			json: async () => next.body
		};
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

/**
 * A `playlistItems` resource as the API would return it.
 *
 * @param {string} videoId
 * @param {Partial<{ title: string, position: number, noResourceId: boolean }>} [options]
 * @returns {any}
 */
export function playlistItemResource(videoId, options = {}) {
	return {
		id: `item-${videoId}`,
		snippet: {
			title: options.title ?? `Title ${videoId}`,
			description: 'desc',
			position: options.position ?? 0,
			videoOwnerChannelTitle: 'Uploader',
			thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hq.jpg` } },
			resourceId: options.noResourceId ? {} : { kind: 'youtube#video', videoId }
		},
		contentDetails: { videoPublishedAt: '2024-05-05T00:00:00Z' }
	};
}

/**
 * @param {Partial<Video> & { id: string }} overrides
 * @returns {Video}
 */
export function makeVideo(overrides) {
	return {
		title: `Title ${overrides.id}`,
		description: '',
		thumbnail: `https://i.ytimg.com/vi/${overrides.id}/hqdefault.jpg`,
		channelTitle: 'Some channel',
		publishedAt: '2024-01-01T00:00:00Z',
		position: 0,
		durationSeconds: 120,
		rating: null,
		unavailable: false,
		...overrides
	};
}

/**
 * @param {Partial<Playlist> & { id: string, videos: Video[] }} overrides
 * @returns {Playlist}
 */
export function makePlaylist(overrides) {
	return {
		title: `Playlist ${overrides.id}`,
		description: '',
		channelTitle: 'Some channel',
		thumbnail: '',
		itemCount: overrides.videos.length,
		importedAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		order: overrides.videos.map((video) => video.id),
		...overrides
	};
}

/**
 * What `GET /api/v1/library` answers with for these playlists.
 *
 * @param {Playlist[]} playlists
 * @param {string|null} [activePlaylistId] - Defaults to the first playlist.
 * @returns {{ activePlaylistId: string|null, playlists: Playlist[] }}
 */
export function libraryPayload(playlists, activePlaylistId) {
	return {
		activePlaylistId: activePlaylistId ?? playlists[0]?.id ?? null,
		playlists
	};
}

/**
 * What one handler of {@link stubApi} may be: a body (answered with 200), an
 * explicit `{ status, body }`, or a function of the request.
 *
 * @typedef {any | ((request: ApiCall) => any)} ApiHandler
 */

/**
 * One call the stubbed API saw.
 *
 * @typedef {Object} ApiCall
 * @property {string} method
 * @property {string} path - Below `/api/v1`, e.g. `/library`.
 * @property {any} body - The parsed request body, `undefined` when there was none.
 */

/**
 * Stub `globalThis.fetch` as the `/api/v1` this app talks to.
 *
 * Handlers are keyed `"<METHOD> <path>"` (`'PATCH /playlists/PL1/videos/v1'`); the
 * key `'*'` catches everything else. A path with no handler answers 404 in the
 * shared error envelope, which is what the client would see if a route were missing.
 *
 * @param {Record<string, ApiHandler>} [handlers]
 * @returns {{ fetch: import('vitest').Mock, calls: ApiCall[] }}
 */
export function stubApi(handlers = {}) {
	/** @type {ApiCall[]} */
	const calls = [];

	const fetch = vi.fn(async (/** @type {any} */ url, /** @type {any} */ init = {}) => {
		const method = String(init.method ?? 'GET').toUpperCase();
		const path = String(url).startsWith(API_BASE)
			? String(url).slice(API_BASE.length)
			: String(url);
		/** @type {ApiCall} */
		const call = {
			method,
			path,
			body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined
		};
		calls.push(call);

		const handler = handlers[`${method} ${path}`] ?? handlers['*'];
		if (handler === undefined) {
			return jsonResponse(404, {
				error: { code: 'not_found', message: `No stub for ${method} ${path}.` }
			});
		}

		const answer = typeof handler === 'function' ? await handler(call) : handler;
		if (answer && typeof answer === 'object' && 'status' in answer) {
			return jsonResponse(answer.status, answer.body ?? null);
		}
		return jsonResponse(200, answer);
	});

	vi.stubGlobal('fetch', fetch);
	return { fetch, calls };
}

/**
 * @param {number} status
 * @param {any} body
 * @returns {any}
 */
function jsonResponse(status, body) {
	return {
		ok: status < 400,
		status,
		json: async () => body
	};
}
