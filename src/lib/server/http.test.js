import { describe, expect, it } from 'vitest';
import { json, jsonError } from './http.js';

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

	it('takes a status and extra headers', () => {
		const response = json({ ok: true }, { status: 201, headers: { 'x-request-id': 'abc' } });

		expect(response.status).toBe(201);
		expect(response.headers.get('x-request-id')).toBe('abc');
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
