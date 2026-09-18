<script>
	/**
	 * A compact S…F rating control: one button per tier plus a clear button that
	 * only appears once something is rated.
	 *
	 * Stateless by design — it renders `value` and reports every change through
	 * `onchange`, so the caller decides what "rating" means (write to the library,
	 * advance a session, …).
	 *
	 * Sibling control: `components/rate/TierBar.svelte`, the thumb-sized version the
	 * Rate page sticks to the bottom of the viewport. Both take their colours,
	 * labels and order from `$lib/tiers.js` and share `TIER_BUTTON_BASE`.
	 */
	import { cn } from '$lib/utils.js';
	import { TIERS, TIER_BUTTON_BASE } from '$lib/tiers.js';
	import X from '@lucide/svelte/icons/x';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Rating | null | undefined} value - The current tier, `null` when unrated.
	 * @property {(rating: import('$lib/types.js').Rating | null) => void} [onchange] - Receives the new tier, or `null` when it was cleared.
	 * @property {'sm' | 'md' | 'lg'} [size]
	 * @property {string} [label] - Accessible name of the group.
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let { value, onchange, size = 'md', label = 'Rate this video', class: className } = $props();

	const sizeClasses = {
		sm: 'size-7 text-xs',
		md: 'size-8 text-sm',
		lg: 'size-10 text-base'
	};
</script>

<div role="group" aria-label={label} class={cn('flex flex-wrap items-center gap-1', className)}>
	{#each TIERS as tier (tier.rating)}
		{@const selected = value === tier.rating}
		<button
			type="button"
			aria-pressed={selected}
			title={tier.label}
			onclick={() => onchange?.(tier.rating)}
			class={cn(
				TIER_BUTTON_BASE,
				'shrink-0 rounded-md border',
				sizeClasses[size],
				selected
					? cn(tier.solid, 'border-transparent')
					: cn(tier.soft, 'opacity-80 hover:opacity-100')
			)}
		>
			{tier.rating}
			<span class="sr-only">{tier.label}</span>
		</button>
	{/each}

	<!--
		Clearing is its own button rather than a second tap on the active tier: on a
		touch screen that shortcut turns a mis-tap into silent data loss.
	-->
	{#if value}
		<button
			type="button"
			title="Clear rating"
			onclick={() => onchange?.(null)}
			class={cn(
				TIER_BUTTON_BASE,
				'text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-md border border-dashed',
				sizeClasses[size]
			)}
		>
			<X class="size-3.5" />
			<span class="sr-only">Clear rating</span>
		</button>
	{/if}
</div>
