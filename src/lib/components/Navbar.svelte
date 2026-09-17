<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import Menu from '@lucide/svelte/icons/menu';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';

	/** @type {{ route: import('$app/types').RouteId; text: string }[]} */
	const navs = [
		{ route: '/browse', text: 'Browse' },
		{ route: '/rate', text: 'Rate' }
	];

	const pathname = $derived(page.url.pathname);

	/**
	 * @param {import('$app/types').RouteId} route
	 * @returns {boolean} whether the nav entry points at the current route
	 */
	function isActive(route) {
		const href = resolve(route);
		return route === '/' ? pathname === href : pathname.startsWith(href);
	}
</script>

{#snippet navLinks()}
	{#each navs as { route, text } (route)}
		<a
			href={resolve(route)}
			class="{isActive(route)
				? 'text-foreground'
				: 'text-muted-foreground'} hover:text-foreground transition-colors"
		>
			{text}
		</a>
	{/each}
{/snippet}

{#snippet themeToggle()}
	<Button onclick={toggleMode} variant="outline" size="icon">
		<Sun
			class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
		/>
		<Moon
			class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
		/>
		<span class="sr-only">Toggle theme</span>
	</Button>
{/snippet}

<!-- max-w-[1536px] replaces Tailwind 3's `container max-w-screen-2xl`, which v4 no longer centers. -->
<nav class="hidden w-full md:mx-auto md:flex md:max-w-[1536px] md:px-0">
	<div
		class="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6"
	>
		{@render navLinks()}
	</div>
	<div class="hidden md:flex md:flex-1 md:items-center md:justify-end md:space-x-2">
		{@render themeToggle()}
	</div>
</nav>

<Sheet.Root>
	<Sheet.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon" class="shrink-0 md:hidden">
				<Menu class="h-5 w-5" />
				<span class="sr-only">Toggle navigation menu</span>
			</Button>
		{/snippet}
	</Sheet.Trigger>
	<Sheet.Content side="left">
		<nav class="grid gap-6 p-6 text-lg font-medium">
			{@render navLinks()}
			{@render themeToggle()}
		</nav>
	</Sheet.Content>
</Sheet.Root>
