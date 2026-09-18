import { describe, expect, it } from 'vitest';
import {
	countNewRatings,
	mergePlaylist,
	normalizePlaylist,
	normalizeVideo,
	orderedVideos,
	reconcileOrder
} from './playlist.js';
import { makePlaylist, makeVideo } from './testing/fixtures.js';

const NOW = '2025-01-01T00:00:00.000Z';

describe('normalizeVideo', () => {
	it('fills in the defaults around a bare id', () => {
		expect(normalizeVideo({ id: 'v1' }, 3)).toEqual({
			id: 'v1',
			title: '',
			description: '',
			thumbnail: '',
			channelTitle: '',
			publishedAt: '',
			position: 3,
			durationSeconds: null,
			rating: null,
			unavailable: false
		});
	});

	it('accepts the legacy "videoId" key', () => {
		expect(normalizeVideo({ videoId: 'v1', title: 'one' }, 0)).toMatchObject({
			id: 'v1',
			title: 'one'
		});
	});

	it('turns the legacy "unavailable" rating into the flag', () => {
		expect(normalizeVideo({ id: 'v1', rating: 'unavailable' }, 0)).toMatchObject({
			rating: null,
			unavailable: true
		});
	});

	it('drops values of the wrong type', () => {
		expect(
			normalizeVideo({ id: 'v1', title: 42, position: 'x', durationSeconds: NaN, rating: 'G' }, 7)
		).toMatchObject({ title: '', position: 7, durationSeconds: null, rating: null });
	});

	it('rejects anything without an id', () => {
		expect(normalizeVideo({ title: 'no id' }, 0)).toBeNull();
		expect(normalizeVideo(null, 0)).toBeNull();
		expect(normalizeVideo('v1', 0)).toBeNull();
	});
});

describe('normalizePlaylist', () => {
	it('rejects a missing id or video array', () => {
		expect(normalizePlaylist({ videos: [] })).toBeNull();
		expect(normalizePlaylist({ id: '  ' })).toBeNull();
		expect(normalizePlaylist({ id: 'PL1' })).toBeNull();
		expect(normalizePlaylist(null)).toBeNull();
	});

	it('drops unusable videos and derives the order', () => {
		const playlist = normalizePlaylist({
			id: ' PL1 ',
			videos: [{ id: 'v2', position: 1 }, { title: 'no id' }, { id: 'v1', position: 0 }]
		});

		expect(playlist?.id).toBe('PL1');
		expect(playlist?.videos.map((video) => video.id)).toEqual(['v2', 'v1']);
		expect(playlist?.order).toEqual(['v1', 'v2']);
		expect(playlist?.itemCount).toBe(2);
	});
});

describe('reconcileOrder', () => {
	const videos = [
		makeVideo({ id: 'v1', position: 0 }),
		makeVideo({ id: 'v2', position: 1 }),
		makeVideo({ id: 'v3', position: 2 })
	];

	it('keeps a stored order and appends what it misses', () => {
		expect(reconcileOrder(['v3', 'v1'], videos)).toEqual(['v3', 'v1', 'v2']);
	});

	it('drops unknown ids and duplicates', () => {
		expect(reconcileOrder(['v3', 'v3', 'gone', 42, 'v2'], videos)).toEqual(['v3', 'v2', 'v1']);
	});

	it('falls back to position order', () => {
		expect(reconcileOrder(null, videos)).toEqual(['v1', 'v2', 'v3']);
	});
});

describe('orderedVideos', () => {
	it('applies the order and appends anything it does not mention', () => {
		const playlist = makePlaylist({
			id: 'PL1',
			videos: [makeVideo({ id: 'v1' }), makeVideo({ id: 'v2' }), makeVideo({ id: 'v3' })]
		});
		playlist.order = ['v3', 'gone'];

		expect(orderedVideos(playlist).map((video) => video.id)).toEqual(['v3', 'v1', 'v2']);
	});

	it('is empty without a playlist', () => {
		expect(orderedVideos(null)).toEqual([]);
	});
});

describe('mergePlaylist', () => {
	/** @returns {import('./types.js').Playlist} */
	function existing() {
		return makePlaylist({
			id: 'PL1',
			title: 'Old title',
			importedAt: '2024-01-01T00:00:00Z',
			videos: [
				makeVideo({ id: 'v1', position: 0, rating: 'S' }),
				makeVideo({ id: 'v2', position: 1, unavailable: true }),
				makeVideo({ id: 'v3', position: 2 })
			]
		});
	}

	/** @returns {import('./types.js').Playlist} */
	function incoming() {
		return makePlaylist({
			id: 'PL1',
			title: 'New title',
			videos: [
				makeVideo({ id: 'v1', position: 0 }),
				makeVideo({ id: 'v2', position: 1 }),
				makeVideo({ id: 'v4', position: 2 })
			]
		});
	}

	it('takes the incoming playlist as-is when there is nothing to merge with', () => {
		const merged = mergePlaylist(null, incoming(), NOW);
		expect(merged.updatedAt).toBe(NOW);
		expect(merged.importedAt).toBe('2024-01-01T00:00:00Z');
		expect(merged.order).toEqual(['v1', 'v2', 'v4']);
	});

	it('keeps local ratings, appends new videos and retires the vanished ones', () => {
		const merged = mergePlaylist(existing(), incoming(), NOW);

		expect(merged.videos.map((video) => video.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
		expect(merged.videos.map((video) => video.rating)).toEqual(['S', null, null, null]);
		expect(merged.videos.map((video) => video.unavailable)).toEqual([false, true, true, false]);
		expect(merged.order).toEqual(['v1', 'v2', 'v3', 'v4']);
	});

	it('leaves videos a partial source omits alone', () => {
		// A restored backup speaks only for what it contains: v3 is missing from it
		// because the file is older, not because YouTube dropped the video.
		const merged = mergePlaylist(existing(), incoming(), NOW, { complete: false });

		expect(merged.videos.map((video) => video.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
		expect(merged.videos.map((video) => video.unavailable)).toEqual([false, true, false, false]);
		expect(merged.videos.map((video) => video.rating)).toEqual(['S', null, null, null]);
	});

	it('never resurrects a video the player reported as broken', () => {
		// v2 is unavailable locally but comes back as playable from the API.
		const merged = mergePlaylist(existing(), incoming(), NOW);
		expect(merged.videos[1]).toMatchObject({ id: 'v2', unavailable: true });
	});

	it('refreshes the metadata but keeps the first import date', () => {
		const merged = mergePlaylist(existing(), incoming(), NOW);
		expect(merged.title).toBe('New title');
		expect(merged.importedAt).toBe('2024-01-01T00:00:00Z');
		expect(merged.updatedAt).toBe(NOW);
	});

	it('keeps the existing playback order and appends new videos to it', () => {
		const before = existing();
		before.order = ['v3', 'v1', 'v2'];
		expect(mergePlaylist(before, incoming(), NOW).order).toEqual(['v3', 'v1', 'v2', 'v4']);
	});

	it('does not lose a duration the refresh did not report', () => {
		const before = existing();
		before.videos[0].durationSeconds = 240;
		const fresh = incoming();
		fresh.videos[0].durationSeconds = null;
		expect(mergePlaylist(before, fresh, NOW).videos[0].durationSeconds).toBe(240);
	});
});

describe('countNewRatings', () => {
	it('counts every rating of a playlist that is not there yet', () => {
		const fresh = makePlaylist({
			id: 'PL1',
			videos: [makeVideo({ id: 'v1', rating: 'S' }), makeVideo({ id: 'v2' })]
		});
		expect(countNewRatings(null, fresh)).toBe(1);
	});

	it('only counts ratings that fill an unrated video', () => {
		const before = makePlaylist({
			id: 'PL1',
			videos: [makeVideo({ id: 'v1', rating: 'A' }), makeVideo({ id: 'v2' })]
		});
		const fresh = makePlaylist({
			id: 'PL1',
			videos: [makeVideo({ id: 'v1', rating: 'S' }), makeVideo({ id: 'v2', rating: 'B' })]
		});
		expect(countNewRatings(before, fresh)).toBe(1);
	});
});
