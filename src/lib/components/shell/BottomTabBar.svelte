<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import { NAV_ITEMS, isActiveRoute } from './nav.js';

	const pathname = $derived(page.url.pathname);
</script>

<!--
	Mobile-only primary navigation. The layout reserves `pb-(--app-tab-bar-inset)`
	for it so that page content is never covered.
-->
<nav
	aria-label="Main"
	class="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
>
	<ul class="flex h-16 items-stretch">
		{#each NAV_ITEMS as { route, label, icon: Icon } (route)}
			{@const href = resolve(route)}
			{@const active = isActiveRoute(href, pathname)}
			<li class="flex-1">
				<a
					{href}
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
