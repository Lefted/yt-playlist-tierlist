<script>
	/**
	 * A transparent layer over the player that catches the first mouse movement
	 * after the overlay has faded out.
	 *
	 * Moving the mouse over the video is what brings YouTube's controls back, and our
	 * overlay should come with them — but the video is a cross-origin iframe and not
	 * one of its events reaches us. Covering it for the short while the overlay is
	 * hidden is the only way to hear that movement at all. The first one is spent on
	 * waking the overlay: the parent stops rendering this layer in the same update, so
	 * every movement and click after it goes to YouTube as usual.
	 *
	 * **Mouse setups only.** On a touch screen the layer would eat the tap that
	 * YouTube needs — and a tap barely moves a pointer, so it would not even wake the
	 * overlay in exchange. There, a tap on the video moves the focus into the iframe
	 * and the Rate page hears that as a `blur` instead — which is the same question
	 * asked from the other side, so both queries live in `$lib/media.svelte.js`. Hence
	 * the layer starts absent and appears only once a fine, hovering pointer has
	 * actually been seen.
	 *
	 * `pointerdown` wakes as well as `pointermove`, which the issue did not ask for: a
	 * mouse that has been resting on the video for three seconds can be clicked
	 * without being moved first, and without this that click — and every one after it
	 * — would be swallowed with nothing to show for it.
	 */

	import { matchesMedia, MOUSE_QUERY } from '$lib/media.svelte.js';

	/**
	 * @typedef {Object} Props
	 * @property {() => void} onwake - The user is there; show the overlay again.
	 */

	/** @type {Props} */
	let { onwake } = $props();

	/** Whether a mouse is driving this session; the Rate page asks the other half. */
	const mouse = matchesMedia(MOUSE_QUERY);
</script>

{#if mouse.current}
	<!--
		No `z-index`: the overlay's box is `z-10` and stays above this, so moving onto
		the box is heard by the box itself. Everything else on the surface is the
		iframe, which this covers by document order.

		Not focusable, not labelled, nothing to activate — it is not a control, it is a
		microphone for the one event the iframe swallows.
	-->
	<div
		class="absolute inset-0"
		aria-hidden="true"
		onpointermove={onwake}
		onpointerdown={onwake}
	></div>
{/if}
