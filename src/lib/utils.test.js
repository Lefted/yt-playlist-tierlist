import { describe, expect, it } from 'vitest';
import { cn } from './utils.js';

// Smoke test: proves the test pipeline runs and that $lib/utils really exports `cn`,
// which every ui component imports.
describe('cn', () => {
	it('joins class names', () => {
		expect(cn('a', 'b')).toBe('a b');
	});
});
