import { describe, expect, it } from 'vitest';
import { cn } from './utils.js';

describe('cn', () => {
	it('joins class names', () => {
		expect(cn('a', 'b')).toBe('a b');
	});

	it('drops falsy values', () => {
		const disabled = false;
		expect(cn('a', disabled && 'b', undefined, null, 'c')).toBe('a c');
	});

	it('lets later tailwind utilities win over earlier conflicting ones', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});
});
