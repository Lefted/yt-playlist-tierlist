/**
 * The one-time "bring the tier list off this device" path.
 *
 * Before #17 the library lived in `localStorage` under `ytpt:v1:library`. A browser
 * that used the app back then still has it, and the first thing an account wants is
 * that data — so it is offered once, imported through the ordinary backup path
 * (`POST /api/v1/library/import-json`, which never overwrites a tier), and the key is
 * then **renamed** rather than deleted.
 *
 * Renaming is the whole safety story: `ytpt:v1:library.migrated` keeps the original
 * bytes, so a failed or half-believed migration is still recoverable by hand, and the
 * offer does not come back every time the page loads.
 */

import { library } from '$lib/state/library.svelte.js';
import { load, remove, save } from '$lib/storage.js';
import { importErrorMessage } from './errors.js';

/** @typedef {import('./json-file.js').Notice} Notice */

/** Where the library used to live, unprefixed (`storage.js` adds `ytpt:v1:`). */
export const LOCAL_LIBRARY_KEY = 'library';

/** Where it is kept afterwards. Nothing reads it; it exists so nothing is lost. */
export const MIGRATED_LIBRARY_KEY = 'library.migrated';

/**
 * The library this browser stored before accounts existed.
 *
 * @returns {unknown|null} `null` when there is none, or when what is there is not a
 *   library at all — an unusable payload is not worth offering to import.
 */
export function localLibrary() {
	const stored = load(LOCAL_LIBRARY_KEY, /** @type {any} */ (null));
	if (!stored || typeof stored !== 'object' || !Array.isArray(stored.playlists)) return null;
	if (stored.playlists.length === 0) return null;
	return stored;
}

/** @returns {boolean} Whether this browser has something to offer. */
export function hasLocalLibrary() {
	return localLibrary() !== null;
}

/**
 * Whether to put the offer in front of the user unasked.
 *
 * Pure, so the rule is a test rather than a screenshot. Only an account that has
 * *nothing* is asked: somebody who already has playlists on the server gets the same
 * action from the Browse import menu instead, where it is a decision rather than an
 * interruption.
 *
 * @param {object} state
 * @param {boolean} state.hasLocal - {@link hasLocalLibrary}.
 * @param {boolean} state.loading - `library.loading`.
 * @param {string|null} state.error - `library.error`.
 * @param {number} state.playlistCount - `library.playlists.length`.
 * @returns {boolean}
 */
export function shouldOfferLocalImport({ hasLocal, loading, error, playlistCount }) {
	if (!hasLocal) return false;
	// A library we could not read is not an empty one, and offering to "restore" into
	// it could duplicate work the account already did.
	if (loading || error !== null) return false;
	return playlistCount === 0;
}

/**
 * Import this browser's old library into the signed-in account, then rename the key.
 *
 * @returns {Promise<Notice>} Never rejects — a failure is a notice, and the local
 *   key is left exactly where it was so the offer can be taken again.
 */
export async function importLocalLibrary() {
	const stored = localLibrary();
	if (!stored) {
		return { tone: 'error', text: 'This browser has no stored tier list to import.' };
	}

	try {
		const summary = await library.importJson(JSON.stringify(stored));
		markLocalLibraryMigrated();
		return {
			tone: 'ok',
			text: `Imported ${summary.videos} video(s) from ${summary.playlists} playlist(s); ${summary.ratingsApplied} rating(s) applied. This browser's copy was kept as "${MIGRATED_LIBRARY_KEY}".`
		};
	} catch (cause) {
		return { tone: 'error', text: importErrorMessage(cause) };
	}
}

/**
 * Move `ytpt:v1:library` to `ytpt:v1:library.migrated`.
 *
 * @returns {boolean} `false` when there was nothing to move, or storage refused.
 */
export function markLocalLibraryMigrated() {
	const stored = load(LOCAL_LIBRARY_KEY, /** @type {any} */ (null));
	if (stored === null) return false;
	// Written before the original is dropped: a storage quota that refuses the copy
	// must not also lose the thing being copied.
	if (!save(MIGRATED_LIBRARY_KEY, stored)) return false;
	return remove(LOCAL_LIBRARY_KEY);
}
