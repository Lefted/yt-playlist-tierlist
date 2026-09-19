import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createToken, hashToken } from './tokens.js';

describe('createToken', () => {
	it('is 32 random bytes, in a form that survives a URL and a cookie', () => {
		const token = createToken();

		expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('never repeats itself', () => {
		const tokens = new Set(Array.from({ length: 500 }, createToken));

		expect(tokens.size).toBe(500);
	});
});

describe('hashToken', () => {
	it('is the SHA-256 of the token, in lower-case hex', () => {
		const token = createToken();

		expect(hashToken(token)).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
		expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is stable, which is what makes the lookup an index hit', () => {
		const token = createToken();

		expect(hashToken(token)).toBe(hashToken(token));
	});

	it('does not give the token back', () => {
		const token = createToken();

		expect(hashToken(token)).not.toContain(token);
	});

	it('separates two tokens that differ by one character', () => {
		expect(hashToken('aaaa')).not.toBe(hashToken('aaab'));
	});
});
