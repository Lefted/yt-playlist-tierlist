import { describe, expect, it } from 'vitest';
import { parseRateParams, rateQuery } from './params.js';

/**
 * @param {string} query
 * @returns {URLSearchParams}
 */
function params(query) {
	return new URL(`https://example.test/rate${query}`).searchParams;
}

describe('parseRateParams', () => {
	it('defaults to no video, no tier filter and unrated included', () => {
		expect(parseRateParams(params(''))).toEqual({
			videoId: null,
			tiers: [],
			includeUnrated: true
		});
	});

	it('survives a missing search params object', () => {
		expect(parseRateParams(null).videoId).toBeNull();
		expect(parseRateParams(undefined).includeUnrated).toBe(true);
	});

	it('reads the start video', () => {
		expect(parseRateParams(params('?v=M7lc1UVf-VE')).videoId).toBe('M7lc1UVf-VE');
	});

	it('treats a blank v as none', () => {
		expect(parseRateParams(params('?v=%20')).videoId).toBeNull();
	});

	it('reads tiers case-insensitively and in RATING_ORDER', () => {
		expect(parseRateParams(params('?tiers=c,s,a')).tiers).toEqual(['S', 'A', 'C']);
	});

	it('drops unknown tiers instead of failing', () => {
		expect(parseRateParams(params('?tiers=S,Z,,A')).tiers).toEqual(['S', 'A']);
		expect(parseRateParams(params('?tiers=nonsense')).tiers).toEqual([]);
	});

	it('deduplicates repeated tiers', () => {
		expect(parseRateParams(params('?tiers=S,S,A')).tiers).toEqual(['S', 'A']);
	});

	it.each(['0', 'false', 'no', 'off', 'FALSE'])('reads unrated=%s as excluded', (value) => {
		expect(parseRateParams(params(`?unrated=${value}`)).includeUnrated).toBe(false);
	});

	it.each(['1', 'true', 'yes', ''])('reads unrated=%s as included', (value) => {
		expect(parseRateParams(params(`?unrated=${value}`)).includeUnrated).toBe(true);
	});
});

describe('rateQuery', () => {
	it('is empty for the default filter', () => {
		expect(rateQuery({ tiers: [], includeUnrated: true })).toBe('');
	});

	it('serialises tiers in RATING_ORDER, unescaped', () => {
		expect(rateQuery({ tiers: new Set(['C', 'S']), includeUnrated: true })).toBe('?tiers=S,C');
	});

	it('combines both parameters', () => {
		expect(rateQuery({ tiers: ['A'], includeUnrated: false })).toBe('?tiers=A&unrated=0');
	});

	it('records an excluded unrated', () => {
		expect(rateQuery({ tiers: [], includeUnrated: false })).toBe('?unrated=0');
	});

	it('ignores values that are not tiers', () => {
		expect(rateQuery({ tiers: /** @type {any} */ (['S', 'Z']), includeUnrated: true })).toBe(
			'?tiers=S'
		);
	});

	it('round-trips through parseRateParams', () => {
		const filter = { tiers: ['S', 'D'], includeUnrated: false };
		const parsed = parseRateParams(params(rateQuery(filter)));
		expect(parsed.tiers).toEqual(filter.tiers);
		expect(parsed.includeUnrated).toBe(false);
	});
});
