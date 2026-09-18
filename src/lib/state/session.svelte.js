/**
 * The rating session: which videos of the active playlist are up for rating, and
 * where in that queue we currently are.
 *
 * Nothing here is persisted — a session is derived from {@link library} and
 * {@link settings} and starts fresh on reload.
 */

import { isRating, RATING_ORDER } from '../types.js';
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

class Session {
	/** @type {Rating[]} Selected tiers; empty means "no tier filter". */
	#tiers = $state([]);

	#includeUnrated = $state(true);

	#index = $state(0);

	/** @type {string|null} Video {@link jumpTo} forced into the queue past the filter. */
	#pinnedId = $state(null);

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
		if (filter.tiers !== undefined) {
			const selected = [...filter.tiers].filter(isRating);
			this.#tiers = RATING_ORDER.filter((rating) => selected.includes(rating));
		}
		if (filter.includeUnrated !== undefined) this.#includeUnrated = Boolean(filter.includeUnrated);
		this.#pinnedId = null;
		this.#index = 0;
	}

	/**
	 * Add or remove a tier from the filter.
	 *
	 * @param {Rating} rating
	 * @returns {void}
	 */
	toggleTier(rating) {
		if (!isRating(rating)) return;
		const tiers = this.#tiers.includes(rating)
			? this.#tiers.filter((tier) => tier !== rating)
			: [...this.#tiers, rating];
		this.setFilter({ tiers });
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

		library.rate(video.id, rating);
		if (settings.autoAdvance) this.advancePast(video.id);

		return true;
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
