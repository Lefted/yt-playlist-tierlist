/**
 * The only module in the app that talks to `localStorage`.
 *
 * Every key is namespaced with `ytpt:v1:`. Reads never throw: a missing store,
 * a missing key and corrupted JSON all yield the caller's fallback.
 */

/** Namespace for every key this app owns. */
export const STORAGE_PREFIX = 'ytpt:v1:';

/**
 * `localStorage` is absent during SSR/prerender and in plain Node, and throws on
 * access when the browser blocks storage (private mode, disabled cookies).
 *
 * @returns {Storage|null}
 */
function getStore() {
	try {
		if (typeof localStorage === 'undefined' || localStorage === null) return null;
		return localStorage;
	} catch {
		return null;
	}
}

/**
 * @param {string} name - Unprefixed key, e.g. `library`.
 * @returns {string}
 */
function keyFor(name) {
	return `${STORAGE_PREFIX}${name}`;
}

/**
 * Read and parse a stored value.
 *
 * @template T
 * @param {string} name
 * @param {T} fallback - Returned when the key is missing, unreadable or invalid JSON.
 * @returns {T}
 */
export function load(name, fallback) {
	const store = getStore();
	if (!store) return fallback;
	try {
		const raw = store.getItem(keyFor(name));
		if (raw === null) return fallback;
		return /** @type {T} */ (JSON.parse(raw));
	} catch {
		return fallback;
	}
}

/**
 * Serialise and store a value.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {boolean} `false` when storage is unavailable or full — never throws, so
 *   a failed write can be ignored by callers that only persist a convenience copy.
 */
export function save(name, value) {
	const store = getStore();
	if (!store) return false;
	try {
		store.setItem(keyFor(name), JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

/**
 * Drop a stored value.
 *
 * @param {string} name
 * @returns {boolean} `false` when storage is unavailable.
 */
export function remove(name) {
	const store = getStore();
	if (!store) return false;
	try {
		store.removeItem(keyFor(name));
		return true;
	} catch {
		return false;
	}
}
