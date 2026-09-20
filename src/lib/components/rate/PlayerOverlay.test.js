/**
 * The fullscreen overlay's hit-testing contract (issue #13) and its two states (#19).
 *
 * The overlay shares the screen with things we do not own — the browser's "exit full
 * screen" pill and YouTube's own buttons in the corner of the embed — and what broke
 * them was not the placement alone but the overlay being a hit target across the
 * whole width. Where exactly the box sits is a layout question a DOM-less render
 * cannot answer, and pinning the placement classes would only restate them; what it
 * covers is structural, and that is what this file holds down.
 *
 * Since #19 the overlay also collapses into its eye button, and the same applies:
 * whether the shrinking *looks* smooth is a browser question, but that it is a size
 * change rather than a fade, and that the hidden controls are out of reach while it
 * is collapsed, are both readable off the markup. "Out of reach" is asserted as
 * `inert` plus `aria-hidden` on the region that holds them — the attributes the
 * browser enforces it with; there is no DOM here to click them in.
 *
 * `svelte/server` is enough: the markup is static.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PlayerOverlay from './PlayerOverlay.svelte';

/** Everything the overlay offers apart from the eye toggle itself. */
const CONTROLS = ['S tier', 'F tier', 'Previous', 'Skip', 'Undo', 'Leave fullscreen'];

/**
 * @param {{ collapsed?: boolean, title?: string }} [props] - Everything else is a stub.
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
			ontoggle: () => {},
			...props
		}
	}).body;
}

/**
 * Walk the opening and closing tags of a rendered fragment.
 *
 * Svelte's SSR markers (`<!--[-->`) are comments, not elements, so they do not show
 * up here.
 *
 * @param {string} markup
 * @returns {Generator<{ tag: string, closing: boolean, start: number, end: number }>}
 */
function* tags(markup) {
	for (const match of markup.matchAll(/<(\/)?[a-z-]+\b[^>]*?(\/)?>/g)) {
		const [tag, closing, selfClosing] = match;
		const start = /** @type {number} */ (match.index);
		yield { tag, closing: Boolean(closing || selfClosing), start, end: start + tag.length };
	}
}

/**
 * The opening tags of the overlay's outermost elements — the boxes it puts between
 * the pointer and the video.
 *
 * @param {string} markup
 * @returns {string[]}
 */
function outermostTags(markup) {
	/** @type {string[]} */
	const found = [];
	let depth = 0;

	for (const { tag, closing } of tags(markup)) {
		if (tag.startsWith('</')) depth -= 1;
		else if (depth === 0) found.push(tag);

		if (!closing) depth += 1;
	}

	return found;
}

/**
 * The markup minus every `inert` subtree — what a pointer and the Tab key can still
 * get at.
 *
 * @param {string} markup
 * @returns {string}
 */
function reachable(markup) {
	let rest = '';
	let depth = 0;
	/** @type {number|null} */
	let hiddenFrom = null;
	let hiddenDepth = 0;
	let copiedTo = 0;

	for (const { tag, closing, start, end } of tags(markup)) {
		if (tag.startsWith('</')) {
			depth -= 1;
			if (hiddenFrom !== null && depth === hiddenDepth) {
				rest += markup.slice(copiedTo, hiddenFrom);
				copiedTo = end;
				hiddenFrom = null;
			}
			continue;
		}

		if (hiddenFrom === null && tag.includes('inert')) {
			hiddenFrom = start;
			hiddenDepth = depth;
		}
		if (!closing) depth += 1;
	}

	return rest + markup.slice(copiedTo);
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

	it('offers a tier button per tier plus previous, skip, undo, exit and the eye', () => {
		const markup = html({ title: 'Some video' });

		for (const label of [...CONTROLS, 'Hide controls']) {
			expect(markup).toContain(`aria-label="${label}"`);
		}
		expect(markup).toContain('Some video');
	});

	it('is open and reaches everything while it is not collapsed', () => {
		const markup = html({ title: 'Some video' });

		expect(markup).toContain('aria-expanded="true"');
		// Nothing is tucked away, so nothing is hidden from the keyboard either.
		expect(markup).not.toContain('inert');
		expect(reachable(markup)).toBe(markup);
	});

	it('puts the title and every control out of reach once collapsed', () => {
		const markup = html({ collapsed: true, title: 'Some video' });
		const open = reachable(markup);

		// The eye is all that is left — it is the way back, so it must stay reachable.
		expect(open).toContain('aria-label="Show controls"');
		expect(open).toContain('aria-expanded="false"');

		for (const label of CONTROLS) {
			expect(markup, label).toContain(`aria-label="${label}"`);
			expect(open, label).not.toContain(`aria-label="${label}"`);
		}
		expect(open).not.toContain('Some video');
	});

	it('hides the collapsed content from assistive technology as well as the pointer', () => {
		// `inert` alone takes the focus and the clicks; a screen reader still reads it.
		for (const tag of html({ collapsed: true, title: 'Some video' }).matchAll(
			/<[^>]*inert[^>]*>/g
		)) {
			expect(tag[0]).toContain('aria-hidden="true"');
		}
	});

	it('collapses by changing size, not by fading out', () => {
		// The point of #19: the box itself shrinks to the eye button, so the backdrop
		// goes with it. A `1fr → 0fr` grid track on both axes is how, and it is worth
		// pinning — an overlay that only faded would still be sitting on the video.
		const markup = html({ collapsed: true, title: 'Some video' });

		expect(markup).toContain('grid-template-rows: 0fr');
		expect(markup).toContain('grid-template-columns: 0fr');
		expect(html({ title: 'Some video' })).toContain('grid-template-rows: 1fr');

		// …and it holds still for anyone who asked for no motion.
		expect(markup).toContain('motion-reduce:transition-none');
	});
});
