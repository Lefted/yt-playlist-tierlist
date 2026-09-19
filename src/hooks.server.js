/**
 * Boot and request gate.
 *
 * `init` runs once per process: validate the environment, bring the schema up to
 * date, create the first admin if there is nobody. `handle` runs per request: resolve
 * the session cookie into `event.locals`, and turn everyone else away.
 */

import { building, dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { isApiPath, isPublicPath, loginPathFor } from '$lib/auth/routes.js';
import { loadSession, SESSION_COOKIE, writeSessionCookie } from '$lib/server/auth/sessions.js';
import { bootstrapAdmin } from '$lib/server/auth/users.js';
import { serverConfig } from '$lib/server/config.js';
import { getDb } from '$lib/server/db/index.js';
import { applyMigrations, countShippedMigrations } from '$lib/server/db/migrations.js';
import { jsonError, jsonMutationGuard } from '$lib/server/http.js';

/**
 * The liveness probe, which must answer without a database (#14). Kubelet sends no
 * cookie, but a browser that has one would otherwise drag Postgres into the one
 * endpoint whose whole point is not needing it.
 */
const HEALTH_PATH = '/healthz';

/**
 * Boot: validate the environment, then bring the database schema up to date.
 *
 * SvelteKit awaits `init` before the first request is served (adapter-node awaits it
 * before the socket is even opened), which makes it the right place for work that
 * must happen exactly once per process and must be finished before anyone is served.
 *
 * @type {import('@sveltejs/kit').ServerInit}
 */
export const init = async () => {
	// `vite build` loads the server bundle to analyse routes; there is no database
	// during a build, and there is nothing to migrate either.
	if (building) return;

	try {
		const config = serverConfig();
		await applyMigrations(config.databaseUrl);

		// After the migrations, because the table it counts is created by one — and
		// before the first request, because an installation with no account is an
		// installation nobody can log into.
		const admin = await bootstrapAdmin(getDb(), {
			email: config.adminEmail,
			password: config.adminPassword
		});
		if (admin) console.log(`[boot] created the first admin account: ${admin.email}`);

		const version = await countShippedMigrations();
		console.log(
			`[boot] ${config.gitSha} (built ${config.buildTime}) ready at schema version ${version}`
		);
	} catch (error) {
		console.error('[boot] refusing to start:', error);

		// In production a half-migrated process must not serve: exiting non-zero leaves
		// the previous pods in place (`maxUnavailable: 0`) instead of rolling a broken
		// build over a working one. In dev, killing the Vite server would also kill the
		// watcher, so the error surfaces on the request instead and `npm run dev`
		// recovers as soon as the database or the `.env` is fixed.
		if (dev) throw error;
		process.exit(1);
	}
};

/**
 * Resolve the session, then decide whether this request may proceed.
 *
 * This is the app's only authentication boundary. `src/routes/+layout.js` repeats the
 * *redirect* in the browser — because with `ssr = false` a click inside the SPA never
 * reaches the server — but it repeats it as a courtesy: nothing a client does can get
 * past this function, and every route below it may assume `event.locals.user`.
 *
 * @type {import('@sveltejs/kit').Handle}
 */
export const handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	const path = event.url.pathname;

	if (path !== HEALTH_PATH) {
		await attachSession(event);
	}

	if (!event.locals.user && !isPublicPath(path)) {
		if (isApiPath(path)) {
			return jsonError(401, 'unauthenticated', 'Sign in to use this endpoint.');
		}
		// 303 so that an unauthenticated POST becomes a GET of the login form rather
		// than a POST of it.
		redirect(303, loginPathFor(path + event.url.search));
	}

	// The shared cross-site check for every JSON mutation, applied once here so no
	// endpoint under `/api` can forget it (#16). Form actions are covered by
	// SvelteKit's own origin check.
	if (isApiPath(path)) {
		const refusal = jsonMutationGuard(event.request, serverConfig().origin);
		if (refusal) return refusal;
	}

	return resolve(event);
};

/**
 * Puts the account behind the `amv_session` cookie into `event.locals`, and keeps the
 * cookie and the row in step.
 *
 * A cookie that resolves to nothing is deleted right here: it is either expired,
 * revoked or forged, and leaving it in place would mean sending a useless token on
 * every request for thirty days.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<void>}
 */
async function attachSession(event) {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return;

	const resolved = await loadSession(getDb(), token);

	if (!resolved) {
		event.cookies.delete(SESSION_COOKIE, { path: '/' });
		return;
	}

	event.locals.user = resolved.user;
	event.locals.session = resolved.session;

	// The sliding half of the 30-day expiry: the row was just pushed out, so the
	// browser has to hear about it too, or the cookie would expire first.
	if (resolved.refreshed) writeSessionCookie(event.cookies, token);
}
