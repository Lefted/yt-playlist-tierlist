/**
 * The fullscreen overlay's hit-testing contract (issue #13).
 *
 * The overlay shares the screen with things we do not own — the browser's "exit full
 * screen" pill and YouTube's own buttons in the corner of the embed — and what broke
 * them was not the placement alone but the overlay being a hit target across the
 * whole width. Where exactly the box sits is a layout question a DOM-less render
 * cannot answer, and pinning the placement classes would only restate them; what it
 * covers, and that it stays hoverable while faded out, are structural, and that is
 * what this file holds down. `svelte/server` is enough: the markup is static.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PlayerOverlay from './PlayerOverlay.svelte';

/**
 * @param {{ visible?: boolean, title?: string }} [props] - Everything else is a stub.
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
 * The opening tags of the overlay's outermost elements — the boxes it puts between
 * the pointer and the video. Svelte's SSR markers (`<!--[-->`) are comments, not
 * elements, so they do not count.
 *
 * @param {string} markup
 * @returns {string[]}
 */
function outermostTags(markup) {
	/** @type {string[]} */
	const tags = [];
	let depth = 0;

	for (const [tag, closing, selfClosing] of markup.matchAll(/<(\/)?[a-z-]+\b[^>]*?(\/)?>/g)) {
		if (closing) depth -= 1;
		else if (depth === 0) tags.push(tag);

		if (!closing && !selfClosing) depth += 1;
	}

	return tags;
}

describe('PlayerOverlay', () => {
	it('takes the pointer only where its own controls are', () => {
		// Anything the overlay paints is either as big as its content or transparent to
		// the pointer — the full-width strip that swallowed clicks meant for the embed
		// was neither. Which corner it then sits in is left free on purpose.
		for (const tag of outermostTags(html({ title: 'A rather long video title, as they go' }))) {
			expect(tag.includes('w-fit') || tag.includes('pointer-events-none')).toBe(true);
		}
	});

	it('stays a hit target while faded out, so hovering it brings the controls back', () => {
		const markup = html({ visible: false });
		const [box] = outermostTags(markup);

		// Only the inner column goes inert: inert content is not hit-tested, and the
		// pointer-move handler that revives the controls lives on the box.
		expect(box).not.toContain('inert');
		expect(markup).toContain('inert=""');
	});

	it('offers a tier button per tier plus previous, skip, undo and exit', () => {
		const markup = html({ title: 'Some video' });

		for (const label of ['S tier', 'F tier', 'Previous', 'Skip', 'Undo', 'Leave fullscreen']) {
			expect(markup).toContain(`aria-label="${label}"`);
		}
		expect(markup).toContain('Some video');
	});
});
