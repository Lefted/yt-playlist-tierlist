import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SORT,
	filterVideos,
	matchesSearch,
	PAGE_SIZE,
	SORT_OPTIONS,
	sortVideos
} from './filters.js';
import { makeVideo } from '$lib/testing/fixtures.js';

/**
 * @param {string} id
 * @param {Partial<import('$lib/types.js').Video>} [overrides]
 */
function video(id, overrides = {}) {
	return makeVideo({ id, ...overrides });
}

describe('matchesSearch', () => {
	it('matches every video on a blank query', () => {
		expect(matchesSearch(video('a'), '')).toBe(true);
		expect(matchesSearch(video('a'), '   ')).toBe(true);
	});

	it('matches the title case-insensitively', () => {
		const clip = video('a', { title: 'Bad Apple AMV' });
		expect(matchesSearch(clip, 'bad apple')).toBe(true);
		expect(matchesSearch(clip, 'APPLE')).toBe(true);
	});

	it('matches the channel as well as the title', () => {
		const clip = video('a', { title: 'Nothing', channelTitle: 'Studio Ghibli' });
		expect(matchesSearch(clip, 'ghibli')).toBe(true);
	});

	it('requires every term, in any order and across both fields', () => {
		const clip = video('a', { title: 'Bad Apple', channelTitle: 'Touhou' });
		expect(matchesSearch(clip, 'apple touhou')).toBe(true);
		expect(matchesSearch(clip, 'touhou apple')).toBe(true);
		expect(matchesSearch(clip, 'apple naruto')).toBe(false);
	});

	it('survives videos without a title or channel', () => {
		const clip = { ...video('a'), title: '', channelTitle: '' };
		expect(matchesSearch(clip, '')).toBe(true);
		expect(matchesSearch(clip, 'x')).toBe(false);
	});
});

describe('filterVideos', () => {
	const videos = [
		video('s1', { rating: 'S', title: 'Alpha' }),
		video('a1', { rating: 'A', title: 'Beta' }),
		video('u1', { rating: null, title: 'Gamma' }),
		video('gone', { rating: 'F', title: 'Delta', unavailable: true })
	];

	it('hides unavailable videos by default', () => {
		expect(filterVideos(videos).map((v) => v.id)).toEqual(['s1', 'a1', 'u1']);
	});

	it('keeps unavailable videos when asked to', () => {
		expect(filterVideos(videos, { hideUnavailable: false }).map((v) => v.id)).toEqual([
			's1',
			'a1',
			'u1',
			'gone'
		]);
	});

	it('shows everything when no bucket is selected', () => {
		expect(filterVideos(videos, { tiers: [], unrated: false })).toHaveLength(3);
	});

	it('keeps only the selected tiers', () => {
		expect(filterVideos(videos, { tiers: ['S'] }).map((v) => v.id)).toEqual(['s1']);
		expect(filterVideos(videos, { tiers: ['S', 'A'] }).map((v) => v.id)).toEqual(['s1', 'a1']);
	});

	it('excludes unrated videos while a tier filter is active', () => {
		expect(filterVideos(videos, { tiers: ['S'] }).some((v) => v.rating === null)).toBe(false);
	});

	it('adds the unrated bucket on top of the selected tiers', () => {
		expect(filterVideos(videos, { tiers: ['S'], unrated: true }).map((v) => v.id)).toEqual([
			's1',
			'u1'
		]);
	});

	it('shows only unrated videos when the unrated bucket is the only one selected', () => {
		expect(filterVideos(videos, { unrated: true }).map((v) => v.id)).toEqual(['u1']);
	});

	it('combines the search with the buckets', () => {
		expect(filterVideos(videos, { tiers: ['S', 'A'], search: 'beta' }).map((v) => v.id)).toEqual([
			'a1'
		]);
	});

	it('can surface an unavailable video through its tier', () => {
		expect(filterVideos(videos, { tiers: ['F'], hideUnavailable: false }).map((v) => v.id)).toEqual(
			['gone']
		);
	});

	it('preserves the incoming order', () => {
		const reversed = [...videos].reverse();
		expect(filterVideos(reversed, { hideUnavailable: false }).map((v) => v.id)).toEqual([
			'gone',
			'u1',
			'a1',
			's1'
		]);
	});

	it('does not mutate its input', () => {
		const input = [...videos];
		filterVideos(input, { tiers: ['S'] });
		expect(input).toHaveLength(4);
	});
});

describe('sortVideos', () => {
	const videos = [
		video('1', { title: 'charlie', rating: 'C' }),
		video('2', { title: 'Alpha', rating: null }),
		video('3', { title: 'bravo', rating: 'S' }),
		video('4', { title: 'Delta', rating: 'C' })
	];

	it('leaves the playlist order untouched', () => {
		expect(sortVideos(videos, 'playlist').map((v) => v.id)).toEqual(['1', '2', '3', '4']);
	});

	it('defaults to the playlist order', () => {
		expect(sortVideos(videos).map((v) => v.id)).toEqual(
			sortVideos(videos, DEFAULT_SORT).map((v) => v.id)
		);
	});

	it('sorts by rating, best first, unrated last', () => {
		expect(sortVideos(videos, 'rating').map((v) => v.rating)).toEqual(['S', 'C', 'C', null]);
	});

	it('keeps equally rated videos in playlist order', () => {
		expect(
			sortVideos(videos, 'rating')
				.filter((v) => v.rating === 'C')
				.map((v) => v.id)
		).toEqual(['1', '4']);
	});

	it('sorts by title, ignoring case', () => {
		expect(sortVideos(videos, 'title').map((v) => v.title)).toEqual([
			'Alpha',
			'bravo',
			'charlie',
			'Delta'
		]);
	});

	it('sorts numbers inside titles naturally', () => {
		const numbered = [video('a', { title: 'Part 10' }), video('b', { title: 'Part 2' })];
		expect(sortVideos(numbered, 'title').map((v) => v.title)).toEqual(['Part 2', 'Part 10']);
	});

	it('returns a copy and never mutates the input', () => {
		const input = [...videos];
		const sorted = sortVideos(input, 'title');
		expect(sorted).not.toBe(input);
		expect(input.map((v) => v.id)).toEqual(['1', '2', '3', '4']);
	});

	it('falls back to the playlist order for an unknown key', () => {
		expect(sortVideos(videos, 'nonsense').map((v) => v.id)).toEqual(['1', '2', '3', '4']);
	});
});

describe('constants', () => {
	it('offers exactly the three sort orders the toolbar shows', () => {
		expect(SORT_OPTIONS.map((option) => option.value)).toEqual(['playlist', 'rating', 'title']);
	});

	it('pages long playlists', () => {
		expect(PAGE_SIZE).toBe(60);
	});
});
