import { describe, expect, it } from 'vitest';
import {
	displayNameProblem,
	emailProblem,
	isDuplicateEmail,
	normalizeEmail,
	publicUser
} from './users.js';

describe('normalizeEmail', () => {
	it('lower-cases and trims, so one address is one account', () => {
		expect(normalizeEmail('  Moritz@Example.COM ')).toBe('moritz@example.com');
	});

	it('is empty for anything that is not a string', () => {
		expect(normalizeEmail(undefined)).toBe('');
		expect(normalizeEmail(null)).toBe('');
		expect(normalizeEmail(42)).toBe('');
		expect(normalizeEmail('   ')).toBe('');
	});
});

describe('emailProblem', () => {
	it('accepts an ordinary address, however it was typed', () => {
		expect(emailProblem('moritz@example.com')).toBe(null);
		expect(emailProblem(' Moritz+tierlist@sub.example.co.uk ')).toBe(null);
	});

	it('asks for one when there is none', () => {
		expect(emailProblem('')).toMatch(/Enter an email/);
		expect(emailProblem(null)).toMatch(/Enter an email/);
	});

	it('refuses something that cannot be an address', () => {
		expect(emailProblem('moritz')).toMatch(/not an email/);
		expect(emailProblem('moritz@example')).toMatch(/not an email/);
		expect(emailProblem('moritz @example.com')).toMatch(/not an email/);
		expect(emailProblem('@example.com')).toMatch(/not an email/);
	});

	it('refuses one long enough to be an attack on the index', () => {
		expect(emailProblem(`${'x'.repeat(250)}@example.com`)).toMatch(/too long/);
	});
});

describe('displayNameProblem', () => {
	it('accepts a name', () => {
		expect(displayNameProblem('Moritz')).toBe(null);
		expect(displayNameProblem('  Moritz  ')).toBe(null);
	});

	it('refuses an empty one', () => {
		expect(displayNameProblem('')).toMatch(/Enter a name/);
		expect(displayNameProblem('   ')).toMatch(/Enter a name/);
		expect(displayNameProblem(undefined)).toMatch(/Enter a name/);
	});

	it('refuses one that would not fit in a header', () => {
		expect(displayNameProblem('x'.repeat(81))).toMatch(/at most/);
	});
});

describe('publicUser', () => {
	it('is the four fields the client may see, and no hash', () => {
		const row = {
			id: 'u1',
			email: 'moritz@example.com',
			displayName: 'Moritz',
			/** @type {'admin'} */
			role: /** @type {const} */ ('admin'),
			passwordHash: '$argon2id$…',
			disabledAt: null
		};

		expect(publicUser(row)).toEqual({
			id: 'u1',
			email: 'moritz@example.com',
			displayName: 'Moritz',
			role: 'admin'
		});
	});
});

describe('isDuplicateEmail', () => {
	/**
	 * @param {string} code
	 * @returns {Error}
	 */
	function driverError(code) {
		return Object.assign(new Error('duplicate key value violates unique constraint'), { code });
	}

	it('sees the code where the driver puts it', () => {
		expect(isDuplicateEmail(driverError('23505'))).toBe(true);
	});

	it('sees it through the wrapper Drizzle puts around it', () => {
		const wrapped = new Error('Failed query', { cause: driverError('23505') });

		expect(isDuplicateEmail(wrapped)).toBe(true);
	});

	it('is not fooled by another constraint or another failure entirely', () => {
		expect(isDuplicateEmail(driverError('23503'))).toBe(false);
		expect(isDuplicateEmail(new Error('connection refused'))).toBe(false);
		expect(isDuplicateEmail('23505')).toBe(false);
		expect(isDuplicateEmail(null)).toBe(false);
	});
});
