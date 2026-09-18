<script>
	/**
	 * A compact S…F rating control: one button per tier plus a clear button that
	 * only appears once something is rated.
	 *
	 * Stateless by design — it renders `value` and reports every change through
	 * `onchange`, so the caller decides what "rating" means (write to the library,
	 * advance a session, …).
	 */
	import { cn } from '$lib/utils.js';
	import { TIERS } from '$lib/tiers.js';
	import X from '@lucide/svelte/icons/x';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Rating | null | undefined} value - The current tier, `null` when unrated.
	 * @property {(rating: import('$lib/types.js').Rating | null) => void} [onchange] - Receives the new tier, or `null` when it was cleared.
	 * @property {'sm' | 'md' | 'lg'} [size]
	 * @property {string} [label] - Accessible name of the group.
	 * @property {boolean} [disabled]
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let {
		value,
		onchange,
		size = 'md',
		label = 'Rate this video',
		disabled,
		class: className
	} = $props();

	const sizeClasses = {
		sm: 'size-7 text-xs',
		md: 'size-8 text-sm',
		lg: 'size-10 text-base'
	};

	/**
	 * Clicking the active tier again clears the rating, which is the fastest way to
	 * undo a mis-click without hunting for the clear button.
	 *
	 * @param {import('$lib/types.js').Rating} rating
	 * @returns {void}
	 */
	function pick(rating) {
		onchange?.(value === rating ? null : rating);
	}
</script>

<div role="group" aria-label={label} class={cn('flex flex-wrap items-center gap-1', className)}>
	{#each TIERS as tier (tier.rating)}
		{@const selected = value === tier.rating}
		<button
			type="button"
			{disabled}
			aria-pressed={selected}
			title={tier.label}
			onclick={() => pick(tier.rating)}
			class={cn(
				'inline-flex shrink-0 items-center justify-center rounded-md border font-bold transition-colors',
				'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
				'disabled:pointer-events-none disabled:opacity-50',
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

	{#if value}
		<button
			type="button"
			{disabled}
			title="Clear rating"
			onclick={() => onchange?.(null)}
			class={cn(
				'text-muted-foreground hover:text-foreground hover:bg-muted inline-flex shrink-0 items-center justify-center rounded-md border border-dashed transition-colors',
				'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
				'disabled:pointer-events-none disabled:opacity-50',
				sizeClasses[size]
			)}
		>
			<X class="size-3.5" />
			<span class="sr-only">Clear rating</span>
		</button>
	{/if}
</div>
