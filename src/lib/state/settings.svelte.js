/**
 * Device preferences, persisted under `ytpt:v1:settings`.
 *
 * Deliberately local and not per account (#14): which keys you like and whether a
 * video should go fullscreen are properties of the machine in front of you, not of
 * the person logged into it. The library went the other way — it lives in Postgres
 * since #17. An `apiKey` left here by an older version is ignored: the YouTube key is
 * the server's now.
 *
 * Every field is an accessor whose setter writes through to `localStorage`, so
 * `settings.skipRated = false` (and `bind:checked={settings.skipRated}`) persists
 * without any component lifecycle being involved.
 */

import { DEFAULT_KEYBINDINGS, normalizeKeybindings } from '../keybindings.js';
import { load, save } from '../storage.js';

/** @typedef {import('../types.js').Settings} Settings */
/** @typedef {import('../types.js').Keybindings} Keybindings */

const STORAGE_KEY = 'settings';
/**
 * Written into every persisted payload. Nothing reads it yet - it is what lets a
 * future shape change migrate instead of discarding the user's ratings, and both
 * loaders already tolerate unknown and missing fields.
 */
const STORAGE_VERSION = 1;

/** @type {Settings} */
const DEFAULTS = {
	skipRated: true,
	autoAdvance: true,
	fullscreenOnPlay: false,
	shortcuts: true,
	keybindings: normalizeKeybindings(DEFAULT_KEYBINDINGS),
	loop: false,
	overlayCollapsed: false
};

class SettingsStore {
	#skipRated = $state(DEFAULTS.skipRated);
	#autoAdvance = $state(DEFAULTS.autoAdvance);
	#fullscreenOnPlay = $state(DEFAULTS.fullscreenOnPlay);
	#shortcuts = $state(DEFAULTS.shortcuts);
	// A copy, not `DEFAULTS.keybindings` itself: `$state` proxies the object it is
	// given, and a rune-proxied default table would be shared with every write.
	#keybindings = $state(normalizeKeybindings(DEFAULTS.keybindings));
	#loop = $state(DEFAULTS.loop);
	#overlayCollapsed = $state(DEFAULTS.overlayCollapsed);

	constructor() {
		this.#apply(load(STORAGE_KEY, DEFAULTS));
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
	 * @returns {boolean} Whether the rating keys (`s a b c d f`, undo, loop, replay)
	 * are on. The player keys the Rate page proxies stay either way.
	 */
	get shortcuts() {
		return this.#shortcuts;
	}

	set shortcuts(value) {
		this.#shortcuts = Boolean(value);
		this.#persist();
	}

	/**
	 * @returns {Keybindings} Which key each rating action answers to — the table the
	 * Rate page matches against and every key hint is generated from. `shortcuts`
	 * above still switches the whole layer off; this only says what it listens for.
	 */
	get keybindings() {
		return this.#keybindings;
	}

	set keybindings(value) {
		// Normalising here rather than at the call site is what lets the editing UI
		// hand over a half-trusted table (a chord the user just typed, a reset to the
		// frozen defaults) and still get a fresh, canonical, unshared one back.
		this.#keybindings = normalizeKeybindings(value);
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
	 * @returns {boolean} Whether the fullscreen overlay is tucked away into its eye
	 * button (#19). Remembered rather than reset per video: having hidden the controls
	 * once, the user means the next video too — and the next fullscreen after that.
	 */
	get overlayCollapsed() {
		return this.#overlayCollapsed;
	}

	set overlayCollapsed(value) {
		this.#overlayCollapsed = Boolean(value);
		this.#persist();
	}

	/**
	 * Plain snapshot, e.g. for tests or exports.
	 * @returns {Settings}
	 */
	toJSON() {
		return {
			skipRated: this.#skipRated,
			autoAdvance: this.#autoAdvance,
			fullscreenOnPlay: this.#fullscreenOnPlay,
			shortcuts: this.#shortcuts,
			keybindings: normalizeKeybindings(this.#keybindings),
			loop: this.#loop,
			overlayCollapsed: this.#overlayCollapsed
		};
	}

	/**
	 * @param {unknown} raw - Anything that came out of storage; unknown fields are ignored.
	 * @returns {void}
	 */
	#apply(raw) {
		const stored =
			raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
		this.#skipRated = typeof stored.skipRated === 'boolean' ? stored.skipRated : DEFAULTS.skipRated;
		this.#autoAdvance =
			typeof stored.autoAdvance === 'boolean' ? stored.autoAdvance : DEFAULTS.autoAdvance;
		this.#fullscreenOnPlay =
			typeof stored.fullscreenOnPlay === 'boolean'
				? stored.fullscreenOnPlay
				: DEFAULTS.fullscreenOnPlay;
		this.#shortcuts = typeof stored.shortcuts === 'boolean' ? stored.shortcuts : DEFAULTS.shortcuts;
		this.#keybindings = normalizeKeybindings(stored.keybindings);
		this.#loop = typeof stored.loop === 'boolean' ? stored.loop : DEFAULTS.loop;
		this.#overlayCollapsed =
			typeof stored.overlayCollapsed === 'boolean'
				? stored.overlayCollapsed
				: DEFAULTS.overlayCollapsed;
	}

	/** @returns {void} */
	#persist() {
		save(STORAGE_KEY, { version: STORAGE_VERSION, ...this.toJSON() });
	}
}

/** The app-wide settings. */
export const settings = new SettingsStore();
