<script>
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	import { enhanceAuthForm } from '$lib/auth/enhance.js';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { form } = $props();

	let submitting = $state(false);

	/** Where the visitor was headed before the gate sent them here. */
	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '');

	const submit = enhanceAuthForm((pending) => (submitting = pending));
</script>

<svelte:head>
	<title>Sign in · YT Tierlist</title>
</svelte:head>

<AuthCard title="Sign in" description="This app is invite-only.">
	<form method="POST" use:enhance={submit} class="space-y-4">
		<input type="hidden" name="redirectTo" value={redirectTo} />

		<div class="space-y-2">
			<Label for="email">Email</Label>
			<Input
				id="email"
				name="email"
				type="email"
				autocomplete="username"
				required
				value={form?.email ?? ''}
			/>
		</div>

		<div class="space-y-2">
			<Label for="password">Password</Label>
			<Input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>
		</div>

		{#if form?.message}
			<p class="text-destructive text-sm" role="alert">{form.message}</p>
		{/if}

		<Button type="submit" class="w-full" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</Button>
	</form>

	<p class="text-muted-foreground text-xs">
		Forgotten your password? There is no reset by email — ask the admin to set a new one.
	</p>
</AuthCard>
