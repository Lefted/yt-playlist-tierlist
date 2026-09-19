import { describe, expect, it } from 'vitest';
import { INVITE_TTL_DAYS, inviteProblem, inviteTtlDays, MAX_INVITE_TTL_DAYS } from './invites.js';

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

/**
 * @param {Partial<{ usedAt: Date | null, expiresAt: Date }>} [overrides]
 * @returns {{ usedAt: Date | null, expiresAt: Date }}
 */
function invite(overrides = {}) {
	return { usedAt: null, expiresAt: new Date(NOW + HOUR), ...overrides };
}

describe('inviteProblem', () => {
	it('is null for a fresh, unused invite', () => {
		expect(inviteProblem(invite(), NOW)).toBe(null);
	});

	it('reports a token that matches nothing', () => {
		expect(inviteProblem(null, NOW)?.code).toBe('invite_unknown');
		expect(inviteProblem(undefined, NOW)?.code).toBe('invite_unknown');
	});

	it('reports one that has already been redeemed', () => {
		expect(inviteProblem(invite({ usedAt: new Date(NOW - HOUR) }), NOW)?.code).toBe('invite_used');
	});

	it('reports one that has run out, to the millisecond', () => {
		expect(inviteProblem(invite({ expiresAt: new Date(NOW) }), NOW)?.code).toBe('invite_expired');
		expect(inviteProblem(invite({ expiresAt: new Date(NOW + 1) }), NOW)).toBe(null);
	});

	it('calls a used invite used even after it would also have expired', () => {
		const both = invite({ usedAt: new Date(NOW - 2 * HOUR), expiresAt: new Date(NOW - HOUR) });

		expect(inviteProblem(both, NOW)?.code).toBe('invite_used');
	});

	it('always comes with a sentence the page can print', () => {
		expect(inviteProblem(null, NOW)?.message).toMatch(/Ask for a new one/);
	});
});

describe('inviteTtlDays', () => {
	it('defaults to the week #16 asks for', () => {
		expect(inviteTtlDays('')).toBe(INVITE_TTL_DAYS);
		expect(inviteTtlDays(null)).toBe(INVITE_TTL_DAYS);
		expect(inviteTtlDays('not a number')).toBe(INVITE_TTL_DAYS);
		expect(inviteTtlDays('0')).toBe(INVITE_TTL_DAYS);
		expect(inviteTtlDays('-5')).toBe(INVITE_TTL_DAYS);
	});

	it('takes what was asked for', () => {
		expect(inviteTtlDays('1')).toBe(1);
		expect(inviteTtlDays(' 30 ')).toBe(30);
		expect(inviteTtlDays(14)).toBe(14);
	});

	it('clamps and rounds, so no link outlives its usefulness', () => {
		expect(inviteTtlDays('3650')).toBe(MAX_INVITE_TTL_DAYS);
		expect(inviteTtlDays('7.9')).toBe(7);
	});
});
