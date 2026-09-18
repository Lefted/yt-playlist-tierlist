/**
 * The "Import JSON" half of the library's backup story: pick a file, hand its
 * text to `library.importJson`, and turn either outcome into one notice.
 *
 * Shared by the empty state and the playlist card, which offer the same action
 * from different triggers.
 */

import { library } from '$lib/state/library.svelte.js';
import { importErrorMessage } from './errors.js';

/**
 * A short result message for the user.
 * @typedef {{ tone: 'ok' | 'error', text: string }} Notice
 */

/**
 * Take the file out of an `<input type="file">` change event and reset the input,
 * so picking the same file twice fires `change` again.
 *
 * @param {Event} event
 * @returns {File|null} `null` when the dialog was cancelled.
 */
export function takeFile(event) {
	const input = /** @type {HTMLInputElement} */ (event.currentTarget);
	const file = input.files?.[0] ?? null;
	input.value = '';
	return file;
}

/**
 * Merge an exported library file into the current one.
 *
 * @param {File} file
 * @returns {Promise<Notice>} Never rejects — a bad file is a notice, not a throw.
 */
export async function applyLibraryFile(file) {
	try {
		const summary = library.importJson(await file.text());
		return {
			tone: 'ok',
			text: `Imported ${summary.videos} video(s) from ${summary.playlists} playlist(s); ${summary.ratingsApplied} rating(s) applied.`
		};
	} catch (cause) {
		return { tone: 'error', text: importErrorMessage(cause) };
	}
}
