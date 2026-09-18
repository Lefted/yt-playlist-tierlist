<script>
	/**
	 * Everything that narrows or reorders the video list. The page owns the filter;
	 * this component only renders it and writes changes back through the binding.
	 */
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import Search from '@lucide/svelte/icons/search';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import X from '@lucide/svelte/icons/x';

	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	import { TIERS } from '$lib/tiers.js';
	import { SORT_OPTIONS } from './filters.js';

	/**
	 * @typedef {Object} Props
	 * @property {import('./filters.js').BrowseFilter} filter - Bindable; the page's single filter object.
	 * @property {import('./filters.js').SortKey} sort - Bindable.
	 * @property {() => void} onshuffle
	 * @property {() => void} onresetorder
	 */

	/** @type {Props} */
	let { filter = $bindable(), sort = $bindable('playlist'), onshuffle, onresetorder } = $props();

	const sortLabel = $derived(
		SORT_OPTIONS.find((option) => option.value === sort)?.label ?? SORT_OPTIONS[0].label
	);

	/**
	 * The tier toggles and the "Unrated" toggle are one selection, so the toggle
	 * group's value is a mixed list of tiers plus this sentinel.
	 */
	const UNRATED = 'unrated';

	const buckets = $derived(filter.unrated ? [...filter.tiers, UNRATED] : [...filter.tiers]);

	/**
	 * @param {string[] | undefined} next
	 * @returns {void}
	 */
	function setBuckets(next) {
		const values = next ?? [];
		filter.unrated = values.includes(UNRATED);
		filter.tiers = /** @type {import('$lib/types.js').Rating[]} */ (
			values.filter((value) => value !== UNRATED)
		);
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<ToggleGroup.Root
			variant="outline"
			type="multiple"
			bind:value={() => buckets, setBuckets}
			class="max-w-full flex-wrap justify-start"
			aria-label="Filter by tier"
		>
			{#each TIERS as tier (tier.rating)}
				<ToggleGroup.Item
					value={tier.rating}
					aria-label={`Show ${tier.label}`}
					class="size-8 px-0 font-bold"
				>
					{tier.rating}
				</ToggleGroup.Item>
			{/each}
			<ToggleGroup.Item value={UNRATED} aria-label="Show unrated videos" class="h-8 px-2 text-xs">
				Unrated
			</ToggleGroup.Item>
		</ToggleGroup.Root>

		{#if buckets.length > 0}
			<Button variant="ghost" size="sm" onclick={() => setBuckets([])}>
				<X class="size-3.5" />
				Clear
			</Button>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<div class="relative min-w-0 flex-1 basis-48">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
			/>
			<Input
				type="search"
				placeholder="Search title or channel"
				aria-label="Search videos"
				bind:value={filter.search}
				class="pl-8"
			/>
		</div>

		<Select.Root type="single" bind:value={sort}>
			<Select.Trigger class="h-8" aria-label="Sort videos">{sortLabel}</Select.Trigger>
			<Select.Content>
				{#each SORT_OPTIONS as option (option.value)}
					<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Button variant="outline" size="icon" title="Shuffle the playlist order" onclick={onshuffle}>
			<Shuffle class="size-4" />
			<span class="sr-only">Shuffle the playlist order</span>
		</Button>
		<Button
			variant="outline"
			size="icon"
			title="Back to the original playlist order"
			onclick={onresetorder}
		>
			<RotateCcw class="size-4" />
			<span class="sr-only">Back to the original playlist order</span>
		</Button>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon" title="More filters">
						<ListFilter class="size-4" />
						<span class="sr-only">More filters</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-56">
				<DropdownMenu.Label>Filter</DropdownMenu.Label>
				<DropdownMenu.CheckboxItem bind:checked={filter.hideUnavailable}>
					Hide unavailable
				</DropdownMenu.CheckboxItem>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
