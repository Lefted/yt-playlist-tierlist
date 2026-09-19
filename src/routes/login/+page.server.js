import { fail, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/auth/routes.js';
import { authenticate, LOGIN_REJECTION } from '$lib/server/auth/login.js';
import { loginLimiter } from '$lib/server/auth/rate-limit.js';
import { startSession } from '$lib/server/auth/sessions.js';
import { normalizeEmail } from '$lib/server/auth/users.js';
import { getDb } from '$lib/server/db/index.js';

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
	 * The decision itself is `authenticate` in `$lib/server/auth/login.js`; what is
	 * left here is the rate limit, the session and the redirect.
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
		// host from working through a list of addresses. The second one is only as
		// good as `ADDRESS_HEADER`/`XFF_DEPTH` — behind an ingress without them every
		// request shares the proxy's address and the bucket becomes global (see
		// deploy/k8s/app.yaml).
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
		const user = await authenticate(db, email, password);
		if (!user) return fail(400, { email, message: LOGIN_REJECTION });

		// A correct password clears the counters: one typo before the right password
		// must not spend somebody's quota for the next quarter of an hour.
		for (const key of keys) loginLimiter.clear(key);

		await startSession(event, db, user.id);

		// 303, so the browser follows it with a GET rather than re-posting the password.
		redirect(303, redirectTo);
	}
};
