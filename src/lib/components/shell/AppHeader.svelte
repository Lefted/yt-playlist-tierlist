<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	import { enhanceAuthForm } from '$lib/auth/enhance.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import OfflineIndicator from '$lib/pwa/OfflineIndicator.svelte';
	import { auth } from '$lib/state/auth.svelte.js';
	import { navItemsFor } from './nav.js';

	const navItems = $derived(navItemsFor(page.url.pathname));

	/**
	 * Logging out is a form post to `/logout`, not a link: a GET that ends a session
	 * would be triggered by any prefetch or link scanner that touched it.
	 */
	const submitLogout = enhanceAuthForm();
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

			{#if auth.user}
				<!-- The name is a reminder of which account this browser is, so it can go
				     when the screen is narrow; Logout cannot. -->
				<span class="text-muted-foreground hidden text-sm sm:inline" data-testid="current-user">
					{auth.user.displayName}
				</span>

				<!--
					Not in `nav.js` with Browse and Rate, on purpose: that list is the
					app's top-level destinations, and everything in it is also a tab in the
					mobile bottom bar. `/admin` is neither — it is a tool a minority of
					accounts ever see, and putting it in the tab bar would give a
					two-destination app a third tab that most people cannot open.
				-->
				{#if auth.isAdmin}
					<Button href={resolve('/admin')} variant="ghost" size="sm">Admin</Button>
				{/if}

				<form method="POST" action={`${resolve('/logout')}`} use:enhance={submitLogout}>
					<Button type="submit" variant="ghost" size="sm">Logout</Button>
				</form>
			{/if}

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
