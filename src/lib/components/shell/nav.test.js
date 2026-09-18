import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isActiveRoute, navItemsFor } from './nav.js';

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
});

describe('navItemsFor', () => {
	it('marks exactly the current destination active', () => {
		const items = navItemsFor('/rate');
		expect(items.map((item) => [item.route, item.active])).toEqual([
			['/browse', false],
			['/rate', true]
		]);
	});

	it('marks nothing active outside the known destinations', () => {
		expect(navItemsFor('/does-not-exist').some((item) => item.active)).toBe(false);
	});

	it('carries the label and icon of each destination', () => {
		const items = navItemsFor('/browse');
		expect(items.map((item) => item.label)).toEqual(['Browse', 'Rate']);
		expect(items.every((item) => typeof item.icon === 'function')).toBe(true);
	});
});
