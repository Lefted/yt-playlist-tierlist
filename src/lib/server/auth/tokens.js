/**
 * The bearer tokens this app hands out: session cookies and invite links.
 *
 * Both follow the same rule — the recipient gets 32 random bytes, the database gets
 * their SHA-256 hash. A dump of `sessions` or `invites` therefore cannot be replayed
 * as a login, and neither can a row that ends up in a log line or a screenshot of
 * `drizzle-kit studio`.
 *
 * SHA-256 rather than Argon2: the input is already 256 bits of CSPRNG output, so
 * there is nothing to brute-force and nothing a key-stretching cost would buy —
 * unlike a password, which is why `password.js` is a different module.
 */

import { createHash, randomBytes } from 'node:crypto';

/**
 * 32 bytes = 256 bits of entropy. Guessing one is not a threat model, it is a
 * rounding error.
 */
const TOKEN_BYTES = 32;

/**
 * A fresh token, for exactly one recipient.
 *
 * base64url so it survives a cookie value, a URL path segment and a copy-paste out
 * of a chat window without escaping.
 *
 * @returns {string}
 */
export function createToken() {
	return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * The value the database stores for a token.
 *
 * Lookups go `hashToken(fromRequest)` → indexed equality, so the secret itself is
 * never compared inside this process and there is no comparison to time.
 *
 * @param {string} token
 * @returns {string} Lower-case hex SHA-256.
 */
export function hashToken(token) {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}
