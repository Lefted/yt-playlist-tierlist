/**
 * Accounts: the one place that reads or writes the `users` table.
 *
 * Email is the login name, so its normal form matters more than usual — an address
 * that round-trips as `Moritz@Example.com` in one place and `moritz@example.com` in
 * another is two accounts with one password. {@link normalizeEmail} is applied on
 * every way in, and the unique index on the column is what makes that stick.
 */

import { and, count, eq, isNull } from 'drizzle-orm';
import { hashPassword } from './password.js';
import { users } from '../db/schema.js';

/** @typedef {import('../db/index.js').DbHandle['db']} Db */

/**
 * An account as the rest of the app sees it — never the password hash.
 *
 * @typedef {object} PublicUser
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {'admin' | 'user'} role
 */

/** How long an address may be. Wide enough for any real one, narrow enough to index. */
const MAX_EMAIL_LENGTH = 254;

/** Display names are shown in the header and in `/admin`, not used for anything else. */
const MAX_DISPLAY_NAME_LENGTH = 80;

/**
 * The storage form of an address: trimmed and lower-cased.
 *
 * The local part of an address is case-sensitive by the letter of RFC 5321 and by
 * the practice of no mail provider anyone uses. Treating it as such here would only
 * produce accounts their owners cannot log into.
 *
 * @param {unknown} value
 * @returns {string} `''` when there is nothing usable.
 */
export function normalizeEmail(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * What is wrong with an address, in one sentence the form can print.
 *
 * Deliberately shallow: `x@y` is the only structure worth insisting on, because the
 * only thing that really validates an address is delivering mail to it, and this app
 * does not send any (#16 rules out password reset by email).
 *
 * @param {unknown} value - Raw field value; normalised before it is judged.
 * @returns {string | null} `null` when it is acceptable.
 */
export function emailProblem(value) {
	const email = normalizeEmail(value);
	if (email === '') return 'Enter an email address.';
	if (email.length > MAX_EMAIL_LENGTH) return 'That email address is too long.';
	if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return 'That is not an email address.';
	return null;
}

/**
 * What is wrong with a display name.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function displayNameProblem(value) {
	const name = typeof value === 'string' ? value.trim() : '';
	if (name === '') return 'Enter a name.';
	if (name.length > MAX_DISPLAY_NAME_LENGTH) {
		return `Use at most ${MAX_DISPLAY_NAME_LENGTH} characters.`;
	}
	return null;
}

/**
 * Strips an account row down to what may leave the server.
 *
 * @param {{ id: string, email: string, displayName: string, role: 'admin' | 'user' }} row
 * @returns {PublicUser}
 */
export function publicUser(row) {
	return { id: row.id, email: row.email, displayName: row.displayName, role: row.role };
}

/**
 * The account with this address, disabled ones included — the caller decides what a
 * `disabledAt` means, because "wrong password" and "your account is off" are two
 * different answers.
 *
 * @param {Db} db
 * @param {string} email - Raw or normalised; normalised here either way.
 * @returns {Promise<typeof users.$inferSelect | null>}
 */
export async function findUserByEmail(db, email) {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.email, normalizeEmail(email)))
		.limit(1);
	return row ?? null;
}

/**
 * @param {Db} db
 * @param {string} id
 * @returns {Promise<typeof users.$inferSelect | null>}
 */
export async function findUserById(db, id) {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row ?? null;
}

/**
 * Creates an account from an already-validated set of fields.
 *
 * `db` may be a transaction handle — sign-up redeems the invite and creates the user
 * in one, so a crash in between cannot burn an invite without producing an account.
 *
 * @param {Db | import('drizzle-orm/pg-core').PgTransaction<any, any, any>} db
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.displayName
 * @param {string} input.password - Plain; hashed here, so no caller has to remember to.
 * @param {'admin' | 'user'} [input.role]
 * @returns {Promise<typeof users.$inferSelect>}
 */
export async function createUser(db, { email, displayName, password, role = 'user' }) {
	const [row] = await db
		.insert(users)
		.values({
			email: normalizeEmail(email),
			displayName: displayName.trim(),
			passwordHash: await hashPassword(password),
			role
		})
		.returning();
	return row;
}

/** Postgres' "unique constraint violated". */
const UNIQUE_VIOLATION = '23505';

/**
 * Whether a failed insert failed because the address is already taken.
 *
 * The unique index is the real guard — a `select` first would still lose a race — so
 * the friendly "that address already has an account" message has to be read out of
 * the error. Drizzle wraps the driver's error in a `DrizzleQueryError`, so the code
 * is one `cause` deeper than the driver puts it; the chain is walked rather than
 * unwrapped once, because that nesting is Drizzle's business and may change.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isDuplicateEmail(error) {
	for (let current = error; current instanceof Error; current = current.cause) {
		if (
			/** @type {{ code?: unknown }} */ (/** @type {unknown} */ (current)).code === UNIQUE_VIOLATION
		) {
			return true;
		}
	}
	return false;
}

/**
 * Replaces an account's password. Used by `scripts/set-password.js`, which is the
 * whole of password recovery until there is a mail sender (#16, out of scope).
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} password - Plain.
 * @returns {Promise<void>}
 */
export async function setUserPassword(db, userId, password) {
	await db
		.update(users)
		.set({ passwordHash: await hashPassword(password) })
		.where(eq(users.id, userId));
}

/**
 * Turns an account off or back on.
 *
 * Disabling only sets the timestamp — the sessions are deleted by the caller in
 * `sessions.js`, which is the module that owns that table.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {boolean} disabled
 * @returns {Promise<void>}
 */
export async function setUserDisabled(db, userId, disabled) {
	await db
		.update(users)
		.set({ disabledAt: disabled ? new Date() : null })
		.where(eq(users.id, userId));
}

/**
 * Every account, oldest first — the `/admin` list. Small by construction: this is an
 * invite-only app for a handful of people, so there is nothing to paginate.
 *
 * @param {Db} db
 * @returns {Promise<Array<PublicUser & { createdAt: Date, disabledAt: Date | null }>>}
 */
export function listUsers(db) {
	return db
		.select({
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			role: users.role,
			createdAt: users.createdAt,
			disabledAt: users.disabledAt
		})
		.from(users)
		.orderBy(users.createdAt);
}

/**
 * How many accounts exist — the "is this a fresh installation?" question the
 * bootstrap asks.
 *
 * @param {Db} db
 * @returns {Promise<number>}
 */
export async function countUsers(db) {
	const [row] = await db.select({ total: count() }).from(users);
	return Number(row?.total ?? 0);
}

/**
 * How many admins are left who could still sign in — what keeps `/admin` from
 * locking itself out.
 *
 * @param {Db} db
 * @returns {Promise<number>}
 */
export async function countActiveAdmins(db) {
	const [row] = await db
		.select({ total: count() })
		.from(users)
		.where(and(eq(users.role, 'admin'), isNull(users.disabledAt)));
	return Number(row?.total ?? 0);
}

/**
 * Creates the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, on an empty table.
 *
 * Runs on every boot (from `src/hooks.server.js`, after the migrations) and is a
 * no-op from the second one on: once anybody has an account, the two variables are
 * ignored, so leaving them in the manifest cannot resurrect a password an admin has
 * since changed — and cannot silently re-enable an account that was disabled.
 *
 * `onConflictDoNothing` covers the one race worth covering: two replicas booting
 * against the same empty database.
 *
 * @param {Db} db
 * @param {object} credentials
 * @param {string | null} credentials.email
 * @param {string | null} credentials.password
 * @returns {Promise<PublicUser | null>} The account it created, or `null`.
 */
export async function bootstrapAdmin(db, { email, password }) {
	if (!email || !password) return null;
	if ((await countUsers(db)) > 0) return null;

	const [row] = await db
		.insert(users)
		.values({
			email: normalizeEmail(email),
			displayName: normalizeEmail(email).split('@')[0],
			passwordHash: await hashPassword(password),
			role: 'admin'
		})
		.onConflictDoNothing({ target: users.email })
		.returning();

	return row ? publicUser(row) : null;
}
