/**
 * Display helpers of the rating session.
 */

/**
 * A duration as `m:ss`, or `h:mm:ss` from an hour up.
 *
 * @param {number|null|undefined} seconds - `Video.durationSeconds`; `null` while unknown.
 * @returns {string} `''` when there is no usable duration, so callers can render
 *   nothing instead of a misleading `0:00`.
 */
export function formatDuration(seconds) {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';

	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const rest = total % 60;

	const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
