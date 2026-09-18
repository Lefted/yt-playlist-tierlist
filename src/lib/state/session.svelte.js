/**
 * The rating session: which videos of the active playlist are up for rating, and
 * where in that queue we currently are.
 *
 * Nothing here is persisted — a session is derived from {@link library} and
 * {@link settings} and starts fresh on reload.
 */

import { normalizeRatings } from '../types.js';
import { library } from './library.svelte.js';
import { settings } from './settings.svelte.js';

/** @typedef {import('../types.js').Rating} Rating */
/** @typedef {import('../types.js').Video} Video */

/**
 * Which tiers the session should cover.
 * @typedef {Object} QueueFilter
 * @property {Set<Rating>} tiers - Empty means "no tier filter".
 * @property {boolean} includeUnrated - Keep unrated videos in the queue.
 */

/**
 * @typedef {Object} Progress
 * @property {number} done - Playable videos of the active playlist that are rated.
 * @property {number} total - Playable videos of the active playlist.
 */

/**
 * One reversible step of the session.
 *
 * `previousRating` and `wasUnavailable` are what the video looked like before, so
 * undoing restores exactly that; `title` and `rating` are what the UI says the step
 * *was* ("Undo: Test AMV 4 → C").
 *
 * @typedef {Object} UndoEntry
 * @property {number} id - Identifies this very step, so a toast that has been on
 *   screen for a while cannot take back a newer one.
 * @property {'rate'|'unavailable'} kind
 * @property {string} videoId
 * @property {string} title
 * @property {Rating|null} rating - The rating the step assigned; `null` for a
 *   cleared rating and for "mark unavailable".
 * @property {Rating|null} previousRating
 * @property {boolean} wasUnavailable
 * @property {number} previousIndex - Queue position the step started from.
 */

/**
 * How many steps back the undo stack reaches. Deep enough to walk back out of a
 * misclick streak, shallow enough to stay a stack and not a history.
 */
const UNDO_LIMIT = 50;

/** Hands out {@link UndoEntry} ids; only their identity matters, never their value. */
let nextUndoId = 1;

class Session {
	/** @type {Rating[]} Selected tiers; empty means "no tier filter". */
	#tiers = $state([]);

	#includeUnrated = $state(true);

	#index = $state(0);

	/** @type {string|null} Video {@link jumpTo} forced into the queue past the filter. */
	#pinnedId = $state(null);

	/** @type {UndoEntry[]} Oldest first; see {@link undo}. In memory only. */
	#undoStack = $state([]);

	/** @type {string|null} Playlist {@link #undoStack} was collected on. */
	#undoPlaylistId = $state(null);

	/**
	 * @type {UndoEntry[]} The stack as far as it still applies: a step recorded on
	 * another playlist cannot be undone here, because the video it names is not in
	 * this playlist. {@link clearUndo} is what actually empties it.
	 */
	#undoable = $derived(
		this.#undoPlaylistId === library.activePlaylistId
			? this.#undoStack
			: /** @type {UndoEntry[]} */ ([])
	);

	/**
	 * @type {Video[]} Everything the session is about, rated or not — the basis of
	 * {@link progress}.
	 */
	#scope = $derived(library.availableVideos.filter((video) => this.#inScope(video)));

	/**
	 * @type {Video[]} The videos to rate, in playback order.
	 *
	 * Unavailable videos are always out. A rated video stays in when its tier is
	 * selected, or — without a tier filter — when `settings.skipRated` is off.
	 * Unrated videos depend only on `includeUnrated`, which is what makes a tier
	 * filter usable for rating (the legacy app dropped them and left the filtered
	 * videos unratable).
	 */
	queue = $derived.by(() => {
		const filtered = this.#tiers.length > 0;
		return library.availableVideos.filter((video) => {
			if (video.id === this.#pinnedId) return true;
			if (!this.#inScope(video)) return false;
			return video.rating === null || filtered || !settings.skipRated;
		});
	});

	/** @type {number} Position in the queue, clamped to the current queue length. */
	index = $derived(Math.min(this.#index, Math.max(this.queue.length - 1, 0)));

	/** @type {Video|null} The video being rated, `null` when the queue is empty. */
	currentVideo = $derived(this.queue[this.index] ?? null);

	/** @type {boolean} */
	hasNext = $derived(this.index < this.queue.length - 1);

	/** @type {boolean} */
	hasPrevious = $derived(this.index > 0);

	/** @type {Progress} How much of what this session covers is already rated. */
	progress = $derived({
		done: this.#scope.filter((video) => video.rating !== null).length,
		total: this.#scope.length
	});

	/**
	 * Is this video part of what the session covers, regardless of `skipRated`?
	 *
	 * @param {Video} video
	 * @returns {boolean}
	 */
	#inScope(video) {
		if (video.rating === null) return this.#includeUnrated;
		return this.#tiers.length === 0 || this.#tiers.includes(video.rating);
	}

	/** @returns {QueueFilter} A snapshot of the current filter. */
	get filter() {
		return { tiers: new Set(this.#tiers), includeUnrated: this.#includeUnrated };
	}

	/** @returns {boolean} Whether unrated videos are part of the queue. */
	get includeUnrated() {
		return this.#includeUnrated;
	}

	set includeUnrated(value) {
		this.#includeUnrated = Boolean(value);
	}

	/**
	 * Replace the queue filter. Unknown tiers are ignored.
	 *
	 * @param {{ tiers?: Iterable<Rating>, includeUnrated?: boolean }} filter
	 * @returns {void}
	 */
	setFilter(filter = {}) {
		if (filter.tiers !== undefined) this.#tiers = normalizeRatings(filter.tiers);
		if (filter.includeUnrated !== undefined) this.#includeUnrated = Boolean(filter.includeUnrated);
		this.#pinnedId = null;
		this.#index = 0;
	}

	/**
	 * Drop the tier filter.
	 * @returns {void}
	 */
	clearFilter() {
		this.setFilter({ tiers: [], includeUnrated: true });
	}

	/**
	 * @returns {boolean} `false` when already at the end of the queue.
	 */
	next() {
		if (!this.hasNext) return false;
		this.#index = this.index + 1;
		return true;
	}

	/**
	 * @returns {boolean} `false` when already at the start of the queue.
	 */
	previous() {
		if (!this.hasPrevious) return false;
		this.#index = this.index - 1;
		return true;
	}

	/**
	 * Move to a specific video — used by `/rate?v=<videoId>`.
	 *
	 * A playable video that the current filter excludes (an already rated one while
	 * `skipRated` is on, say) is pinned into the queue instead of being refused:
	 * following a deep link should never be answered with "not in your queue".
	 *
	 * @param {string} videoId
	 * @returns {boolean} `false` when the active playlist cannot play that video.
	 */
	jumpTo(videoId) {
		let target = this.queue.findIndex((video) => video.id === videoId);
		if (target === -1) {
			if (!library.availableVideos.some((video) => video.id === videoId)) return false;
			this.#pinnedId = videoId;
			target = this.queue.findIndex((video) => video.id === videoId);
			if (target === -1) return false;
		}
		this.#index = target;
		return true;
	}

	/**
	 * Rate the current video and, when `settings.autoAdvance` is on, move on.
	 *
	 * @param {Rating|null} rating
	 * @returns {boolean} `false` when there is nothing to rate.
	 */
	rateCurrent(rating) {
		const video = this.currentVideo;
		if (!video) return false;

		this.#pushUndo({
			kind: 'rate',
			videoId: video.id,
			title: video.title,
			rating,
			previousRating: video.rating,
			wasUnavailable: video.unavailable,
			previousIndex: this.index
		});
		library.rate(video.id, rating);
		if (settings.autoAdvance) this.advancePast(video.id);

		return true;
	}

	/**
	 * Flag the current video as unplayable and move on — the manual counterpart to
	 * the player reporting an error, and undoable like a rating.
	 *
	 * @returns {{ id: string, title: string }|null} The video that was flagged,
	 *   `null` when there was none.
	 */
	markCurrentUnavailable() {
		const video = this.currentVideo;
		if (!video) return null;

		const flagged = { id: video.id, title: video.title };
		this.#pushUndo({
			kind: 'unavailable',
			videoId: video.id,
			title: video.title,
			rating: null,
			previousRating: video.rating,
			wasUnavailable: video.unavailable,
			previousIndex: this.index
		});
		library.markUnavailable(flagged.id);
		this.advancePast(flagged.id);

		return flagged;
	}

	/** @returns {boolean} Whether there is a step to take back. */
	get canUndo() {
		return this.#undoable.length > 0;
	}

	/**
	 * @returns {UndoEntry|null} The step {@link undo} would take back — what the
	 * button's tooltip and the toast describe.
	 */
	get lastUndo() {
		const entry = this.#undoable.at(-1);
		return entry ? { ...entry } : null;
	}

	/**
	 * Take back the last rating (or "mark unavailable") and go back to that video.
	 *
	 * The previous value is restored unconditionally, even when the video was rated
	 * again elsewhere in the meantime: undo is an explicit request, not a merge.
	 *
	 * @param {number} [expectedId] - Only undo while *this* step is still the last
	 *   one. The toast that follows a rating stays on screen while the next rating
	 *   happens, and its Undo must not silently take back that newer one instead.
	 * @returns {UndoEntry|null} The step that was taken back, `null` when there was
	 *   none — or when `expectedId` no longer names the last one.
	 */
	undo(expectedId) {
		if (!this.canUndo) return null;
		if (expectedId !== undefined && this.lastUndo?.id !== expectedId) return null;

		const entry = /** @type {UndoEntry} */ (this.#undoStack.pop());
		if (entry.kind === 'unavailable' && !entry.wasUnavailable) library.markAvailable(entry.videoId);
		library.rate(entry.videoId, entry.previousRating);

		// The video is back in play, so it is back in the queue — except when a filter
		// excludes it, which `jumpTo` pins past. Only a video the playlist lost for
		// good falls through to the remembered position.
		if (!this.jumpTo(entry.videoId)) {
			this.#index = Math.max(0, entry.previousIndex);
		}

		return entry;
	}

	/**
	 * Forget every recorded step.
	 *
	 * The stack is about the session in front of the user: a switch to another
	 * playlist ends it, because its entries name videos that playlist does not have.
	 * The Rate page calls this when the active playlist changes — nothing here can
	 * watch for that, since a read is not allowed to write.
	 *
	 * @returns {void}
	 */
	clearUndo() {
		this.#undoStack = [];
		this.#undoPlaylistId = library.activePlaylistId;
	}

	/**
	 * @param {Omit<UndoEntry, 'id'>} entry
	 * @returns {void}
	 */
	#pushUndo(entry) {
		if (this.#undoPlaylistId !== library.activePlaylistId) {
			this.#undoStack = [];
			this.#undoPlaylistId = library.activePlaylistId;
		}
		this.#undoStack.push({ ...entry, id: nextUndoId++ });
		if (this.#undoStack.length > UNDO_LIMIT) this.#undoStack.shift();
	}

	/**
	 * Move on after something happened to `videoId` — a rating, or the library
	 * flagging it as unavailable.
	 *
	 * When that took the video out of the queue, the next one already slid into this
	 * index and advancing on top of it would skip one.
	 *
	 * @param {string} videoId
	 * @returns {boolean} Whether the index moved.
	 */
	advancePast(videoId) {
		if (!this.queue.some((candidate) => candidate.id === videoId)) return false;
		return this.next();
	}
}

/** The app-wide rating session. */
export const session = new Session();
