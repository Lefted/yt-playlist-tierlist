<script>
	/**
	 * The one boxed message the Browse page uses for every outcome it reports —
	 * a failed import, a finished export, a restored backup.
	 */
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Info from '@lucide/svelte/icons/info';
	import { cn } from '$lib/utils.js';

	/**
	 * @typedef {Object} Props
	 * @property {'ok' | 'error'} [tone] - `error` is announced as an alert, `ok` as a status.
	 * @property {boolean} [icon]
	 * @property {string} [class]
	 * @property {import('svelte').Snippet} children
	 */

	/** @type {Props} */
	let { tone = 'ok', icon = true, class: className, children } = $props();

	const isError = $derived(tone === 'error');
</script>

<p
	class={cn(
		'flex items-start gap-2 rounded-lg border p-3 text-xs',
		isError
			? 'border-destructive/40 bg-destructive/10 text-destructive'
			: 'text-muted-foreground bg-muted/50',
		className
	)}
	role={isError ? 'alert' : 'status'}
>
	{#if icon}
		{#if isError}
			<TriangleAlert class="mt-px size-4 shrink-0" />
		{:else}
			<Info class="mt-px size-4 shrink-0" />
		{/if}
	{/if}
	<span class="min-w-0">{@render children()}</span>
</p>
