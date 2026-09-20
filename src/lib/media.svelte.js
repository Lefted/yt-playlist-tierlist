/**
 * "Who is driving this session?", as reactive state.
 *
 * A mouse and a finger want opposite things from the same page — a hover layer that
 * catches the movement a cross-origin iframe swallows, or a tap that toggles the
 * overlay — and both halves are decided by a media query rather than by a device
 * sniff, because the answer can change mid-session: a tablet gains a keyboard case,
 * and Chrome's device emulation flips it on every toggle. The queries live together
 * here so the two cannot drift into overlapping or into leaving a device out.
 */

/** A mouse or a trackpad: something that can hover a pixel. */
export const MOUSE_QUERY = '(hover: hover) and (pointer: fine)';

/** A touch screen: a tap is the only gesture there is. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * Track a media query for as long as the calling component lives.
 *
 * Call it during setup, like any rune: it owns an `$effect`, which is also what
 * keeps it off the server — until that effect runs, the answer is `false`, and a
 * layer or a rule that needs a mouse should not be there before we know there is
 * one.
 *
 * @param {string} query - A CSS media query; see {@link MOUSE_QUERY}.
 * @returns {{ current: boolean }} Reactive: read `.current` where it is needed.
 */
export function matchesMedia(query) {
	let matches = $state(false);

	$effect(() => {
		const list = window.matchMedia(query);
		const sync = () => {
			matches = list.matches;
		};

		sync();
		list.addEventListener('change', sync);
		return () => list.removeEventListener('change', sync);
	});

	return {
		get current() {
			return matches;
		}
	};
}
