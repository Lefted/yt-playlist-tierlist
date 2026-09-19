import { describe, expect, it } from 'vitest';
import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	passwordProblem,
	spendVerificationTime,
	verifyPassword
} from './password.js';

describe('passwordProblem', () => {
	it('insists on length and nothing else', () => {
		expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH))).toBe(null);
		expect(passwordProblem('correct horse battery staple')).toBe(null);
		expect(passwordProblem('aaaaaaaaaaaaaaaa')).toBe(null);
	});

	it('refuses anything shorter than the minimum', () => {
		expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least 10/);
		expect(passwordProblem('')).toMatch(/at least 10/);
	});

	it('refuses a value that is not a string at all', () => {
		expect(passwordProblem(undefined)).toMatch(/at least 10/);
		expect(passwordProblem(null)).toMatch(/at least 10/);
	});

	it('caps the length, so an unbounded field is not free work', () => {
		expect(passwordProblem('x'.repeat(MAX_PASSWORD_LENGTH))).toBe(null);
		expect(passwordProblem('x'.repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/at most/);
	});
});

describe('hashPassword / verifyPassword', () => {
	it('round-trips a password', async () => {
		const hash = await hashPassword('correct horse battery staple');

		await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
	});

	it('refuses a wrong password', async () => {
		const hash = await hashPassword('correct horse battery staple');

		await expect(verifyPassword(hash, 'Correct horse battery staple')).resolves.toBe(false);
		await expect(verifyPassword(hash, '')).resolves.toBe(false);
	});

	it('is Argon2id, with the parameters recorded in the hash', async () => {
		const hash = await hashPassword('correct horse battery staple');

		expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
	});

	it('salts, so two accounts with the same password do not share a hash', async () => {
		const a = await hashPassword('correct horse battery staple');
		const b = await hashPassword('correct horse battery staple');

		expect(a).not.toBe(b);
		await expect(verifyPassword(b, 'correct horse battery staple')).resolves.toBe(true);
	});

	it('treats an unreadable hash as a failed login rather than a crash', async () => {
		await expect(verifyPassword('not a hash', 'anything at all')).resolves.toBe(false);
		await expect(verifyPassword('', 'anything at all')).resolves.toBe(false);
	});
});

describe('spendVerificationTime', () => {
	it('resolves without saying anything, for an address that has no account', async () => {
		await expect(spendVerificationTime('whatever was typed')).resolves.toBeUndefined();
	});
});
