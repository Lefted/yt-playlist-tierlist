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
		const tiers = this.#tiers;
		const filtered = tiers.length > 0;
		return library.activeVideos.filter((video) => {
			if (video.unavailable) return false;
			if (video.rating === null) return this.#includeUnrated;
			return filtered ? tiers.includes(video.rating) : !settings.skipRated;
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

	/** @type {Progress} Rating progress of the whole active playlist. */
	progress = $derived({ done: library.ratedCount, total: library.availableCount });

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
	 * Move to a specific video of the queue — used by `/rate?v=<videoId>`.
	 *
	 * @param {string} videoId
	 * @returns {boolean} `false` when the video is not part of the current queue.
	 */
	jumpTo(videoId) {
		const target = this.queue.findIndex((video) => video.id === videoId);
		if (target === -1) return false;
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
		if (!settings.autoAdvance) return true;

		// When the rating removed the video from the queue, the next one already slid
		// into this index and advancing would skip it.
		if (this.queue.some((candidate) => candidate.id === video.id)) this.next();
		else this.#index = this.index;

		return true;
	}

	/**
	 * Back to the start of the queue.
	 * @returns {void}
	 */
	restart() {
		this.#index = 0;
	}
}

/** The app-wide rating session. */
export const session = new Session();
