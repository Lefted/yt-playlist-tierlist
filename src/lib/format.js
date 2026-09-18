/**
 * Turning domain values into the strings the UI shows.
 *
 * Every function is total — anything unusable becomes an empty string rather than
 * `NaN:NaN` or `Invalid Date` on screen.
 */

/** Short month names, so the output does not depend on the runtime's ICU data. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
 * @returns {string} `''` when the duration is unknown or not a finite, non-negative number.
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
 * File name of a library export: `ytpt-export-2026-09-18.json`.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function exportFileName(date = new Date()) {
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return `ytpt-export-${stamp}.json`;
}
