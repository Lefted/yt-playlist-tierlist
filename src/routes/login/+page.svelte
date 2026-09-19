<script>
	import { applyAction, enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { form } = $props();

	let submitting = $state(false);

	/** Where the visitor was headed before the gate sent them here. */
	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '');

	/**
	 * The action answers with a redirect on success. SvelteKit's default handler
	 * would follow it without re-running the root layout load, and the header would
	 * still believe nobody is signed in — `invalidateAll` is what re-asks
	 * `/api/v1/me`.
	 *
	 * @type {import('$app/forms').SubmitFunction}
	 */
	const submit = () => {
		submitting = true;
		return async ({ result }) => {
			submitting = false;
			if (result.type === 'redirect') {
				// The target is the server action's own `redirect()` — already built and
				// validated there, so there is no route literal here for `resolve()` to take.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(result.location, { invalidateAll: true });
				return;
			}
			await applyAction(result);
		};
	};
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
