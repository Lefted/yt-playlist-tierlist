/**
 * The one line every library endpoint starts with.
 *
 * `src/hooks.server.js` has already refused every request to `/api/**` that arrives
 * without a session, so `locals.user` is never null down here — but "never" is a
 * claim about another file, and the endpoints below spend the id it hands them as
 * the key to somebody's data. This turns that claim into a check that throws if it
 * is ever wrong, instead of a `?.` that would quietly scope a query to `undefined`.
 */

/** @typedef {import('../auth/users.js').PublicUser} PublicUser */

/**
 * @param {App.Locals} locals
 * @returns {PublicUser}
 * @throws {Error} When the gate in `src/hooks.server.js` has been bypassed.
 */
export function requireUser(locals) {
	const user = locals.user;
	if (!user) {
		throw new Error(
			'A library endpoint was reached without a session; the request gate is broken.'
		);
	}
	return user;
}
