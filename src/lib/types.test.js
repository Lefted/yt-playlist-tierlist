import { describe, expect, it } from 'vitest';
import { createRatingCounts, isBetterOrEqual, isRating, RATING_ORDER } from './types.js';

describe('RATING_ORDER', () => {
	it('runs from best to worst', () => {
		expect(RATING_ORDER).toEqual(['S', 'A', 'B', 'C', 'D', 'F']);
	});
});

describe('isRating', () => {
	it('accepts every tier', () => {
		for (const rating of RATING_ORDER) expect(isRating(rating)).toBe(true);
	});

	it('rejects everything else', () => {
		for (const value of [null, undefined, '', 's', 'G', 'unavailable', 0, {}]) {
			expect(isRating(value)).toBe(false);
		}
	});
});

describe('isBetterOrEqual', () => {
	it('is true for a better tier', () => {
		expect(isBetterOrEqual('S', 'A')).toBe(true);
		expect(isBetterOrEqual('B', 'F')).toBe(true);
	});

	it('is true for the same tier', () => {
		expect(isBetterOrEqual('C', 'C')).toBe(true);
	});

	it('is false for a worse tier', () => {
		expect(isBetterOrEqual('A', 'S')).toBe(false);
		expect(isBetterOrEqual('F', 'D')).toBe(false);
	});

	it('is false when either side is not a rating', () => {
		expect(isBetterOrEqual(null, 'A')).toBe(false);
		expect(isBetterOrEqual('A', null)).toBe(false);
		expect(isBetterOrEqual('unavailable', 'A')).toBe(false);
	});
});

describe('createRatingCounts', () => {
	it('starts at zero for every tier', () => {
		expect(createRatingCounts()).toEqual({ S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 });
	});

	it('hands out a fresh object every time', () => {
		const first = createRatingCounts();
		first.S = 5;
		expect(createRatingCounts().S).toBe(0);
	});
});
