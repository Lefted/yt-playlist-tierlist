<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	import { Button } from '$lib/components/ui/button/index.js';
	import OfflineIndicator from '$lib/pwa/OfflineIndicator.svelte';
	import { navItemsFor } from './nav.js';

	const navItems = $derived(navItemsFor(page.url.pathname));
</script>

<header
	class="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 w-full border-b pt-[env(safe-area-inset-top)] backdrop-blur"
>
	<div class="mx-auto flex h-14 w-full max-w-[1536px] items-center gap-4 px-4 md:h-16 md:px-6">
		<a
			href={resolve('/browse')}
			class="flex items-center gap-2 font-semibold tracking-tight"
			aria-label="YT Tierlist — go to Browse"
		>
			<span
				class="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold"
				aria-hidden="true">S</span
			>
			<span class="text-base">YT Tierlist</span>
		</a>

		<!-- On mobile the same destinations live in the bottom tab bar. -->
		<nav class="hidden items-center gap-5 text-sm font-medium md:flex lg:gap-6" aria-label="Main">
			{#each navItems as { route, label, active } (route)}
				<a
					href={resolve(route)}
					aria-current={active ? 'page' : undefined}
					class="hover:text-foreground transition-colors {active
						? 'text-foreground'
						: 'text-muted-foreground'}"
				>
					{label}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-2">
			<OfflineIndicator />
			<Button onclick={toggleMode} variant="outline" size="icon" title="Toggle theme">
				<Sun class="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
				<Moon
					class="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
				/>
				<span class="sr-only">Toggle theme</span>
			</Button>
		</div>
	</div>
</header>
