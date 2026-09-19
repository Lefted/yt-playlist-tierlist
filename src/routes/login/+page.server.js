import { fail, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/auth/routes.js';
import { spendVerificationTime, verifyPassword } from '$lib/server/auth/password.js';
import { loginLimiter } from '$lib/server/auth/rate-limit.js';
import { startSession } from '$lib/server/auth/sessions.js';
import { findUserByEmail, normalizeEmail } from '$lib/server/auth/users.js';
import { serverConfig } from '$lib/server/config.js';
import { getDb } from '$lib/server/db/index.js';

/**
 * The one sentence a failed login ever gets.
 *
 * Wrong address, wrong password and disabled account all answer with it: anything
 * more specific turns the form into a way of finding out who has an account here,
 * and this app is invite-only precisely so that that is nobody's business.
 * `password.js` spends the same time on each, so the clock does not give it away
 * either.
 */
const REJECTION = 'That email or password is wrong.';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	/**
	 * Sign in.
	 *
	 * A form action rather than a JSON endpoint, so the password is posted by the
	 * browser and never touched by our own client code — with `ssr = false` that is
	 * the one thing the server still renders the flow for. SvelteKit's origin check
	 * covers the CSRF side for free.
	 *
	 * @type {import('./$types').Action}
	 */
	default: async (event) => {
		const data = await event.request.formData();
		const email = normalizeEmail(data.get('email'));
		const password = data.get('password');
		const redirectTo = safeRedirect(data.get('redirectTo'));

		if (email === '' || typeof password !== 'string' || password === '') {
			return fail(400, { email, message: 'Enter your email address and password.' });
		}

		// Two keys, two different attacks: the address stops one account from being
		// ground through a password list from anywhere, the client address stops one
		// host from working through a list of addresses.
		const keys = [`email:${email}`, `ip:${event.getClientAddress()}`];
		const blocked = keys.map((key) => loginLimiter.check(key)).find((verdict) => !verdict.allowed);
		if (blocked) {
			event.setHeaders({ 'retry-after': String(blocked.retryAfter) });
			return fail(429, {
				email,
				message: `Too many attempts. Try again in ${Math.ceil(blocked.retryAfter / 60)} minute(s).`
			});
		}
		for (const key of keys) loginLimiter.record(key);

		const db = getDb();
		const user = await findUserByEmail(db, email);

		if (!user) {
			// No account, but still pay Argon2's price, so "unknown address" and "wrong
			// password" take the same time.
			await spendVerificationTime(password);
			return fail(400, { email, message: REJECTION });
		}

		const ok = await verifyPassword(user.passwordHash, password);
		if (!ok || user.disabledAt) return fail(400, { email, message: REJECTION });

		// A correct password clears the counters: one typo before the right password
		// must not spend somebody's quota for the next quarter of an hour.
		for (const key of keys) loginLimiter.clear(key);

		await startSession(event, db, user.id, { secure: serverConfig().isProduction });

		// 303, so the browser follows it with a GET rather than re-posting the password.
		redirect(303, redirectTo);
	}
};
