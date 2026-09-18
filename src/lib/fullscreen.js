/**
 * The Fullscreen API, minus the prefixes and the exceptions.
 *
 * Safari still only has the `webkit` spelling, and every browser rejects a request
 * that did not come from a user gesture — plus iOS Safari refuses element
 * fullscreen outright. Components should not have to know any of that, so every
 * call here answers with a plain boolean and every read falls back cleanly.
 *
 * Pure adapter: nothing is touched at import time, the document is always passed
 * in, which is what makes it testable without a DOM.
 */

/** The events that announce a fullscreen change; both spellings fire at most once each. */
export const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'];

/**
 * @param {any} doc - Usually `document`.
 * @returns {any} The element that is currently fullscreen, `null` when none is.
 */
export function fullscreenElementOf(doc) {
	if (!doc) return null;
	return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Is this very element the fullscreen one?
 *
 * Deliberately an identity check and not `contains`: when a cross-origin iframe
 * *inside* the element went fullscreen by itself, the keyboard and any overlay
 * belong to that iframe, not to us.
 *
 * @param {any} doc
 * @param {any} element
 * @returns {boolean}
 */
export function isFullscreenElement(doc, element) {
	return Boolean(element) && fullscreenElementOf(doc) === element;
}

/**
 * Ask for fullscreen on an element.
 *
 * @param {any} element
 * @returns {Promise<boolean>} `false` when the browser has no such call or refused
 *   the request.
 */
export async function enterFullscreen(element) {
	const request = element?.requestFullscreen ?? element?.webkitRequestFullscreen;
	if (typeof request !== 'function') return false;

	try {
		await request.call(element);
		return true;
	} catch {
		return false;
	}
}

/**
 * Leave fullscreen, whatever is in it.
 *
 * @param {any} doc
 * @returns {Promise<boolean>} `false` when nothing was fullscreen or the browser
 *   would not leave it.
 */
export async function leaveFullscreen(doc) {
	if (!fullscreenElementOf(doc)) return false;

	const exit = doc?.exitFullscreen ?? doc?.webkitExitFullscreen;
	if (typeof exit !== 'function') return false;

	try {
		await exit.call(doc);
		return true;
	} catch {
		return false;
	}
}

/**
 * Where the keyboard should go once a video has ended without a rating.
 *
 * In fullscreen only the player's own wrapper is on screen (and only it keeps the
 * shortcuts out of the iframe); otherwise it is the tier bar, which is where the
 * next keystroke is expected to land.
 *
 * @param {boolean} fullscreen
 * @returns {'player'|'tierBar'}
 */
export function focusTargetFor(fullscreen) {
	return fullscreen ? 'player' : 'tierBar';
}
