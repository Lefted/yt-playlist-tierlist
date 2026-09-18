/**
 * User settings, persisted under `ytpt:v1:settings`.
 *
 * Every field is an accessor whose setter writes through to `localStorage`, so
 * `settings.skipRated = false` (and `bind:checked={settings.skipRated}`) persists
 * without any component lifecycle being involved.
 */

import { load, save } from '../storage.js';
import { DEFAULT_SHORTCUT_MODE, isShortcutMode } from '../types.js';

/** @typedef {import('../types.js').Settings} Settings */
/** @typedef {import('../types.js').ShortcutMode} ShortcutMode */

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
	fullscreenOnPlay: false,
	shortcuts: DEFAULT_SHORTCUT_MODE,
	loop: false
};

class SettingsStore {
	#apiKey = $state(DEFAULTS.apiKey);
	#skipRated = $state(DEFAULTS.skipRated);
	#autoAdvance = $state(DEFAULTS.autoAdvance);
	#fullscreenOnPlay = $state(DEFAULTS.fullscreenOnPlay);
	/** @type {ShortcutMode} */
	#shortcuts = $state(DEFAULTS.shortcuts);
	#loop = $state(DEFAULTS.loop);

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

	/**
	 * @returns {ShortcutMode} Which keys the Rate page answers to — `'off'` means
	 * none at all, buttons only.
	 */
	get shortcuts() {
		return this.#shortcuts;
	}

	set shortcuts(value) {
		this.#shortcuts = isShortcutMode(value) ? value : DEFAULT_SHORTCUT_MODE;
		this.#persist();
	}

	/**
	 * @returns {boolean} Restart the current video when it ends instead of moving on.
	 * A mode, not a property of one video: it applies to the next one too.
	 */
	get loop() {
		return this.#loop;
	}

	set loop(value) {
		this.#loop = Boolean(value);
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
			fullscreenOnPlay: this.#fullscreenOnPlay,
			shortcuts: this.#shortcuts,
			loop: this.#loop
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
		this.#shortcuts = isShortcutMode(stored.shortcuts) ? stored.shortcuts : DEFAULTS.shortcuts;
		this.#loop = typeof stored.loop === 'boolean' ? stored.loop : DEFAULTS.loop;
	}

	/** @returns {void} */
	#persist() {
		save(STORAGE_KEY, { version: STORAGE_VERSION, ...this.toJSON() });
	}
}

/** The app-wide settings. */
export const settings = new SettingsStore();
