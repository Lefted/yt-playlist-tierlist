import { redirect } from '@sveltejs/kit';
import { LOGIN_PATH } from '$lib/auth/routes.js';
import { endSession } from '$lib/server/auth/sessions.js';
import { getDb } from '$lib/server/db/index.js';

/**
 * Nobody navigates *to* `/logout`; it exists as the target of a form post. Someone
 * who types the URL, or comes back to it from their history, gets the login form
 * rather than a page that logs them out by being looked at — a GET must not change
 * anything, and a prefetch or a link scanner would otherwise sign people out.
 *
 * @type {import('./$types').PageServerLoad}
 */
export function load() {
	redirect(303, LOGIN_PATH);
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	/**
	 * Sign out: delete the session row, clear the cookie, go to the login form.
	 *
	 * @type {import('./$types').Action}
	 */
	default: async (event) => {
		await endSession(event, getDb());
		redirect(303, LOGIN_PATH);
	}
};
