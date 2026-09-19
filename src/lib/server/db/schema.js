/**
 * The database schema, as Drizzle tables.
 *
 * `drizzle-kit generate` diffs this file against `drizzle/meta/` and writes the SQL;
 * nothing here touches the database directly.
 *
 * The library itself lands here in #17. This file currently holds `app_meta` plus
 * the three tables accounts are made of: who may sign in (`users`), who is signed
 * in right now (`sessions`) and who has been asked to join (`invites`).
 */

import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Small key/value notes about the installation itself.
 *
 * Deliberately not a place for user data: rows here are written by the server
 * (bootstrap markers, one-off migration flags) and read by operators.
 */
export const appMeta = pgTable('app_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * What an account may do. `admin` additionally reaches `/admin`: inviting people,
 * and disabling them again.
 */
export const userRole = pgEnum('user_role', ['admin', 'user']);

/**
 * An account. Sign-up is invite-only (see {@link invites}), so a row here always
 * came either from the `ADMIN_EMAIL` bootstrap or from a redeemed invite.
 *
 * `email` is stored lower-cased and unique rather than as `citext`: the extension
 * would have to be installed by a superuser, which the cluster's `amv` role is not.
 * `src/lib/server/auth/users.js` is the only place that writes or looks one up, and
 * it lower-cases on the way in and on the way out.
 *
 * Deleting an account is deliberately not a feature — `disabled_at` is. A deleted
 * user would take their library with them and leave dangling invites behind; a
 * disabled one keeps both and can be let back in.
 */
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	displayName: text('display_name').notNull(),
	role: userRole('role').notNull().default('user'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	disabledAt: timestamp('disabled_at', { withTimezone: true })
});

/**
 * One signed-in browser.
 *
 * `id` is **not** the cookie value: the cookie carries 32 random bytes and the
 * column holds their SHA-256 hash, so a leaked database dump (or a stray log line
 * of a row) cannot be replayed as a login. The lookup is therefore an index hit on
 * a hash and never compares a secret in this process.
 *
 * Rows are removed when they expire (lazily, on the next lookup), when the user
 * logs out, and when an admin disables the account.
 */
export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
		userAgent: text('user_agent'),
		ip: text('ip')
	},
	// Disabling an account deletes every session of that user, which is a scan
	// without this index — and it happens while an admin is waiting on a form post.
	(table) => [index('sessions_user_id_idx').on(table.userId)]
);

/**
 * A one-time sign-up link.
 *
 * Same shape as a session: the admin sees the token once, the database keeps only
 * its SHA-256 hash. `email` is optional and merely pre-fills (and then pins) the
 * address on the sign-up form; an invite without one lets the recipient choose.
 *
 * `used_at`/`used_by` are kept instead of deleting the row, so `/admin` can still
 * show who an invite went to.
 */
export const invites = pgTable(
	'invites',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		tokenHash: text('token_hash').notNull().unique(),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		email: text('email'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' })
	},
	// `/admin` lists the open invites of the whole installation, newest first.
	(table) => [index('invites_created_at_idx').on(table.createdAt)]
);
