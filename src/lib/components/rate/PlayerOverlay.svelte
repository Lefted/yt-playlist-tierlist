<script>
	/**
	 * The rating controls while the player is fullscreen.
	 *
	 * It is rendered *inside* the element that goes fullscreen (see
	 * `components/Player.svelte`), because nothing outside that element is on screen
	 * — and the sticky tier bar of the Rate page is outside it.
	 *
	 * It stays in the top *left*, and it is exactly as big as its controls — there is
	 * no full-width strip and no page-wide gradient, because everything the overlay
	 * covers is a part of the video the mouse can no longer reach (issue #13):
	 *
	 * - the bottom edge belongs to YouTube's own control bar, so the overlay is up top;
	 * - the top centre belongs to the browser: Chrome parks its "Press Esc to exit
	 *   full screen" pill there — it sits a little way down and it used to land on the
	 *   D/F buttons. Hence both the anchor on the left and the 6 rem offset from the
	 *   top, which clears the whole pill and not just the issue's estimate of it;
	 * - the top right belongs to the embed (volume, captions, settings), so the group
	 *   keeps 14 rem clear of the right edge wherever there is width to spare.
	 *
	 * The group is the only hit target: it has no container to swallow clicks meant
	 * for the video.
	 *
	 * Two different things take it off the screen, and neither replaces the other:
	 *
	 * - **`collapsed`** is the user's standing choice (issue #19), taken with the eye
	 *   button and remembered in `settings.overlayCollapsed`. Collapsed, the box shrinks
	 *   to exactly that button — same corner, same backdrop, so the eye *is* the overlay
	 *   until it is pressed again.
	 * - **`visible`** is the last few seconds (issue #20): the overlay fades out when
	 *   nothing happens, about when YouTube's own controls do, and comes back with them.
	 *   Faded out it is `opacity-0` and everything inside is `inert`, but the box still
	 *   hears the pointer — moving onto it, or tapping it, is one of the ways back. The
	 *   *page* is what decides: most of the signals that count as a sign of life arrive
	 *   nowhere near this component (`overlay-visibility.js`).
	 *
	 * Collapsed *and* faded, the eye is what fades out; waking brings back the eye, not
	 * the controls.
	 */
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Minimize from '@lucide/svelte/icons/minimize';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	import { DEFAULT_KEYBINDINGS, ariaKeyshortcuts, chordLabel, chordsOf } from '$lib/keybindings.js';
	import { TIERS, TIER_BUTTON_BASE } from '$lib/tiers.js';
	import { cn } from '$lib/utils.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Rating|null} rating - The current video's rating.
	 * @property {(rating: import('$lib/types.js').Rating) => void} onrate
	 * @property {boolean} [collapsed] - Tucked away into the eye button.
	 * @property {boolean} [visible] - Faded out after a while of nothing happening; the
	 *   box still reports the pointer, which is one of the ways back.
	 * @property {() => void} [onactivity] - The pointer is on the box: somebody is
	 *   there, keep the controls up.
	 * @property {() => void} [onpointerin] - The pointer arrived on the box — it must
	 *   not fade under the hand that is reaching for it.
	 * @property {() => void} [onpointerout] - …and left again.
	 * @property {boolean} [awaitingRating] - The video ended unrated.
	 * @property {boolean} [canPrevious]
	 * @property {boolean} [canNext]
	 * @property {boolean} [canUndo]
	 * @property {string} [undoLabel]
	 * @property {string} [title] - The video being rated.
	 * @property {import('$lib/types.js').Keybindings} [keybindings] - `settings.keybindings`,
	 *   for the eye's key hint. The overlay matches no keys itself — the Rate page owns
	 *   the keyboard — it only has to say which one does what it does.
	 * @property {boolean} [shortcuts] - Whether the rating keys are on; with them off
	 *   the hint goes, because there is nothing to press.
	 * @property {() => void} onprevious
	 * @property {() => void} onnext
	 * @property {() => void} onundo
	 * @property {() => void} onexit - Leave fullscreen.
	 * @property {() => void} ontoggle - Collapse the overlay, or bring it back.
	 */

	/** @type {Props} */
	let {
		rating,
		onrate,
		collapsed = false,
		visible = true,
		awaitingRating = false,
		canPrevious = true,
		canNext = true,
		canUndo = false,
		undoLabel = 'Undo',
		title = '',
		keybindings = DEFAULT_KEYBINDINGS,
		shortcuts = true,
		onprevious,
		onnext,
		onundo,
		onexit,
		ontoggle,
		onactivity,
		onpointerin,
		onpointerout
	} = $props();

	/**
	 * Out of reach, whichever of the two took it away: collapsed into the eye, or
	 * faded out. `inert` is what the browser enforces it with — no clicks, no `Tab`,
	 * and `aria-hidden` beside it for the screen reader.
	 */
	const folded = $derived(collapsed || !visible);

	/** @type {{ id: string, label: string, icon: any, onclick: () => void, disabled?: boolean }[]} */
	const buttons = $derived([
		{
			id: 'previous',
			label: 'Previous',
			icon: SkipBack,
			onclick: onprevious,
			disabled: !canPrevious
		},
		{ id: 'skip', label: 'Skip', icon: SkipForward, onclick: onnext, disabled: !canNext },
		{ id: 'undo', label: undoLabel, icon: Undo2, onclick: onundo, disabled: !canUndo },
		{ id: 'exit', label: 'Leave fullscreen', icon: Minimize, onclick: onexit }
	]);

	/** The look every icon button here shares; the sizes differ, the surface does not. */
	const ICON_BUTTON = 'bg-white/15 text-white hover:bg-white/25';

	const uid = $props.id();
	const titleRegion = `${uid}-title`;
	const controlsRegion = `${uid}-controls`;

	// A tier can carry several keys but the tooltip has room for one, as on the tier
	// bar: the first is the hint and the help list has the rest.
	const toggleChords = $derived(shortcuts ? chordsOf(keybindings, 'toggleOverlay') : []);
	const toggleKey = $derived(toggleChords[0] ? chordLabel(toggleChords[0]) : '');
	const toggleLabel = $derived(collapsed ? 'Show controls' : 'Hide controls');
	const Toggle = $derived(collapsed ? EyeOff : Eye);
</script>

<!--
	The size animation, as the CSS grid `1fr → 0fr` trick.

	A single-track grid whose track is animated between `1fr` and `0fr`, with the item
	clipped inside it: the *box* really changes size, so the backdrop shrinks with the
	content instead of the content merely fading out inside a box that stays. Both
	axes, because the overlay has to lose its width as well as its height to end up as
	one button. `interpolate-size` would be shorter but is not everywhere yet, and a
	measured height would need a `ResizeObserver` for something the layout engine
	already knows.

	`min-*-0` plus `overflow-hidden` is what lets the item shrink past its content —
	and the clipping is why the content carries a little padding of its own: a
	selected tier's `ring-offset-2` reaches 4 px beyond the button, and the edge of
	the region would otherwise cut it off.
-->
{#snippet region(id, content)}
	<div
		{id}
		class="grid transition-[grid-template-rows,grid-template-columns] duration-200 ease-out motion-reduce:transition-none"
		style:grid-template-rows={collapsed ? '0fr' : '1fr'}
		style:grid-template-columns={collapsed ? '0fr' : '1fr'}
	>
		<div
			class={cn(
				'min-h-0 min-w-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none',
				collapsed && 'opacity-0'
			)}
			inert={folded}
			aria-hidden={folded}
		>
			{@render content()}
		</div>
	</div>
{/snippet}

{#snippet videoTitle()}
	<!--
		Capped, not `max-w-full`: inside a `w-fit` box a long title would set the
		width, and the box would be back to covering most of the picture.

		On a phone in landscape it goes out of the flow altogether (`sr-only`, so a
		screen reader still has it): the 28 px it costs is what would push the wrapped
		button rows onto YouTube's progress bar, and of everything in this box the title
		is what a user who just picked the video needs least.
	-->
	<p class="tight:sr-only line-clamp-1 max-w-[20rem] pb-2 text-sm font-medium text-white/90">
		{title}
	</p>
{/snippet}

{#snippet controls()}
	<!--
		The gaps live *inside* the collapsing region (`pb-2` above, `pl-2.5` here)
		rather than on the flex parents: a gap next to a zero-sized track is still a
		gap, and it would leave the collapsed box bigger than the button it is meant to
		be. Of that `pl-2.5`, 6 px is the gap to the eye and 4 px is the ring room.
	-->
	<div class="flex flex-col items-start gap-2 p-1 pl-2.5">
		<!--
			The cap is what folds the row into the left third of a phone in landscape,
			where the middle belongs to YouTube's own play cluster: 8 rem takes three 36 px
			buttons and no more, and with the eye, the gap and the box's padding beside it
			that puts the right edge at 210 px — just inside the third of a 640 px screen,
			and well inside it at 780. The box is `w-fit`, so capping the row is what sizes
			the box; the `max-w` above is left to say one thing only, which is where the
			embed's own corner buttons start.
		-->
		<div class="tight:max-w-[8rem] flex flex-wrap items-center gap-1.5">
			{#each TIERS as tier (tier.rating)}
				<button
					type="button"
					aria-pressed={rating === tier.rating}
					aria-label={tier.label}
					title={tier.label}
					onclick={() => onrate(tier.rating)}
					class={cn(
						TIER_BUTTON_BASE,
						'h-10 w-11 rounded-md text-lg leading-none',
						// Bigger only where there is room in *both* directions, smaller on a phone
						// in landscape — where six of these plus four more have to fold into a
						// third of the width without reaching the bottom bar.
						'roomy:h-11 roomy:w-14 tight:h-9 tight:w-9 tight:text-base',
						tier.solid,
						rating === tier.rating && cn('ring-2 ring-offset-2 ring-offset-black', tier.ring),
						awaitingRating && 'animate-pulse motion-reduce:animate-none'
					)}
				>
					{tier.rating}
				</button>
			{/each}

			<span class="mx-1 h-8 w-px bg-white/25" aria-hidden="true"></span>

			{#each buttons as button (button.id)}
				{@const Icon = button.icon}
				<button
					type="button"
					aria-label={button.label}
					title={button.label}
					disabled={button.disabled}
					onclick={button.onclick}
					class={cn(
						TIER_BUTTON_BASE,
						ICON_BUTTON,
						'h-10 w-11 rounded-md',
						'roomy:h-11 roomy:w-12 tight:h-9 tight:w-9',
						'disabled:pointer-events-none disabled:opacity-40'
					)}
				>
					<Icon class="size-5" aria-hidden="true" />
				</button>
			{/each}
		</div>

		{#if awaitingRating}
			<p class="text-xs text-white/80" role="status">Finished — pick a tier.</p>
		{/if}
	</div>
{/snippet}

<!--
	The box is not a control itself — it only notices that the pointer is around, hence
	the `svelte-ignore` below. It is also the only thing this component paints, so a
	click anywhere else on the video reaches the player. Its backdrop is what keeps the
	buttons readable now that the page-wide gradient is gone.

	The `max-w` is the right-hand budget of the header comment: 15 rem minus the left
	margin leaves the embed's corner buttons a clear 14 rem. Below `sm` that would
	leave too little to lay the buttons out in at all, so down there the only reserve
	is the top offset, which already clears the embed's chrome. `w-fit` and the
	wrapping button row are what keep a phone in landscape working: the box is only as
	wide as its content, which folds into more rows rather than growing — and how wide
	that content may get is the row's own cap, further down.

	Its padding goes with the content: collapsed, the box has to be the 44 px button
	and nothing more, so the padding animates away alongside the two regions.

	Faded out it is only `opacity-0`: the box is still there and still hears the
	pointer, which is how a mouse arriving on it — or a finger tapping where it was —
	brings it back. Its content is `inert` meanwhile, so nothing invisible can be
	clicked or tabbed to. `pointerdown` as well as `pointermove`, because a tap moves
	a pointer by almost nothing.
-->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={cn(
		'absolute top-24 left-3 z-10 flex w-fit flex-col items-start',
		'max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-15rem)]',
		'rounded-xl bg-black/60 backdrop-blur',
		'transition-[padding,opacity] duration-200 ease-out motion-reduce:transition-none',
		collapsed ? 'p-0' : 'roomy:p-3 p-2',
		!visible && 'opacity-0'
	)}
	onpointermove={onactivity}
	onpointerdown={onactivity}
	onpointerenter={onpointerin}
	onpointerleave={onpointerout}
>
	{#if title}
		{@render region(titleRegion, videoTitle)}
	{/if}

	<!--
		The eye comes first in the row so that it does not move: the rest of the row
		grows out to its right and folds back into it, which is what makes the collapse
		read as the box shrinking *into* the button — and it keeps the tap target under
		the finger that just pressed it.
	-->
	<div class="flex max-w-full items-center">
		<button
			type="button"
			aria-expanded={!collapsed}
			aria-controls={title ? `${titleRegion} ${controlsRegion}` : controlsRegion}
			aria-keyshortcuts={ariaKeyshortcuts(toggleChords)}
			aria-label={toggleLabel}
			title={toggleKey ? `${toggleLabel} (${toggleKey})` : toggleLabel}
			onclick={ontoggle}
			inert={!visible}
			aria-hidden={!visible}
			class={cn(
				TIER_BUTTON_BASE,
				ICON_BUTTON,
				// 44 px square at every width, unlike the buttons beside it: this is the
				// one control a phone has to be able to hit while everything else is away.
				'h-11 w-11 shrink-0',
				// Collapsed the button *is* the box, so it takes the box's own corners.
				collapsed ? 'rounded-xl' : 'rounded-md',
				// The video ended unrated and the tier buttons that would say so are folded
				// away; the eye is all that is left to draw the eye.
				awaitingRating && collapsed && 'animate-pulse motion-reduce:animate-none'
			)}
		>
			<Toggle
				class={cn(
					'size-5 transition-opacity duration-200 motion-reduce:transition-none',
					collapsed && 'opacity-50'
				)}
				aria-hidden="true"
			/>
		</button>

		{@render region(controlsRegion, controls)}
	</div>

	{#if awaitingRating && collapsed}
		<!--
			The visible "Finished" note is inside the collapsed region, where a screen
			reader will not follow. This is the same message where the live region can
			still reach it, and it costs no layout: `sr-only` takes the text out of flow,
			so the collapsed box stays the size of the button.
		-->
		<p class="sr-only" role="status">Finished — pick a tier.</p>
	{/if}
</div>
