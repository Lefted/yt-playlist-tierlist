/**
 * User settings, persisted under `ytpt:v1:settings`.
 *
 * Every field is an accessor whose setter writes through to `localStorage`, so
 * `settings.skipRated = false` (and `bind:checked={settings.skipRated}`) persists
 * without any component lifecycle being involved.
 */

import { load, save } from '../storage.js';

/** @typedef {import('../types.js').Settings} Settings */

const STORAGE_KEY = 'settings';
/**
 * Written into every persisted payload. Nothing reads it yet - it is what lets a
 * future shape change migrate instead of discarding the user's ratings, and both
 * loaders already tolerate unknown and missing fields.
 */
const STORAGE_VERSION = 1;

/** @type {Settings} */
const DEFAULTS = {
	apiKey: '',
	skipRated: true,
	autoAdvance: true,
	fullscreenOnPlay: false
};

class SettingsStore {
	#apiKey = $state(DEFAULTS.apiKey);
	#skipRated = $state(DEFAULTS.skipRated);
	#autoAdvance = $state(DEFAULTS.autoAdvance);
	#fullscreenOnPlay = $state(DEFAULTS.fullscreenOnPlay);

	constructor() {
		this.#apply(load(STORAGE_KEY, DEFAULTS));
	}

	/** @returns {string} Personal YouTube Data API key; `''` until the user supplies one. */
	get apiKey() {
		return this.#apiKey;
	}

	set apiKey(value) {
		this.#apiKey = typeof value === 'string' ? value.trim() : '';
		this.#persist();
	}

	/** @returns {boolean} Leave already rated videos out of the rating queue. */
	get skipRated() {
		return this.#skipRated;
	}

	set skipRated(value) {
		this.#skipRated = Boolean(value);
		this.#persist();
	}

	/** @returns {boolean} Move to the next video right after rating one. */
	get autoAdvance() {
		return this.#autoAdvance;
	}

	set autoAdvance(value) {
		this.#autoAdvance = Boolean(value);
		this.#persist();
	}

	/** @returns {boolean} Ask the player for fullscreen when playback starts. */
	get fullscreenOnPlay() {
		return this.#fullscreenOnPlay;
	}

	set fullscreenOnPlay(value) {
		this.#fullscreenOnPlay = Boolean(value);
		this.#persist();
	}

	/** @returns {boolean} Whether an API key is available for imports. */
	get hasApiKey() {
		return this.#apiKey !== '';
	}

	/**
	 * Restore the defaults and persist them.
	 * @returns {void}
	 */
	reset() {
		this.#apply(DEFAULTS);
		this.#persist();
	}

	/**
	 * Plain snapshot, e.g. for tests or exports.
	 * @returns {Settings}
	 */
	toJSON() {
		return {
			apiKey: this.#apiKey,
			skipRated: this.#skipRated,
			autoAdvance: this.#autoAdvance,
			fullscreenOnPlay: this.#fullscreenOnPlay
		};
	}

	/**
	 * @param {unknown} raw - Anything that came out of storage; unknown fields are ignored.
	 * @returns {void}
	 */
	#apply(raw) {
		const stored =
			raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
		this.#apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : DEFAULTS.apiKey;
		this.#skipRated = typeof stored.skipRated === 'boolean' ? stored.skipRated : DEFAULTS.skipRated;
		this.#autoAdvance =
			typeof stored.autoAdvance === 'boolean' ? stored.autoAdvance : DEFAULTS.autoAdvance;
		this.#fullscreenOnPlay =
			typeof stored.fullscreenOnPlay === 'boolean'
				? stored.fullscreenOnPlay
				: DEFAULTS.fullscreenOnPlay;
	}

	/** @returns {void} */
	#persist() {
		save(STORAGE_KEY, { version: STORAGE_VERSION, ...this.toJSON() });
	}
}

/** The app-wide settings. */
export const settings = new SettingsStore();
