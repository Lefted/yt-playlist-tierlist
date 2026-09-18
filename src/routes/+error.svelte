<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import { Button } from '$lib/components/ui/button/index.js';

	const isNotFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{page.status} · YT Tierlist</title>
</svelte:head>

<main class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
	<p class="text-primary text-6xl font-bold tracking-tight">{page.status}</p>

	<h1 class="text-xl font-semibold">
		{isNotFound ? 'This page does not exist' : 'Something went wrong'}
	</h1>

	<p class="text-muted-foreground max-w-sm text-sm">
		{#if isNotFound}
			The link may be outdated. Your library is still where you left it.
		{:else}
			{page.error?.message ?? 'An unexpected error occurred.'}
		{/if}
	</p>

	<Button href={resolve('/browse')}>Back to Browse</Button>
</main>
