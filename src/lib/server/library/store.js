/**
 * The library in Postgres: rows in, `Playlist` values out.
 *
 * This is the only module that knows the library tables exist. Everything above it
 * works on the same `Playlist`/`Video` shapes the browser has always used
 * (`src/lib/types.js`), which is what lets `src/lib/playlist.js` and
 * `src/lib/library-io.js` be shared between the two sides instead of duplicated.
 *
 * **Every function takes a `userId`, and every statement carries it.** A playlist is
 * never looked up by its id alone: the `where` is always `(user_id, youtube_id)`, so
 * a request naming somebody else's playlist finds nothing rather than finding a row
 * and then being asked politely not to touch it. That is the whole authorisation
 * story of the library API, and it is in one file on purpose.
 */

import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { playlists, userState, videos } from '../db/schema.js';
import { reconcileOrder } from '../../playlist.js';

/** @typedef {import('../db/index.js').DbHandle['db']} Db */
/** @typedef {import('../../types.js').Playlist} Playlist */
/** @typedef {import('../../types.js').Video} Video */
/** @typedef {import('../../types.js').Rating} Rating */

/**
 * A whole library, in the shape `GET /api/v1/library` answers with.
 *
 * @typedef {Object} LibrarySnapshot
 * @property {string|null} activePlaylistId - YouTube id of the active playlist.
 * @property {Playlist[]} playlists - Oldest import first.
 */

/**
 * How many video rows go into one statement.
 *
 * A 1000-video playlist would otherwise be one insert with 13 000 bind parameters —
 * under Postgres' 65 535 limit, but only because the row is narrow today.
 */
const VIDEO_CHUNK = 250;

/**
 * Everything one account has.
 *
 * Two queries rather than a join: a join would repeat every playlist row once per
 * video, and a library is a handful of playlists with thousands of videos.
 *
 * @param {Db} db
 * @param {string} userId
 * @returns {Promise<LibrarySnapshot>}
 */
export async function loadLibrary(db, userId) {
	const playlistRows = await db
		.select()
		.from(playlists)
		.where(eq(playlists.userId, userId))
		.orderBy(asc(playlists.importedAt), asc(playlists.id));

	if (playlistRows.length === 0) {
		return { activePlaylistId: null, playlists: [] };
	}

	const videoRows = await db
		.select()
		.from(videos)
		.where(
			inArray(
				videos.playlistId,
				playlistRows.map((row) => row.id)
			)
		)
		.orderBy(asc(videos.position), asc(videos.youtubeId));

	/** @type {Map<string, typeof videos.$inferSelect[]>} */
	const byPlaylist = new Map();
	for (const row of videoRows) {
		const bucket = byPlaylist.get(row.playlistId);
		if (bucket) bucket.push(row);
		else byPlaylist.set(row.playlistId, [row]);
	}

	const active = await activePlaylistRowId(db, userId);

	return {
		activePlaylistId: playlistRows.find((row) => row.id === active)?.youtubeId ?? null,
		playlists: playlistRows.map((row) => toPlaylist(row, byPlaylist.get(row.id) ?? []))
	};
}

/**
 * One playlist of one account, videos included.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} youtubeId
 * @returns {Promise<Playlist|null>}
 */
export async function loadPlaylist(db, userId, youtubeId) {
	const row = await findPlaylistRow(db, userId, youtubeId);
	if (!row) return null;

	const videoRows = await db
		.select()
		.from(videos)
		.where(eq(videos.playlistId, row.id))
		.orderBy(asc(videos.position), asc(videos.youtubeId));

	return toPlaylist(row, videoRows);
}

/**
 * Write a playlist and its videos, creating or replacing as needed.
 *
 * The caller has already done the merging (`mergePlaylist` / `applyImport`), so what
 * arrives here is the playlist as it should end up. Videos are upserted and any row
 * the value does not mention is deleted — which only happens on a legacy import that
 * removes nothing, because both merge paths carry every existing video forward.
 *
 * `rated_at` is deliberately *not* overwritten wholesale: a re-import that leaves a
 * tier where it was must leave the moment it was given where it was too.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {Playlist} playlist
 * @param {Date} [now]
 * @returns {Promise<Playlist>} The playlist as it is now stored.
 */
export async function savePlaylist(db, userId, playlist, now = new Date()) {
	const order = reconcileOrder(playlist.order, playlist.videos);

	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(playlists)
			.values({
				userId,
				youtubeId: playlist.id,
				title: playlist.title,
				description: playlist.description,
				channelTitle: playlist.channelTitle,
				thumbnail: playlist.thumbnail,
				itemCount: playlist.itemCount,
				importedAt: toDate(playlist.importedAt) ?? now,
				updatedAt: toDate(playlist.updatedAt) ?? now,
				order
			})
			.onConflictDoUpdate({
				target: [playlists.userId, playlists.youtubeId],
				set: {
					title: playlist.title,
					description: playlist.description,
					channelTitle: playlist.channelTitle,
					thumbnail: playlist.thumbnail,
					itemCount: playlist.itemCount,
					updatedAt: toDate(playlist.updatedAt) ?? now,
					order
				}
			})
			.returning();

		const keep = playlist.videos.map((video) => video.id);
		if (keep.length === 0) {
			await tx.delete(videos).where(eq(videos.playlistId, row.id));
		} else {
			await tx
				.delete(videos)
				.where(and(eq(videos.playlistId, row.id), notInArray(videos.youtubeId, keep)));
		}

		for (let start = 0; start < playlist.videos.length; start += VIDEO_CHUNK) {
			const chunk = playlist.videos.slice(start, start + VIDEO_CHUNK);
			await tx
				.insert(videos)
				.values(
					chunk.map((video) => ({
						playlistId: row.id,
						youtubeId: video.id,
						title: video.title,
						description: video.description,
						thumbnail: video.thumbnail,
						channelTitle: video.channelTitle,
						publishedAt: video.publishedAt,
						position: video.position,
						durationSeconds: video.durationSeconds,
						rating: video.rating,
						unavailable: video.unavailable,
						// A row that does not exist yet has no earlier moment to keep, and an
						// export carries no rating timestamp — so `rated_at` means "when this
						// tier arrived here", which for a restored backup is now.
						ratedAt: video.rating === null ? null : now
					}))
				)
				.onConflictDoUpdate({
					target: [videos.playlistId, videos.youtubeId],
					set: {
						title: sql`excluded.title`,
						description: sql`excluded.description`,
						thumbnail: sql`excluded.thumbnail`,
						channelTitle: sql`excluded.channel_title`,
						publishedAt: sql`excluded.published_at`,
						position: sql`excluded.position`,
						durationSeconds: sql`excluded.duration_seconds`,
						rating: sql`excluded.rating`,
						unavailable: sql`excluded.unavailable`,
						// Only a rating that actually changed gets a new timestamp; a
						// re-import that carries the same tier forward must not look like a
						// fresh judgement.
						ratedAt: sql`case
							when ${videos.rating} is distinct from excluded.rating then excluded.rated_at
							else ${videos.ratedAt}
						end`
					}
				});
		}

		const stored = await tx
			.select()
			.from(videos)
			.where(eq(videos.playlistId, row.id))
			.orderBy(asc(videos.position), asc(videos.youtubeId));

		return toPlaylist(row, stored);
	});
}

/**
 * Remove a playlist and everything under it.
 *
 * `user_state.active_playlist_id` is `on delete set null`, so an account whose
 * active playlist this was is left pointing at nothing rather than at a ghost.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} youtubeId
 * @returns {Promise<boolean>} Whether there was one.
 */
export async function deletePlaylist(db, userId, youtubeId) {
	const rows = await db
		.delete(playlists)
		.where(and(eq(playlists.userId, userId), eq(playlists.youtubeId, youtubeId)))
		.returning({ id: playlists.id });
	return rows.length > 0;
}

/**
 * Point an account at a playlist, or at none.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string|null} youtubeId
 * @param {Date} [now]
 * @returns {Promise<boolean>} `false` when this account has no such playlist — the
 *   active playlist is left alone in that case.
 */
export async function setActivePlaylist(db, userId, youtubeId, now = new Date()) {
	/** @type {string|null} */
	let rowId = null;
	if (youtubeId !== null) {
		const row = await findPlaylistRow(db, userId, youtubeId);
		if (!row) return false;
		rowId = row.id;
	}

	await db
		.insert(userState)
		.values({ userId, activePlaylistId: rowId, updatedAt: now })
		.onConflictDoUpdate({
			target: userState.userId,
			set: { activePlaylistId: rowId, updatedAt: now }
		});

	return true;
}

/**
 * The YouTube id of the account's active playlist.
 *
 * @param {Db} db
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function activePlaylistId(db, userId) {
	const [row] = await db
		.select({ youtubeId: playlists.youtubeId })
		.from(userState)
		.innerJoin(playlists, eq(userState.activePlaylistId, playlists.id))
		.where(eq(userState.userId, userId))
		.limit(1);
	return row?.youtubeId ?? null;
}

/**
 * Change the rating and/or the availability of one video.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} playlistYoutubeId
 * @param {string} videoYoutubeId
 * @param {{ rating?: Rating|null, unavailable?: boolean }} patch - Absent keys are
 *   left as they are, so `{ unavailable: true }` never clears a tier.
 * @param {Date} [now]
 * @returns {Promise<Video|null>} `null` when this account has no such video.
 */
export async function updateVideo(
	db,
	userId,
	playlistYoutubeId,
	videoYoutubeId,
	patch,
	now = new Date()
) {
	const playlistRow = await findPlaylistRow(db, userId, playlistYoutubeId);
	if (!playlistRow) return null;

	/** @type {Record<string, unknown>} */
	const set = {};
	if ('rating' in patch) {
		set.rating = patch.rating ?? null;
		set.ratedAt = patch.rating == null ? null : now;
	}
	if ('unavailable' in patch) set.unavailable = Boolean(patch.unavailable);
	if (Object.keys(set).length === 0) {
		const [row] = await db
			.select()
			.from(videos)
			.where(and(eq(videos.playlistId, playlistRow.id), eq(videos.youtubeId, videoYoutubeId)))
			.limit(1);
		return row ? toVideo(row) : null;
	}

	const [row] = await db
		.update(videos)
		.set(set)
		.where(and(eq(videos.playlistId, playlistRow.id), eq(videos.youtubeId, videoYoutubeId)))
		.returning();
	if (!row) return null;

	await touchPlaylist(db, playlistRow.id, now);
	return toVideo(row);
}

/**
 * Replace a playlist's playback order (shuffle, or back to the playlist order).
 *
 * The order is reconciled against the videos that are actually there, so a stale or
 * hand-made list cannot leave a video unreachable or name one twice.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} playlistYoutubeId
 * @param {unknown} order
 * @param {Date} [now]
 * @returns {Promise<string[]|null>} The stored order, `null` when there is no such
 *   playlist.
 */
export async function setPlaylistOrder(db, userId, playlistYoutubeId, order, now = new Date()) {
	const playlistRow = await findPlaylistRow(db, userId, playlistYoutubeId);
	if (!playlistRow) return null;

	const videoRows = await db
		.select()
		.from(videos)
		.where(eq(videos.playlistId, playlistRow.id))
		.orderBy(asc(videos.position), asc(videos.youtubeId));

	const reconciled = reconcileOrder(order, videoRows.map(toVideo));

	await db
		.update(playlists)
		.set({ order: reconciled, updatedAt: now })
		.where(eq(playlists.id, playlistRow.id));

	return reconciled;
}

/**
 * The playlist row of this account with this YouTube id.
 *
 * The one lookup every mutation starts from — which is why it takes a `userId` and
 * has no overload that does not.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} youtubeId
 * @returns {Promise<typeof playlists.$inferSelect | null>}
 */
async function findPlaylistRow(db, userId, youtubeId) {
	const [row] = await db
		.select()
		.from(playlists)
		.where(and(eq(playlists.userId, userId), eq(playlists.youtubeId, youtubeId)))
		.limit(1);
	return row ?? null;
}

/**
 * @param {Db} db
 * @param {string} userId
 * @returns {Promise<string|null>} Row id of the active playlist.
 */
async function activePlaylistRowId(db, userId) {
	const [row] = await db
		.select({ activePlaylistId: userState.activePlaylistId })
		.from(userState)
		.where(eq(userState.userId, userId))
		.limit(1);
	return row?.activePlaylistId ?? null;
}

/**
 * `updated_at` is the playlist's "something changed here", and rating a video is a
 * change to the playlist the browser shows.
 *
 * @param {Db} db
 * @param {string} rowId
 * @param {Date} now
 * @returns {Promise<void>}
 */
async function touchPlaylist(db, rowId, now) {
	await db.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, rowId));
}

/**
 * @param {typeof playlists.$inferSelect} row
 * @param {(typeof videos.$inferSelect)[]} videoRows
 * @returns {Playlist}
 */
function toPlaylist(row, videoRows) {
	const items = videoRows.map(toVideo);
	return {
		id: row.youtubeId,
		title: row.title,
		description: row.description,
		channelTitle: row.channelTitle,
		thumbnail: row.thumbnail,
		itemCount: row.itemCount,
		importedAt: row.importedAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		videos: items,
		order: reconcileOrder(row.order, items)
	};
}

/**
 * @param {typeof videos.$inferSelect} row
 * @returns {Video}
 */
function toVideo(row) {
	return {
		id: row.youtubeId,
		title: row.title,
		description: row.description,
		thumbnail: row.thumbnail,
		channelTitle: row.channelTitle,
		publishedAt: row.publishedAt,
		position: row.position,
		durationSeconds: row.durationSeconds,
		rating: /** @type {Rating|null} */ (row.rating),
		unavailable: row.unavailable
	};
}

/**
 * An ISO timestamp as a `Date`, or `null` when it is missing or unusable.
 *
 * Imported and restored payloads carry timestamps the app wrote itself, but a
 * hand-edited backup may carry anything, and `new Date('')` is an Invalid Date that
 * Postgres rejects with a type error rather than a message anyone can act on.
 *
 * @param {string} value
 * @returns {Date|null}
 */
function toDate(value) {
	if (typeof value !== 'string' || value.trim() === '') return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
