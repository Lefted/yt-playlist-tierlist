/**
 * What the Rate page does when a video plays to its end.
 *
 * Three settings meet here — loop, auto-advance and whether the video already has
 * a tier — and the answer is easier to trust as a table than as nested `if`s in a
 * component.
 */

/**
 * @typedef {'restart'|'advance'|'await'|'stay'} EndedAction
 * - `restart`: play it again from the start (loop).
 * - `advance`: move to the next video.
 * - `await`: stay on it and ask for a tier — the session's whole point.
 * - `stay`: do nothing; the user turned auto-advance off.
 */

/**
 * @param {Object} state
 * @param {boolean} [state.loop] - `settings.loop`.
 * @param {boolean} [state.rated] - Whether the video that ended has a tier.
 * @param {boolean} [state.autoAdvance] - `settings.autoAdvance`.
 * @returns {EndedAction}
 */
export function endedAction({ loop = false, rated = false, autoAdvance = true } = {}) {
	// Loop wins over everything: the user asked for this video, again — rated or
	// not, and whether or not the session would otherwise move on.
	if (loop) return 'restart';
	if (!autoAdvance) return 'stay';
	return rated ? 'advance' : 'await';
}

/**
 * Should the tier bar light up as "this one ended without a verdict"?
 *
 * Independent of what happens to playback: a looping, unrated video still ended
 * once, and the highlight is what says so.
 *
 * @param {Object} state
 * @param {EndedAction} state.action
 * @param {boolean} [state.rated]
 * @returns {boolean}
 */
export function awaitsRating({ action, rated = false }) {
	if (rated) return false;
	return action === 'await' || action === 'restart';
}
