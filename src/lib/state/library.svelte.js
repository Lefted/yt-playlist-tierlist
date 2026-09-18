/**
 * The library: every imported playlist plus its ratings, persisted under
 * `ytpt:v1:library`.
 *
 * Persistence is explicit — every mutating method writes through after it is done,
 * so no component lifecycle or `$effect` is needed to keep storage in sync.
 */

import { createRatingCounts, isRating, RATING_ORDER } from '../types.js';
import {
	countNewRatings,
	mergePlaylist,
	normalizePlaylist,
	normalizeVideo,
	orderedVideos,
	reconcileOrder
} from '../playlist.js';
import { load, save } from '../storage.js';
import {
	fetchPlaylistMeta,
	fetchPlaylistVideos,
	parsePlaylistInput,
	YouTubeApiError
} from '../youtube/api.js';

/** @typedef {import('../types.js').Playlist} Playlist */
/** @typedef {import('../types.js').Video} Video */
/** @typedef {import('../types.js').Rating} Rating */
/** @typedef {import('../types.js').RatingCounts} RatingCounts */
/** @typedef {import('../youtube/api.js').ImportProgress} ImportProgress */

/**
 * Result of {@link Library.importJson}.
 * @typedef {Object} ImportSummary
 * @property {number} playlists - Playlists created or merged.
 * @property {number} videos - Videos contained in the import.
 * @property {number} ratingsApplied - Ratings that filled a previously unrated video.
 */

const STORAGE_KEY = 'library';
/**
 * Written into every persisted payload. Nothing reads it yet - it is what lets a
 * future shape change migrate instead of discarding the user's ratings, and both
 * loaders already tolerate unknown and missing fields.
 */
const STORAGE_VERSION = 1;

/** Playlist that collects ratings from a legacy export we cannot match to a playlist. */
export const LEGACY_PLAYLIST_ID = 'legacy-import';

class Library {
	/** @type {Playlist[]} */
	playlists = $state([]);

	/** @type {string|null} */
	#activePlaylistId = $state(null);

	/** @type {Playlist|null} The playlist the UI currently works on. */
	activePlaylist = $derived(
		this.playlists.find((playlist) => playlist.id === this.#activePlaylistId) ?? null
	);

	/** @type {Video[]} Videos of the active playlist, in playback order. */
	activeVideos = $derived(orderedVideos(this.activePlaylist));

	/** @type {Video[]} Active videos that can actually be played. */
	availableVideos = $derived(this.activeVideos.filter((video) => !video.unavailable));

	/** @type {RatingCounts} Videos per tier in the active playlist. */
	counts = $derived.by(() => {
		const counts = createRatingCounts();
		for (const video of this.availableVideos) {
			if (video.rating !== null) counts[video.rating] += 1;
		}
		return counts;
	});

	/** @type {number} Playable videos of the active playlist. */
	availableCount = $derived(this.availableVideos.length);

	/** @type {number} Playable videos that already carry a rating. */
	ratedCount = $derived(this.availableVideos.filter((video) => video.rating !== null).length);

	/** @type {number} Playable videos still waiting for a rating. */
	unratedCount = $derived(this.availableCount - this.ratedCount);

	constructor() {
		this.#hydrate();
	}

	/** @returns {string|null} Id of the active playlist. Change it via {@link setActive}. */
	get activePlaylistId() {
		return this.#activePlaylistId;
	}

	/**
	 * Import a playlist from YouTube and make it active.
	 *
	 * An existing playlist with the same id is merged (see {@link mergePlaylist}), so
	 * re-importing is also the way to refresh a playlist without losing ratings.
	 *
	 * @param {string} apiKey
	 * @param {string} input - Playlist id or any YouTube URL carrying `list=`.
	 * @param {{ onProgress?: (progress: ImportProgress) => void }} [options]
	 * @returns {Promise<Playlist>} The merged playlist.
	 * @throws {YouTubeApiError}
	 */
	async importPlaylist(apiKey, input, options = {}) {
		const key = typeof apiKey === 'string' ? apiKey.trim() : '';
		if (key === '') {
			throw new YouTubeApiError('No YouTube API key configured.', 'keyInvalid');
		}

		const playlistId = parsePlaylistInput(input);
		if (!playlistId) {
			throw new YouTubeApiError(
				'That is neither a playlist id nor a YouTube URL containing "list=".',
				'playlistNotFound'
			);
		}

		const meta = await fetchPlaylistMeta(key, playlistId);
		const videos = await fetchPlaylistVideos(key, playlistId, options.onProgress);
		const now = new Date().toISOString();

		const merged = this.#upsert(
			{
				...meta,
				importedAt: now,
				updatedAt: now,
				videos,
				order: videos.map((video) => video.id)
			},
			now
		);

		this.#activePlaylistId = merged.id;
		this.#persist();
		return merged;
	}

	/**
	 * @param {string} id
	 * @returns {boolean} `false` when there was no such playlist.
	 */
	removePlaylist(id) {
		const index = this.playlists.findIndex((playlist) => playlist.id === id);
		if (index === -1) return false;

		this.playlists.splice(index, 1);
		if (this.#activePlaylistId === id) {
			this.#activePlaylistId = this.playlists[0]?.id ?? null;
		}
		this.#persist();
		return true;
	}

	/**
	 * @param {string|null} id - `null` deselects.
	 * @returns {boolean} `false` when there is no playlist with that id.
	 */
	setActive(id) {
		if (id === null) {
			this.#activePlaylistId = null;
			this.#persist();
			return true;
		}
		if (!this.playlists.some((playlist) => playlist.id === id)) return false;
		this.#activePlaylistId = id;
		this.#persist();
		return true;
	}

	/**
	 * Rate a video of the active playlist.
	 *
	 * @param {string} videoId
	 * @param {Rating|null} rating - `null` clears the rating.
	 * @returns {boolean} `false` when the active playlist has no such video.
	 * @throws {TypeError} On a value that is neither a tier nor `null`.
	 */
	rate(videoId, rating) {
		if (rating !== null && !isRating(rating)) {
			throw new TypeError(`"${rating}" is not one of ${RATING_ORDER.join('/')} or null.`);
		}
		return this.#updateVideo(videoId, (video) => {
			video.rating = rating;
		});
	}

	/**
	 * Flag a video of the active playlist as unplayable — used when the player
	 * reports an error for it.
	 *
	 * @param {string} videoId
	 * @returns {boolean} `false` when the active playlist has no such video.
	 */
	markUnavailable(videoId) {
		return this.#updateVideo(videoId, (video) => {
			video.unavailable = true;
		});
	}

	/**
	 * Shuffle the playback order of the active playlist (Fisher-Yates). The order is
	 * persisted, so it survives a reload.
	 *
	 * @param {() => number} [random] - Injectable source of randomness, for tests.
	 * @returns {boolean} `false` when there is no active playlist.
	 */
	shuffle(random = Math.random) {
		const playlist = this.activePlaylist;
		if (!playlist) return false;

		const order = reconcileOrder(playlist.order, playlist.videos);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		playlist.order = order;
		playlist.updatedAt = new Date().toISOString();
		this.#persist();
		return true;
	}

	/**
	 * Restore the original playlist order of the active playlist.
	 * @returns {boolean} `false` when there is no active playlist.
	 */
	resetOrder() {
		const playlist = this.activePlaylist;
		if (!playlist) return false;

		playlist.order = reconcileOrder([], playlist.videos);
		playlist.updatedAt = new Date().toISOString();
		this.#persist();
		return true;
	}

	/**
	 * Serialise the whole library for download.
	 * @returns {string} Pretty-printed JSON.
	 */
	exportJson() {
		return JSON.stringify(
			{
				version: STORAGE_VERSION,
				exportedAt: new Date().toISOString(),
				playlists: $state.snapshot(this.playlists)
			},
			null,
			2
		);
	}

	/**
	 * Merge an exported library back in. Accepts both the current format
	 * (`{ version, exportedAt, playlists }`) and the legacy prototype format (a bare
	 * array of `{ videoId, title, rating }`), whose ratings are applied to matching
	 * videos of already imported playlists.
	 *
	 * @param {string} text
	 * @returns {ImportSummary}
	 * @throws {Error} On invalid JSON or an unrecognised shape.
	 */
	importJson(text) {
		/** @type {unknown} */
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (cause) {
			throw new Error('That file is not valid JSON.', { cause });
		}

		const now = new Date().toISOString();
		if (Array.isArray(parsed)) return this.#importLegacy(parsed, now);

		const source = parsed && typeof parsed === 'object' ? /** @type {any} */ (parsed) : null;
		if (!source || !Array.isArray(source.playlists)) {
			throw new Error(
				'Unrecognised export: expected { playlists: [...] } or a legacy array of ratings.'
			);
		}

		const normalized = source.playlists.map(normalizePlaylist);
		if (normalized.some((/** @type {Playlist|null} */ playlist) => playlist === null)) {
			throw new Error('Unrecognised export: every playlist needs an "id" and a "videos" array.');
		}

		let videos = 0;
		let ratingsApplied = 0;
		for (const incoming of /** @type {Playlist[]} */ (normalized)) {
			const before = this.playlists.find((playlist) => playlist.id === incoming.id) ?? null;
			videos += incoming.videos.length;
			ratingsApplied += countNewRatings(before, incoming);
			this.#upsert(incoming, now);
		}

		if (this.#activePlaylistId === null) this.#activePlaylistId = this.playlists[0]?.id ?? null;
		this.#persist();
		return { playlists: normalized.length, videos, ratingsApplied };
	}

	/**
	 * Drop everything, in memory and in storage.
	 * @returns {void}
	 */
	clear() {
		this.playlists = [];
		this.#activePlaylistId = null;
		this.#persist();
	}

	/**
	 * Apply a legacy `[{ videoId, title, rating }]` export.
	 *
	 * Ratings land on matching videos of the already imported playlists; entries we
	 * cannot match end up in the {@link LEGACY_PLAYLIST_ID} playlist so nothing is lost.
	 *
	 * @param {unknown[]} entries
	 * @param {string} now
	 * @returns {ImportSummary}
	 */
	#importLegacy(entries, now) {
		const videos = /** @type {Video[]} */ (
			entries.map(normalizeVideo).filter((video) => video !== null)
		);
		if (videos.length === 0) {
			throw new Error('Unrecognised export: the array contains no videos with a "videoId".');
		}

		let ratingsApplied = 0;
		/** @type {string[]} */
		const touched = [];
		/** @type {Video[]} */
		const unmatched = [];

		for (const imported of videos) {
			let matched = false;
			for (const playlist of this.playlists) {
				const target = playlist.videos.find((video) => video.id === imported.id);
				if (!target) continue;
				matched = true;
				if (!touched.includes(playlist.id)) touched.push(playlist.id);
				if (imported.rating !== null && target.rating === null) {
					target.rating = imported.rating;
					ratingsApplied += 1;
				}
				if (imported.unavailable) target.unavailable = true;
			}
			if (!matched) unmatched.push(imported);
		}

		for (const playlist of this.playlists) {
			if (touched.includes(playlist.id)) playlist.updatedAt = now;
		}

		let playlists = touched.length;
		if (unmatched.length > 0) {
			this.#upsert(
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
				now
			);
			playlists += 1;
			ratingsApplied += unmatched.filter((video) => video.rating !== null).length;
		}

		if (this.#activePlaylistId === null) this.#activePlaylistId = this.playlists[0]?.id ?? null;
		this.#persist();
		return { playlists, videos: videos.length, ratingsApplied };
	}

	/**
	 * Insert or merge a playlist.
	 *
	 * @param {Playlist} incoming
	 * @param {string} now
	 * @returns {Playlist} The stored (merged) playlist.
	 */
	#upsert(incoming, now) {
		const index = this.playlists.findIndex((playlist) => playlist.id === incoming.id);
		const merged = mergePlaylist(index === -1 ? null : this.playlists[index], incoming, now);
		if (index === -1) this.playlists.push(merged);
		else this.playlists[index] = merged;
		return /** @type {Playlist} */ (this.playlists.find((playlist) => playlist.id === incoming.id));
	}

	/**
	 * Change one video of the active playlist, then stamp and persist the playlist.
	 *
	 * @param {string} videoId
	 * @param {(video: Video) => void} mutate
	 * @returns {boolean} `false` when the active playlist has no such video.
	 */
	#updateVideo(videoId, mutate) {
		const playlist = this.activePlaylist;
		const video = playlist?.videos.find((candidate) => candidate.id === videoId);
		if (!playlist || !video) return false;

		mutate(video);
		playlist.updatedAt = new Date().toISOString();
		this.#persist();
		return true;
	}

	/** @returns {void} */
	#hydrate() {
		const stored = load(STORAGE_KEY, /** @type {any} */ (null));
		if (!stored || typeof stored !== 'object' || !Array.isArray(stored.playlists)) return;

		this.playlists = /** @type {Playlist[]} */ (
			stored.playlists.map(normalizePlaylist).filter((playlist) => playlist !== null)
		);
		const activeId = stored.activePlaylistId;
		this.#activePlaylistId =
			typeof activeId === 'string' && this.playlists.some((playlist) => playlist.id === activeId)
				? activeId
				: (this.playlists[0]?.id ?? null);
	}

	/** @returns {void} */
	#persist() {
		save(STORAGE_KEY, {
			version: STORAGE_VERSION,
			activePlaylistId: this.#activePlaylistId,
			playlists: $state.snapshot(this.playlists)
		});
	}
}

/** The app-wide library. */
export const library = new Library();
