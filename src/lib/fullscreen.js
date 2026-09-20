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
 * Has something *inside* this element taken fullscreen for itself?
 *
 * The one case that matters is the embed's iframe: a cross-origin document in
 * fullscreen owns the whole screen and the keyboard with it, so our overlay — the
 * only way to rate a video from there — is nowhere, and no key reaches us (issue
 * #9). The embed is built with `fs: 0` and `disablekb: 1` so that it has no way in
 * left, but "no way we know of" is not "no way", and the answer to this question is
 * a fullscreen to leave again rather than one to render into (issue #23).
 *
 * The element itself does not count: that is our own fullscreen, which
 * {@link isFullscreenElement} is about.
 *
 * @param {any} doc
 * @param {any} element
 * @returns {boolean}
 */
export function hasForeignFullscreen(doc, element) {
	const current = fullscreenElementOf(doc);
	if (!current || current === element) return false;
	return Boolean(element?.contains?.(current));
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
 * Ask the device to stay in landscape while our fullscreen is up.
 *
 * A phone that goes fullscreen in portrait shows a letterboxed strip with room
 * for neither the video nor the overlay, and the user's rotation lock is exactly
 * the setting that stops them fixing it by turning the phone. The Screen
 * Orientation API is the way to ask, and it is deliberately a *request*: Android
 * grants it while an element of ours is fullscreen, desktop browsers reject it
 * ("not available on this device") and iOS Safari has no `lock` at all. All three
 * answers are fine — hence the boolean rather than a throw, and hence no caller
 * has to know which kind of device it is on.
 *
 * Call it *after* the fullscreen request resolved: Android refuses a lock that
 * does not come with a fullscreen element.
 *
 * @param {any} screen - Usually `window.screen`.
 * @returns {Promise<boolean>} Whether the device is now held in landscape.
 */
export async function lockLandscape(screen) {
	const orientation = screen?.orientation;
	if (typeof orientation?.lock !== 'function') return false;

	try {
		await orientation.lock('landscape');
		return true;
	} catch {
		return false;
	}
}

/**
 * Give the rotation back to the device.
 *
 * Leaving fullscreen drops the lock by itself in the browsers that have one, but
 * only for the fullscreen element that held it; saying so explicitly costs one
 * guarded call and keeps a phone from staying sideways on a page with no video.
 *
 * @param {any} screen - Usually `window.screen`.
 * @returns {boolean} Whether there was a lock API to call.
 */
export function unlockOrientation(screen) {
	const orientation = screen?.orientation;
	if (typeof orientation?.unlock !== 'function') return false;

	try {
		orientation.unlock();
		return true;
	} catch {
		return false;
	}
}
