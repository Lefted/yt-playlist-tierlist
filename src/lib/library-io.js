/**
 * The backup format: what an export looks like, and what an import does to a
 * library.
 *
 * Pure, and deliberately not under `src/lib/server/`: the browser produces the
 * download (`library.exportJson()`) and the server produces `GET /library/export`
 * and applies `POST /library/import-json`, and the two must agree byte for byte.
 * One module is how they cannot drift.
 *
 * Everything here works on plain `Playlist[]` values — the same shape the client
 * state and the database layer both hand around — and returns new arrays instead of
 * mutating, so a failed import cannot leave half of itself behind.
 */

import { countNewRatings, mergePlaylist, normalizePlaylist, normalizeVideo } from './playlist.js';

/** @typedef {import('./types.js').Playlist} Playlist */
/** @typedef {import('./types.js').Video} Video */

/**
 * Written into every export.
 *
 * Nothing reads it yet — it is what lets a future shape change migrate instead of
 * discarding the user's ratings, and every loader here already tolerates unknown and
 * missing fields.
 */
const EXPORT_VERSION = 1;

/** Playlist that collects ratings from a legacy export we cannot match to a playlist. */
export const LEGACY_PLAYLIST_ID = 'legacy-import';

/**
 * A payload that is not an export of this app.
 *
 * Its `message` is written for the person who picked the file and is shown as it is
 * — in the browser by `components/browse/errors.js`, over HTTP as the `message` of a
 * 400. A class rather than a plain `Error` so the endpoint can tell "your file is
 * wrong" apart from "the database just went away", which must not be a 400.
 */
export class ImportFormatError extends Error {
	/**
	 * @param {string} message
	 * @param {{ cause?: unknown }} [options]
	 */
	constructor(message, options = {}) {
		super(message, options);
		this.name = 'ImportFormatError';
	}
}

/**
 * What an import would do, in numbers.
 *
 * @typedef {Object} ImportSummary
 * @property {number} playlists - Playlists created or merged.
 * @property {number} videos - Videos contained in the import.
 * @property {number} ratingsApplied - Ratings that filled a previously unrated video.
 */

/**
 * A parsed export, in one of the two shapes the app accepts.
 *
 * @typedef {{ kind: 'library', playlists: Playlist[] } | { kind: 'legacy', videos: Video[] }} ParsedImport
 */

/**
 * The result of applying a {@link ParsedImport} to a library.
 *
 * @typedef {Object} AppliedImport
 * @property {Playlist[]} playlists - The whole library afterwards.
 * @property {string[]} changed - Ids of the playlists this import created or
 *   touched; the only ones a caller has to write back.
 * @property {ImportSummary} summary
 */

/**
 * The export as the file the user downloads.
 *
 * Pretty-printed with two spaces, because a backup is something people open and
 * read — and because `GET /library/export` has to hand back exactly what the
 * browser's own export button produces.
 *
 * @param {Playlist[]} playlists
 * @param {string} exportedAt - ISO timestamp.
 * @returns {string}
 */
export function serializeExport(playlists, exportedAt) {
	return JSON.stringify({ version: EXPORT_VERSION, exportedAt, playlists }, null, 2);
}

/**
 * Read an export.
 *
 * Accepts the current format (`{ version, exportedAt, playlists }`) and the legacy
 * prototype format (a bare array of `{ videoId, title, rating }`).
 *
 * @param {unknown} source - The JSON text, or an already-parsed value (a request
 *   body, which SvelteKit has parsed for us).
 * @returns {ParsedImport}
 * @throws {ImportFormatError} On invalid JSON or an unrecognised shape. The messages
 *   are shown to the user as they are.
 */
export function parseImport(source) {
	/** @type {unknown} */
	let parsed = source;
	if (typeof source === 'string') {
		try {
			parsed = JSON.parse(source);
		} catch (cause) {
			throw new ImportFormatError('That file is not valid JSON.', { cause });
		}
	}

	if (Array.isArray(parsed)) {
		const videos = /** @type {Video[]} */ (
			parsed.map(normalizeVideo).filter((video) => video !== null)
		);
		if (videos.length === 0) {
			throw new ImportFormatError(
				'Unrecognised export: the array contains no videos with a "videoId".'
			);
		}
		return { kind: 'legacy', videos };
	}

	const object = parsed && typeof parsed === 'object' ? /** @type {any} */ (parsed) : null;
	if (!object || !Array.isArray(object.playlists)) {
		throw new ImportFormatError(
			'Unrecognised export: expected { playlists: [...] } or a legacy array of ratings.'
		);
	}

	const normalized = object.playlists.map(normalizePlaylist);
	if (normalized.some((/** @type {Playlist|null} */ playlist) => playlist === null)) {
		throw new ImportFormatError(
			'Unrecognised export: every playlist needs an "id" and a "videos" array.'
		);
	}

	return { kind: 'library', playlists: /** @type {Playlist[]} */ (normalized) };
}

/**
 * Merge a parsed export into a library.
 *
 * @param {Playlist[]} existing - The library as it is now.
 * @param {ParsedImport} parsed
 * @param {string} now - ISO timestamp used for `updatedAt`.
 * @returns {AppliedImport}
 */
export function applyImport(existing, parsed, now) {
	return parsed.kind === 'legacy'
		? applyLegacyImport(existing, parsed.videos, now)
		: applyLibraryImport(existing, parsed.playlists, now);
}

/**
 * @param {Playlist[]} existing
 * @param {Playlist[]} incoming
 * @param {string} now
 * @returns {AppliedImport}
 */
function applyLibraryImport(existing, incoming, now) {
	let playlists = existing;
	let videos = 0;
	let ratingsApplied = 0;
	/** @type {string[]} */
	const changed = [];

	for (const playlist of incoming) {
		const before = playlists.find((candidate) => candidate.id === playlist.id) ?? null;
		videos += playlist.videos.length;
		ratingsApplied += countNewRatings(before, playlist);
		// A backup is not authoritative about the playlist's contents: it may predate
		// videos that were added since, and must not condemn them.
		playlists = upsert(playlists, playlist, now, { complete: false });
		if (!changed.includes(playlist.id)) changed.push(playlist.id);
	}

	return {
		playlists,
		changed,
		summary: { playlists: incoming.length, videos, ratingsApplied }
	};
}

/**
 * Apply a legacy `[{ videoId, title, rating }]` export.
 *
 * Ratings land on matching videos of the playlists that are already there; entries
 * that match nothing end up in the {@link LEGACY_PLAYLIST_ID} playlist so nothing is
 * lost.
 *
 * @param {Playlist[]} existing
 * @param {Video[]} incoming
 * @param {string} now
 * @returns {AppliedImport}
 */
function applyLegacyImport(existing, incoming, now) {
	// One deep-enough copy: only the videos this import touches are replaced, so an
	// untouched playlist keeps its identity and its video objects.
	let playlists = existing.map((playlist) => ({ ...playlist, videos: [...playlist.videos] }));

	let ratingsApplied = 0;
	/** @type {string[]} */
	const touched = [];
	/** @type {Video[]} */
	const unmatched = [];

	for (const imported of incoming) {
		let matched = false;
		for (const playlist of playlists) {
			const index = playlist.videos.findIndex((video) => video.id === imported.id);
			if (index === -1) continue;
			matched = true;
			if (!touched.includes(playlist.id)) touched.push(playlist.id);

			const target = { ...playlist.videos[index] };
			if (imported.rating !== null && target.rating === null) {
				target.rating = imported.rating;
				ratingsApplied += 1;
			}
			if (imported.unavailable) target.unavailable = true;
			playlist.videos[index] = target;
		}
		if (!matched) unmatched.push(imported);
	}

	playlists = playlists.map((playlist) =>
		touched.includes(playlist.id) ? { ...playlist, updatedAt: now } : playlist
	);

	const changed = [...touched];
	let count = touched.length;
	if (unmatched.length > 0) {
		playlists = upsert(
			playlists,
			{
				id: LEGACY_PLAYLIST_ID,
				title: 'Legacy import',
				description: 'Ratings restored from the vanilla prototype.',
				channelTitle: '',
				thumbnail: '',
				itemCount: unmatched.length,
				importedAt: now,
				updatedAt: now,
				videos: unmatched,
				order: unmatched.map((video) => video.id)
			},
			now,
			// Each legacy import contributes only the entries it could not match, so a
			// second one says nothing about what a first one left here.
			{ complete: false }
		);
		if (!changed.includes(LEGACY_PLAYLIST_ID)) changed.push(LEGACY_PLAYLIST_ID);
		count += 1;
		ratingsApplied += unmatched.filter((video) => video.rating !== null).length;
	}

	return {
		playlists,
		changed,
		summary: { playlists: count, videos: incoming.length, ratingsApplied }
	};
}

/**
 * Insert or merge one playlist into a library, without touching the input array.
 *
 * @param {Playlist[]} playlists
 * @param {Playlist} incoming
 * @param {string} now
 * @param {{ complete?: boolean }} [options] - See {@link mergePlaylist}.
 * @returns {Playlist[]}
 */
function upsert(playlists, incoming, now, options) {
	const index = playlists.findIndex((playlist) => playlist.id === incoming.id);
	const merged = mergePlaylist(index === -1 ? null : playlists[index], incoming, now, options);
	if (index === -1) return [...playlists, merged];
	return playlists.map((playlist, position) => (position === index ? merged : playlist));
}
