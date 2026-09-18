export { cn } from 'cn';

/**
 * `part` as a whole percent of `total`, clamped to 0–100.
 *
 * Total by design: progress bars and "x% rated" labels must not render `NaN` or
 * `Infinity` while a playlist is still empty.
 *
 * @param {number} part
 * @param {number} total
 * @returns {number} 0 when either side is not a finite number or the total is zero.
 */
export function percentOf(part, total) {
	if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}
