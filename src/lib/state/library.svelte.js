/**
 * The library: every imported playlist plus its ratings, as the browser sees it.
 *
 * Since #17 the truth is in Postgres, one library per account, and this class is the
 * copy the pages render. `localStorage` holds no library any more — only device
 * preferences (`settings`) stay local.
 *
 * **Everything the user does is applied here first and sent afterwards.** Rating a
 * video while watching it has to feel like pressing a key, not like submitting a
 * form, so `rate`, `markUnavailable`, `shuffle`, `setActive` and `removePlaylist`
 * keep the synchronous, boolean-returning signatures the Rate page and the undo
 * stack have always called — the request goes out behind them, and a refusal puts
 * the old value back and says so (`$lib/notify.js`). The operations that genuinely
 * cannot be guessed at — importing from YouTube, importing a backup — are `async` and
 * throw, because their result is the point.
 *
 * Reads that fail leave `error` set and `playlists` empty; the pages render `loading`
 * and `error` rather than an empty library that looks like a lost one.
 */

import { createRatingCounts, isRating, RATING_ORDER } from '../types.js';
import { normalizePlaylist, orderedVideos, reconcileOrder } from '../playlist.js';
import { serializeExport } from '../library-io.js';
import { apiFetch } from '../api.js';
import { notifyError } from '../notify.js';

/** @typedef {import('../types.js').Playlist} Playlist */
/** @typedef {import('../types.js').Video} Video */
/** @typedef {import('../types.js').Rating} Rating */
/** @typedef {import('../types.js').RatingCounts} RatingCounts */
/** @typedef {import('../library-io.js').ImportSummary} ImportSummary */

class Library {
	/** @type {Playlist[]} */
	playlists = $state([]);

	/** @type {boolean} Whether the first read of this account's library is still running. */
	loading = $state(false);

	/**
	 * @type {string|null} Why the library could not be read, as a sentence. Failed
	 * *writes* do not land here — they are rolled back and announced instead.
	 */
	error = $state(null);

	/** @type {string|null} */
	#activePlaylistId = $state(null);

	/** @type {string|null} Account the current contents belong to. */
	#loadedFor = null;

	/** @type {Promise<void>|null} The read in flight, so two callers share one. */
	#pending = null;

	/**
	 * Bumped by every `clear()` and every read that starts.
	 *
	 * A read that finishes after its generation has passed is thrown away. Without
	 * that, signing out while `GET /library` is still on its way and signing in as
	 * somebody else on the same device lands the first account's playlists in the
	 * second account's session — the server was never confused, but the browser was.
	 */
	#generation = 0;

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

	/** @returns {string|null} Id of the active playlist. Change it via {@link setActive}. */
	get activePlaylistId() {
		return this.#activePlaylistId;
	}

	/** @returns {boolean} Whether this account has nothing imported (and we know it). */
	get isEmpty() {
		return !this.loading && this.error === null && this.playlists.length === 0;
	}

	/**
	 * Read this account's library, once.
	 *
	 * Called from the root layout load on startup and again after every login or
	 * logout. A second call for the same account is free; a call for another account
	 * reads again, because the two have nothing to do with each other.
	 *
	 * @param {string} userId
	 * @returns {Promise<void>} Resolves when the library is there — or when the
	 *   attempt has failed and `error` says why. It never rejects: a page that cannot
	 *   read the library still has to render.
	 */
	ensureLoaded(userId) {
		if (this.#loadedFor === userId) {
			// The read that is already running is the answer to this call too; the order
			// matters, because `#loadedFor` is set before it starts.
			if (this.#pending) return this.#pending;
			if (this.error === null) return Promise.resolve();
		}

		this.#loadedFor = userId;
		return this.reload();
	}

	/**
	 * Read the library again, whatever state it is in — the way back from a failed
	 * read, and what the pages' "Try again" offers.
	 *
	 * @returns {Promise<void>}
	 */
	reload() {
		this.#pending = this.#load(++this.#generation);
		return this.#pending;
	}

	/**
	 * Forget everything without touching the server — what a logout leaves behind.
	 *
	 * Also the reset seam for the suites that exercise the singleton in place instead
	 * of booting a fresh module.
	 *
	 * @returns {void}
	 */
	clear() {
		this.playlists = [];
		this.#activePlaylistId = null;
		this.#loadedFor = null;
		this.#pending = null;
		this.loading = false;
		this.error = null;
		// Whatever is still in flight was asked on behalf of somebody who has left.
		this.#generation += 1;
	}

	/**
	 * Import a playlist from YouTube and make it active.
	 *
	 * The server holds the API key and does the fetching (#17); re-importing an
	 * existing playlist is still the refresh path, and still keeps every rating.
	 *
	 * @param {string} input - Playlist id or any YouTube URL carrying `list=`.
	 * @returns {Promise<Playlist>} The merged playlist.
	 * @throws {import('../api.js').ApiError} With the code the import dialog renders.
	 */
	async importPlaylist(input) {
		const result = await apiFetch('/playlists/import', { method: 'POST', body: { input } });
		const playlist = normalizePlaylist(result?.playlist);
		if (!playlist) {
			throw new Error('The server imported the playlist but described it in a way we cannot read.');
		}

		this.#replacePlaylist(playlist);
		this.#activePlaylistId = result?.activePlaylistId ?? playlist.id;
		return playlist;
	}

	/**
	 * @param {string} id
	 * @returns {boolean} `false` when there was no such playlist.
	 */
	removePlaylist(id) {
		const index = this.playlists.findIndex((playlist) => playlist.id === id);
		if (index === -1) return false;

		const removed = $state.snapshot(this.playlists[index]);
		const previousActive = this.#activePlaylistId;

		this.playlists.splice(index, 1);
		if (this.#activePlaylistId === id) {
			this.#activePlaylistId = this.playlists[0]?.id ?? null;
		}

		this.#send(
			apiFetch(`/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' }),
			() => {
				this.playlists.splice(index, 0, /** @type {Playlist} */ (removed));
				this.#activePlaylistId = previousActive;
			},
			'The playlist could not be removed.'
		);
		return true;
	}

	/**
	 * @param {string|null} id - `null` deselects.
	 * @returns {boolean} `false` when there is no playlist with that id.
	 */
	setActive(id) {
		if (id !== null && !this.playlists.some((playlist) => playlist.id === id)) return false;

		const previous = this.#activePlaylistId;
		if (previous === id) return true;
		this.#activePlaylistId = id;

		this.#send(
			apiFetch('/library/active', { method: 'PUT', body: { playlistId: id } }),
			() => {
				this.#activePlaylistId = previous;
			},
			'The playlist could not be switched.'
		);
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
		return this.#patchVideo(videoId, { rating }, 'That rating could not be saved.');
	}

	/**
	 * Flag a video of the active playlist as unplayable — used when the player
	 * reports an error for it.
	 *
	 * @param {string} videoId
	 * @returns {boolean} `false` when the active playlist has no such video.
	 */
	markUnavailable(videoId) {
		return this.#patchVideo(
			videoId,
			{ unavailable: true },
			'That video could not be flagged as unavailable.'
		);
	}

	/**
	 * Take the "unplayable" flag off a video of the active playlist again — the way
	 * back from {@link markUnavailable}, used by the session's undo.
	 *
	 * @param {string} videoId
	 * @returns {boolean} `false` when the active playlist has no such video.
	 */
	markAvailable(videoId) {
		return this.#patchVideo(videoId, { unavailable: false }, 'That video could not be restored.');
	}

	/**
	 * Shuffle the playback order of the active playlist (Fisher-Yates). The order is
	 * stored, so it survives a reload and follows the account to another device.
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
		return this.#setOrder(playlist, order);
	}

	/**
	 * Restore the original playlist order of the active playlist.
	 * @returns {boolean} `false` when there is no active playlist.
	 */
	resetOrder() {
		const playlist = this.activePlaylist;
		if (!playlist) return false;
		return this.#setOrder(playlist, reconcileOrder([], playlist.videos));
	}

	/**
	 * Serialise the whole library for download.
	 *
	 * Built from what is on screen rather than fetched, so the download starts in the
	 * same click that asked for it. `GET /api/v1/library/export` produces the same
	 * file from the same module for anyone who would rather use `curl`.
	 *
	 * @returns {string} Pretty-printed JSON.
	 */
	exportJson() {
		return serializeExport($state.snapshot(this.playlists), new Date().toISOString());
	}

	/**
	 * Merge an exported library back in.
	 *
	 * The server does the merging — it is the same pure module either way — and
	 * answers with the whole library, so what lands here is what was stored rather
	 * than what we hoped would be.
	 *
	 * @param {string} text - An export file: the current format, or the legacy array.
	 * @returns {Promise<ImportSummary>}
	 * @throws {import('../api.js').ApiError} On an unreadable or rejected payload.
	 */
	async importJson(text) {
		const result = await apiFetch('/library/import-json', {
			method: 'POST',
			body: parseJsonText(text)
		});
		this.#apply(result?.library);
		return /** @type {ImportSummary} */ (
			result?.summary ?? { playlists: 0, videos: 0, ratingsApplied: 0 }
		);
	}

	/**
	 * @param {number} generation - The value of {@link #generation} this read belongs
	 *   to. Anything else has happened since, and this answer is about somebody else.
	 * @returns {Promise<void>}
	 */
	async #load(generation) {
		this.loading = true;
		this.error = null;
		try {
			const snapshot = await apiFetch('/library');
			if (generation !== this.#generation) return;
			this.#apply(snapshot);
		} catch (cause) {
			if (generation !== this.#generation) return;
			this.playlists = [];
			this.#activePlaylistId = null;
			this.error =
				/** @type {{ message?: string }} */ (cause)?.message ?? 'Your library could not be loaded.';
		} finally {
			if (generation === this.#generation) {
				this.loading = false;
				this.#pending = null;
			}
		}
	}

	/**
	 * Adopt a `{ activePlaylistId, playlists }` payload.
	 *
	 * Everything goes through `normalizePlaylist`, the same total function that used
	 * to clean up `localStorage`: the server is trusted, but a shape mismatch between
	 * a cached client and a new server should cost one playlist, not the page.
	 *
	 * @param {any} snapshot
	 * @returns {void}
	 */
	#apply(snapshot) {
		const incoming = Array.isArray(snapshot?.playlists) ? snapshot.playlists : [];
		this.playlists = /** @type {Playlist[]} */ (
			incoming.map(normalizePlaylist).filter((/** @type {Playlist|null} */ p) => p !== null)
		);

		const activeId = snapshot?.activePlaylistId;
		this.#activePlaylistId =
			typeof activeId === 'string' && this.playlists.some((playlist) => playlist.id === activeId)
				? activeId
				: (this.playlists[0]?.id ?? null);
	}

	/**
	 * Insert or merge a playlist the server just handed back.
	 *
	 * @param {Playlist} playlist
	 * @returns {void}
	 */
	#replacePlaylist(playlist) {
		const index = this.playlists.findIndex((candidate) => candidate.id === playlist.id);
		if (index === -1) this.playlists.push(playlist);
		else this.playlists[index] = playlist;
	}

	/**
	 * Change one video of the active playlist here and then there.
	 *
	 * @param {string} videoId
	 * @param {{ rating?: Rating|null, unavailable?: boolean }} patch
	 * @param {string} failureMessage
	 * @returns {boolean} `false` when the active playlist has no such video.
	 */
	#patchVideo(videoId, patch, failureMessage) {
		const playlist = this.activePlaylist;
		const video = playlist?.videos.find((candidate) => candidate.id === videoId);
		if (!playlist || !video) return false;

		const playlistId = playlist.id;
		const before = { rating: video.rating, unavailable: video.unavailable };
		const previousUpdatedAt = playlist.updatedAt;

		if ('rating' in patch) video.rating = patch.rating ?? null;
		if ('unavailable' in patch) video.unavailable = Boolean(patch.unavailable);
		playlist.updatedAt = new Date().toISOString();

		this.#send(
			apiFetch(
				`/playlists/${encodeURIComponent(playlistId)}/videos/${encodeURIComponent(videoId)}`,
				{ method: 'PATCH', body: patch }
			),
			() => {
				// Looked up again rather than captured: a reload may have replaced the
				// objects under us, and putting a value back into an orphan would look
				// like it worked.
				const target = this.playlists.find((candidate) => candidate.id === playlistId);
				const current = target?.videos.find((candidate) => candidate.id === videoId);
				if (!target || !current) return;
				current.rating = before.rating;
				current.unavailable = before.unavailable;
				target.updatedAt = previousUpdatedAt;
			},
			failureMessage
		);
		return true;
	}

	/**
	 * @param {Playlist} playlist
	 * @param {string[]} order
	 * @returns {boolean}
	 */
	#setOrder(playlist, order) {
		const playlistId = playlist.id;
		const previousOrder = [...playlist.order];
		const previousUpdatedAt = playlist.updatedAt;

		playlist.order = order;
		playlist.updatedAt = new Date().toISOString();

		this.#send(
			apiFetch(`/playlists/${encodeURIComponent(playlistId)}/order`, {
				method: 'PUT',
				body: { order }
			}),
			() => {
				const target = this.playlists.find((candidate) => candidate.id === playlistId);
				if (!target) return;
				target.order = previousOrder;
				target.updatedAt = previousUpdatedAt;
			},
			'The new order could not be saved.'
		);
		return true;
	}

	/**
	 * Wait for a write that has already been applied on screen, and undo it if the
	 * server says no.
	 *
	 * Rolling back to the value captured at the moment of the change — rather than
	 * re-reading the library — is deliberate: a failed write usually means the device
	 * is offline, and a read would fail too. The cost is that two changes to the same
	 * video, the second of which fails, roll back to the state before the second
	 * rather than before both; the next load settles it either way.
	 *
	 * @param {Promise<unknown>} request
	 * @param {() => void} rollback
	 * @param {string} failureMessage - One sentence, without the server's own.
	 * @returns {void}
	 */
	#send(request, rollback, failureMessage) {
		request.catch((/** @type {any} */ cause) => {
			rollback();
			notifyError(failureMessage, { description: cause?.message });
		});
	}
}

/**
 * @param {string} text
 * @returns {unknown} The parsed file, or the text itself when it is not JSON — the
 *   server answers with the message the user needs either way, and this way there is
 *   one place that decides what "not valid JSON" reads like.
 */
function parseJsonText(text) {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/** The app-wide library. */
export const library = new Library();
