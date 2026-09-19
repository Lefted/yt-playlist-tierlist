/**
 * The server's YouTube client, against a stubbed `fetch`.
 *
 * These cases moved here with the calls themselves (#17): the browser no longer
 * talks to Google, so paging, duration batching and the reason mapping are the
 * server's behaviour now. The pure helpers stayed in `src/lib/youtube/api.js` and
 * are tested next to it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	fetchPlaylistMeta,
	fetchPlaylistVideos,
	requireApiKey,
	YouTubeApiError
} from './youtube.js';
import { playlistItemResource, stubFetch } from '../testing/fixtures.js';

/** The config module reads `$env/dynamic/private`, which only exists inside Vite. */
vi.mock('./config.js', () => ({
	serverConfig: () => ({ youtubeApiKey: configuredKey })
}));

/** @type {string|null} What the mocked config reports; `requireApiKey` is the reader. */
let configuredKey = 'AIza-server';

/**
 * @param {import('vitest').Mock} fetch
 * @returns {URL[]}
 */
function calledUrls(fetch) {
	return fetch.mock.calls.map((call) => new URL(call[0]));
}

/**
 * @param {string} reason
 * @param {string} [message]
 * @returns {any}
 */
function apiError(reason, message = 'boom') {
	return { error: { code: 403, message, errors: [{ reason }] } };
}

beforeEach(() => {
	configuredKey = 'AIza-server';
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('requireApiKey', () => {
	it('hands back the configured key', () => {
		expect(requireApiKey()).toBe('AIza-server');
	});

	it('refuses with keyMissing when the server was started without one', () => {
		configuredKey = null;
		expect(() => requireApiKey()).toThrowError(
			expect.objectContaining({ name: 'YouTubeApiError', reason: 'keyMissing' })
		);
	});
});

describe('fetchPlaylistMeta', () => {
	it('maps the playlist resource', async () => {
		const fetch = stubFetch([
			{
				body: {
					items: [
						{
							id: 'PLabc123',
							snippet: {
								title: 'AMVs',
								description: 'best of',
								channelTitle: 'Me',
								thumbnails: { high: { url: 'high.jpg' }, maxres: { url: 'max.jpg' } }
							},
							contentDetails: { itemCount: 42 }
						}
					]
				}
			}
		]);

		await expect(fetchPlaylistMeta('KEY', 'PLabc123')).resolves.toEqual({
			id: 'PLabc123',
			title: 'AMVs',
			description: 'best of',
			channelTitle: 'Me',
			thumbnail: 'max.jpg',
			itemCount: 42
		});

		const [url] = calledUrls(fetch);
		expect(url.pathname).toBe('/youtube/v3/playlists');
		expect(url.searchParams.get('part')).toBe('snippet,contentDetails');
		expect(url.searchParams.get('id')).toBe('PLabc123');
		expect(url.searchParams.get('key')).toBe('KEY');
	});

	it('fails with playlistNotFound for an empty result', async () => {
		stubFetch([{ body: { items: [] } }]);
		await expect(fetchPlaylistMeta('KEY', 'PLnope')).rejects.toMatchObject({
			name: 'YouTubeApiError',
			reason: 'playlistNotFound'
		});
	});

	it('fails with keyMissing before calling anything when there is no key', async () => {
		const fetch = stubFetch([]);
		await expect(fetchPlaylistMeta('', 'PLabc')).rejects.toMatchObject({ reason: 'keyMissing' });
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('fetchPlaylistVideos', () => {
	it('walks every page and resolves durations', async () => {
		const fetch = stubFetch([
			{
				body: {
					items: [
						playlistItemResource('vid1', { position: 0 }),
						playlistItemResource('vid2', { position: 1 })
					],
					nextPageToken: 'PAGE2',
					pageInfo: { totalResults: 3 }
				}
			},
			{
				body: {
					items: [playlistItemResource('vid3', { position: 2 })],
					pageInfo: { totalResults: 3 }
				}
			},
			{
				body: {
					items: [
						{ id: 'vid1', contentDetails: { duration: 'PT3M30S' } },
						{ id: 'vid2', contentDetails: { duration: 'PT1H' } },
						{ id: 'vid3', contentDetails: { duration: 'PT10S' } }
					]
				}
			}
		]);

		const videos = await fetchPlaylistVideos('KEY', 'PLabc');

		expect(videos.map((video) => video.id)).toEqual(['vid1', 'vid2', 'vid3']);
		expect(videos.map((video) => video.durationSeconds)).toEqual([210, 3600, 10]);
		expect(videos[0]).toMatchObject({
			title: 'Title vid1',
			channelTitle: 'Uploader',
			thumbnail: 'https://i.ytimg.com/vi/vid1/hq.jpg',
			publishedAt: '2024-05-05T00:00:00Z',
			position: 0,
			rating: null,
			unavailable: false
		});

		const urls = calledUrls(fetch);
		expect(urls).toHaveLength(3);
		expect(urls[0].searchParams.get('part')).toBe('snippet,contentDetails');
		expect(urls[0].searchParams.get('maxResults')).toBe('50');
		expect(urls[0].searchParams.has('pageToken')).toBe(false);
		expect(urls[1].searchParams.get('pageToken')).toBe('PAGE2');
		expect(urls[2].pathname).toBe('/youtube/v3/videos');
		expect(urls[2].searchParams.get('id')).toBe('vid1,vid2,vid3');
	});

	it('asks for durations in batches of 50', async () => {
		const items = Array.from({ length: 60 }, (_, index) =>
			playlistItemResource(`vid${index}`, { position: index })
		);
		const fetch = stubFetch([
			{ body: { items, pageInfo: { totalResults: 60 } } },
			{ body: { items: [] } },
			{ body: { items: [] } }
		]);

		const videos = await fetchPlaylistVideos('KEY', 'PLabc');

		expect(videos).toHaveLength(60);
		const urls = calledUrls(fetch);
		expect(urls).toHaveLength(3);
		expect(urls[1].searchParams.get('id')?.split(',')).toHaveLength(50);
		expect(urls[2].searchParams.get('id')?.split(',')).toHaveLength(10);
	});

	it('flags private, deleted and id-less entries as unavailable', async () => {
		stubFetch([
			{
				body: {
					items: [
						playlistItemResource('vid1', { title: 'Private video' }),
						playlistItemResource('vid2', { title: 'Deleted video' }),
						playlistItemResource('vid3', { noResourceId: true }),
						playlistItemResource('vid4')
					]
				}
			},
			{ body: { items: [{ id: 'vid4', contentDetails: { duration: 'PT5S' } }] } }
		]);

		const videos = await fetchPlaylistVideos('KEY', 'PLabc');

		expect(videos.map((video) => video.unavailable)).toEqual([true, true, true, false]);
		// An entry without a video id still needs a stable id of its own.
		expect(videos[2].id).toBe('item-vid3');
		expect(videos[3].durationSeconds).toBe(5);
	});

	it('skips the duration request when nothing is playable', async () => {
		const fetch = stubFetch([
			{ body: { items: [playlistItemResource('vid1', { title: 'Private video' })] } }
		]);

		await fetchPlaylistVideos('KEY', 'PLabc');
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe('error mapping', () => {
	/**
	 * @param {any} body
	 * @param {number} status
	 * @returns {Promise<YouTubeApiError>}
	 */
	async function failure(body, status) {
		stubFetch([{ body, status, ok: false }]);
		try {
			await fetchPlaylistMeta('KEY', 'PLabc');
		} catch (error) {
			return /** @type {YouTubeApiError} */ (error);
		}
		throw new Error('expected the request to fail');
	}

	it('maps quota errors', async () => {
		const error = await failure(apiError('quotaExceeded', 'out of quota'), 403);
		expect(error).toBeInstanceOf(YouTubeApiError);
		expect(error.reason).toBe('quotaExceeded');
		expect(error.message).toBe('out of quota');
		expect(error.status).toBe(403);
	});

	it('maps rate limits onto the quota reason', async () => {
		expect((await failure(apiError('rateLimitExceeded'), 403)).reason).toBe('quotaExceeded');
	});

	it('maps key errors', async () => {
		expect((await failure(apiError('keyInvalid'), 400)).reason).toBe('keyInvalid');
		expect((await failure({}, 400)).reason).toBe('keyInvalid');
	});

	it('maps missing playlists', async () => {
		expect((await failure(apiError('playlistNotFound'), 404)).reason).toBe('playlistNotFound');
		expect((await failure({}, 404)).reason).toBe('playlistNotFound');
	});

	it('falls back to unknown', async () => {
		expect((await failure(apiError('backendError'), 500)).reason).toBe('unknown');
	});

	it('maps a failing fetch onto network', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		await expect(fetchPlaylistMeta('KEY', 'PLabc')).rejects.toMatchObject({ reason: 'network' });
	});

	it('maps an error body that arrives with HTTP 200', async () => {
		stubFetch([{ body: apiError('quotaExceeded'), status: 200 }]);
		await expect(fetchPlaylistMeta('KEY', 'PLabc')).rejects.toMatchObject({
			reason: 'quotaExceeded'
		});
	});

	it('maps an unreadable body onto unknown', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => {
					throw new SyntaxError('Unexpected token');
				}
			}))
		);
		await expect(fetchPlaylistMeta('KEY', 'PLabc')).rejects.toMatchObject({ reason: 'unknown' });
	});
});
