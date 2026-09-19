<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	import { enhanceAuthForm } from '$lib/auth/enhance.js';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data, form } = $props();

	let submitting = $state(false);

	/** Set by the load when the link itself is unusable; by the action when a field is. */
	const message = $derived(form?.message ?? data.problem);

	/** An invite addressed to someone shows the address and does not let it be changed. */
	const pinnedEmail = $derived(data.email);

	const submit = enhanceAuthForm((pending) => (submitting = pending));
</script>

<svelte:head>
	<title>Create your account · YT Tierlist</title>
</svelte:head>

<AuthCard
	title="Create your account"
	description="You were invited to YT Tierlist. Pick a name and a password."
>
	{#if data.problem}
		<p class="text-destructive text-sm" role="alert">{data.problem}</p>
		<Button href={resolve('/login')} variant="outline" class="w-full">Go to sign in</Button>
	{:else}
		<form method="POST" use:enhance={submit} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">Email</Label>
				{#if pinnedEmail}
					<Input id="email" type="email" value={pinnedEmail} readonly autocomplete="username" />
					<p class="text-muted-foreground text-xs">This invite is for {pinnedEmail}.</p>
				{:else}
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="username"
						required
						value={form?.email ?? ''}
					/>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="displayName">Name</Label>
				<Input
					id="displayName"
					name="displayName"
					autocomplete="name"
					required
					value={form?.displayName ?? ''}
				/>
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength={10}
					required
				/>
				<p class="text-muted-foreground text-xs">At least 10 characters. No other rules.</p>
			</div>

			{#if message}
				<p class="text-destructive text-sm" role="alert">{message}</p>
			{/if}

			<Button type="submit" class="w-full" disabled={submitting}>
				{submitting ? 'Creating…' : 'Create account'}
			</Button>
		</form>
	{/if}
</AuthCard>
