import { beforeEach, describe, expect, it } from 'vitest';
import { auth, ME_ENDPOINT } from './auth.svelte.js';

/** @typedef {import('$lib/server/auth/users.js').PublicUser} PublicUser */

/** @type {PublicUser} */
const MORITZ = { id: 'u1', email: 'moritz@example.com', displayName: 'Moritz', role: 'user' };

/**
 * A `fetch` that answers `/api/v1/me` with whatever the test wants.
 *
 * @param {{ ok?: boolean, status?: number, body?: unknown, throws?: boolean }} answer
 * @returns {{ fetch: typeof globalThis.fetch, calls: string[] }}
 */
function fakeFetch({ ok = true, status = 200, body = { user: MORITZ }, throws = false }) {
	/** @type {string[]} */
	const calls = [];

	const fetch = /** @type {typeof globalThis.fetch} */ (
		/** @type {unknown} */ (
			async (/** @type {string} */ url) => {
				calls.push(url);
				if (throws) throw new TypeError('Failed to fetch');
				return { ok, status, json: async () => body };
			}
		)
	);

	return { fetch, calls };
}

describe('the auth store', () => {
	beforeEach(() => auth.set(null));

	it('starts with nobody signed in', () => {
		expect(auth.user).toBe(null);
		expect(auth.isAdmin).toBe(false);
	});

	it('reads the account from /api/v1/me', async () => {
		const { fetch, calls } = fakeFetch({});

		await expect(auth.load(fetch)).resolves.toEqual(MORITZ);

		expect(calls).toEqual([ME_ENDPOINT]);
		expect(auth.user).toEqual(MORITZ);
	});

	it('treats a 401 as "nobody", because that is what it means on /login', async () => {
		auth.set(MORITZ);

		const { fetch } = fakeFetch({ ok: false, status: 401, body: {} });

		await expect(auth.load(fetch)).resolves.toBe(null);
		expect(auth.user).toBe(null);
	});

	it('treats an offline start as "nobody" rather than as an error screen', async () => {
		auth.set(MORITZ);

		const { fetch } = fakeFetch({ throws: true });

		await expect(auth.load(fetch)).resolves.toBe(null);
		expect(auth.user).toBe(null);
	});

	it('survives an answer that is not the shape it expected', async () => {
		const { fetch } = fakeFetch({ body: { nothing: true } });

		await expect(auth.load(fetch)).resolves.toBe(null);
	});

	it('knows an admin from a user', async () => {
		await auth.load(fakeFetch({ body: { user: { ...MORITZ, role: 'admin' } } }).fetch);

		expect(auth.isAdmin).toBe(true);

		await auth.load(fakeFetch({}).fetch);

		expect(auth.isAdmin).toBe(false);
	});
});
