/**
 * The one decision a login makes: does this address and this password belong to an
 * account that may sign in?
 *
 * Its own module so that decision can be tested against a real database without a
 * request, a form or a cookie — `/login`'s action is then only rate limiting, a
 * session and a redirect around this call.
 */

import { spendVerificationTime, verifyPassword } from './password.js';
import { findUserByEmail, normalizeEmail } from './users.js';

/** @typedef {import('../db/index.js').DbHandle['db']} Db */

/**
 * The one sentence a failed login ever gets.
 *
 * Wrong address, wrong password and disabled account all answer with it: anything
 * more specific turns the form into a way of finding out who has an account here,
 * and this app is invite-only precisely so that that is nobody's business.
 */
export const LOGIN_REJECTION = 'That email or password is wrong.';

/**
 * Authenticates an email/password pair.
 *
 * Every failure looks the same from the outside, and — this is the part that is easy
 * to leave out — takes the same time. An address with no account still pays Argon2's
 * price against a decoy hash, because otherwise "unknown address" answers in a
 * millisecond, "wrong password" in fifty, and the clock says what the wording would
 * not.
 *
 * A disabled account is rejected here rather than after the password check for the
 * same reason it is rejected at all: whether it exists is not the visitor's business.
 * The password is still verified first, so the timing does not separate the two.
 *
 * @param {Db} db
 * @param {unknown} email - Raw form field.
 * @param {unknown} password - Raw form field.
 * @returns {Promise<import('./users.js').PublicUser | null>} The account, or `null`.
 */
export async function authenticate(db, email, password) {
	const address = normalizeEmail(email);
	if (address === '' || typeof password !== 'string' || password === '') return null;

	const user = await findUserByEmail(db, address);

	if (!user) {
		await spendVerificationTime(password);
		return null;
	}

	const correct = await verifyPassword(user.passwordHash, password);
	if (!correct || user.disabledAt) return null;

	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		role: user.role
	};
}
