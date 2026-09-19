<script>
	/**
	 * The frame the two account forms share: a centred card on an otherwise empty
	 * page, because `/login` and `/invite/[token]` are the two routes the app shell
	 * is deliberately absent from (there is no navigation to offer someone who is
	 * not signed in yet).
	 *
	 * @type {{
	 *   title: string,
	 *   description?: string,
	 *   children: import('svelte').Snippet
	 * }}
	 */
	let { title, description, children } = $props();
</script>

<main class="flex flex-1 items-center justify-center p-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="flex items-center justify-center gap-2 font-semibold tracking-tight">
			<span
				class="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold"
				aria-hidden="true">S</span
			>
			<span class="text-base">YT Tierlist</span>
		</div>

		<div class="space-y-4 rounded-xl border p-6 shadow-sm">
			<div class="space-y-1.5">
				<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
				{#if description}
					<p class="text-muted-foreground text-sm">{description}</p>
				{/if}
			</div>

			{@render children()}
		</div>
	</div>
</main>
