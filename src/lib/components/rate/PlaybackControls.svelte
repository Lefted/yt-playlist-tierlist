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
	import Repeat from '@lucide/svelte/icons/repeat';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { cn } from '$lib/utils.js';
	import { DEFAULT_KEYBINDINGS, shortcutKeys } from './shortcuts.js';

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
	 * @property {boolean} [loop] - Whether the current video restarts when it ends.
	 * @property {() => void} onlooptoggle
	 * @property {boolean} [canUndo]
	 * @property {string} [undoLabel] - What undoing would take back, for the tooltip.
	 * @property {() => void} onundo
	 * @property {boolean} [shortcuts] - Whether the rating keys are on; with them off
	 *   the tooltips promise no key.
	 * @property {import('$lib/types.js').Keybindings} [keybindings] - `settings.keybindings`.
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let {
		playing = false,
		shortcuts = true,
		keybindings = DEFAULT_KEYBINDINGS,
		loop = false,
		canPrevious = true,
		canNext = true,
		canUndo = false,
		undoLabel = 'Undo',
		onprevious,
		onnext,
		onreplay,
		onplaypause,
		onfullscreen,
		onundo,
		onlooptoggle,
		class: className
	} = $props();

	/**
	 * @typedef {Object} Control
	 * @property {string} id - Stable across a label change (Play ↔ Pause).
	 * @property {string} label
	 * @property {string} [tooltip] - Defaults to the label; the undo button says what it would undo.
	 * @property {string[]} keys - Display labels, see `shortcutKeys`; empty while off.
	 * @property {any} icon - A `@lucide/svelte` icon component.
	 * @property {() => void} onclick
	 * @property {boolean} [disabled]
	 * @property {boolean} [pressed] - A toggle rather than a one-off; shows its state.
	 */

	const keys = $derived(shortcutKeys({ bindings: keybindings, ratingKeys: shortcuts }));

	/** @type {Control[]} */
	const controls = $derived([
		{
			id: 'previous',
			label: 'Previous',
			keys: keys.previous,
			icon: SkipBack,
			onclick: onprevious,
			disabled: !canPrevious
		},
		{
			id: 'replay',
			label: 'Replay',
			keys: keys.replay,
			icon: RotateCcw,
			onclick: onreplay
		},
		{
			id: 'play-pause',
			label: playing ? 'Pause' : 'Play',
			keys: keys.playPause,
			icon: playing ? Pause : Play,
			onclick: onplaypause
		},
		{
			id: 'fullscreen',
			label: 'Fullscreen',
			keys: keys.fullscreen,
			icon: Maximize,
			onclick: onfullscreen
		},
		{
			id: 'skip',
			label: 'Skip',
			keys: keys.next,
			icon: SkipForward,
			onclick: onnext,
			disabled: !canNext
		},
		{
			id: 'loop',
			label: 'Loop',
			tooltip: loop ? 'Loop: on' : 'Loop: off',
			keys: keys.loop,
			icon: Repeat,
			onclick: onlooptoggle,
			pressed: loop
		},
		{
			id: 'undo',
			label: 'Undo',
			tooltip: undoLabel,
			keys: keys.undo,
			icon: Undo2,
			onclick: onundo,
			disabled: !canUndo
		}
	]);
</script>

<Tooltip.Provider delayDuration={400}>
	<div class={cn('flex items-center justify-center gap-1', className)}>
		{#each controls as control (control.id)}
			{@const Icon = control.icon}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant={control.pressed ? 'secondary' : 'ghost'}
							size="icon-lg"
							class="size-11 sm:size-9"
							aria-label={control.label}
							aria-pressed={control.pressed}
							disabled={control.disabled}
							onclick={control.onclick}
						>
							<Icon aria-hidden="true" />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>
					{control.tooltip ?? control.label}
					{#each control.keys as key (key)}
						<kbd
							data-slot="kbd"
							class="bg-background/20 rounded px-1 py-0.5 font-mono text-[0.625rem]">{key}</kbd
						>
					{/each}
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
</Tooltip.Provider>
