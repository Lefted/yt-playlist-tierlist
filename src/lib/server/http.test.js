import { describe, expect, it } from 'vitest';
import { json, jsonError, jsonMutationGuard } from './http.js';

describe('json', () => {
	it('answers 200 with a JSON body', async () => {
		const response = json({ ok: true });

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		await expect(response.json()).resolves.toEqual({ ok: true });
	});

	it('never lets a proxy or a service worker cache a status answer', () => {
		expect(json({ ok: true }).headers.get('cache-control')).toBe('no-store');
	});

	it('takes a status', () => {
		expect(json({ ok: true }, 201).status).toBe(201);
	});
});

describe('jsonError', () => {
	it('uses the one envelope every endpoint shares', async () => {
		const response = jsonError(503, 'db_unavailable', 'The database is not reachable.');

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			error: { code: 'db_unavailable', message: 'The database is not reachable.' }
		});
	});

	it('stays JSON, so a client never has to sniff the content type', () => {
		const response = jsonError(404, 'not_found', 'No such playlist.');

		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});

describe('jsonMutationGuard', () => {
	const ORIGIN = 'https://amv.lefted.dev';

	/**
	 * @param {Partial<{ method: string, contentType: string | null, origin: string | null }>} [options]
	 * @returns {Request}
	 */
	function request({ method = 'POST', contentType = 'application/json', origin = ORIGIN } = {}) {
		/** @type {Record<string, string>} */
		const headers = {};
		if (contentType !== null) headers['content-type'] = contentType;
		if (origin !== null) headers.origin = origin;
		return new Request('https://amv.lefted.dev/api/v1/library', { method, headers });
	}

	it('lets a JSON mutation from the app through', () => {
		expect(jsonMutationGuard(request(), ORIGIN)).toBe(null);
		expect(
			jsonMutationGuard(request({ contentType: 'application/json; charset=utf-8' }), ORIGIN)
		).toBe(null);
	});

	it('never stands in the way of a read', () => {
		expect(jsonMutationGuard(request({ method: 'GET', contentType: null }), ORIGIN)).toBe(null);
		expect(jsonMutationGuard(request({ method: 'HEAD', contentType: null }), ORIGIN)).toBe(null);
	});

	it('refuses the content types a cross-site form can produce', async () => {
		for (const contentType of [
			'application/x-www-form-urlencoded',
			'multipart/form-data; boundary=x',
			'text/plain',
			null
		]) {
			const refusal = jsonMutationGuard(request({ contentType }), ORIGIN);

			expect(refusal?.status).toBe(415);
			await expect(refusal?.json()).resolves.toMatchObject({
				error: { code: 'unsupported_media_type' }
			});
		}
	});

	it('refuses a mutation that came from somewhere else', async () => {
		const refusal = jsonMutationGuard(request({ origin: 'https://evil.example' }), ORIGIN);

		expect(refusal?.status).toBe(403);
		await expect(refusal?.json()).resolves.toMatchObject({ error: { code: 'cross_origin' } });
	});

	it('refuses a mutation with no Origin at all when the app knows its own', () => {
		expect(jsonMutationGuard(request({ origin: null }), ORIGIN)?.status).toBe(403);
	});

	it('cannot compare an origin it was never told, so it does not pretend to', () => {
		// Development: ORIGIN is optional there (#15), and refusing everything would
		// make `npm run dev` useless. Production requires the variable.
		expect(jsonMutationGuard(request({ origin: 'https://evil.example' }), null)).toBe(null);
		expect(jsonMutationGuard(request({ origin: null }), null)).toBe(null);
	});

	it('still insists on JSON when there is no origin to compare', () => {
		expect(jsonMutationGuard(request({ contentType: 'text/plain' }), null)?.status).toBe(415);
	});
});
