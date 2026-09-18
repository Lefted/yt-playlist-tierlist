<script>
	/**
	 * The six rating buttons — the one control the whole page exists for.
	 *
	 * Sized for thumbs: every button clears the 48 px touch target, and the row is
	 * the element the Rate page sticks to the bottom of the viewport on mobile.
	 *
	 * Sibling control: `components/TierPicker.svelte`, the compact inline version a
	 * Browse card carries. Both take their colours, labels, keys and order from
	 * `$lib/tiers.js` and share `TIER_BUTTON_BASE`.
	 */
	import { TIERS, TIER_BUTTON_BASE } from '$lib/tiers.js';
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
				TIER_BUTTON_BASE,
				'min-h-14 flex-col gap-0.5 rounded-lg text-xl leading-none sm:min-h-12',
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
