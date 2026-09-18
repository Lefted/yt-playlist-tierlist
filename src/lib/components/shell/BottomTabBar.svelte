<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import { navItemsFor } from './nav.js';

	const navItems = $derived(navItemsFor(page.url.pathname));
</script>

<!--
	Mobile-only primary navigation. The layout reserves `pb-(--app-tab-bar-inset)`
	for it so that page content is never covered.
-->
<nav
	aria-label="Main"
	class="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
>
	<ul class="flex h-(--app-tab-bar-height) items-stretch">
		{#each navItems as { route, label, icon: Icon, active } (route)}
			<li class="flex-1">
				<a
					href={resolve(route)}
					aria-current={active ? 'page' : undefined}
					class="hover:text-foreground flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors {active
						? 'text-primary'
						: 'text-muted-foreground'}"
				>
					<Icon class="size-5" aria-hidden="true" />
					{label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
