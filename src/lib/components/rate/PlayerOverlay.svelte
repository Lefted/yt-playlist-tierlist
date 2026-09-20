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
	 * **It never fades away on its own** (issue #19). It used to disappear after a
	 * couple of idle seconds and come back on a pointer move, which on a phone left it
	 * unreachable for good: a tap barely moves the pointer, and a tap on the video goes
	 * to the cross-origin iframe and never reaches us. Whether the controls are up is
	 * therefore the user's decision, taken with the eye button and remembered in
	 * `settings.overlayCollapsed`. Collapsed, the box shrinks to exactly that button —
	 * still in the same corner, still inside the right-hand budget above.
	 */
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Minimize from '@lucide/svelte/icons/minimize';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	import { TIERS, TIER_BUTTON_BASE } from '$lib/tiers.js';
	import { cn } from '$lib/utils.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Rating|null} rating - The current video's rating.
	 * @property {(rating: import('$lib/types.js').Rating) => void} onrate
	 * @property {boolean} [collapsed] - Tucked away into the eye button.
	 * @property {boolean} [awaitingRating] - The video ended unrated.
	 * @property {boolean} [canPrevious]
	 * @property {boolean} [canNext]
	 * @property {boolean} [canUndo]
	 * @property {string} [undoLabel]
	 * @property {string} [title] - The video being rated.
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
		awaitingRating = false,
		canPrevious = true,
		canNext = true,
		canUndo = false,
		undoLabel = 'Undo',
		title = '',
		onprevious,
		onnext,
		onundo,
		onexit,
		ontoggle
	} = $props();

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

	/**
	 * The size animation, as the CSS grid `1fr → 0fr` trick.
	 *
	 * A single-track grid whose track is animated between `1fr` and `0fr`, with the
	 * item clipped inside it: the *box* really changes size, so the backdrop shrinks
	 * with the content instead of the content merely fading out inside a box that
	 * stays. Both axes, because the overlay has to lose its width as well as its
	 * height to end up as one button. `interpolate-size` would be shorter but is not
	 * everywhere yet, and a measured height would need a `ResizeObserver` for
	 * something the layout engine already knows.
	 *
	 * The gaps live *inside* the collapsing region (`pb-2`, `pl-1.5`) rather than on
	 * the flex parents: a gap next to a zero-sized track is still a gap, and it would
	 * leave the collapsed box a few pixels bigger than the button it is supposed to be.
	 */
	const REGION =
		'grid transition-[grid-template-rows,grid-template-columns] duration-200 ease-out ' +
		'motion-reduce:transition-none';

	/** The clipped grid item. `min-*-0` is what lets it shrink past its content. */
	const REGION_INNER =
		'min-h-0 min-w-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none';

	const Toggle = $derived(collapsed ? EyeOff : Eye);
	const toggleLabel = $derived(collapsed ? 'Show controls' : 'Hide controls');
</script>

<!--
	The box is the only thing this component paints, so a click anywhere else on the
	video reaches the player. Its backdrop is what keeps the buttons readable now that
	the page-wide gradient is gone.

	The `max-w` is the right-hand budget of the header comment: 15 rem minus the left
	margin leaves the embed's corner buttons a clear 14 rem. Below `sm` that would
	leave too little to lay the buttons out in at all, so down there the only reserve
	is the top offset, which already clears the embed's chrome. `w-fit` and the
	wrapping button row are what keep a phone in landscape working: the box is only as
	wide as its content, which folds into a second row rather than growing.
-->
<div
	class="absolute top-24 left-3 z-10 flex w-fit max-w-[calc(100%-1.5rem)] flex-col items-start rounded-xl bg-black/60 p-2 backdrop-blur sm:max-w-[calc(100%-15rem)] sm:p-3"
>
	{#if title}
		<div
			class={REGION}
			style:grid-template-rows={collapsed ? '0fr' : '1fr'}
			style:grid-template-columns={collapsed ? '0fr' : '1fr'}
		>
			<div
				class={cn(REGION_INNER, collapsed && 'opacity-0')}
				inert={collapsed}
				aria-hidden={collapsed}
			>
				<!--
					Capped, not `max-w-full`: inside a `w-fit` box a long title would set the
					width, and the box would be back to covering most of the picture.
				-->
				<p class="line-clamp-1 max-w-[20rem] pb-2 text-sm font-medium text-white/90">
					{title}
				</p>
			</div>
		</div>
	{/if}

	<!--
		The eye comes first in the row so that it does not move: the rest of the row
		grows out to its right and folds back into it, which is what makes the collapse
		read as the box shrinking *into* the button — and it keeps the tap target under
		the finger that just pressed it.
	-->
	<div class="flex max-w-full items-start">
		<button
			type="button"
			aria-expanded={!collapsed}
			aria-label={toggleLabel}
			title={toggleLabel}
			onclick={ontoggle}
			class={cn(
				TIER_BUTTON_BASE,
				// 44 px square at every width, unlike the buttons beside it: this is the
				// one control a phone has to be able to hit while everything else is away.
				'h-11 w-11 shrink-0 rounded-md bg-white/15 text-white hover:bg-white/25'
			)}
		>
			<Toggle
				class={cn('size-5 transition-opacity duration-200', collapsed && 'opacity-50')}
				aria-hidden="true"
			/>
		</button>

		<div
			class={REGION}
			style:grid-template-rows={collapsed ? '0fr' : '1fr'}
			style:grid-template-columns={collapsed ? '0fr' : '1fr'}
		>
			<div
				class={cn(REGION_INNER, collapsed && 'opacity-0')}
				inert={collapsed}
				aria-hidden={collapsed}
			>
				<div class="flex flex-col items-start gap-2 pl-1.5">
					<div class="flex flex-wrap items-center gap-1.5">
						{#each TIERS as tier (tier.rating)}
							<button
								type="button"
								aria-pressed={rating === tier.rating}
								aria-label={tier.label}
								title={tier.label}
								onclick={() => onrate(tier.rating)}
								class={cn(
									TIER_BUTTON_BASE,
									'h-10 w-11 rounded-md text-lg leading-none sm:h-11 sm:w-14',
									tier.solid,
									rating === tier.rating && cn('ring-2 ring-offset-2 ring-offset-black', tier.ring),
									awaitingRating && 'animate-pulse'
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
									'h-10 w-11 rounded-md bg-white/15 text-white hover:bg-white/25 sm:h-11 sm:w-12',
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
			</div>
		</div>
	</div>
</div>
