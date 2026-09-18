/**
 * How the Rate page words a step of the session's undo stack.
 *
 * Kept next to the components that show it (the button tooltip and the toast
 * action) and away from `session`, which owns *what* can be undone, not how it
 * reads.
 */

/** @typedef {import('$lib/state/session.svelte.js').UndoEntry} UndoEntry */

/** Longest title a tooltip shows before it is cut short. */
const TITLE_LIMIT = 48;

/**
 * @param {string} title
 * @returns {string}
 */
function shorten(title) {
	const text = typeof title === 'string' ? title.trim() : '';
	if (text === '') return 'this video';
	return text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT - 1)}…` : text;
}

/**
 * What undoing would take back, as a sentence for a tooltip or a toast.
 *
 * @param {UndoEntry|null|undefined} entry - `session.lastUndo`.
 * @returns {string} A ready-to-show label, also for "there is nothing".
 */
export function describeUndo(entry) {
	if (!entry) return 'Nothing to undo';

	const outcome = entry.kind === 'unavailable' ? 'unavailable' : (entry.rating ?? 'no rating');
	return `Undo: ${shorten(entry.title)} → ${outcome}`;
}
