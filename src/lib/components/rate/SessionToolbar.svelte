<script>
	/**
	 * Everything about the session that is not a rating and not playback: which
	 * videos the queue covers, how the session behaves, the two destructive-ish
	 * one-offs (mark unavailable, shuffle) and the shortcut list.
	 */
	import Ban from '@lucide/svelte/icons/ban';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import Settings from '@lucide/svelte/icons/settings';
	import Shuffle from '@lucide/svelte/icons/shuffle';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { TIERS } from '$lib/tiers.js';
	import { session } from '$lib/state/session.svelte.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { cn } from '$lib/utils.js';
	import { shortcutKeys, shortcutTable } from './shortcuts.js';

	/**
	 * @typedef {Object} Props
	 * @property {() => void} onunavailable - Flag the current video as unplayable.
	 * @property {() => void} onshuffle
	 * @property {boolean} [helpOpen] - Bindable, so the `?` shortcut can open the list.
	 * @property {string} [class]
	 */

	/** @type {Props} */
	let { onunavailable, onshuffle, helpOpen = $bindable(false), class: className } = $props();

	const selectedTiers = $derived([...session.filter.tiers]);
	const filtered = $derived(selectedTiers.length > 0 || !session.includeUnrated);
	const shortcuts = $derived(shortcutTable(settings.shortcuts));
	/** The tier keys as the hint spells them, from the same table the bindings use. */
	const tierHint = $derived(shortcutKeys(true).rate.join(' ').toLowerCase());
	const groups = $derived([
		{ title: 'Rating', entries: shortcuts.rating },
		{ title: 'Player', entries: shortcuts.player }
	]);
</script>

<div class={cn('flex flex-wrap items-center gap-1.5', className)}>
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant={filtered ? 'secondary' : 'ghost'} size="sm">
					<ListFilter aria-hidden="true" />
					Filter
					{#if selectedTiers.length > 0}
						<span class="tabular-nums">({selectedTiers.join(' ')})</span>
					{/if}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72">
			<Popover.Header>
				<Popover.Title>Queue filter</Popover.Title>
				<Popover.Description>Which videos this session walks through.</Popover.Description>
			</Popover.Header>

			<ToggleGroup.Root
				type="multiple"
				variant="outline"
				spacing={1}
				class="w-full"
				value={selectedTiers}
				onValueChange={(/** @type {string[]} */ value) =>
					session.setFilter({ tiers: /** @type {any} */ (value) })}
			>
				{#each TIERS as tier (tier.rating)}
					<ToggleGroup.Item value={tier.rating} aria-label={tier.label} class="flex-1">
						{tier.rating}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>

			<label class="flex items-center justify-between gap-3 text-sm">
				<span>Include unrated videos</span>
				<Switch
					checked={session.includeUnrated}
					onCheckedChange={(/** @type {boolean} */ value) =>
						session.setFilter({ includeUnrated: value })}
				/>
			</label>

			<Button
				variant="ghost"
				size="sm"
				class="self-start"
				disabled={!filtered}
				onclick={() => session.clearFilter()}
			>
				Clear filter
			</Button>
		</Popover.Content>
	</Popover.Root>

	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm">
					<Settings aria-hidden="true" />
					Settings
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72">
			<Popover.Header>
				<Popover.Title>Session settings</Popover.Title>
			</Popover.Header>

			<label class="flex items-center justify-between gap-3 text-sm">
				<span>
					Skip rated videos
					<span class="text-muted-foreground block text-xs"
						>Leave videos you already rated out.</span
					>
				</span>
				<Switch bind:checked={settings.skipRated} />
			</label>

			<label class="flex items-center justify-between gap-3 text-sm">
				<span>
					Auto-advance
					<span class="text-muted-foreground block text-xs">Move on right after rating.</span>
				</span>
				<Switch bind:checked={settings.autoAdvance} />
			</label>

			<label class="flex items-center justify-between gap-3 text-sm">
				<span>
					Fullscreen on play
					<span class="text-muted-foreground block text-xs"
						>Ask for fullscreen when playback starts.</span
					>
				</span>
				<Switch bind:checked={settings.fullscreenOnPlay} />
			</label>

			<label class="flex items-center justify-between gap-3 text-sm">
				<span>
					Loop the video
					<span class="text-muted-foreground block text-xs"
						>Play it again at the end instead of moving on.</span
					>
				</span>
				<Switch bind:checked={settings.loop} />
			</label>

			<label class="flex items-center justify-between gap-3 text-sm">
				<span>
					Keyboard shortcuts
					<span class="text-muted-foreground block text-xs">
						Off: rate with the buttons only. On: <kbd class="font-mono">{tierHint}</kbd> rate the
						video — note that <kbd class="font-mono">f</kbd> rates instead of toggling fullscreen;
						use <kbd class="font-mono">Shift+F</kbd> for fullscreen.
					</span>
				</span>
				<Switch bind:checked={settings.shortcuts} />
			</label>
		</Popover.Content>
	</Popover.Root>

	<Button variant="ghost" size="sm" onclick={onunavailable}>
		<Ban aria-hidden="true" />
		Mark unavailable
	</Button>

	<Button variant="ghost" size="sm" onclick={onshuffle}>
		<Shuffle aria-hidden="true" />
		Shuffle
	</Button>

	<Popover.Root bind:open={helpOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts">
					<CircleQuestionMark aria-hidden="true" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72">
			<Popover.Header>
				<Popover.Title>Keyboard shortcuts</Popover.Title>
			</Popover.Header>
			{#if shortcuts.rating.length === 0}
				<p class="text-muted-foreground text-sm">
					The rating shortcuts are off — rate with the buttons, or switch them back on under
					<span class="text-foreground">Settings</span>. The player keys below and
					<kbd class="font-mono">?</kbd> for this list keep working.
				</p>
			{/if}

			{#each groups as group (group.title)}
				{#if group.entries.length > 0}
					<div class="grid gap-1.5">
						<p class="text-xs font-medium tracking-wide uppercase">{group.title}</p>
						<dl class="grid gap-1.5 text-sm">
							{#each group.entries as shortcut (shortcut.description)}
								<div class="flex items-center justify-between gap-3">
									<dt class="text-muted-foreground">{shortcut.description}</dt>
									<dd class="flex shrink-0 gap-1">
										{#each shortcut.keys as key (key)}
											<kbd
												class="bg-muted text-foreground rounded border px-1.5 py-0.5 font-mono text-xs"
												>{key}</kbd
											>
										{/each}
									</dd>
								</div>
							{/each}
						</dl>
					</div>
				{/if}
			{/each}
		</Popover.Content>
	</Popover.Root>
</div>
