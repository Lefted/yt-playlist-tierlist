/**
 * What the library endpoints actually do, with the HTTP left out.
 *
 * The routes under `src/routes/api/v1/` read the body, call one function here and
 * serialise the answer; everything that is a rule rather than a protocol lives on
 * this side, which is also what lets `library.db.test.js` exercise it against a real
 * Postgres without a request.
 *
 * Merging is not reimplemented here: `src/lib/playlist.js` and
 * `src/lib/library-io.js` are the same pure modules the browser uses, so a re-import
 * keeps ratings for exactly the same reasons it always did.
 */

import { mergePlaylist } from '../../playlist.js';
import { applyImport, parseImport, serializeExport } from '../../library-io.js';
import { parsePlaylistInput } from '../../youtube/api.js';
import {
	activePlaylistId,
	deletePlaylist,
	loadLibrary,
	loadPlaylist,
	savePlaylist,
	setActivePlaylist
} from './store.js';
import {
	fetchPlaylistMeta,
	fetchPlaylistVideos,
	requireApiKey,
	YouTubeApiError
} from '../youtube.js';

/** @typedef {import('../db/index.js').DbHandle['db']} Db */
/** @typedef {import('../../types.js').Playlist} Playlist */
/** @typedef {import('./store.js').LibrarySnapshot} LibrarySnapshot */

/**
 * Import a playlist from YouTube, or refresh one that is already there.
 *
 * Re-importing is the refresh path, and it is the same merge the browser used to do
 * locally: ratings win, new videos are appended, and a video that has left the
 * playlist stays in the list flagged `unavailable` rather than being dropped with
 * whatever tier it carried.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {unknown} input - Playlist id, playlist URL or watch URL with `list=`.
 * @param {{ now?: Date, apiKey?: string, fetchMeta?: typeof fetchPlaylistMeta, fetchVideos?: typeof fetchPlaylistVideos }} [options]
 *   The key and the two fetchers are injectable so the integration test can exercise
 *   the merge and the writes without a YouTube key and without a network. `apiKey`
 *   defaults lazily: {@link requireApiKey} is only consulted when nothing was passed,
 *   so a test never has to satisfy the installation's configuration.
 * @returns {Promise<{ playlist: Playlist, activePlaylistId: string }>}
 * @throws {YouTubeApiError}
 */
export async function importPlaylist(db, userId, input, options = {}) {
	const playlistId = parsePlaylistInput(input);
	if (!playlistId) {
		throw new YouTubeApiError(
			'That is neither a playlist id nor a YouTube URL containing "list=".',
			'playlistNotFound'
		);
	}

	const {
		now = new Date(),
		apiKey = requireApiKey(),
		fetchMeta = fetchPlaylistMeta,
		fetchVideos = fetchPlaylistVideos
	} = options;

	const meta = await fetchMeta(apiKey, playlistId);
	const items = await fetchVideos(apiKey, playlistId);

	const iso = now.toISOString();
	const existing = await loadPlaylist(db, userId, meta.id);
	const merged = mergePlaylist(
		existing,
		{
			...meta,
			importedAt: existing?.importedAt || iso,
			updatedAt: iso,
			videos: items,
			order: items.map((video) => video.id)
		},
		iso
	);

	const playlist = await savePlaylist(db, userId, merged, now);
	await setActivePlaylist(db, userId, playlist.id, now);
	return { playlist, activePlaylistId: playlist.id };
}

/**
 * Merge an exported library (current or legacy format) into an account's own.
 *
 * This is both the "bring my local data" path of #17 and the restore-from-backup
 * path the app has always had. The whole library is read, merged in memory and the
 * touched playlists are written back — a backup is a handful of playlists, and the
 * alternative is a diff in SQL that would have to repeat `mergePlaylist`'s rules.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {unknown} body - The parsed request body, or the JSON text.
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ summary: import('../../library-io.js').ImportSummary, library: LibrarySnapshot }>}
 * @throws {Error} With a message meant for the user, on an unrecognised payload.
 */
export async function importLibraryJson(db, userId, body, options = {}) {
	const { now = new Date() } = options;

	const parsed = parseImport(body);
	const before = await loadLibrary(db, userId);
	const applied = applyImport(before.playlists, parsed, now.toISOString());

	for (const id of applied.changed) {
		const playlist = applied.playlists.find((candidate) => candidate.id === id);
		if (playlist) await savePlaylist(db, userId, playlist, now);
	}

	// An import into an empty library is also a choice of what to look at.
	if (before.activePlaylistId === null) {
		const first = applied.playlists[0]?.id ?? null;
		if (first) await setActivePlaylist(db, userId, first, now);
	}

	return { summary: applied.summary, library: await loadLibrary(db, userId) };
}

/**
 * The account's library as the JSON file the browser downloads.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {{ now?: Date }} [options]
 * @returns {Promise<string>}
 */
export async function exportLibraryJson(db, userId, options = {}) {
	const { now = new Date() } = options;
	const { playlists } = await loadLibrary(db, userId);
	return serializeExport(playlists, now.toISOString());
}

/**
 * Remove a playlist, and leave the account looking at something sensible.
 *
 * The database sets `active_playlist_id` to null by itself; picking the next
 * playlist is a product decision, and it is the one the browser has always made.
 *
 * @param {Db} db
 * @param {string} userId
 * @param {string} youtubeId
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ removed: boolean, activePlaylistId: string|null }>}
 */
export async function removePlaylist(db, userId, youtubeId, options = {}) {
	const { now = new Date() } = options;

	const removed = await deletePlaylist(db, userId, youtubeId);
	if (!removed) {
		return { removed: false, activePlaylistId: await activePlaylistId(db, userId) };
	}

	let active = await activePlaylistId(db, userId);
	if (active === null) {
		const { playlists } = await loadLibrary(db, userId);
		active = playlists[0]?.id ?? null;
		if (active) await setActivePlaylist(db, userId, active, now);
	}

	return { removed: true, activePlaylistId: active };
}
