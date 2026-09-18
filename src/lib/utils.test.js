import { describe, expect, it } from 'vitest';
import { cn, percentOf } from './utils.js';

// Smoke test: proves the test pipeline runs and that $lib/utils really exports `cn`,
// which every ui component imports.
describe('cn', () => {
	it('joins class names', () => {
		expect(cn('a', 'b')).toBe('a b');
	});
});

describe('percentOf', () => {
	it('rounds to whole percent', () => {
		expect(percentOf(1, 3)).toBe(33);
		expect(percentOf(2, 3)).toBe(67);
		expect(percentOf(915, 915)).toBe(100);
	});

	it('returns 0 instead of NaN or Infinity', () => {
		expect(percentOf(0, 0)).toBe(0);
		expect(percentOf(5, 0)).toBe(0);
		expect(percentOf(Number.NaN, 10)).toBe(0);
		expect(percentOf(1, Number.POSITIVE_INFINITY)).toBe(0);
	});

	it('clamps out-of-range input', () => {
		expect(percentOf(20, 10)).toBe(100);
		expect(percentOf(-5, 10)).toBe(0);
	});
});
