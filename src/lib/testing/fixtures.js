/**
 * Test-only helpers. Nothing in `src/routes` imports this module, so it never ends
 * up in the bundle.
 */

import { vi } from 'vitest';
import { STORAGE_PREFIX } from '../storage.js';

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
 * The raw `localStorage` entry a library with these playlists would have written.
 *
 * @param {Playlist[]} playlists
 * @param {string|null} [activePlaylistId] - Defaults to the first playlist.
 * @returns {Record<string, string>}
 */
export function storedLibrary(playlists, activePlaylistId) {
	return {
		[`${STORAGE_PREFIX}library`]: JSON.stringify({
			version: 1,
			activePlaylistId: activePlaylistId ?? playlists[0]?.id ?? null,
			playlists
		})
	};
}
