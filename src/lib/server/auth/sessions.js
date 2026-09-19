/**
 * Sessions: the `amv_session` cookie, the `sessions` rows behind it, and the rules
 * that decide when one is still good.
 *
 * Sessions live in Postgres rather than in a signed cookie so that logging out, and
 * disabling an account, take effect on the next request instead of in thirty days.
 * That is the whole reason the app has a database in front of it (#14).
 *
 * The cookie carries a random token; the table stores only its SHA-256 hash — see
 * `tokens.js`.
 */

import { eq } from 'drizzle-orm';
import { createToken, hashToken } from './tokens.js';
import { publicUser } from './users.js';
import { sessions, users } from '../db/schema.js';

/** @typedef {import('../db/index.js').DbHandle['db']} Db */
/** @typedef {import('./users.js').PublicUser} PublicUser */

/** The cookie name from #14's contract. Namespaced, because `lefted.dev` has neighbours. */
export const SESSION_COOKIE = 'amv_session';

/** How long a session lives from its last use. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How stale a session may get before its expiry is pushed out again.
 *
 * Sliding, but not on every request: without this, every page view would be a write
 * and a `Set-Cookie`. A day of granularity is invisible to anyone using the app and
 * turns the write into roughly one per browser per day.
 */
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The cookie's attributes, in one place so the login, the sign-up and the refresh
 * cannot set three different cookies.
 *
 * - `httpOnly` — no script of ours needs the token, and script that is not ours must
 *   not have it.
 * - `sameSite: 'lax'` — the cookie still rides along when someone follows a link
 *   into the app from their mail client, but not on a cross-site form post.
 * - `secure` in production only: the cookie has to survive `http://localhost:3000`
 *   during development, and production is https by the ingress (#18).
 * - `maxAge` matches the row's `expires_at`, so a browser does not keep sending a
 *   cookie the server has already forgotten.
 *
 * @param {object} options
 * @param {boolean} options.secure
 * @returns {import('cookie').CookieSerializeOptions & { path: string }}
 */
export function sessionCookieOptions({ secure }) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	};
}

/**
 * Whether a session has run out.
 *
 * @param {Date} expiresAt
 * @param {number} now - Epoch milliseconds.
 * @returns {boolean}
 */
export function sessionExpired(expiresAt, now) {
	return expiresAt.getTime() <= now;
}

/**
 * Whether a session's expiry should be pushed out on this request.
 *
 * @param {Date} lastSeenAt
 * @param {number} now - Epoch milliseconds.
 * @returns {boolean}
 */
export function sessionRefreshDue(lastSeenAt, now) {
	return now - lastSeenAt.getTime() >= SESSION_REFRESH_AFTER_MS;
}

/**
 * Starts a session for `userId` and returns the token the cookie must carry.
 *
 * The token is returned exactly once, here; it exists nowhere else afterwards.
 *
 * @param {Db} db
 * @param {object} input
 * @param {string} input.userId
 * @param {string | null} [input.userAgent] - Truncated; a header is attacker-controlled.
 * @param {string | null} [input.ip]
 * @param {number} [input.now] - Epoch milliseconds; injected by the tests.
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createSession(db, { userId, userAgent = null, ip = null, now = Date.now() }) {
	const token = createToken();
	const expiresAt = new Date(now + SESSION_TTL_MS);

	await db.insert(sessions).values({
		id: hashToken(token),
		userId,
		createdAt: new Date(now),
		lastSeenAt: new Date(now),
		expiresAt,
		userAgent: userAgent ? userAgent.slice(0, 400) : null,
		ip
	});

	return { token, expiresAt };
}

/**
 * Resolves a cookie value to its account, refreshing the session when it is due.
 *
 * Does the housekeeping a session sweep would otherwise do: an expired row is
 * deleted the moment anyone presents it, and a disabled account's sessions all go at
 * once. A cron job would only be needed for sessions nobody ever comes back to, and
 * those cost one row each.
 *
 * @param {Db} db
 * @param {string} token - Raw cookie value.
 * @param {number} [now] - Epoch milliseconds.
 * @returns {Promise<{ user: PublicUser, sessionId: string, expiresAt: Date, refreshed: boolean } | null>}
 *   `null` when the token is unknown, expired, or belongs to a disabled account —
 *   all three mean the same thing to the caller: there is no session.
 */
export async function loadSession(db, token, now = Date.now()) {
	const id = hashToken(token);

	const [row] = await db
		.select({
			id: sessions.id,
			expiresAt: sessions.expiresAt,
			lastSeenAt: sessions.lastSeenAt,
			userId: users.id,
			email: users.email,
			displayName: users.displayName,
			role: users.role,
			disabledAt: users.disabledAt
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.limit(1);

	if (!row) return null;

	if (sessionExpired(row.expiresAt, now)) {
		await deleteSession(db, id);
		return null;
	}

	if (row.disabledAt) {
		await deleteSessionsOfUser(db, row.userId);
		return null;
	}

	let expiresAt = row.expiresAt;
	const refreshed = sessionRefreshDue(row.lastSeenAt, now);
	if (refreshed) {
		expiresAt = new Date(now + SESSION_TTL_MS);
		await db
			.update(sessions)
			.set({ lastSeenAt: new Date(now), expiresAt })
			.where(eq(sessions.id, id));
	}

	return {
		user: publicUser({
			id: row.userId,
			email: row.email,
			displayName: row.displayName,
			role: row.role
		}),
		sessionId: id,
		expiresAt,
		refreshed
	};
}

/**
 * @param {Db} db
 * @param {string} sessionId - The stored hash, not the cookie value.
 * @returns {Promise<void>}
 */
export async function deleteSession(db, sessionId) {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Logs an account out everywhere. What disabling a user does, and what makes
 * "disabled" mean "gone on the next request" rather than "gone in thirty days".
 *
 * @param {Db} db
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteSessionsOfUser(db, userId) {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Signs `userId` in on this request: a row, and the cookie that points at it.
 *
 * Both ways into the app — the login form and redeeming an invite — go through here,
 * so there is one description of what "signed in" means rather than two that agree
 * today.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Db} db
 * @param {string} userId
 * @param {object} options
 * @param {boolean} options.secure - Whether to mark the cookie `Secure` (production).
 * @returns {Promise<void>}
 */
export async function startSession(event, db, userId, { secure }) {
	const { token } = await createSession(db, {
		userId,
		userAgent: event.request.headers.get('user-agent'),
		ip: event.getClientAddress()
	});

	event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions({ secure }));
}

/**
 * Signs the current request's session out: the row goes, and so does the cookie.
 *
 * Idempotent — a logout without a session is a successful logout.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Db} db
 * @returns {Promise<void>}
 */
export async function endSession(event, db) {
	if (event.locals.sessionId) await deleteSession(db, event.locals.sessionId);

	event.locals.user = null;
	event.locals.sessionId = null;
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}
