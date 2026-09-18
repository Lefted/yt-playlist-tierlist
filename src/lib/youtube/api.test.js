import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	fetchPlaylistMeta,
	fetchPlaylistVideos,
	parseIsoDuration,
	parsePlaylistInput,
	YouTubeApiError
} from './api.js';
import { playlistItemResource, stubFetch } from '../testing/fixtures.js';

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
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('parsePlaylistInput', () => {
	it('accepts a bare playlist id', () => {
		expect(parsePlaylistInput('PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc')).toBe(
			'PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc'
		);
	});

	it('trims whitespace', () => {
		expect(parsePlaylistInput('  PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc  ')).toBe(
			'PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc'
		);
	});

	it('accepts the other playlist id prefixes', () => {
		for (const id of ['UUZbXA4lyCtqoc4dKMILBiS', 'OLAK5uy_l1234567890abc', 'RDZbXA4lyCtqoc4d']) {
			expect(parsePlaylistInput(id)).toBe(id);
		}
	});

	it('does not mistake an arbitrary word for a bare id', () => {
		expect(parsePlaylistInput('hello')).toBeNull();
		expect(parsePlaylistInput('playlist')).toBeNull();
		// Right prefix, far too short to be a real id.
		expect(parsePlaylistInput('PLabc123')).toBeNull();
	});

	it('still trusts anything list= points at', () => {
		expect(parsePlaylistInput('https://www.youtube.com/playlist?list=WL')).toBe('WL');
	});

	it('reads list= from a watch URL', () => {
		expect(
			parsePlaylistInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&index=3')
		).toBe('PLabc123');
	});

	it('reads list= from a playlist URL', () => {
		expect(parsePlaylistInput('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
	});

	it('reads list= from a short URL with a fragment', () => {
		expect(parsePlaylistInput('https://youtu.be/dQw4w9WgXcQ?list=PLabc123#t=10')).toBe('PLabc123');
	});

	it('rejects garbage', () => {
		expect(parsePlaylistInput('not a playlist')).toBeNull();
		expect(parsePlaylistInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
		expect(parsePlaylistInput('')).toBeNull();
		expect(parsePlaylistInput('   ')).toBeNull();
		expect(parsePlaylistInput(null)).toBeNull();
		expect(parsePlaylistInput(42)).toBeNull();
	});
});

describe('parseIsoDuration', () => {
	it('parses minutes and seconds', () => {
		expect(parseIsoDuration('PT4M13S')).toBe(253);
	});

	it('parses hours', () => {
		expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
	});

	it('parses days and weeks', () => {
		expect(parseIsoDuration('P1DT1S')).toBe(86401);
		expect(parseIsoDuration('P1W')).toBe(604800);
	});

	it('parses zero and fractional seconds', () => {
		expect(parseIsoDuration('PT0S')).toBe(0);
		expect(parseIsoDuration('PT1M30.4S')).toBe(90);
	});

	it('returns null for anything that is not a duration', () => {
		for (const value of ['', 'P', 'PT', '4M13S', 'hello', undefined, null, 42]) {
			expect(parseIsoDuration(value)).toBeNull();
		}
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

	it('fails with keyInvalid when no key was given', async () => {
		const fetch = stubFetch([]);
		await expect(fetchPlaylistMeta('', 'PLabc')).rejects.toMatchObject({ reason: 'keyInvalid' });
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

		/** @type {any[]} */
		const progress = [];
		const videos = await fetchPlaylistVideos('KEY', 'PLabc', (event) => progress.push(event));

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

		expect(progress).toEqual([
			{ phase: 'items', loaded: 2, total: 3 },
			{ phase: 'items', loaded: 3, total: 3 },
			{ phase: 'durations', loaded: 3, total: 3 }
		]);
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
