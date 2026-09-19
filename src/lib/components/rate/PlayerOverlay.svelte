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
	 * for the video. It stays pointer-reactive even while faded out, so moving the
	 * mouse into it brings the controls back — the inner column is what goes `inert`,
	 * not this box. Movement over the video itself goes to the cross-origin iframe
	 * and never reaches us, which is a known limitation.
	 */
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
	 * @property {boolean} [visible] - Faded out after a while of nothing happening.
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
	 * @property {() => void} [onactivity] - The user is still there; keep the controls up.
	 */

	/** @type {Props} */
	let {
		rating,
		onrate,
		visible = true,
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
		onactivity
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
</script>

<!--
	The box is not a control itself; it only notices that the pointer is around. It is
	also the only thing this component paints, so a click anywhere else on the video
	reaches the player. Its backdrop is what keeps the buttons readable now that the
	page-wide gradient is gone.

	The `max-w` is the right-hand budget of the header comment: 15 rem minus the left
	margin leaves the embed's corner buttons a clear 14 rem. Below `sm` that would
	leave too little to lay the buttons out in at all, so down there the only reserve
	is the top offset, which already clears the embed's chrome. `w-fit` and the
	wrapping button row are what keep a phone in landscape working: the box is only as
	wide as its content, which folds into a second row rather than growing.
-->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute top-24 left-3 z-10 flex w-fit max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 rounded-xl bg-black/60 p-2 backdrop-blur transition-opacity duration-200 sm:max-w-[calc(100%-15rem)] sm:p-3"
	class:opacity-0={!visible}
	onpointermove={() => onactivity?.()}
>
	<div class="flex max-w-full flex-col items-start gap-2" inert={!visible} aria-hidden={!visible}>
		{#if title}
			<!--
				Capped, not `max-w-full`: inside a `w-fit` box a long title would set the
				width, and the box would be back to covering most of the picture.
			-->
			<p class="line-clamp-1 max-w-[20rem] text-sm font-medium text-white/90">
				{title}
			</p>
		{/if}

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
