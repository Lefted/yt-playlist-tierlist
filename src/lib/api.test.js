import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, ApiError, apiFetch } from './api.js';
import { jsonMutationGuard } from './server/http.js';

/**
 * Stub `fetch` and hand back what it was called with.
 *
 * @param {{ status?: number, body?: any, throws?: unknown }} [answer]
 * @returns {import('vitest').Mock}
 */
function stub(answer = {}) {
	const fetch = vi.fn(async () => {
		if (answer.throws) throw answer.throws;
		const status = answer.status ?? 200;
		return { ok: status < 400, status, json: async () => answer.body ?? null };
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

/**
 * @param {import('vitest').Mock} fetch
 * @returns {{ url: string, init: RequestInit }}
 */
function lastCall(fetch) {
	const [url, init] = fetch.mock.calls.at(-1) ?? [];
	return { url: String(url), init: init ?? {} };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('apiFetch', () => {
	it('puts the path under the API prefix and asks for JSON', async () => {
		const fetch = stub({ body: { ok: true } });

		await expect(apiFetch('/library')).resolves.toEqual({ ok: true });

		const { url, init } = lastCall(fetch);
		expect(url).toBe(`${API_BASE}/library`);
		expect(init.method).toBe('GET');
		expect(/** @type {any} */ (init.headers).accept).toBe('application/json');
	});

	it('does not declare a content type on a read', async () => {
		const fetch = stub({ body: {} });
		await apiFetch('/library');
		expect(/** @type {any} */ (lastCall(fetch).init.headers)['content-type']).toBeUndefined();
	});

	it('declares JSON on every mutation, body or no body', async () => {
		const fetch = stub({ body: {} });

		await apiFetch('/playlists/PL1', { method: 'DELETE' });
		expect(/** @type {any} */ (lastCall(fetch).init.headers)['content-type']).toBe(
			'application/json'
		);

		await apiFetch('/library/active', { method: 'PUT', body: { playlistId: null } });
		const { init } = lastCall(fetch);
		expect(/** @type {any} */ (init.headers)['content-type']).toBe('application/json');
		expect(init.body).toBe('{"playlistId":null}');
	});

	it('produces requests the server’s cross-site check accepts', async () => {
		// The contract between `apiFetch` and `jsonMutationGuard`, held here because
		// the two live on opposite sides of the wire and neither test would catch a
		// bodiless DELETE being refused 415 — which is exactly what happened.
		const fetch = stub({ body: {} });
		const origin = 'https://amv.lefted.dev';

		for (const options of [
			{ method: 'GET' },
			{ method: 'DELETE' },
			{ method: 'PUT', body: { order: [] } },
			{ method: 'PATCH', body: { rating: 'S' } },
			{ method: 'POST', body: { input: 'PL1' } }
		]) {
			await apiFetch('/whatever', options);
			const { url, init } = lastCall(fetch);
			const request = new Request(`${origin}${url}`, {
				...init,
				headers: { ...init.headers, origin }
			});
			expect(jsonMutationGuard(request, origin)).toBeNull();
		}
	});

	it('answers 204 with null', async () => {
		stub({ status: 204 });
		await expect(apiFetch('/whatever', { method: 'DELETE' })).resolves.toBeNull();
	});

	it('turns the error envelope into an ApiError', async () => {
		stub({ status: 503, body: { error: { code: 'quotaExceeded', message: 'Out of quota.' } } });

		await expect(apiFetch('/playlists/import', { method: 'POST', body: {} })).rejects.toMatchObject(
			{ name: 'ApiError', code: 'quotaExceeded', message: 'Out of quota.', status: 503 }
		);
	});

	it('invents a code and a sentence when the server sent neither', async () => {
		stub({ status: 500, body: 'not the envelope' });
		const error = await apiFetch('/library').catch((/** @type {ApiError} */ cause) => cause);
		expect(error.code).toBe('unknown');
		expect(error.message).toContain('500');
	});

	it('reports a request that never arrived as offline', async () => {
		stub({ throws: new TypeError('Failed to fetch') });

		const error = await apiFetch('/library').catch((/** @type {ApiError} */ cause) => cause);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.offline).toBe(true);
		expect(error.status).toBeNull();
	});
});
