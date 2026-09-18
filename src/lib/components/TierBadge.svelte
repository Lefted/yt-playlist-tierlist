<script>
	import { cn } from '$lib/utils.js';
	import { tierFor } from '$lib/tiers.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Rating | null | undefined} rating - null renders an "unrated" badge.
	 * @property {'sm' | 'md' | 'lg'} [size]
	 * @property {'solid' | 'soft'} [variant]
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let { rating, size = 'md', variant = 'solid', class: className } = $props();

	const tier = $derived(tierFor(rating));

	const sizeClasses = {
		sm: 'h-5 min-w-5 px-1 text-xs',
		md: 'h-6 min-w-6 px-1.5 text-sm',
		lg: 'h-8 min-w-8 px-2 text-base'
	};
</script>

<span
	class={cn(
		'inline-flex items-center justify-center rounded-md border leading-none font-bold tabular-nums select-none',
		sizeClasses[size],
		tier
			? variant === 'solid'
				? cn(tier.solid, 'border-transparent')
				: tier.soft
			: 'border-muted-foreground/40 text-muted-foreground border-dashed',
		className
	)}
	aria-label={tier ? tier.label : 'Unrated'}
	title={tier ? tier.label : 'Unrated'}
>
	{tier ? tier.rating : '–'}
</span>
