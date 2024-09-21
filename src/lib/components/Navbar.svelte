<script>
	import '../../app.css';
	import { toggleMode } from 'mode-watcher';
	import Sun from 'svelte-radix/Sun.svelte';
	import Moon from 'svelte-radix/Moon.svelte';
	import Menu from 'lucide-svelte/icons/menu';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { page } from '$app/stores';

	const navs = [
		{ href: '/browse', text: 'Browse' },
		{ href: '/rate', text: 'Rate' }
	];

	const url = $derived($page.url.href);
	const routeId = $derived($page.url.pathname);
</script>

{#snippet themeToggle()}
	<Button on:click={toggleMode} variant="outline" size="icon">
		<Sun
			class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
		/>
		<Moon
			class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
		/>
		<span class="sr-only">Toggle theme</span>
	</Button>
{/snippet}

<nav
	class="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6"
>
	{#each navs as { href, text }}
		{@const active = href === '/' ? routeId === '/' : url.includes(href)}
		<a
			{href}
			class="{active
				? 'text-foreground'
				: 'text-muted-foreground'} transition-colors hover:text-foreground"
		>
			{text}
		</a>
	{/each}
	{@render themeToggle()}
</nav>
<Sheet.Root>
	<Sheet.Trigger asChild let:builder>
		<Button variant="outline" size="icon" class="shrink-0 md:hidden" builders={[builder]}>
			<Menu class="h-5 w-5" />
			<span class="sr-only">Toggle navigation menu</span>
		</Button>
	</Sheet.Trigger>
	<Sheet.Content side="left">
		<nav class="grid gap-6 text-lg font-medium">
			{#each navs as { href, text }}
				{@const active = href === '/' ? routeId === '/' : url.includes(href)}
				<a
					{href}
					class="{active
						? 'text-foreground'
						: 'text-muted-foreground'} transition-colors hover:text-foreground"
				>
					{text}
				</a>
			{/each}

			{@render themeToggle()}
		</nav>
	</Sheet.Content>
</Sheet.Root>
