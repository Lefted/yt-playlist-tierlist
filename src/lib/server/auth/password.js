/**
 * Password hashing.
 *
 * Argon2id through `@node-rs/argon2`, at the library's defaults — m=19456 KiB, t=2,
 * p=1, which is OWASP's second recommended parameter set and what the encoded hash
 * records, so a later change to the cost does not invalidate existing hashes.
 *
 * `@node-rs/argon2` ships a musl prebuild and was verified to install and verify a
 * hash inside `node:22.23-alpine` (the image's base) before it was adopted; there is
 * no build toolchain in the runtime stage to fall back on. Node's own `scrypt` was
 * the fallback the ticket allowed and is not needed.
 *
 * This module is imported by `scripts/set-password.js`, which runs outside Vite — so
 * it deliberately imports nothing from `$lib`, `$env` or the database.
 */

import { randomBytes } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * The only password rule. Length beats composition rules: a 10-character minimum
 * with no "must contain a symbol" is both stronger in practice and the thing people
 * do not work around with `Passw0rd!`.
 */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * An upper bound, purely as a denial-of-service guard: Argon2 hashes its input at a
 * fixed cost, but the bytes still have to be read and held, and an unbounded form
 * field is free work for anyone who asks. Far above anything a human types or a
 * password manager generates.
 */
export const MAX_PASSWORD_LENGTH = 1024;

/** @type {import('@node-rs/argon2').Options} */
const OPTIONS = { algorithm: Algorithm.Argon2id };

/**
 * What is wrong with a proposed password, in one sentence the form can print.
 *
 * @param {unknown} password
 * @returns {string | null} `null` when it is acceptable.
 */
export function passwordProblem(password) {
	if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
		return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
	}
	return null;
}

/**
 * @param {string} password
 * @returns {Promise<string>} The encoded `$argon2id$…` string, parameters included.
 */
export function hashPassword(password) {
	return hash(password, OPTIONS);
}

/**
 * Whether a password matches a stored hash.
 *
 * Never throws: a hash this build cannot parse (a row written by a different
 * algorithm, a truncated column) is a failed login, not a 500 — and reporting it as
 * one would tell an attacker which accounts have an odd hash.
 *
 * @param {string} storedHash
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(storedHash, password) {
	try {
		return await verify(storedHash, password, OPTIONS);
	} catch {
		return false;
	}
}

/** @type {Promise<string> | undefined} */
let decoyHash;

/**
 * Spend the same time on an email that has no account as on one that has.
 *
 * Without this, "unknown address" answers in a millisecond and "wrong password"
 * answers in fifty, and the login form becomes a way to enumerate who is a member —
 * which the identical error message was meant to prevent.
 *
 * The decoy is hashed once per process, from random bytes, so nothing here is a
 * password anyone could ever type.
 *
 * @param {string} password - Whatever was submitted; the result is discarded.
 * @returns {Promise<void>}
 */
export async function spendVerificationTime(password) {
	decoyHash ??= hashPassword(randomBytes(32).toString('hex'));
	await verifyPassword(await decoyHash, password);
}
