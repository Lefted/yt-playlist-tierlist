/**
 * The database schema, as Drizzle tables.
 *
 * `drizzle-kit generate` diffs this file against `drizzle/meta/` and writes the SQL;
 * nothing here touches the database directly.
 *
 * Three groups: `app_meta` (notes about the installation), the tables accounts are
 * made of — who may sign in (`users`), who is signed in right now (`sessions`) and
 * who has been asked to join (`invites`) — and the library itself (`playlists`,
 * `videos`, `user_state`), which belongs to exactly one account per row.
 */

import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';

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

/**
 * One imported playlist, belonging to exactly one account.
 *
 * `youtube_id` is the id the app has always used as `Playlist.id` — a real YouTube
 * playlist id, or the local `legacy-import` collection an old export's unmatched
 * ratings land in. It is unique **per user**, which is what lets the API address a
 * playlist by the id the client already holds instead of handing database uuids to
 * the browser. `id` stays a uuid so that two users importing the same playlist are
 * two independent rows.
 *
 * `order` is the session order (`Playlist.order`): this playlist's video ids, as the
 * user shuffled or reset them. It is a jsonb array rather than a column on `videos`
 * because the user edits it as one value — a shuffle rewrites every position at
 * once, which a per-row `position` would turn into a thousand updates.
 */
export const playlists = pgTable(
	'playlists',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		youtubeId: text('youtube_id').notNull(),
		title: text('title').notNull().default(''),
		description: text('description').notNull().default(''),
		channelTitle: text('channel_title').notNull().default(''),
		thumbnail: text('thumbnail').notNull().default(''),
		itemCount: integer('item_count').notNull().default(0),
		importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		order: jsonb('order').notNull().default([])
	},
	(table) => [
		// The import path is an upsert on exactly this pair, and it is also what makes
		// "one row per playlist per user" a rule the database keeps rather than a habit.
		unique('playlists_user_id_youtube_id_key').on(table.userId, table.youtubeId)
	]
);

/**
 * One video of one playlist.
 *
 * The same YouTube video in two playlists is two rows with two ratings: a tier is a
 * judgement inside a list, not a global verdict on a video, and the app has always
 * behaved that way (`mergePlaylist` merges per playlist).
 *
 * `published_at` is text, not a timestamp: it is display data the app never does
 * date arithmetic on, and YouTube sometimes has none at all — `''` is a value a
 * timestamp column cannot hold, and round-tripping through one would rewrite every
 * exported timestamp into a different, merely equivalent, string.
 */
export const videos = pgTable(
	'videos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		playlistId: uuid('playlist_id')
			.notNull()
			.references(() => playlists.id, { onDelete: 'cascade' }),
		youtubeId: text('youtube_id').notNull(),
		title: text('title').notNull().default(''),
		description: text('description').notNull().default(''),
		thumbnail: text('thumbnail').notNull().default(''),
		channelTitle: text('channel_title').notNull().default(''),
		publishedAt: text('published_at').notNull().default(''),
		position: integer('position').notNull().default(0),
		durationSeconds: integer('duration_seconds'),
		rating: text('rating'),
		unavailable: boolean('unavailable').notNull().default(false),
		ratedAt: timestamp('rated_at', { withTimezone: true })
	},
	(table) => [
		unique('videos_playlist_id_youtube_id_key').on(table.playlistId, table.youtubeId),
		// The six tiers of `RATING_ORDER`, as a rule the database keeps. An enum would
		// say the same and then need a migration to add a tier; a check does not, and
		// `null` — not rated yet — passes either way.
		check('videos_rating_check', sql`${table.rating} in ('S', 'A', 'B', 'C', 'D', 'F')`)
	]
);

/**
 * Per-account state that belongs to no single playlist.
 *
 * Today that is one column: which playlist the user is working on. The row is
 * created on demand (the first import or selection), so an account that has never
 * opened the app has no row and reads as "nothing active".
 *
 * `active_playlist_id` is a real foreign key with `on delete set null`, so removing
 * the active playlist cannot leave an account pointing at a playlist that is gone.
 */
export const userState = pgTable('user_state', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	activePlaylistId: uuid('active_playlist_id').references(() => playlists.id, {
		onDelete: 'set null'
	}),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
