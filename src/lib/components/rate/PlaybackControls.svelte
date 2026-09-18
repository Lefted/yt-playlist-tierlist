<script>
	/**
	 * Playback controls of the rating session: everything that moves the queue or
	 * the player without assigning a tier.
	 *
	 * Icon-only, because the row sits next to the tier bar at the bottom of small
	 * screens; each button carries its label and its keyboard shortcut in a tooltip.
	 */
	import Maximize from '@lucide/svelte/icons/maximize';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * @typedef {Object} Props
	 * @property {boolean} [playing] - Drives the play/pause icon.
	 * @property {boolean} [canPrevious]
	 * @property {boolean} [canNext]
	 * @property {() => void} onprevious
	 * @property {() => void} onnext
	 * @property {() => void} onreplay
	 * @property {() => void} onplaypause
	 * @property {() => void} onfullscreen
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let {
		playing = false,
		canPrevious = true,
		canNext = true,
		onprevious,
		onnext,
		onreplay,
		onplaypause,
		onfullscreen,
		class: className
	} = $props();
</script>

{#snippet control(
	/** @type {string} */ label,
	/** @type {string[]} */ keys,
	/** @type {any} */ Icon,
	/** @type {() => void} */ onclick,
	/** @type {boolean} */ disabled
)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-lg"
					class="size-11 sm:size-9"
					aria-label={label}
					aria-keyshortcuts={keys.join(' ')}
					{disabled}
					{onclick}
				>
					<Icon aria-hidden="true" />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			{label}
			{#each keys as key (key)}
				<kbd data-slot="kbd" class="bg-background/20 rounded px-1 py-0.5 font-mono text-[0.625rem]"
					>{key}</kbd
				>
			{/each}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={400}>
	<div class={cn('flex items-center justify-center gap-1', className)}>
		{@render control('Previous', ['P'], SkipBack, onprevious, !canPrevious)}
		{@render control('Replay', ['R'], RotateCcw, onreplay, false)}
		{@render control(
			playing ? 'Pause' : 'Play',
			['Space'],
			playing ? Pause : Play,
			onplaypause,
			false
		)}
		{@render control('Fullscreen', ['⇧', 'F'], Maximize, onfullscreen, false)}
		{@render control('Skip', ['N'], SkipForward, onnext, !canNext)}
	</div>
</Tooltip.Provider>
