/**
 * The catch layer is the one part of the idle hide that can do real damage: it
 * covers the whole player, and on a touch screen it would swallow the taps the
 * embed needs to play, pause and seek.
 *
 * What a DOM-less render can hold down is that it starts out absent — the layer
 * appears only after `matchMedia` has confirmed a mouse, never before — so a device
 * that never matches never gets one. Whether the media query itself is the right
 * one, and whether the first movement really reaches it, needs a browser; see the
 * issue's notes on what a human has to check.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PointerWake from './PointerWake.svelte';

describe('PointerWake', () => {
	it('paints nothing until a mouse has been seen', () => {
		const { body } = render(PointerWake, { props: { onwake: () => {} } });

		expect(body).not.toContain('<div');
		expect(body.replace(/<!--.*?-->/g, '').trim()).toBe('');
	});
});
