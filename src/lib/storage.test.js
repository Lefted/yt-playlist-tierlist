import { afterEach, describe, expect, it, vi } from 'vitest';
import { load, remove, save, STORAGE_PREFIX } from './storage.js';
import { createLocalStorageStub } from './testing/fixtures.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * @param {Record<string, string>} [initial]
 * @returns {ReturnType<typeof createLocalStorageStub>}
 */
function useStore(initial) {
	const stub = createLocalStorageStub(initial);
	vi.stubGlobal('localStorage', stub);
	return stub;
}

describe('save / load', () => {
	it('round-trips a value under the namespaced key', () => {
		const store = useStore();
		expect(save('library', { a: 1 })).toBe(true);
		expect(store.entries.get(`${STORAGE_PREFIX}library`)).toBe('{"a":1}');
		expect(load('library', null)).toEqual({ a: 1 });
	});

	it('returns the fallback for a missing key', () => {
		useStore();
		expect(load('nothing', 'fallback')).toBe('fallback');
	});

	it('treats corrupted JSON as missing', () => {
		useStore({ [`${STORAGE_PREFIX}library`]: '{not json' });
		expect(load('library', 'fallback')).toBe('fallback');
	});

	it('survives a store that throws on read', () => {
		const store = useStore();
		store.getItem = () => {
			throw new Error('blocked');
		};
		expect(load('library', 'fallback')).toBe('fallback');
	});

	it('reports a failed write instead of throwing', () => {
		const store = useStore();
		store.setItem = () => {
			throw new Error('QuotaExceededError');
		};
		expect(save('library', { a: 1 })).toBe(false);
	});

	it('reports a failed write for values that cannot be serialised', () => {
		useStore();
		/** @type {any} */
		const circular = {};
		circular.self = circular;
		expect(save('library', circular)).toBe(false);
	});
});

describe('remove', () => {
	it('drops the namespaced key', () => {
		const store = useStore({ [`${STORAGE_PREFIX}library`]: '{"a":1}' });
		expect(remove('library')).toBe(true);
		expect(store.entries.size).toBe(0);
	});
});

describe('without localStorage', () => {
	it('falls back on read and reports failure on write', () => {
		vi.stubGlobal('localStorage', undefined);
		expect(load('library', 'fallback')).toBe('fallback');
		expect(save('library', { a: 1 })).toBe(false);
		expect(remove('library')).toBe(false);
	});
});
