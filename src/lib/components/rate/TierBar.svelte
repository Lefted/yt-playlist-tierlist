<script>
	/**
	 * The six rating buttons — the one control the whole page exists for.
	 *
	 * Sized for thumbs: every button clears the 48 px touch target, and the row is
	 * the element the Rate page sticks to the bottom of the viewport on mobile.
	 */
	import { TIERS } from '$lib/tiers.js';
	import { cn } from '$lib/utils.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Rating|null} rating - The current video's rating.
	 * @property {(rating: import('$lib/types.js').Rating) => void} onrate
	 * @property {boolean} [highlight] - Draw attention: the video ended and wants a rating.
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let { rating, onrate, highlight = false, class: className } = $props();

	/** @type {HTMLDivElement|undefined} */
	let group = $state();

	/**
	 * Hand the keyboard to the tier bar — the Rate page calls this when a video ends
	 * without a rating, so the next keystroke lands here instead of wherever the
	 * focus happened to be.
	 *
	 * @returns {void}
	 */
	export function focus() {
		group?.querySelector('button')?.focus();
	}
</script>

<div
	bind:this={group}
	role="group"
	aria-label="Rate this video"
	class={cn('grid grid-cols-6 gap-1.5 sm:gap-2', className)}
>
	{#each TIERS as tier (tier.rating)}
		<button
			type="button"
			aria-pressed={rating === tier.rating}
			aria-keyshortcuts={tier.key}
			aria-label={tier.label}
			title="{tier.label} ({tier.key.toUpperCase()})"
			onclick={() => onrate(tier.rating)}
			class={cn(
				'flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg',
				'text-xl leading-none font-bold transition select-none sm:min-h-12',
				'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
				tier.solid,
				rating === tier.rating && cn('ring-offset-background ring-2 ring-offset-2', tier.ring),
				highlight && 'animate-pulse'
			)}
		>
			{tier.rating}
			<kbd class="hidden text-[0.625rem] font-medium opacity-75 sm:block">{tier.key}</kbd>
		</button>
	{/each}
</div>
