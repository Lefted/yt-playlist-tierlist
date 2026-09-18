/**
 * Display helpers for the Browse page: durations, dates, thumbnails and the two
 * URLs the page builds by hand.
 *
 * Every function is total — anything unusable becomes an empty string rather than
 * `NaN:NaN` or `Invalid Date` in the UI.
 */

/** @typedef {import('$lib/types.js').Video} Video */

/** Short month names, so the output does not depend on the runtime's ICU data. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A YouTube video id; playlist-item ids used as a fallback id are longer. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * @param {number} value
 * @returns {string}
 */
function pad(value) {
	return String(value).padStart(2, '0');
}

/**
 * A duration as `m:ss`, or `h:mm:ss` from an hour up.
 *
 * @param {number|null|undefined} seconds
 * @returns {string} `''` when the duration is unknown or not a finite, positive number.
 */
export function formatDuration(seconds) {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const rest = total % 60;
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * An ISO timestamp as `18 Sep 2026`, in the viewer's own timezone.
 *
 * @param {string|null|undefined} iso
 * @returns {string} `''` for a missing or unparsable timestamp.
 */
export function formatDate(iso) {
	if (typeof iso !== 'string' || iso === '') return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The thumbnail to show for a video. Imports carry one, but a legacy JSON import
 * or a stripped-down export may not — and for those `i.ytimg.com` can be derived
 * from the video id (and is precached by the service worker either way).
 *
 * @param {Video} video
 * @returns {string} `''` when there is nothing to show.
 */
export function thumbnailFor(video) {
	if (video?.thumbnail) return video.thumbnail;
	const id = video?.id ?? '';
	return VIDEO_ID.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
}

/**
 * @param {string} playlistId
 * @returns {string} The playlist on youtube.com, `''` for a local-only playlist
 *   (a legacy import has no YouTube id).
 */
export function playlistUrl(playlistId) {
	if (typeof playlistId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(playlistId)) return '';
	return `https://www.youtube.com/playlist?list=${playlistId}`;
}

/**
 * @param {string} videoId
 * @returns {string} The video on youtube.com, `''` for an id that is not one.
 */
export function videoUrl(videoId) {
	if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return '';
	return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * File name of a library export: `ytpt-export-2026-09-18.json`.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function exportFileName(date = new Date()) {
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return `ytpt-export-${stamp}.json`;
}

/**
 * `7 of 915 (1%)` style share, rounded to whole percent.
 *
 * @param {number} part
 * @param {number} total
 * @returns {number} 0–100; `0` when the total is zero or invalid.
 */
export function percentOf(part, total) {
	if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}
