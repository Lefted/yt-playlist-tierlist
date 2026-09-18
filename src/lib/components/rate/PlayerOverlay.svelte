<script>
	/**
	 * The rating controls while the player is fullscreen.
	 *
	 * It is rendered *inside* the element that goes fullscreen (see
	 * `components/Player.svelte`), because nothing outside that element is on screen
	 * — and the sticky tier bar of the Rate page is outside it.
	 *
	 * It sits at the top: YouTube's own control bar owns the bottom edge, and
	 * covering the seek bar would cost more than it gives. The strip stays
	 * pointer-reactive even while the controls are faded out, so moving the mouse
	 * into it brings them back; movement over the video itself goes to the
	 * cross-origin iframe and never reaches us.
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

<!-- The strip is not a control itself; it only notices that the pointer is around. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute inset-x-0 top-0 z-10 flex justify-center bg-gradient-to-b from-black/70 to-transparent p-2 transition-opacity duration-200 sm:p-3"
	class:opacity-0={!visible}
	onpointermove={() => onactivity?.()}
>
	<div class="flex max-w-full flex-col items-center gap-2" inert={!visible} aria-hidden={!visible}>
		{#if title}
			<p class="line-clamp-1 max-w-[80vw] text-center text-sm font-medium text-white/90">
				{title}
			</p>
		{/if}

		<div class="flex flex-wrap items-center justify-center gap-1.5">
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
