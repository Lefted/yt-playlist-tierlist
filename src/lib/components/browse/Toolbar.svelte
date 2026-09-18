<script>
	/**
	 * Everything that narrows or reorders the video list. The page owns the values;
	 * this component only renders them and reports changes back.
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
	 * @property {import('$lib/types.js').Rating[]} tiers - Bindable; selected tiers.
	 * @property {boolean} unrated - Bindable; whether the "Unrated" bucket is selected.
	 * @property {string} search - Bindable.
	 * @property {boolean} hideUnavailable - Bindable.
	 * @property {import('./filters.js').SortKey} sort - Bindable.
	 * @property {() => void} onshuffle
	 * @property {() => void} onresetorder
	 */

	/** @type {Props} */
	let {
		tiers = $bindable([]),
		unrated = $bindable(false),
		search = $bindable(''),
		hideUnavailable = $bindable(true),
		sort = $bindable('playlist'),
		onshuffle,
		onresetorder
	} = $props();

	const sortLabel = $derived(
		SORT_OPTIONS.find((option) => option.value === sort)?.label ?? SORT_OPTIONS[0].label
	);

	/**
	 * The tier toggles and the "Unrated" toggle live in one group, so the value is
	 * a mixed list of tiers plus the `unrated` sentinel.
	 */
	const UNRATED = 'unrated';

	const buckets = $derived(unrated ? [...tiers, UNRATED] : [...tiers]);

	/**
	 * @param {string[] | undefined} next
	 * @returns {void}
	 */
	function setBuckets(next) {
		const values = next ?? [];
		unrated = values.includes(UNRATED);
		tiers = /** @type {import('$lib/types.js').Rating[]} */ (
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
				bind:value={search}
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

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon" title="Filter and order">
						<ListFilter class="size-4" />
						<span class="sr-only">Filter and order</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-56">
				<DropdownMenu.Label>Filter</DropdownMenu.Label>
				<DropdownMenu.CheckboxItem bind:checked={hideUnavailable}>
					Hide unavailable
				</DropdownMenu.CheckboxItem>
				<DropdownMenu.Separator />
				<DropdownMenu.Label>Playlist order</DropdownMenu.Label>
				<DropdownMenu.Item onSelect={onshuffle}>
					<Shuffle class="size-4" />
					Shuffle
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={onresetorder}>
					<RotateCcw class="size-4" />
					Reset order
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
