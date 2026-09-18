<script>
	/**
	 * What is on screen right now: title, channel, duration, the position in the
	 * queue and the rating the video already carries.
	 */
	import TierBadge from '$lib/components/TierBadge.svelte';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { formatDuration } from './format.js';
	import { cn } from '$lib/utils.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Video} video
	 * @property {number} position - One-based position in the queue.
	 * @property {number} total - Length of the queue.
	 * @property {import('$lib/state/session.svelte.js').Progress} progress - Rated / total of the session's scope.
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let { video, position, total, progress, class: className } = $props();

	const duration = $derived(formatDuration(video.durationSeconds));
	const percent = $derived(progress.total === 0 ? 0 : (progress.done / progress.total) * 100);
</script>

<div class={cn('flex flex-col gap-2', className)}>
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="text-base leading-snug font-semibold text-balance sm:text-lg">{video.title}</h1>
			<p class="text-muted-foreground mt-0.5 truncate text-sm">
				{video.channelTitle || 'Unknown channel'}
				{#if duration}
					<span aria-hidden="true">·</span>
					<span class="tabular-nums">{duration}</span>
				{/if}
			</p>
		</div>
		<TierBadge rating={video.rating} size="lg" />
	</div>

	<div class="text-muted-foreground flex items-center gap-3 text-xs">
		<span class="tabular-nums">{position} / {total} in queue</span>
		<Progress value={percent} class="h-1.5 flex-1" />
		<span class="tabular-nums">{progress.done} / {progress.total} rated</span>
	</div>
</div>
