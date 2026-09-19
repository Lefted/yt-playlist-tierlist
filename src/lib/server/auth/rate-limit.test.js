import { describe, expect, it } from 'vitest';
import { LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS, RateLimiter } from './rate-limit.js';

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const MINUTE = 60 * 1000;

/** @returns {RateLimiter} A limiter with #16's numbers and an explicit clock. */
function limiter() {
	return new RateLimiter({ limit: 3, windowMs: 15 * MINUTE });
}

describe('RateLimiter', () => {
	it('allows an untouched key', () => {
		expect(limiter().check('ip:1.2.3.4', NOW)).toEqual({ allowed: true, retryAfter: 0 });
	});

	it('allows exactly as many attempts as its limit', () => {
		const rl = limiter();

		for (let i = 0; i < 3; i += 1) {
			expect(rl.check('a', NOW).allowed).toBe(true);
			rl.record('a', NOW);
		}

		expect(rl.check('a', NOW).allowed).toBe(false);
	});

	it('says how long to wait, in whole seconds, and never zero', () => {
		const rl = limiter();
		for (let i = 0; i < 3; i += 1) rl.record('a', NOW);

		expect(rl.check('a', NOW).retryAfter).toBe(15 * 60);
		expect(rl.check('a', NOW + 14 * MINUTE).retryAfter).toBe(60);
		// One millisecond left still rounds up to a second, not to "go ahead".
		expect(rl.check('a', NOW + 15 * MINUTE - 1).retryAfter).toBe(1);
	});

	it('does not count a refused attempt, so retrying cannot extend the lockout', () => {
		const rl = limiter();
		for (let i = 0; i < 3; i += 1) rl.record('a', NOW);

		rl.check('a', NOW + MINUTE);
		rl.check('a', NOW + 2 * MINUTE);

		expect(rl.check('a', NOW + 15 * MINUTE).allowed).toBe(true);
	});

	it('forgets attempts once they leave the window', () => {
		const rl = limiter();
		for (let i = 0; i < 3; i += 1) rl.record('a', NOW);

		expect(rl.check('a', NOW + 15 * MINUTE).allowed).toBe(true);
	});

	it('slides rather than resetting on a fixed boundary', () => {
		const rl = limiter();
		rl.record('a', NOW);
		rl.record('a', NOW + 14 * MINUTE);
		rl.record('a', NOW + 14 * MINUTE);

		// The first attempt has aged out; the two later ones have not.
		expect(rl.check('a', NOW + 15 * MINUTE).allowed).toBe(true);
		rl.record('a', NOW + 15 * MINUTE);
		expect(rl.check('a', NOW + 15 * MINUTE).allowed).toBe(false);
	});

	it('counts each key on its own', () => {
		const rl = limiter();
		for (let i = 0; i < 3; i += 1) rl.record('email:a@example.com', NOW);

		expect(rl.check('email:a@example.com', NOW).allowed).toBe(false);
		expect(rl.check('ip:1.2.3.4', NOW).allowed).toBe(true);
	});

	it('clears a key, which is what a correct password does', () => {
		const rl = limiter();
		for (let i = 0; i < 3; i += 1) rl.record('a', NOW);

		rl.clear('a');

		expect(rl.check('a', NOW).allowed).toBe(true);
	});

	it('sweeps keys it no longer needs instead of growing forever', () => {
		const rl = new RateLimiter({ limit: 3, windowMs: 15 * MINUTE, maxKeys: 10 });

		for (let i = 0; i < 20; i += 1) rl.record(`ip:${i}`, NOW);
		expect(rl.size).toBe(20);

		// Every key above has aged out by now; the one below is what triggers the sweep.
		rl.record('ip:fresh', NOW + 16 * MINUTE);

		expect(rl.size).toBe(1);
		expect(rl.check('ip:0', NOW + 16 * MINUTE).allowed).toBe(true);
	});

	it('keeps a key that is still inside the window when it sweeps', () => {
		const rl = new RateLimiter({ limit: 3, windowMs: 15 * MINUTE, maxKeys: 5 });

		for (let i = 0; i < 6; i += 1) rl.record(`ip:${i}`, NOW);
		rl.record('ip:recent', NOW + 16 * MINUTE);
		rl.record('ip:newest', NOW + 16 * MINUTE);

		expect(rl.size).toBe(2);
		expect(rl.check('ip:recent', NOW + 16 * MINUTE).allowed).toBe(true);
	});
});

describe('the login limiter', () => {
	it('is the 10 attempts per 15 minutes #16 asks for', () => {
		expect(LOGIN_ATTEMPT_LIMIT).toBe(10);
		expect(LOGIN_ATTEMPT_WINDOW_MS).toBe(15 * MINUTE);
	});
});
