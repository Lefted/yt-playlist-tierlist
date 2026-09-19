import { json } from '$lib/server/http.js';

/**
 * Who is signed in.
 *
 * The one thing the client cannot work out for itself: the session lives in an
 * HttpOnly cookie, so the browser holds the credential but cannot read the name on
 * it. `src/routes/+layout.js` calls this on startup and after every login or logout.
 *
 * No 401 branch here — `src/hooks.server.js` has already answered one for any request
 * that arrives without a session, which is exactly why this handler may trust
 * `locals.user`.
 *
 * @type {import('./$types').RequestHandler}
 */
export function GET({ locals }) {
	return json({ user: locals.user });
}
