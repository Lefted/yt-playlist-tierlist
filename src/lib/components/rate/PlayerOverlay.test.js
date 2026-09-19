/**
 * The fullscreen overlay's layout contract (issue #13).
 *
 * The overlay shares the screen with two things we do not own: the browser's "exit
 * full screen" pill at the top centre, and YouTube's own buttons in the top right of
 * the embed. Neither is reachable from a test, so what is pinned here is the
 * positioning that keeps out of their way — asserted on the rendered classes, since
 * that is as close to geometry as a DOM-less render gets. `svelte/server` is enough:
 * the overlay's placement is static markup, not behaviour.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PlayerOverlay from './PlayerOverlay.svelte';

/**
 * @param {Partial<Record<string, unknown>>} [props]
 * @returns {string} The overlay's server-rendered HTML.
 */
function html(props = {}) {
	return render(PlayerOverlay, {
		props: {
			rating: null,
			onrate: () => {},
			onprevious: () => {},
			onnext: () => {},
			onundo: () => {},
			onexit: () => {},
			...props
		}
	}).body;
}

/**
 * The opening tag of the overlay's outermost element — the only element of the
 * component that is a hit target.
 *
 * @param {string} markup
 * @returns {string}
 */
function rootTag(markup) {
	const match = markup.match(/<div[^>]*>/);
	if (!match) throw new Error('the overlay rendered no element');
	return match[0];
}

describe('PlayerOverlay', () => {
	it('is anchored top-left, clear of the browser pill and the embed corner', () => {
		const tag = rootTag(html());

		// 4 rem down and against the left margin: the pill owns the top centre.
		expect(tag).toContain('top-16');
		expect(tag).toContain('left-3');
		// Wherever there is width to spare, the embed's own buttons keep their corner.
		expect(tag).toContain('sm:max-w-[calc(100%-14rem)]');
	});

	it('is sized to its content, so it covers nothing it does not use', () => {
		const tag = rootTag(html());

		expect(tag).toContain('w-fit');
		// The full-width strip and its page-wide gradient are what made the video
		// unclickable; a rounded backdrop behind the group replaced them.
		expect(tag).not.toContain('inset-x-0');
		expect(tag).not.toContain('bg-gradient');
		expect(tag).toContain('bg-black/60');
	});

	it('lets the button row wrap instead of growing past its budget', () => {
		expect(html()).toContain('flex-wrap');
	});

	it('stays a hit target while faded out, so hovering it brings the controls back', () => {
		const markup = html({ visible: false });

		// Only the inner column goes inert: an inert box is not hit-tested, and the
		// pointer-move handler lives on the box.
		expect(rootTag(markup)).not.toContain('inert');
		expect(markup).toContain('inert=""');
		expect(rootTag(markup)).toContain('opacity-0');
	});

	it('offers a tier button per tier plus previous, skip, undo and exit', () => {
		const markup = html({ title: 'Some video' });

		for (const label of ['S tier', 'F tier', 'Previous', 'Skip', 'Undo', 'Leave fullscreen']) {
			expect(markup).toContain(`aria-label="${label}"`);
		}
		expect(markup).toContain('Some video');
	});
});
