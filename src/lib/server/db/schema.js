/**
 * The database schema, as Drizzle tables.
 *
 * `drizzle-kit generate` diffs this file against `drizzle/meta/` and writes the SQL;
 * nothing here touches the database directly.
 *
 * Users, sessions and the library land here in #16 and #17. This ticket ships only
 * `app_meta`, which is enough to exercise the whole path — generate, ship, apply on
 * boot, count what was applied.
 */

import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
