import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isActiveRoute } from './nav.js';

describe('NAV_ITEMS', () => {
	it('lists the two top-level destinations', () => {
		expect(NAV_ITEMS.map((item) => item.route)).toEqual(['/browse', '/rate']);
	});
});

describe('isActiveRoute', () => {
	it('matches the destination itself', () => {
		expect(isActiveRoute('/browse', '/browse')).toBe(true);
	});

	it('matches sub-routes of the destination', () => {
		expect(isActiveRoute('/browse', '/browse/PL123')).toBe(true);
	});

	it('does not match a different route with the same prefix', () => {
		expect(isActiveRoute('/browse', '/browsers')).toBe(false);
	});

	it('does not match an unrelated route', () => {
		expect(isActiveRoute('/browse', '/rate')).toBe(false);
	});

	it('treats a base-path root as active only for itself', () => {
		expect(isActiveRoute('/app/', '/app/')).toBe(true);
		expect(isActiveRoute('/app/', '/app/browse')).toBe(true);
	});
});
