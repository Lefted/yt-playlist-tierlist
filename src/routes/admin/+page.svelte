<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { formatDate } from '$lib/format.js';

	let { data, form } = $props();

	/**
	 * The invite link the last `createInvite` produced.
	 *
	 * Held in the action result only: the token is in the database as a hash, so this
	 * is the single moment it can be read. A reload of `/admin` loses it on purpose,
	 * which is why the copy field is loud about it.
	 */
	const newInvite = $derived(
		form?.action === 'createInvite' && 'token' in form
			? `${location.origin}${resolve('/invite/[token]', { token: String(form.token) })}`
			: null
	);

	/** Invites that could still be redeemed right now. */
	const openInvites = $derived(
		data.invites.filter((invite) => !invite.usedAt && invite.expiresAt.getTime() > Date.now())
	);

	/** Everything else: redeemed, or run out. */
	const closedInvites = $derived(data.invites.filter((invite) => !openInvites.includes(invite)));

	let copied = $state(false);

	/** @param {string} link */
	async function copy(link) {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard access can be refused; the link is on screen and selectable.
			copied = false;
		}
	}
</script>

<svelte:head>
	<title>Admin · YT Tierlist</title>
</svelte:head>

<main class="mx-auto w-full max-w-[1024px] flex-1 space-y-8 p-4 md:p-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
		<p class="text-muted-foreground text-sm">
			Sign-up is invite-only. Everyone below either got a link from here or was the first account on
			this installation.
		</p>
	</header>

	<section class="space-y-4" aria-labelledby="invite-heading">
		<h2 id="invite-heading" class="text-lg font-semibold">Invite someone</h2>

		<form
			method="POST"
			action="?/createInvite"
			use:enhance
			class="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end"
		>
			<div class="flex-1 space-y-2">
				<Label for="invite-email">Email (optional)</Label>
				<Input id="invite-email" name="email" type="email" placeholder="them@example.com" />
				<p class="text-muted-foreground text-xs">
					Given, the sign-up form is pinned to this address; left blank, whoever has the link
					chooses one.
				</p>
			</div>

			<div class="w-full space-y-2 sm:w-28">
				<Label for="invite-ttl">Valid days</Label>
				<Input
					id="invite-ttl"
					name="ttlDays"
					type="number"
					min="1"
					max="90"
					value={data.defaultTtlDays}
				/>
			</div>

			<Button type="submit">Create invite</Button>
		</form>

		{#if form?.action === 'createInvite' && form?.message}
			<p class="text-destructive text-sm" role="alert">{form.message}</p>
		{/if}

		{#if newInvite}
			<div class="space-y-2 rounded-xl border p-4">
				<p class="text-sm font-medium">Copy this link now — it is not shown again.</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<Input readonly value={newInvite} class="font-mono text-xs" />
					<Button variant="outline" onclick={() => copy(newInvite)}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>
			</div>
		{/if}
	</section>

	<section class="space-y-4" aria-labelledby="open-invites-heading">
		<h2 id="open-invites-heading" class="text-lg font-semibold">Open invites</h2>

		{#if openInvites.length === 0}
			<p class="text-muted-foreground text-sm">None.</p>
		{:else}
			<ul class="divide-y rounded-xl border">
				{#each openInvites as invite (invite.id)}
					<li class="flex flex-wrap items-center gap-3 p-3 text-sm">
						<span class="flex-1">
							{invite.email ?? 'anyone with the link'}
							<span class="text-muted-foreground">
								· expires {formatDate(invite.expiresAt.toISOString())}
								{#if invite.createdByName}· by {invite.createdByName}{/if}
							</span>
						</span>
						<form method="POST" action="?/revokeInvite" use:enhance>
							<input type="hidden" name="inviteId" value={invite.id} />
							<Button type="submit" variant="outline" size="sm">Revoke</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if form?.action === 'revokeInvite' && form?.message}
			<p class="text-destructive text-sm" role="alert">{form.message}</p>
		{/if}

		{#if closedInvites.length > 0}
			<details class="text-sm">
				<summary class="text-muted-foreground cursor-pointer">
					Used and expired invites ({closedInvites.length})
				</summary>
				<ul class="divide-y rounded-xl border">
					{#each closedInvites as invite (invite.id)}
						<li class="text-muted-foreground p-3">
							{invite.email ?? 'anyone with the link'} ·
							{#if invite.usedAt}
								used {formatDate(invite.usedAt.toISOString())}
								{#if invite.usedByName}by {invite.usedByName}{/if}
							{:else}
								expired {formatDate(invite.expiresAt.toISOString())}
							{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>

	<section class="space-y-4" aria-labelledby="users-heading">
		<h2 id="users-heading" class="text-lg font-semibold">Accounts</h2>

		<ul class="divide-y rounded-xl border">
			{#each data.users as user (user.id)}
				<li class="flex flex-wrap items-center gap-3 p-3 text-sm">
					<span class="flex-1">
						<span class="font-medium">{user.displayName}</span>
						<span class="text-muted-foreground">· {user.email}</span>
						<span class="text-muted-foreground"
							>· joined {formatDate(user.createdAt.toISOString())}</span
						>
					</span>

					{#if user.role === 'admin'}
						<Badge variant="secondary">Admin</Badge>
					{/if}
					{#if user.disabledAt}
						<Badge variant="destructive">Disabled</Badge>
					{/if}

					<form method="POST" action="?/setDisabled" use:enhance>
						<input type="hidden" name="userId" value={user.id} />
						<input type="hidden" name="disabled" value={user.disabledAt ? 'false' : 'true'} />
						<Button type="submit" variant="outline" size="sm">
							{user.disabledAt ? 'Enable' : 'Disable'}
						</Button>
					</form>
				</li>
			{/each}
		</ul>

		{#if form?.action === 'setDisabled' && form?.message}
			<p class="text-destructive text-sm" role="alert">{form.message}</p>
		{/if}

		<p class="text-muted-foreground text-xs">
			Disabling an account signs it out everywhere at once and refuses its next request. Its library
			is kept, so enabling it again restores everything. There is no password reset by email — run <code
				>npm run user:set-password &lt;email&gt;</code
			> on the server.
		</p>
	</section>
</main>
