<script>
	/**
	 * One video of the library: thumbnail, title, channel, its current tier and a
	 * compact picker to (re)rate it without leaving the list.
	 */
	import { resolve } from '$app/paths';
	import Play from '@lucide/svelte/icons/play';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import TierBadge from '$lib/components/TierBadge.svelte';
	import TierPicker from '$lib/components/TierPicker.svelte';
	import { formatDuration, thumbnailFor, videoUrl } from './format.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('$lib/types.js').Video} video
	 * @property {(rating: import('$lib/types.js').Rating | null) => void} onrate
	 */

	/** @type {Props} */
	let { video, onrate } = $props();

	const thumbnail = $derived(thumbnailFor(video));
	const duration = $derived(formatDuration(video.durationSeconds));
	const watchUrl = $derived(videoUrl(video.id));
	// The Rate page reads `?v=` to start the session at this video; `resolve` keeps
	// the link correct under a non-root base path.
	const rateHref = $derived(`${resolve('/rate')}?v=${encodeURIComponent(video.id)}`);
</script>

<article
	class="bg-card text-card-foreground flex flex-col overflow-hidden rounded-xl border shadow-sm"
	class:opacity-60={video.unavailable}
	data-video-id={video.id}
>
	<div class="bg-muted relative aspect-video w-full overflow-hidden">
		{#if thumbnail}
			<img
				src={thumbnail}
				alt=""
				loading="lazy"
				decoding="async"
				class="size-full object-cover"
				class:grayscale={video.unavailable}
			/>
		{/if}

		{#if video.rating}
			<div class="absolute top-2 left-2">
				<TierBadge rating={video.rating} size="md" />
			</div>
		{/if}

		{#if duration}
			<span
				class="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums"
			>
				{duration}
			</span>
		{/if}

		{#if video.unavailable}
			<div class="absolute bottom-2 left-2">
				<Badge variant="destructive">Unavailable</Badge>
			</div>
		{/if}
	</div>

	<div class="flex min-w-0 flex-1 flex-col gap-3 p-3">
		<div class="min-w-0">
			<h3 class="line-clamp-2 text-sm leading-snug font-medium break-words" title={video.title}>
				{video.title || 'Untitled video'}
			</h3>
			{#if video.channelTitle}
				<p class="text-muted-foreground mt-1 truncate text-xs">{video.channelTitle}</p>
			{/if}
		</div>

		<div class="mt-auto flex flex-wrap items-center justify-between gap-2">
			<TierPicker
				value={video.rating}
				size="sm"
				onchange={onrate}
				label={`Rate ${video.title || 'this video'}`}
			/>

			<div class="flex items-center gap-1">
				{#if watchUrl}
					<Button
						href={watchUrl}
						target="_blank"
						rel="noreferrer"
						variant="ghost"
						size="icon-sm"
						title="Open on YouTube"
					>
						<ExternalLink class="size-4" />
						<span class="sr-only">Open {video.title || 'this video'} on YouTube</span>
					</Button>
				{/if}
				{#if !video.unavailable}
					<Button href={rateHref} variant="outline" size="sm" class="h-7 gap-1 px-2 text-xs">
						<Play class="size-3.5" />
						Rate
					</Button>
				{/if}
			</div>
		</div>
	</div>
</article>
