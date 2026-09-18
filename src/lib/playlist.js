/**
 * Pure operations on {@link Playlist} values: normalising untrusted input, keeping
 * the playback order consistent and merging a re-import into what we already have.
 *
 * No runes and no I/O — `src/lib/state/library.svelte.js` owns the reactive state
 * and calls into here.
 */

import { isRating } from './types.js';

/** @typedef {import('./types.js').Playlist} Playlist */
/** @typedef {import('./types.js').Video} Video */

/**
 * @param {unknown} value
 * @returns {string}
 */
function str(value) {
	return typeof value === 'string' ? value : '';
}

/**
 * @template T
 * @param {unknown} value
 * @param {T} fallback
 * @returns {number|T} The value when it is a finite number, the fallback otherwise.
 */
function finiteOr(value, fallback) {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Coerce anything (stored JSON, a legacy export entry, an API result) into a
 * {@link Video}. Legacy exports kept `"unavailable"` inside `rating`; that is
 * translated into the dedicated flag here.
 *
 * @param {unknown} raw
 * @param {number} index - Position fallback.
 * @returns {Video|null} `null` when there is no usable video id.
 */
export function normalizeVideo(raw, index) {
	if (!raw || typeof raw !== 'object') return null;
	const source = /** @type {Record<string, unknown>} */ (raw);
	const id = str(source.id) || str(source.videoId);
	if (id === '') return null;

	return {
		id,
		title: str(source.title),
		description: str(source.description),
		thumbnail: str(source.thumbnail),
		channelTitle: str(source.channelTitle),
		publishedAt: str(source.publishedAt),
		position: Math.trunc(finiteOr(source.position, index)),
		durationSeconds: finiteOr(source.durationSeconds, null),
		rating: isRating(source.rating) ? source.rating : null,
		unavailable: source.unavailable === true || source.rating === 'unavailable'
	};
}

/**
 * Coerce stored or imported data into a {@link Playlist}.
 *
 * @param {unknown} raw
 * @returns {Playlist|null} `null` when the shape is unusable (no id, no video array).
 */
export function normalizePlaylist(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const source = /** @type {Record<string, unknown>} */ (raw);
	const id = str(source.id).trim();
	if (id === '') return null;
	if (!Array.isArray(source.videos)) return null;

	const videos = /** @type {Video[]} */ (
		source.videos.map(normalizeVideo).filter((video) => video !== null)
	);
	return {
		id,
		title: str(source.title),
		description: str(source.description),
		channelTitle: str(source.channelTitle),
		thumbnail: str(source.thumbnail),
		itemCount: Math.trunc(finiteOr(source.itemCount, videos.length)),
		importedAt: str(source.importedAt),
		updatedAt: str(source.updatedAt),
		videos,
		order: reconcileOrder(source.order, videos)
	};
}

/**
 * Keep the known part of a stored order and append everything it does not mention,
 * in playlist position order.
 *
 * @param {unknown} order
 * @param {Video[]} videos
 * @returns {string[]}
 */
export function reconcileOrder(order, videos) {
	const known = new Set(videos.map((video) => video.id));
	/** @type {string[]} */
	const result = [];
	const seen = new Set();

	if (Array.isArray(order)) {
		for (const id of order) {
			if (typeof id !== 'string' || seen.has(id) || !known.has(id)) continue;
			seen.add(id);
			result.push(id);
		}
	}

	const rest = videos.filter((video) => !seen.has(video.id));
	rest.sort((a, b) => a.position - b.position);
	for (const video of rest) result.push(video.id);

	return result;
}

/**
 * Apply the playlist videos in their current order.
 *
 * @param {Playlist|null} playlist
 * @returns {Video[]}
 */
export function orderedVideos(playlist) {
	if (!playlist) return [];
	/** @type {Map<string, Video>} */
	const byId = new Map(playlist.videos.map((video) => [video.id, video]));
	/** @type {Video[]} */
	const result = [];
	for (const id of playlist.order ?? []) {
		const video = byId.get(id);
		if (!video) continue;
		byId.delete(id);
		result.push(video);
	}
	// Anything the order does not mention keeps its relative position.
	for (const video of byId.values()) result.push(video);
	return result;
}

/**
 * Merge a freshly fetched or imported playlist into an existing one.
 *
 * Rules: local ratings win, videos that vanished from the source are kept but
 * flagged `unavailable`, new videos are appended, and the existing order survives.
 *
 * @param {Playlist|null} existing
 * @param {Playlist} incoming
 * @param {string} now - ISO timestamp used for `updatedAt`.
 * @returns {Playlist}
 */
export function mergePlaylist(existing, incoming, now) {
	if (!existing) {
		return {
			...incoming,
			importedAt: incoming.importedAt || now,
			updatedAt: now,
			videos: [...incoming.videos],
			order: reconcileOrder(incoming.order, incoming.videos)
		};
	}

	/** @type {Map<string, Video>} */
	const incomingById = new Map(incoming.videos.map((video) => [video.id, video]));
	/** @type {Video[]} */
	const videos = [];
	const seen = new Set();

	for (const old of existing.videos) {
		if (seen.has(old.id)) continue;
		seen.add(old.id);
		const fresh = incomingById.get(old.id);
		if (!fresh) {
			// Gone from the source: keep the rating, but it can no longer be played.
			videos.push({ ...old, unavailable: true });
			continue;
		}
		videos.push({
			...fresh,
			rating: old.rating ?? fresh.rating ?? null,
			durationSeconds: fresh.durationSeconds ?? old.durationSeconds ?? null,
			// `unavailable` is sticky: the API happily lists videos that the player
			// then refuses to embed, and markUnavailable() is the only place that
			// knows about it. Clearing the flag would put them back in the queue on
			// every re-import.
			unavailable: old.unavailable || fresh.unavailable
		});
	}

	for (const fresh of incoming.videos) {
		if (seen.has(fresh.id)) continue;
		seen.add(fresh.id);
		videos.push({ ...fresh });
	}

	return {
		id: existing.id,
		title: incoming.title || existing.title,
		description: incoming.description || existing.description,
		channelTitle: incoming.channelTitle || existing.channelTitle,
		thumbnail: incoming.thumbnail || existing.thumbnail,
		itemCount: incoming.itemCount || existing.itemCount,
		importedAt: existing.importedAt || incoming.importedAt || now,
		updatedAt: now,
		videos,
		order: reconcileOrder(existing.order, videos)
	};
}

/**
 * How many ratings an import would newly fill in.
 *
 * @param {Playlist|null} existing
 * @param {Playlist} incoming
 * @returns {number}
 */
export function countNewRatings(existing, incoming) {
	if (!existing) return incoming.videos.filter((video) => video.rating !== null).length;
	const byId = new Map(existing.videos.map((video) => [video.id, video]));
	return incoming.videos.filter(
		(video) => video.rating !== null && (byId.get(video.id)?.rating ?? null) === null
	).length;
}
